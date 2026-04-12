function metricColor(ok, mid) {
  if (ok)  return { color: '#00FF41', borderColor: 'rgba(0,255,65,0.4)' }
  if (mid) return { color: '#FFAA00', borderColor: 'rgba(255,170,0,0.4)' }
  return   { color: '#FF2A2A', borderColor: 'rgba(255,42,42,0.4)' }
}

export function MetricsRow({ motionVar, matchDist, faceOk }) {
  const mvOk    = motionVar >= 2e-5
  const distOk  = matchDist <= 0.42
  const faceLabel = faceOk ? 'OK' : 'SEARCHING'

  const cells = [
    { label: 'MOTION VAR', value: motionVar.toExponential(2), style: metricColor(mvOk, !mvOk && motionVar > 1e-6) },
    { label: 'MATCH DIST', value: matchDist >= 900 ? '—' : matchDist.toFixed(3), style: metricColor(distOk, !distOk && matchDist < 0.7) },
    { label: 'FACE LOCK',  value: faceLabel,                                      style: metricColor(faceOk, false) },
  ]

  return (
    <div className="grid grid-cols-3 gap-2">
      {cells.map(({ label, value, style }) => (
        <div
          key={label}
          className="border px-2 py-2 text-center"
          style={{ background: 'rgba(10,10,10,0.9)', borderColor: style.borderColor }}
        >
          <div className="font-mono text-[8px] tracking-widest text-[#4A4A4A] mb-1">{label}</div>
          <div className="font-data text-xs tabular-nums" style={{ color: style.color }}>
            {value}
          </div>
        </div>
      ))}
    </div>
  )
}
