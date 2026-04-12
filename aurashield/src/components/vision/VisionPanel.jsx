import { motion } from 'framer-motion'
import { useState, useRef } from 'react'

function TerminalBar({ label, value, max = 1 }) {
  // Value is 0-1
  const pct = Math.round(Math.min(100, Math.max(0, value * 100)))
  const filled = Math.round(pct / 5)
  const empty  = 20 - filled
  const color  = pct >= 70 ? '#00FF41' : pct >= 45 ? '#FFAA00' : '#FF2A2A'
  return (
    <div className="flex items-center gap-2 font-mono text-xs">
      <span className="w-40 shrink-0 text-[#4A4A4A]">{label}</span>
      <span style={{ color, fontFamily: 'Share Tech Mono, monospace', letterSpacing: '0.04em' }}>
        {'█'.repeat(filled)}{'░'.repeat(empty)}
      </span>
      <span className="ml-1 tabular-nums" style={{ color }}>{(pct / 100).toFixed(2)}</span>
    </div>
  )
}

export function VisionPanel({ reducedMotion }) {
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('idle') // idle | uploading | analyzing | complete | error
  const [result, setResult] = useState(null)
  const [progress, setProgress] = useState(0)
  
  const fileInputRef = useRef(null)

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      setStatus('idle')
      setResult(null)
      setProgress(0)
    }
  }

  const runAnalysis = async () => {
    if (!file) return

    setStatus('uploading')
    setProgress(0.1)

    try {
      const formData = new FormData()
      formData.append('video', file)

      // Simulate step-up progress bar like a real terminal scan
      const interval = setInterval(() => {
        setProgress(p => Math.min(0.9, p + 0.1))
      }, 500)

      setStatus('analyzing')
      const response = await fetch('http://localhost:8000/predict', {
        method: 'POST',
        body: formData
      })

      clearInterval(interval)

      if (!response.ok) throw new Error('API Error')

      const data = await response.json()
      setResult(data)
      setProgress(1.0)
      setStatus('complete')
    } catch (err) {
      console.error(err)
      setStatus('error')
    }
  }

  const verdictText = 
    status === 'complete' && result
      ? result.prediction === 'REAL'
        ? '> VERDICT: [AUTHENTIC MEDIA]'
        : '> VERDICT: [SYNTHETIC DEEPFAKE DETECTED]'
      : status === 'analyzing' || status === 'uploading' ? '> VERDICT: [COMPUTING SIGNATURE...]'
      : status === 'error' ? '> VERDICT: [FILE UNREADABLE OR CORRUPT]'
      : '> VERDICT: [AWAITING UPLOAD]'

  const verdictColor = 
    status === 'complete' && result
      ? result.prediction === 'REAL' ? '#00FF41' : '#FF2A2A'
      : status === 'analyzing' || status === 'uploading' ? '#FFAA00'
      : status === 'error' ? '#FF2A2A'
      : '#4A4A4A'

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        
        {/* Left — Uploader */}
        <div className="terminal-panel p-4">
          <div className="panel-header mb-4">MEDIA INGESTION PORTAL</div>
          
          <div className="flex flex-col h-32 justify-center items-center rounded-sm border border-dashed border-[#00FF41]/30 bg-[#00FF41]/5 mb-4 relative cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <input 
              type="file" 
              accept="video/mp4,video/quicktime,video/webm" 
              ref={fileInputRef} 
              className="hidden" 
              onChange={handleFileChange}
            />
            {file ? (
              <div className="text-[#00FF41] font-mono text-xs">
                FILE MOUNTED: {file.name} ({(file.size / (1024*1024)).toFixed(2)} MB)
              </div>
            ) : (
              <div className="text-[#00FF41]/70 font-mono text-xs">
                [ DRAG &amp; DROP MEDIA HERE OR CLICK TO BROWSE ]
              </div>
            )}
          </div>

          <div className="progress-bar-track mb-1">
            <motion.div
              className={`progress-bar-fill ${status === 'analyzing' || status === 'uploading' ? 'amber' : status === 'complete' ? (result?.prediction === 'REAL' ? '' : 'red') : ''}`}
              animate={{ width: `${progress * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <div className="font-data text-xs text-[#4A4A4A] mb-4">
            {status === 'complete' ? '100% DONE' : status === 'analyzing' || status === 'uploading' ? 'SCANNING...' : 'IDLE'}
          </div>

          <button
            onClick={runAnalysis}
            disabled={!file || status === 'analyzing' || status === 'uploading'}
            className="btn-terminal w-full text-xs"
          >
            {status === 'complete' ? 'RE-INGEST AND SCAN' : 'EXECUTE FORENSICS SCAN'}
          </button>
        </div>

        {/* Right — Output Engine */}
        <div className="terminal-panel p-4">
          <div className="panel-header mb-4">FORENSICS ENGINE</div>
          <div className="space-y-1.5 font-mono text-xs">
            {[
              ['Engine Profile',  'Deep Spectral Flux'],
              ['Model Node',      'local-v1A-vid'],
              ['Container Type',  file ? file.type || 'unknown' : '—'],
              ['Ingestion',      status === 'uploading' ? 'UPLOADING...' : status === 'analyzing' || status === 'complete' ? 'SECURED' : 'PENDING'],
              ['Frame Read',     status === 'analyzing' ? 'SCANNING' : status === 'complete' ? 'DONE' : 'IDLE'],
              ['Trust Score',    status === 'analyzing' ? 'CALCULATING...' : status === 'complete' ? `${(result?.confidence * 100).toFixed(1)}%` : '—'],
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
          animation: status === 'complete' && result?.prediction !== 'REAL' ? 'alert-flash 0.8s ease-in-out infinite' : 'none',
        }}
      >
        {verdictText}
      </div>

      {/* Feature breakdown */}
      {result && result.analysis && (
        <div className="mt-5 terminal-panel p-4">
          <div className="panel-header mb-4">SIGNATURE BREAKDOWN</div>
          <div className="space-y-2">
            <TerminalBar label="Temporal Consistency" value={result.analysis.temporal_consistency} />
            <TerminalBar label="Visual Integrity"     value={result.analysis.visual_integrity} />
            <TerminalBar label="Anomaly Score"        value={result.analysis.anomaly_score} />
          </div>
        </div>
      )}

    </div>
  )
}
