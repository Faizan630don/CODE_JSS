import { motion } from 'framer-motion'

import { GestureVault } from './GestureVault'
import { NexusMonitor } from './NexusMonitor'

export function NexusPanel({
  reducedMotion,
  name,
  setName,
  leftLog,
  onRecordStart,
  recordDisabled,
  recordingPulse,
  monitorActive,
  onToggleMonitor,
  rightLog,
  metrics,
  ringState,
  badge,
  cameraError,
  mediaStream,
  earValue,
  sosStatus,
}) {
  return (
    <motion.section
      initial={reducedMotion ? false : { y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: reducedMotion ? 0 : 1.2, duration: reducedMotion ? 0 : 0.5 }}
      className="relative z-10 mx-auto mt-6 w-full max-w-6xl px-4 pb-40 pt-4 md:pb-48"
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
        <GestureVault
          name={name}
          setName={setName}
          leftLog={leftLog}
          onRecordStart={onRecordStart}
          recordDisabled={recordDisabled}
          reducedMotion={reducedMotion}
          recordingPulse={recordingPulse}
          mediaStream={mediaStream}
        />
        <NexusMonitor
          active={monitorActive}
          onToggleMonitor={onToggleMonitor}
          rightLog={rightLog}
          metrics={metrics}
          ringState={ringState}
          badge={badge}
          cameraError={cameraError}
          reducedMotion={reducedMotion}
          mediaStream={mediaStream}
          earValue={earValue}
          sosStatus={sosStatus}
        />
      </div>
    </motion.section>
  )
}
