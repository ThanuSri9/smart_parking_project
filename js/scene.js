// Three.js Scene – Camera, Lighting, Follow Mode
const AppScene = (() => {
  let scene, camera, renderer, controls;
  let autoRotate   = true;
  let rotAngle     = 0.3;          // initial yaw offset
  let followMesh   = null;         // vehicle mesh to chase
  let followMode   = false;

  // Pan-to-point state
  let _panning    = false;
  let _panTarget  = null;   // { x, z, h }

  const CAM_ORBIT_DIST = 900;
  const CAM_ORBIT_H    = 640;
  const LOOK_AT        = new THREE.Vector3(0, 0, 0);

  // ── Init ──────────────────────────────────────────────────────────
  function init() {
    scene    = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 900, 1800);

    const canvas = document.getElementById('campus-canvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    _resize();

    camera = new THREE.PerspectiveCamera(42, canvas.width / canvas.height, 1, 2800);
    _orbitCamera(rotAngle);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping   = true;
    controls.dampingFactor   = 0.08;
    controls.minDistance     = 80;
    controls.maxDistance     = 1500;
    controls.maxPolarAngle   = Math.PI / 2.08;
    controls.target.set(0, 0, 0);

    // Sun
    const sun = new THREE.DirectionalLight(0xFFF5E0, 1.25);
    sun.position.set(350, 700, 250);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near   = 1;
    sun.shadow.camera.far    = 1800;
    sun.shadow.camera.left   = -750; sun.shadow.camera.right = 750;
    sun.shadow.camera.top    =  750; sun.shadow.camera.bottom= -750;
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0xFFFFFF, 0.52));

    // Fill light – use .position.set(), NOT Object.assign (position is read-only on Object3D)
    const fillLight = new THREE.DirectionalLight(0xC8E6FF, 0.35);
    fillLight.position.set(-300, 400, -400);
    scene.add(fillLight);

    window.addEventListener('resize', _resize);

    // Pause auto-rotate while user manually orbits
    renderer.domElement.addEventListener('pointerdown', () => {
      if (autoRotate) { _manualOverride = true; }
      // Cancel panning if user takes manual control
      if (_panning) { _panning = false; _panTarget = null; }
    });

    return { scene, camera, renderer, controls };
  }

  let _manualOverride = false;

  function _orbitCamera(angle) {
    camera.position.set(
      Math.sin(angle) * CAM_ORBIT_DIST,
      CAM_ORBIT_H,
      Math.cos(angle) * CAM_ORBIT_DIST
    );
    camera.lookAt(LOOK_AT);
    controls && controls.target.set(0, 0, 0);
  }

  function _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    if (camera) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
  }

  // ── Pan to point ─────────────────────────────────────────────────
  function panToPoint(x, z, height) {
    const h = (height !== undefined) ? height : 60;
    _panTarget = { x, z, h };
    _panning   = true;
    autoRotate = false;
    followMode = false;
    followMesh = null;
  }

  const _panLookAt = new THREE.Vector3();

  function _tickPanCamera(delta) {
    if (!_panTarget) { _panning = false; return; }
    const { x, z, h } = _panTarget;

    // Target camera position: offset from point at current orbit angle
    const angle = rotAngle;
    const targetPos = new THREE.Vector3(
      x + Math.sin(angle) * 200,
      h + 280,
      z + Math.cos(angle) * 200
    );

    camera.position.lerp(targetPos, delta * 2.0);

    _panLookAt.set(x, 0, z);
    controls.target.lerp(_panLookAt, delta * 2.5);

    // Stop panning when close enough
    if (camera.position.distanceTo(targetPos) < 5) {
      _panning = false;
    }
  }

  // ── Tick (called every frame) ─────────────────────────────────────
  function tick(delta) {
    if (followMode && followMesh) {
      _tickFollowCamera(delta);
    } else if (_panning && _panTarget) {
      _tickPanCamera(delta);
      controls.update();
    } else if (autoRotate && !_manualOverride) {
      rotAngle += delta * 0.055;
      _orbitCamera(rotAngle);
    } else {
      // sync rotAngle from current camera so resume is smooth
      rotAngle = Math.atan2(camera.position.x, camera.position.z);
    }
    controls.update();
    renderer.render(scene, camera);
  }

  // ── Follow Camera ─────────────────────────────────────────────────
  // Smoothly places camera behind-and-above the user vehicle.
  // Includes occlusion avoidance: when a building blocks the line of
  // sight, the camera orbit angle is nudged until the vehicle is visible,
  // then slowly restored to directly behind the vehicle.
  const _followOffset  = new THREE.Vector3();
  const _camTarget     = new THREE.Vector3();
  let   _followYawBias = 0;   // extra orbit angle offset (radians)

  // Fast 2D line-vs-AABB test (XZ plane only).
  // Steps along the camera→vehicle segment; returns true if any building
  // AABB (inflated by 3 units clearance) intersects the line.
  function _isOccluded(camX, camZ, vehX, vehZ) {
    const dx = vehX - camX, dz = vehZ - camZ;
    const steps = Math.max(4, Math.ceil(Math.hypot(dx, dz) / 25));
    for (let i = 1; i < steps; i++) {
      const t  = i / steps;
      const px = camX + dx * t;
      const pz = camZ + dz * t;
      for (const b of CAMPUS.buildings) {
        const hw = b.size[0] * 0.5 + 3;
        const hd = b.size[2] * 0.5 + 3;
        if (px > b.pos[0] - hw && px < b.pos[0] + hw &&
            pz > b.pos[1] - hd && pz < b.pos[1] + hd) {
          return true;
        }
      }
    }
    return false;
  }

  function _tickFollowCamera(delta) {
    const p   = followMesh.position;
    const yaw = followMesh.rotation.y;   // vehicle facing direction

    // ── Occlusion test ────────────────────────────────────────────
    // Sample two candidate swing angles; pick the faster-clearing side.
    const baseYaw  = yaw + _followYawBias;
    const camX = p.x - Math.sin(baseYaw) * 180;
    const camZ = p.z - Math.cos(baseYaw) * 180;

    if (_isOccluded(camX, camZ, p.x, p.z)) {
      // Swing the camera around the obstruction at ~90°/s.
      // Hysteresis: keep swinging in the same direction once started.
      const sign = (_followYawBias >= 0) ? 1 : -1;
      _followYawBias += sign * delta * 1.6;        // ~90°/s swing
      _followYawBias = Math.max(-Math.PI * 0.7, Math.min(Math.PI * 0.7, _followYawBias));
    } else {
      // View is clear — restore toward directly-behind at moderate speed
      _followYawBias *= Math.pow(0.02, delta);     // faster decay back
      if (Math.abs(_followYawBias) < 0.01) _followYawBias = 0;
    }

    // ── Camera position: 220m behind + bias angle, 160m above ────
    // Higher + further back reduces building occlusion frequency.
    const finalYaw = yaw + _followYawBias;
    _followOffset.set(
      p.x - Math.sin(finalYaw) * 220,
      p.y + 160,
      p.z - Math.cos(finalYaw) * 220
    );
    camera.position.lerp(_followOffset, delta * 2.5);

    // ── Look target: ahead of vehicle at mid-height ────────────
    _camTarget.set(
      p.x + Math.sin(yaw) * 30,
      p.y + 3,
      p.z + Math.cos(yaw) * 30
    );
    controls.target.lerp(_camTarget, delta * 3.0);
    controls.update();
  }

  // ── Public API ────────────────────────────────────────────────────
  function stopAutoRotate() {
    autoRotate      = false;
    _manualOverride = false;
  }

  function startAutoRotate() {
    autoRotate      = true;
    _manualOverride = false;
    followMode      = false;
    followMesh      = null;
    _panning        = false;
    _panTarget      = null;
  }

  function setFollowVehicle(mesh) {
    followMesh      = mesh;
    followMode      = !!mesh;
    autoRotate      = false;
    _panning        = false;
    _panTarget      = null;
    _followYawBias  = 0;   // reset occlusion swing when follow starts/stops
  }

  function zoomIn()    { camera.position.multiplyScalar(0.82); }
  function zoomOut()   { camera.position.multiplyScalar(1.20); }
  function resetView() {
    followMode = false; followMesh = null;
    autoRotate = true; _manualOverride = false;
    _panning   = false; _panTarget = null;
    rotAngle   = 0.3;
    _orbitCamera(rotAngle);
    controls.target.set(0, 0, 0);
  }

  function getScene()    { return scene;    }
  function getCamera()   { return camera;   }
  function getRenderer() { return renderer; }
  function getControls() { return controls; }

  // Toggle auto-rotate button state
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('auto-rotate-toggle');
    if (btn) btn.addEventListener('click', () => {
      const on = btn.classList.toggle('active');
      btn.textContent = on ? 'ON' : 'OFF';
      on ? startAutoRotate() : stopAutoRotate();
    });
  });

  return {
    init, tick,
    getScene, getCamera, getRenderer, getControls,
    stopAutoRotate, startAutoRotate,
    setFollowVehicle,
    zoomIn, zoomOut, resetView,
    panToPoint,
  };
})();
