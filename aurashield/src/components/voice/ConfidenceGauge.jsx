import { motion } from 'framer-motion'

export function ConfidenceGauge({ confidence, result, status }) {
  const pct = Math.round(Math.min(100, Math.max(0, confidence)))
  const filled = Math.round(pct / 5)
  const empty  = 20 - filled

  const color =
    status === 'complete'
      ? result === 'human' ? '#00FF41' : '#FF2A2A'
      : status === 'analyzing' || status === 'listening' ? '#FFAA00'
      : '#4A4A4A'

  const label =
    status === 'complete'
      ? result === 'human' ? 'AUTHENTIC HUMAN' : 'AI CLONE'
      : status === 'analyzing' ? 'ANALYZING...'
      : status === 'listening' ? 'RECORDING'
      : 'AWAITING'

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      {/* Big percentage */}
      <motion.div
        className="font-data text-5xl tabular-nums"
        style={{ color, textShadow: `0 0 20px ${color}` }}
        key={pct}
        animate={{ opacity: 1 }}
        initial={{ opacity: 0.5 }}
        transition={{ duration: 0.5 }}
      >
        {pct}%
      </motion.div>

      {/* Block bar */}
      <div className="font-data text-sm tracking-wider" style={{ color }}>
        {'█'.repeat(filled)}{'░'.repeat(empty)}
      </div>

      {/* Label */}
      <div className="font-mono text-[10px] tracking-[0.25em]" style={{ color }}>
        {label}
      </div>
    </div>
  )
}
