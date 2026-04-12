import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef } from 'react'

function colorForLine(line) {
  const l = line.toLowerCase()
  if (l.includes('error') || l.includes('denied') || l.includes('breach') || l.includes('sos') || l.includes('denied') || l.includes('fail'))
    return '#FF2A2A'
  if (l.includes('verified') || l.includes('signature') || l.includes('encoded') || l.includes('confirmed') || l.includes('identity'))
    return '#00FF41'
  if (l.includes('recording') || l.includes('awaiting') || l.includes('scanning') || l.includes('hold'))
    return '#FFAA00'
  return '#00CC33'
}

function timestamp() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`
}

export function TerminalLog({ lines, max = 5 }) {
  const show = lines.slice(0, max)
  return (
    <div
      className="overflow-hidden p-2 font-mono text-[11px] leading-relaxed"
      style={{
        height: 150,
        background: '#020202',
        border: '1px solid rgba(0,255,65,0.2)',
      }}
    >
      <AnimatePresence initial={false}>
        {show.map((line, i) => (
          <motion.div
            key={`${line}-${i}`}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="truncate py-0.5"
            style={{
              color: colorForLine(line),
              borderBottom: '1px solid rgba(0,255,65,0.05)',
            }}
          >
            <span className="text-[#4A4A4A]">[{timestamp()}] </span>
            <span className="text-[#00FF41] mr-1">{'>'}</span>
            {line}
          </motion.div>
        ))}
        {show.length === 0 && (
          <div className="text-[#4A4A4A] mt-2">
            <span className="text-[#00FF41]">{'>'}</span> awaiting input<span className="animate-pulse">_</span>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
