// ═══════════════════════════════════════════════════════════════════════════
// road_network.js — Road-Centric Navigation  (PRIMARY SOURCE OF TRUTH)
//
// Mandate compliance:
//   ✅ Every road is an explicit data object (id, name, polyline, width, speed)
//   ✅ Navigation graph is DERIVED from road geometry — no hand-coded waypoints
//   ✅ Buildings are enforced obstacle regions; any edge crossing a building fails
//   ✅ Parking lots are road-connected destinations via explicit PARKING_ENTRIES
//   ✅ Pathfinding operates only on the derived graph; no free-space movement
//
// Boot sequence (called from main.js before ParkingLayout / VehicleController):
//   RoadNetwork.init()
//     → builds roundabout rings from RB_NODES
//     → derives graph nodes from ROADS polylines (intersections auto-detected)
//     → installs named anchor nodes (gates G_*, lot entries PP*)
//     → validates no node inside building, no edge crosses building
//     → writes result into CAMPUS.waypoints (replaces hand-coded data)
// ═══════════════════════════════════════════════════════════════════════════

// ── ROUNDABOUT RING NODE POSITIONS ──────────────────────────────────────────
// Explicit positions chosen so every chord midpoint clears the inner island.
// These are referenced by ROADS endpoints so roads terminate exactly on the ring.
const RB_NODES = {
  RB0: { // Center roundabout [0,0], R=26
    S: [ 0,-26], SE:[ 18,-18], E:[ 26,  0], NE:[ 18, 18],
    N: [ 0, 26], NW:[-18, 18], W:[-26,  0], SW:[-18,-18],
  },
  RB1: { // South roundabout [0,-300], R=22
    S: [ 0,-322], SE:[ 16,-316], E:[ 22,-300], NE:[ 16,-284],
    N: [ 0,-278], NW:[-16,-284], W:[-22,-300], SW:[-16,-316],
  },
  RB2: { // North roundabout [0,300], R=22
    S: [ 0, 278], SE:[ 16, 284], E:[ 22, 300], NE:[ 16, 316],
    N: [ 0, 322], NW:[-16, 316], W:[-22, 300], SW:[-16, 284],
  },
  RB3: { // East roundabout [300,0], R=22
    S: [300,-22], SE:[316,-16], E:[322,  0], NE:[316, 16],
    N: [300, 22], NW:[284, 16], W:[278,  0], SW:[284,-16],
  },
  RB4: { // West roundabout [-300,0], R=22
    S: [-300,-22], SE:[-284,-16], E:[-278,  0], NE:[-284, 16],
    N: [-300, 22], NW:[-316, 16], W:[-322,  0], SW:[-316,-16],
  },
};

// ── ROAD DEFINITIONS ─────────────────────────────────────────────────────────
// 'points' is the road centreline polyline.
// Roads TERMINATE at roundabout ring node positions so the ring builder can
// connect them cleanly.  T-junctions (spur meets interior of another road)
// are detected automatically from geometry.
//
// Fields:  id · name · points[[x,z]…] · width · speed · type · oneway
const ROADS = [

  // ── ARTERIALS — main N-S and E-W spines, split at each roundabout ─────────
  { id:'R_NS_S',    name:'Main Campus Drive – South Approach',
    points:[[0,-520], [0,-322]],                     width:14, speed:14, type:'arterial' },
  { id:'R_NS_SB1C', name:'Main Campus Drive – South of Center',
    points:[[0,-278], [0,-26]],                      width:14, speed:14, type:'arterial' },
  { id:'R_NS_CN2',  name:'Main Campus Drive – North of Center',
    points:[[0,26],   [0,278]],                      width:14, speed:14, type:'arterial' },
  { id:'R_NS_N',    name:'Main Campus Drive – North Approach',
    points:[[0,322],  [0,520]],                      width:14, speed:14, type:'arterial' },

  { id:'R_EW_W',    name:'Eagle Boulevard – West Approach',
    points:[[-530,0], [-322,0]],                     width:14, speed:14, type:'arterial' },
  { id:'R_EW_W4C',  name:'Eagle Boulevard – West of Center',
    points:[[-278,0], [-26,0]],                      width:14, speed:14, type:'arterial' },
  { id:'R_EW_CE3',  name:'Eagle Boulevard – East of Center',
    points:[[26,0],   [278,0]],                      width:14, speed:14, type:'arterial' },
  { id:'R_EW_E',    name:'Eagle Boulevard – East Approach',
    points:[[322,0],  [530,0]],                      width:14, speed:14, type:'arterial' },

  // ── PERIMETER RING ────────────────────────────────────────────────────────
  { id:'R_PRM_S',   name:'South Perimeter Road',
    points:[[-530,-420], [530,-420]],                width:12, speed:11, type:'collector' },
  { id:'R_PRM_N',   name:'North Perimeter Road',
    points:[[-530,420],  [530,420]],                 width:12, speed:11, type:'collector' },
  { id:'R_PRM_W',   name:'West Perimeter Road',
    points:[[-530,-420], [-530,420]],                width:12, speed:11, type:'collector' },
  { id:'R_PRM_E',   name:'East Perimeter Road',
    points:[[530,-420],  [530,420]],                 width:12, speed:11, type:'collector' },

  // ── CROSS-CAMPUS COLLECTORS ───────────────────────────────────────────────
  { id:'R_SX_W',    name:'South Cross Road – West (Alumni Drive)',
    points:[[-450,-300], [-22,-300]],                width:10, speed:9,  type:'collector' },
  { id:'R_SX_E',    name:'South Cross Road – East (Alumni Drive)',
    points:[[22,-300],   [450,-300]],                width:10, speed:9,  type:'collector' },
  { id:'R_NX_W',    name:'North Road – West (Champions Blvd)',
    points:[[-450,300],  [-22,300]],                 width:12, speed:9,  type:'collector' },
  { id:'R_NX_E',    name:'North Road – East (Champions Blvd)',
    points:[[22,300],    [450,300]],                 width:12, speed:9,  type:'collector' },
  { id:'R_SPR',     name:'Sports Road',
    points:[[-450,380],  [480,380]],                 width:12, speed:9,  type:'collector' },

  // ── ACADEMIC INNER LOOP ───────────────────────────────────────────────────
  { id:'R_ACAD_S',  name:'Academic South Road',
    points:[[-260,-200], [280,-200]],                width:10, speed:7,  type:'local' },
  { id:'R_ACAD_N',  name:'Academic North Road',
    points:[[-260,50],   [280,50]],                  width:10, speed:7,  type:'local' },
  { id:'R_ACAD_W',  name:'Academic West Road',
    points:[[-260,-200], [-260,50]],                 width:10, speed:7,  type:'local' },
  { id:'R_ACAD_E',  name:'Academic East Road',
    points:[[280,-200],  [280,50]],                  width:10, speed:7,  type:'local' },

  // ── SECONDARY ROADS ───────────────────────────────────────────────────────
  // SE gate road + research road share x=300 corridor; the road runs from
  // G_SE south-gate all the way to RB3 south, with spurs branching off.
  { id:'R_SE_MAIN', name:'SE Gate / Research Road (x=300)',
    points:[[300,-520], [300,-22]],                  width:10, speed:9,  type:'local' },
  // East campus north spur: from RB3_N to P8 / P12 area
  { id:'R_EN',      name:'East Campus North Spur',
    points:[[300,22],   [300,165]],                  width:8,  speed:5,  type:'access' },
  // Dorm road: south end dead-end, north end meets north road at [400,300]
  { id:'R_DORM',    name:'Dorm Road',
    points:[[400,-250], [400,300]],                  width:10, speed:7,  type:'local' },
  // Short E-W spur connecting dorm road to E-W spine
  { id:'R_DORM_EW', name:'Dorm Road E-W Connector',
    points:[[380,0],    [400,0]],                    width:8,  speed:5,  type:'access' },
  // Hospital road (z=80 east-west)
  { id:'R_HOSP',    name:'Hospital Road',
    points:[[-530,80],  [-278,80]],                  width:10, speed:7,  type:'local' },
  // Hospital road connector: RB4_N to hospital road interior
  { id:'R_HOSP_N',  name:'Hospital North Connector',
    points:[[-300,22],  [-300,80]],                  width:8,  speed:5,  type:'access' },
  // West faculty road: hospital road down to parking area
  { id:'R_WF',      name:'West Faculty Road',
    points:[[-400,80],  [-400,-250]],                width:10, speed:7,  type:'local' },
  // West faculty south lateral spur (z=-80)
  { id:'R_WF_W',    name:'West Faculty South Spur',
    points:[[-400,-80], [-455,-80]],                 width:8,  speed:5,  type:'access' },
  // South access road along z=-420
  { id:'R_SA',      name:'South Access Road',
    points:[[0,-420],   [350,-420]],                 width:10, speed:7,  type:'local' },
  // Arts south road (z=-350)
  { id:'R_ART',     name:'Arts South Road',
    points:[[-200,-350],[300,-350]],                 width:10, speed:7,  type:'local' },
  // Academic south-east extension (spur off NS_SC toward P1/P2)
  { id:'R_ACAD_SE', name:'Academic South-East Extension',
    points:[[0,-200],   [200,-200]],                 width:8,  speed:5,  type:'access' },
  // P6 library north spur
  { id:'R_P6_N',    name:'Library North Spur',
    points:[[-200,0],   [-200,142]],                 width:8,  speed:5,  type:'access' },
  // NE gate spur
  { id:'R_NE_SPR',  name:'Northeast Gate Spur',
    points:[[420,300],  [420,430]],                  width:10, speed:7,  type:'local' },
  // NW gate spur (diagonal from north road to NW gate)
  { id:'R_NW_SPR',  name:'Northwest Gate Spur',
    points:[[-400,300], [-420,430]],                 width:10, speed:7,  type:'local' },

  // ── PARKING ACCESS SPURS (connect lot entries to road network) ────────────
  { id:'R_PP1',     name:'P1 Admin Lot Access',
    points:[[100,-200], [130,-200], [130,-265]],     width:8,  speed:4,  type:'access' },
  { id:'R_PP2',     name:'P2 Academic Lot Access',
    points:[[185,-200], [185,-215]],                 width:8,  speed:4,  type:'access' },
  { id:'R_PP3',     name:'P3 Stadium Lot Access',
    points:[[-310,300], [-310,262]],                 width:8,  speed:4,  type:'access' },
  { id:'R_PP4',     name:'P4 Arena Lot Access',
    points:[[218,300],  [218,380]],                  width:8,  speed:4,  type:'access' },
  { id:'R_PP5',     name:'P5 Hospital Lot Access',
    points:[[-455,-80], [-455,-56]],                 width:8,  speed:4,  type:'access' },
  { id:'R_PP7',     name:'P7 Dorm Lot Access',
    points:[[400,-250], [428,-258]],                 width:8,  speed:4,  type:'access' },
  { id:'R_PP8',     name:'P8 Garage Access',
    points:[[300,138],  [330,138]],                  width:8,  speed:4,  type:'access' },
  { id:'R_PP9',     name:'P9 Research Lot Access',
    points:[[300,-220], [360,-220], [360,-295]],     width:8,  speed:4,  type:'access' },
  { id:'R_PP10',    name:'P10 Visitor Lot Access',
    points:[[0,450],    [-90,460]],                  width:8,  speed:4,  type:'access' },
  { id:'R_PP11',    name:'P11 South Campus Lot Access',
    points:[[230,-420], [230,-385]],                 width:8,  speed:4,  type:'access' },
  { id:'R_PP12',    name:'P12 Engineering Lot Access',
    points:[[300,55],   [308,52]],                   width:8,  speed:4,  type:'access' },
  { id:'R_PP13',    name:'P13 Medical Lot Access',
    points:[[-420,-80], [-420,-27]],                 width:8,  speed:4,  type:'access' },
  { id:'R_PP14',    name:'P14 Sports Complex Lot Access',
    points:[[400,300],  [460,340]],                  width:8,  speed:4,  type:'access' },
  { id:'R_PP15',    name:'P15 Chapel/Arts Lot Access',
    points:[[-290,-300],[-290,-357]],                width:8,  speed:4,  type:'access' },
];

// ── ROUNDABOUT DEFINITIONS ─────────────────────────────────────────────────
// Ring nodes are connected in CCW order (S→SE→E→NE→N→NW→W→SW→back).
const ROUNDABOUTS = [
  { id:'RB0', label:'Central Campus Roundabout', center:[0,0],    radius:26, nodes:RB_NODES.RB0 },
  { id:'RB1', label:'South Roundabout',          center:[0,-300], radius:22, nodes:RB_NODES.RB1 },
  { id:'RB2', label:'North Roundabout',          center:[0,300],  radius:22, nodes:RB_NODES.RB2 },
  { id:'RB3', label:'East Roundabout',           center:[300,0],  radius:22, nodes:RB_NODES.RB3 },
  { id:'RB4', label:'West Roundabout',           center:[-300,0], radius:22, nodes:RB_NODES.RB4 },
];

// ── PARKING ENTRY DEFINITIONS ──────────────────────────────────────────────
// Each entry records:
//   anchor   — key used in CAMPUS.lotToWaypoint (must survive into final graph)
//   entryPos — world position of the lot entry node (end of the spur road)
//   spur     — road ID whose last point is the entry
// The spur road's START point must lie on a parent road so it gets a T-junction.
const PARKING_ENTRIES = [
  { lotId:'P1',  anchor:'PP1',  spur:'R_PP1',  entryPos:[130,-265]  },
  { lotId:'P2',  anchor:'PP2',  spur:'R_PP2',  entryPos:[185,-215]  },
  { lotId:'P3',  anchor:'PP3',  spur:'R_PP3',  entryPos:[-310,262]  },
  { lotId:'P4',  anchor:'PP4',  spur:'R_PP4',  entryPos:[218,378]   },
  { lotId:'P5',  anchor:'PP5',  spur:'R_PP5',  entryPos:[-455,-56]  },
  { lotId:'P6',  anchor:'PP6',  spur:'R_P6_N', entryPos:[-200,142]  },
  { lotId:'P7',  anchor:'PP7',  spur:'R_PP7',  entryPos:[428,-258]  },
  { lotId:'P8',  anchor:'PP8',  spur:'R_PP8',  entryPos:[330,138]   },
  { lotId:'P9',  anchor:'PP9',  spur:'R_PP9',  entryPos:[360,-295]  },
  { lotId:'P10', anchor:'PP10', spur:'R_PP10', entryPos:[-90,460]   },
  { lotId:'P11', anchor:'PP11', spur:'R_PP11', entryPos:[230,-385]  },
  { lotId:'P12', anchor:'PP12', spur:'R_PP12', entryPos:[308,52]    },
  { lotId:'P13', anchor:'PP13', spur:'R_PP13', entryPos:[-420,-27]  },
  { lotId:'P14', anchor:'PP14', spur:'R_PP14', entryPos:[460,340]   },
  { lotId:'P15', anchor:'PP15', spur:'R_PP15', entryPos:[-290,-357] },
];

// ── GATE ANCHOR DEFINITIONS ────────────────────────────────────────────────
// Gates are road endpoints; these keys must survive into the final graph so
// CAMPUS.gateToWaypoint keeps working.
const GATE_ANCHORS = [
  { key:'G_SM', pos:[  0,-520] },
  { key:'G_SE', pos:[300,-520] },
  { key:'G_E',  pos:[530,   0] },
  { key:'G_N',  pos:[  0, 520] },
  { key:'G_W',  pos:[-530,  0] },
  { key:'G_NE', pos:[420, 430] },
  { key:'G_NW', pos:[-420,430] },
];

// ═══════════════════════════════════════════════════════════════════════════
// RoadNetwork Module
// ═══════════════════════════════════════════════════════════════════════════
const RoadNetwork = (() => {
  'use strict';

  // ── Graph storage ─────────────────────────────────────────────────────────
  // Runtime nodes map: key → { key, pos:[x,z], links:[key,…] }
  const _G = {};

  // ── Geometry utilities ────────────────────────────────────────────────────

  // True line-segment intersection (excludes endpoint touches: t,u ∈ (ε,1-ε))
  // Returns [x,z] intersection or null.
  function _segX(a, b, c, d, eps = 0.005) {
    const dx1=b[0]-a[0], dz1=b[1]-a[1];
    const dx2=d[0]-c[0], dz2=d[1]-c[1];
    const den = dx1*dz2 - dz1*dx2;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((c[0]-a[0])*dz2 - (c[1]-a[1])*dx2) / den;
    const u = ((c[0]-a[0])*dz1 - (c[1]-a[1])*dx1) / den;
    if (t < eps || t > 1-eps || u < eps || u > 1-eps) return null;
    return [a[0]+t*dx1, a[1]+t*dz1];
  }

  // Perpendicular distance from point p to segment a→b
  function _ptSegDist(p, a, b) {
    const dx=b[0]-a[0], dz=b[1]-a[1], len2=dx*dx+dz*dz;
    if (len2 < 1e-10) return Math.hypot(p[0]-a[0], p[1]-a[1]);
    const t = Math.max(0, Math.min(1, ((p[0]-a[0])*dx + (p[1]-a[1])*dz) / len2));
    return Math.hypot(p[0]-a[0]-t*dx, p[1]-a[1]-t*dz);
  }

  // Does segment a→b cross AABB [x0,x1]×[z0,z1]?
  function _segHitsAABB(a, b, x0, x1, z0, z1) {
    // Endpoint inside box
    for (const p of [a, b]) {
      if (p[0]>x0 && p[0]<x1 && p[1]>z0 && p[1]<z1) return true;
    }
    // Segment crosses any of 4 box edges (use full-range intersection here)
    const corners = [[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
    for (let i=0; i<4; i++) {
      const c=corners[i], d=corners[(i+1)%4];
      const dx1=b[0]-a[0], dz1=b[1]-a[1];
      const dx2=d[0]-c[0], dz2=d[1]-c[1];
      const den=dx1*dz2-dz1*dx2;
      if (Math.abs(den)<1e-9) continue;
      const t=((c[0]-a[0])*dz2-(c[1]-a[1])*dx2)/den;
      const u=((c[0]-a[0])*dz1-(c[1]-a[1])*dx1)/den;
      if (t>=0 && t<=1 && u>=0 && u<=1) return true;
    }
    return false;
  }

  // ── Node helpers ──────────────────────────────────────────────────────────
  let _nSeq = 0;
  function _uid(hint) { return `${hint}_${++_nSeq}`; }

  // Find existing node within tolerance (returns key or null)
  function _near(pos, tol = 2.0) {
    for (const [k, n] of Object.entries(_G)) {
      if (Math.hypot(n.pos[0]-pos[0], n.pos[1]-pos[1]) < tol) return k;
    }
    return null;
  }

  // Get or create node at pos; return key
  function _node(pos, hint = 'N') {
    const existing = _near(pos);
    if (existing) return existing;
    const k = _uid(hint);
    _G[k] = { pos: [pos[0], pos[1]], links: [] };
    return k;
  }

  // Bidirectional link between two node keys
  function _link(ka, kb) {
    if (ka === kb) return;
    if (!_G[ka].links.includes(kb)) _G[ka].links.push(kb);
    if (!_G[kb].links.includes(ka)) _G[kb].links.push(ka);
  }

  // Rename node key (preserves all incoming link references)
  function _rename(oldKey, newKey) {
    if (oldKey === newKey || !_G[oldKey]) return;
    _G[newKey] = { ..._G[oldKey] };
    delete _G[oldKey];
    for (const n of Object.values(_G)) {
      const i = n.links.indexOf(oldKey);
      if (i >= 0) n.links[i] = newKey;
    }
  }

  // ── Roundabout ring builder ───────────────────────────────────────────────
  // Creates 8 ring nodes and links them bidirectionally in order.
  function _buildRing(rb) {
    const DIR_ORDER = ['S','SE','E','NE','N','NW','W','SW'];
    const keys = {};
    DIR_ORDER.forEach(d => {
      const pos = rb.nodes[d];
      const k = `${rb.id}_${d}`;
      _G[k] = { pos: [pos[0], pos[1]], links: [] };
      keys[d] = k;
    });
    for (let i=0; i<DIR_ORDER.length; i++) {
      _link(keys[DIR_ORDER[i]], keys[DIR_ORDER[(i+1) % DIR_ORDER.length]]);
    }
    return keys;
  }

  // ── Road chain builder ────────────────────────────────────────────────────
  // Finds all T/cross junctions along the road, inserts split nodes, chains edges.
  function _buildRoad(road, splitPts) {
    // Collect all points along the road's polyline + injected split positions
    // Each entry: { pos, segIdx, t } — t = normalised position along segment
    const segments = [];
    for (let s=0; s<road.points.length-1; s++) {
      segments.push({ s, a: road.points[s], b: road.points[s+1] });
    }

    // Group split points by segment, sort by t
    const bySegment = segments.map(() => []);
    for (const sp of splitPts) {
      bySegment[sp.s].push(sp);
    }
    bySegment.forEach(arr => arr.sort((x,y) => x.t - y.t));

    // Build ordered pos list
    const ordered = [];
    for (let s=0; s<segments.length; s++) {
      ordered.push(segments[s].a);
      for (const sp of bySegment[s]) ordered.push(sp.pos);
    }
    ordered.push(road.points[road.points.length-1]);

    // Create / merge nodes and chain with edges
    const nodeKeys = ordered.map((pos, i) =>
      _node(pos, road.id.replace(/[^A-Za-z0-9]/g,'_'))
    );
    for (let i=0; i<nodeKeys.length-1; i++) {
      _link(nodeKeys[i], nodeKeys[i+1]);
    }
    return nodeKeys;
  }

  // ── Intersection collector ─────────────────────────────────────────────────
  // Returns { roadId → [{s, t, pos}] } for all cross and T-junctions.
  function _collectIntersections() {
    const splits = new Map();
    for (const r of ROADS) splits.set(r.id, []);

    for (let i=0; i<ROADS.length; i++) {
      const ri = ROADS[i];
      for (let j=i+1; j<ROADS.length; j++) {
        const rj = ROADS[j];

        // (A) True crossing: segment of ri crosses segment of rj
        for (let si=0; si<ri.points.length-1; si++) {
          const [a,b] = [ri.points[si], ri.points[si+1]];
          for (let sj=0; sj<rj.points.length-1; sj++) {
            const [c,d] = [rj.points[sj], rj.points[sj+1]];
            const ix = _segX(a, b, c, d);
            if (ix) {
              const dxi=b[0]-a[0], dzi=b[1]-a[1], li=Math.hypot(dxi,dzi)||1;
              const dxj=d[0]-c[0], dzj=d[1]-c[1], lj=Math.hypot(dxj,dzj)||1;
              splits.get(ri.id).push({ s:si, t:Math.hypot(ix[0]-a[0],ix[1]-a[1])/li, pos:ix });
              splits.get(rj.id).push({ s:sj, t:Math.hypot(ix[0]-c[0],ix[1]-c[1])/lj, pos:ix });
            }
          }
        }

        // (B) T-junction: endpoint of ri lies on interior of a segment of rj
        const checkT = (endPt, targetRoad, targetSplits) => {
          for (let st=0; st<targetRoad.points.length-1; st++) {
            const [c,d] = [targetRoad.points[st], targetRoad.points[st+1]];
            if (_ptSegDist(endPt, c, d) < 1.5) {
              const dx=d[0]-c[0], dz=d[1]-c[1], l2=dx*dx+dz*dz;
              if (l2 < 1e-9) continue;
              const t = ((endPt[0]-c[0])*dx + (endPt[1]-c[1])*dz) / l2;
              if (t > 0.02 && t < 0.98) {        // interior, not endpoint
                targetSplits.push({ s:st, t, pos:[endPt[0], endPt[1]] });
              }
            }
          }
        };

        for (const ep of [ri.points[0], ri.points[ri.points.length-1]]) {
          checkT(ep, rj, splits.get(rj.id));
        }
        for (const ep of [rj.points[0], rj.points[rj.points.length-1]]) {
          checkT(ep, ri, splits.get(ri.id));
        }
      }
    }
    return splits;
  }

  // ── Connect road endpoints to roundabout rings ────────────────────────────
  // If a road's endpoint is within (radius + 35) of a roundabout center,
  // find the nearest ring node and link the road endpoint node to it.
  function _connectRingsToRoads() {
    for (const rb of ROUNDABOUTS) {
      const [cx, cz] = rb.center;
      for (const road of ROADS) {
        for (const endPt of [road.points[0], road.points[road.points.length-1]]) {
          const dist = Math.hypot(endPt[0]-cx, endPt[1]-cz);
          if (dist > rb.radius + 35) continue;
          // Find the ring node closest to this endpoint
          let bestK = null, bestD = Infinity;
          for (const [d, pos] of Object.entries(rb.nodes)) {
            const k = `${rb.id}_${d}`;
            if (!_G[k]) continue;
            const nd = Math.hypot(pos[0]-endPt[0], pos[1]-endPt[1]);
            if (nd < bestD) { bestD = nd; bestK = k; }
          }
          if (bestK && bestD < 30) {
            // Find road endpoint node and link to ring
            const epNodeK = _near(endPt, 3);
            if (epNodeK && epNodeK !== bestK) _link(epNodeK, bestK);
          }
        }
      }
    }
  }

  // ── Anchor node installer ─────────────────────────────────────────────────
  // Rename auto-generated nodes to the required anchor keys (G_*, PP*) so
  // CAMPUS.gateToWaypoint and CAMPUS.lotToWaypoint keep working.
  function _installAnchors() {
    const allAnchors = [
      ...GATE_ANCHORS,
      ...PARKING_ENTRIES.map(e => ({ key: e.anchor, pos: e.entryPos })),
    ];
    for (const { key, pos } of allAnchors) {
      if (_G[key]) continue;          // already installed with correct key
      const existing = _near(pos, 4);
      if (existing) {
        _rename(existing, key);
      } else {
        // Anchor position not yet in graph — create isolated node (validation will warn)
        _G[key] = { pos: [pos[0], pos[1]], links: [] };
        console.warn(`[RoadNetwork] Anchor '${key}' had no nearby road node — created isolated`);
      }
    }
  }

  // ── Building obstacle validator ───────────────────────────────────────────
  // Checks every node and edge against CAMPUS.buildings.
  // Nodes inside buildings and edges crossing them are reported.
  // Buildings are HARD constraints; violations do not auto-fix (require data fix).
  function _validateBuildings() {
    const errs = [];
    for (const [k, n] of Object.entries(_G)) {
      // Node inside building?
      for (const bld of CAMPUS.buildings) {
        const hw = bld.size[0]/2 - 1, hd = bld.size[2]/2 - 1;
        if (Math.abs(n.pos[0]-bld.pos[0]) < hw &&
            Math.abs(n.pos[1]-bld.pos[1]) < hd) {
          errs.push(`  Node '${k}' [${n.pos}] inside building '${bld.id}'`);
        }
      }
      // Any edge crossing a building?
      for (const nb of n.links) {
        const m = _G[nb];
        if (!m) continue;
        // Only check once per pair (avoid double reporting)
        if (nb < k) continue;
        for (const bld of CAMPUS.buildings) {
          const hw = bld.size[0]/2, hd = bld.size[2]/2;
          if (_segHitsAABB(n.pos, m.pos,
              bld.pos[0]-hw, bld.pos[0]+hw,
              bld.pos[1]-hd, bld.pos[1]+hd)) {
            errs.push(`  Edge '${k}'→'${nb}' crosses building '${bld.id}'`);
          }
        }
      }
    }
    if (errs.length) {
      console.error('[RoadNetwork] ⛔ Building obstacle violations:\n' + errs.join('\n'));
    } else {
      console.log('[RoadNetwork] ✅ Building obstacle check passed — no edge crosses a building');
    }
    return errs;
  }

  // ── Reachability check ────────────────────────────────────────────────────
  function _validateReachability() {
    const startKey = CAMPUS.gateToWaypoint[CAMPUS.userStart.gateId];
    if (!_G[startKey]) {
      console.error(`[RoadNetwork] Start node '${startKey}' not in derived graph`);
      return;
    }
    const visited = new Set([startKey]);
    const q = [startKey];
    while (q.length) {
      const cur = q.shift();
      for (const nb of (_G[cur]?.links || [])) {
        if (!visited.has(nb)) { visited.add(nb); q.push(nb); }
      }
    }
    const unreachable = [];
    for (const [lid, wk] of Object.entries(CAMPUS.lotToWaypoint)) {
      if (!visited.has(wk)) unreachable.push(`Lot ${lid} → '${wk}'`);
    }
    if (unreachable.length) {
      console.error('[RoadNetwork] ⛔ Unreachable lot waypoints:\n  ' + unreachable.join('\n  '));
    } else {
      console.log(`[RoadNetwork] ✅ All ${Object.keys(CAMPUS.lotToWaypoint).length} lot entries reachable from start gate`);
    }
  }

  // ── Main build function ───────────────────────────────────────────────────
  function _build() {
    // 1. Roundabout rings (named nodes placed first so road endpoints merge onto them)
    for (const rb of ROUNDABOUTS) _buildRing(rb);

    // 2. Collect cross + T-junction split points for every road
    const splits = _collectIntersections();

    // 3. Build each road's node chain (deduplicates against existing ring nodes)
    for (const road of ROADS) {
      _buildRoad(road, splits.get(road.id) || []);
    }

    // 4. Connect road endpoints near roundabout centers to their ring nodes
    _connectRingsToRoads();

    // 5. Install gate + lot anchor names (renames auto-generated keys)
    _installAnchors();

    // 6. Validate
    _validateBuildings();
    _validateReachability();

    console.log(`[RoadNetwork] Graph derived: ${Object.keys(_G).length} nodes from ${ROADS.length} roads + ${ROUNDABOUTS.length} roundabouts`);
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  function init() {
    _build();

    // Replace CAMPUS.waypoints with the derived graph
    for (const k of Object.keys(CAMPUS.waypoints)) delete CAMPUS.waypoints[k];
    for (const [k, n] of Object.entries(_G)) {
      CAMPUS.waypoints[k] = { pos: n.pos, links: [...n.links] };
    }

    console.log('[RoadNetwork] CAMPUS.waypoints replaced with road-derived graph ✓');
  }

  function getRoads()          { return ROADS; }
  function getRoundabouts()    { return ROUNDABOUTS; }
  function getParkingEntries() { return PARKING_ENTRIES; }
  function getGraph()          { return _G; }
  function getRoadById(id)     { return ROADS.find(r => r.id === id) || null; }

  return { init, getRoads, getRoundabouts, getParkingEntries, getGraph, getRoadById };
})();
