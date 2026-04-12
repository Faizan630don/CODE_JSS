export function GlowCard({ children, className = '', hoverTilt = false, ...rest }) {
  return (
    <div
      className={`terminal-panel ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}
