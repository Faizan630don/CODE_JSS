import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

function helixPoints(offset, n, r, h) {
  const pts = []
  for (let i = 0; i < n; i++) {
    const u = i / Math.max(1, n - 1)
    const ang = u * Math.PI * 5 + offset
    pts.push(new THREE.Vector3(Math.cos(ang) * r, u * h - h / 2, Math.sin(ang) * r))
  }
  return pts
}

export function DNAHelix({ reducedMotion = false }) {
  const groupRef = useRef(null)
  const sphereRefs = useRef([])
  const n = 40

  const { points, tubeA, tubeB, sphereGeo, matCyan, matViolet } = useMemo(() => {
    const sphereGeo = new THREE.SphereGeometry(0.04, 10, 10)
    const pa = helixPoints(0, n, 0.52, 2.4)
    const pb = helixPoints(Math.PI, n, 0.52, 2.4)
    const ca = new THREE.CatmullRomCurve3(pa)
    const cb = new THREE.CatmullRomCurve3(pb)
    const tubeA = new THREE.TubeGeometry(ca, 96, 0.012, 6, false)
    const tubeB = new THREE.TubeGeometry(cb, 96, 0.012, 6, false)
    const matCyan = new THREE.MeshStandardMaterial({
      color: '#c084fc',
      emissive: '#4c1d95',
      emissiveIntensity: 0.6,
      metalness: 0.4,
      roughness: 0.35,
    })
    const matViolet = new THREE.MeshStandardMaterial({
      color: '#6d28d9',
      emissive: '#2e1065',
      emissiveIntensity: 0.35,
      metalness: 0.5,
      roughness: 0.4,
      transparent: true,
      opacity: 0.85,
    })
    const points = [...pa, ...pb]
    return { points, tubeA, tubeB, sphereGeo, matCyan, matViolet }
  }, [n])

  useEffect(() => {
    return () => {
      sphereGeo.dispose()
      tubeA.dispose()
      tubeB.dispose()
      matCyan.dispose()
      matViolet.dispose()
    }
  }, [sphereGeo, tubeA, tubeB, matCyan, matViolet])

  useFrame((state) => {
    if (reducedMotion) return
    const t = state.clock.elapsedTime
    if (groupRef.current) groupRef.current.rotation.y += 0.003
    sphereRefs.current.forEach((m, i) => {
      if (!m) return
      const s = Math.sin(t + i * 0.3) * 0.3 + 1.0
      m.scale.setScalar(s)
    })
  })

  return (
    <group ref={groupRef} position={[-2.6, 0.35, -0.5]}>
      <mesh geometry={tubeA} material={matViolet} />
      <mesh geometry={tubeB} material={matViolet} />
      {points.map((p, i) => (
        <mesh
          key={i}
          ref={(el) => {
            sphereRefs.current[i] = el
          }}
          position={p}
          geometry={sphereGeo}
          material={matCyan}
        />
      ))}
    </group>
  )
}
