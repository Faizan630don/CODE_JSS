import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

const vs = `
attribute float aPhase;
uniform float uTime;
uniform float uBurst;
varying float vBright;

void main() {
  vec3 pos = position;
  float t = uTime * 0.15 + aPhase;
  pos.x += sin(t * 1.3 + aPhase * 6.28) * 0.08 * uBurst;
  pos.y += cos(t * 0.9 + aPhase * 3.14) * 0.06 * uBurst;
  pos.z += sin(t * 1.1 + aPhase * 2.0) * 0.08 * uBurst;
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  float dist = length(mvPosition.xyz);
  vBright = smoothstep(22.0, 4.0, dist);
  float ps = mix(1.2, 4.0, vBright);
  gl_PointSize = ps * (300.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}
`

const fs = `
varying float vBright;
void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float a = 1.0 - smoothstep(0.35, 0.5, length(c));
  vec3 col = vec3(0.659, 0.333, 0.969);
  gl_FragColor = vec4(col, a * 0.4 * vBright);
}
`

export function ParticleField({ count = 2000, reducedMotion = false, burst = false }) {
  const meshRef = useRef(null)
  const burstRef = useRef(1)
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const positions = new Float32Array(count * 3)
    const phases = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 40
      positions[i * 3 + 1] = (Math.random() - 0.5) * 30
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20
      phases[i] = Math.random()
    }
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
    return g
  }, [count])

  const mat = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBurst: { value: 1 },
      },
      vertexShader: vs,
      fragmentShader: fs,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  }, [])

  useEffect(() => () => geo.dispose(), [geo])
  useEffect(() => () => mat.dispose(), [mat])

  useFrame((state) => {
    if (reducedMotion) {
      mat.uniforms.uBurst.value = 1
      return
    }
    mat.uniforms.uTime.value = state.clock.elapsedTime
    const target = burst ? 3 : 1
    burstRef.current += (target - burstRef.current) * 0.12
    mat.uniforms.uBurst.value = burstRef.current
  })

  return (
    <points ref={meshRef} geometry={geo} material={mat} frustumCulled={false} />
  )
}
