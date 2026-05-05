import { motion } from 'framer-motion'
import { CyberInput } from '../ui/CyberInput'
import { GlowCard } from '../ui/GlowCard'
import { StreamVideo } from '../ui/StreamVideo'
import { TerminalLog } from '../ui/TerminalLog'
import { RecordButton } from './RecordButton'

export function GestureVault({
  name,
  setName,
  leftLog,
  onRecordStart,
  recordDisabled,
  reducedMotion,
  recordingPulse,
  mediaStream,
}) {
  return (
    <GlowCard
      className={`p-4 md:p-5 transition-all duration-300 ${
        recordingPulse ? 'border-[#FFAA00] shadow-[0_0_12px_rgba(255,170,0,0.5)]' : ''
      }`}
    >
      {/* Header */}
      <div className="panel-header mb-4">
        <span className="text-[#FFAA00]">◈</span>
        <span className="font-mono font-bold tracking-[0.16em] text-[#00FF41] text-xs">
          GESTURE AUTH MODULE
        </span>
        <span className="ml-auto font-mono text-[10px] text-[#4A4A4A]">
          {recordingPulse ? (
            <span className="text-[#FFAA00] animate-pulse">● RECORDING</span>
          ) : 'ENCODE BIOMETRIC SIGNATURE'}
        </span>
      </div>

      <CyberInput
        value={name}
        onChange={setName}
        placeholder="ENTER SIGNATURE ID..."
        disabled={recordDisabled}
      />

      {/* Recording feed */}
      {recordingPulse && mediaStream ? (
        <div className="relative mt-3 aspect-video w-full max-h-56 overflow-hidden border border-[#FFAA00]/50" style={{ boxShadow: '0 0 8px rgba(255,170,0,0.3)' }}>
          <StreamVideo stream={mediaStream} className="h-full w-full object-cover opacity-90" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          {/* Grid overlay */}
          <div className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: 'linear-gradient(rgba(0,255,65,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,65,0.05) 1px, transparent 1px)',
              backgroundSize: '20px 20px'
            }}
          />
          <span className="absolute bottom-2 left-2 font-mono text-[9px] tracking-widest text-[#FFAA00]">
            ● REC — GESTURE FEED
          </span>
        </div>
      ) : null}

      <div className="mt-4">
        <RecordButton
          reducedMotion={reducedMotion}
          disabled={recordDisabled}
          onStart={onRecordStart}
        />
      </div>
      <div className="mt-4">
        <TerminalLog lines={leftLog} />
      </div>
    </GlowCard>
  )
}
