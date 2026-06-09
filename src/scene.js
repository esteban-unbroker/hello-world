import * as THREE from 'three'
import * as CANNON from 'cannon-es'

// Fondo interactivo: primitivas con física (cannon-es) renderizadas con three.js.
// El mouse controla un cuerpo cinemático invisible que empuja a las primitivas.
export function initScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#05070d')
  scene.fog = new THREE.Fog('#05070d', 18, 42)

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100)
  camera.position.set(0, 0, 22)
  camera.lookAt(0, 0, 0)

  // Luces
  scene.add(new THREE.AmbientLight('#5a6b9a', 0.7))
  const key = new THREE.DirectionalLight('#ffffff', 1.6)
  key.position.set(8, 14, 12)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.camera.near = 1
  key.shadow.camera.far = 60
  key.shadow.camera.left = -20
  key.shadow.camera.right = 20
  key.shadow.camera.top = 20
  key.shadow.camera.bottom = -20
  scene.add(key)
  const rim = new THREE.PointLight('#1e90ff', 0.8, 60)
  rim.position.set(-12, -6, 14)
  scene.add(rim)

  // Mundo físico
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -16, 0) })
  world.broadphase = new CANNON.SAPBroadphase(world)
  world.allowSleep = false
  const defaultMat = new CANNON.Material('default')
  world.defaultContactMaterial = new CANNON.ContactMaterial(defaultMat, defaultMat, {
    friction: 0.25,
    restitution: 0.45,
  })

  // Paredes estáticas que mantienen las primitivas a la vista.
  // Los límites (bounds) se recalculan en cada resize según la cámara.
  const bounds = { x: 12, y: 7, z: 6 }
  const walls = {}
  function makeWall(normalX, normalY, normalZ) {
    const body = new CANNON.Body({ type: CANNON.Body.STATIC, material: defaultMat })
    body.addShape(new CANNON.Plane())
    body.quaternion.setFromVectors(
      new CANNON.Vec3(0, 0, 1),
      new CANNON.Vec3(normalX, normalY, normalZ),
    )
    world.addBody(body)
    return body
  }
  walls.floor = makeWall(0, 1, 0)
  walls.ceil = makeWall(0, -1, 0)
  walls.left = makeWall(1, 0, 0)
  walls.right = makeWall(-1, 0, 0)
  walls.back = makeWall(0, 0, 1)
  walls.front = makeWall(0, 0, -1)

  function positionWalls() {
    walls.floor.position.set(0, -bounds.y, 0)
    walls.ceil.position.set(0, bounds.y, 0)
    walls.left.position.set(-bounds.x, 0, 0)
    walls.right.position.set(bounds.x, 0, 0)
    walls.back.position.set(0, 0, -bounds.z)
    walls.front.position.set(0, 0, bounds.z)
  }

  // Primitivas: esferas, cajas y cilindros con colores vivos.
  const palette = ['#1e90ff', '#ff4d6d', '#ffd23f', '#3ddc97', '#b388ff', '#ff8c42']
  const objects = []

  function addBody(body, mesh) {
    body.material = defaultMat
    world.addBody(body)
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)
    objects.push({ body, mesh })
  }

  function rand(min, max) {
    return min + (max - min) * pseudoRandom()
  }
  // PRNG determinista (evita Math.random) para colocar las primitivas.
  let seed = 1337
  function pseudoRandom() {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }

  function spawn() {
    const kind = Math.floor(rand(0, 3))
    const color = palette[Math.floor(rand(0, palette.length))]
    const matMesh = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.35,
      metalness: 0.15,
      emissive: new THREE.Color(color).multiplyScalar(0.06),
    })
    const px = rand(-bounds.x + 2, bounds.x - 2)
    const py = rand(0, bounds.y - 1)
    const pz = rand(-bounds.z + 2, bounds.z - 2)
    let body, mesh

    if (kind === 0) {
      const r = rand(0.6, 1.2)
      body = new CANNON.Body({ mass: r * 2, shape: new CANNON.Sphere(r) })
      mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 24), matMesh)
    } else if (kind === 1) {
      const s = rand(0.7, 1.3)
      const half = new CANNON.Vec3(s, s, s)
      body = new CANNON.Body({ mass: s * 2, shape: new CANNON.Box(half) })
      mesh = new THREE.Mesh(new THREE.BoxGeometry(s * 2, s * 2, s * 2), matMesh)
    } else {
      const r = rand(0.5, 0.9)
      const h = rand(1.2, 2.2)
      body = new CANNON.Body({
        mass: r * 3,
        shape: new CANNON.Cylinder(r, r, h, 16),
      })
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), matMesh)
    }

    body.position.set(px, py, pz)
    body.angularVelocity.set(rand(-2, 2), rand(-2, 2), rand(-2, 2))
    body.linearDamping = 0.1
    body.angularDamping = 0.2
    addBody(body, mesh)
  }

  for (let i = 0; i < 26; i++) spawn()

  // Cuerpo cinemático controlado por el mouse: una esfera que empuja todo.
  const pointerBody = new CANNON.Body({
    type: CANNON.Body.KINEMATIC,
    shape: new CANNON.Sphere(2.2),
    material: defaultMat,
  })
  pointerBody.collisionResponse = true
  world.addBody(pointerBody)
  pointerBody.position.set(0, 0, 40) // fuera de escena hasta que el mouse entre

  const pointerMesh = new THREE.Mesh(
    new THREE.SphereGeometry(2.2, 32, 24),
    new THREE.MeshStandardMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.12,
      roughness: 0.1,
      metalness: 0.6,
    }),
  )
  scene.add(pointerMesh)

  const pointer = new THREE.Vector2(0, 0)
  let pointerActive = false
  const raycaster = new THREE.Raycaster()
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0) // z = 0
  const hit = new THREE.Vector3()
  const target = new THREE.Vector3(0, 0, 40)
  const prevTarget = new THREE.Vector3(0, 0, 40)

  function updatePointerFromEvent(clientX, clientY) {
    pointer.x = (clientX / window.innerWidth) * 2 - 1
    pointer.y = -(clientY / window.innerHeight) * 2 + 1
    raycaster.setFromCamera(pointer, camera)
    if (raycaster.ray.intersectPlane(dragPlane, hit)) {
      target.copy(hit)
      pointerActive = true
    }
  }

  window.addEventListener('pointermove', (e) => updatePointerFromEvent(e.clientX, e.clientY))
  window.addEventListener('pointerdown', (e) => {
    updatePointerFromEvent(e.clientX, e.clientY)
    // Un click da un impulso extra a lo que esté cerca.
    for (const { body } of objects) {
      const dx = body.position.x - target.x
      const dy = body.position.y - target.y
      const dz = body.position.z - target.z
      const d2 = dx * dx + dy * dy + dz * dz
      if (d2 < 36) {
        const f = 60 / (d2 + 1)
        body.applyImpulse(new CANNON.Vec3(dx * f, dy * f + 6, dz * f))
      }
    }
  })
  window.addEventListener('pointerleave', () => {
    pointerActive = false
    target.set(0, 0, 40)
  })
  window.addEventListener('touchend', () => {
    pointerActive = false
    target.set(0, 0, 40)
  })

  // Ajuste de cámara/paredes al tamaño de ventana.
  function resize() {
    const w = window.innerWidth
    const h = window.innerHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()

    // Calcula el área visible en z = 0 para colocar las paredes en el borde.
    const dist = camera.position.z
    const vH = 2 * Math.tan((camera.fov * Math.PI) / 360) * dist
    const vW = vH * camera.aspect
    bounds.x = vW / 2 + 0.5
    bounds.y = vH / 2 + 0.5
    bounds.z = 6
    positionWalls()
  }
  window.addEventListener('resize', resize)
  resize()

  // Bucle: paso físico de tamaño fijo + sincronización de meshes.
  const fixedStep = 1 / 60
  let last = performance.now()
  const tmpQuat = new CANNON.Quaternion()

  function animate(now) {
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now

    // Mueve el cuerpo del puntero con velocidad (kinematic) para que transmita impulso.
    const targetZ = pointerActive ? 0 : 40
    target.z = targetZ
    pointerBody.position.set(target.x, target.y, target.z)
    pointerBody.velocity.set(
      (target.x - prevTarget.x) / fixedStep,
      (target.y - prevTarget.y) / fixedStep,
      0,
    )
    prevTarget.copy(target)
    pointerMesh.position.copy(pointerBody.position)
    pointerMesh.visible = pointerActive

    world.step(fixedStep, dt, 3)

    for (const { body, mesh } of objects) {
      mesh.position.copy(body.position)
      tmpQuat.copy(body.quaternion)
      mesh.quaternion.set(tmpQuat.x, tmpQuat.y, tmpQuat.z, tmpQuat.w)
    }

    renderer.render(scene, camera)
    requestAnimationFrame(animate)
  }
  requestAnimationFrame(animate)
}
