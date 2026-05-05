import { useEffect } from 'react'

export function ScanlineOverlay({ intense }) {
  useEffect(() => {
    document.body.classList.toggle('scanline-intense', !!intense)
    return () => document.body.classList.remove('scanline-intense')
  }, [intense])
  return null
}
