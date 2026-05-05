import { motion } from 'framer-motion'

export function MonitorButton({ active, onToggle, reducedMotion }) {
  return (
    <div className="relative">
      {active && !reducedMotion ? (
        <>
          <span className="pointer-events-none absolute inset-0 -m-3 rounded border border-danger/40 animate-ping opacity-40" />
          <span className="pointer-events-none absolute inset-0 -m-6 rounded border border-danger/25 animate-[ping_2.4s_cubic-bezier(0,0,0.2,1)_infinite] opacity-30" />
        </>
      ) : null}
      <motion.button
        type="button"
        whileHover={reducedMotion ? {} : { scale: 1.01 }}
        whileTap={reducedMotion ? {} : { scale: 0.99 }}
        onClick={onToggle}
        className={`btn-nexus w-full ${active ? 'active' : ''}`}
      >
        {active ? '[ NEXUS ONLINE — TERMINATE ]' : '[ ACTIVATE NEXUS ]'}
      </motion.button>
    </div>
  )
}
