import { useEffect, useRef } from 'react'

/** Second consumer of the same MediaStream (mirrors selfie UX). */
export function StreamVideo({ stream, className = '', mirror = true }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !stream) return
    el.srcObject = stream
    el.play().catch(() => {})
    return () => {
      el.srcObject = null
    }
  }, [stream])
  if (!stream) return null
  return (
    <video
      ref={ref}
      className={`${className} ${mirror ? '[transform:scaleX(-1)]' : ''}`}
      playsInline
      muted
      autoPlay
    />
  )
}
