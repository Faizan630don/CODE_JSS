export function HexBorder({ className = '', stroke = '#c084fc', dashOffset = 0 }) {
  return (
    <svg className={`absolute inset-0 h-full w-full ${className}`} viewBox="0 0 100 100">
      <polygon
        points="50,4 88,26 88,62 50,84 12,62 12,26"
        fill="none"
        stroke={stroke}
        strokeWidth="0.9"
        strokeDasharray="18 10"
        strokeDashoffset={dashOffset}
        style={{ filter: `drop-shadow(0 0 6px ${stroke})` }}
      />
    </svg>
  )
}
