import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

function createShieldGeometry() {
  const shape = new THREE.Shape()
  shape.moveTo(0, 1.02)
  shape.lineTo(0.7, 0.93)
  shape.quadraticCurveTo(0.98, 0.18, 0.8, -0.6)
  shape.lineTo(0, -1.02)
  shape.lineTo(-0.8, -0.6)
  shape.quadraticCurveTo(-0.98, 0.18, -0.7, 0.93)
  shape.lineTo(0, 1.02)
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: 0.12,
    bevelEnabled: false,
    curveSegments: 16,
  })
  g.center()
  g.rotateX(Math.PI / 2)
  return g
}

function RipplePlane() {
  const meshRef = useRef(null)
  const mat = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color('#ff0033') },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          vec2 p = vUv - 0.5;
          float r = length(p) * 2.0;
          float wave = smoothstep(uTime + 0.05, uTime, r) * smoothstep(uTime + 0.35, uTime + 0.1, r);
          float alpha = wave * 0.45;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    })
  }, [])

  useFrame((state) => {
    if (!meshRef.current) return
    mat.uniforms.uTime.value = (state.clock.elapsedTime % 1.4) / 1.4
  })

  useEffect(() => () => mat.dispose(), [mat])

  return (
    <mesh ref={meshRef} rotation-x={-Math.PI / 2} position={[0, -0.85, 0]} material={mat}>
      <planeGeometry args={[14, 14]} />
    </mesh>
  )
}

export function ShieldMesh({ effect = 'idle', recordingBright = false, reducedMotion = false, burstActive = false }) {
  const groupRef = useRef(null)
  const solidRef = useRef(null)
  const wireRef = useRef(null)
  const successAnim = useRef(0)
  const emissiveTarget = useRef(new THREE.Color('#0066aa'))

  const geo = useMemo(() => createShieldGeometry(), [])
  const matSolid = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#9333ea',
        emissive: '#4c1d95',
        emissiveIntensity: 0.85,
        metalness: 0.9,
        roughness: 0.1,
        wireframe: false,
      }),
    []
  )
  const matWire = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#6d28d9',
        emissive: '#3d1d7a',
        emissiveIntensity: 0.5,
        metalness: 0.6,
        roughness: 0.2,
        transparent: true,
        opacity: 0.1,
        wireframe: true,
      }),
    []
  )

  useEffect(() => {
    return () => {
      geo.dispose()
      matSolid.dispose()
      matWire.dispose()
    }
  }, [geo, matSolid, matWire])

  useEffect(() => {
    if (burstActive) {
      emissiveTarget.current.set('#00ff44')
      successAnim.current = 1.0 // 1.0 seconds duration tracker
    } else if (effect === 'denied') {
      emissiveTarget.current.set('#ff0033')
    } else {
      emissiveTarget.current.set('#4c1d95')
    }
  }, [effect, burstActive])

  useFrame((state, dt) => {
    if (!groupRef.current || !solidRef.current || !wireRef.current) return
    const t = state.clock.elapsedTime
    let s = 1
    let wireOpacity = 0.1
    let rotSpeed = 0.005

    if (successAnim.current > 0) {
      successAnim.current = Math.max(0, successAnim.current - dt)
      // Burst scale up to 1.25 and down over 1.0 seconds
      const k = 1 - successAnim.current / 1.0 // 0 -> 1
      s = 1 + Math.sin(k * Math.PI) * 0.25
      
      // Wireframe flare 0.1 -> 0.8 -> 0.1
      wireOpacity = 0.1 + Math.sin(k * Math.PI) * 0.7
      
      // 5x rotation speed
      rotSpeed = 0.025
    }

    if (!reducedMotion) {
      groupRef.current.position.y = Math.sin(t * 0.8) * 0.15
      groupRef.current.rotation.y += rotSpeed
    }

    const recBoost = recordingBright ? 1.05 : 1
    s *= recBoost

    solidRef.current.scale.setScalar(s)
    wireRef.current.scale.setScalar(s * 1.02)
    matWire.opacity = THREE.MathUtils.lerp(matWire.opacity, wireOpacity, 0.2)
  })

  return (
    <group ref={groupRef} position={[0.4, 0.2, 0]}>
      <mesh ref={solidRef} geometry={geo} material={matSolid} />
      <mesh ref={wireRef} geometry={geo} material={matWire} />
      {effect === 'denied' && !reducedMotion ? <RipplePlane /> : null}
    </group>
  )
}
