import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

// Color palette weights
const COLORS = [
  { c: new THREE.Color('#00ff44'), w: 40 }, // electric lime
  { c: new THREE.Color('#39ff14'), w: 25 }, // neon green
  { c: new THREE.Color('#00cc33'), w: 20 }, // forest green
  { c: new THREE.Color('#88ffaa'), w: 10 }, // pale mint
  { c: new THREE.Color('#ffffff'), w: 5 },  // pure white
]

function getRandomColor() {
  const sum = COLORS.reduce((a, b) => a + b.w, 0)
  let r = Math.random() * sum
  for (const item of COLORS) {
    if (r < item.w) return item.c
    r -= item.w
  }
  return COLORS[0].c
}

const vs = `
attribute float aSize;
varying vec3 vColor;
void main() {
  vColor = color;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (300.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}
`

const fs = `
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float dist = length(c);
  if (dist > 0.5) discard;
  float alpha = 1.0 - smoothstep(0.1, 0.5, dist);
  gl_FragColor = vec4(vColor, alpha);
}
`

export function AccessGrantedBurst({ active }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const MAX_PARTICLES = isMobile ? 200 : 700 // 600 main + child sparks space

  const meshRef = useRef(null)
  
  // physics state array refs
  const physicsData = useRef(new Float32Array(MAX_PARTICLES * 10)) 
  // Custom format: 
  // [vx, vy, vz, life, decay, baseR, baseG, baseB, isStreamer, sparkTimer]

  const geo = useMemo(() => {   
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES), 1))
    return g
  }, [MAX_PARTICLES])

  const mat = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: vs,
      fragmentShader: fs,
    })
  }, [])

  useEffect(() => {
    return () => {
      geo.dispose()
      mat.dispose()
    }
  }, [geo, mat])

  // Reset physics
  useEffect(() => {
    if (active) {
      const pos = geo.attributes.position.array
      const size = geo.attributes.aSize.array
      const data = physicsData.current

      // Main burst: First 600 particles (or 200 on mobile)
      const count = isMobile ? 200 : 600
      for (let i = 0; i < MAX_PARTICLES; i++) {
        if (i < count) {
          pos[i * 3] = (Math.random() - 0.5) * 0.2
          pos[i * 3 + 1] = (Math.random() - 0.5) * 0.2
          pos[i * 3 + 2] = (Math.random() - 0.5) * 0.2
          
          const theta = Math.random() * Math.PI * 2
          const phi = Math.acos(2 * Math.random() - 1)
          const speed = 0.04 + Math.random() * 0.14
          
          data[i * 10 + 0] = Math.sin(phi) * Math.cos(theta) * speed // vx
          data[i * 10 + 1] = Math.sin(phi) * Math.sin(theta) * speed // vy
          data[i * 10 + 2] = Math.cos(phi) * speed // vz
          data[i * 10 + 3] = Math.random() * 1.0 // life
          data[i * 10 + 4] = 0.008 + Math.random() * 0.01 // decay
          
          const col = getRandomColor()
          data[i * 10 + 5] = col.r
          data[i * 10 + 6] = col.g
          data[i * 10 + 7] = col.b
          
          data[i * 10 + 8] = !isMobile && i < 8 ? 1 : 0 // first 8 are streamers
          if (data[i * 10 + 8]) {
            // Speed up streamers
            data[i * 10 + 0] *= 2.0
            data[i * 10 + 1] *= 2.0
            data[i * 10 + 2] *= 2.0
          }
          data[i * 10 + 9] = 0 // spark timer
        } else {
          // Dead sparks reserve
          data[i * 10 + 3] = 0
        }
      }
      
      geo.attributes.position.needsUpdate = true
      geo.attributes.aSize.needsUpdate = true
      setIsPlaying(true)
      
      // Auto disable after 1.5s
      const tid = setTimeout(() => setIsPlaying(false), 1500)
      return () => clearTimeout(tid)
    }
  }, [active, geo, isMobile, MAX_PARTICLES])

  useFrame(() => {
    if (!isPlaying) return
    
    const pos = geo.attributes.position.array
    const colA = geo.attributes.color.array
    const sizeA = geo.attributes.aSize.array
    const data = physicsData.current

    let sparkIndex = 600 // Start searching for free space after main particles

    for (let i = 0; i < MAX_PARTICLES; i++) {
      let life = data[i * 10 + 3]
      if (life > 0) {
        life -= data[i * 10 + 4]
        data[i * 10 + 3] = life
        
        if (life <= 0) {
          sizeA[i] = 0
          continue
        }

        // Apply drag & gravity
        data[i * 10 + 0] *= 0.985
        data[i * 10 + 1] *= 0.985
        data[i * 10 + 2] *= 0.985
        data[i * 10 + 1] -= 0.0008

        pos[i * 3 + 0] += data[i * 10 + 0]
        pos[i * 3 + 1] += data[i * 10 + 1]
        pos[i * 3 + 2] += data[i * 10 + 2]

        // Color Lerp: fade to black
        const r = data[i * 10 + 5]
        const g = data[i * 10 + 6]
        const b = data[i * 10 + 7]
        const f = Math.max(0, life * life) // burn bright, fade
        
        colA[i * 3 + 0] = r * f
        colA[i * 3 + 1] = g * f
        colA[i * 3 + 2] = b * f

        sizeA[i] = 0.08 + Math.max(0, life) * 0.12

        // Streamer logic
        if (data[i * 10 + 8] === 1 && life > 0.5 && sparkIndex < MAX_PARTICLES && !isMobile) {
          data[i * 10 + 9] += 1
          if (data[i * 10 + 9] >= 3) {
            data[i * 10 + 9] = 0
            
            // Find free spark
            while(sparkIndex < MAX_PARTICLES && data[sparkIndex * 10 + 3] > 0) sparkIndex++
            if (sparkIndex < MAX_PARTICLES) {
              const si = sparkIndex
              pos[si * 3 + 0] = pos[i * 3 + 0]
              pos[si * 3 + 1] = pos[i * 3 + 1]
              pos[si * 3 + 2] = pos[i * 3 + 2]
              
              data[si * 10 + 0] = data[i * 10 + 0] * 0.1 + (Math.random()-0.5)*0.01
              data[si * 10 + 1] = data[i * 10 + 1] * 0.1 + (Math.random()-0.5)*0.01
              data[si * 10 + 2] = data[i * 10 + 2] * 0.1 + (Math.random()-0.5)*0.01
              
              data[si * 10 + 3] = 0.3 + Math.random()*0.1
              data[si * 10 + 4] = 0.02
              
              data[si * 10 + 5] = 0.0
              data[si * 10 + 6] = 1.0
              data[si * 10 + 7] = 0.26
              
              data[si * 10 + 8] = 0 // not a streamer
            }
          }
        }
      } else {
         sizeA[i] = 0
      }
    }

    geo.attributes.position.needsUpdate = true
    geo.attributes.color.needsUpdate = true
    geo.attributes.aSize.needsUpdate = true
  })

  if (!isPlaying) return null

  return (
    <points ref={meshRef} geometry={geo} material={mat} frustumCulled={false} />
  )
}
