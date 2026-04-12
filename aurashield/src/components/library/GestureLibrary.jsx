import { motion } from 'framer-motion'
import { GestureCard } from './GestureCard'

export function GestureLibrary({ gestures, reducedMotion }) {
  return (
    <motion.section
      initial={reducedMotion ? false : { y: 28, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: reducedMotion ? 0 : 1.6, duration: reducedMotion ? 0 : 0.4 }}
      className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-6"
    >
      <h3 className="mb-3 font-orbitron text-xs tracking-[0.35em] text-text-muted">GESTURE LIBRARY</h3>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-primary/30">
        {gestures.length === 0 ? (
          <p className="font-jetbrains text-xs text-text-muted py-6">No signatures in vault.</p>
        ) : (
          gestures.map((g) => (
            <GestureCard key={g.name} name={g.name} createdAt={g.created_at} frameCount={g.frame_count} />
          ))
        )}
      </div>
    </motion.section>
  )
}
