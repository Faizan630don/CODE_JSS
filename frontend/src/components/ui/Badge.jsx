import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'

export function Badge({ variant, text }) {
  const isOk = variant === 'confirmed'
  const [displayText, setDisplayText] = useState(text)

  useEffect(() => {
    if (isOk) {
      let interval
      let count = 0
      const glitchChars = '!<>-_\\/[]{}—=+*^?#'
      
      interval = setInterval(() => {
        count++
        if (count > 5) {
          clearInterval(interval)
          setDisplayText('ACCESS GRANTED')
        } else {
          const arr = 'ACCESS GRANTED'.split('')
          for (let i = 0; i < 4; i++) {
            arr[Math.floor(Math.random() * arr.length)] = glitchChars[Math.floor(Math.random() * glitchChars.length)]
          }
          setDisplayText(arr.join(''))
        }
      }, 30)
      
      return () => clearInterval(interval)
    }
  }, [isOk])

  return (
    <motion.div
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className={`pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2 px-4 py-1 font-orbitron text-xs tracking-[0.2em] ${
        isOk
          ? 'border border-[#00ff44] text-[#00ff44] shadow-[0_0_8px_#00ff44,0_0_20px_rgba(0,255,68,0.5)] bg-black/70 animate-[pulse_3s_ease-out]'
          : 'border border-danger text-danger shadow-glow-danger bg-black/70'
      }`}
    >
      {isOk ? displayText : text}
    </motion.div>
  )
}
