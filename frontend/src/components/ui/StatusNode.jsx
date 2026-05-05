import { motion } from 'framer-motion'

export function StatusNode({ label, status, ok = true, warn = false }) {
  const dot =
    warn ? 'bg-warning shadow-[0_0_8px_rgba(255,170,0,0.7)]' : ok ? 'bg-accent shadow-glow-accent' : 'bg-danger shadow-glow-danger'

  return (
    <motion.div
      className="flex items-center gap-2 min-w-0"
      initial={false}
      animate={{ opacity: 1 }}
      key={`${label}-${status}`}
      transition={{ duration: 0.25 }}
    >
      <span className={`h-2 w-2 rounded-full ${dot} animate-pulse`} />
      <span className="font-orbitron text-[10px] sm:text-xs text-text-muted uppercase tracking-widest truncate">
        {label}
      </span>
      <span className="font-jetbrains text-[10px] sm:text-xs text-text-data truncate">{status}</span>
    </motion.div>
  )
}
