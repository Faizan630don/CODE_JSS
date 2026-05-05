import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

const vertexShader = `
varying vec3 vWorldPos;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorldPos = w.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const fragmentShader = `
uniform float uTime;
varying vec3 vWorldPos;

float hex(vec2 p) {
  p = abs(p);
  float c = dot(p, normalize(vec2(1.0, 1.7320508)));
  c = max(c, p.x);
  return c;
}

void main() {
  vec2 p = vWorldPos.xz * 0.55;
  p.x += sin(uTime * 0.15) * 0.08;
  p.y += cos(uTime * 0.12) * 0.08;
  vec2 grid = vec2(1.0, 1.7320508);
  vec2 cellHalf = grid * 0.5;
  vec2 a = mod(p, grid) - cellHalf;
  vec2 b = mod(p - cellHalf, grid) - cellHalf;
  vec2 gv = length(a) < length(b) ? a : b;
  float d = hex(gv);
  float line = smoothstep(0.12, 0.04, abs(d - 0.22));
  float alpha = line * 0.15;
  gl_FragColor = vec4(0.231, 0.027, 0.392, alpha);
}
`

export function HexFloor({ reducedMotion = false }) {
  const meshRef = useRef(null)
  const mat = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
    })
  }, [])

  useFrame((state) => {
    if (reducedMotion) return
    mat.uniforms.uTime.value = state.clock.elapsedTime
  })

  return (
    <mesh ref={meshRef} rotation-x={-Math.PI / 2} position={[0, -1.6, 0]} material={mat}>
      <planeGeometry args={[80, 80, 1, 1]} />
    </mesh>
  )
}
