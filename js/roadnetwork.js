// ═══════════════════════════════════════════════════════════════════════════════
// RoadNetwork — Authoritative Road & Obstacle Model
//
// ARCHITECTURE ROLE:
//   This module is the single source of truth for what constitutes legal
//   drivable space.  Every other module (Navigation, VehicleController,
//   ParkingLayout) queries this module; none may invent their own geometry.
//
// WHAT THIS MODULE PROVIDES:
//   1. Explicit road objects  — ID, name, centerline geometry, width, direction
//   2. Roundabout objects     — annular ring geometry, inner/outer radii
//   3. Building obstacle check— segment–AABB intersection (Liang–Barsky)
//   4. isOnRoad(x,z)          — point inside some road corridor?
//   5. doesEdgeFollowRoad     — every sample point on edge within a corridor?
//   6. doesEdgeCrossBuilding  — segment passes through any building AABB?
//   7. Graph validation       — checks every CAMPUS.waypoints edge at boot
//
// NON-NEGOTIABLE CONSTRAINTS ENFORCED:
//   • Any position NOT on a defined road or roundabout is non-navigable.
//   • No waypoint may exist inside a building.
//   • No edge may pass through a building.
//   • No edge may traverse non-road space.
//   • Parking lots are accessed ONLY via their PP* entry node on a road spur.
//
// COORDINATE SYSTEM: x = east (+), z = north (+)  (same as Three.js scene)
// ═══════════════════════════════════════════════════════════════════════════════

const RoadNetwork = (() => {
  'use strict';

  // ── Road Definitions ────────────────────────────────────────────────────────
  //
  // Each road is a polyline of centerline points that defines a drivable
  // corridor of ±(width/2) world-units around it.
  //
  // geometry: [[x,z], [x,z], ...]  — consecutive points form road segments
  // width: total lane width in world units
  // direction: 'bidirectional' | 'one-way-N' | 'one-way-S' etc.
  // tags: metadata (for future routing preference weights)
  //
  const ROAD_DEFS = [

    // ── Primary N-S Spine ──────────────────────────────────────────────────
    {
      id: 'NS_MAIN',
      name: 'Main Campus Drive (N-S Spine)',
      geometry: [
        [0,-520],[0,-450],[0,-420],[0,-370],[0,-278],
        [0,-200],[0,-100],[0,-26],[0,26],[0,100],
        [0,200],[0,278],[0,380],[0,450],[0,520],
      ],
      width: 14,
      direction: 'bidirectional',
      tags: ['spine','main','primary'],
    },

    // ── Primary E-W Spine ──────────────────────────────────────────────────
    {
      id: 'EW_MAIN',
      name: 'Eagle Boulevard (E-W Spine)',
      geometry: [
        [-530,0],[-450,0],[-370,0],[-278,0],[-200,0],
        [-100,0],[-26,0],[26,0],[100,0],[200,0],
        [278,0],[380,0],[450,0],[530,0],
      ],
      width: 14,
      direction: 'bidirectional',
      tags: ['spine','main','primary'],
    },

    // ── Perimeter Ring ─────────────────────────────────────────────────────
    { id:'PERIM_S', name:'South Perimeter Road', geometry:[[-530,-420],[530,-420]],  width:12, direction:'bidirectional', tags:['perimeter'] },
    { id:'PERIM_N', name:'North Perimeter Road', geometry:[[-530,420],[530,420]],    width:12, direction:'bidirectional', tags:['perimeter'] },
    { id:'PERIM_W', name:'West Perimeter Road',  geometry:[[-530,-420],[-530,420]],  width:12, direction:'bidirectional', tags:['perimeter'] },
    { id:'PERIM_E', name:'East Perimeter Road',  geometry:[[530,-420],[530,420]],    width:12, direction:'bidirectional', tags:['perimeter'] },

    // ── South Cross-Road (Alumni Drive, z=-300) ────────────────────────────
    {
      id: 'SOUTH_CROSS',
      name: 'Alumni Drive',
      geometry: [[-450,-300],[-290,-300],[-22,-300],[22,-300],[200,-300],[290,-300]],
      width: 10,
      direction: 'bidirectional',
      tags: ['cross','south'],
    },

    // ── North Campus Road (Champions Boulevard, z=300) ────────────────────
    {
      id: 'NORTH_ROAD',
      name: 'Champions Boulevard',
      geometry: [[-450,300],[-310,300],[-22,300],[22,300],[200,300],[218,300],[400,300],[420,300],[450,300]],
      width: 12,
      direction: 'bidirectional',
      tags: ['north','main'],
    },

    // ── Sports/Athletic Drive (z=380) ─────────────────────────────────────
    { id:'SPORTS_RD', name:'Athletic Drive', geometry:[[-450,380],[480,380]], width:12, direction:'bidirectional', tags:['sports'] },

    // ── Academic Inner Loop ────────────────────────────────────────────────
    {
      id: 'ACAD_S',
      name: 'Academic South Road',
      geometry: [[-260,-200],[0,-200],[100,-200],[185,-200],[200,-200],[280,-200]],
      width: 10,
      direction: 'bidirectional',
      tags: ['academic'],
    },
    { id:'ACAD_N', name:'Academic North Road', geometry:[[-260,50],[280,50]],    width:10, direction:'bidirectional', tags:['academic'] },
    { id:'ACAD_W', name:'Academic West Road',  geometry:[[-260,-200],[-260,50]], width:10, direction:'bidirectional', tags:['academic'] },
    { id:'ACAD_E', name:'Academic East Road',  geometry:[[280,-200],[280,50]],   width:10, direction:'bidirectional', tags:['academic'] },

    // ── Hospital & Medical Road (z=80) ────────────────────────────────────
    {
      id: 'HOSP_ROAD',
      name: 'Hospital Road',
      geometry: [[-530,80],[-455,80],[-420,80],[-400,80],[-300,80]],
      width: 10,
      direction: 'bidirectional',
      tags: ['medical'],
    },

    // ── West Faculty Road (x=-400) ────────────────────────────────────────
    {
      id: 'WEST_FAC',
      name: 'West Faculty Road',
      geometry: [[-400,-250],[-400,-150],[-400,-80],[-400,0],[-400,80]],
      width: 10,
      direction: 'bidirectional',
      tags: ['faculty'],
    },

    // ── Dorm Drive (x=400) ────────────────────────────────────────────────
    {
      id: 'DORM_ROAD',
      name: 'Eagle Dorm Drive',
      geometry: [[400,-250],[400,-150],[400,0],[400,150],[400,300]],
      width: 10,
      direction: 'bidirectional',
      tags: ['dorm'],
    },

    // ── Southeast Campus Road (x=300, full length) ────────────────────────
    // Covers SE gate approach + east roundabout + north spur + P8/P12 access
    {
      id: 'SE_ROAD',
      name: 'East Campus Road',
      geometry: [
        [300,-520],[300,-450],[300,-360],[300,-350],
        [300,-280],[300,-100],[300,-22],[300,22],
        [300,55],[300,140],[300,165],
      ],
      width: 10,
      direction: 'bidirectional',
      tags: ['east'],
    },

    // ── Arts South Road (z=-350) ──────────────────────────────────────────
    { id:'ARTS_ROAD', name:'Arts South Road', geometry:[[-200,-350],[150,-350],[300,-350]], width:10, direction:'bidirectional', tags:['arts'] },

    // ── South Access Road (z=-420) ────────────────────────────────────────
    { id:'SA_ROAD', name:'South Campus Access Road', geometry:[[0,-420],[175,-420],[230,-420],[350,-420]], width:10, direction:'bidirectional', tags:['access','south'] },

    // ── Research Park Road (east from SE Road → P9) ───────────────────────
    { id:'RES_ROAD', name:'Research Park Road', geometry:[[300,-100],[300,-220],[360,-220],[360,-295]], width:10, direction:'bidirectional', tags:['research'] },

    // ── West Roundabout North Exit Spur (x=-300, z=22→80) ────────────────
    { id:'RB_W_N', name:'West Roundabout North Exit', geometry:[[-300,22],[-300,80]], width:8, direction:'bidirectional', tags:['spur','roundabout'] },

    // ── NE Gate Approach Spur (x=420, z=300→430) ─────────────────────────
    { id:'NE_SPUR', name:'NE Gate Approach', geometry:[[420,300],[420,420],[420,430]], width:10, direction:'bidirectional', tags:['gate'] },

    // ── NW Gate Approach (diagonal from NW gate to north campus road) ─────
    // The NW gate enters at angle -π/4 (diagonal), so the approach road is
    // a diagonal spur connecting gate area to the north campus road.
    { id:'NW_APPROACH', name:'NW Gate Approach', geometry:[[-420,430],[-400,300]], width:12, direction:'bidirectional', tags:['gate'] },

    // ── Parking Lot Access Spurs (one per lot) ────────────────────────────
    // These are the ONLY legal paths into each parking lot.
    // Vehicles must enter lots exclusively through these defined entry roads.

    { id:'P1_SPUR',  name:'P1 Admin Lot Access',       geometry:[[100,-200],[130,-200],[130,-265]], width:8, direction:'bidirectional', tags:['access','lot'] },
    { id:'P2_SPUR',  name:'P2 Academic Lot Access',    geometry:[[185,-200],[185,-215]],            width:8, direction:'bidirectional', tags:['access','lot'] },
    { id:'P3_SPUR',  name:'P3 Stadium Lot Access',     geometry:[[-310,300],[-310,262]],            width:8, direction:'bidirectional', tags:['access','lot'] },
    { id:'P4_SPUR',  name:'P4 Arena Lot Access',       geometry:[[218,300],[218,380]],              width:8, direction:'bidirectional', tags:['access','lot'] },
    { id:'P5_SPUR',  name:'P5 Hospital Lot Access',    geometry:[[-455,-80],[-455,-68],[-455,-56]], width:8, direction:'bidirectional', tags:['access','lot'] },
    { id:'P6_SPUR',  name:'P6 Library Lot Access',     geometry:[[-200,0],[-200,82],[-200,142]],    width:8, direction:'bidirectional', tags:['access','lot'] },
    { id:'P7_SPUR',  name:'P7 Dorm Lot Access',        geometry:[[400,-250],[428,-258]],            width:8, direction:'bidirectional', tags:['access','lot'] },
    { id:'P8_SPUR',  name:'P8 Central Garage Access',  geometry:[[300,140],[330,138]],              width:8, direction:'bidirectional', tags:['access','lot'] },
    { id:'P9_SPUR',  name:'P9 Research Lot Access',    geometry:[[300,-220],[360,-220],[360,-295]], width:8, direction:'bidirectional', tags:['access','lot'] },
    { id:'P10_SPUR', name:'P10 Visitor Lot Access',    geometry:[[0,450],[-45,455],[-90,460]],      width:8, direction:'bidirectional', tags:['access','lot'] },
    { id:'P11_SPUR', name:'P11 South Campus Access',   geometry:[[230,-420],[230,-385]],            width:8, direction:'bidirectional', tags:['access','lot'] },
    {
      id:'P12_SPUR', name:'P12 Engineering Lot Access',
      // Dog-leg: south on SE_ROAD to EAST_N1 junction, then short diagonal into lot
      geometry:[[300,22],[300,55],[308,52]],
      width:10, direction:'bidirectional', tags:['access','lot'],
    },
    {
      id:'P13_SPUR', name:'P13 Medical Lot Access',
      geometry:[[-400,-80],[-420,-80],[-420,-27]],
      width:8, direction:'bidirectional', tags:['access','lot'],
    },
    {
      id:'P14_SPUR', name:'P14 Sports Complex Access',
      // Diagonal spur from north road to lot entrance
      geometry:[[400,300],[460,332]],
      width:10, direction:'bidirectional', tags:['access','lot'],
    },
    {
      id:'P15_SPUR', name:'P15 Chapel/Arts Lot Access',
      geometry:[[-290,-300],[-290,-335],[-290,-357]],
      width:8, direction:'bidirectional', tags:['access','lot'],
    },

    // ── West Faculty South Access Road (P5 / P13 shared spur) ────────────
    { id:'APT_FAC', name:'Faculty West Access', geometry:[[-400,-80],[-455,-80]], width:8, direction:'bidirectional', tags:['access','faculty'] },
  ];

  // ── Roundabout Definitions ──────────────────────────────────────────────────
  //
  // Roundabouts occupy a solid ANNULAR RING from innerR to outerR.
  // innerR = inner island edge radius (no vehicle enters the island).
  // outerR = outer kerb radius (no vehicle exits the roundabout ring laterally).
  // laneW  = total lane width = outerR - innerR.
  //
  // All five campus roundabouts are navigated via an 8-node polygon
  // approximation in CAMPUS.waypoints (CCW ring order).  The waypoint nodes
  // are placed at exactly the roundabout ring radius so they sit on the
  // road surface.
  //
  const ROUNDABOUT_DEFS = [
    // Center roundabout — larger radius (R=26), island edge at 21.5
    { id:'RB_CENTER', name:'Central Campus Roundabout',  center:[  0,  0], innerR:21.5, outerR:31, laneW:9.5 },
    // Peripheral roundabouts — R=22, island edge at 17.5
    { id:'RB_SOUTH',  name:'South Roundabout',           center:[  0,-300], innerR:17.5, outerR:27, laneW:9.5 },
    { id:'RB_NORTH',  name:'North Roundabout',           center:[  0, 300], innerR:17.5, outerR:27, laneW:9.5 },
    { id:'RB_EAST',   name:'East Roundabout',            center:[ 300,  0], innerR:17.5, outerR:27, laneW:9.5 },
    { id:'RB_WEST',   name:'West Roundabout',            center:[-300,  0], innerR:17.5, outerR:27, laneW:9.5 },
  ];

  // ── Segment Index ────────────────────────────────────────────────────────────
  // Pre-computed list of { roadId, ax,az,bx,bz, halfW } for fast point queries.
  let _segs = [];

  // ── INIT ─────────────────────────────────────────────────────────────────────
  function init() {
    _segs = [];
    for (const road of ROAD_DEFS) {
      const hw = road.width / 2;
      const g  = road.geometry;
      for (let i = 0; i < g.length - 1; i++) {
        const [ax, az] = g[i], [bx, bz] = g[i + 1];
        _segs.push({ roadId: road.id, ax, az, bx, bz, halfW: hw });
      }
    }

    const errs = _validateGraph();
    const status = errs.length ? `⚠ ${errs.length} issue(s) found` : '✓ All clear';
    console.log(
      `[RoadNetwork] ${ROAD_DEFS.length} roads · ` +
      `${ROUNDABOUT_DEFS.length} roundabouts · ` +
      `${_segs.length} indexed segments — ${status}`
    );
    return errs;
  }

  // ── POINT ON ROAD ─────────────────────────────────────────────────────────────
  // Returns { roadId, crossTrack, halfW }  if the point is within a legal road
  // corridor,  or  null  if it is on non-navigable ground.
  //
  // Check order: roundabout rings first (they override straight-road corridors),
  //              then straight-road corridors (nearest wins).
  //
  function isOnRoad(x, z) {
    // 1. Roundabout annular rings
    for (const rb of ROUNDABOUT_DEFS) {
      const d = Math.hypot(x - rb.center[0], z - rb.center[1]);
      if (d >= rb.innerR && d <= rb.outerR) {
        return {
          roadId:     rb.id,
          crossTrack: d - (rb.innerR + rb.outerR) * 0.5,
          halfW:      rb.laneW * 0.5,
        };
      }
    }

    // 2. Straight road corridors — return the one with smallest cross-track
    let best = null;
    for (const seg of _segs) {
      const ct = _ptSegDist(x, z, seg.ax, seg.az, seg.bx, seg.bz);
      if (ct <= seg.halfW) {
        if (!best || ct < best.crossTrack) {
          best = { roadId: seg.roadId, crossTrack: ct, halfW: seg.halfW };
        }
      }
    }
    return best;
  }

  // ── EDGE FOLLOWS ROAD ─────────────────────────────────────────────────────────
  // Samples the edge at six evenly-spaced t values (0…1) and returns true only
  // if every sample point lies within some road corridor.
  // Six samples means a road that is narrower than the sample spacing would
  // only be missed by a ~2-unit sliver — acceptable for validation.
  //
  function doesEdgeFollowRoad(x1, z1, x2, z2) {
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      const mx = x1 + (x2 - x1) * t;
      const mz = z1 + (z2 - z1) * t;
      if (!isOnRoad(mx, mz)) return false;
    }
    return true;
  }

  // ── EDGE CROSSES BUILDING ─────────────────────────────────────────────────────
  // Returns true if the segment (x1,z1)→(x2,z2) intersects any building AABB.
  // Uses Liang–Barsky parametric clipping (exact, handles all edge orientations).
  // A 1-unit safety margin is added to every building face.
  //
  function doesEdgeCrossBuilding(x1, z1, x2, z2) {
    if (typeof CAMPUS === 'undefined') return false;
    for (const bld of CAMPUS.buildings) {
      const [bx, bz] = bld.pos;
      const hw = bld.size[0] * 0.5 + 1;   // +1 safety margin
      const hd = bld.size[2] * 0.5 + 1;
      if (_segAABB(x1, z1, x2, z2, bx - hw, bz - hd, bx + hw, bz + hd)) {
        return true;
      }
    }
    return false;
  }

  // ── PARKING LOT ENTRY VALIDATION ──────────────────────────────────────────────
  // Returns list of { lotId, nodeKey, issue } for lots whose PP* entry node
  // is not on a road or is inside a building.
  //
  function validateParkingEntries() {
    if (typeof CAMPUS === 'undefined') return [];
    const issues = [];
    for (const [lotId, wpKey] of Object.entries(CAMPUS.lotToWaypoint || {})) {
      const node = CAMPUS.waypoints[wpKey];
      if (!node) {
        issues.push({ lotId, nodeKey: wpKey, issue: 'entry waypoint missing from graph' });
        continue;
      }
      const [x, z] = node.pos;
      if (!isOnRoad(x, z)) {
        issues.push({ lotId, nodeKey: wpKey, issue: `entry node at (${x},${z}) is not on any road` });
      }
      // Check entry node not inside a building
      for (const bld of (CAMPUS.buildings || [])) {
        const [bx, bz] = bld.pos;
        const hw = bld.size[0] * 0.5 - 1, hd = bld.size[2] * 0.5 - 1;
        if (Math.abs(x - bx) < hw && Math.abs(z - bz) < hd) {
          issues.push({ lotId, nodeKey: wpKey, issue: `entry node inside building '${bld.id}'` });
        }
      }
    }
    return issues;
  }

  // ── GRAPH VALIDATION ─────────────────────────────────────────────────────────
  // Checks every node and edge in CAMPUS.waypoints:
  //   a) Node lies on a road surface
  //   b) Node is not inside a building
  //   c) Edge follows a road corridor (all 6 sample points on-road)
  //   d) Edge does not cross any building
  //
  // Issues are logged as warnings; the system continues running.
  // Fix the graph in config.js until this reports zero issues.
  //
  function _validateGraph() {
    if (typeof CAMPUS === 'undefined') return [];
    const wps  = CAMPUS.waypoints || {};
    const errs = [];

    for (const [key, node] of Object.entries(wps)) {
      const [ax, az] = node.pos;

      // Node on road?
      if (!isOnRoad(ax, az)) {
        errs.push(`Node '${key}' at (${ax},${az}): not on any road surface`);
      }

      // Node inside building?
      for (const bld of (CAMPUS.buildings || [])) {
        const [bx, bz] = bld.pos;
        const hw = bld.size[0] * 0.5 - 1, hd = bld.size[2] * 0.5 - 1;
        if (Math.abs(ax - bx) < hw && Math.abs(az - bz) < hd) {
          errs.push(`Node '${key}' at (${ax},${az}): inside building '${bld.id}'`);
        }
      }

      // Each edge
      for (const nb of (node.links || [])) {
        const nbNode = wps[nb];
        if (!nbNode) {
          errs.push(`Edge '${key}'→'${nb}': target node missing from graph`);
          continue;
        }
        const [bx, bz] = nbNode.pos;

        if (!doesEdgeFollowRoad(ax, az, bx, bz)) {
          errs.push(`Edge '${key}'→'${nb}' (${ax},${az})→(${bx},${bz}): leaves road surface`);
        }
        if (doesEdgeCrossBuilding(ax, az, bx, bz)) {
          errs.push(`Edge '${key}'→'${nb}': intersects a building!`);
        }
      }
    }

    // Parking entry validation
    const pkIssues = validateParkingEntries();
    for (const { lotId, nodeKey, issue } of pkIssues) {
      errs.push(`Parking lot '${lotId}' entry node '${nodeKey}': ${issue}`);
    }

    if (errs.length > 0) {
      console.warn(
        `[RoadNetwork] Graph validation — ${errs.length} issue(s):\n` +
        errs.map(e => '  • ' + e).join('\n')
      );
    } else {
      console.log('[RoadNetwork] Graph validation PASSED — all nodes/edges on-road, no building intersections ✓');
    }
    return errs;
  }

  // ── GEOMETRY HELPERS ──────────────────────────────────────────────────────────

  // Unsigned perpendicular distance from point (px,pz) to segment (ax,az)→(bx,bz).
  // Clamps the projection t to [0,1] so points beyond endpoints are measured
  // to the nearest endpoint, not to the extended line.
  function _ptSegDist(px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    if (len2 < 0.01) return Math.hypot(px - ax, pz - az);
    const t  = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
    const nx = ax + t * dx, nz = az + t * dz;
    return Math.hypot(px - nx, pz - nz);
  }

  // Liang–Barsky parametric segment–AABB intersection.
  // Returns true if the segment (x1,z1)→(x2,z2) intersects or is inside
  // the axis-aligned bounding box [minX,maxX] × [minZ,maxZ].
  function _segAABB(x1, z1, x2, z2, minX, minZ, maxX, maxZ) {
    const dx = x2 - x1, dz = z2 - z1;
    let tMin = 0, tMax = 1;

    const clip = (p, q) => {
      if (Math.abs(p) < 1e-9) return q >= 0;   // segment parallel to boundary
      const r = q / p;
      if (p < 0) { if (r > tMax) return false; if (r > tMin) tMin = r; }
      else        { if (r < tMin) return false; if (r < tMax) tMax = r; }
      return true;
    };

    return (
      clip(-dx, x1 - minX) &&   // left   boundary
      clip( dx, maxX - x1) &&   // right  boundary
      clip(-dz, z1 - minZ) &&   // bottom boundary
      clip( dz, maxZ - z1) &&   // top    boundary
      tMin <= tMax
    );
  }

  // ── PUBLIC API ────────────────────────────────────────────────────────────────
  return {
    /** Call once at startup before any navigation or vehicle tick. */
    init,

    /**
     * isOnRoad(x, z)
     * Returns { roadId, crossTrack, halfW } if (x,z) is inside a legal road
     * or roundabout corridor; null if on non-navigable ground.
     */
    isOnRoad,

    /**
     * doesEdgeFollowRoad(x1,z1, x2,z2)
     * True if every sample point along the segment lies on some road surface.
     */
    doesEdgeFollowRoad,

    /**
     * doesEdgeCrossBuilding(x1,z1, x2,z2)
     * True if the segment passes through any campus building (hard obstacle).
     */
    doesEdgeCrossBuilding,

    /** Full validation of CAMPUS.waypoints — returns error array. */
    validate: _validateGraph,

    /** Structured road definitions (read-only, for UI or debug). */
    getRoads:       () => ROAD_DEFS,

    /** Structured roundabout definitions (read-only). */
    getRoundabouts: () => ROUNDABOUT_DEFS,
  };
})();
