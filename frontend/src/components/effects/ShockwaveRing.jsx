import { useEffect, useState } from 'react'

export function ShockwaveRing({ active }) {
  const [key, setKey] = useState(0)

  useEffect(() => {
    if (active) {
      setKey((k) => k + 1)
    }
  }, [active])

  if (!active && key === 0) return null

  return (
    <>
      {active ? (
        <div 
          key={key}
          className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
        >
          <div 
            className="rounded-full border-[2px] border-[#00ff44]"
            style={{
              boxShadow: '0 0 30px #00ff44, 0 0 60px rgba(0,255,68,0.3)',
              animation: 'shockwave-anim 0.6s ease-out forwards',
            }}
          />
        </div>
      ) : null}
      <style>{`
        @keyframes shockwave-anim {
          0%   { width: 0; height: 0; opacity: 1; }
          100% { width: 120vw; height: 120vw; opacity: 0; }
        }
      `}</style>
    </>
  )
}
