import { useCallback, useEffect, useRef, useState } from 'react'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/gesture'
/** ~30fps camera digest, handled via manual 1/3 downsampling below */
export const GESTURE_FPS_MS = Math.round(1000 / 30)

export function useGestureSocket({ onMessage } = {}) {
  const [isConnected, setIsConnected] = useState(false)
  const [status, setStatus] = useState('DISCONNECTED')
  const [lastEvent, setLastEvent] = useState(null)
  const [metrics, setMetrics] = useState({
    motion_var: 0,
    match_dist: 999,
    face_ok: false,
    gesture_name: '',
    hold_progress: 0,
  })
  const [reconnectFailures, setReconnectFailures] = useState(0)

  const wsRef = useRef(null)
  const backoffRef = useRef(1000)
  const reconnectTimerRef = useRef(null)
  const shouldReconnectRef = useRef(true)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  // Strict synchronization and frame downsampling
  const isProcessingRef = useRef(false)
  const frameCountRef = useRef(0)

  const sendRaw = useCallback((obj) => {
    const w = wsRef.current
    if (!w || w.readyState !== WebSocket.OPEN) return false
    w.send(JSON.stringify(obj))
    return true
  }, [])

  useEffect(() => {
    shouldReconnectRef.current = true

    const connect = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return
      try {
        const ws = new WebSocket(WS_URL)
        wsRef.current = ws

        ws.onopen = () => {
          setIsConnected(true)
          setStatus('CONNECTED')
          backoffRef.current = 1000
          setReconnectFailures(0)
        }

        ws.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data)
            setLastEvent(data)
            if (data.type === 'metrics') {
              // Unlock transmission line for the next frame
              isProcessingRef.current = false
              
              requestAnimationFrame(() => {
                setMetrics({
                  motion_var: data.motion_var ?? 0,
                  match_dist: data.match_dist ?? 999,
                  face_ok: !!data.face_ok,
                  gesture_name: data.gesture_name || '',
                  hold_progress: data.hold_progress ?? 0,
                })
              })
            } else if (data.type === 'status') {
              requestAnimationFrame(() => {
                setStatus(data.message)
              })
            }
            
            // Allow parent component to safely run its side effects
            requestAnimationFrame(() => {
              onMessageRef.current?.(data)
            })
          } catch {
            /* ignore */
          }
        }

        ws.onerror = () => {
          setStatus('ERROR')
        }

        ws.onclose = () => {
          wsRef.current = null
          setIsConnected(false)
          setStatus('DISCONNECTED')
          if (!shouldReconnectRef.current) return

          const delay = backoffRef.current
          backoffRef.current = Math.min(backoffRef.current * 2, 10000)
          setReconnectFailures((n) => n + 1)

          reconnectTimerRef.current = window.setTimeout(connect, delay)
        }
      } catch {
        setStatus('ERROR')
      }
    }

    connect()

    return () => {
      shouldReconnectRef.current = false
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [])

  const sendFrame = useCallback(
    (dataUrl, location = null) => {
      frameCountRef.current += 1
      if (frameCountRef.current % 3 !== 0) return false // Skip 2/3 frames locally
      
      if (isProcessingRef.current) return false
      
      const payload = { frame: dataUrl }
      if (location) payload.location = location
      
      // Lock transmission line until backend replies
      isProcessingRef.current = true
      return sendRaw(payload)
    },
    [sendRaw]
  )

  const startRecording = useCallback(
    (name) => {
      return sendRaw({ action: 'record', name })
    },
    [sendRaw]
  )

  const startMonitoring = useCallback(() => {
    isProcessingRef.current = false
    return sendRaw({ action: 'monitor' })
  }, [sendRaw])

  const stop = useCallback(() => {
    isProcessingRef.current = false
    return sendRaw({ action: 'stop' })
  }, [sendRaw])

  return {
    isConnected,
    status,
    lastEvent,
    metrics,
    reconnectFailures,
    sendFrame,
    startRecording,
    startMonitoring,
    stop,
    sendRaw,
    fpsIntervalMs: GESTURE_FPS_MS,
  }
}
