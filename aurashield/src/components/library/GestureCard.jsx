import { motion } from 'framer-motion'
import { Fingerprint } from 'lucide-react'

export function GestureCard({ name, createdAt, frameCount }) {
  const ts = new Date(createdAt * 1000).toLocaleString()

  return (
    <motion.div
      whileHover={{ y: -8, transition: { duration: 0.25 } }}
      className="group relative h-[120px] w-[160px] shrink-0 overflow-hidden rounded-sm glass-card border border-[rgba(0,212,255,0.2)] p-3 shadow-glow transition-shadow hover:shadow-[0_0_28px_rgba(0,212,255,0.35)]"
    >
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
        <div
          className="absolute inset-0 -translate-x-full skew-x-12 bg-gradient-to-r from-transparent via-primary/15 to-transparent group-hover:translate-x-full transition-transform duration-700"
        />
      </div>
      <div className="relative flex h-full flex-col justify-between">
        <div className="font-orbitron text-xs tracking-widest text-primary truncate">{name}</div>
        <div className="font-jetbrains text-[10px] text-text-muted leading-tight">{ts}</div>
        <div className="flex items-center justify-between">
          <span className="font-jetbrains text-[10px] text-text-data">{frameCount} frames</span>
          <motion.span
            animate={{ rotate: [0, 8, -8, 0] }}
            transition={{ duration: 4, repeat: Infinity }}
            className="text-primary/80"
          >
            <Fingerprint className="h-6 w-6" />
          </motion.span>
        </div>
      </div>
    </motion.div>
  )
}
