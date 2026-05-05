import { useCallback, useEffect, useRef, useState } from 'react'

export function useVoiceAnalysis(url = import.meta.env.VITE_WS_VOICE_URL || 'ws://localhost:8000/ws/voice') {
  const [isRecording, setIsRecording] = useState(false)
  const [audioData, setAudioData] = useState(new Uint8Array(32))
  const [confidence, setConfidence] = useState(0)           // 0-100 human trust score
  const [status, setStatus] = useState('idle')              // idle | enrolled | listening | analyzing | complete
  const [result, setResult] = useState(null)                // null | human | ai
  const [breakdown, setBreakdown] = useState(null)
  const [recordingMode, setRecordingMode] = useState(null)  // 'enroll' | 'test'
  const [recordingTime, setRecordingTime] = useState(0)

  const ws = useRef(null)
  const audioCtx = useRef(null)
  const analyser = useRef(null)
  const scriptProc = useRef(null)
  const mediaStream = useRef(null)
  const source = useRef(null)
  const animationRef = useRef(null)
  const stopTimer = useRef(null)
  // Use a ref so the timer callback always sees fresh state without stale closure
  const isRecordingRef = useRef(false)
  const statusRef = useRef('idle')
  const modeRef = useRef(null)

  const cleanupAudio = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current)
    if (stopTimer.current) clearTimeout(stopTimer.current)
    stopTimer.current = null
    if (mediaStream.current) {
      mediaStream.current.getTracks().forEach((t) => t.stop())
      mediaStream.current = null
    }
    if (scriptProc.current) {
      scriptProc.current.disconnect()
      scriptProc.current = null
    }
    if (source.current) {
      source.current.disconnect()
      source.current = null
    }
    if (audioCtx.current && audioCtx.current.state !== 'closed') {
      audioCtx.current.close()
      audioCtx.current = null
    }
    analyser.current = null
    isRecordingRef.current = false
  }, [])

  const connectServer = useCallback(() => {
    if (!ws.current || ws.current.readyState === WebSocket.CLOSED) {
      ws.current = new WebSocket(url)
      ws.current.binaryType = 'arraybuffer'
      ws.current.onmessage = (event) => {
        try {
          const m = JSON.parse(event.data)
          if (m.type === 'enrolled') {
            statusRef.current = 'enrolled'
            setStatus('enrolled')
            setIsRecording(false)
            cleanupAudio()
          } else if (m.type === 'result') {
            statusRef.current = 'complete'
            setStatus('complete')
            setResult(m.result)
            // Backend sends confidence as (100 - trust*100) → AI score.
            // Flip it: human score = 100 - AI-score so gauge shows human authenticity.
            setConfidence(m.result === 'human' ? (100 - m.confidence) : m.confidence)
            setBreakdown(m.breakdown)
            setIsRecording(false)
            cleanupAudio()
          } else if (m.type === 'error') {
            console.error('Voice WS error:', m.message)
            setStatus('idle')
            setIsRecording(false)
            cleanupAudio()
          }
        } catch { }
      }
      ws.current.onerror = (e) => console.error('Voice WebSocket error:', e)
    }
  }, [url, cleanupAudio])

  useEffect(() => {
    connectServer()
    return () => {
      if (ws.current) ws.current.close()
    }
  }, [connectServer])

  // Stable stop function that reads from refs, not closure-captured state
  const stopRecording = useCallback(() => {
    if (!isRecordingRef.current) return
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ action: 'stop' }))
      if (modeRef.current !== 'enroll') {
        statusRef.current = 'analyzing'
        setStatus('analyzing')
      }
    }
    cleanupAudio()
    setIsRecording(false)
  }, [cleanupAudio])

  const startRecording = useCallback(async (mode) => {
    // Prevent double-start
    if (isRecordingRef.current) return

    connectServer()
    modeRef.current = mode
    setRecordingMode(mode)
    statusRef.current = 'listening'
    setStatus('listening')
    setRecordingTime(0)
    if (mode === 'test') {
      setResult(null)
      setConfidence(0)
      setBreakdown(null)
    }

    try {
      if (!window.AudioContext) window.AudioContext = window.webkitAudioContext
      audioCtx.current = new window.AudioContext({ sampleRate: 22050 })

      analyser.current = audioCtx.current.createAnalyser()
      analyser.current.fftSize = 64

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      })
      mediaStream.current = stream
      source.current = audioCtx.current.createMediaStreamSource(stream)

      // ScriptProcessor: captures raw Float32 PCM and sends as binary
      scriptProc.current = audioCtx.current.createScriptProcessor(4096, 1, 1)
      scriptProc.current.onaudioprocess = (e) => {
        const channelData = e.inputBuffer.getChannelData(0)
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          console.log('Sending chunk:', channelData.length, 'samples')
          // Must copy the buffer — Float32Array view is invalidated after the event
          const copy = new Float32Array(channelData)
          ws.current.send(copy.buffer)
        }
      }

      source.current.connect(analyser.current)
      analyser.current.connect(scriptProc.current)
      // Required: script processor must be connected to destination to fire
      scriptProc.current.connect(audioCtx.current.destination)

      // Send action AFTER audio pipeline is wired up
      const sendStart = () => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({ action: mode }))
        } else {
          // WebSocket still connecting — retry in 200ms
          setTimeout(sendStart, 200)
        }
      }
      sendStart()

      isRecordingRef.current = true
      setIsRecording(true)

      // Waveform animation loop
      const startTime = Date.now()
      const loop = () => {
        if (!analyser.current) return
        const dataArray = new Uint8Array(analyser.current.frequencyBinCount)
        analyser.current.getByteFrequencyData(dataArray)
        setAudioData(dataArray)
        const elapsed = (Date.now() - startTime) / 1000
        setRecordingTime(elapsed)
        animationRef.current = requestAnimationFrame(loop)
      }
      loop()

      // Auto-stop after 4 seconds — uses ref-based stopRecording to avoid stale closure
      stopTimer.current = setTimeout(() => {
        stopRecording()
      }, 4000)

    } catch (err) {
      console.error('Microphone access denied / AudioContext error:', err)
      statusRef.current = 'idle'
      setStatus('idle')
      isRecordingRef.current = false
      setIsRecording(false)
    }
  }, [connectServer, stopRecording])

  return {
    isRecording,
    audioData,
    confidence,
    status,
    result,
    breakdown,
    recordingMode,
    recordingTime,
    startRecording,
    stopRecording,
  }
}
