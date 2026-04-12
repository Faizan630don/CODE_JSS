import { motion } from 'framer-motion'
import { GlowCard } from '../ui/GlowCard'
import { TerminalLog } from '../ui/TerminalLog'
import { DetectionCircle } from './DetectionCircle'
import { MetricsRow } from './MetricsRow'
import { MonitorButton } from './MonitorButton'

export function NexusMonitor({
  active,
  onToggleMonitor,
  rightLog,
  metrics,
  ringState,
  badge,
  cameraError,
  reducedMotion,
  mediaStream,
  earValue,
  sosStatus,
}) {
  return (
    <GlowCard className="p-4 md:p-5">
      {/* Header */}
      <div className="panel-header mb-4">
        <span className="text-[#00FF41]">◉</span>
        <span className="font-mono font-bold tracking-[0.16em] text-[#00FF41] text-xs">
          NEXUS MONITOR
        </span>
        <span className="ml-auto font-mono text-[10px]" style={{
          color: active ? '#00FF41' : '#4A4A4A',
          textShadow: active ? '0 0 6px rgba(0,255,65,0.7)' : 'none'
        }}>
          {active ? 'LIVE IDENTITY SCAN' : 'STANDBY'}
        </span>
      </div>

      <MonitorButton active={active} onToggle={onToggleMonitor} reducedMotion={reducedMotion} />

      <div className="mt-5">
        <DetectionCircle
          gestureName={active ? metrics.gesture_name : ''}
          ringState={ringState}
          cameraError={cameraError}
          reducedMotion={reducedMotion}
          badge={badge}
          mediaStream={mediaStream}
        />
      </div>

      <div className="mt-4">
        <MetricsRow
          motionVar={metrics.motion_var}
          matchDist={metrics.match_dist}
          faceOk={metrics.face_ok}
        />
      </div>

      <div className="mt-4">
        <TerminalLog lines={rightLog} />
      </div>

      {/* SOS chip */}
      <div className={`mt-3 flex items-center justify-between border px-3 py-1.5 font-mono text-[10px] ${
        sosStatus === 'triggered' ? 'border-[#FF2A2A]/60 text-[#FF2A2A]'
        : sosStatus === 'cooldown'  ? 'border-[#FFAA00]/60 text-[#FFAA00]'
        : 'border-[#00FF41]/25 text-[#00FF41]'
      }`}>
        <span>{sosStatus === 'triggered' ? '🚨 SOS BREACH ACTIVE' : sosStatus === 'cooldown' ? '⏳ SOS COOLDOWN' : '🛡 SOS SENTINEL: ARMED'}</span>
        <span className="font-data text-[#E0E0E0]">{earValue != null ? `EAR ${earValue.toFixed(3)}` : '—'}</span>
      </div>
    </GlowCard>
  )
}
