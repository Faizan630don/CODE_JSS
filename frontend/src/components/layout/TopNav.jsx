import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'

export function TopNav({ authState, reducedMotion, activeTab, setActiveTab, sosStatus }) {
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString('en-GB', { hour12: false }))
  const [glitch, setGlitch] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setClock(new Date().toLocaleTimeString('en-GB', { hour12: false })), 1000)
    return () => clearInterval(id)
  }, [])

  const stateColor =
    authState === 'confirmed' ? 'text-[#00FF41]' :
    authState === 'denied'    ? 'text-[#FF2A2A]' :
    authState === 'recording' ? 'text-[#FFAA00]' :
    authState === 'monitoring'? 'text-[#00FF41]' : 'text-[#4A4A4A]'

  return (
    <motion.header
      initial={reducedMotion ? false : { y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: reducedMotion ? 0 : 0.2, duration: reducedMotion ? 0 : 0.4 }}
      className="nav-bar fixed left-0 right-0 top-0 z-40 flex items-center justify-between gap-4 px-5 py-2"
    >
      {/* Logo */}
      <button
        className="nav-logo flex items-center gap-2 group"
        onMouseEnter={() => { setGlitch(true); setTimeout(() => setGlitch(false), 400) }}
        style={glitch ? {
          textShadow: '2px 0 #FF2A2A, -2px 0 #00FF41',
          transform: 'skewX(-2deg)',
        } : {}}
      >
        <span className="text-[#00FF41] font-mono text-lg">⬡</span>
        <span className="font-mono font-bold tracking-[0.2em] text-[#00FF41] text-sm" style={{ textShadow: '0 0 8px rgba(0,255,65,0.6)' }}>
          AURASHIELD
        </span>
      </button>

      {/* Tabs */}
      <div className="hidden sm:flex items-center gap-6 font-mono text-xs tracking-[0.2em]">
        {[
          { id: 'auth',   label: 'IDENTITY' },
          { id: 'voice',  label: 'SPECTRA'  },
          { id: 'vision', label: 'VISION'   },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`transition-all duration-150 px-1 pb-0.5 ${
              activeTab === id
                ? 'text-[#00FF41] border-b border-[#00FF41]'
                : 'text-[#4A4A4A] hover:text-[#00CC33]'
            }`}
            style={activeTab === id ? { textShadow: '0 0 6px rgba(0,255,65,0.6)' } : {}}
          >
            {'[ '}{label}{' ]'}
          </button>
        ))}
      </div>

      {/* Right cluster */}
      <div className="flex items-center gap-4 shrink-0">
        {/* SOS badge */}
        <div className={`hidden sm:flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[9px] tracking-widest ${
          sosStatus === 'triggered'
            ? 'border-[#FF2A2A] text-[#FF2A2A] animate-pulse'
            : sosStatus === 'cooldown'
            ? 'border-[#FFAA00] text-[#FFAA00]'
            : 'border-[#00FF41]/50 text-[#00FF41]'
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${
            sosStatus === 'triggered' ? 'bg-[#FF2A2A] animate-ping'
            : sosStatus === 'cooldown' ? 'bg-[#FFAA00]'
            : 'bg-[#00FF41]'
          }`} />
          {sosStatus === 'triggered' ? '🚨 SOS ACTIVE' : sosStatus === 'cooldown' ? 'SOS COOLDOWN' : '● SOS ARMED'}
        </div>

        {/* Clock */}
        <span className="nav-clock text-sm tabular-nums">{clock}</span>

        {/* Live dot */}
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00FF41] opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#00FF41]" style={{ boxShadow: '0 0 6px rgba(0,255,65,0.9)' }} />
        </span>
        <span className="font-mono text-[9px] text-[#00FF41] hidden xs:inline tracking-widest">LIVE</span>
      </div>
    </motion.header>
  )
}
