import { motion, useReducedMotion } from 'framer-motion'
import gsap from 'gsap'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AuraShieldProvider, useAura } from './context/AuraShieldContext'
import { useGestureSocket } from './hooks/useGestureSocket'
import { ScreenFlash } from './components/effects/ScreenFlash'
import { ShockwaveRing } from './components/effects/ShockwaveRing'
import { useWebcam } from './hooks/useWebcam'
import { AuraScene } from './three/AuraScene'
import { GestureLibrary } from './components/library/GestureLibrary'
import { StatusBar } from './components/layout/StatusBar'
import { TopNav } from './components/layout/TopNav'
import { NexusPanel } from './components/nexus/NexusPanel'
import { VoiceSpectraPanel } from './components/voice/VoiceSpectraPanel'
import { ScanlineOverlay } from './components/ui/ScanlineOverlay'
import { SosOverlay } from './components/sos/SosOverlay'
import { VisionPanel } from './components/vision/VisionPanel'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000/gestures'

function routeLogSide(msg) {
  if (!msg?.message) return null
  const m = String(msg.message)
  if (
    m.includes('RECORDING') ||
    m.includes('SIGNATURE') ||
    m.includes('ERROR') ||
    m.includes('AWAITING') ||
    m.includes('Insufficient') ||
    m.includes('Face biometric')
  ) {
    return 'left'
  }
  return 'right'
}

function AppShell() {
  const reducedMotion = useReducedMotion()
  const {
    setWsStatus,
    setGestureLibrary,
    gestureLibrary,
    triggerShieldSuccess,
    triggerShieldDenied,
    triggerSosAlert,
    shieldEffect,
    flashOverlay,
    particleBurst,
    setSystemStatus,
    sosMode,
    burstActive,
  } = useAura()

  const [name, setName] = useState('')
  const [leftLog, setLeftLog] = useState([])
  const [rightLog, setRightLog] = useState([])
  const [monitorActive, setMonitorActive] = useState(false)
  const [recordingPulse, setRecordingPulse] = useState(false)
  const [frameMode, setFrameMode] = useState('none')
  const [navState, setNavState] = useState('idle')
  const [ringState, setRingState] = useState('violet')
  const [badge, setBadge] = useState(null)
  const [showUnreachable, setShowUnreachable] = useState(false)
  const [activeTab, setActiveTab] = useState('auth')
  const recordTimerRef = useRef(null)

  // ── SOS state ──
  const [sosStatus, setSosStatus] = useState('monitoring') // monitoring | triggered | cooldown
  const [sosData, setSosData] = useState(null)             // { timestamp, location, cooldownSec }
  const [cooldownLeft, setCooldownLeft] = useState(0)
  const [earValue, setEarValue] = useState(null)
  const locationRef = useRef(null)
  const cooldownTimerRef = useRef(null)

  const pushLeft = useCallback((line) => {
    setLeftLog((prev) => [line, ...prev].slice(0, 5))
  }, [])
  const pushRight = useCallback((line) => {
    setRightLog((prev) => [line, ...prev].slice(0, 5))
  }, [])

  const loadLibrary = useCallback(async () => {
    try {
      const r = await fetch(API)
      const j = await r.json()
      const g = j.gestures || []
      setGestureLibrary(g)
    } catch {
      /* ignore */
    }
  }, [setGestureLibrary])

  useEffect(() => {
    loadLibrary()
  }, [loadLibrary])

  // ── Geolocation watch ──
  useEffect(() => {
    if (!navigator.geolocation) return
    const wid = navigator.geolocation.watchPosition(
      (pos) => {
        locationRef.current = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        }
      },
      () => { locationRef.current = null },
      { enableHighAccuracy: true, maximumAge: 5000 }
    )
    return () => navigator.geolocation.clearWatch(wid)
  }, [])

  const onWsMessage = useCallback(
    (data) => {
      // ── SOS message routing ──
      if (data.type === 'sos_triggered') {
        setSosStatus('triggered')
        setSosData({ timestamp: data.timestamp, location: data.location, cooldownSec: data.cooldown_sec })
        setCooldownLeft(data.cooldown_sec)
        pushRight('▸ 🚨 SOS ALERT TRIGGERED — email dispatched')
        triggerSosAlert()
        return
      }
      if (data.type === 'sos_cooldown') {
        setSosStatus('cooldown')
        setCooldownLeft(data.seconds_left)
        return
      }
      if (data.type === 'sos_cooldown_end') {
        setSosStatus('monitoring')
        setCooldownLeft(0)
        pushRight('▸ SOS COOLDOWN ENDED — monitoring resumed')
        return
      }
      if (data.type === 'sos_ear') {
        setEarValue(data.ear)
        return
      }
      if (data.type === 'sos_ready') {
        pushRight('▸ 🛡 SOS MONITOR ARMED')
        return
      }

      if (data.type === 'status') {
        const side = routeLogSide(data)
        const line = data.message || ''
        if (side === 'left') pushLeft(`▸ ${line}`)
        else pushRight(`▸ ${line}`)

        if (line.includes('SIGNATURE') && line.includes('ENCODED')) {
          if (recordTimerRef.current) clearTimeout(recordTimerRef.current)
          setFrameMode('none')
          setRecordingPulse(false)
          loadLibrary()
        }
        if (line.startsWith('ERROR') || line.includes('Insufficient')) {
          if (recordTimerRef.current) clearTimeout(recordTimerRef.current)
          setFrameMode('none')
          setRecordingPulse(false)
        }
      }
      if (data.type === 'detected') {
        setNavState('confirmed')
        setRingState('green')
        setBadge('confirmed')
        triggerShieldSuccess()
        
        pushRight(`▸ BIOMETRIC SIGNATURE VERIFIED — CLEARANCE GRANTED`)
        window.setTimeout(() => {
          pushRight(`▸ NEXUS AUTHENTICATION COMPLETE ✓`)
        }, 200)

        window.setTimeout(() => {
          setBadge(null)
          setRingState('violet')
          setNavState(monitorActive ? 'monitoring' : 'idle')
        }, 2200)
      }
      if (data.type === 'denied') {
        pushRight(`▸ ${data.message || 'ACCESS DENIED'}`)
        setNavState('denied')
        setRingState('red')
        setBadge('denied')
        triggerShieldDenied()
        window.setTimeout(() => {
          setBadge(null)
          setRingState('violet')
          setNavState(monitorActive ? 'monitoring' : 'idle')
        }, 2200)
      }
    },
    [
      loadLibrary,
      monitorActive,
      pushLeft,
      pushRight,
      triggerShieldDenied,
      triggerShieldSuccess,
    ]
  )

  const {
    isConnected,
    metrics,
    reconnectFailures,
    sendFrame,
    startRecording,
    startMonitoring,
    stop,
    fpsIntervalMs,
  } = useGestureSocket({ onMessage: onWsMessage })

  const { videoRef, canvasRef, mediaStream, isActive, error, startCamera, captureFrame } = useWebcam()

  useEffect(() => {
    startCamera()
  }, [startCamera])

  useEffect(() => {
    setWsStatus(isConnected ? 'CONNECTED' : 'DISCONNECTED')
    setSystemStatus({
      gestureEngine: isConnected ? 'ONLINE' : 'OFFLINE',
      faceTracker: monitorActive ? 'ACTIVE' : 'STANDBY',
      websocket: isConnected ? 'CONNECTED' : 'DISCONNECTED',
      nexusAuth: monitorActive ? 'ARMED' : frameMode === 'record' ? 'RECORD' : 'IDLE',
    })
  }, [isConnected, monitorActive, frameMode, setSystemStatus, setWsStatus])

  useEffect(() => {
    if (reconnectFailures >= 3 && !isConnected) setShowUnreachable(true)
    if (isConnected) setShowUnreachable(false)
  }, [reconnectFailures, isConnected])

  useEffect(() => {
    if (!isActive || !isConnected) return
    if (frameMode === 'none') return
    let raf = 0
    let last = 0
    const step = (t) => {
      raf = requestAnimationFrame(step)
      if (t - last < fpsIntervalMs - 0.5) return
      last = t
      const j = captureFrame()
      if (j) sendFrame(j, locationRef.current)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [isActive, isConnected, frameMode, captureFrame, sendFrame, fpsIntervalMs])

  const onRecordStart = useCallback(() => {
    const n = name.trim()
    if (!n) {
      pushLeft('▸ ERROR: Enter signature ID first')
      return false
    }
    if (!isConnected) return false
    startRecording(n)
    setFrameMode('record')
    setRecordingPulse(true)
    setNavState('recording')
    pushLeft(`▸ AWAITING HAND SIGNATURE '${n}'...`)
    if (recordTimerRef.current) clearTimeout(recordTimerRef.current)
    recordTimerRef.current = window.setTimeout(() => {
      setFrameMode('none')
      setRecordingPulse(false)
      setNavState('idle')
      stop()
    }, 5200)
    return true
  }, [isConnected, name, pushLeft, startRecording, stop])

  const onToggleMonitor = useCallback(() => {
    if (monitorActive) {
      setMonitorActive(false)
      setFrameMode('none')
      stop()
      setNavState('idle')
      pushRight('▸ NEXUS MONITOR OFFLINE')
      return
    }
    startMonitoring()
    setMonitorActive(true)
    setFrameMode('monitor')
    setNavState('monitoring')
    pushRight('▸ NEXUS MONITOR ARMED')
  }, [monitorActive, pushRight, startMonitoring, stop])

  const authState = useMemo(() => {
    if (navState === 'recording') return 'recording'
    if (navState === 'monitoring') return 'monitoring'
    if (navState === 'confirmed') return 'confirmed'
    if (navState === 'denied') return 'denied'
    return 'idle'
  }, [navState])

  const subtitle = 'BIOMETRIC DEFENSE GRID v2.0'
  const [typed, setTyped] = useState('')
  useEffect(() => {
    if (reducedMotion) {
      setTyped(subtitle)
      return
    }
    const obj = { len: 0 }
    const tw = gsap.to(obj, {
      len: subtitle.length,
      duration: Math.max(0.6, subtitle.length * 0.035),
      ease: 'none',
      onUpdate: () => setTyped(subtitle.slice(0, Math.floor(obj.len))),
    })
    return () => tw.kill()
  }, [reducedMotion, subtitle])

  const title = 'NEXUS AUTHENTICATION'

  // Manual SOS trigger
  const onManualSos = useCallback(() => {
    const timestamp = new Date().toLocaleString()
    const location = locationRef.current
      ? `Lat: ${locationRef.current.lat}, Lng: ${locationRef.current.lng} (±${locationRef.current.accuracy}m)`
      : 'Unknown'
    pushRight('▸ 🚨 MANUAL SOS TRIGGERED')
    setSosStatus('triggered')
    setSosData({ timestamp, location, cooldownSec: 45 })
    setCooldownLeft(45)
  }, [pushRight])

  return (
    <>
      <ScanlineOverlay intense={!isConnected} />
      <motion.div
        initial={reducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reducedMotion ? 0 : 1.5 }}
        className="fixed inset-0 z-0"
      >
        <AuraScene
          shieldEffect={shieldEffect}
          particleBurst={particleBurst}
          recordingBright={recordingPulse}
          burstActive={burstActive}
        />
      </motion.div>

      <ScreenFlash active={burstActive} />
      <ShockwaveRing active={burstActive} />

      {/* Green burst — identity confirmed */}
      <motion.div
        className="pointer-events-none fixed left-1/2 top-1/2 z-[15] h-[150vw] w-[150vw] -translate-x-1/2 -translate-y-1/2 origin-center rounded-[100%] mix-blend-screen"
        style={{ background: 'radial-gradient(circle at center, rgba(0,255,65,0.5), transparent 40%)' }}
        initial={{ scale: 0, opacity: 0 }}
        animate={flashOverlay === 'green' ? { scale: 1, opacity: 1 } : { scale: 1, opacity: 0 }}
        transition={flashOverlay === 'green' ? { scale: { duration: 0.35, ease: 'easeOut' }, opacity: { duration: 0.1 } } : { opacity: { duration: 1.8, ease: 'easeOut' } }}
      />
      {/* SOS red radial burst */}
      <motion.div
        className="pointer-events-none fixed left-1/2 top-1/2 z-[16] h-[150vw] w-[150vw] -translate-x-1/2 -translate-y-1/2 origin-center rounded-[100%] mix-blend-screen"
        style={{ background: 'radial-gradient(circle at center, rgba(255,42,42,0.7), transparent 40%)' }}
        initial={{ scale: 0, opacity: 0 }}
        animate={flashOverlay === 'sos' ? { scale: 1, opacity: 1 } : { scale: 1, opacity: 0 }}
        transition={flashOverlay === 'sos' ? { scale: { duration: 0.35, ease: 'easeOut' }, opacity: { duration: 0.08 } } : { opacity: { duration: 2.0, ease: 'easeOut' } }}
      />
      {/* Danger red flash */}
      <motion.div
        className="pointer-events-none fixed inset-0 z-[15] mix-blend-color"
        style={{ background: '#FF2A2A' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: flashOverlay === 'red' ? 0.6 : 0 }}
        transition={{ duration: flashOverlay === 'red' ? 0.05 : 0.8, ease: 'easeOut' }}
      />
      {/* Sustained SOS red tint */}
      <motion.div
        className="pointer-events-none fixed inset-0 z-[14]"
        style={{ background: '#FF2A2A' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: sosStatus === 'triggered' ? 0.1 : 0 }}
        transition={{ duration: sosStatus === 'triggered' ? 0.3 : 1.5, ease: 'easeOut' }}
      />
      {sosMode ? <div className="pointer-events-none fixed inset-0 z-[25] bg-danger/25" /> : null}

      <div 
        className="relative z-20 min-h-screen font-inter text-text-primary"
      >
        <TopNav
          authState={authState}
          reducedMotion={!!reducedMotion}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          sosStatus={sosStatus}
        />

        {/* SOS Overlay — floats above everything */}
        <SosOverlay
          sosStatus={sosStatus}
          sosData={sosData}
          cooldownLeft={cooldownLeft}
          earValue={earValue}
          onManualSos={onManualSos}
        />

        <section className="relative z-10 mx-auto flex min-h-[28vh] max-w-5xl flex-col items-center justify-center px-4 pt-24 text-center">
          <h1 className="text-3xl sm:text-5xl text-title">
            {title.split('').map((ch, i) => (
              <motion.span
                key={`${ch}-${i}`}
                initial={reducedMotion ? false : { y: -18, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: reducedMotion ? 0 : 0.6 + i * 0.05, duration: reducedMotion ? 0 : 0.35 }}
                className="inline-block"
              >
                {ch === ' ' ? '\u00A0' : ch}
              </motion.span>
            ))}
          </h1>
          <p className="mt-4 font-jetbrains text-xs sm:text-sm text-primary/70 min-h-[1.25rem]">{typed}</p>
          <motion.div
            initial={reducedMotion ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: reducedMotion ? 0 : 1.0, duration: reducedMotion ? 0 : 0.6 }}
            className="mt-6 h-px w-full max-w-xl origin-center"
            style={{ background: 'linear-gradient(90deg, transparent, #00FF41, transparent)', boxShadow: '0 0 10px rgba(0,255,65,0.5)' }}
          />
        </section>

        {activeTab === 'auth' ? (
          <>
            <NexusPanel
              reducedMotion={!!reducedMotion}
              name={name}
              setName={setName}
              leftLog={leftLog}
              onRecordStart={onRecordStart}
              recordDisabled={!isConnected || monitorActive}
              recordingPulse={recordingPulse}
              monitorActive={monitorActive}
              onToggleMonitor={onToggleMonitor}
              rightLog={rightLog}
              metrics={metrics}
              ringState={ringState}
              badge={badge}
              cameraError={!!error}
              mediaStream={mediaStream}
              earValue={earValue}
              sosStatus={sosStatus}
            />
            <GestureLibrary gestures={gestureLibrary} reducedMotion={!!reducedMotion} />
          </>
        ) : activeTab === 'voice' ? (
          <VoiceSpectraPanel reducedMotion={!!reducedMotion} />
        ) : (
          <VisionPanel reducedMotion={!!reducedMotion} />
        )}

        <StatusBar
          gestureEngine={isConnected ? 'ONLINE' : 'OFFLINE'}
          faceTracker={monitorActive ? 'ACTIVE' : 'STANDBY'}
          websocket={isConnected ? 'CONNECTED' : 'DISCONNECTED'}
          nexusAuth={monitorActive ? 'ARMED' : recordingPulse ? 'RECORD' : 'IDLE'}
          reducedMotion={!!reducedMotion}
          reconnecting={!isConnected && reconnectFailures > 0}
        />
      </div>

      <video
        ref={videoRef}
        className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0"
        width={1280}
        height={720}
        playsInline
        muted
        autoPlay
      />
      <canvas ref={canvasRef} className="hidden" />

      {showUnreachable ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 px-4 backdrop-blur-md">
          <div className="max-w-md glass-card border border-warning/40 p-6 text-center cyber-glow">
            <p className="font-orbitron text-sm tracking-[0.2em] text-warning">NEXUS UNREACHABLE</p>
            <p className="mt-3 font-jetbrains text-xs text-text-muted leading-relaxed">
              Start the FastAPI bridge from the project root:
              <br />
              <code className="text-text-data">python server.py</code>
            </p>
            <button
              type="button"
              onClick={() => setShowUnreachable(false)}
              className="mt-5 border border-primary px-4 py-2 font-orbitron text-xs text-primary hover:bg-primary/10"
            >
              DISMISS
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default function App() {
  return (
    <AuraShieldProvider>
      <AppShell />
    </AuraShieldProvider>
  )
}
