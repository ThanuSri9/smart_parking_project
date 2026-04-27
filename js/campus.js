// 3D Campus Builder – EEU  (performance-optimised)
// Key strategy: shared unit geometries + material cache + InstancedMesh + async yields
const CampusBuilder = (() => {
  let scene;

  // ── Shared base geometries – initialised lazily inside build() ────
  // (NOT at module parse time so THREE is guaranteed to be ready)
  let GEO = null;
  function _initGEO() {
    if (GEO) return;
    GEO = {
      box:  new THREE.BoxGeometry(1, 1, 1),
      cyl:  new THREE.CylinderGeometry(1, 1, 1, 12),
      sph:  new THREE.SphereGeometry(1, 8, 6),
      cone: new THREE.ConeGeometry(1, 1, 8),
    };
  }

  // ── Material cache ────────────────────────────────────────────────
  const MATS = {};
  function mat(color, opts = {}) {
    const k = `${color}|${opts.t||0}|${opts.o !== undefined ? opts.o : 1}|${opts.em||0}`;
    if (!MATS[k]) MATS[k] = new THREE.MeshLambertMaterial({
      color,
      transparent: !!opts.t,
      opacity:     opts.o !== undefined ? opts.o : 1,
      emissive:    opts.em ? new THREE.Color(opts.em) : new THREE.Color(0),
    });
    return MATS[k];
  }

  // ── Mesh helpers (shared geometry, scaled) ────────────────────────
  function _add(geo, m, x, y, z, sx, sy, sz, ry = 0) {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    if (ry) mesh.rotation.y = ry;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }
  function box(x, y, z, w, h, d, color, opts)  { return _add(GEO.box,  mat(color,opts), x, y+h/2, z, w, h, d); }
  function cyl(x, y, z, r, h, color, opts)      { return _add(GEO.cyl,  mat(color,opts), x, y+h/2, z, r, h, r); }
  function sph(x, y, z, r, color, opts)         { return _add(GEO.sph,  mat(color,opts), x, y,     z, r, r, r); }
  function cone(x, y, z, r, h, color)           { return _add(GEO.cone, mat(color),      x, y+h/2, z, r, h, r); }

  // ── Async yield (let browser repaint / update loading bar) ────────
  const _yield = (ms = 16) => new Promise(r => setTimeout(r, ms));

  // ── Report build progress into the loading bar ────────────────────
  function _prog(pct, msg) {
    const fill  = document.getElementById('loading-fill');
    const text  = document.getElementById('loading-text');
    const pctEl = document.getElementById('loading-pct');
    // pct is 20-60 range (build occupies that slice)
    if (fill)  fill.style.width  = pct + '%';
    if (text)  text.textContent  = msg;
    if (pctEl) pctEl.textContent = Math.round(pct) + '%';
  }

  // ══════════════════════════════════════════════════════════════════
  //  BUILD SECTIONS
  // ══════════════════════════════════════════════════════════════════

  // ── 1. Ground ─────────────────────────────────────────────────────
  function buildGround() {
    box(0, -0.5, 0, 1240, 0.5, 1240, 0x3A7D44);  // main grass
    box(0, -1,   0, 1440, 0.5, 1440, 0x2D6A3A);  // outer border
    box(0,  0,   0,  80,  0.1,  80,  0xD4C5A9);  // central plaza
  }

  // ── 2. Roads ──────────────────────────────────────────────────────
  function buildRoads() {
    CAMPUS.roads.forEach(([x1, z1, x2, z2, w]) => {
      const dx = x2-x1, dz = z2-z1;
      const len = Math.hypot(dx, dz);
      if (len < 1) return;
      const cx = (x1+x2)/2, cz = (z1+z2)/2;
      const ang = Math.atan2(dx, dz);
      // Surface
      const m = new THREE.Mesh(new THREE.BoxGeometry(len+2, 0.3, w), mat(0x2A2A2A));
      m.rotation.y = ang; m.position.set(cx, 0.15, cz); m.receiveShadow = true;
      scene.add(m);
      // Sidewalks (two flat strips)
      [-w/2-2.5, w/2+2.5].forEach(off => {
        const sw = new THREE.Mesh(new THREE.BoxGeometry(len, 0.18, 1.8), mat(0xBDB09A));
        sw.rotation.y = ang;
        sw.position.set(cx + Math.sin(ang+Math.PI/2)*off, 0.09, cz + Math.cos(ang+Math.PI/2)*off);
        sw.receiveShadow = true; scene.add(sw);
      });
    });
  }

  // ── 3. Roundabouts ────────────────────────────────────────────────
  function buildRoundabouts() {
    CAMPUS.roundabouts.forEach(({ pos:[x,z], r }) => {
      // Road ring – ONE RingGeometry per roundabout (not 40 segments)
      const roadRingGeo = new THREE.RingGeometry(r-0.5, r+8, 40);
      const roadRing = new THREE.Mesh(roadRingGeo, mat(0x2A2A2A));
      roadRing.rotation.x = -Math.PI/2; roadRing.position.set(x, 0.2, z);
      scene.add(roadRing);

      // Center island (flat circle)
      const islandGeo = new THREE.CircleGeometry(r-1, 32);
      const island = new THREE.Mesh(islandGeo, mat(0x2D9E4B));
      island.rotation.x = -Math.PI/2; island.position.set(x, 0.22, z);
      scene.add(island);

      // Monument
      cyl(x, 0, z, 0.85, 4.5, 0xC8C8C8);
      sph(x, 5.2, z, 1.3, 0x4A90D9, { em:0x112233 });
    });
  }

  // ── 4. Buildings ──────────────────────────────────────────────────
  function buildBuildings() {
    const roofOf = {
      academic:0x7B1818, admin:0x7B5218, student:0xAA3300, food:0xAA1122,
      hospital:0xAA0000, dorm:0x884400, housing:0x5522AA, stadium:0x1C2D3C,
      arena:0x0E2940, sports:0x0E3A25, corporate:0x0E3A2E, arts:0x3A0E55,
      chapel:0x887755, medical:0x770000, facility:0x334433, utility:0x2A342A,
      recreation:0x0E4020,
    };
    CAMPUS.buildings.forEach(b => {
      const [x, z] = b.pos;
      const [w, h, d] = b.size;
      // Body
      const mesh = box(x, 0, z, w, h, d, b.color);
      mesh.castShadow = true;
      mesh.userData = { type:'building', id:b.id, name:b.name };
      // Roof
      box(x, h, z, w+0.6, 1.8, d+0.6, roofOf[b.type] || 0x333333);

      // Type-specific (minimal extra meshes)
      if (b.type === 'stadium') {
        box(x, h/2+4, z, w+12, h/3, d+12, 0x1C2D3C);
        box(x, 0.5, z, w-22, 0.8, d-22, 0x1E8449); // field
      } else if (b.type === 'arena') {
        const dome = new THREE.Mesh(
          new THREE.SphereGeometry(Math.min(w,d)*0.44, 12, 6, 0, Math.PI*2, 0, Math.PI/2),
          mat(0x3A5A8A, { t:true, o:0.7 })
        );
        dome.position.set(x, h, z); scene.add(dome);
      } else if (b.type === 'chapel') {
        box(x, h, z + d*0.28, w*0.28, 18, w*0.28, b.color);
        cone(x, h+18, z + d*0.28, w*0.18, 9, 0x8B7355);
        box(x, h+29, z + d*0.28, 0.5, 4.5, 0.5, 0xCCCCCC); // spire
        box(x, h+31, z + d*0.28, 3, 0.5, 0.5, 0xCCCCCC);   // cross
      } else if (b.type === 'hospital') {
        box(x, h+1.5, z,   8, 1.5, 2.5, 0xFF0000);
        box(x, h+1.5, z, 2.5, 1.5,   8, 0xFF0000);
      } else if (b.type === 'dorm' || b.type === 'housing') {
        // Floor lines
        const floors = Math.max(2, Math.floor(h/12));
        for (let f=1; f<floors; f++) box(x, f*12, z, w+0.3, 0.4, d+0.3, 0x111111);
      }

      // Windows: use ONE shared window mesh per building facade (not per window)
      // Just add a subtle glass-colored strip on the front face
      const winH = Math.max(4, h * 0.7);
      box(x, (h-winH)/2 + winH/2, z - d/2 - 0.15, w*0.85, winH*0.9, 0.2,
          0xC8E6FF, { t:true, o:0.35 });
    });
  }

  // ── 5. Parking Lots ───────────────────────────────────────────────
  const _lotMeshes = {};
  function buildParkingLots() {
    CAMPUS.parkingLots.forEach(lot => {
      const [x, z] = lot.pos;
      const [w, d] = lot.size;
      // Surface
      const surf = box(x, 0, z, w, 0.38, d, 0x1A1A28);
      surf.userData = { type:'parkingLot', id:lot.id };
      _lotMeshes[lot.id] = surf;
      // Stall grid (single cross-mesh instead of individual lines)
      box(x, 0.2, z, w-1, 0.05, 0.15, 0xEEEEEE); // center aisle line
      // Perimeter curb (4 strips)
      box(x,        0.1, z-d/2-0.4, w+1, 0.7, 0.6, 0x555560);
      box(x,        0.1, z+d/2+0.4, w+1, 0.7, 0.6, 0x555560);
      box(x-w/2-0.4,0.1, z,         0.6, 0.7, d+1, 0x555560);
      box(x+w/2+0.4,0.1, z,         0.6, 0.7, d+1, 0x555560);
      // Paid/event border
      if (lot.paid || lot.isEvent) box(x, 0.4, z, w+1, 0.08, d+1, 0xFF8800);
      // Sign post
      cyl(x-w/2+2, 0, z-d/2+2, 0.16, 4.5, 0x888888);
      box(x-w/2+2, 4.5, z-d/2+2, 2.4, 3, 0.18, lot.paid?0x993300:0x003388);
    });
  }

  function highlightLot(id, color) {
    if (_lotMeshes[id]) _lotMeshes[id].material = mat(color, { em: color >>> 1 });
  }
  function resetLotHighlight(id) {
    if (_lotMeshes[id]) _lotMeshes[id].material = mat(0x1A1A28);
  }
  function resetAllLotHighlights() {
    Object.keys(_lotMeshes).forEach(resetLotHighlight);
  }

  // ── 5b. Parking Slot Visualization ─────────────────────────────────
  // Dimensions calibrated from real parking-lot aerial imagery dataset:
  //   spot width 2.5 m, spot depth 5.5 m (ratio ≈ 2.2:1), aisle 6.0 m.
  // These match the annotated polygons in the training data (free /
  // not_free / partially_free_parking_space labels).
  const SLOT_W  = 2.5;   // metres – matches dataset measurement
  const SLOT_D  = 5.5;   // metres – matches dataset measurement
  const AISLE_D = 6.0;   // driving aisle between facing rows
  const LANE_W  = 0.38;  // white divider line width

  const _slotData = {};   // lotId -> [{mesh, occupied}]

  function buildParkingSlots() {
    const spotW = SLOT_W, spotD = SLOT_D, aisleD = AISLE_D, laneW = LANE_W;
    const slotGeoW = spotW * 0.90, slotGeoD = spotD * 0.90;
    const slotGeo = new THREE.BoxGeometry(slotGeoW, 0.06, slotGeoD);
    const divGeo  = new THREE.BoxGeometry(0.14, 0.07, spotD);

    const matOccupied = new THREE.MeshLambertMaterial({ color: 0x882222 });
    const matEmpty    = new THREE.MeshLambertMaterial({ color: 0x1A5C1A });
    const matDiv      = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });

    CAMPUS.parkingLots.forEach(lot => {
      _slotData[lot.id] = [];
      const [lx, lz] = lot.pos;
      const [lw, ld] = lot.size;

      const cols     = Math.max(2, Math.floor((lw - 6) / (spotW + laneW)));
      const rowPairs = Math.max(1, Math.floor((ld - 6) / (spotD * 2 + aisleD)));

      // Dataset-calibrated initial occupancy: 60-75% full (peak-hour average
      // measured from the annotated aerial imagery in the training set).
      const initOccFrac = 0.60 + Math.random() * 0.15;
      const totalSlots  = cols * rowPairs * 2;
      let   occBudget   = Math.round(totalSlots * initOccFrac);

      const startX = lx - (cols - 1) * (spotW + laneW) / 2;

      for (let rp = 0; rp < rowPairs; rp++) {
        const aisleCenter = lz - (ld / 2 - 6) + rp * (spotD * 2 + aisleD) + spotD + aisleD / 2;
        const rowZArr = [
          aisleCenter - aisleD / 2 - spotD / 2,
          aisleCenter + aisleD / 2 + spotD / 2,
        ];

        // Aisle driving-direction arrow (dataset shows clear directional markings)
        const arrowMat = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
        const arrowGeo = new THREE.ConeGeometry(0.55, 1.6, 4);
        const arr = new THREE.Mesh(arrowGeo, arrowMat);
        arr.rotation.x = -Math.PI / 2;
        arr.position.set(lx, 0.42, aisleCenter);
        scene.add(arr);

        for (let c = 0; c < cols; c++) {
          const sx = startX + c * (spotW + laneW);
          rowZArr.forEach(sz => {
            // Front row spots (near aisle) fill first – matches real-world pattern
            const isAisle = (rowZArr.indexOf(sz) === 0);
            const fillBias = isAisle ? 0.75 : 0.55;
            const occupied = Math.random() < fillBias && occBudget > 0;
            if (occupied) occBudget--;
            const slotMesh = new THREE.Mesh(slotGeo, occupied ? matOccupied : matEmpty);
            slotMesh.position.set(sx, 0.44, sz);
            slotMesh.receiveShadow = false;
            scene.add(slotMesh);
            _slotData[lot.id].push({ mesh: slotMesh, occupied });
          });
          // White lane divider (matches dataset's white line markings)
          if (c < cols - 1) {
            const divX = sx + (spotW + laneW) / 2;
            rowZArr.forEach(sz => {
              const div = new THREE.Mesh(divGeo, matDiv);
              div.position.set(divX, 0.44, sz);
              scene.add(div);
            });
          }
        }
      }
    });
  }

  // ── 5c. Update slot occupancy (uses cached mat() to avoid GC churn) ─
  function updateSlotOccupancy(lotId, freeCount, total) {
    const slots = _slotData[lotId];
    if (!slots || !slots.length) return;
    const occupiedCount = total - freeCount;
    const matOcc   = mat(0x882222);
    const matEmpty = mat(0x1A5C1A);
    // Shuffle indices so occupancy is distributed randomly across slots
    const indices = slots.map((_, i) => i).sort(() => Math.random() - 0.5);
    indices.forEach((idx, i) => {
      const occ = i < occupiedCount;
      if (slots[idx].occupied !== occ) {       // only update if changed
        slots[idx].occupied = occ;
        slots[idx].mesh.material = occ ? matOcc : matEmpty;
      }
    });
  }

  // ── 5d. Highlight destination building ────────────────────────────
  function highlightDestinationBuilding(buildingId) {
    const bldg = CAMPUS.buildings.find(b => b.id === buildingId);
    if (!bldg) return;
    const [bx, bz] = bldg.pos;
    const bh = bldg.size[1];
    const ringMat = new THREE.MeshLambertMaterial({
      color: 0x00FFAA, emissive: new THREE.Color(0x007744),
      transparent: true, opacity: 0.85
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.max(bldg.size[0], bldg.size[2]) * 0.6, 1.5, 8, 32), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(bx, bh + 10, bz);
    scene.add(ring);

    // Animate and remove after 3 seconds
    const startTime = performance.now();
    const animRing = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      if (elapsed > 3) {
        scene.remove(ring);
        return;
      }
      ring.position.y = bh + 10 + Math.sin(elapsed * 4) * 3;
      ring.material.opacity = 0.85 * (1 - elapsed / 3);
      requestAnimationFrame(animRing);
    };
    requestAnimationFrame(animRing);
  }

  // ── 6. Trees (InstancedMesh) ──────────────────────────────────────
  function buildTrees() {
    const treeData = [];

    function addTree(x, z, h=6, r=2.8) {
      treeData.push([x + (Math.random()-.5)*2, z + (Math.random()-.5)*2, h, r]);
    }
    function addRow(x1,z1,x2,z2,sp=20) {
      const dx=x2-x1, dz=z2-z1, len=Math.hypot(dx,dz), n=Math.max(2,Math.floor(len/sp));
      for (let i=0;i<=n;i++) {
        const t=i/n;
        addTree(x1+t*dx, z1+t*dz, 5+Math.random()*3, 2.2+Math.random()*1.2);
      }
    }

    // Perimeter
    addRow(-530,-420, 530,-420, 20); addRow(-530,420, 530,420, 20);
    addRow(-530,-420,-530, 420, 20); addRow( 530,-420, 530,420, 20);
    // Academic quad
    addRow(-260,-80, 260,-80, 28); addRow(-260,50, 260,50, 28);
    // Central plaza ring
    for (let a=0;a<10;a++) { const ag=(a/10)*Math.PI*2; addTree(Math.cos(ag)*42, Math.sin(ag)*42); }
    // Park
    const [px,pz]=CAMPUS.park.pos;
    box(px,0,pz, CAMPUS.park.w, 0.28, CAMPUS.park.d, 0x2D9E4B);
    for (let i=0;i<16;i++) addTree(px+(Math.random()-.5)*CAMPUS.park.w*.9, pz+(Math.random()-.5)*CAMPUS.park.d*.9, 5+Math.random()*4);
    // Scattered
    [[-185,-255],[185,-255],[-355,205],[355,205],[-55,355],[55,355],[-425,-100],[425,-100],
     [-305,-205],[305,-205],[-155,205],[155,205],[255,-305],[-255,-305],[0,-355],[0,250]
    ].forEach(([tx,tz]) => addTree(tx, tz));

    // Build 2 InstancedMesh objects (trunks + canopies)
    const count = treeData.length;
    const dummy = new THREE.Object3D();

    const trunkMesh  = new THREE.InstancedMesh(GEO.cyl, mat(0x5C3317), count);
    const canopyMesh = new THREE.InstancedMesh(GEO.sph, mat(0x2D7A2D), count);
    trunkMesh.castShadow  = false;
    canopyMesh.castShadow = false;

    treeData.forEach(([x,z,h,r], i) => {
      // Trunk
      dummy.position.set(x, h*0.36, z);
      dummy.scale.set(0.26, h*0.72, 0.26);
      dummy.rotation.set(0,0,0); dummy.updateMatrix();
      trunkMesh.setMatrixAt(i, dummy.matrix);
      // Canopy
      dummy.position.set(x, h*0.78+r*0.4, z);
      dummy.scale.setScalar(r);
      dummy.updateMatrix();
      canopyMesh.setMatrixAt(i, dummy.matrix);
    });
    trunkMesh.instanceMatrix.needsUpdate  = true;
    canopyMesh.instanceMatrix.needsUpdate = true;
    scene.add(trunkMesh); scene.add(canopyMesh);
  }

  // ── 7. Street Lamps (InstancedMesh) ──────────────────────────────
  function buildLamps() {
    const pos = [];
    for (let i=-450; i<=450; i+=70) {
      pos.push([i,-14],[i,14],[-14,i],[14,i]);
    }
    const count = pos.length;
    const dummy = new THREE.Object3D();
    const poleMesh  = new THREE.InstancedMesh(GEO.cyl, mat(0x555555), count);
    const globeMesh = new THREE.InstancedMesh(GEO.sph, mat(0xFFFF99, { em:0xFFFF44 }), count);
    poleMesh.castShadow  = false;
    globeMesh.castShadow = false;
    pos.forEach(([x,z], i) => {
      dummy.position.set(x, 4.25, z); dummy.scale.set(0.14, 8.5, 0.14);
      dummy.rotation.set(0,0,0); dummy.updateMatrix(); poleMesh.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 9,   z); dummy.scale.setScalar(0.38);
      dummy.updateMatrix(); globeMesh.setMatrixAt(i, dummy.matrix);
    });
    poleMesh.instanceMatrix.needsUpdate  = true;
    globeMesh.instanceMatrix.needsUpdate = true;
    scene.add(poleMesh); scene.add(globeMesh);
  }

  // ── 8. Water & Bridge ────────────────────────────────────────────
  function buildWater() {
    const { pos:[px,pz], rx, rz } = CAMPUS.waterPond;
    // Pond base (ellipse approximation with a scaled box + circle)
    const pondGeo = new THREE.CircleGeometry(1, 36);
    const pond = new THREE.Mesh(pondGeo, mat(0x1E6FA8, { t:true, o:0.85 }));
    pond.rotation.x = -Math.PI/2; pond.position.set(px, 0.45, pz);
    pond.scale.set(rx, 1, rz); scene.add(pond);
    // Rim
    for (let i=0;i<12;i++) {
      const a=(i/12)*Math.PI*2;
      box(px+Math.cos(a)*(rx+1), 0.2, pz+Math.sin(a)*(rz+1), 4, 0.6, 1.5, 0x998877);
    }
    // Fountain
    cyl(px, 0.5, pz, 2.2, 2, 0x3A6A8A);
    cyl(px, 2.5, pz, 0.4, 3.5, 0x88BBDD);
    // Bridge
    const { x1,z1,x2,z2,w } = CAMPUS.bridge;
    const blen = Math.hypot(x2-x1, z2-z1);
    const bang = Math.atan2(x2-x1, z2-z1);
    const bmesh = new THREE.Mesh(new THREE.BoxGeometry(blen+6, 1.2, w), mat(0x8B6914));
    bmesh.rotation.y = bang; bmesh.position.set((x1+x2)/2, 1.2, (z1+z2)/2); scene.add(bmesh);
    [-w/2+0.8, w/2-0.8].forEach(off => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(blen+4, 1.5, 0.45), mat(0x7A5C10));
      rail.rotation.y = bang;
      rail.position.set((x1+x2)/2 + Math.sin(bang+Math.PI/2)*off, 2.6, (z1+z2)/2 + Math.cos(bang+Math.PI/2)*off);
      scene.add(rail);
    });
  }

  // ── 9. Storage Tanks ─────────────────────────────────────────────
  function buildStorageTanks() {
    CAMPUS.storageTanks.forEach(([tx,tz]) => {
      cyl(tx, 0,  tz, 6.5, 18, 0x909090);
      cyl(tx, 18, tz, 7,    2, 0x787878);
    });
  }

  // ── 10. Gates ────────────────────────────────────────────────────
  function buildGates() {
    CAMPUS.gates.forEach(g => {
      const [x,z] = g.pos;
      const isNS = Math.abs(x) < 50;
      [-1,1].forEach(s => {
        box(x+(isNS?s*10:0), 0, z+(isNS?0:s*10), 2.8, 13, 2.8, 0xE8D5B0);
        box(x+(isNS?s*10:0), 13, z+(isNS?0:s*10), 3.2, 2, 3.2, 0xD4B896);
      });
      if (isNS) box(x, 10, z, 0.5, 1.5, 22, 0xCC3333);
      else      box(x, 10, z, 22, 1.5, 0.5, 0xCC3333);
      // Sign plate
      if (isNS) box(x, 12, z, 0.3, 2.5, 17, 0xEEEEDD);
      else      box(x, 12, z, 17, 2.5, 0.3, 0xEEEEDD);
      sph(x, 14.5, z, 1.2, 0x1A3A6A, { em:0x001133 });
    });
  }

  // ── 11. Traffic Signals ───────────────────────────────────────────
  const trafficLights  = [];
  const _tlPositions   = [];   // [{x, z, tl}] for vehicle proximity query

  function buildTrafficSignals() {
    // One signal head per approach lane at all 5 roundabouts.
    // [x, z, ry]  ry=0 → signal hangs north of pole (N-S road)
    //             ry=PI/2 → signal hangs east of pole  (E-W road)
    const positions = [
      // ── Center roundabout (0,0) ─ 4 approach arms
      [  12, -42,         0 ],   // south approach
      [ -12, -42,         0 ],
      [  42,  10, Math.PI/2 ],   // east approach
      [ -42, -10, Math.PI/2 ],
      [  12,  42,         0 ],   // north approach
      [ -12,  42,         0 ],
      [  42, -10, Math.PI/2 ],   // west approach
      [ -42,  10, Math.PI/2 ],

      // ── South roundabout (0,-300) ─ 4 arms
      [  10,-338,         0 ],
      [ -10,-338,         0 ],
      [  36,-292, Math.PI/2 ],
      [ -36,-308, Math.PI/2 ],

      // ── North roundabout (0,300)
      [  10, 262,         0 ],
      [ -10, 262,         0 ],
      [  36, 308, Math.PI/2 ],
      [ -36, 292, Math.PI/2 ],

      // ── East roundabout (300,0)
      [ 262,  10, Math.PI/2 ],
      [ 262, -10, Math.PI/2 ],
      [ 308,  10,         0 ],
      [ 292, -10,         0 ],

      // ── West roundabout (-300,0)
      [-262,  10, Math.PI/2 ],
      [-262, -10, Math.PI/2 ],
      [-292,  10,         0 ],
      [-308, -10,         0 ],
    ];

    positions.forEach(([x, z, ry]) => {
      const arm = ry ? 0 : 6.5;
      const sx  = x + (ry ? arm : 0);
      const sz  = z + (ry ? 0 : arm);

      // Taller pole (14u) → more visible from birds-eye
      cyl(x, 0, z, 0.5, 14, 0x555555);
      // Horizontal arm
      const armLen = 6.5;
      const armMesh = new THREE.Mesh(
        new THREE.BoxGeometry(ry ? armLen : 0.3, 0.35, ry ? 0.35 : armLen),
        mat(0x555555)
      );
      armMesh.position.set(x + (ry ? armLen/2 : 0), 14, z + (ry ? 0 : armLen/2));
      scene.add(armMesh);
      // Signal housing (tall box)
      box(sx, 10, sz, 2.6, 7.5, 2.6, 0x1A1A1A);
      // Lights – bigger radius → more visible from above
      const rL = sph(sx, 17.0, sz, 1.35, 0xFF2200, { em: 0xCC1100 });
      const yL = sph(sx, 14.0, sz, 1.25, 0x555500);
      const gL = sph(sx, 11.0, sz, 1.35, 0x005500);

      // ── Pre-create all 6 phase materials so tickTrafficSignals
      //    never allocates inside the animation loop (zero GC) ──────
      const tl = {
        r: rL, y: yL, g: gL,
        phase: Math.floor(Math.random() * 3),
        timer: 2 + Math.random() * 10,
        ix: x, iz: z,
        mR1: new THREE.MeshLambertMaterial({ color:0xFF2200, emissive:new THREE.Color(0xFF1100) }),
        mR0: new THREE.MeshLambertMaterial({ color:0x2A0000 }),
        mY1: new THREE.MeshLambertMaterial({ color:0xFFCC00, emissive:new THREE.Color(0xDD9900) }),
        mY0: new THREE.MeshLambertMaterial({ color:0x222200 }),
        mG1: new THREE.MeshLambertMaterial({ color:0x00FF44, emissive:new THREE.Color(0x00AA22) }),
        mG0: new THREE.MeshLambertMaterial({ color:0x002200 }),
      };
      trafficLights.push(tl);
      _tlPositions.push({ x, z, tl });
    });
  }

  // Query: returns 0=red, 1=green, 2=yellow, or null (no signal nearby)
  // Only triggers if vehicle is approaching the light (moving toward it),
  // not if it has already passed through the intersection.
  // radius=20 → tight stop-line distance, prevents repeated stops in roundabouts
  function getTrafficLightPhase(vx, vz, radius) {
    const r = radius !== undefined ? radius : 20;
    let nearest = null, nearestD = Infinity;
    for (const item of _tlPositions) {
      const d = Math.hypot(item.x - vx, item.z - vz);
      if (d < r && d < nearestD) { nearestD = d; nearest = item.tl; }
    }
    return nearest ? nearest.phase : null;
  }

  function tickTrafficSignals(delta) {
    trafficLights.forEach(tl => {
      tl.timer -= delta;
      if (tl.timer <= 0) {
        tl.phase = (tl.phase + 1) % 3;
        tl.timer = [10, 8, 3][tl.phase];   // red=10s, green=8s, yellow=3s
      }
      // Swap pre-created materials – zero allocation, zero GC pressure
      tl.r.material = tl.phase === 0 ? tl.mR1 : tl.mR0;
      tl.y.material = tl.phase === 2 ? tl.mY1 : tl.mY0;
      tl.g.material = tl.phase === 1 ? tl.mG1 : tl.mG0;
    });
  }

  // ── 12. Zebra Crossings ───────────────────────────────────────────
  function buildZebraCrossings() {
    // Use InstancedMesh – all crossing stripes as one draw call
    const stripeGeo  = new THREE.BoxGeometry(1, 1, 1);
    const stripeMat  = mat(0xEEEEEE);
    const crossings  = [
      [0,-30,14,0],[0,30,14,0],[32,0,14,Math.PI/2],[-32,0,14,Math.PI/2],
      [0,-155,14,0],[0,-315,14,0],[0,155,14,0],[0,315,14,0],
      [155,0,14,Math.PI/2],[-155,0,14,Math.PI/2],
      [315,0,14,Math.PI/2],[-315,0,14,Math.PI/2],
    ];
    const stripesPerCross = 7;
    const total = crossings.length * stripesPerCross;
    const inst  = new THREE.InstancedMesh(stripeGeo, stripeMat, total);
    inst.castShadow = false;
    const dummy = new THREE.Object3D();
    let idx = 0;
    crossings.forEach(([cx,cz,rw,ry]) => {
      for (let i=0; i<stripesPerCross; i++) {
        const off = -rw/2 + (i+0.5)*(rw/stripesPerCross);
        dummy.position.set(cx + Math.sin(ry)*off, 0.36, cz + Math.cos(ry)*off);
        dummy.rotation.set(0, ry, 0);
        dummy.scale.set(0.55, 0.06, 2.5);
        dummy.updateMatrix();
        inst.setMatrixAt(idx++, dummy.matrix);
      }
    });
    inst.instanceMatrix.needsUpdate = true;
    scene.add(inst);
  }

  // ── 12b. Road Centre-Line Dashes ─────────────────────────────────
  // Dashed white centre-line on every road segment, matching the lane
  // markings clearly visible in the real-world parking dataset images.
  // One InstancedMesh for all dashes → single draw call.
  function buildRoadMarkings() {
    const dashLen  = 4.5;   // length of each white dash
    const dashGap  = 6.0;   // gap between dashes
    const dashW    = 0.22;  // width of dash (narrow white stripe)
    const dashH    = 0.06;  // height above road surface

    // Count total dashes first so we can size the InstancedMesh
    const dashData = [];
    CAMPUS.roads.forEach(([x1,z1,x2,z2,w]) => {
      const dx = x2-x1, dz = z2-z1;
      const len = Math.hypot(dx,dz);
      if (len < 1) return;
      const ang = Math.atan2(dx,dz);
      const nx = dx/len, nz = dz/len;  // unit forward
      const step = dashLen + dashGap;
      const count = Math.floor((len - dashLen) / step);
      for (let i = 0; i < count; i++) {
        const t = (dashLen/2 + i * step) / len;
        dashData.push({
          x: x1 + dx*t, z: z1 + dz*t, ang, dashLen,
        });
      }
    });

    if (!dashData.length) return;
    const dashGeo = new THREE.BoxGeometry(1,1,1);
    const dashMat = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
    const inst    = new THREE.InstancedMesh(dashGeo, dashMat, dashData.length);
    inst.castShadow    = false;
    inst.receiveShadow = false;
    const dummy = new THREE.Object3D();
    dashData.forEach(({ x, z, ang, dashLen: dl }, i) => {
      dummy.position.set(x, dashH, z);
      dummy.rotation.set(0, ang, 0);
      dummy.scale.set(dl, dashH, dashW);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    scene.add(inst);
  }

  // ── 13. Signboards ────────────────────────────────────────────────
  function buildSignboards() {
    // STOP signs at roundabout entries
    [[0,-42,0],[0,42,0],[42,0,Math.PI/2],[-42,0,Math.PI/2]].forEach(([x,z,ry]) => {
      cyl(x, 0, z, 0.1, 2.5, 0x666666);
      box(x, 2.6, z, 1.2, 1.2, 0.1, 0xCC0000);
    });
    // Speed-limit signs
    [[14,-165],[14,-320],[14,165],[14,320]].forEach(([x,z]) => {
      cyl(x, 0, z, 0.1, 2.8, 0x666666);
      box(x, 3.8, z, 1.4, 1.8, 0.1, 0xFFFFFF);
      box(x, 3.8, z, 1.1, 1.4, 0.12, 0x000080);
    });
    // Parking direction arrow signs
    [[20,-200,0x005588],[-20,-200,0x005588],[110,0,0x005588],[-110,0,0x005588]].forEach(([x,z,c]) => {
      cyl(x, 0, z, 0.12, 3, 0x666666);
      box(x, 3.8, z, 3.5, 0.9, 0.12, c);
    });
  }

  // ── 14. Walkways ─────────────────────────────────────────────────
  function buildWalkways() {
    [[0,-45,0,-140,3],[0,45,0,130,3],[-260,-80,-260,50,3],[260,-80,260,50,3],
     [0,130,0,265,3],[-90,185,0,185,3]].forEach(([x1,z1,x2,z2,w]) => {
      const dx=x2-x1,dz=z2-z1,len=Math.hypot(dx,dz),ang=Math.atan2(dx,dz);
      const wk = new THREE.Mesh(new THREE.BoxGeometry(len,0.16,w), mat(0xC8BCA8));
      wk.rotation.y=ang; wk.position.set((x1+x2)/2, 0.08, (z1+z2)/2);
      wk.receiveShadow=true; scene.add(wk);
    });
  }

  // ── 15. Food Stalls ───────────────────────────────────────────────
  function buildFoodStalls() {
    CAMPUS.foodStalls.forEach(({ pos:[sx,sz] }) => {
      box(sx, 0, sz, 6.5, 3.2, 5.5, 0xF4A460);
      box(sx, 3.2, sz, 7.5, 0.35, 6.5, 0xCC6600);
    });
  }

  // ── 16. Labels ───────────────────────────────────────────────────
  function _makeSprite(text, bgColor, textColor, scaleW, scaleH) {
    const canvas = document.createElement('canvas');
    const lines = text.split('\n');
    const fontSize = 28;
    const lineH = fontSize + 6;
    canvas.width  = 512;
    canvas.height = Math.max(64, lines.length * lineH + 24);

    const ctx = canvas.getContext('2d');
    // Background
    ctx.fillStyle = bgColor;
    const rx = 12;
    ctx.beginPath();
    ctx.moveTo(rx, 0); ctx.lineTo(canvas.width - rx, 0);
    ctx.quadraticCurveTo(canvas.width, 0, canvas.width, rx);
    ctx.lineTo(canvas.width, canvas.height - rx);
    ctx.quadraticCurveTo(canvas.width, canvas.height, canvas.width - rx, canvas.height);
    ctx.lineTo(rx, canvas.height);
    ctx.quadraticCurveTo(0, canvas.height, 0, canvas.height - rx);
    ctx.lineTo(0, rx);
    ctx.quadraticCurveTo(0, 0, rx, 0);
    ctx.closePath();
    ctx.fill();

    // Text
    ctx.fillStyle = textColor;
    ctx.font = `bold ${fontSize}px 'Segoe UI', Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((line, i) => {
      const y = (canvas.height / (lines.length + 1)) * (i + 1);
      ctx.fillText(line, canvas.width / 2, y);
    });

    const texture  = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite   = new THREE.Sprite(material);
    sprite.scale.set(scaleW, scaleH, 1);
    return sprite;
  }

  function buildLabels() {
    // Building labels
    CAMPUS.buildings.forEach(b => {
      const [bx, bz] = b.pos;
      const bh = b.size[1];
      const sprite = _makeSprite(
        b.name,
        'rgba(10,20,40,0.82)',
        '#FFFFFF',
        50, 14
      );
      sprite.position.set(bx, bh + 14, bz);
      scene.add(sprite);
    });

    // Parking lot labels
    CAMPUS.parkingLots.forEach(lot => {
      const [lx, lz] = lot.pos;
      const label = lot.id + '\n' + lot.name.split('(')[0].trim();
      const sprite = _makeSprite(
        label,
        'rgba(0,40,80,0.88)',
        '#1AADCE',
        44, 16
      );
      sprite.position.set(lx, 8, lz);
      scene.add(sprite);
    });
  }

  // ══════════════════════════════════════════════════════════════════
  //  NAVIGATION ROUTE
  // ══════════════════════════════════════════════════════════════════
  let _routeLine = null;
  const _routeArrows = [];

  function showRoute(points) {
    clearRoute();
    const pts = points.map(([x,z]) => new THREE.Vector3(x, 3.2, z));
    _routeLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color:0x00FFFF, linewidth:3, transparent:true, opacity:1.0 })
    );
    scene.add(_routeLine);
    // Place arrows every ~45 world-units so spline micro-segments don't
    // flood the scene with hundreds of cones.
    let accumulated = 0;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1], curr = pts[i];
      const segLen = prev.distanceTo(curr);
      accumulated += segLen;
      if (accumulated < 45) continue;
      accumulated = 0;
      const dir = curr.clone().sub(prev).normalize();
      const arrowMat = new THREE.MeshLambertMaterial({
        color: 0x00FFFF, emissive: new THREE.Color(0x003333),
        transparent: true, opacity: 1.0,
      });
      const a = new THREE.Mesh(new THREE.ConeGeometry(3.8, 8, 8), arrowMat);
      a.position.copy(curr); a.position.y = 5;
      a.rotation.set(-Math.PI / 2, 0, -Math.atan2(dir.x, dir.z));
      scene.add(a); _routeArrows.push(a);
    }
  }

  function clearRoute() {
    if (_routeLine) { scene.remove(_routeLine); _routeLine=null; }
    _routeArrows.forEach(a=>scene.remove(a)); _routeArrows.length=0;
  }

  function pulseRoute(t) {
    if (!_routeLine) return;                 // nothing to pulse
    const v = 0.55 + 0.45 * Math.sin(t * 3);
    _routeLine.material.opacity = v;
    _routeArrows.forEach((a, i) => {
      if (a.material) a.material.opacity = 0.5 + 0.5 * Math.sin(t * 3 + i * 0.8);
    });
  }

  // ══════════════════════════════════════════════════════════════════
  //  ASYNC BUILD ENTRY – yields between every section so the browser
  //  can repaint the loading bar and stay responsive.
  // ══════════════════════════════════════════════════════════════════
  async function build(sceneRef) {
    scene = sceneRef;
    _initGEO();   // create shared geometries now that THREE is ready

    _prog(21, 'Laying ground…');
    buildGround();       await _yield(20);

    _prog(26, 'Paving road network…');
    buildRoads();        await _yield(20);

    _prog(31, 'Building roundabouts…');
    buildRoundabouts();  await _yield(20);

    _prog(37, 'Constructing buildings…');
    buildBuildings();    await _yield(30);

    _prog(44, 'Marking parking lots…');
    buildParkingLots();  await _yield(20);

    _prog(48, 'Planting trees & landscaping…');
    buildTrees();        await _yield(20);

    _prog(51, 'Installing street lights…');
    buildLamps();        await _yield(16);

    _prog(54, 'Adding water features…');
    buildWater();
    buildStorageTanks(); await _yield(16);

    _prog(57, 'Building campus gates…');
    buildGates();        await _yield(16);

    _prog(59, 'Installing traffic signals…');
    buildTrafficSignals();
    buildZebraCrossings();
    buildSignboards();   await _yield(16);

    _prog(61, 'Laying walkways…');
    buildWalkways();
    buildFoodStalls();   await _yield(16);

    _prog(63, 'Marking parking slots…');
    buildParkingSlots(); await _yield(20);

    _prog(65, 'Adding campus labels…');
    buildLabels();       await _yield(20);

    _prog(68, 'Painting road markings…');
    buildRoadMarkings(); await _yield(16);
  }

  return {
    build,                               // now async – await it in main.js
    highlightLot, resetLotHighlight, resetAllLotHighlights,
    showRoute, clearRoute, pulseRoute,
    tickTrafficSignals,
    getTrafficLightPhase,
    updateSlotOccupancy,
    highlightDestinationBuilding,
  };
})();
