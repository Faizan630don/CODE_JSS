import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const AuraShieldContext = createContext(null)

export function AuraShieldProvider({ children }) {
  const [wsStatus, setWsStatus] = useState('DISCONNECTED')
  const [authState, setAuthState] = useState('idle')
  const [systemStatus, setSystemStatus] = useState({
    gestureEngine: 'OFFLINE',
    faceTracker: 'STANDBY',
    nexusAuth: 'IDLE',
  })
  const [eventLog, setEventLog] = useState([])
  const [gestureLibrary, setGestureLibrary] = useState([])
  const [shieldEffect, setShieldEffect] = useState('idle')
  const [cameraShake, setCameraShake] = useState(0)
  const [particleBurst, setParticleBurst] = useState(false)
  const [flashOverlay, setFlashOverlay] = useState(null)
  const [sosMode, setSosMode] = useState(false)
  const [reconnectingUi, setReconnectingUi] = useState(false)
  const [burstActive, setBurstActive] = useState(false)

  const [blinkStatus, setBlinkStatus] = useState('idle')
  const [voiceStatus, setVoiceStatus] = useState('idle')
  const [videoStatus, setVideoStatus] = useState('idle')
  const [dashboardData, setDashboardData] = useState(null)

  const pushLog = useCallback((line) => {
    setEventLog((prev) => {
      const next = [String(line), ...prev]
      return next.slice(0, 50)
    })
  }, [])

  const triggerShieldSuccess = useCallback(() => {
    setShieldEffect('success')
    setParticleBurst(true)
    setFlashOverlay('green')
    setBurstActive(true)
    
    // Web Audio API Power Chime
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (AudioContext) {
        const actx = new AudioContext()
        const osc = actx.createOscillator()
        const gain = actx.createGain()
        osc.connect(gain)
        gain.connect(actx.destination)
        
        osc.type = 'sine'
        const now = actx.currentTime
        osc.frequency.setValueAtTime(523, now)
        osc.frequency.exponentialRampToValueAtTime(1047, now + 0.3)
        
        gain.gain.setValueAtTime(0, now)
        gain.gain.linearRampToValueAtTime(0.3, now + 0.1)
        gain.gain.linearRampToValueAtTime(0, now + 0.6)
        
        osc.start(now)
        osc.stop(now + 0.6)
      }
    } catch(e) {
      // Silent fail
    }

    window.setTimeout(() => setShieldEffect('idle'), 2400)
    window.setTimeout(() => setParticleBurst(false), 800)
    window.setTimeout(() => {
       setFlashOverlay(null)
       setBurstActive(false)
    }, 1800)
  }, [])

  const triggerShieldDenied = useCallback(() => {
    setShieldEffect('denied')
    setCameraShake(0.8)
    setFlashOverlay('red')
    window.setTimeout(() => setShieldEffect('idle'), 1400)
    window.setTimeout(() => setFlashOverlay(null), 400)
  }, [])

  const triggerSosAlert = useCallback(() => {
    setShieldEffect('denied')
    setFlashOverlay('sos')
    setBurstActive(true)
    setCameraShake(1.2)

    // Alarm sound — descending two-tone beep
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (AudioContext) {
        const actx = new AudioContext()
        const playBeep = (startTime, freq) => {
          const osc = actx.createOscillator()
          const gain = actx.createGain()
          osc.connect(gain)
          gain.connect(actx.destination)
          osc.type = 'sawtooth'
          osc.frequency.setValueAtTime(freq, startTime)
          gain.gain.setValueAtTime(0, startTime)
          gain.gain.linearRampToValueAtTime(0.4, startTime + 0.05)
          gain.gain.linearRampToValueAtTime(0, startTime + 0.3)
          osc.start(startTime)
          osc.stop(startTime + 0.3)
        }
        const now = actx.currentTime
        playBeep(now, 880)
        playBeep(now + 0.35, 660)
        playBeep(now + 0.7, 880)
      }
    } catch(e) { /* silent fail */ }

    window.setTimeout(() => setShieldEffect('idle'), 2800)
    window.setTimeout(() => {
      setFlashOverlay(null)
      setBurstActive(false)
    }, 2200)
  }, [])

  const value = useMemo(
    () => ({
      wsStatus,
      setWsStatus,
      authState,
      setAuthState,
      systemStatus,
      setSystemStatus,
      eventLog,
      setEventLog,
      pushLog,
      gestureLibrary,
      setGestureLibrary,
      shieldEffect,
      setShieldEffect,
      cameraShake,
      setCameraShake,
      particleBurst,
      setParticleBurst,
      flashOverlay,
      setFlashOverlay,
      sosMode,
      setSosMode,
      reconnectingUi,
      setReconnectingUi,
      blinkStatus,
      setBlinkStatus,
      voiceStatus,
      setVoiceStatus,
      videoStatus,
      setVideoStatus,
      dashboardData,
      setDashboardData,
      burstActive,
      setBurstActive,
      triggerShieldSuccess,
      triggerShieldDenied,
      triggerSosAlert,
    }),
    [
      wsStatus,
      authState,
      systemStatus,
      eventLog,
      pushLog,
      gestureLibrary,
      shieldEffect,
      cameraShake,
      particleBurst,
      flashOverlay,
      sosMode,
      reconnectingUi,
      blinkStatus,
      voiceStatus,
      videoStatus,
      dashboardData,
      burstActive,
      triggerShieldSuccess,
      triggerShieldDenied,
      triggerSosAlert,
    ]
  )

  return <AuraShieldContext.Provider value={value}>{children}</AuraShieldContext.Provider>
}

export function useAura() {
  const ctx = useContext(AuraShieldContext)
  if (!ctx) throw new Error('useAura must be used within AuraShieldProvider')
  return ctx
}
