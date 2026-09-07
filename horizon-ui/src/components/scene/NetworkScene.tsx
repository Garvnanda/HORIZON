import { useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Line, OrbitControls, Text } from '@react-three/drei'
import * as THREE from 'three'
import { NetworkSceneFallback } from './NetworkSceneFallback'

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

type NodeType = 'threat' | 'edge' | 'host' | 'jewel'
interface Node {
  id: string
  label: string
  pos: [number, number, number]
  type: NodeType
  anno?: string
}

const NODES: Node[] = [
  { id: 'atk', label: 'Attacker', pos: [-6.4, 0.4, 1.8], type: 'threat' },
  { id: 'gw', label: 'Gateway', pos: [-4.1, 0.1, 0.4], type: 'edge' },
  { id: 'ws1', label: 'WS-A', pos: [-2.4, 1.2, -1.1], type: 'host', anno: 'Dropbox ↓' },
  { id: 'ws2', label: 'WS-B', pos: [-2.6, -1.2, -0.3], type: 'host' },
  { id: 'srv', label: 'Server', pos: [-0.6, 1.1, -0.5], type: 'host', anno: 'NMAP scan' },
  { id: 'dc', label: 'DC', pos: [-0.9, -1.1, 0.4], type: 'host' },
  { id: 'c2', label: 'C2 relay', pos: [1.4, 0.3, 1.0], type: 'host', anno: 'beacon' },
  { id: 'core', label: 'Crown Jewel', pos: [3.6, 0.0, 0.0], type: 'jewel' },
]
const EDGES: [string, string][] = [
  ['atk', 'gw'], ['gw', 'ws1'], ['gw', 'ws2'], ['ws1', 'srv'],
  ['ws2', 'dc'], ['srv', 'c2'], ['dc', 'c2'], ['c2', 'core'],
]
const KILL_PATH = ['atk', 'gw', 'ws1', 'srv', 'c2', 'core']

const COLOR: Record<NodeType, string> = {
  threat: '#c8422e',
  edge: '#cd7f32',
  host: '#8a6f45',
  jewel: '#5a8fc4',
}

function byId(id: string) {
  return NODES.find((n) => n.id === id)!
}

function NodeMesh({ node, hot, shielded }: { node: Node; hot: boolean; shielded: boolean }) {
  const ref = useRef<THREE.Mesh>(null)
  const halo = useRef<THREE.Mesh>(null)
  const r = node.type === 'jewel' ? 0.26 : node.type === 'threat' ? 0.22 : 0.17
  useFrame(({ clock }) => {
    const p = 1 + 0.06 * Math.sin(clock.elapsedTime * 1.6 + node.pos[0])
    ref.current?.scale.setScalar(p)
    if (halo.current) {
      const mat = halo.current.material as THREE.MeshBasicMaterial
      mat.opacity = (hot ? 0.14 : 0.05) + 0.03 * Math.sin(clock.elapsedTime * 3)
      halo.current.scale.setScalar(p * (hot ? 1.9 : 1.5))
    }
  })
  const color = shielded && node.type === 'jewel' ? '#4e9964' : hot ? '#f0b93a' : COLOR[node.type]
  return (
    <group position={node.pos}>
      <mesh ref={halo}>
        <sphereGeometry args={[r, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.06}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={ref}>
        <sphereGeometry args={[r, 32, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hot ? 0.9 : 0.3}
          roughness={0.3}
          metalness={0.5}
        />
      </mesh>
      <Text
        position={[0, -r - 0.24, 0]}
        fontSize={0.17}
        color={hot ? '#f0b93a' : '#c9bda6'}
        fillOpacity={hot ? 1 : 0.65}
        anchorX="center"
        renderOrder={10}
        material-depthTest={false}
        outlineWidth={0.006}
        outlineColor="#06070a"
      >
        {node.label}
      </Text>
      {node.anno && hot && (
        <Text
          position={[0, r + 0.26, 0]}
          fontSize={0.14}
          color="#e0a355"
          anchorX="center"
          fontStyle="italic"
          renderOrder={10}
          material-depthTest={false}
          outlineWidth={0.006}
          outlineColor="#06070a"
        >
          {node.anno}
        </Text>
      )}
    </group>
  )
}

function Particles({ from, to, hot }: { from: THREE.Vector3; to: THREE.Vector3; hot: boolean }) {
  const ref = useRef<THREE.Points>(null)
  const count = hot ? 10 : 4
  const offsets = useMemo(() => Array.from({ length: count }, () => Math.random()), [count])
  const positions = useMemo(() => new Float32Array(count * 3), [count])
  useFrame(({ clock }) => {
    const g = ref.current?.geometry
    if (!g) return
    for (let i = 0; i < count; i++) {
      const t = (offsets[i] + clock.elapsedTime * (hot ? 0.35 : 0.15)) % 1
      positions[i * 3] = from.x + (to.x - from.x) * t
      positions[i * 3 + 1] = from.y + (to.y - from.y) * t
      positions[i * 3 + 2] = from.z + (to.z - from.z) * t
    }
    g.attributes.position.needsUpdate = true
  })
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={hot ? 0.13 : 0.07}
        color={hot ? '#f0b93a' : '#c9b48c'}
        transparent
        opacity={hot ? 0.95 : 0.4}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  )
}

function Graph({ frontIndex, shielded }: { frontIndex: number; shielded: boolean }) {
  const grp = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (grp.current) grp.current.rotation.y += dt * 0.05
  })
  const hotNodes = new Set(KILL_PATH.slice(0, Math.max(0, frontIndex + 1)))
  const predNodes = new Set(KILL_PATH.slice(frontIndex + 1, frontIndex + 3))

  return (
    <group ref={grp}>
      {EDGES.map(([a, b]) => {
        const A = new THREE.Vector3(...byId(a).pos)
        const B = new THREE.Vector3(...byId(b).pos)
        const ia = KILL_PATH.indexOf(a)
        const ib = KILL_PATH.indexOf(b)
        const onPath = ia >= 0 && ib >= 0 && Math.abs(ia - ib) === 1
        const hot = onPath && Math.min(ia, ib) < frontIndex && !shielded
        const pred = onPath && Math.min(ia, ib) >= frontIndex && !shielded
        return (
          <group key={`${a}-${b}`}>
            <Line
              points={[A, B]}
              color={hot ? '#f0b93a' : pred ? '#8a6020' : '#3a2c15'}
              lineWidth={hot ? 2.4 : pred ? 1.6 : 0.8}
              transparent
              opacity={hot ? 0.9 : pred ? 0.7 : 0.4}
              dashed={pred}
              dashScale={pred ? 3 : 1}
            />
            {(hot || onPath) && <Particles from={A} to={B} hot={hot} />}
          </group>
        )
      })}
      {NODES.map((n) => (
        <NodeMesh key={n.id} node={n} hot={hotNodes.has(n.id) || predNodes.has(n.id)} shielded={shielded} />
      ))}
      {shielded && (
        <mesh position={byId('core').pos}>
          <sphereGeometry args={[0.55, 24, 24]} />
          <meshBasicMaterial
            color="#4e9964"
            transparent
            opacity={0.1}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  )
}

interface Props {
  /** 0..1 progression along the kill chain, from the forecast */
  progression: number
  shielded: boolean
}

export function NetworkScene({ progression, shielded }: Props) {
  const [use3D, setUse3D] = useState(() => webglAvailable())
  if (!use3D) return <NetworkSceneFallback progression={progression} shielded={shielded} />
  return (
    <Scene3D
      progression={progression}
      shielded={shielded}
      onContextLost={() => setUse3D(false)}
    />
  )
}

function Scene3D({
  progression,
  shielded,
  onContextLost,
}: Props & { onContextLost: () => void }) {
  const frontIndex = Math.round(progression * (KILL_PATH.length - 2))
  return (
    <Canvas
      camera={{ position: [-1.3, 1.5, 11], fov: 36 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener(
          'webglcontextlost',
          (e) => {
            e.preventDefault()
            onContextLost()
          },
          false,
        )
      }}
    >
      <color attach="background" args={['#08070b']} />
      <fog attach="fog" args={['#08070b', 11, 21]} />
      <ambientLight intensity={0.5} />
      <pointLight position={[4, 6, 6]} intensity={40} color="#f0b93a" />
      <pointLight position={[-6, -2, -4]} intensity={18} color="#5a8fc4" />
      <group scale={0.82} position={[-1.3, 0, 0]}>
        <Graph frontIndex={frontIndex} shielded={shielded} />
      </group>
      <OrbitControls
        enablePan={false}
        enableZoom={false}
        target={[-1.3, 0.1, 0]}
        minPolarAngle={Math.PI / 3.6}
        maxPolarAngle={Math.PI / 1.95}
      />
    </Canvas>
  )
}
