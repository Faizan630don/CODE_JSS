import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'

const DURATION = 4500

export function RecordButton({ onStart, disabled, reducedMotion }) {
  const [phase, setPhase] = useState('idle')
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (phase !== 'recording') return
    const start = performance.now()
    let frame
    const tick = (now) => {
      const p = Math.min(1, (now - start) / DURATION)
      setProgress(p)
      if (p < 1) frame = requestAnimationFrame(tick)
      else {
        setPhase('success')
        window.setTimeout(() => {
          setPhase('idle')
          setProgress(0)
        }, 2000)
      }
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [phase])

  const handleClick = () => {
    if (disabled || phase === 'recording') return
    const ok = onStart?.()
    if (ok === false) return
    setPhase('recording')
    setProgress(0)
  }

  const r = 36
  const c = 2 * Math.PI * r
  const offset = c * (1 - progress)

  return (
    <div className="relative">
      <motion.button
        type="button"
        whileHover={reducedMotion ? {} : { scale: 1.01 }}
        whileTap={reducedMotion ? {} : { scale: 0.99 }}
        onClick={handleClick}
        disabled={disabled || phase === 'recording'}
        className={`btn-nexus w-full ${phase === 'recording' ? 'active' : ''}`}
      >
        {phase === 'idle' && '[ INITIATE RECORDING ]'}
        {phase === 'recording' && (
          <span className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FFAA00] opacity-70" />
              <span className="relative h-2.5 w-2.5 rounded-full bg-[#FFAA00]" />
            </span>
            ● RECORDING...
          </span>
        )}
        {phase === 'success' && <span style={{ color: '#00FF41' }}>✓ SIGNATURE ENCODED</span>}
      </motion.button>
      {phase === 'recording' && (
        <svg className="pointer-events-none absolute left-1/2 top-1/2 h-[92px] w-[92px] -translate-x-1/2 -translate-y-1/2 opacity-90">
          <circle cx="46" cy="46" r={r} stroke="rgba(255,170,0,0.2)" strokeWidth="3" fill="none" />
          <circle
            cx="46" cy="46" r={r}
            stroke="#FFAA00" strokeWidth="3" fill="none"
            strokeDasharray={c} strokeDashoffset={offset}
            transform="rotate(-90 46 46)" strokeLinecap="round"
            style={{ filter: 'drop-shadow(0 0 4px rgba(255,170,0,0.6))' }}
          />
        </svg>
      )}
    </div>
  )
}
