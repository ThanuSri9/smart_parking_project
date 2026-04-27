// ═══════════════════════════════════════════════════════════════════════════════
// VehicleController — Road-Centric Driving Simulation
//
// Architecture:
//   · Pure Pursuit steering  — vehicles smoothly track a lookahead point on the
//                               dense waypoint path; heading updates every frame
//   · IDM gap-keeping        — Intelligent Driver Model regulates speed so every
//                               vehicle maintains a safe gap to its leader
//   · FSM parking            — IDLE → NAV → LOT_NAV → ALIGN → SLOT_IN → DONE
//   · Pre-flight validation  — broken graph links and lot-inside-building are
//                               flagged at startup
//   · Right-lane NPC routes  — dense waypoint paths are offset 2.5 u right so
//                               opposing traffic does not appear head-on
// ═══════════════════════════════════════════════════════════════════════════════
const VehicleController = (() => {
  'use strict';

  // ── TUNING ───────────────────────────────────────────────────────────────────
  const USER_V_MAX    = 14;     // peak user speed  (world-units / s ≈ 30 mph)
  const NPC_V_BASE    = 9;      // NPC nominal speed
  const PARK_V_MAX    = 4.0;    // max speed inside lot
  const PARK_V_SLOT   = 1.8;    // creep speed pulling into slot

  // Stanley controller parameters
  const STANLEY_K     = 2.8;    // cross-track gain (higher = stronger lane-keep)
  const WHEELBASE     = 4.5;    // vehicle wheelbase (world units, matches car mesh)
  const MAX_STEER     = 0.40;   // max steering angle (radians ≈ 23°)
  const ROAD_HALF_W   = 12;     // road half-width safety boundary (world units)

  const REACH_R       = 7;      // path-end capture radius (done detection)
  const SLOT_R        = 1.5;    // parking slot capture radius

  // IDM parameters
  const IDM_S0        = 8;      // minimum jam gap (units)
  const IDM_T         = 1.4;    // desired time headway (s)
  const IDM_A         = 4.0;    // max acceleration (units/s²)
  const IDM_B         = 3.5;    // comfortable braking (units/s²)
  const IDM_SCAN      = 38;     // forward scan radius for leader detection

  // Lane / NPC
  const LANE_OFF      = 2.5;    // right-lane offset for NPC routes (units)
  const MAX_NPC       = 18;
  const NPC_DENSE_STEP = 8;     // metres between dense NPC waypoints

  // Colors
  const COLORS = [
    0xE74C3C, 0x3498DB, 0xF1C40F, 0x2ECC71, 0xE67E22,
    0x9B59B6, 0x1ABC9C, 0xECF0F1, 0x34495E, 0xFF6B6B,
    0x45B7D1, 0xFFA07A, 0xC0392B, 0x16A085,
  ];

  // ── MODULE STATE ─────────────────────────────────────────────────────────────
  let scene  = null;

  // User vehicle
  let userMesh  = null;
  let userSpeed = 0;

  // Navigation FSM
  const S = Object.freeze({
    IDLE:'IDLE', NAV:'NAV',
    LOT_NAV:'LOT_NAV', ALIGN:'ALIGN', SLOT_IN:'SLOT_IN', DONE:'DONE',
  });
  let fsmState  = S.IDLE;
  let navRoute  = [];    // dense [x,z] array (from Navigation.getDenseRoute)
  let navIdx    = 0;
  let navLotId  = null;
  let navCb     = null;
  let _tlCooldown   = 0;        // seconds before checking traffic lights again
  let _near100mFired = false;
  let _near100mCb   = null;

  // Parking FSM
  let parkRoute = [];
  let parkIdx   = 0;
  let parkSlot  = null;         // { x, z, yaw }

  // NPC pool
  const npcs  = [];             // { mesh, route, idx, speed, v0, endKey }

  // Parked vehicle registry
  const _parked = {};           // lotId → [{mesh,x,z,occupied}]

  // ── 1. VALIDATION ─────────────────────────────────────────────────────────
  function _validate() {
    const errs = [];
    const wps  = CAMPUS.waypoints;

    // Lot → waypoint mapping completeness
    for (const [lid, wk] of Object.entries(CAMPUS.lotToWaypoint)) {
      if (!wps[wk]) errs.push(`Lot ${lid}: waypoint '${wk}' missing from graph`);
    }

    // No broken edges
    for (const [k, node] of Object.entries(wps)) {
      for (const nb of (node.links || [])) {
        if (!wps[nb]) errs.push(`Edge '${k}' → '${nb}' is broken (target undefined)`);
      }
    }

    // No parking lot inside a building
    for (const lot of CAMPUS.parkingLots) {
      for (const bld of CAMPUS.buildings) {
        const hw = bld.size[0] * 0.5 - 2, hd = bld.size[2] * 0.5 - 2;
        if (Math.abs(lot.pos[0] - bld.pos[0]) < hw &&
            Math.abs(lot.pos[1] - bld.pos[1]) < hd) {
          errs.push(`Lot ${lot.id} center is inside building '${bld.id}'`);
        }
      }
    }

    if (errs.length) {
      console.warn('[VehicleCtrl] Validation issues found:\n' + errs.join('\n'));
    } else {
      console.log('[VehicleCtrl] Graph validation PASSED ✓');
    }
    return errs;
  }

  // ── 2. MESH FACTORY ──────────────────────────────────────────────────────────
  function _carMesh(color, isUser) {
    const sc = isUser ? 1.0 : 0.9;
    const g  = new THREE.Group();

    // Body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(5.5*sc, 2.2*sc, 2.8*sc),
      new THREE.MeshLambertMaterial({ color })
    );
    body.position.y = 1.1 * sc;
    g.add(body);

    // Roof
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(3.0*sc, 1.5*sc, 2.4*sc),
      new THREE.MeshLambertMaterial({ color })
    );
    roof.position.set(-0.3*sc, 2.4*sc, 0);
    g.add(roof);

    // Headlights
    const hlMat = new THREE.MeshLambertMaterial({
      color: 0xFFFF99, emissive: new THREE.Color(0x666622) });
    [-1, 1].forEach(s => {
      const hl = new THREE.Mesh(
        new THREE.BoxGeometry(0.3*sc, 0.5*sc, 0.6*sc), hlMat);
      hl.position.set(2.8*sc, 1.1*sc, s * 0.9*sc);
      g.add(hl);
    });

    // Taillights
    const tlMat = new THREE.MeshLambertMaterial({
      color: 0xFF2200, emissive: new THREE.Color(0x661100) });
    [-1, 1].forEach(s => {
      const tl = new THREE.Mesh(
        new THREE.BoxGeometry(0.3*sc, 0.45*sc, 0.55*sc), tlMat);
      tl.position.set(-2.8*sc, 1.1*sc, s * 0.9*sc);
      g.add(tl);
    });

    // Wheels
    const wMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    [[-1.8, 1.55], [-1.8, -1.55], [1.8, 1.55], [1.8, -1.55]].forEach(([wx, wz]) => {
      const w = new THREE.Mesh(
        new THREE.CylinderGeometry(0.65*sc, 0.65*sc, 0.5*sc, 10), wMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx*sc, 0.65*sc, wz*sc);
      g.add(w);
    });

    // User marker: teal ring on roof
    if (isUser) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.6, 0.22, 8, 20),
        new THREE.MeshLambertMaterial({ color: 0x00FFAA, emissive: new THREE.Color(0x007744) })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, 3.4, 0);
      g.add(ring);
    }

    g.castShadow = true;
    return g;
  }

  // ── 3. PARKED VEHICLE SPAWNER ────────────────────────────────────────────────
  // Uses ParkingLayout as the single source of truth for slot world-positions.
  // Pre-marks a random 60–75 % fraction as occupied directly on the ParkingLayout
  // slot objects so claimSlot() honours them and navigation never targets a
  // visually-occupied spot.
  function _spawnParkedVehicles() {
    const frac = 0.60 + Math.random() * 0.15;   // 60–75 % occupied at peak hour

    CAMPUS.parkingLots.forEach(lot => {
      _parked[lot.id] = [];

      // Authoritative slot list from the structural model
      const allSlots = ParkingLayout.getAllSlots(lot.id);
      if (!allSlots || allSlots.length === 0) return;

      // Shuffle for random occupancy distribution
      const shuffled = allSlots.slice().sort(() => Math.random() - 0.5);
      const nOcc     = Math.floor(shuffled.length * frac);

      shuffled.forEach((slot, i) => {
        const occupied = i < nOcc;

        // Write back into ParkingLayout's live slot object so claimSlot()
        // skips this spot when the user vehicle navigates to the lot.
        slot.occupied = occupied;

        if (occupied) {
          const m = _carMesh(COLORS[Math.floor(Math.random() * COLORS.length)], false);
          m.position.set(slot.x, 1, slot.z);
          m.rotation.y = slot.facingYaw;   // match structural facing direction
          scene.add(m);
          _parked[lot.id].push({ mesh: m, x: slot.x, z: slot.z, occupied: true,  slotId: slot.id });
        } else {
          _parked[lot.id].push({ mesh: null, x: slot.x, z: slot.z, occupied: false, slotId: slot.id });
        }
      });
    });
  }

  // ── 4. STANLEY PATH TRACKING CONTROLLER ──────────────────────────────────────
  // Returns { idx, steer, crossTrack, distToEnd, done }
  //
  // Classic Stanley Method (Thrun et al. 2006):
  //   δ = ψ_e + atan2(k · e_ct,  v + ε)
  //
  // Where:
  //   ψ_e   = heading error:   pathYaw − vehicleYaw   (normalised to ±π)
  //   e_ct  = signed cross-track error: lateral distance from vehicle to the
  //           nearest point on the CURRENT segment (positive = left of travel)
  //   k     = STANLEY_K
  //   v     = current speed
  //   ε     = small constant to prevent divide-by-zero at rest
  //
  // Segment advancement rule (key to road-confinement):
  //   The controller tracks exactly ONE segment at a time: path[idx]→path[idx+1].
  //   It advances idx only when the scalar projection of (vehiclePos − segStart)
  //   onto the segment direction reaches 1.0, i.e. the vehicle has geometrically
  //   PASSED the waypoint's perpendicular plane.
  //   → The vehicle CANNOT shortcut past a waypoint, so corner-cutting
  //     is structurally impossible.
  //
  // Caller applies bicycle model:  Δyaw = (v · tan(δ) / L) · Δt
  //                                 pos += (sin newYaw, cos newYaw) · v · Δt
  //
  function _stanley(px, pz, yaw, path, idx, speed) {

    // ── a) Advance segment index ────────────────────────────────────────────
    while (idx < path.length - 1) {
      const [ax, az] = path[idx];
      const [bx, bz] = path[idx + 1];
      const sdx = bx - ax, sdz = bz - az;
      const slen2 = sdx * sdx + sdz * sdz;
      if (slen2 < 0.01) { idx++; continue; }   // degenerate point, skip
      // Scalar projection t ∈ [0,1]: t≥1 → vehicle has passed waypoint idx+1
      const t = ((px - ax) * sdx + (pz - az) * sdz) / slen2;
      if (t >= 1.0) { idx++; continue; }
      break;
    }

    const last      = path[path.length - 1];
    const distToEnd = Math.hypot(last[0] - px, last[1] - pz);
    const done      = idx >= path.length - 1 && distToEnd < REACH_R;

    if (idx >= path.length - 1) {
      return { idx, steer: 0, crossTrack: 0, distToEnd, done };
    }

    // ── b) Current segment geometry ──────────────────────────────────────────
    const [ax, az] = path[idx];
    const [bx, bz] = path[idx + 1];
    const sdx = bx - ax, sdz = bz - az;
    const slen = Math.hypot(sdx, sdz) || 1;

    // ── c) Path tangent heading  (atan2(Δx, Δz) in our coord system) ─────────
    const pathYaw = Math.atan2(sdx, sdz);

    // ── d) Heading error, normalised to [-π, π] ──────────────────────────────
    let headingErr = pathYaw - yaw;
    while (headingErr >  Math.PI) headingErr -= 2 * Math.PI;
    while (headingErr < -Math.PI) headingErr += 2 * Math.PI;

    // ── e) Cross-track error ─────────────────────────────────────────────────
    // 2-D cross product of segment direction × (vehicle − segStart).
    // Positive  → vehicle is to the LEFT  of the travel direction.
    // Negative  → vehicle is to the RIGHT of the travel direction.
    const crossTrack = (sdx * (pz - az) - sdz * (px - ax)) / slen;

    // ── f) Stanley steering angle ────────────────────────────────────────────
    const EPS   = 0.5;
    const steer = headingErr + Math.atan2(STANLEY_K * crossTrack, speed + EPS);
    const clampedSteer = Math.max(-MAX_STEER, Math.min(MAX_STEER, steer));

    return { idx, steer: clampedSteer, crossTrack, distToEnd, done };
  }

  // ── Project vehicle position onto nearest point of current path segment ──────
  // Used by the on-road legality check: if cross-track error exceeds ROAD_HALF_W
  // (vehicle has somehow jumped off the road), snap it back to the road centre.
  function _projectToPath(px, pz, path, idx) {
    const i  = Math.min(Math.max(idx, 0), path.length - 2);
    const [ax, az] = path[i];
    const [bx, bz] = path[i + 1];
    const sdx = bx - ax, sdz = bz - az;
    const slen2 = sdx * sdx + sdz * sdz;
    if (slen2 < 0.01) return [ax, az];
    const t = Math.max(0, Math.min(1, ((px - ax) * sdx + (pz - az) * sdz) / slen2));
    return [ax + t * sdx, az + t * sdz];
  }

  // ── 5. IDM (Intelligent Driver Model) ───────────────────────────────────────
  // Returns longitudinal acceleration (can be negative = braking).
  function _idm(v, v0, gap, dv) {
    const sStar = IDM_S0 + Math.max(0, v * IDM_T + v * dv / (2 * Math.sqrt(IDM_A * IDM_B)));
    const a = IDM_A * (
      1 - Math.pow(v / Math.max(v0, 0.1), 4) - Math.pow(sStar / Math.max(gap, 0.1), 2)
    );
    return Math.max(-IDM_B * 2.5, Math.min(IDM_A, a));
  }

  // Steer-based speed cap: slow down in proportion to required steering angle.
  // Stanley steer angle ≡ curvature proxy; at MAX_STEER the vehicle is in a
  // tight turn and must creep; at near-zero steer it may run at full speed.
  function _bendCap(steer, vMax) {
    const absS = Math.abs(steer);
    if (absS < 0.04) return vMax;                          // essentially straight
    // Linear taper: full speed at 0 steer → 3.5 units/s at MAX_STEER
    return Math.max(3.5, vMax * (1 - (absS / MAX_STEER) * 0.75));
  }

  // Scan ahead for IDM leader: returns { gap, leaderV }
  function _scanAhead(px, pz, yaw, selfSpeed, skipNpcIdx) {
    let minGap = IDM_SCAN, leaderV = selfSpeed;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);

    // Check NPCs
    for (let i = 0; i < npcs.length; i++) {
      if (i === skipNpcIdx) continue;
      const { mesh, speed } = npcs[i];
      const dx = mesh.position.x - px, dz = mesh.position.z - pz;
      const d  = Math.hypot(dx, dz);
      if (d < 1 || d > IDM_SCAN) continue;
      const fwdDot = (dx/d)*fx + (dz/d)*fz;
      if (fwdDot < 0.60) continue;                    // not meaningfully ahead
      if (Math.abs(dx*fz - dz*fx) > 5) continue;     // different lane
      if (d < minGap) { minGap = d; leaderV = speed; }
    }

    // Check user vehicle
    if (skipNpcIdx !== -999 && userMesh && fsmState === S.NAV) {
      const dx = userMesh.position.x - px, dz = userMesh.position.z - pz;
      const d  = Math.hypot(dx, dz);
      if (d >= 1 && d <= IDM_SCAN) {
        const fwdDot = (dx/d)*fx + (dz/d)*fz;
        if (fwdDot >= 0.60 && Math.abs(dx*fz - dz*fx) <= 5 && d < minGap) {
          minGap = d; leaderV = userSpeed;
        }
      }
    }

    return { gap: minGap, leaderV };
  }

  // ── 6. DENSE ROUTE BUILDER (NPC) ─────────────────────────────────────────────
  // BFS through waypoint graph for NPC routes (A* is used for user via Navigation)
  const MAIN_WP_KEYS = Object.keys(CAMPUS.waypoints).filter(k =>
    !k.startsWith('PP') && !k.startsWith('G_')  &&
    !k.startsWith('APT_') && !k.startsWith('DORM_') &&
    !k.startsWith('HOSP_') && !k.startsWith('SA_') &&
    !k.startsWith('ART_') && !k.startsWith('AS_') &&
    !k.startsWith('EAST_') && !k.startsWith('RES_') &&
    !k.startsWith('PP6_') &&
    k !== 'NS_SPER' && k !== 'NR_NW' && k !== 'SE_ART' &&
    k !== 'PP5_J'   && k !== 'PP13_J' && k !== 'SA_P11' &&
    k !== 'SE_N'    && k !== 'SX_WW'  &&
    k !== 'NR_NESPUR' && k !== 'NR_NE'
  );

  function _randKey() {
    return MAIN_WP_KEYS[Math.floor(Math.random() * MAIN_WP_KEYS.length)];
  }

  function _bfs(startKey, endKey) {
    if (startKey === endKey) return [startKey];
    const visited = new Set([startKey]);
    const queue   = [[startKey, [startKey]]];
    while (queue.length) {
      const [cur, path] = queue.shift();
      for (const nb of (CAMPUS.waypoints[cur]?.links || [])) {
        if (visited.has(nb)) continue;
        const np = [...path, nb];
        if (nb === endKey) return np;
        visited.add(nb);
        queue.push([nb, np]);
      }
    }
    return [startKey]; // fallback: stay put
  }

  // ── Dense right-lane NPC route via Trajectory layer ─────────────────────────
  // Trajectory.generateWithOffset produces arc-interpolated roundabout geometry
  // + right-perpendicular lane offset applied after generation (not before),
  // so the offset preserves circular arc curvature through roundabouts.
  //
  // Fallback (_densifyKeysLinear) is only reached if trajectory.js somehow
  // failed to load — it should never fire in production.
  function _densifyKeysLinear(keys, laneOffset) {
    // Legacy linear densification — kept as last-resort fallback only.
    const pos = keys.map(k => CAMPUS.waypoints[k]?.pos).filter(Boolean);
    if (pos.length < 2) return pos.map(p => p.slice());
    const pts = [];
    for (let i = 0; i < pos.length - 1; i++) {
      const [x1, z1] = pos[i], [x2, z2] = pos[i + 1];
      const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz) || 1;
      const rx = (dz / len) * laneOffset, rz = (-dx / len) * laneOffset;
      const n  = Math.max(1, Math.floor(len / NPC_DENSE_STEP));
      pts.push([x1 + rx, z1 + rz]);
      for (let s = 1; s < n; s++) {
        const t = s / n;
        pts.push([x1 + dx * t + rx, z1 + dz * t + rz]);
      }
    }
    const last = pos[pos.length - 1], prev = pos[pos.length - 2];
    const dx = last[0]-prev[0], dz = last[1]-prev[1], len = Math.hypot(dx,dz)||1;
    pts.push([last[0] + (dz/len)*laneOffset, last[1] + (-dx/len)*laneOffset]);
    return pts;
  }

  function _buildNpcRoute(fromKey) {
    const toKey = _randKey();
    const keys  = _bfs(fromKey, toKey);

    // ── Trajectory layer: arc-correct + right-lane offset ─────────────────────
    // Trajectory.generateWithOffset handles roundabout arc interpolation
    // (ARC_STEP=2) and straight road interpolation (STRAIGHT_STEP=3), then
    // applies the right-lane offset to the DENSE result so arc curvature is
    // preserved.  This is the correct "path → trajectory → controller" pipeline.
    const route = (typeof Trajectory !== 'undefined')
      ? Trajectory.generateWithOffset(keys, LANE_OFF)
      : _densifyKeysLinear(keys, LANE_OFF);   // fallback (should never fire)

    return { route, endKey: toKey };
  }

  // ── 7. NPC SPAWNER ───────────────────────────────────────────────────────────
  function _spawnNPCs() {
    for (let i = 0; i < MAX_NPC; i++) {
      setTimeout(() => {
        const startKey = _randKey();
        const wp       = CAMPUS.waypoints[startKey];
        if (!wp) return;

        const mesh = _carMesh(COLORS[i % COLORS.length], false);
        mesh.position.set(wp.pos[0], 1, wp.pos[1]);
        mesh.rotation.y = Math.random() * Math.PI * 2;
        scene.add(mesh);

        const { route, endKey } = _buildNpcRoute(startKey);
        npcs.push({
          mesh, route, endKey,
          idx:   0,
          speed: NPC_V_BASE * (0.70 + Math.random() * 0.40),
          v0:    NPC_V_BASE * (0.85 + Math.random() * 0.30),
        });
      }, i * 450);  // stagger spawns
    }
  }

  // ── 8. PARKING PATH BUILDER (structural, via ParkingLayout) ─────────────────
  // Delegates entirely to ParkingLayout which holds the authoritative lane model.
  // Path follows: curPos → entry gate → spine lane → aisle lane → slot approach.
  // The ALIGN + SLOT_IN FSM states complete the final manoeuvre into the slot.
  //
  // Returns { path: [[x,z],...], slot: {x,z,yaw,id} }  or  null.
  //
  // ❌ NO FALLBACK: if the lot is full or the structural path cannot be built,
  // we return null and the caller aborts navigation with an error message.
  // The system must NEVER invent a path through open space.
  //
  function _buildParkPath(lotId) {
    // Claim a free slot through the structural spatial model
    const claimed = ParkingLayout.claimSlot(lotId);
    if (!claimed) {
      // Lot is genuinely full — caller will abort navigation and inform the user.
      console.warn(`[VehicleCtrl] Lot '${lotId}' is full — no free slot to claim.`);
      return null;
    }

    const { layout, aisle, slot } = claimed;
    const px = userMesh.position.x, pz = userMesh.position.z;

    // Build the structural lane path through the lot
    const path = ParkingLayout.computePath(px, pz, lotId, aisle, slot);
    if (!path || path.length < 2) {
      // ParkingLayout couldn't produce a valid path — release the claim and abort.
      slot.occupied = false;
      console.error(`[VehicleCtrl] ParkingLayout.computePath returned empty path for lot '${lotId}'.`);
      return null;
    }

    return {
      path,
      slot: { x: slot.x, z: slot.z, yaw: slot.facingYaw, id: slot.id },
    };
  }

  // ── 9. INIT ───────────────────────────────────────────────────────────────────
  function init(sceneRef) {
    scene = sceneRef;
    _validate();

    // User vehicle — placed at start gate
    const startGate = CAMPUS.gates.find(g => g.id === CAMPUS.userStart.gateId);
    userMesh = _carMesh(0x00FF88, true);
    if (startGate) {
      userMesh.position.set(startGate.pos[0], 1, startGate.pos[1]);
      userMesh.rotation.y = startGate.angle ?? Math.PI;
    }
    scene.add(userMesh);

    _spawnParkedVehicles();
    _spawnNPCs();
  }

  // ── 10. PUBLIC NAVIGATION API ────────────────────────────────────────────────
  function startNavigation(route, onArrive, destLotId) {
    if (!route || route.length < 2) return;
    navRoute  = route;
    navIdx    = 0;
    navLotId  = destLotId || null;
    navCb     = onArrive  || null;
    userSpeed = 0;
    fsmState  = S.NAV;
    parkRoute = []; parkIdx = 0; parkSlot = null;
    _tlCooldown = 0;
    _near100mFired = false;
    AppScene.setFollowVehicle(userMesh);
  }

  function stopNavigation() {
    navRoute = []; navIdx = 0; navCb = null; navLotId = null;
    parkRoute = []; parkIdx = 0; parkSlot = null;
    userSpeed = 0; fsmState = S.IDLE; _tlCooldown = 0;
    _near100mFired = false;

    const g = CAMPUS.gates.find(g => g.id === CAMPUS.userStart.gateId);
    if (g) { userMesh.position.set(g.pos[0], 1, g.pos[1]); userMesh.rotation.y = g.angle ?? Math.PI; }
    AppScene.setFollowVehicle(null);
  }

  // ── 11. MAIN TICK ────────────────────────────────────────────────────────────
  function tick(delta) {
    if (delta > 0.15) delta = 0.15;   // guard against tab-unfocus frame spikes
    _tickUser(delta);
    _tickNPCs(delta);
  }

  // ── 12. USER VEHICLE TICK ─────────────────────────────────────────────────────
  function _tickUser(delta) {
    if (fsmState === S.IDLE || fsmState === S.DONE) return;

    const px  = userMesh.position.x;
    const pz  = userMesh.position.z;
    const yaw = userMesh.rotation.y;

    // ── Road navigation (Stanley controller) ─────────────────────────────────
    if (fsmState === S.NAV) {
      if (navRoute.length < 2) { _arrived(); return; }

      // Stanley: strict segment-by-segment tracking — no corner shortcuts possible
      const st = _stanley(px, pz, yaw, navRoute, navIdx, userSpeed);
      navIdx = st.idx;

      // ── Road legality enforcement ─────────────────────────────────────────────
      // Primary: Stanley's cross-track term naturally steers the vehicle back.
      // Secondary: If RoadNetwork confirms the vehicle is completely off-road
      //   (not within ANY defined road corridor), snap position to the nearest
      //   point on the current path segment and log the violation.
      //   This is a hard constraint — vehicles must NEVER navigate off-road.
      {
        const offRoad = typeof RoadNetwork !== 'undefined'
          ? !RoadNetwork.isOnRoad(px, pz)
          : Math.abs(st.crossTrack) > ROAD_HALF_W;
        if (offRoad) {
          const proj = _projectToPath(px, pz, navRoute, navIdx);
          if (proj) {
            console.warn(
              `[VehicleCtrl] Off-road at (${px.toFixed(1)},${pz.toFixed(1)}) — snapping to path.`
            );
            userMesh.position.x = proj[0];
            userMesh.position.z = proj[1];
          }
        }
      }

      // IDM gap-keeping
      const { gap, leaderV } = _scanAhead(px, pz, yaw, userSpeed, -999);
      const idmA = _idm(userSpeed, USER_V_MAX, gap, userSpeed - leaderV);

      // Traffic light compliance (with cooldown to prevent roundabout over-stopping)
      let tlMod = 1.0;
      if (_tlCooldown <= 0) {
        const ph = (typeof CampusBuilder !== 'undefined' && CampusBuilder.getTrafficLightPhase)
          ? CampusBuilder.getTrafficLightPhase(px, pz) : 1;
        if (ph === 0) { tlMod = 0; }
        else if (ph === 2) { tlMod = 0.40; }
        else if (ph === 1) { _tlCooldown = 4.5; }
      } else { _tlCooldown -= delta; }

      // ── Corridor-boundary velocity clamping ───────────────────────────────────
      // As the vehicle drifts toward the road boundary, reduce max speed
      // proportionally so it can't exit the corridor at high speed.
      // Threshold: 75 % of the road half-width.  Beyond that, speed tapers
      // linearly from full speed at 75 % to near-stop at 100 % boundary.
      let corridorMod = 1.0;
      if (typeof RoadNetwork !== 'undefined') {
        const roadInfo = RoadNetwork.isOnRoad(px, pz);
        if (roadInfo) {
          const { crossTrack, halfW } = roadInfo;
          const danger = halfW * 0.75;
          if (crossTrack > danger) {
            corridorMod = Math.max(0.15, 1.0 - (crossTrack - danger) / (halfW - danger));
          }
        }
      }

      // Speed caps — Stanley steer angle is a direct curvature proxy
      const curveCap = _bendCap(st.steer, USER_V_MAX);
      const endCap   = st.distToEnd < 40 ? Math.max(2.5, st.distToEnd * 0.25) : USER_V_MAX;
      const desired  = Math.min(USER_V_MAX, curveCap, endCap) * tlMod * corridorMod;

      // Blended speed update: IDM + proportional controller
      userSpeed = Math.max(0, userSpeed + (idmA * 0.5 + (desired - userSpeed) * 2.0) * delta);

      // Bicycle model: Δyaw = (v · tan(δ) / wheelbase) · Δt
      const omega  = userSpeed * Math.tan(st.steer) / WHEELBASE;
      const newYaw = yaw + omega * delta;
      userMesh.rotation.y  = newYaw;
      userMesh.position.x += Math.sin(newYaw) * userSpeed * delta;
      userMesh.position.z += Math.cos(newYaw) * userSpeed * delta;
      userMesh.position.y  = 1;

      // Progress bar
      const pct = Math.round((navIdx / Math.max(1, navRoute.length - 1)) * 100);
      const bar = document.getElementById('nav-progress-bar');
      if (bar) bar.style.width = Math.min(pct, 100) + '%';

      // 100 m proximity alert
      if (navLotId && !_near100mFired && _near100mCb) {
        const lot = CAMPUS.parkingLots.find(l => l.id === navLotId);
        if (lot && Math.hypot(px - lot.pos[0], pz - lot.pos[1]) < 100) {
          _near100mFired = true; _near100mCb(navLotId);
        }
      }

      // Transition to parking FSM at end of road route
      if (st.done) { navLotId ? _enterPark() : _arrived(); }
      return;
    }

    // ── LOT_NAV: Stanley inside the parking lot ──────────────────────────────
    // Same controller, same bicycle model — the lot's structural path (from
    // ParkingLayout.computePath) is the legal trajectory; Stanley keeps the
    // vehicle on it without shortcuts through other cars or kerbs.
    if (fsmState === S.LOT_NAV) {
      if (parkRoute.length < 2) { fsmState = S.DONE; _arrived(); return; }

      const st = _stanley(px, pz, yaw, parkRoute, parkIdx, userSpeed);
      parkIdx  = st.idx;

      const endCap = st.distToEnd < 12 ? Math.max(1.0, st.distToEnd * 0.25) : PARK_V_MAX;
      userSpeed += (endCap - userSpeed) * Math.min(1, 3.5 * delta);
      userSpeed  = Math.max(0, Math.min(PARK_V_MAX, userSpeed));

      const omega  = userSpeed * Math.tan(st.steer) / WHEELBASE;
      const newYaw = yaw + omega * delta;
      userMesh.rotation.y  = newYaw;
      userMesh.position.x += Math.sin(newYaw) * userSpeed * delta;
      userMesh.position.z += Math.cos(newYaw) * userSpeed * delta;
      userMesh.position.y  = 1;

      if (st.done) { fsmState = S.ALIGN; userSpeed = 0; }
      return;
    }

    // ── ALIGN: rotate in-place to face slot direction ─────────────────────────
    if (fsmState === S.ALIGN) {
      if (!parkSlot) { fsmState = S.DONE; _arrived(); return; }
      userSpeed = 0;
      const diff = ((parkSlot.yaw - yaw) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
      if (Math.abs(diff) < 0.05) {
        userMesh.rotation.y = parkSlot.yaw;
        fsmState = S.SLOT_IN;
      } else {
        userMesh.rotation.y += Math.sign(diff) * Math.min(Math.abs(diff), 2.5 * delta);
      }
      return;
    }

    // ── SLOT_IN: creep forward into the slot ──────────────────────────────────
    if (fsmState === S.SLOT_IN) {
      if (!parkSlot) { fsmState = S.DONE; _arrived(); return; }
      const dx   = parkSlot.x - px, dz = parkSlot.z - pz;
      const dist = Math.hypot(dx, dz);
      if (dist < SLOT_R) {
        userMesh.position.set(parkSlot.x, 1, parkSlot.z);
        userMesh.rotation.y = parkSlot.yaw;
        userSpeed = 0;
        fsmState  = S.DONE;
        _arrived();
      } else {
        userSpeed = Math.min(PARK_V_SLOT, dist * 0.35);
        const toSlot = Math.atan2(dx, dz);
        userMesh.rotation.y  = toSlot;
        userMesh.position.x += Math.sin(toSlot) * userSpeed * delta;
        userMesh.position.z += Math.cos(toSlot) * userSpeed * delta;
        userMesh.position.y  = 1;
      }
    }
  }

  function _enterPark() {
    const result = _buildParkPath(navLotId);
    if (!result || result.path.length < 2) { _arrived(); return; }
    parkRoute = result.path;
    parkSlot  = result.slot;
    parkIdx   = 0;
    fsmState  = S.LOT_NAV;
    userSpeed = Math.min(userSpeed, PARK_V_MAX);
  }

  function _arrived() {
    fsmState  = S.DONE;
    userSpeed = 0;
    AppScene.setFollowVehicle(null);
    if (typeof navCb === 'function') { const cb = navCb; navCb = null; cb(); }
  }

  // ── 13. NPC TICK ──────────────────────────────────────────────────────────────
  function _tickNPCs(delta) {
    npcs.forEach((npc, i) => {
      if (!npc.route || npc.route.length < 2) return;

      const px  = npc.mesh.position.x;
      const pz  = npc.mesh.position.z;
      const yaw = npc.mesh.rotation.y;

      // Regenerate route when exhausted
      if (npc.idx >= npc.route.length - 1) {
        const last = npc.route[npc.route.length - 1];
        if (last && Math.hypot(last[0] - px, last[1] - pz) < REACH_R) {
          const r = _buildNpcRoute(npc.endKey ?? _randKey());
          npc.route  = r.route;
          npc.endKey = r.endKey;
          npc.idx    = 0;
          return;
        }
      }

      // IDM speed regulation
      const { gap, leaderV } = _scanAhead(px, pz, yaw, npc.speed, i);
      const idmA = _idm(npc.speed, npc.v0, gap, npc.speed - leaderV);

      // Traffic light
      const ph = (typeof CampusBuilder !== 'undefined' && CampusBuilder.getTrafficLightPhase)
        ? CampusBuilder.getTrafficLightPhase(px, pz) : 1;
      const tlMod = ph === 0 ? 0 : ph === 2 ? 0.40 : 1.0;

      // Stanley — same road-confined controller used for the user vehicle
      const st   = _stanley(px, pz, yaw, npc.route, npc.idx, npc.speed);
      npc.idx    = st.idx;

      const desired = Math.min(npc.v0, _bendCap(st.steer, npc.v0)) * tlMod;
      npc.speed = Math.max(0, npc.speed + (idmA * 0.4 + (desired - npc.speed) * 1.5) * delta);

      // Bicycle model
      const omega  = npc.speed * Math.tan(st.steer) / WHEELBASE;
      const newYaw = yaw + omega * delta;
      npc.mesh.position.x += Math.sin(newYaw) * npc.speed * delta;
      npc.mesh.position.z += Math.cos(newYaw) * npc.speed * delta;
      npc.mesh.position.y  = 1;
      npc.mesh.rotation.y  = newYaw;
    });
  }

  // ── PUBLIC API ────────────────────────────────────────────────────────────────
  function getUserMesh()           { return userMesh; }
  function setNear100mCallback(fn) { _near100mCb = fn; }
  function getParkedSlots(lotId)   {
    return (_parked[lotId] || []).map(s => ({ x: s.x, z: s.z, occupied: s.occupied, slotId: s.slotId }));
  }

  return {
    init,
    tick,
    startNavigation,
    stopNavigation,
    getUserMesh,
    setNear100mCallback,
    getParkedSlots,
  };
})();
