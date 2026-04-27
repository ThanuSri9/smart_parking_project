// Navigation & Route Finding – EEU Smart Parking
// ─────────────────────────────────────────────────────────────────────────────
// Upgrades over baseline:
//   • Directed A* – one-way roundabout enforcement (CCW only)
//   • Turn-cost penalties  – discourages U-turns and unnecessary turns
//   • findBestLot()        – selects optimal reachable lot from a lot-priority list
//   • Dynamic start gate   – caller may override CAMPUS.userStart.gateId at runtime
// ─────────────────────────────────────────────────────────────────────────────
const Navigation = (() => {

  // ── One-way lookup set (built once from CAMPUS.trafficRules) ──────────────
  // Stores "FROM|TO" strings for every LEGAL one-way directed edge.
  // Traversing the REVERSE of any entry is illegal.
  let _oneWaySet = null;

  function _getOneWaySet() {
    if (_oneWaySet) return _oneWaySet;
    _oneWaySet = new Set();
    const rules = CAMPUS.trafficRules;
    if (rules && Array.isArray(rules.oneWayEdges)) {
      for (const [a, b] of rules.oneWayEdges) {
        _oneWaySet.add(a + '|' + b);
      }
    }
    return _oneWaySet;
  }

  // Returns false when driving from→to violates a one-way restriction.
  function _isEdgeLegal(from, to) {
    const ows = _getOneWaySet();
    // If the REVERSE direction is a registered one-way legal edge,
    // then this (from→to) direction is illegal.
    return !ows.has(to + '|' + from);
  }

  // ── Turn-cost penalty ─────────────────────────────────────────────────────
  // Returns extra distance-units for the heading change prev→cur→nxt.
  // A 90° turn costs ~12.6 units; a U-turn costs ~25 units.
  function _turnCost(prevKey, curKey, nxtKey) {
    if (!prevKey) return 0;
    const factor = CAMPUS.trafficRules?.turnPenaltyFactor ?? 8.0;
    const p1 = CAMPUS.waypoints[prevKey]?.pos;
    const p2 = CAMPUS.waypoints[curKey]?.pos;
    const p3 = CAMPUS.waypoints[nxtKey]?.pos;
    if (!p1 || !p2 || !p3) return 0;

    const inX  = p2[0] - p1[0], inZ  = p2[1] - p1[1];
    const outX = p3[0] - p2[0], outZ = p3[1] - p2[1];
    const lenIn  = Math.hypot(inX, inZ)  || 1;
    const lenOut = Math.hypot(outX, outZ) || 1;
    const cosA = Math.max(-1, Math.min(1,
      (inX * outX + inZ * outZ) / (lenIn * lenOut)
    ));
    return factor * Math.acos(cosA);
  }

  // ── Euclidean heuristic ───────────────────────────────────────────────────
  function _heuristic(aKey, bKey) {
    const a = CAMPUS.waypoints[aKey]?.pos;
    const b = CAMPUS.waypoints[bKey]?.pos;
    if (!a || !b) return 0;
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  }

  // ── Directed A* with turn-cost penalties ──────────────────────────────────
  //
  // State: (currentNode, prevNode)  so turn cost can be evaluated at each step.
  // Edge expansion respects one-way restrictions from CAMPUS.trafficRules.
  // Throws if the graph is disconnected (never silently returns a direct line).
  //
  function findPath(startKey, endKey) {
    if (startKey === endKey) return [startKey];
    if (!CAMPUS.waypoints[startKey] || !CAMPUS.waypoints[endKey]) {
      return [startKey, endKey];
    }

    // gScore keyed by node (we store best-g seen so far per node).
    // cameFrom stores { parent, grandparent } to reconstruct path + turn cost.
    const gScore   = new Map([[startKey, 0]]);
    const cameFrom = new Map();
    const openSet  = new Set([startKey]);
    const fScore   = new Map([[startKey, _heuristic(startKey, endKey)]]);
    const prevOf   = new Map([[startKey, null]]);  // best prev for each node
    const closed   = new Set();

    while (openSet.size > 0) {
      // Pick lowest-fScore node from open set
      let current = null, bestF = Infinity;
      for (const k of openSet) {
        const f = fScore.get(k) ?? Infinity;
        if (f < bestF) { bestF = f; current = k; }
      }

      if (current === endKey) {
        const path = [];
        let k = current;
        while (k !== undefined) {
          path.unshift(k);
          k = cameFrom.get(k)?.parent;
        }
        return path;
      }

      openSet.delete(current);
      closed.add(current);

      const curPrev = prevOf.get(current) ?? null;
      const wp = CAMPUS.waypoints[current];
      if (!wp) continue;

      for (const nb of (wp.links || [])) {
        if (closed.has(nb)) continue;
        if (!_isEdgeLegal(current, nb)) continue;
        const nbWP = CAMPUS.waypoints[nb];
        if (!nbWP) continue;

        const [x1, z1] = wp.pos, [x2, z2] = nbWP.pos;
        const dist    = Math.hypot(x2 - x1, z2 - z1);
        const turn    = _turnCost(curPrev, current, nb);
        const tentG   = (gScore.get(current) ?? Infinity) + dist + turn;

        if (tentG >= (gScore.get(nb) ?? Infinity)) continue;

        cameFrom.set(nb, { parent: current });
        prevOf.set(nb, current);
        gScore.set(nb, tentG);
        fScore.set(nb, tentG + _heuristic(nb, endKey));
        openSet.add(nb);
      }
    }

    throw new Error(
      `[Navigation] A* found no path '${startKey}'→'${endKey}'. ` +
      `Check CAMPUS.waypoints links – graph may be disconnected.`
    );
  }

  // ── Convert waypoint-id path → world positions ────────────────────────────
  function pathToPoints(wpPath) {
    return wpPath
      .map(k => CAMPUS.waypoints[k])
      .filter(Boolean)
      .map(wp => wp.pos);
  }

  // ── Three-layer path validation ───────────────────────────────────────────
  function _validatePath(wpPath) {
    for (let i = 0; i < wpPath.length - 1; i++) {
      const cur = wpPath[i], nxt = wpPath[i + 1];

      if (!CAMPUS.waypoints[cur]) {
        throw new Error(`[Navigation] Waypoint '${cur}' missing from graph`);
      }
      if (!(CAMPUS.waypoints[cur].links || []).includes(nxt)) {
        throw new Error(
          `[Navigation] No road edge '${cur}'→'${nxt}'. Fix CAMPUS.waypoints.`
        );
      }
      // One-way check
      if (!_isEdgeLegal(cur, nxt)) {
        throw new Error(
          `[Navigation] Edge '${cur}'→'${nxt}' violates one-way restriction.`
        );
      }

      if (typeof RoadNetwork !== 'undefined') {
        const [ax, az] = CAMPUS.waypoints[cur].pos;
        const [bx, bz] = CAMPUS.waypoints[nxt].pos;
        if (!RoadNetwork.doesEdgeFollowRoad(ax, az, bx, bz)) {
          throw new Error(
            `[Navigation] Edge '${cur}'→'${nxt}' leaves road surface.`
          );
        }
        if (RoadNetwork.doesEdgeCrossBuilding(ax, az, bx, bz)) {
          throw new Error(
            `[Navigation] Edge '${cur}'→'${nxt}' passes through a building.`
          );
        }
      }
    }
  }

  // ── Get start waypoint key (supports dynamic gate selection) ─────────────
  function _resolveStartWP(gateId) {
    const id  = gateId || CAMPUS.userStart.gateId;
    const key = CAMPUS.gateToWaypoint[id];
    if (!key) {
      throw new Error(
        `[Navigation] Gate '${id}' has no entry in CAMPUS.gateToWaypoint.`
      );
    }
    return key;
  }

  // ── Raw waypoint-key path (validated) ────────────────────────────────────
  function getWpPath(lotId, gateId) {
    const startWP = _resolveStartWP(gateId);
    const endWP   = CAMPUS.lotToWaypoint[lotId];
    if (!endWP) {
      throw new Error(
        `[Navigation] Lot '${lotId}' has no entry in CAMPUS.lotToWaypoint.`
      );
    }
    const wpPath = findPath(startWP, endWP);
    _validatePath(wpPath);
    return wpPath;
  }

  // ── Smart lot selection ───────────────────────────────────────────────────
  //
  // Evaluates every lot in `lotIds` using A* from the current start gate,
  // filters out full lots and unreachable lots, then returns the lot whose
  // legal path has the lowest total cost (distance + turn penalties).
  //
  // If `gateId` is provided it overrides CAMPUS.userStart.gateId for this call.
  //
  function findBestLot(lotIds, gateId) {
    const startWP = _resolveStartWP(gateId);
    let bestLotId = null, bestCost = Infinity, bestPath = null;

    for (const lotId of (lotIds || [])) {
      // Skip full lots
      const lotState = (typeof ParkingManager !== 'undefined')
        ? ParkingManager.getLot(lotId) : null;
      if (lotState && lotState.free === 0) continue;

      const endWP = CAMPUS.lotToWaypoint[lotId];
      if (!endWP || !CAMPUS.waypoints[endWP]) continue;

      try {
        const wpPath = findPath(startWP, endWP);
        // Compute actual A* cost for comparison
        let cost = 0;
        for (let i = 0; i < wpPath.length - 1; i++) {
          const a = CAMPUS.waypoints[wpPath[i]]?.pos;
          const b = CAMPUS.waypoints[wpPath[i+1]]?.pos;
          if (a && b) cost += Math.hypot(b[0]-a[0], b[1]-a[1]);
        }
        if (cost < bestCost) {
          bestCost   = cost;
          bestLotId  = lotId;
          bestPath   = wpPath;
        }
      } catch (_) {
        // Lot unreachable – skip
      }
    }

    return bestLotId ? { lotId: bestLotId, wpPath: bestPath, cost: bestCost } : null;
  }

  // ── Route helpers ─────────────────────────────────────────────────────────
  function getRoute(lotId, gateId) {
    return pathToPoints(getWpPath(lotId, gateId));
  }

  function getDenseRoute(lotId, gateId) {
    const wpKeys = getWpPath(lotId, gateId);
    if (typeof Trajectory !== 'undefined') {
      return Trajectory.generate(wpKeys);
    }
    console.warn('[Navigation] Trajectory not loaded – linear fallback');
    const raw = pathToPoints(wpKeys);
    if (raw.length < 2) return raw;
    const STEP = 3, pts = [];
    for (let i = 0; i < raw.length - 1; i++) {
      const [x1,z1] = raw[i], [x2,z2] = raw[i+1];
      const n = Math.max(1, Math.floor(Math.hypot(x2-x1,z2-z1) / STEP));
      pts.push([x1,z1]);
      for (let s = 1; s < n; s++) {
        const t = s/n;
        pts.push([x1+(x2-x1)*t, z1+(z2-z1)*t]);
      }
    }
    pts.push(raw[raw.length - 1]);
    return pts;
  }

  function getSmoothRoute(lotId, gateId) {
    const raw = getRoute(lotId, gateId);
    if (raw.length < 2) return raw;
    const v3   = raw.map(([x,z]) => new THREE.Vector3(x, 0, z));
    const curve = new THREE.CatmullRomCurve3(v3, false, 'catmullrom', 0.4);
    return curve.getPoints(Math.max(raw.length * 10, 20)).map(p => [p.x, p.z]);
  }

  // ── Step-by-step directions ───────────────────────────────────────────────
  function buildDirections(routePoints, lotId, gateId) {
    const lot  = CAMPUS.parkingLots.find(l => l.id === lotId);
    const gate = CAMPUS.gates.find(g => g.id === (gateId || CAMPUS.userStart.gateId));
    const steps = [];

    if (gate) steps.push(`Enter campus via <strong>${gate.name}</strong>`);

    for (let i = 0; i < routePoints.length - 1; i++) {
      const [x1,z1] = routePoints[i], [x2,z2] = routePoints[i+1];
      const dx = x2-x1, dz = z2-z1, dist = Math.round(Math.hypot(dx,dz));
      if (dist < 8) continue;
      steps.push(`Head <strong>${_cardinalDir(dx,dz)}</strong> on ${_roadName(x1,z1,x2,z2)} (~${dist}m)`);
    }

    if (lot) {
      steps.push(`Arrive at <strong>${lot.name}</strong>`);
      if (lot.timeLimit) steps.push(`⏱ Parking limit: ${lot.timeLimit} minutes`);
      if (lot.paid)      steps.push(`💳 Paid parking – $${lot.rate}/hr`);
      else               steps.push('✅ Free parking');
    }
    return steps;
  }

  function _cardinalDir(dx, dz) {
    const a = Math.atan2(dx, dz) * 180 / Math.PI;
    if (a >= -22.5  && a <  22.5) return 'North';
    if (a >=  22.5  && a <  67.5) return 'Northeast';
    if (a >=  67.5  && a < 112.5) return 'East';
    if (a >= 112.5  && a < 157.5) return 'Southeast';
    if (a >= 157.5  || a <-157.5) return 'South';
    if (a >=-157.5  && a <-112.5) return 'Southwest';
    if (a >=-112.5  && a < -67.5) return 'West';
    return 'Northwest';
  }

  function _roadName(x1, z1, x2, z2) {
    const cx = (x1+x2)/2, cz = (z1+z2)/2;
    if (Math.abs(cx) < 25 && cz < 0)  return 'Main Campus Drive S';
    if (Math.abs(cx) < 25 && cz >= 0) return 'Main Campus Drive N';
    if (Math.abs(cz) < 25 && cx > 0)  return 'Eagle Boulevard E';
    if (Math.abs(cz) < 25 && cx <= 0) return 'Eagle Boulevard W';
    if (cx >  250) return 'East Research Road';
    if (cx < -250) return 'West Faculty Road';
    if (cz >  250) return 'North Athletic Drive';
    if (cz < -250) return 'South Academic Way';
    if (Math.abs(cz - (-300)) < 50) return 'Alumni Drive';
    if (Math.abs(cz -   300)  < 50) return 'Champions Boulevard';
    return 'Campus Ring Road';
  }

  // ── Distance & time estimates ─────────────────────────────────────────────
  function estimateDistance(points) {
    let d = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const [x1,z1] = points[i], [x2,z2] = points[i+1];
      d += Math.hypot(x2-x1, z2-z1);
    }
    return (d / 1609).toFixed(1);
  }

  function estimateTime(points) {
    return `${Math.max(1, Math.round(parseFloat(estimateDistance(points)) * 3))} min`;
  }

  // ── AI Navigation Instructions ────────────────────────────────────────────
  function buildAIInstructions(rawRoute, lotId, gateId) {
    const lot  = CAMPUS.parkingLots.find(l => l.id === lotId);
    const gate = CAMPUS.gates.find(g => g.id === (gateId || CAMPUS.userStart.gateId));
    const msgs = [];

    const h = new Date().getHours();
    const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    msgs.push(`${greet}! 🤖 Best route plotted to <strong>${lot ? lot.name : 'your parking lot'}</strong>.`);

    if (gate) {
      msgs.push(`🚦 Starting from <strong>${gate.name}</strong>. Proceed through the gate slowly.`);
    }

    // Roundabout detection
    const rbNames = [
      { pos:[0,0],    name:'Central Campus Roundabout', hint:'yield to circulating traffic' },
      { pos:[0,-300], name:'South Roundabout',          hint:'yield to vehicles from the left' },
      { pos:[0,300],  name:'North Roundabout',          hint:'take the correct exit towards North Campus' },
      { pos:[300,0],  name:'East Roundabout',           hint:'stay right towards the dorm area' },
      { pos:[-300,0], name:'West Roundabout',           hint:'exit towards the hospital road if heading west' },
    ];
    rbNames.forEach(rb => {
      if (rawRoute.some(([x,z]) => Math.hypot(x-rb.pos[0], z-rb.pos[1]) < 55)) {
        msgs.push(`🔵 Navigate the <strong>${rb.name}</strong> — ${rb.hint}. Roundabouts are <strong>CCW only</strong>.`);
      }
    });

    if (rawRoute.some(([x,z]) => Math.abs(z+300) < 30 && Math.abs(x) < 250)) {
      msgs.push('➡️ Continue along <strong>Alumni Drive</strong> (east–west cross-road).');
    }
    if (rawRoute.some(([x,z]) => Math.abs(z-300) < 30 && Math.abs(x) < 350)) {
      msgs.push('➡️ Continue along <strong>Champions Boulevard</strong> through North Campus.');
    }

    const dist = estimateDistance(rawRoute), time = estimateTime(rawRoute);
    msgs.push(`📏 Distance: <strong>~${dist} mi</strong> &nbsp;|&nbsp; ⏱ ETA: <strong>${time}</strong>`);

    if (lot) {
      const fc = (lot.free || 0) > 10 ? '#27AE60' : '#E67E22';
      msgs.push(
        `🅿️ <strong>${lot.name}</strong><br>` +
        `&nbsp;&nbsp;Available: <span style="color:${fc};font-weight:700">${lot.free ?? '—'}</span> spots`
      );
      if (lot.paid)      msgs.push(`💳 <strong>Paid lot</strong> – $${lot.rate}/hr.`);
      else               msgs.push('✅ <strong>Free parking</strong>.');
      if (lot.timeLimit) msgs.push(`⏱ Limit: <strong>${lot.timeLimit} min</strong> — return on time.`);
    }

    msgs.push('🚦 <strong>Traffic rules:</strong> Stop on red · Slow on yellow · Proceed on green. Limit: <strong>20 mph</strong>.');
    msgs.push('🦺 Yield to pedestrians at all <strong>zebra crossings</strong>.');
    msgs.push('🎯 Follow the <strong>cyan route line</strong>. I\'ll update progress as you drive!');
    return msgs;
  }

  return {
    findPath, findBestLot,
    getRoute, getWpPath, getDenseRoute, getSmoothRoute,
    buildDirections, buildAIInstructions,
    estimateDistance, estimateTime,
  };
})();
