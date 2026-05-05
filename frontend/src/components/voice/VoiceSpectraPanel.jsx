import { motion } from 'framer-motion'
import { AudioVisualizer } from './AudioVisualizer'
import { useVoiceAnalysis } from '../../hooks/useVoiceAnalysis'

function TerminalBar({ label, value, max = 100 }) {
  const pct = Math.round(Math.min(100, Math.max(0, value ?? 0)))
  const filled = Math.round(pct / 5)
  const empty  = 20 - filled
  const color  = pct >= 70 ? '#00FF41' : pct >= 45 ? '#FFAA00' : '#FF2A2A'
  return (
    <div className="flex items-center gap-2 font-mono text-xs">
      <span className="w-24 shrink-0 text-[#4A4A4A]">{label}</span>
      <span style={{ color, fontFamily: 'Share Tech Mono, monospace', letterSpacing: '0.04em' }}>
        {'█'.repeat(filled)}{'░'.repeat(empty)}
      </span>
      <span className="ml-1 tabular-nums" style={{ color }}>{(pct / 100).toFixed(2)}</span>
    </div>
  )
}

export function VoiceSpectraPanel({ reducedMotion }) {
  const {
    isRecording,
    audioData,
    confidence,
    status,
    result,
    breakdown,
    recordingTime,
    startRecording,
    stopRecording,
  } = useVoiceAnalysis()

  const elapsed  = Math.min(recordingTime, 4.0)
  const progress = elapsed / 4.0

  const verdictText =
    status === 'complete'
      ? result === 'human'
        ? '> VERDICT: [AUTHENTIC HUMAN]'
        : '> VERDICT: [SYNTHETIC DETECTED — AI CLONE]'
      : status === 'analyzing' ? '> VERDICT: [COMPUTING...]'
      : status === 'listening' ? '> RECORDING SAMPLE...'
      : '> VERDICT: [AWAITING SAMPLE]'

  const verdictColor =
    status === 'complete'
      ? result === 'human' ? '#00FF41' : '#FF2A2A'
      : status === 'analyzing' ? '#FFAA00'
      : '#4A4A4A'

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">

      {/* Waveform banner — full width */}
      <div
        className="relative mb-5 overflow-hidden border"
        style={{ height: 120, borderColor: 'rgba(0,255,65,0.3)', background: '#050505' }}
      >
        <div className="panel-header absolute top-2 left-3 z-10 text-[10px] mb-0 border-none pb-0">
          WAVEFORM VISUALIZER
        </div>
        <AudioVisualizer audioData={audioData} />
        {/* Scan line across waveform */}
        {!reducedMotion && isRecording && (
          <div
            className="pointer-events-none absolute inset-y-0 w-px opacity-70"
            style={{
              left: `${(elapsed / 4) * 100}%`,
              background: 'linear-gradient(to bottom, transparent, #00FF41, transparent)',
              boxShadow: '0 0 6px rgba(0,255,65,0.8)',
              transition: 'left 0.1s linear',
            }}
          />
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Left — Recording status panel */}
        <div className="terminal-panel p-4">
          <div className="panel-header mb-4">RECORDING STATUS</div>

          {/* Timer */}
          <div className="font-data text-2xl mb-3" style={{ color: isRecording ? '#FFAA00' : '#4A4A4A', textShadow: isRecording ? '0 0 8px rgba(255,170,0,0.6)' : 'none' }}>
            {isRecording ? (
              <span className="flex items-center gap-2">
                <span className="animate-pulse">●</span> REC &nbsp;
                {String(Math.floor(elapsed / 60)).padStart(2,'0')}:{String(Math.floor(elapsed % 60)).padStart(2,'0')}.{String(Math.floor((elapsed % 1) * 10))} / 4.0
              </span>
            ) : (
              <span>{status === 'analyzing' ? <span className="text-[#FFAA00] animate-pulse">ANALYZING...</span> : '00:00.0 / 4.0'}</span>
            )}
          </div>

          {/* Progress bar */}
          <div className="progress-bar-track mb-1">
            <motion.div
              className={`progress-bar-fill ${isRecording ? 'amber' : status === 'complete' ? (result === 'human' ? '' : 'red') : ''}`}
              animate={{ width: `${isRecording ? progress * 100 : status === 'complete' ? 100 : 0}%` }}
              transition={{ duration: 0.1 }}
            />
          </div>
          <div className="font-data text-xs text-[#4A4A4A] mb-4">
            {isRecording ? `${Math.round(progress * 100)}%` : status === 'complete' ? '100%' : '—'}
          </div>

          <div className="flex gap-2">
            {status === 'idle' && (
              <button
                onClick={() => startRecording('enroll')}
                className="btn-terminal flex-1 text-xs"
              >
                ENROLL VOICE
              </button>
            )}
            {(status === 'enrolled' || status === 'complete') && !isRecording && (
              <button
                onClick={() => startRecording('test')}
                className="btn-terminal flex-1 text-xs"
              >
                {status === 'complete' ? 'RE-TEST AUDIO' : 'TEST THE AUDIO'}
              </button>
            )}
            {isRecording && (
              <button onClick={stopRecording} className="btn-terminal danger flex-1 text-xs">
                ABORT
              </button>
            )}
          </div>

          {status === 'enrolled' && !isRecording && (
            <div className="mt-3 border border-[#00FF41]/30 px-3 py-2 font-mono text-[10px] text-[#00FF41]">
              ✓ BASELINE ENROLLED — READY TO TEST
            </div>
          )}
        </div>

        {/* Right — Analysis engine */}
        <div className="terminal-panel p-4">
          <div className="panel-header mb-4">ANALYSIS ENGINE</div>
          <div className="space-y-1.5 font-mono text-xs">
            {[
              ['Sample Rate',     '22050 Hz'],
              ['MFCC Coefficients', '40'],
              ['Algorithm',      'Librosa + Cosine Sim'],
              ['Spectrogram',    status === 'analyzing' ? 'COMPUTING...' : status === 'complete' ? 'DONE' : 'PENDING'],
              ['Jitter Analysis', status === 'analyzing' ? 'PENDING' : status === 'complete' ? 'DONE' : 'IDLE'],
              ['Neural Trust',    status === 'analyzing' ? 'CALCULATING...' : status === 'complete' ? `${confidence.toFixed(1)}%` : '—'],
            ].map(([label, val]) => (
              <div key={label} className="flex justify-between">
                <span className="text-[#4A4A4A]">{`> ${label}:`}</span>
                <span className="text-[#E0E0E0] font-data">{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Verdict banner */}
      <div
        className="mt-5 border px-4 py-3 font-mono text-sm tracking-widest"
        style={{
          borderColor: verdictColor,
          color: verdictColor,
          textShadow: status === 'complete' ? `0 0 10px ${verdictColor}` : 'none',
          background: status === 'complete' ? `${verdictColor}10` : 'transparent',
          animation: status === 'complete' && result !== 'human' ? 'alert-flash 0.8s ease-in-out infinite' : 'none',
        }}
      >
        {verdictText}
      </div>

      {/* Feature breakdown */}
      {breakdown && (
        <div className="mt-5 terminal-panel p-4">
          <div className="panel-header mb-4">FEATURE BREAKDOWN</div>
          <div className="space-y-2">
            <TerminalBar label="Jitter ←"    value={breakdown.jitter}     />
            <TerminalBar label="Flatness"     value={breakdown.flatness}   />
            <TerminalBar label="High Freq"    value={breakdown.high_freq}  />
            <TerminalBar label="Shimmer"      value={breakdown.shimmer}    />
            <TerminalBar label="MFCC Match"   value={breakdown.mfcc_match} />
          </div>
        </div>
      )}
    </div>
  )
}
