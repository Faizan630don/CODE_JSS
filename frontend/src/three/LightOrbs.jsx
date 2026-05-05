import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

export function LightOrbs({ reducedMotion = false }) {
  const g1 = useRef(null)
  const g2 = useRef(null)
  const g3 = useRef(null)
  const lights = useMemo(
    () => [
      { color: new THREE.Color('#9333ea'), ref: g1, a: 0.7, b: 1.1, intensity: 1.2 },
      { color: new THREE.Color('#4f46e5'), ref: g2, a: 1.3, b: 0.9, intensity: 0.8 },
      { color: new THREE.Color('#d946ef'), ref: g3, a: 0.5, b: 1.4, intensity: 0.6 },
    ],
    []
  )

  useFrame((state) => {
    if (reducedMotion) return
    const t = state.clock.elapsedTime
    const pulse = 0.8 + Math.sin(t * 1.7) * 0.3
    lights.forEach((L, i) => {
      const r = L.ref.current
      if (!r) return
      const o = i * 2.1
      r.position.set(
        Math.sin(t * 0.22 + o) * 4.2 + Math.sin(t * 0.11) * 0.6,
        Math.cos(t * 0.19 + o * 0.5) * 1.8 + 0.5,
        Math.cos(t * 0.25 + o) * 3.5
      )
      const pl = r.children[0]
      if (pl && pl.isPointLight) {
        pl.intensity = pulse * L.intensity
      }
    })
  })

  return (
    <>
      {lights.map((L) => (
        <group key={L.color.getHex()} ref={L.ref}>
          <pointLight color={L.color} distance={28} decay={2} castShadow={false} />
        </group>
      ))}
    </>
  )
}
