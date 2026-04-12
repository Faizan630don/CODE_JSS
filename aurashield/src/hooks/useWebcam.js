import { useCallback, useEffect, useRef, useState } from 'react'

export function useWebcam() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const [mediaStream, setMediaStream] = useState(null)
  const [isActive, setIsActive] = useState(false)
  const [error, setError] = useState(null)

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setMediaStream(null)
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setIsActive(false)
  }, [])

  const startCamera = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      })
      streamRef.current = stream
      setMediaStream(stream)
      const v = videoRef.current
      if (v) {
        v.srcObject = stream
        await v.play().catch(() => {})
      }
      setIsActive(true)
    } catch (e) {
      setError(e?.message || 'Camera blocked')
      setIsActive(false)
    }
  }, [])

  useEffect(() => () => stopCamera(), [stopCamera])

  /** @returns {string|null} data URL jpeg */
  const captureFrame = useCallback((quality = 0.75) => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth) return null
    const MAX_W = 640
    let w = video.videoWidth
    let h = video.videoHeight
    if (w > MAX_W) {
      h = Math.floor(h * (MAX_W / w))
      w = MAX_W
    }
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, w, h)
    try {
      return canvas.toDataURL('image/jpeg', quality)
    } catch {
      return null
    }
  }, [])

  return {
    videoRef,
    canvasRef,
    mediaStream,
    isActive,
    error,
    startCamera,
    stopCamera,
    captureFrame,
  }
}
