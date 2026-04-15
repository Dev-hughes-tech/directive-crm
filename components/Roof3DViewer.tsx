'use client'

import { useRef, useEffect, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

interface Roof3DViewerProps {
  segments: Array<{
    pitchDegrees: number
    pitch12: number
    azimuthDegrees: number
    orientation: string
    areaSqFt: number
    squares: number
    pitchMultiplier: number
    center: { lat: number; lng: number }
    boundingBox: {
      sw: { lat: number; lng: number }
      ne: { lat: number; lng: number }
    }
    heightFt: number
    rafterCount: number
    rafterLengthFt: number
    plywoodSheets: number
  }>
  building: {
    perimeterFt: number
    footprintSqFt: number
    stories: number
    wallHeightFt: number
    wallAreaSqFt: number
    footprintPolygon: { lat: number; lng: number }[]
  }
  structural: {
    roofType: string
    isHipRoof?: boolean
    totalRafters: number
    totalPlywoodSheets: number
  }
  edges: {
    eaveFt: number
    ridgeFt: number
    hipFt: number
    rakeFt: number
    valleyFt: number
  }
}

const FT_TO_M = 0.3048

function latLngToXZ(
  lat: number,
  lng: number,
  centerLat: number,
  centerLng: number
): { x: number; z: number } {
  const R = 6371000 // Earth radius in meters
  const x = (lng - centerLng) * Math.cos((centerLat * Math.PI) / 180) * (R * Math.PI) / 180
  const z = -((lat - centerLat) * R * Math.PI) / 180
  return { x, z }
}

function pitchColor(pitch: number): THREE.Color {
  if (pitch < 10) return new THREE.Color(0x06b6d4) // cyan — low
  if (pitch < 20) return new THREE.Color(0xf59e0b) // amber — moderate
  return new THREE.Color(0xef4444) // red — steep
}

export default function Roof3DViewer({
  segments,
  building,
  structural,
  edges,
}: Roof3DViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const rafterGroupRef = useRef<THREE.Group | null>(null)
  const wallMeshRef = useRef<THREE.Mesh | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)

  const [showRafters, setShowRafters] = useState(true)
  const [showWalls, setShowWalls] = useState(true)

  useEffect(() => {
    if (!containerRef.current || segments.length === 0) return

    const width = containerRef.current.clientWidth || 600
    const height = containerRef.current.clientHeight || 480

    // Scene setup
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0e14)
    scene.fog = new THREE.FogExp2(0x0a0e14, 0.008)

    // Camera setup
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
    camera.position.set(0, 15, 25)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0
    rendererRef.current = renderer

    containerRef.current.appendChild(renderer.domElement)

    // Lighting
    const ambient = new THREE.AmbientLight(0x334455, 0.6)
    scene.add(ambient)

    const sun = new THREE.DirectionalLight(0xfff4e0, 1.2)
    sun.position.set(10, 20, 10)
    sun.castShadow = true
    sun.shadow.mapSize.width = 2048
    sun.shadow.mapSize.height = 2048
    sun.shadow.camera.far = 100
    scene.add(sun)

    const sky = new THREE.HemisphereLight(0x4488aa, 0x223322, 0.3)
    scene.add(sky)

    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(100, 100)
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x1a2a1a })
    const ground = new THREE.Mesh(groundGeo, groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)

    // Grid lines on ground
    const grid = new THREE.GridHelper(60, 30, 0x1e3a1e, 0x162816)
    grid.position.y = 0.01
    scene.add(grid)

    // Building walls
    const centerLat =
      segments.reduce((s, seg) => s + seg.center.lat, 0) / segments.length
    const centerLng =
      segments.reduce((s, seg) => s + seg.center.lng, 0) / segments.length

    let wallShape: THREE.Shape

    if (building.footprintPolygon && building.footprintPolygon.length >= 3) {
      wallShape = new THREE.Shape()
      building.footprintPolygon.forEach((pt, i) => {
        const { x, z } = latLngToXZ(pt.lat, pt.lng, centerLat, centerLng)
        if (i === 0) wallShape.moveTo(x, -z)
        else wallShape.lineTo(x, -z)
      })
      wallShape.closePath()
    } else {
      // Fallback: rectangle estimated from footprint area
      const side = Math.sqrt(building.footprintSqFt * FT_TO_M * FT_TO_M)
      const halfW = side * 0.6
      const halfD = side * 0.4
      wallShape = new THREE.Shape()
      wallShape.moveTo(-halfW, -halfD)
      wallShape.lineTo(halfW, -halfD)
      wallShape.lineTo(halfW, halfD)
      wallShape.lineTo(-halfW, halfD)
      wallShape.closePath()
    }

    const wallH = building.wallHeightFt * FT_TO_M
    const extrudeSettings = { depth: wallH, bevelEnabled: false }
    const wallGeo = new THREE.ExtrudeGeometry(wallShape, extrudeSettings)
    const wallMat = new THREE.MeshPhongMaterial({
      color: 0xd4b896,
      side: THREE.DoubleSide,
      shininess: 10,
    })
    const walls = new THREE.Mesh(wallGeo, wallMat)
    walls.rotation.x = -Math.PI / 2
    walls.position.y = 0
    walls.castShadow = true
    walls.receiveShadow = true
    wallMeshRef.current = walls
    scene.add(walls)

    // Wall wireframe edges
    const wallEdges = new THREE.EdgesGeometry(wallGeo)
    const wallLineMat = new THREE.LineBasicMaterial({
      color: 0x8b7355,
      opacity: 0.4,
      transparent: true,
    })
    const wallLines = new THREE.LineSegments(wallEdges, wallLineMat)
    wallLines.rotation.x = -Math.PI / 2
    scene.add(wallLines)

    // Roof segments
    const roofGroup = new THREE.Group()

    segments.forEach((seg, i) => {
      const sw = latLngToXZ(
        seg.boundingBox.sw.lat,
        seg.boundingBox.sw.lng,
        centerLat,
        centerLng
      )
      const ne = latLngToXZ(
        seg.boundingBox.ne.lat,
        seg.boundingBox.ne.lng,
        centerLat,
        centerLng
      )

      const segW = Math.abs(ne.x - sw.x) || 3
      const segD = Math.abs(ne.z - sw.z) || 3
      const centerLocal = latLngToXZ(
        seg.center.lat,
        seg.center.lng,
        centerLat,
        centerLng
      )

      const heightM = seg.heightFt * FT_TO_M

      // Main roof plane
      const geo = new THREE.PlaneGeometry(segW, segD, 4, 4)
      const col = pitchColor(seg.pitchDegrees)
      const mat = new THREE.MeshPhongMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: 0.05,
        side: THREE.DoubleSide,
        opacity: 0.85,
        transparent: true,
        shininess: 20,
      })
      const plane = new THREE.Mesh(geo, mat)
      plane.castShadow = true
      plane.receiveShadow = true

      // Rotate: pitch around local X axis, then azimuth around Y
      const pitchRad = (seg.pitchDegrees * Math.PI) / 180
      const azimuthRad = (seg.azimuthDegrees * Math.PI) / 180
      plane.rotation.order = 'YXZ'
      plane.rotation.y = -azimuthRad
      plane.rotation.x = -pitchRad + Math.PI / 2

      plane.position.set(centerLocal.x, heightM, centerLocal.z)
      roofGroup.add(plane)

      // Wireframe overlay on each segment
      const wireGeo = new THREE.WireframeGeometry(geo)
      const wireMat = new THREE.LineBasicMaterial({
        color: col,
        opacity: 0.25,
        transparent: true,
      })
      const wireframe = new THREE.LineSegments(wireGeo, wireMat)
      wireframe.rotation.order = 'YXZ'
      wireframe.rotation.y = -azimuthRad
      wireframe.rotation.x = -pitchRad + Math.PI / 2
      wireframe.position.set(centerLocal.x, heightM + 0.01, centerLocal.z)
      roofGroup.add(wireframe)

      // Rafter lines on the segment
      const numRafters = Math.min(seg.rafterCount, 12)
      const rafterMat = new THREE.LineBasicMaterial({
        color: 0xd4a866,
        opacity: 0.5,
        transparent: true,
      })
      for (let r = 0; r <= numRafters; r++) {
        const u = r / numRafters - 0.5 // -0.5 to 0.5
        const rafterGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(u * segW, -segD / 2, 0),
          new THREE.Vector3(u * segW, segD / 2, 0),
        ])
        const rafter = new THREE.Line(rafterGeo, rafterMat)
        rafter.rotation.order = 'YXZ'
        rafter.rotation.y = -azimuthRad
        rafter.rotation.x = -pitchRad + Math.PI / 2
        rafter.position.set(centerLocal.x, heightM + 0.02, centerLocal.z)
        roofGroup.add(rafter)
      }
    })

    rafterGroupRef.current = roofGroup
    scene.add(roofGroup)

    // Ridge, valley, hip, eave lines
    const ridgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 3 })
    const valleyMat = new THREE.LineBasicMaterial({
      color: 0x22c55e,
      linewidth: 3,
    })
    const hipMat = new THREE.LineBasicMaterial({ color: 0xf97316, linewidth: 3 })
    const eaveMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 2,
    })

    // Eave lines along bottom edges
    segments.forEach((seg) => {
      const sw = latLngToXZ(
        seg.boundingBox.sw.lat,
        seg.boundingBox.sw.lng,
        centerLat,
        centerLng
      )
      const ne = latLngToXZ(
        seg.boundingBox.ne.lat,
        seg.boundingBox.ne.lng,
        centerLat,
        centerLng
      )
      const wallY = wallH + 0.05

      const eavePoints = [
        new THREE.Vector3(sw.x, wallY, sw.z),
        new THREE.Vector3(ne.x, wallY, sw.z),
      ]
      scene.add(
        new THREE.Line(new THREE.BufferGeometry().setFromPoints(eavePoints), eaveMat)
      )
    })

    // Ridge: segments facing opposite directions
    segments.forEach((segA, i) => {
      segments.forEach((segB, j) => {
        if (j <= i) return
        const azDiff = Math.abs(segA.azimuthDegrees - segB.azimuthDegrees)
        if (Math.abs(azDiff - 180) < 30) {
          // Opposite facing = ridge between them
          const centerA = latLngToXZ(
            segA.center.lat,
            segA.center.lng,
            centerLat,
            centerLng
          )
          const centerB = latLngToXZ(
            segB.center.lat,
            segB.center.lng,
            centerLat,
            centerLng
          )
          const heightA = segA.heightFt * FT_TO_M
          const heightB = segB.heightFt * FT_TO_M
          const ridgeY = Math.max(heightA, heightB) + 0.1
          const ridgeMidX = (centerA.x + centerB.x) / 2
          const ridgeMidZ = (centerA.z + centerB.z) / 2
          const ridgeLen =
            Math.sqrt(
              (centerA.x - centerB.x) ** 2 + (centerA.z - centerB.z) ** 2
            ) * 0.4
          const ridgePts = [
            new THREE.Vector3(ridgeMidX - ridgeLen, ridgeY, ridgeMidZ),
            new THREE.Vector3(ridgeMidX + ridgeLen, ridgeY, ridgeMidZ),
          ]
          scene.add(
            new THREE.Line(
              new THREE.BufferGeometry().setFromPoints(ridgePts),
              ridgeMat
            )
          )
        } else if (Math.abs(azDiff - 90) < 40) {
          // Adjacent = valley or hip
          const centerA = latLngToXZ(
            segA.center.lat,
            segA.center.lng,
            centerLat,
            centerLng
          )
          const centerB = latLngToXZ(
            segB.center.lat,
            segB.center.lng,
            centerLat,
            centerLng
          )
          const midX = (centerA.x + centerB.x) / 2
          const midZ = (centerA.z + centerB.z) / 2
          const heightA = segA.heightFt * FT_TO_M
          const hipPts = [
            new THREE.Vector3(midX, wallH + 0.05, midZ),
            new THREE.Vector3(midX, heightA, midZ),
          ]
          scene.add(
            new THREE.Line(
              new THREE.BufferGeometry().setFromPoints(hipPts),
              hipMat
            )
          )
        }
      })
    })

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.screenSpacePanning = false
    controls.minDistance = 5
    controls.maxDistance = 80
    controls.maxPolarAngle = Math.PI / 1.8
    controls.target.set(0, wallH / 2, 0)
    controls.update()
    controlsRef.current = controls

    // Animation loop
    let animId: number
    const animate = () => {
      animId = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    // Resize handler
    const onResize = () => {
      const w = containerRef.current?.clientWidth || 600
      const h = containerRef.current?.clientHeight || 480
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)

    // Cleanup
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', onResize)
      controls.dispose()
      renderer.dispose()
      wallGeo.dispose()
      groundGeo.dispose()
      groundMat.dispose()
      wallMat.dispose()
      wallLineMat.dispose()
      try {
        containerRef.current?.removeChild(renderer.domElement)
      } catch (e) {
        // Element already removed
      }
    }
  }, [segments, building])

  const resetCamera = () => {
    if (!cameraRef.current || !controlsRef.current) return
    const wallH = building.wallHeightFt * FT_TO_M
    cameraRef.current.position.set(0, 15, 25)
    controlsRef.current.target.set(0, wallH / 2, 0)
    controlsRef.current.update()
  }

  const topView = () => {
    if (!cameraRef.current || !controlsRef.current) return
    cameraRef.current.position.set(0, 35, 0.01)
    controlsRef.current.target.set(0, 0, 0)
    controlsRef.current.update()
  }

  const toggleRafters = () => {
    setShowRafters((prev) => {
      if (rafterGroupRef.current) rafterGroupRef.current.visible = !prev
      return !prev
    })
  }

  const toggleWalls = () => {
    setShowWalls((prev) => {
      if (wallMeshRef.current) wallMeshRef.current.visible = !prev
      return !prev
    })
  }

  return (
    <div
      className="relative w-full rounded-xl overflow-hidden border border-cyan/20"
      style={{ height: '480px', background: '#0a0e14' }}
    >
      <div ref={containerRef} className="w-full h-full" />

      {/* Top right controls */}
      <div className="absolute top-3 right-3 flex flex-col gap-2 z-10">
        <button
          onClick={resetCamera}
          className="bg-dark/80 border border-white/20 text-white text-xs px-3 py-1.5 rounded-lg hover:border-cyan/50 backdrop-blur-sm transition"
        >
          ⊙ Reset View
        </button>
        <button
          onClick={topView}
          className="bg-dark/80 border border-white/20 text-white text-xs px-3 py-1.5 rounded-lg hover:border-cyan/50 backdrop-blur-sm transition"
        >
          ▦ Top View
        </button>
        <button
          onClick={toggleRafters}
          className={`text-xs px-3 py-1.5 rounded-lg backdrop-blur-sm border transition-all ${
            showRafters
              ? 'bg-cyan/20 border-cyan/50 text-cyan'
              : 'bg-dark/80 border-white/20 text-white'
          }`}
        >
          ▦ Rafters
        </button>
        <button
          onClick={toggleWalls}
          className={`text-xs px-3 py-1.5 rounded-lg backdrop-blur-sm border transition-all ${
            showWalls
              ? 'bg-cyan/20 border-cyan/50 text-cyan'
              : 'bg-dark/80 border-white/20 text-white'
          }`}
        >
          ⬜ Walls
        </button>
      </div>

      {/* Legend bottom-left */}
      <div className="absolute bottom-3 left-3 bg-dark/80 backdrop-blur-sm border border-white/10 rounded-lg p-2 z-10">
        <p className="text-[9px] text-gray-400 uppercase tracking-wide mb-1.5">
          Pitch
        </p>
        <div className="space-y-1">
          {[
            ['#06b6d4', 'Low (<10°)'],
            ['#f59e0b', 'Medium (10-20°)'],
            ['#ef4444', 'Steep (>20°)'],
          ].map(([color, label]) => (
            <div key={label as string} className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 rounded-sm"
                style={{
                  backgroundColor: color as string,
                  opacity: 0.8,
                }}
              />
              <span className="text-[9px] text-gray-300">{label}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 space-y-1">
          {[
            ['#ffffff', 'Ridge'],
            ['#22c55e', 'Valley'],
            ['#f97316', 'Hip'],
            ['#38bdf8', 'Eave'],
          ].map(([color, label]) => (
            <div key={label as string} className="flex items-center gap-1.5">
              <div
                className="w-4 h-0.5"
                style={{ backgroundColor: color as string }}
              />
              <span className="text-[9px] text-gray-300">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Drag hint top-left */}
      <div className="absolute top-3 left-3 bg-dark/60 backdrop-blur-sm rounded-lg px-2 py-1 z-10">
        <p className="text-[9px] text-gray-400">
          🖱 Drag to rotate • Scroll to zoom • Right-drag to pan
        </p>
      </div>
    </div>
  )
}
