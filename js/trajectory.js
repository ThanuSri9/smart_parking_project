// ═══════════════════════════════════════════════════════════════════════════════
// Trajectory — Path → Dense Road-Aligned Trajectory Layer
//
// ARCHITECTURE ROLE (between Navigation and VehicleController):
//
//   Navigation.findPath  →  [waypointKeys]
//          ↓
//   Trajectory.generate  →  dense [[x,z], ...] trajectory
//          ↓
//   VehicleController    →  Stanley controller tracks the trajectory
//
// WHAT THIS MODULE DOES:
//
//   • Converts a sparse A* waypoint-key sequence into a dense world-position
//     trajectory that vehicles can physically follow without cutting corners.
//
//   • For roundabout segments (both endpoints on the same ring):
//       → Circular arc interpolation, sampled every ARC_STEP units.
//         Vehicles follow the actual ring curvature, never chord shortcuts.
//
//   • For straight road segments (any other pair):
//       → Linear interpolation sampled every STRAIGHT_STEP units.
//         Fine enough that Stanley controller segment projection is never
//         coarser than a few metres between waypoints.
//
//   • generateWithOffset applies a right-perpendicular lateral offset AFTER
//     trajectory generation so NPC right-lane geometry is road-aligned, not
//     a naive shift of sparse waypoints.
//
// NON-NEGOTIABLE CONSTRAINTS:
//   • Vehicles NEVER interpolate between sparse waypoints with a straight line
//     that cuts through a roundabout island or over the kerb.
//   • Offset is applied to the dense trajectory, not to raw waypoints — this
//     preserves arc curvature for roundabout arcs.
//   • This module is stateless: no init, no mutable shared state.
//
// COORDINATE SYSTEM: x = east (+), z = north (+)  (Three.js)
// ═══════════════════════════════════════════════════════════════════════════════

const Trajectory = (() => {
  'use strict';

  // ── Sampling resolution ───────────────────────────────────────────────────────
  const STRAIGHT_STEP = 3;   // world-units between interpolated points on roads
  const ARC_STEP      = 2;   // world-units between interpolated points on arcs

  // ── Roundabout ring definitions ───────────────────────────────────────────────
  //
  // These MUST match ROUNDABOUT_DEFS in roadnetwork.js.
  // The tolerance bands (±RING_TOL) allow for the slight numerical imprecision
  // in waypoint placement — e.g. R0_SE is at [18, -18], distance from origin
  // = 25.46 which is within the center roundabout's [21.5, 31] ring.
  //
  const RING_TOL = 2.0;  // world-unit tolerance for ring detection

  const RB_DEFS = [
    { id:'CENTER', center:[   0,    0], innerR:21.5, outerR:31   },
    { id:'SOUTH',  center:[   0, -300], innerR:17.5, outerR:27   },
    { id:'NORTH',  center:[   0,  300], innerR:17.5, outerR:27   },
    { id:'EAST',   center:[ 300,    0], innerR:17.5, outerR:27   },
    { id:'WEST',   center:[-300,    0], innerR:17.5, outerR:27   },
  ];

  // Return the RB_DEFS entry if (x,z) lies on any roundabout ring, else null.
  function _onRoundabout(x, z) {
    for (const rb of RB_DEFS) {
      const d = Math.hypot(x - rb.center[0], z - rb.center[1]);
      if (d >= rb.innerR - RING_TOL && d <= rb.outerR + RING_TOL) return rb;
    }
    return null;
  }

  // ── Arc segment interpolation ────────────────────────────────────────────────
  //
  // Generates dense circular arc points from (ax, az) to (bx, bz) along the
  // roundabout ring 'rb'. The effective radius is the average of the two endpoint
  // radii to account for small positioning errors.
  //
  // Direction: The angular delta dθ is normalised to (-π, π] so that the
  // controller always takes the SHORTEST arc through the roundabout — which,
  // given the CCW waypoint ordering in config.js, will always be the CCW arc
  // (dθ > 0) for adjacent ring nodes (~22.5–45° between them).
  //
  function _arcSegment(ax, az, bx, bz, rb) {
    const [cx, cz] = rb.center;

    const rA = Math.hypot(ax - cx, az - cz);
    const rB = Math.hypot(bx - cx, bz - cz);
    const r  = (rA + rB) * 0.5;

    const θA = Math.atan2(az - cz, ax - cx);
    const θB = Math.atan2(bz - cz, bx - cx);

    // Normalise angular delta to (-π, π]
    let dθ = θB - θA;
    while (dθ >  Math.PI) dθ -= 2 * Math.PI;
    while (dθ <= -Math.PI) dθ += 2 * Math.PI;

    // Guard: degenerate (same point)
    if (Math.abs(dθ) < 1e-6) return [[ax, az]];

    const arcLen = Math.abs(dθ) * r;
    const n = Math.max(2, Math.ceil(arcLen / ARC_STEP));

    const pts = [];
    for (let s = 0; s < n; s++) {
      const t = s / n;
      const θ = θA + dθ * t;
      pts.push([cx + r * Math.cos(θ), cz + r * Math.sin(θ)]);
    }
    return pts;
  }

  // ── Linear segment interpolation ─────────────────────────────────────────────
  //
  // Produces dense points between (ax, az) and (bx, bz) spaced STRAIGHT_STEP
  // world-units apart (exclusive of endpoint — caller appends the final point).
  //
  function _linearSegment(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-6) return [[ax, az]];
    const n = Math.max(1, Math.ceil(dist / STRAIGHT_STEP));
    const pts = [];
    for (let s = 0; s < n; s++) {
      const t = s / n;
      pts.push([ax + dx * t, az + dz * t]);
    }
    return pts;
  }

  // ── Lateral offset ───────────────────────────────────────────────────────────
  //
  // Shifts every trajectory point by 'offset' world-units in the right-
  // perpendicular direction of its local tangent.  For a CCW roundabout arc the
  // right-perpendicular points OUTWARD (away from center), placing NPCs on the
  // outer lane — the correct behaviour for a roundabout where the outer lane is
  // to the right of travel.
  //
  // Offset is applied AFTER trajectory generation so arc curvature is preserved
  // rather than distorted by shifting sparse waypoints first.
  //
  function _applyOffset(pts, offset) {
    if (!offset || Math.abs(offset) < 1e-6 || pts.length < 2) return pts;

    const out = [];
    for (let i = 0; i < pts.length; i++) {
      // Local tangent: forward at all but last point, backward at last
      let dx, dz;
      if (i < pts.length - 1) {
        dx = pts[i + 1][0] - pts[i][0];
        dz = pts[i + 1][1] - pts[i][1];
      } else {
        dx = pts[i][0] - pts[i - 1][0];
        dz = pts[i][1] - pts[i - 1][1];
      }
      const len = Math.hypot(dx, dz) || 1;
      // Right-perpendicular of (dx, dz) is (dz, -dx) / len
      out.push([
        pts[i][0] + (dz / len) * offset,
        pts[i][1] + (-dx / len) * offset,
      ]);
    }
    return out;
  }

  // ── Public: generate(wpKeys) ─────────────────────────────────────────────────
  //
  // Converts a sparse waypoint-key sequence into a dense road-aligned trajectory.
  // Each consecutive pair of keys is classified as:
  //   • Roundabout arc  → circular arc interpolation at ARC_STEP
  //   • Straight segment → linear interpolation at STRAIGHT_STEP
  //
  // The final waypoint is always appended to close the path.
  //
  function generate(wpKeys) {
    if (!wpKeys || wpKeys.length === 0) return [];

    const pts = [];

    for (let i = 0; i < wpKeys.length - 1; i++) {
      const wpA = CAMPUS.waypoints[wpKeys[i]];
      const wpB = CAMPUS.waypoints[wpKeys[i + 1]];
      if (!wpA || !wpB) continue;

      const [ax, az] = wpA.pos;
      const [bx, bz] = wpB.pos;

      // Both endpoints on the SAME roundabout ring → arc interpolation
      const rbA = _onRoundabout(ax, az);
      const rbB = _onRoundabout(bx, bz);
      const sameRb = rbA && rbB && rbA.id === rbB.id;

      if (sameRb) {
        pts.push(..._arcSegment(ax, az, bx, bz, rbA));
      } else {
        pts.push(..._linearSegment(ax, az, bx, bz));
      }
    }

    // Append the final waypoint (loop above generates up-to-but-not-including)
    const lastWp = CAMPUS.waypoints[wpKeys[wpKeys.length - 1]];
    if (lastWp) pts.push([lastWp.pos[0], lastWp.pos[1]]);

    return pts;
  }

  // ── Public: generateWithOffset(wpKeys, lateralOffset) ────────────────────────
  //
  // Same as generate() but shifts the resulting trajectory right by lateralOffset
  // world-units.  Used for NPC routes so opposing traffic travels in the right
  // lane and never appears head-on to the user vehicle.
  //
  function generateWithOffset(wpKeys, lateralOffset) {
    const pts = generate(wpKeys);
    return _applyOffset(pts, lateralOffset);
  }

  // ── Expose internals for navigation.js ──────────────────────────────────────
  // Navigation.getDenseRoute needs to pass wp keys to generate(); it calls
  // this via Trajectory.generate(wpKeys) directly.

  return { generate, generateWithOffset };
})();
