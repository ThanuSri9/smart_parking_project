// Navigation & Route Finding – EEU Smart Parking
const Navigation = (() => {

  // ── Euclidean heuristic for A* ────────────────────────────────────
  function _heuristic(aKey, bKey) {
    const a = CAMPUS.waypoints[aKey]?.pos;
    const b = CAMPUS.waypoints[bKey]?.pos;
    if (!a || !b) return 0;
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  }

  // ── A* shortest-distance path through waypoint graph ──────────────
  function findPath(startKey, endKey) {
    if (startKey === endKey) return [startKey];
    if (!CAMPUS.waypoints[startKey] || !CAMPUS.waypoints[endKey]) {
      return [startKey, endKey];
    }

    const gScore   = new Map([[startKey, 0]]);
    const fScore   = new Map([[startKey, _heuristic(startKey, endKey)]]);
    const cameFrom = new Map();
    const openSet  = new Set([startKey]);
    const closed   = new Set();

    while (openSet.size > 0) {
      // Pick node in openSet with lowest fScore
      let current = null, bestF = Infinity;
      for (const k of openSet) {
        const f = fScore.get(k) ?? Infinity;
        if (f < bestF) { bestF = f; current = k; }
      }

      if (current === endKey) {
        const path = [];
        let k = current;
        while (k !== undefined) { path.unshift(k); k = cameFrom.get(k); }
        return path;
      }

      openSet.delete(current);
      closed.add(current);

      const wp = CAMPUS.waypoints[current];
      if (!wp) continue;

      for (const nb of (wp.links || [])) {
        if (closed.has(nb)) continue;
        const nbWP = CAMPUS.waypoints[nb];
        if (!nbWP) continue;
        const [x1, z1] = wp.pos, [x2, z2] = nbWP.pos;
        const tentG = (gScore.get(current) ?? Infinity) + Math.hypot(x2 - x1, z2 - z1);
        if (tentG >= (gScore.get(nb) ?? Infinity)) continue;
        cameFrom.set(nb, current);
        gScore.set(nb, tentG);
        fScore.set(nb, tentG + _heuristic(nb, endKey));
        openSet.add(nb);
      }
    }
    // Graph is disconnected — throw so the caller knows to fix the graph,
    // never invent a direct-line path that flies through buildings.
    throw new Error(
      `[Navigation] A* found no path from '${startKey}' to '${endKey}'. ` +
      `Check CAMPUS.waypoints links — the graph is disconnected.`
    );
  }

  // ── Convert waypoint-id path → world positions ────────────────────
  function pathToPoints(wpPath) {
    return wpPath
      .map(k => CAMPUS.waypoints[k])
      .filter(Boolean)
      .map(wp => wp.pos);
  }

  // ── Path validation ─────────────────────────────────────────────────────────
  //
  // Three layers of enforcement (innermost to outermost):
  //
  //  Layer 1 — Graph connectivity:
  //    Every consecutive pair (cur, nxt) must be a real link in CAMPUS.waypoints.
  //    Catches A* "no-path" fallback that returns [start, end] without a route.
  //
  //  Layer 2 — Road surface:
  //    Every sample point along the segment must lie inside a defined road
  //    corridor (checked by RoadNetwork.doesEdgeFollowRoad).  This ensures the
  //    path represents REAL drivable space, not free-space shortcuts.
  //
  //  Layer 3 — Building obstacles:
  //    No segment may pass through a building AABB.
  //
  function _validatePath(wpPath) {
    for (let i = 0; i < wpPath.length - 1; i++) {
      const cur = wpPath[i], nxt = wpPath[i + 1];

      // Layer 1: graph connectivity
      if (!CAMPUS.waypoints[cur]) {
        throw new Error(`[Navigation] Waypoint '${cur}' referenced in path but missing from graph`);
      }
      if (!(CAMPUS.waypoints[cur].links || []).includes(nxt)) {
        throw new Error(
          `[Navigation] No road edge '${cur}' → '${nxt}'. ` +
          `Path segment is not a legal road — fix CAMPUS.waypoints.`
        );
      }

      // Layers 2 & 3: road surface and building obstacles (via RoadNetwork)
      if (typeof RoadNetwork !== 'undefined') {
        const [ax, az] = CAMPUS.waypoints[cur].pos;
        const [bx, bz] = CAMPUS.waypoints[nxt].pos;

        if (!RoadNetwork.doesEdgeFollowRoad(ax, az, bx, bz)) {
          throw new Error(
            `[Navigation] Edge '${cur}'→'${nxt}' leaves the road surface. ` +
            `All path segments must stay within defined road corridors.`
          );
        }
        if (RoadNetwork.doesEdgeCrossBuilding(ax, az, bx, bz)) {
          throw new Error(
            `[Navigation] Edge '${cur}'→'${nxt}' passes through a building. ` +
            `Fix the waypoint graph in config.js.`
          );
        }
      }
    }
  }

  // ── Raw waypoint-key path (A* result, validated) ─────────────────────────────
  // Used internally and by Trajectory.generate().  Throws on any error.
  function getWpPath(lotId) {
    const startGateId = CAMPUS.userStart.gateId;
    const startWP     = CAMPUS.gateToWaypoint[startGateId];
    const endWP       = CAMPUS.lotToWaypoint[lotId];

    if (!startWP) {
      throw new Error(
        `[Navigation] Start gate '${startGateId}' has no entry in CAMPUS.gateToWaypoint. ` +
        `Add it to config.js.`
      );
    }
    if (!endWP) {
      throw new Error(
        `[Navigation] Lot '${lotId}' has no entry in CAMPUS.lotToWaypoint. ` +
        `Add it to config.js.`
      );
    }

    const wpPath = findPath(startWP, endWP);
    _validatePath(wpPath);        // throws if path uses non-road shortcut
    return wpPath;
  }

  // ── Full route: user start → parking lot (via road graph ONLY) ──────────────
  // Throws if gate or lot has no waypoint mapping, or if the graph is
  // disconnected between them.  No direct-line fallback is ever returned.
  function getRoute(lotId) {
    return pathToPoints(getWpPath(lotId));
  }

  // ── Dense route: Trajectory layer converts sparse A* keys → dense trajectory ─
  //
  // Delegates to Trajectory.generate() which handles:
  //   • Roundabout segments → circular arc interpolation (ARC_STEP=2)
  //   • Straight segments   → linear interpolation (STRAIGHT_STEP=3)
  //
  // This replaces the old uniform STEP=4 linear expansion which produced chord
  // shortcuts across roundabout rings.  The Trajectory layer is the critical
  // piece between raw path and the Stanley vehicle controller.
  //
  function getDenseRoute(lotId) {
    const wpKeys = getWpPath(lotId);
    if (typeof Trajectory !== 'undefined') {
      return Trajectory.generate(wpKeys);
    }
    // Fallback (Trajectory not yet loaded): linear STEP=3 — should never happen
    // in production since trajectory.js is loaded before main.js in index.html.
    console.warn('[Navigation] Trajectory module not found — using linear fallback');
    const raw = pathToPoints(wpKeys);
    if (raw.length < 2) return raw;
    const STEP = 3;
    const pts  = [];
    for (let i = 0; i < raw.length - 1; i++) {
      const [x1, z1] = raw[i], [x2, z2] = raw[i + 1];
      const dist  = Math.hypot(x2 - x1, z2 - z1);
      const steps = Math.max(1, Math.floor(dist / STEP));
      pts.push([x1, z1]);
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        pts.push([x1 + (x2 - x1) * t, z1 + (z2 - z1) * t]);
      }
    }
    pts.push(raw[raw.length - 1]);
    return pts;
  }

  // ── Step-by-step directions ───────────────────────────────────────
  function buildDirections(routePoints, lotId) {
    const lot   = CAMPUS.parkingLots.find(l => l.id === lotId);
    const gate  = CAMPUS.gates.find(g => g.id === CAMPUS.userStart.gateId);
    const steps = [];

    if (gate) steps.push(`Enter campus via <strong>${gate.name}</strong>`);

    for (let i = 0; i < routePoints.length - 1; i++) {
      const [x1,z1] = routePoints[i];
      const [x2,z2] = routePoints[i+1];
      const dx=x2-x1, dz=z2-z1, dist=Math.round(Math.hypot(dx,dz));
      if (dist < 8) continue;
      const dir  = _cardinalDir(dx, dz);
      const road = _roadName(x1, z1, x2, z2);
      steps.push(`Head <strong>${dir}</strong> on ${road} (~${dist}m)`);
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
    // z+ = north in EEU coordinate system
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
    const cx=(x1+x2)/2, cz=(z1+z2)/2;
    if (Math.abs(cx) < 25 && cz < 0)   return 'Main Campus Drive S';
    if (Math.abs(cx) < 25 && cz >= 0)  return 'Main Campus Drive N';
    if (Math.abs(cz) < 25 && cx > 0)   return 'Eagle Boulevard E';
    if (Math.abs(cz) < 25 && cx <= 0)  return 'Eagle Boulevard W';
    if (cx >  250)  return 'East Research Road';
    if (cx < -250)  return 'West Faculty Road';
    if (cz >  250)  return 'North Athletic Drive';
    if (cz < -250)  return 'South Academic Way';
    if (Math.abs(cz - (-300)) < 50) return 'Alumni Drive';
    if (Math.abs(cz -   300)  < 50) return 'Champions Boulevard';
    return 'Campus Ring Road';
  }

  // ── Distance & time estimates ─────────────────────────────────────
  function estimateDistance(points) {
    let d = 0;
    for (let i = 0; i < points.length-1; i++) {
      const [x1,z1]=points[i], [x2,z2]=points[i+1];
      d += Math.hypot(x2-x1, z2-z1);
    }
    return (d / 1609).toFixed(1); // metres → miles
  }

  function estimateTime(points) {
    const dist = parseFloat(estimateDistance(points));
    return `${Math.max(1, Math.round(dist * 3))} min`; // ~20 mph campus
  }

  // ── Catmull-Rom smooth route ──────────────────────────────────────
  // Expands the sparse BFS waypoint path into a dense smooth spline
  // so vehicles and the route line follow curves, not sharp zig-zags.
  function getSmoothRoute(lotId) {
    const raw = getRoute(lotId);
    if (raw.length < 2) return raw;
    // Map to THREE.Vector3 (y=0 placeholder)
    const v3 = raw.map(([x, z]) => new THREE.Vector3(x, 0, z));
    // CatmullRomCurve3: closed=false, type='catmullrom', tension=0.4
    const curve = new THREE.CatmullRomCurve3(v3, false, 'catmullrom', 0.4);
    // ~10 interpolated points per original waypoint segment → smooth arc
    const divisions = Math.max(raw.length * 10, 20);
    return curve.getPoints(divisions).map(p => [p.x, p.z]);
  }

  // ── AI Navigation Instructions ────────────────────────────────────
  // Generates contextual, Google-Maps-style step messages for the
  // AI Navigator panel. Returns an array of instruction strings.
  function buildAIInstructions(rawRoute, lotId) {
    const lot  = CAMPUS.parkingLots.find(l => l.id === lotId);
    const gate = CAMPUS.gates.find(g => g.id === CAMPUS.userStart.gateId);
    const msgs = [];

    const h = new Date().getHours();
    const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';

    msgs.push(
      `${greet}! 🤖 I've plotted the best route to <strong>${lot ? lot.name : 'your parking lot'}</strong>.`
    );

    // Entry
    if (gate) {
      msgs.push(`🚦 Starting from <strong>${gate.name}</strong>. Proceed slowly through the gate.`);
    }

    // Detect which roundabouts the raw route passes through
    const rbNames = [
      { pos:[0,0],   name:'Central Campus Roundabout', hint:'the main hub of Eagle Eye University' },
      { pos:[0,-300],name:'South Roundabout',          hint:'yield to vehicles from the left' },
      { pos:[0,300], name:'North Roundabout',          hint:'take the correct exit towards North Campus' },
      { pos:[300,0], name:'East Roundabout',           hint:'stay right towards the dorm area' },
      { pos:[-300,0],name:'West Roundabout',           hint:'exit towards the hospital road if heading west' },
    ];
    rbNames.forEach(rb => {
      if (rawRoute.some(([x,z]) => Math.hypot(x-rb.pos[0], z-rb.pos[1]) < 55)) {
        msgs.push(`🔵 Navigate through the <strong>${rb.name}</strong> — ${rb.hint}.`);
      }
    });

    // South cross-road
    if (rawRoute.some(([x,z]) => Math.abs(z+300) < 30 && Math.abs(x) < 250)) {
      msgs.push('➡️ Continue along <strong>Alumni Drive</strong> (east–west cross-road at the south campus).');
    }
    // North road
    if (rawRoute.some(([x,z]) => Math.abs(z-300) < 30 && Math.abs(x) < 350)) {
      msgs.push('➡️ Continue along <strong>Champions Boulevard</strong> through North Campus.');
    }

    // Distance & time
    const dist = estimateDistance(rawRoute);
    const time = estimateTime(rawRoute);
    msgs.push(`📏 Total distance: <strong>~${dist} mi</strong> &nbsp;|&nbsp; ⏱ ETA: <strong>${time}</strong>`);

    // Lot details
    if (lot) {
      const freeColor = (lot.free || 0) > 10 ? '#27AE60' : '#E67E22';
      msgs.push(
        `🅿️ Destination: <strong>${lot.name}</strong><br>` +
        `&nbsp;&nbsp;Available spots: <span style="color:${freeColor};font-weight:700">${lot.free ?? '—'}</span>`
      );
      if (lot.paid)      msgs.push(`💳 <strong>Paid lot</strong> — $${lot.rate}/hr. Have your payment ready at the barrier.`);
      else               msgs.push('✅ <strong>Free parking</strong> — no payment required.');
      if (lot.timeLimit) msgs.push(`⏱ Parking limit: <strong>${lot.timeLimit} min</strong>. Return to your vehicle on time to avoid a fine.`);
    }

    // Traffic rules reminder
    msgs.push('🚦 <strong>Traffic rules:</strong> Stop on red · Slow on yellow · Proceed on green. Campus speed limit: <strong>20 mph</strong>.');
    msgs.push('🦺 Watch for pedestrians at all <strong>zebra crossings</strong>. They always have priority.');
    msgs.push('🎯 Follow the <strong>cyan route line</strong> on the map. I\'ll update your progress as you drive!');

    return msgs;
  }

  return {
    getRoute, getWpPath, getDenseRoute, getSmoothRoute,
    buildDirections, buildAIInstructions,
    estimateDistance, estimateTime,
  };
})();
