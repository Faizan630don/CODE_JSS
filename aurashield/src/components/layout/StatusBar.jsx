import { motion } from 'framer-motion'
import { StatusNode } from '../ui/StatusNode'

function randomHex() {
  return Array.from({ length: 8 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('')
}

export function StatusBar({ gestureEngine, faceTracker, websocket, nexusAuth, reducedMotion, reconnecting }) {
  const wsOk = websocket === 'CONNECTED'
  const warn = !wsOk || reconnecting

  return (
    <motion.footer
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: reducedMotion ? 0 : 1.8, duration: reducedMotion ? 0 : 0.3 }}
      className="fixed bottom-0 left-0 right-0 z-40 px-4 py-2"
      style={{
        background: 'rgba(5,5,5,0.95)',
        borderTop: '1px solid rgba(0,255,65,0.3)',
      }}
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-4 sm:gap-6">
          <StatusNode label="GESTURE ENGINE" status={gestureEngine} ok={gestureEngine === 'ONLINE'} warn={warn} />
          <StatusNode label="FACE TRACKER"   status={faceTracker}   ok={faceTracker === 'ACTIVE'}  warn={false} />
          <StatusNode label="WEBSOCKET"      status={websocket}     ok={wsOk}                       warn={warn} />
          <StatusNode label="NEXUS AUTH"     status={nexusAuth}     ok={nexusAuth === 'ARMED'}      warn={warn} />
        </div>

        {/* Scrolling hex ticker */}
        <div className="relative min-w-[200px] flex-1 overflow-hidden text-right">
          <div
            className="pointer-events-none absolute inset-0 opacity-15 font-mono text-[9px] leading-tight text-[#00FF41] whitespace-nowrap"
            style={{ animation: 'ticker 22s linear infinite' }}
          >
            {Array.from({ length: 14 }, () => randomHex()).join('  ')}
          </div>
          <span className="relative font-mono text-[10px] tracking-widest text-[#00FF41]" style={{ textShadow: '0 0 6px rgba(0,255,65,0.5)' }}>
            {reconnecting ? (
              <span className="text-[#FFAA00] animate-pulse">{'> RECONNECTING...'}</span>
            ) : (
              '> AURASHIELD v2.0 — DEFENSE GRID ONLINE'
            )}
          </span>
        </div>
      </div>
      <style>{`
        @keyframes ticker {
          0%   { transform: translateX(10%); }
          100% { transform: translateX(-45%); }
        }
      `}</style>
    </motion.footer>
  )
}
