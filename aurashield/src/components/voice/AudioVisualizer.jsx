import { useEffect, useRef } from 'react'

export function AudioVisualizer({ audioData }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !audioData) return
    const ctx = canvas.getContext('2d')

    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)

    const barCount = audioData.length
    const barWidth = (w / barCount) * 0.7
    const gap = (w / barCount) * 0.3

    for (let i = 0; i < barCount; i++) {
      const value = audioData[i]
      const percent = value / 255
      const barHeight = h * percent

      const x = i * (barWidth + gap)
      const y = h - barHeight

      // Matrix green bar
      const intensity = 0.4 + percent * 0.6
      ctx.fillStyle = `rgba(0, ${Math.floor(200 + 55 * percent)}, ${Math.floor(60 * percent)}, ${intensity})`
      ctx.shadowColor = '#00FF41'
      ctx.shadowBlur = barHeight > 5 ? 6 : 0
      ctx.fillRect(x, y, barWidth, barHeight)

      // Bright cap
      if (barHeight > 3) {
        ctx.fillStyle = '#AAFFAA'
        ctx.shadowBlur = 0
        ctx.fillRect(x, y, barWidth, 2)
      }
    }
    ctx.shadowBlur = 0
  }, [audioData])

  return (
    <canvas
      ref={canvasRef}
      width={220}
      height={110}
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[2]"
    />
  )
}
