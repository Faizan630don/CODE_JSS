import { useEffect, useState } from 'react'
import { StreamVideo } from '../ui/StreamVideo'

export function DetectionCircle({
  gestureName,
  ringState,
  cameraError,
  reducedMotion,
  badge,
  mediaStream,
}) {
  const [scan, setScan] = useState(0)

  useEffect(() => {
    if (reducedMotion) return
    let frame
    const loop = () => {
      setScan(s => (s + 0.8) % 360)
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [reducedMotion])

  const ringColor =
    ringState === 'green' ? '#00FF41' :
    ringState === 'red'   ? '#FF2A2A' : '#0D7377'

  const ringGlow =
    ringState === 'green' ? '0 0 20px rgba(0,255,65,0.7), 0 0 60px rgba(0,255,65,0.3)' :
    ringState === 'red'   ? '0 0 20px rgba(255,42,42,0.7), 0 0 60px rgba(255,42,42,0.3)' :
    '0 0 10px rgba(13,115,119,0.5)'

  const showFeed = mediaStream && !cameraError

  return (
    <div className="relative mx-auto flex w-full max-w-[380px] aspect-square items-center justify-center p-3">
      {/* Corner scan brackets */}
      {['tl','tr','bl','br'].map(pos => (
        <div key={pos} className="absolute" style={{
          top:    pos.startsWith('t') ? 4 : undefined,
          bottom: pos.startsWith('b') ? 4 : undefined,
          left:   pos.endsWith('l')   ? 4 : undefined,
          right:  pos.endsWith('r')   ? 4 : undefined,
          width: 24, height: 24,
          borderTop:    pos.startsWith('t') ? `2px solid ${ringColor}` : undefined,
          borderBottom: pos.startsWith('b') ? `2px solid ${ringColor}` : undefined,
          borderLeft:   pos.endsWith('l')   ? `2px solid ${ringColor}` : undefined,
          borderRight:  pos.endsWith('r')   ? `2px solid ${ringColor}` : undefined,
        }} />
      ))}

      {/* Badge */}
      {badge === 'confirmed' && (
        <div className="absolute top-1 left-1/2 -translate-x-1/2 z-20 border border-[#00FF41] px-3 py-0.5 font-mono text-[10px] tracking-widest text-[#00FF41]" style={{ boxShadow: '0 0 10px rgba(0,255,65,0.5)', background: 'rgba(0,255,65,0.1)' }}>
          ✓ IDENTITY CONFIRMED
        </div>
      )}
      {badge === 'denied' && (
        <div className="absolute top-1 left-1/2 -translate-x-1/2 z-20 border border-[#FF2A2A] px-3 py-0.5 font-mono text-[10px] tracking-widest text-[#FF2A2A] animate-pulse" style={{ boxShadow: '0 0 10px rgba(255,42,42,0.5)', background: 'rgba(255,42,42,0.1)' }}>
          ✗ BREACH ATTEMPT LOGGED
        </div>
      )}

      {/* Main square viewport */}
      <div
        className="relative flex h-full w-full items-center justify-center overflow-hidden"
        style={{
          background: '#050505',
          border: `2px solid ${ringColor}`,
          boxShadow: ringGlow,
          transition: 'border-color 0.4s ease, box-shadow 0.4s ease',
        }}
      >
        {/* Scan line */}
        {!reducedMotion && (
          <div
            className="pointer-events-none absolute inset-0 z-[5] opacity-30"
            style={{
              background: `conic-gradient(from ${scan}deg, transparent 340deg, rgba(0,255,65,0.15) 355deg, rgba(0,255,65,0.4) 360deg)`,
            }}
          />
        )}

        {showFeed ? (
          <div className="absolute inset-0 z-0">
            <StreamVideo stream={mediaStream} className="h-full w-full object-cover opacity-85" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />
            {/* Grid overlay */}
            <div className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage: 'linear-gradient(rgba(0,255,65,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,65,0.04) 1px, transparent 1px)',
                backgroundSize: '18px 18px'
              }}
            />
          </div>
        ) : null}

        <div className="relative z-[10] flex flex-col items-center justify-center text-center px-4">
          {cameraError ? (
            <div className="font-mono text-[11px] text-[#FF2A2A] leading-snug">
              <div className="text-xl mb-1">⊗</div>
              SENSOR OFFLINE
              <div className="mt-1 text-[#4A4A4A] text-[10px]">Allow camera access</div>
            </div>
          ) : gestureName ? (
            <span className="font-mono text-sm text-[#00FF41]" style={{ textShadow: '0 0 14px rgba(0,255,65,0.8)' }}>
              ◉ {gestureName}
            </span>
          ) : showFeed ? (
            <span className="font-mono text-[10px] tracking-[0.2em] text-[#0D7377]">LIVE SENSOR</span>
          ) : (
            <span className="font-mono text-[10px] tracking-[0.2em] text-[#4A4A4A]">INITIALIZING...</span>
          )}
        </div>
      </div>
    </div>
  )
}
