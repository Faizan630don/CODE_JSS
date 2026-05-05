import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Bloom, ChromaticAberration, EffectComposer } from '@react-three/postprocessing'

export function PostFX({ burstActive }) {
  const chromaOffset = useMemo(() => new THREE.Vector2(0.0006, 0.0006), [])
  const [bloomInt, setBloomInt] = useState(0.8)

  useFrame((state, delta) => {
    if (burstActive) {
      setBloomInt((b) => THREE.MathUtils.lerp(b, 2.5, delta * 15))
    } else {
      setBloomInt((b) => THREE.MathUtils.lerp(b, 0.8, delta * 2))
    }
  })

  return (
    <EffectComposer multisampling={0}>
      <Bloom intensity={bloomInt} luminanceThreshold={0.25} mipmapBlur />
      <ChromaticAberration offset={chromaOffset} />
    </EffectComposer>
  )
}

