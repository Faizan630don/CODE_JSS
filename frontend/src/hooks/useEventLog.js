import { useCallback, useState } from 'react'

const MAX = 50

export function useEventLog() {
  const [entries, setEntries] = useState([])

  const push = useCallback((line) => {
    if (line == null || line === '') return
    setEntries((prev) => {
      const next = [String(line), ...prev]
      return next.slice(0, MAX)
    })
  }, [])

  const clear = useCallback(() => setEntries([]), [])

  return { entries, push, clear }
}
