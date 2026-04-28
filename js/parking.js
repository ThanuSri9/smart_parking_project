// Parking Management System
const ParkingManager = (() => {
  // Runtime state for each lot
  const state = {};

  // Dataset-calibrated time-of-day occupancy curve.
  // Peak hours (9–14h): 70–82% full; off-peak nights: ~15%.
  function _getTimeBasedOccupancy() {
    const h = new Date().getHours();
    if (h < 6)  return 0.15;
    if (h < 9)  return 0.25 + ((h - 6) / 3) * 0.50;   // ramp up 6–9
    if (h < 14) return 0.75 + Math.random() * 0.07;    // peak 9–14 (75–82%)
    if (h < 17) return 0.75 - ((h - 14) / 3) * 0.25;  // taper 14–17
    if (h < 21) return 0.45 + Math.random() * 0.10;    // evening plateau
    return 0.20;
  }

  function init() {
    const baseFrac = _getTimeBasedOccupancy();
    CAMPUS.parkingLots.forEach(lot => {
      // Vary each lot ±10% around time-of-day baseline, matching dataset spread
      const frac = Math.max(0, Math.min(1, baseFrac + (Math.random() - 0.5) * 0.20));
      const occ  = Math.floor(lot.spots * frac);
      state[lot.id] = {
        ...lot,
        occupied: occ,
        free: lot.spots - occ,
        lastChanged: Date.now(),
      };
    });
    // Drift occupancy every 20 s, biased toward time-of-day target
    setInterval(simulateChanges, 20000);
    // Fast updates for UI
    setInterval(broadcastUpdate, 5000);
  }

  function simulateChanges() {
    const target = _getTimeBasedOccupancy();
    Object.values(state).forEach(lot => {
      const currentFrac = lot.occupied / lot.spots;
      // Drift toward time-of-day target by up to 3 spots, plus small random noise
      const drift = Math.round((target - currentFrac) * lot.spots * 0.15);
      const noise = Math.floor((Math.random() - 0.5) * 4);
      const delta = drift + noise;
      lot.occupied = Math.max(0, Math.min(lot.spots, lot.occupied + delta));
      lot.free = lot.spots - lot.occupied;
      lot.lastChanged = Date.now();
    });
    broadcastUpdate();
  }

  function broadcastUpdate() {
    // Update header stats
    const totalSpots = Object.values(state).reduce((s, l) => s + l.spots, 0);
    const totalFree  = Object.values(state).reduce((s, l) => s + l.free, 0);
    const totalVeh   = totalSpots - totalFree;
    document.getElementById('total-vehicles').textContent  = totalVeh;
    document.getElementById('available-spots').textContent = totalFree;
    document.getElementById('occupied-spots').textContent  = totalVeh;

    // Pass enriched state (with status) so UI lot cards can read lot.status.label/color
    const enriched = {};
    Object.entries(state).forEach(([id, lot]) => {
      enriched[id] = { ...lot, status: _statusLabel(lot) };
    });
    AppUI.onParkingUpdate(enriched);

    // Keep 3D slot markers in sync with live occupancy data
    Object.values(state).forEach(lot => {
      CampusBuilder.updateSlotOccupancy(lot.id, lot.free, lot.spots);
    });
  }

  // getLot returns the live state enriched with a computed `status` object
  // so every caller (UI lot cards, onParkingUpdate, directions panel) can
  // safely read lot.status.label / lot.status.color without extra steps.
  function getLot(id) {
    const lot = state[id];
    if (!lot) return null;
    return { ...lot, status: _statusLabel(lot) };
  }

  function getAllLots() {
    return Object.values(state).map(lot => ({ ...lot, status: _statusLabel(lot) }));
  }

  // Return lots sorted by proximity to building, with availability info
  function getLotsForBuilding(buildingId, includeEvent = false) {
    const lotIds = CAMPUS.buildingParking[buildingId] || [];
    return lotIds
      .map(id => state[id])
      .filter(lot => lot && (includeEvent || !lot.isEvent))
      .map(lot => ({
        ...lot,
        pct: Math.round((lot.free / lot.spots) * 100),
        status: _statusLabel(lot),
      }));
  }

  // Return event lots for a venue, split by paid/free
  function getEventLots(venueId, filter = 'all') {
    const mapping = CAMPUS.eventParking[venueId];
    if (!mapping) return [];
    let ids = [];
    if (filter === 'all')  ids = [...mapping.paid, ...mapping.free];
    if (filter === 'paid') ids = mapping.paid;
    if (filter === 'free') ids = mapping.free;
    return ids
      .map(id => state[id])
      .filter(Boolean)
      .map(lot => ({
        ...lot,
        pct: Math.round((lot.free / lot.spots) * 100),
        status: _statusLabel(lot),
        isPaidLot: mapping.paid.includes(lot.id),
      }));
  }

  function _statusLabel(lot) {
    const pct = (lot.free / lot.spots) * 100;
    if (pct === 0) return { label: 'Full', color: '#e74c3c' };
    if (pct < 15)  return { label: 'Almost Full', color: '#e67e22' };
    if (pct < 50)  return { label: 'Limited', color: '#f39c12' };
    return { label: 'Available', color: '#27ae60' };
  }

  // Reserve a spot (decrement free count, for navigation demo)
  function reserveSpot(lotId) {
    const lot = state[lotId];
    if (lot && lot.free > 0) {
      lot.occupied++;
      lot.free--;
      return true;
    }
    return false;
  }

  return { init, getLot, getAllLots, getLotsForBuilding, getEventLots, reserveSpot };
})();

// ═══════════════════════════════════════════════════════════════════════════════
// ParkingLayout — Structural Spatial Model for Each Parking Lot
//
// Every lot is modelled as a ROAD GRAPH in miniature:
//   Entry gate  →  Main spine lane  →  Aisle lane  →  Slot approach  →  Slot
//
// The vehicle must follow this exact lane sequence — no diagonal shortcuts.
//
// Layout rules:
//   • Spine axis is determined from the angle of the road approach
//     (PP* waypoint relative to lot center).
//   • Aisles are perpendicular to the spine.
//   • Each aisle has slot rows on BOTH sides.
//   • Slots store world position, facing yaw, and occupancy.
//
// Navigation path produced by computePath():
//   [entry_gate] → [spine_start] → [aisle_junction] → [slot_approach] → (SLOT_IN state)
// ═══════════════════════════════════════════════════════════════════════════════
const ParkingLayout = (() => {
  'use strict';

  // ── Standard lot dimensions ─────────────────────────────────────────────────
  const SLOT_W    = 5.5;    // slot width (along aisle, metres)
  const SLOT_D    = 9.5;    // slot depth (perpendicular to aisle, metres)
  const AISLE_W   = 7.0;    // driving aisle width (metres)
  const MARGIN    = 4.0;    // clearance from lot boundary edge

  // Layout registry:  lotId → { spineAxis, gate, spine, aisles, … }
  const _db = new Map();

  // ── INIT ─────────────────────────────────────────────────────────────────────
  function init() {
    CAMPUS.parkingLots.forEach(lot => {
      const layout = _buildLayout(lot);
      _db.set(lot.id, layout);
    });
    _runValidation();
    console.log(`[ParkingLayout] ${_db.size} lot layouts built ✓`);
  }

  // ── LAYOUT BUILDER ────────────────────────────────────────────────────────────
  function _buildLayout(lot) {
    const [lx, lz] = lot.pos;
    const [lw, ld] = lot.size;

    // ── Determine approach direction from PP* waypoint ───────────────────────
    // Compare the waypoint's offset from lot center along each axis.
    // The axis with the LARGER offset → vehicle approaches from that side → spine is OTHER axis.
    const wpKey  = CAMPUS.lotToWaypoint[lot.id];
    const wp     = wpKey ? CAMPUS.waypoints[wpKey] : null;
    const [wx, wz] = wp ? wp.pos : [lx, lz - ld/2 - 5];

    const dz = Math.abs(wz - lz);   // offset along Z axis
    const dx = Math.abs(wx - lx);   // offset along X axis

    // If the waypoint is more displaced in Z → approach from N or S → NS spine
    // If more displaced in X → approach from E or W → EW spine
    const spineAxis = (dz >= dx) ? 'NS' : 'EW';

    // ── Entry gate: project waypoint onto the spine line at the lot boundary ──
    let gate;
    if (spineAxis === 'NS') {
      // Spine runs N-S at x = lx; gate is on N or S edge
      const gateZ = wz < lz ? lz - ld/2 + MARGIN : lz + ld/2 - MARGIN;
      gate = [lx, gateZ];
    } else {
      // Spine runs E-W at z = lz; gate is on E or W edge
      const gateX = wx < lx ? lx - lw/2 + MARGIN : lx + lw/2 - MARGIN;
      gate = [gateX, lz];
    }

    // ── Spine descriptor ─────────────────────────────────────────────────────
    const spine = spineAxis === 'NS'
      ? { axis: 'NS', x: lx, zMin: lz - ld/2 + MARGIN, zMax: lz + ld/2 - MARGIN }
      : { axis: 'EW', z: lz, xMin: lx - lw/2 + MARGIN, xMax: lx + lw/2 - MARGIN };

    // ── Build aisles and slots ────────────────────────────────────────────────
    const aisles = _buildAisles(lx, lz, lw, ld, spineAxis);

    return { lotId: lot.id, lx, lz, lw, ld, spineAxis, gate, spine, aisles };
  }

  // ── AISLE + SLOT BUILDER ──────────────────────────────────────────────────────
  // For NS spine: aisles are E-W lanes at various Z positions;
  //               vehicles drive north/south along spine, then east/west on aisle.
  // For EW spine: aisles are N-S lanes at various X positions.
  //
  function _buildAisles(lx, lz, lw, ld, spineAxis) {
    const aisles = [];

    if (spineAxis === 'NS') {
      // Each aisle + its two slot rows needs: SLOT_D + AISLE_W + SLOT_D vertically
      const rowPairH = SLOT_D * 2 + AISLE_W;
      const available = ld - MARGIN * 2;
      const nAisles   = Math.max(1, Math.floor(available / rowPairH));
      const total     = nAisles * rowPairH;
      const zBase     = lz - total / 2 + SLOT_D;  // centre of first aisle

      const nCols  = Math.max(2, Math.floor((lw - MARGIN * 2) / SLOT_W));
      const xStart = lx - (nCols - 1) * SLOT_W / 2;

      for (let a = 0; a < nAisles; a++) {
        const aisleZ = zBase + a * rowPairH;
        const slots  = [];
        for (let c = 0; c < nCols; c++) {
          const sx = xStart + c * SLOT_W;
          // South row: slot is south of aisle → vehicle drove north along spine,
          //            turned onto aisle, faces south to enter slot
          slots.push({
            id: `${a}_S_${c}`, aisleId: a, col: c, side: 'S',
            x: sx, z: aisleZ - AISLE_W / 2 - SLOT_D / 2,
            facingYaw: Math.PI,   // faces south (into slot from aisle side)
            occupied: false,
          });
          // North row: vehicle faces north to enter slot
          slots.push({
            id: `${a}_N_${c}`, aisleId: a, col: c, side: 'N',
            x: sx, z: aisleZ + AISLE_W / 2 + SLOT_D / 2,
            facingYaw: 0,         // faces north
            occupied: false,
          });
        }
        aisles.push({
          id: a, z: aisleZ,
          xMin: lx - lw / 2 + MARGIN,
          xMax: lx + lw / 2 - MARGIN,
          slots,
        });
      }

    } else {
      // EW spine: aisles are N-S lanes at various X positions
      const colPairW = SLOT_D * 2 + AISLE_W;
      const available = lw - MARGIN * 2;
      const nAisles   = Math.max(1, Math.floor(available / colPairW));
      const total     = nAisles * colPairW;
      const xBase     = lx - total / 2 + SLOT_D;

      const nCols  = Math.max(2, Math.floor((ld - MARGIN * 2) / SLOT_W));
      const zStart = lz - (nCols - 1) * SLOT_W / 2;

      for (let a = 0; a < nAisles; a++) {
        const aisleX = xBase + a * colPairW;
        const slots  = [];
        for (let c = 0; c < nCols; c++) {
          const sz = zStart + c * SLOT_W;
          // West row: slot is west of aisle; vehicle faces west to enter
          slots.push({
            id: `${a}_W_${c}`, aisleId: a, col: c, side: 'W',
            x: aisleX - AISLE_W / 2 - SLOT_D / 2, z: sz,
            facingYaw: -Math.PI / 2,  // faces west
            occupied: false,
          });
          // East row: vehicle faces east
          slots.push({
            id: `${a}_E_${c}`, aisleId: a, col: c, side: 'E',
            x: aisleX + AISLE_W / 2 + SLOT_D / 2, z: sz,
            facingYaw: Math.PI / 2,   // faces east
            occupied: false,
          });
        }
        aisles.push({
          id: a, x: aisleX,
          zMin: lz - ld / 2 + MARGIN,
          zMax: lz + ld / 2 + MARGIN,
          slots,
        });
      }
    }

    return aisles;
  }

  // ── VALIDATION ────────────────────────────────────────────────────────────────
  // Checks graph reachability and lot placement before any vehicle moves.
  function _runValidation() {
    const errs = [];
    const wps = CAMPUS.waypoints;

    // 1. Reachability: BFS from start gate, check all lot waypoints are reachable
    const startKey = CAMPUS.gateToWaypoint[CAMPUS.userStart.gateId];
    if (startKey && wps[startKey]) {
      const visited = new Set([startKey]);
      const queue   = [startKey];
      while (queue.length) {
        const cur = queue.shift();
        for (const nb of (wps[cur]?.links || [])) {
          if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
        }
      }
      for (const [lid, wk] of Object.entries(CAMPUS.lotToWaypoint)) {
        if (!visited.has(wk)) errs.push(`Lot ${lid}: waypoint '${wk}' unreachable from start gate`);
      }
    }

    // 2. No broken graph edges
    for (const [k, node] of Object.entries(wps)) {
      for (const nb of (node.links || [])) {
        if (!wps[nb]) errs.push(`Edge '${k}' → '${nb}': target node missing`);
      }
    }

    // 3. No lot center inside a building
    for (const lot of CAMPUS.parkingLots) {
      for (const bld of CAMPUS.buildings) {
        const hw = bld.size[0] / 2 - 2, hd = bld.size[2] / 2 - 2;
        if (Math.abs(lot.pos[0] - bld.pos[0]) < hw && Math.abs(lot.pos[1] - bld.pos[1]) < hd) {
          errs.push(`Lot ${lot.id} center is inside building '${bld.id}'`);
        }
      }
    }

    // 4. Every lot has at least one aisle
    _db.forEach((layout, lid) => {
      if (!layout.aisles || layout.aisles.length === 0)
        errs.push(`Lot ${lid}: no aisles computed — lot may be too small`);
    });

    errs.length
      ? console.warn('[ParkingLayout] Validation FAILED:\n' + errs.join('\n'))
      : console.log('[ParkingLayout] Graph + lot validation PASSED ✓');
    return errs;
  }

  // ── SLOT ALLOCATION ────────────────────────────────────────────────────────────
  // Claims the first free slot in the target lot.
  // Returns { layout, aisle, slot } or null if lot is full.
  function claimSlot(lotId) {
    const layout = _db.get(lotId);
    if (!layout) return null;
    for (const aisle of layout.aisles) {
      for (const slot of aisle.slots) {
        if (!slot.occupied) {
          slot.occupied = true;
          return { layout, aisle, slot };
        }
      }
    }
    return null;  // lot full
  }

  // ── STRUCTURAL PATH BUILDER ────────────────────────────────────────────────────
  // Returns a dense [x,z] path the vehicle must follow to reach the slot.
  //
  // Path sequence (NS spine example):
  //   curPos → entry_gate → spine_at_gate_level → aisle_junction → slot_approach
  //
  // The path ends at the "slot approach" position (front of slot).
  // The ALIGN + SLOT_IN states in the FSM complete the final manoeuvre.
  //
  function computePath(curX, curZ, lotId, aisle, slot) {
    const layout = _db.get(lotId);
    if (!layout) return [];

    const [gx, gz] = layout.gate;
    const coarse   = [];

    // Step 0: current vehicle position
    coarse.push([curX, curZ]);

    if (layout.spineAxis === 'NS') {
      const spineX = layout.spine.x;
      // Step 1: move to spine X at current Z (lateral alignment)
      coarse.push([spineX, curZ]);
      // Step 2: move to gate Z along spine (enter lot properly)
      coarse.push([spineX, gz]);
      // Step 3: drive along spine (N or S) to the aisle's Z
      coarse.push([spineX, aisle.z]);
      // Step 4: drive along aisle (E or W) to slot's X column
      coarse.push([slot.x, aisle.z]);
      // Step 5: slot approach — just in front of the slot (aisle face)
      //         Aisle face Z = aisle.z ± AISLE_W/2 (depending on side)
      const approachZ = slot.side === 'S'
        ? aisle.z - AISLE_W / 2
        : aisle.z + AISLE_W / 2;
      coarse.push([slot.x, approachZ]);

    } else {
      const spineZ = layout.spine.z;
      // Step 1: align to spine Z at current X
      coarse.push([curX, spineZ]);
      // Step 2: drive to gate X along spine
      coarse.push([gx, spineZ]);
      // Step 3: drive along spine to aisle's X
      coarse.push([aisle.x, spineZ]);
      // Step 4: drive along aisle (N or S) to slot's Z
      coarse.push([aisle.x, slot.z]);
      // Step 5: slot approach — aisle face X
      const approachX = slot.side === 'W'
        ? aisle.x - AISLE_W / 2
        : aisle.x + AISLE_W / 2;
      coarse.push([approachX, slot.z]);
    }

    // Remove trivially duplicate points, then densify
    const deduped = coarse.filter((p, i) =>
      i === 0 || Math.hypot(p[0] - coarse[i-1][0], p[1] - coarse[i-1][1]) > 0.5
    );
    return _densify(deduped, 4);
  }

  function _densify(wps, step) {
    if (wps.length < 2) return wps;
    const out = [];
    for (let i = 0; i < wps.length - 1; i++) {
      const [x1, z1] = wps[i], [x2, z2] = wps[i + 1];
      const dist = Math.hypot(x2-x1, z2-z1);
      const n    = Math.max(1, Math.floor(dist / step));
      out.push([x1, z1]);
      for (let s = 1; s < n; s++) {
        const t = s / n;
        out.push([x1 + (x2-x1)*t, z1 + (z2-z1)*t]);
      }
    }
    out.push(wps[wps.length - 1]);
    return out;
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────────────────
  function getLayout(lotId)  { return _db.get(lotId); }
  function getAllSlots(lotId) {
    const L = _db.get(lotId);
    return L ? L.aisles.flatMap(a => a.slots) : [];
  }

  return { init, claimSlot, computePath, getLayout, getAllSlots };
})();
