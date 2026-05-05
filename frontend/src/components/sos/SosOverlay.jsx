import { motion } from 'framer-motion'
import { AnimatePresence } from 'framer-motion'

export function SosOverlay({ sosStatus, sosData, cooldownLeft, earValue, onManualSos }) {
  const isTriggered = sosStatus === 'triggered'
  const isCooldown  = sosStatus === 'cooldown'
  const showPanel   = isTriggered || isCooldown

  const cooldownSec   = sosData?.cooldownSec || 45
  const ringProgress  = isCooldown ? (cooldownLeft / cooldownSec) : 0
  const circumference = 2 * Math.PI * 44
  const dash          = circumference * ringProgress

  const mapsUrl = sosData?.location && sosData.location !== 'Unknown'
    ? (() => {
        const latM = sosData.location.match(/Lat:\s*([\d.-]+)/)
        const lngM = sosData.location.match(/Lng:\s*([\d.-]+)/)
        if (latM && lngM) return `https://www.google.com/maps?q=${latM[1]},${lngM[1]}`
        return null
      })()
    : null

  return (
    <>
      {/* Red tint overlay */}
      <AnimatePresence>
        {isTriggered && (
          <motion.div
            key="sos-bg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none fixed inset-0 z-[60]"
            style={{ background: 'rgba(255,42,42,0.14)', animation: 'alert-flash 0.6s ease-in-out infinite' }}
          />
        )}
      </AnimatePresence>

      {/* Alert Panel */}
      <AnimatePresence>
        {showPanel && (
          <motion.div
            key="sos-panel"
            initial={{ opacity: 0, y: -40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="fixed left-1/2 top-24 z-[70] w-[min(460px,90vw)] -translate-x-1/2"
          >
            <div
              className="terminal-panel p-5"
              style={{
                borderColor: isTriggered ? '#FF2A2A' : '#FFAA00',
                boxShadow: isTriggered
                  ? '0 0 20px rgba(255,42,42,0.5), 0 0 60px rgba(255,42,42,0.2)'
                  : '0 0 16px rgba(255,170,0,0.4)',
              }}
            >
              {/* Header */}
              <div className="flex items-center gap-3 mb-4">
                <span className={`text-2xl ${isTriggered ? 'animate-pulse' : ''}`}>🚨</span>
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-sm tracking-[0.2em]" style={{ color: isTriggered ? '#FF2A2A' : '#FFAA00', textShadow: isTriggered ? '0 0 8px rgba(255,42,42,0.7)' : 'none' }}>
                    {isTriggered ? '> SOS ALERT DISPATCHED' : `> SOS COOLDOWN — ${cooldownLeft}s`}
                  </p>
                  <p className="font-mono text-[10px] text-[#4A4A4A] mt-0.5">
                    {isTriggered ? 'Silent emergency protocol engaged · email transmitted' : 'Monitoring paused · will resume automatically'}
                  </p>
                </div>
                {isCooldown && (
                  <svg width="56" height="56" className="shrink-0 -rotate-90">
                    <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,170,0,0.15)" strokeWidth="4" />
                    <circle cx="28" cy="28" r="22" fill="none" stroke="#FFAA00" strokeWidth="4"
                      strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round" />
                    <text x="28" y="32" textAnchor="middle" style={{ fill: '#FFAA00', fontFamily: 'monospace', fontSize: '11px', transform: 'rotate(90deg) translate(0,-56px)' }}>
                      {cooldownLeft}
                    </text>
                  </svg>
                )}
              </div>

              {/* Details */}
              <div className="space-y-2 font-mono text-xs border-t pt-3" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                {[
                  { label: 'TIME',     value: sosData?.timestamp || '—' },
                  { label: 'LOCATION', value: sosData?.location  || 'Unknown', link: mapsUrl },
                  { label: 'LIVE EAR', value: earValue?.toFixed(3) ?? '—' },
                ].map(({ label, value, link }) => (
                  <div key={label} className="flex justify-between gap-2">
                    <span className="text-[#4A4A4A]">{label}</span>
                    <span className="text-[#E0E0E0] text-right truncate">
                      {value}
                      {link && <a href={link} target="_blank" rel="noreferrer" className="ml-2 text-[#00FF41] hover:underline">↗ Map</a>}
                    </span>
                  </div>
                ))}
              </div>

              {/* Manual trigger */}
              <button
                type="button"
                onClick={onManualSos}
                className="mt-4 w-full border py-2 font-mono text-[10px] tracking-widest transition-colors"
                style={{ borderColor: 'rgba(255,42,42,0.6)', color: '#FF2A2A' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,42,42,0.1)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                [ MANUAL SOS TRIGGER ]
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
