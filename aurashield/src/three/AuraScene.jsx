import { useEffect, useRef } from 'react'

// Katakana + ASCII characters for Matrix rain
const CHARS =
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&'

const FONT_SIZE = 14
const OPACITY = 0.15
const COLOR = '#00FF41'
const COLUMNS_DENSITY = 1  // 1 column per FONT_SIZE px

export function AuraScene({ shieldEffect, particleBurst, recordingBright, burstActive }) {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const dropsRef = useRef([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    let cols = 0

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      cols = Math.floor(canvas.width / FONT_SIZE) * COLUMNS_DENSITY
      // Initialise or extend drops array
      dropsRef.current = Array.from({ length: cols }, (_, i) =>
        dropsRef.current[i] ?? Math.random() * -canvas.height / FONT_SIZE
      )
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = () => {
      // Fade trail
      ctx.fillStyle = `rgba(5, 5, 5, 0.07)`
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      ctx.fillStyle = COLOR
      ctx.font = `${FONT_SIZE}px 'Share Tech Mono', monospace`
      ctx.globalAlpha = OPACITY * (burstActive ? 2.0 : recordingBright ? 1.5 : 1.0)

      const drops = dropsRef.current
      for (let i = 0; i < drops.length; i++) {
        const char = CHARS[Math.floor(Math.random() * CHARS.length)]
        const x = i * FONT_SIZE
        const y = drops[i] * FONT_SIZE

        // Top character brighter
        ctx.globalAlpha = Math.min(1, OPACITY * 4)
        ctx.fillStyle = '#AAFFAA'
        ctx.fillText(char, x, y)

        // Rest dimmer
        ctx.globalAlpha = OPACITY
        ctx.fillStyle = COLOR

        drops[i]++
        if (y > canvas.height && Math.random() > 0.975) {
          drops[i] = 0
        }
      }

      ctx.globalAlpha = 1
      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [burstActive, recordingBright])

  return (
    <div className="aura-canvas-wrap fixed inset-0 z-0">
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          background: '#050505',
        }}
      />
    </div>
  )
}
