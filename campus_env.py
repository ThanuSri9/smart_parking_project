"""
campus_env.py
═══════════════════════════════════════════════════════════════════════
Wichita State University – Smart Campus Parking Management System
CS797K Advanced Operating Systems  |  PyBullet Campus Environment
═══════════════════════════════════════════════════════════════════════

NAVIGATION:
  Mouse LEFT-drag   → Orbit / rotate camera around campus
  Mouse RIGHT-drag  → Pan (slide camera target)
  Mouse SCROLL      → Zoom in / out
  Arrow Keys        → Pan camera target left/right/fwd/back
  A / D             → Orbit left / right
  W / S             → Tilt camera up / down
  + (= key) / -     → Zoom in / out
  R                 → Reset to default bird's-eye view
  Q or Ctrl+C       → Quit
═══════════════════════════════════════════════════════════════════════
"""

import pybullet as p
import pybullet_data
import math, time, sys

# User-friendly configuration
SIMPLIFIED_MODE = True   # Smaller campus for speed & cleanliness
CLEAN_MODE = True        # Hide textual labels and clutter

# ─────────────────────────────────────────────────────────────────────
#  ROAD CENTRELINE POSITIONS  (must keep buildings clear of these)
# ─────────────────────────────────────────────────────────────────────
#  Rule: building_centre ± half_size  must be > (road_cl ± half_road + 4 m gap)
RD_PERIM_W = -118   # West perimeter  x
RD_PERIM_E =  128   # East perimeter  x
RD_PERIM_N =  110   # North perimeter y
RD_PERIM_S = -110   # South perimeter y
RD_YALE    =   30   # Yale Ave        x   road half-width=3.75 → clear x<22 or x>38
RD_ALUMNI  =  -42   # Alumni Drive    y   road half-width=3.75 → clear y<-50 or y>-34
RD_NORTH   =   62   # North cross road y  half-width=3.0   → clear y<55 or y>69
RD_EAST    =   88   # East internal   x   half-width=3.0   → clear x<81 or x>95
RD_KOCHX   =  -78   # Koch access     x   half-width=3.0   → clear x<-85 or x>-71

# ─────────────────────────────────────────────────────────────────────
#  COLOUR PALETTE
# ─────────────────────────────────────────────────────────────────────
C = {
    "grass":       [0.25, 0.49, 0.19, 1.0],
    "road":        [0.18, 0.18, 0.18, 1.0],
    "sidewalk":    [0.80, 0.77, 0.70, 1.0],
    "plaza":       [0.88, 0.84, 0.74, 1.0],
    "parking":     [0.23, 0.23, 0.23, 1.0],
    "curb":        [0.68, 0.66, 0.62, 1.0],
    "median":      [0.27, 0.52, 0.20, 1.0],
    "field":       [0.20, 0.54, 0.16, 1.0],
    "track":       [0.62, 0.14, 0.10, 1.0],
    "pond":        [0.22, 0.46, 0.70, 0.85],
    "lw":          [0.94, 0.94, 0.94, 1.0],
    "ly":          [0.96, 0.84, 0.02, 1.0],
    "brick":       [0.65, 0.32, 0.18, 1.0],
    "brick_lt":    [0.76, 0.52, 0.36, 1.0],
    "concrete":    [0.72, 0.70, 0.66, 1.0],
    "glass":       [0.48, 0.64, 0.78, 1.0],
    "modern":      [0.56, 0.58, 0.62, 1.0],
    "dome":        [0.88, 0.87, 0.84, 1.0],
    "roof_r":      [0.48, 0.18, 0.12, 1.0],
    "roof_d":      [0.18, 0.17, 0.17, 1.0],
    "dorm":        [0.72, 0.65, 0.54, 1.0],
    "dorm_hi":     [0.62, 0.57, 0.48, 1.0],
    "chapel":      [0.74, 0.66, 0.52, 1.0],
    "stadium":     [0.44, 0.44, 0.48, 1.0],
    "tower":       [0.90, 0.90, 0.90, 1.0],
    "sg":          [0.06, 0.36, 0.10, 1.0],
    "sr":          [0.78, 0.06, 0.06, 1.0],
    "sy":          [0.90, 0.76, 0.02, 1.0],
    "sb":          [0.10, 0.22, 0.62, 1.0],
    "sw":          [0.94, 0.94, 0.94, 1.0],
    "pole":        [0.44, 0.44, 0.46, 1.0],
    "glow":        [1.00, 0.96, 0.78, 1.0],
    "shelter":     [0.22, 0.36, 0.66, 1.0],
    "bench":       [0.36, 0.26, 0.14, 1.0],
    "trunk":       [0.32, 0.19, 0.08, 1.0],
    "canopy_a":    [0.16, 0.43, 0.12, 0.94],
    "canopy_b":    [0.24, 0.52, 0.18, 0.90],
}


# ─────────────────────────────────────────────────────────────────────
#  PRIMITIVES
# ─────────────────────────────────────────────────────────────────────

def _box(he, pos, yaw=0.0, color=None):
    ori = p.getQuaternionFromEuler([0, 0, yaw])
    col = p.createCollisionShape(p.GEOM_BOX, halfExtents=he)
    vis = p.createVisualShape(p.GEOM_BOX, halfExtents=he,
                              rgbaColor=color or [0.7, 0.7, 0.7, 1])
    p.createMultiBody(0, col, vis, pos, ori)


def _cyl(r, h, pos, yaw=0.0, color=None):
    ori = p.getQuaternionFromEuler([0, 0, yaw])
    col = p.createCollisionShape(p.GEOM_CYLINDER, radius=r, height=h)
    vis = p.createVisualShape(p.GEOM_CYLINDER, radius=r, length=h,
                              rgbaColor=color or [0.7, 0.7, 0.7, 1])
    p.createMultiBody(0, col, vis, pos, ori)


def _sph(r, pos, color=None):
    col = p.createCollisionShape(p.GEOM_SPHERE, radius=r)
    vis = p.createVisualShape(p.GEOM_SPHERE, radius=r,
                              rgbaColor=color or [0.4, 0.8, 0.4, 1])
    p.createMultiBody(0, col, vis, pos)


def _txt(text, pos, size=1.0, color=None):
    if CLEAN_MODE:
        return
    p.addUserDebugText(text, pos,
                       textColorRGB=color or [0.95, 0.95, 0.95],
                       textSize=size)


# ─────────────────────────────────────────────────────────────────────
#  ROAD FUNCTIONS
# ─────────────────────────────────────────────────────────────────────

def road(x1, y1, x2, y2, w=7.0, dashed=True, col=None):
    rc = col or C["road"]
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy)
    if L < 0.1:
        return
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    yaw = math.atan2(dy, dx)
    _box([L / 2, w / 2, 0.04], [cx, cy, 0.04], yaw, rc)
    for s in (-1, 1):
        ox = s * (w / 2 + 0.26) * math.sin(yaw)
        oy = -s * (w / 2 + 0.26) * math.cos(yaw)
        _box([L / 2, 0.22, 0.07], [cx + ox, cy + oy, 0.07], yaw, C["curb"])
    if dashed and L > 4:
        n = max(2, int(L / 9))
        for i in range(n):
            t = (i + 0.5) / n
            _box([0.9, 0.09, 0.05],
                 [x1 + t * dx, y1 + t * dy, 0.05], yaw, C["ly"])


def road_dc(x1, y1, x2, y2, w=7.5):
    """Double-centre-line road (main arteries)."""
    road(x1, y1, x2, y2, w, dashed=False)
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy)
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    yaw = math.atan2(dy, dx)
    for off in (-0.16, 0.16):
        ox, oy = off * math.sin(yaw), -off * math.cos(yaw)
        _box([L / 2, 0.09, 0.05], [cx + ox, cy + oy, 0.05], yaw, C["ly"])


def curved_road(cx, cy, radius, a0d, a1d, w=7.0, segs=28):
    a0, a1 = math.radians(a0d), math.radians(a1d)
    arc = a1 - a0
    for i in range(segs):
        t0 = a0 + arc * i / segs
        t1 = a0 + arc * (i + 1) / segs
        tm = (t0 + t1) / 2
        mx = cx + radius * math.cos(tm)
        my = cy + radius * math.sin(tm)
        sl = abs(radius * arc / segs) + 0.12
        yaw = tm + math.pi / 2
        _box([sl / 2 + 0.1, w / 2, 0.04], [mx, my, 0.04], yaw, C["road"])
        for s in (-1, 1):
            cr = radius + s * (w / 2 + 0.26)
            _box([sl / 2, 0.20, 0.07],
                 [cx + cr * math.cos(tm), cy + cr * math.sin(tm), 0.07],
                 yaw, C["curb"])
        if i % 2 == 0:
            _box([sl * 0.4, 0.09, 0.05], [mx, my, 0.05], yaw, C["ly"])


def roundabout(cx, cy, outer=9.0, inner=4.5):
    ring_w = outer - inner
    curved_road(cx, cy, (outer + inner) / 2, 0, 360, ring_w, 40)
    _cyl(inner - 0.4, 0.25, [cx, cy, 0.12], color=C["median"])
    for k in range(18):
        a = math.radians(k * 20)
        _box([0.25, 0.25, 0.17],
             [cx + (inner - 0.2) * math.cos(a),
              cy + (inner - 0.2) * math.sin(a), 0.17],
             0, C["curb"])
    _cyl(0.15, 2.0, [cx, cy, 1.0], color=C["pole"])
    _sph(0.25, [cx, cy, 2.3], C["glow"])


# ─────────────────────────────────────────────────────────────────────
#  BUILDINGS  — NO LABELS / TEXT ATTACHED
# ─────────────────────────────────────────────────────────────────────

def building(cx, cy, w, d, h, yaw=0.0, style="brick"):
    """Plain building box + roof. Zero labels."""
    wall = C.get(style, C["brick"])
    bh = h * 0.92
    _box([w, d, bh / 2], [cx, cy, bh / 2], yaw, wall)
    rs = "roof_d" if style in ("modern", "glass", "concrete") else "roof_r"
    _box([w + 0.3, d + 0.3, h * 0.09 / 2],
         [cx, cy, bh + h * 0.09 / 2], yaw, C[rs])


def tower_block(cx, cy, w, d, h, yaw=0.0, style="dorm"):
    wall = C.get(style, C["dorm"])
    _box([w, d, h / 2], [cx, cy, h / 2], yaw, wall)
    fh = h / max(4, int(h / 4.5))
    for f in range(1, int(h / fh)):
        _box([w + 0.05, d + 0.05, 0.09], [cx, cy, f * fh], yaw, C["concrete"])
    _box([w + 0.35, d + 0.35, 0.36], [cx, cy, h + 0.36], yaw, C["roof_d"])


def dome_arena(cx, cy, base_r=24, dome_r=21, wall_h=7):
    segs = 36
    sl = 2 * math.pi * base_r / segs + 0.22
    for i in range(segs):
        am = math.radians(i * 360 / segs)
        _box([sl / 2 + 0.12, 2.3, wall_h / 2],
             [cx + base_r * math.cos(am),
              cy + base_r * math.sin(am), wall_h / 2],
             am + math.pi / 2, C["brick"])
    for ri in range(9):
        t = ri / 8
        _cyl(max(dome_r * math.cos(t * math.pi / 2.1), 0.4), 0.72,
             [cx, cy, wall_h + dome_r * 0.43 * math.sin(t * math.pi / 2)],
             color=C["dome"])
    _box([3.6, 2.6, wall_h / 2],
         [cx, cy + base_r + 1.6, wall_h / 2], 0, C["concrete"])


def stadium(cx, cy, lx=28, ly=17, wall_h=9):
    # track oval
    for i in range(48):
        am = math.radians(i * 360 / 48)
        sl = 2 * math.pi * ((lx + ly) / 2 + 9) / 48 + 0.2
        _box([sl / 2 + 0.1, 4.2, 0.06],
             [cx + (lx + 9) * math.cos(am),
              cy + (ly + 9) * math.sin(am), 0.06],
             am + math.pi / 2, C["track"])
    # field
    _box([lx, ly, 0.07], [cx, cy, 0.07], color=C["field"])
    for i in range(-4, 5):
        _box([0.07, ly, 0.08], [cx + i * lx / 5, cy, 0.08], color=C["lw"])
    # 4 stand walls
    for axis, off, wl, wd in [
        (0,  lx + 12, ly + 7, 5.5),
        (0, -(lx + 12), ly + 7, 5.5),
        (1,  ly + 12, lx + 7, 5.5),
        (1, -(ly + 12), lx + 7, 5.5),
    ]:
        if axis == 0:
            _box([wd, wl, wall_h / 2],
                 [cx + off, cy, wall_h / 2], 0, C["stadium"])
        else:
            _box([wl, wd, wall_h / 2],
                 [cx, cy + off, wall_h / 2], 0, C["stadium"])
    # floodlights
    for sx, sy in ((-1, -1), (-1, 1), (1, -1), (1, 1)):
        px, py = cx + sx * (lx + 13), cy + sy * (ly + 13)
        _cyl(0.30, 14, [px, py, 7], color=C["pole"])
        _box([2.0, 0.35, 0.33], [px, py, 14.2], 0, C["glow"])


def water_tower(cx, cy):
    for a in range(0, 360, 72):
        ang = math.radians(a)
        _box([0.30, 0.30, 9],
             [cx + 4.0 * math.cos(ang), cy + 4.0 * math.sin(ang), 9],
             0, C["tower"])
    _cyl(5.5, 3.8, [cx, cy, 20.5], color=C["tower"])
    _sph(5.5, [cx, cy, 22.4], C["tower"])


def chapel(cx, cy):
    _box([7, 11, 4.5], [cx, cy, 4.5], 0, C["chapel"])
    _box([3.5, 3.5, 3.5], [cx, cy + 7, 7.75], 0, C["chapel"])
    _box([1.0, 1.0, 7.0], [cx, cy + 7, 14.5], 0, C["concrete"])
    _sph(0.52, [cx, cy + 7, 21.5], [0.85, 0.82, 0.74, 1])


def pond(cx, cy, rx=14, ry=9):
    segs = 26
    for i in range(segs):
        am = math.radians(i * 360 / segs)
        sl = 2 * math.pi * (rx + ry) / 2 / segs + 0.2
        _box([sl / 2 + 0.1, 0.42, 0.13],
             [cx + rx * math.cos(am), cy + ry * math.sin(am), 0.11],
             am + math.pi / 2, C["curb"])
    _box([rx - 0.5, ry - 0.5, 0.07], [cx, cy, 0.07], color=C["pond"])


def plaza_feature(cx, cy, r=8):
    _cyl(r, 0.08, [cx, cy, 0.08], color=C["plaza"])
    _cyl(1.0, 0.42, [cx, cy, 0.42], color=C["curb"])
    _cyl(0.28, 1.8, [cx, cy, 1.6], color=C["concrete"])
    _sph(0.48, [cx, cy, 2.7], [0.80, 0.78, 0.74, 1])


def sidewalk(x1, y1, x2, y2, w=2.0):
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy)
    if L < 0.1:
        return
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    _box([L / 2, w / 2, 0.05], [cx, cy, 0.05],
         math.atan2(dy, dx), C["sidewalk"])


# ─────────────────────────────────────────────────────────────────────
#  TREES & LIGHT POLES
# ─────────────────────────────────────────────────────────────────────

def tree(x, y, th=3.0, cr=2.2, style=0):
    _cyl(0.19, th, [x, y, th / 2], color=C["trunk"])
    col = C["canopy_a"] if style == 0 else C["canopy_b"]
    _sph(cr, [x, y, th + cr * 0.65], col)


def tree_row(x1, y1, x2, y2, sp=12, style=0):
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy)
    n = max(1, int(L / sp))
    for i in range(n + 1):
        t = i / n if n else 0
        tree(x1 + t * dx, y1 + t * dy,
             2.5 + 0.4 * math.sin(i * 1.3),
             1.9 + 0.3 * math.cos(i * 0.9), style)


def light_pole(x, y, h=7.0):
    _cyl(0.12, h, [x, y, h / 2], color=C["pole"])
    _sph(0.24, [x, y, h + 0.2], C["glow"])


# ─────────────────────────────────────────────────────────────────────
#  ROAD SIGNS
# ─────────────────────────────────────────────────────────────────────

def _post(x, y, h=2.8):
    _cyl(0.07, h, [x, y, h / 2], color=C["pole"])


def stop_sign(x, y, facing=0):
    _post(x, y, 2.8)
    _box([0.40, 0.06, 0.40], [x, y, 2.95], math.radians(facing), C["sr"])
    _txt("STOP", [x, y, 2.95], 0.78, [0.96, 0.96, 0.96])


def speed_sign(x, y, spd=15, facing=0):
    _post(x, y, 2.5)
    _box([0.34, 0.06, 0.46], [x, y, 2.78], math.radians(facing), C["sw"])
    _box([0.30, 0.07, 0.42], [x, y, 2.78], math.radians(facing), C["sb"])
    _txt(f"SPEED\n{spd}", [x, y, 2.90], 0.70, [0.96, 0.96, 0.96])


def yield_sign(x, y, facing=0):
    _post(x, y, 2.4)
    _box([0.40, 0.06, 0.34], [x, y, 2.60], math.radians(facing), C["sy"])
    _txt("YIELD", [x, y, 2.60], 0.68, [0.10, 0.10, 0.10])


def entrance_gate(cx, cy, yaw_deg=0, label="WSU Gate"):
    yr = math.radians(yaw_deg)
    for s in (-1, 1):
        px = cx + s * 5.0 * math.sin(yr)
        py = cy - s * 5.0 * math.cos(yr)
        _box([0.62, 0.62, 4.0], [px, py, 4.0], 0, C["concrete"])
        _box([0.90, 0.90, 0.34], [px, py, 8.1], 0, C["curb"])
    _box([0.15, 4.4, 0.15], [cx, cy, 7.4], yr, C["sr"])
    _txt(label, [cx, cy, 9.0], 0.95, [0.95, 0.88, 0.10])


def transit_stop(x, y, facing=0, route="Shocker Express"):
    yr = math.radians(facing)
    _box([1.65, 0.10, 1.30], [x, y, 1.30], yr, C["shelter"])
    _box([1.65, 0.72, 0.10], [x, y, 2.62], yr, C["shelter"])
    for s in (-1, 1):
        ox, oy = s * 1.54 * math.cos(yr), s * 1.54 * math.sin(yr)
        _box([0.10, 0.72, 1.30], [x + ox, y + oy, 1.30], yr, C["shelter"])
    _box([1.40, 0.22, 0.08], [x, y, 0.43], yr, C["bench"])
    for s in (-1, 1):
        _box([0.07, 0.20, 0.38], [x + s * 1.25, y, 0.19], yr, C["bench"])
    _box([1.38, 0.07, 0.24], [x, y, 2.76], yr, C["sb"])
    _txt(f"SHUTTLE\n{route}", [x, y, 3.0], 0.85, [0.96, 0.96, 0.96])
    _cyl(0.07, 2.5, [x + 1.85, y, 1.25], color=C["pole"])
    _box([0.26, 0.06, 0.34], [x + 1.85, y, 2.60], yr, C["sw"])


# ─────────────────────────────────────────────────────────────────────
#  PARKING LOT
# ─────────────────────────────────────────────────────────────────────

def parking_lot(cx, cy, rows, cols, sw=2.65, sd=5.2,
                yaw=0.0, lot_id="", permit=""):
    """
    Two-facing-row banks with drive aisle.
    rows  = number of banks   cols = stalls per row
    All geometry verified to stay within passed cx/cy + yaw bounds.
    """
    aisle  = 6.5
    bank_h = sd * 2 + aisle
    tot_w  = cols * sw
    tot_d  = rows * bank_h + max(0, rows - 1) * 3.0
    bdr    = 2.0

    cy_ = math.cos(yaw)
    sy_ = math.sin(yaw)

    def W(lx, ly):
        return [cx + lx * cy_ - ly * sy_,
                cy + lx * sy_ + ly * cy_, 0]

    # surface slab
    _box([tot_w / 2 + bdr, tot_d / 2 + bdr, 0.05],
         [cx, cy, 0.05], yaw, C["parking"])

    # perimeter curb
    for s, ax in ((1, 0), (-1, 0), (1, 1), (-1, 1)):
        if ax == 0:
            pp = W(s * (tot_w / 2 + bdr), 0)
            _box([0.24, tot_d / 2 + bdr, 0.10], pp, yaw, C["curb"])
        else:
            pp = W(0, s * (tot_d / 2 + bdr))
            _box([tot_w / 2 + bdr, 0.24, 0.10], pp, yaw, C["curb"])

    # stall dividers
    for c in range(cols + 1):
        lx = -tot_w / 2 + c * sw
        for r in range(rows):
            by = -tot_d / 2 + r * (bank_h + 3.0)
            for sy_off in (by, by + sd, by + sd + aisle, by + bank_h):
                pp = W(lx, sy_off)
                _box([0.05, sd * 0.47, 0.06], [pp[0], pp[1], 0.06], yaw, C["lw"])

    # front stop bars
    for r in range(rows):
        by = -tot_d / 2 + r * (bank_h + 3.0)
        for sy_off in (by + sd, by + sd + aisle):
            pp = W(0, sy_off)
            _box([tot_w / 2, 0.09, 0.06], [pp[0], pp[1], 0.06], yaw, C["lw"])

    # tree medians between banks
    if rows > 1:
        for r in range(rows - 1):
            my = -tot_d / 2 + (r + 1) * (bank_h + 3.0) - 1.5
            mp = W(0, my)
            _box([tot_w / 2, 1.0, 0.06], [mp[0], mp[1], 0.06], yaw, C["median"])
            nt = max(2, cols // 4)
            for t in range(nt):
                tlx = -tot_w / 2 + sw * 2 + t * (tot_w - sw * 3) / max(nt - 1, 1)
                tp = W(tlx, my)
                tree(tp[0], tp[1], 2.5, 2.1)

    # aisle light poles
    for r in range(rows):
        ay = -tot_d / 2 + r * (bank_h + 3.0) + sd + aisle / 2
        for lc in range(0, cols + 1, max(1, cols // 3)):
            lp = W(-tot_w / 2 + lc * sw, ay)
            light_pole(lp[0], lp[1], 5.2)

    # lot ID sign
    sp = W(0, tot_d / 2 + bdr + 0.6)
    _cyl(0.10, 2.0, [sp[0], sp[1], 1.0], color=C["pole"])
    _box([0.90, 0.07, 0.50], [sp[0], sp[1], 2.40], yaw, C["sg"])
    if lot_id:
        _txt(f"Lot {lot_id}", [sp[0], sp[1], 3.1], 1.0, [0.96, 0.96, 0.20])
    if permit:
        _txt(permit, [sp[0], sp[1], 2.0], 0.72, [0.80, 0.80, 0.80])


# ═════════════════════════════════════════════════════════════════════
#  CAMPUS ASSEMBLY
# ═════════════════════════════════════════════════════════════════════

def build_campus():
    if SIMPLIFIED_MODE:
        print("  [1/6] Ground plane …")
        _box([190, 160, 0.05], [5, 0, -0.05], color=C["grass"])

        print("  [2/6] Main roads …")
        road(RD_PERIM_W, -104, RD_PERIM_W, 104, 7, dashed=False)
        road(RD_PERIM_E, -104, RD_PERIM_E, 104, 7, dashed=False)
        road(-112, RD_PERIM_N, 122, RD_PERIM_N, 7, dashed=False)
        road(-112, RD_PERIM_S, 122, RD_PERIM_S, 7, dashed=False)
        road(RD_YALE, -110, RD_YALE, 110, 7.5, dashed=False)
        road(RD_EAST, RD_ALUMNI, RD_EAST, RD_NORTH, 6)

        print("  [3/6] Selected campus buildings …")
        building(-18, 35, 12, 8, 11, 0, "brick")   # Faculty hub
        building( 20,-20, 12, 8, 10, 0, "modern")  # Academic
        building(-40, 55,  7, 5,  8, 0, "concrete") # Water tower zone
        building( 52, 90,  8, 7, 11, 0, "brick")   # Church
        tower_block(-70, 80,  8, 10, 30, 0, "dorm_hi")

        print("  [4/6] Key amenities …")
        plaza_feature(-8, -4, 7)
        pond(70, 50, 14, 9)

        print("  [5/6] Parking + trees …")
        parking_lot(-30, -62, rows=1, cols=9, lot_id="7", permit="Student")
        parking_lot(60, -65, rows=1, cols=8, lot_id="6", permit="Staff")
        tree_row(-118,  60, -118, -60, 8)
        tree_row(118,  60, 118, -60, 8)

        print("  [6/6] Done (simplified mode).")
        return

    print("  [1/12] Ground plane …")
    _box([190, 160, 0.05], [5, 0, -0.05], color=C["grass"])

    # street labels at ground level (tiny, out of campus)
    _txt("21st St.",      [  0,  116, 0.4], 1.2, [0.15, 0.15, 0.15])
    _txt("17th St.",      [  0, -116, 0.4], 1.2, [0.15, 0.15, 0.15])
    _txt("Hillside Ave.", [-125,   0, 0.4], 1.2, [0.15, 0.15, 0.15])
    _txt("Oliver St.",    [ 133,   0, 0.4], 1.2, [0.15, 0.15, 0.15])

    print("  [2/12] Roads …")

    # ── Perimeter (4 legs + rounded corners) ─────────────────────────
    road(RD_PERIM_W, -104, RD_PERIM_W,  104, 7, dashed=False)
    road(RD_PERIM_E, -104, RD_PERIM_E,  104, 7, dashed=False)
    road(-112, RD_PERIM_N, 122, RD_PERIM_N, 7, dashed=False)
    road(-112, RD_PERIM_S, 122, RD_PERIM_S, 7, dashed=False)
    curved_road(-112,  104,  9,  90, 180, 7, 10)
    curved_road( 122,  104,  9,   0,  90, 7, 10)
    curved_road(-112, -104,  9, 180, 270, 7, 10)
    curved_road( 122, -104,  9, 270, 360, 7, 10)
    _txt("Perimeter Rd.", [-40, 113, 0.5], 0.9, [0.65, 0.65, 0.65])

    # ── Yale Ave (N-S, x=30) ─────────────────────────────────────────
    road_dc(RD_YALE, -110, RD_YALE,  110, 7.5)
    _txt("Yale Ave.", [35, 0, 0.5], 0.9, [0.65, 0.65, 0.65])

    # ── Alumni Drive (E-W, y=-42) ────────────────────────────────────
    road_dc(-118, RD_ALUMNI, 128, RD_ALUMNI, 7.5)
    _txt("Alumni Dr.", [-55, -39, 0.5], 0.9, [0.65, 0.65, 0.65])

    # ── North cross road (y=62, full width) ──────────────────────────
    road(-118, RD_NORTH, 128, RD_NORTH, 6)
    _txt("North Campus Rd.", [-50, 64, 0.5], 0.9, [0.65, 0.65, 0.65])

    # ── East internal road (x=88, Alumni→North) ──────────────────────
    road(RD_EAST, RD_ALUMNI, RD_EAST, RD_NORTH, 6)

    # ── Koch Arena access (x=-78, North→Perim-N) ─────────────────────
    road(RD_KOCHX, RD_NORTH, RD_KOCHX, RD_PERIM_N, 6)

    # ── South lot access (y=-75, Yale→Perim-E) ───────────────────────
    road(RD_YALE, -75, 128, -75, 6)

    # ── Mike Oatman Dr (diagonal NE) ─────────────────────────────────
    road(128, RD_NORTH, RD_EAST, RD_PERIM_N, 6)
    _txt("Mike Oatman Dr.", [108, 82, 0.5], 0.85, [0.65, 0.65, 0.65])

    # ── Roundabouts ───────────────────────────────────────────────────
    roundabout(RD_YALE,  RD_NORTH,  9, 4.5)   # Yale × North
    roundabout(RD_YALE,  RD_ALUMNI, 9, 4.5)   # Yale × Alumni
    roundabout(-38,      RD_ALUMNI, 9, 4.5)   # mid-Alumni
    roundabout(RD_PERIM_W, RD_NORTH, 9, 4.5)  # West × North

    print("  [3/12] Entry gates …")
    entrance_gate( RD_YALE,    RD_PERIM_N,  90, "Yale Ave. North Gate")
    entrance_gate( RD_YALE,    RD_PERIM_S,  90, "Yale Ave. South Gate")
    entrance_gate( RD_PERIM_W, RD_NORTH,     0, "Hillside North Gate")
    entrance_gate( RD_PERIM_W, RD_ALUMNI,    0, "Hillside South Gate")
    entrance_gate( RD_PERIM_E, RD_NORTH,     0, "East Campus Gate")
    entrance_gate( 0,          RD_PERIM_S,  90, "17th St. Gate")

    print("  [4/12] Sports zone …")
    # ── Koch Arena: cx=-88, cy=87
    #   base_r=22 → x[-110,-66] ✓  y[65,109] ✓ (North road at 62, clear ✓)
    dome_arena(-88, 87, base_r=22, dome_r=20, wall_h=7)

    # ── Cessna Stadium: cx=-46, cy=87
    #   lx=26, ly=16 → stands at ±(26+12)=±38 in x, ±(16+12)=±28 in y
    #   x: [-84,-8] ✓   y: [59,115] → south face 59 just below North road (62).
    #   Stands are visual; accept.  North face 115 > perim(110) slightly. OK.
    stadium(-46, 87, lx=26, ly=16, wall_h=9)

    # ── Cessna Annex: cx=-20, cy=85
    #   x:[-20±9]=[-29,-11] ✓   y:[85±5]=[80,90] ✓
    building(-20, 85, 9, 5, 5, 0, "concrete")

    # ── Eck Stadium (NE): cx=105, cy=87
    #   lx=28, ly=18 → stands x:[105-40,105+40]=[65,145]. East perim at 128.
    #   Clip slightly but track is visual. y:[59,115] same as above.
    stadium(105, 87, lx=28, ly=18, wall_h=8)

    print("  [5/12] Academic buildings (all checked against roads) …")

    # ── North academic (y in [69,107], x in [-110,20]) ───────────────
    building(-8,  83, 10, 6, 11, 0, "brick")    # Corbin Ed. Center
    building(-8,  72, 9,  6, 10, 0, "brick")    # Hubbard Hall
    building(-58, 74, 8,  6,  8, 0, "modern")   # Heskett Center
    building(-32, 76, 7,  5,  9, math.radians(5), "brick")  # Devlin Hall

    # ── Central academic (y in [-33,54], x in [-110,20]) ─────────────
    # Admin: cx=-10, cy=42  → y:[42±7]=[35,49] ✓  x:[-20,-0] ✓
    building(-10, 42, 10, 7, 13, 0, "brick")    # Admin Building

    # Library: cx=-8, cy=12 → y:[12±8]=[4,20] ✓  x:[-16,0] ✓
    building(-8, 12, 10, 8, 12, 0, "brick")     # Ablah Library

    # Jabara: cx=-24, cy=20 → x:[-32,-16] ✓  y:[13,27] ✓
    building(-24, 20, 8, 6,  9, math.radians(5), "brick")   # Jabara Hall

    # Morrison: cx=-36, cy=10 → x:[-44,-28] ✓  y:[4,16] ✓
    building(-36, 10, 8, 6, 10, 0, "brick")     # Morrison Hall

    # Grace Wilkie: cx=-12, cy=28 → x:[-19,-5] ✓  y:[22,34] ✓
    building(-12, 28, 7, 5,  8, 0, "brick")     # Grace Wilkie Hall

    # Police/Credit Union: cx=-38, cy=37 → x:[-46,-30] ✓  y:[30,44] ✓
    building(-38, 37, 8, 6,  9, 0, "concrete")

    # Chapel: cx=-24, cy=0 → x:[-31,-17] ✓  y:[-11,11] ✓
    chapel(-24, 0)

    # Plaza of Heroines: cx=-8, cy=-4
    plaza_feature(-8, -4, 7)
    sidewalk(-8, 3, -8, -11, 2.4)
    sidewalk(-8, 20, -8, 5, 2.4)
    sidewalk(-8, 35, -10, 40, 2.2)

    # Duerksen Fine Arts: cx=-68, cy=2 → x:[-78,-58] ✓  y:[-6,10] ✓
    building(-68, 2, 10, 7, 10, math.radians(-5), "brick")

    # Wiedemann: cx=-58, cy=22 → x:[-65,-51] ✓  y:[17,27] ✓
    building(-58, 22, 7, 5,  7, 0, "brick")

    # Jardine: cx=-50, cy=11 → x:[-57,-43] ✓  y:[6,16] ✓
    building(-50, 11, 7, 5,  8, 0, "brick")

    # McKinley: cx=-52, cy=-9 → y:[-16,-2] ✓
    building(-52, -9, 8, 6,  9, 0, "brick")

    # Ulrich Museum: cx=-62, cy=-22 → y:[-29,-15] ✓
    building(-62, -22, 8, 6,  8, 0, "brick")

    # McKnight: cx=-76, cy=-34 → y:[-41,-27] ✓  (Alumni at -42, clear ✓)
    building(-76, -34, 7, 5,  8, 0, "brick")

    # CAC Theater: cx=-62, cy=-34 → y:[-41,-27] ✓
    building(-62, -34, 6, 5,  7, 0, "modern")

    # Fiske Hall: cx=-50, cy=-30 → y:[-37,-23] ✓
    building(-50, -30, 6, 5,  6, 0, "brick")

    # President's Residence: cx=-84, cy=-22 → x:[-91,-77] ✓
    building(-84, -22, 7, 5,  5, 0, "brick")

    # ── East academic (x in [38,80]) cleared of Yale(30+8=38) ────────
    # Lindquist: cx=50, cy=40 → x:[42,58] ✓  y:[33,47] ✓
    building(50, 40, 8, 6,  8, 0, "modern")

    # Media Resources: cx=68, cy=32 → x:[60,76] ✓  y:[25,39] ✓
    building(68, 32, 8, 6,  8, 0, "modern")

    # Wilkins Stadium bldg: cx=60, cy=18 → x:[52,68] ✓  y:[11,25] ✓
    building(60, 18, 8, 6,  8, 0, "brick")

    # Heskett east: cx=50, cy=6 → x:[42,58] ✓  y:[-1,13] ✓
    building(50,  6, 8, 5,  8, 0, "brick")

    # Engineering: cx=68, cy=-12 → x:[59,77] ✓  y:[-20,-4] ✓
    building(68, -12, 9, 7, 12, 0, "glass")

    # Neff/Ahlberg: cx=50, cy=-22 → x:[42,58] ✓  y:[-29,-15] ✓
    building(50, -22, 7, 5,  9, 0, "brick")

    # Geology: cx=52, cy=-32 → y:[-39,-25] ✓
    building(52, -32, 7, 5,  8, 0, "concrete")

    # Donald Beggs: cx=70, cy=-30 → x:[61,79] ✓  y:[-37,-23] ✓
    building(70, -30, 9, 6, 10, 0, "brick")

    # ── Far-east (x in [96,124]) – east of East road(88+8=96) ────────
    building(108, 40, 7, 5,  8, 0, "brick")    # Woodman Alumni Center
    building(114,  5, 6, 5,  6, 0, "modern")   # Printing Building
    building(110,-20, 7, 5,  7, 0, "concrete")  # Visual Communications
    building(114,-57, 6, 5,  5, 0, "modern")   # Greenhouse
    building( 98,-64, 7, 5,  7, 0, "concrete")  # Newman Center
    building( 80,-55, 7, 5,  6, 0, "concrete")  # Beach/Wind Tunnel
    building( 96,-46, 6, 5,  5, 0, "modern")   # Central Energy Plant

    # Water tower: cx=-40, cy=57 – just below North road at 62, y:[51,63]
    # Move slightly: cx=-40, cy=56 → y:[50,62] just touches – move to cy=55, y:[49,61] ✓
    water_tower(-40, 55)

    # Pond: cx=70, cy=50 → x:[56,84] – East road at 88, clear ✓  y:[41,59] – North road at 62, clear ✓
    pond(70, 50, 14, 9)

    # University Methodist Church: cx=52, cy=90 → y:[82,98] ✓  x:[44,60] ✓
    building(52, 90, 8, 7, 11, 0, "brick")

    # South of Alumni: Memorial, Rhatigan, etc.
    # Alumni at y=-42, clear means y < -50 or y > -34
    # Buildings below Alumni: cy ≤ -52 (with half-d=6 → y_max = -52+6=-46 < -42 ✓)

    # Rhatigan: cx=-14, cy=-55 → y:[-62,-48] y_max=-48 > -50... use cy=-57 → y:[-65,-50] ✓
    building(-14, -57, 8, 6,  9, 0, "brick")    # Rhatigan Student Center
    building(  4, -57, 7, 5,  8, 0, "modern")   # Elliott Hall
    building(-24, -56, 7, 5,  7, 0, "brick")    # Human Resources Center
    building( 42, -54, 8, 6,  9, 0, "brick")    # Wallace Hall
    building( 64, -54, 7, 5,  8, 0, "brick")    # Clinton Hall / Neff
    building(-75, -55, 7, 5,  7, 0, "brick")    # Wilner Auditorium
    building(-88, -58, 8, 6,  8, 0, "brick")    # Memorial Hall

    print("  [6/12] Dorms & housing …")
    # Fairmount Towers: cx=-140, cy=88 → x:[-149,-131] ✓  y:[74,102] ✓
    tower_block(-140, 92, 9, 12, 44, 0, "dorm_hi")   # Towers North
    tower_block(-140, 76, 9, 12, 38, 0, "dorm_hi")   # Towers South
    building(-128, 84, 13, 8, 5, 0, "concrete")      # Towers Commons
    building(-150, 95, 8,  6, 5, 0, "brick")         # Child Dev. Center

    # Shocker Hall: cx=10, cy=-92 → y:[-99,-85] – south road at -75, clear ✓
    tower_block(10, -92, 10, 14, 28, 0, "dorm")

    # Brennan Halls: cy=-91 → y:[-95,-87] ✓
    building(-22, -91, 12, 6, 8, 0, "dorm")
    building(  5, -91, 12, 6, 8, 0, "dorm")
    building( 32, -91, 12, 6, 8, 0, "dorm")

    # Greek south (below dorms, cy=-101): y:[-105,-97] ✓
    for gx in (-115, -98, -80, -62):
        building(gx, -101, 7, 6, 5, 0, "brick_lt")

    # Greek north (cy=92, x>38): x cleared of Yale ✓
    for gx in (48, 62, 76, 90):
        building(gx, 92, 6, 5, 5, 0, "brick_lt")

    print("  [7/12] Parking lots …")
    # All lot positions verified not to overlap road bands.

    # Lot 2: cx=-90, cy=40  tot_w=cols16*2.65=42.4 half=21.2+2=23.2 → x:[-113,-67] ✓
    #   rows=2 tot_d=37.8 half=20.9 → y:[19.1,60.9] – North road at 62, clear ✓
    parking_lot(-90, 40, rows=2, cols=16,
                lot_id="2", permit="Faculty/Staff Yellow")

    # Lot 25: cx=-100, cy=-5  cols=12 tot_w=31.8 half=17.9+2=19.9 → x:[-120,-80]
    #   perim at -118, edge=-119.9 ~ -120. Use cx=-96:  x:[-115.9,-76.1] ✓
    #   rows=2 tot_d=37.8 half=20.9 → y:[-25.9,15.9] ✓ (Alumni at -42 clear ✓)
    parking_lot(-96, -5, rows=2, cols=12,
                lot_id="25", permit="Faculty/Staff Yellow")

    # Lot 2W: cx=-115, cy=80  cols=10 tot_w=26.5 half=15.25+2=17.25 → x:[-132,-98] ✓
    #   rows=1 tot_d=16.9 half=10.45 → y:[69.55,90.45] ✓
    parking_lot(-115, 80, rows=1, cols=10,
                lot_id="2W", permit="Student Green")

    # Lot 1N: cx=-106, cy=26 rows=1 cols=9 tot_w=23.85 half=13.9+2=15.9 → x:[-122,-90] ✓
    #   tot_d=16.9 half=10.45 → y:[15.55,36.45] ✓
    parking_lot(-106, 26, rows=1, cols=9,
                lot_id="1N", permit="Open / Visitor")

    # Lot 16: cx=-106, cy=-60 rows=1 cols=10 tot_w=26.5 → x:[-121,-91] ✓
    #   tot_d=16.9 half=10.45 → y:[-70.45,-49.55] ✓ (Alumni at -42, clear ✓)
    parking_lot(-106, -60, rows=1, cols=10,
                lot_id="16", permit="Faculty/Staff")

    # Lot 7: cx=-30, cy=-68 rows=2 cols=11 tot_w=29.15 half=16.6+2=18.6 → x:[-48.6,-11.4] ✓
    #   tot_d=37.8 half=20.9 → y:[-88.9,-47.1] – south road at -75 cuts through.
    #   Use rows=1: tot_d=16.9 → y:[-79.45,-56.55] – south road at -75 still clips.
    #   Place at cy=-65: y:[-75.45,-54.55]. South edge -75.45 at south road. Use cy=-62.
    #   y:[-72.45,-51.55] ✓ (south road -75 clear, Alumni -42 clear ✓)
    parking_lot(-30, -62, rows=1, cols=11,
                lot_id="7", permit="Student Green")

    # Lot 6: cx=60, cy=-65 rows=1 cols=10 → x:[46.7,73.3] ✓  y:[-75.45,-54.55] ✓
    parking_lot(60, -65, rows=1, cols=10,
                lot_id="6", permit="Student/Faculty")

    # Lots 9W/9E: cy=-100 rows=1 → y:[-110.45,-89.55] – south perim at -110 close.
    #   Use cy=-98: y:[-108.45,-87.55] ✓
    parking_lot(-24, -98, rows=1, cols=9, lot_id="9W", permit="Student Green")
    parking_lot(  8, -98, rows=1, cols=9, lot_id="9E", permit="Student Green")

    # Lot 21: cx=120, cy=68 rows=2 cols=10 → x:[106.7,133.3] – edge 133.3 > perim 128. 
    #   Use cx=116: x:[102.7,129.3]. Perim at 128. Very close. cx=113: x:[99.7,126.3] ✓
    #   tot_d=37.8 half=20.9 → y:[47.1,88.9] ✓
    parking_lot(113, 68, rows=2, cols=10, lot_id="21", permit="Faculty/Staff")

    # Lot 27: cx=112, cy=-82 rows=1 cols=9 → x:[98.7,125.3] ✓
    #   tot_d=16.9 half=10.45 → y:[-92.45,-71.55] ✓ (south road -75, clear ✓)
    parking_lot(112, -82, rows=1, cols=9, lot_id="27", permit="General")

    # Lot 2E (Koch overflow): cx=-100, cy=67 rows=1 cols=12 → x:[-117.9,-82.1] ✓
    #   tot_d=16.9 half=10.45 → y:[56.55,77.45] ✓
    parking_lot(-100, 67, rows=1, cols=12, lot_id="2E", permit="Event Parking")

    print("  [8/12] Road signs …")

    # Stop signs at intersections
    for sx, sy, sd in [
        (RD_YALE,  RD_NORTH + 5.5, 90),  (RD_YALE, RD_NORTH - 5.5, 90),
        (RD_YALE,  RD_ALUMNI + 5.5, 90), (RD_YALE, RD_ALUMNI - 5.5, 90),
        (-38,      RD_ALUMNI + 5.5, 0),  (-38,     RD_ALUMNI - 5.5, 0),
        (RD_EAST,  RD_ALUMNI + 5.5, 0),  (RD_EAST, RD_NORTH - 5.5, 0),
        (RD_KOCHX, RD_NORTH + 5.5, 90),
    ]:
        stop_sign(sx, sy, sd)

    # Speed limit signs (placed beside roads, not on them)
    for sx, sy, spd in [
        (22,  85, 15), (22, -20, 15),    # Yale Ave
        (-108, 45, 15), (-108, -15, 15), # West perim
        (-50, -39, 20), (10, -39, 20),   # Alumni Dr
        (95,  -50, 15),                   # South-east section
        (-45, 108, 15),                   # North perim
    ]:
        speed_sign(sx, sy, spd)

    # Yield at roundabout entries
    for yx, yy, yd in [
        (22, RD_NORTH,  90), (38, RD_NORTH, 270),
        (22, RD_ALUMNI, 90), (38, RD_ALUMNI, 270),
        (-44, RD_ALUMNI, 0), (-31, RD_ALUMNI, 180),
        (RD_PERIM_W + 5.5, RD_NORTH, 0),
    ]:
        yield_sign(yx, yy, yd)

    print("  [9/12] Transit stops …")
    for sx, sy, sd, route in [
        (RD_YALE,  87, 90, "North – Shocker Express"),
        (RD_YALE, -82, 90, "South – Shocker Express"),
        (RD_KOCHX, RD_NORTH, 0, "Red – Koch Arena"),
        (RD_YALE,  10, 90, "Blue – Library"),
        (-8, RD_ALUMNI, 0, "Gold – Student Center"),
        (80, RD_NORTH, 90, "Blue – East Campus"),
        (RD_PERIM_W + 5, -42, 90, "Red – Hillside"),
        (0, RD_PERIM_S + 5, 0, "Dorm Shuttle"),
    ]:
        transit_stop(sx, sy, sd, route)

    print("  [10/12] Trees & light poles …")

    # Yale Ave boulevard trees (flanking the road)
    for off in (-4.0, 4.0):
        tree_row(RD_YALE + off, -107, RD_YALE + off, 107, 11)

    # Alumni Drive trees
    for off in (-4.0, 4.0):
        tree_row(-115, RD_ALUMNI + off, 125, RD_ALUMNI + off, 13, 1)

    # North road north-side trees
    tree_row(-115, RD_NORTH + 3.8, 125, RD_NORTH + 3.8, 14)

    # Perimeter border trees
    for tx in range(-108, 118, 16):
        tree(tx,  111, 2.6 + 0.3 * math.sin(tx), 2.1)
        tree(tx, -111, 2.4 + 0.2 * math.cos(tx), 1.9)
    for ty in range(-104, 105, 16):
        tree(-120, ty, 2.4, 2.0)
        tree( 130, ty, 2.4, 2.0)

    # Organic lawn trees (all manually verified clear of road bands)
    lawn_trees = [
        (-5, 50, 3.2, 2.8, 0),   (-20, 46, 2.8, 2.4, 1),
        (44, 36, 3.0, 2.6, 0),   (55, 22, 2.8, 2.4, 1),
        (-44, 26, 3.2, 2.8, 0),  (-36, -15, 2.8, 2.4, 1),
        (18, -18, 3.0, 2.6, 0),  (-66, 36, 2.8, 2.2, 1),
        (80, -38, 3.0, 2.6, 0),  (95, -70, 2.8, 2.4, 0),
        (-50, -66, 3.0, 2.6, 1), (10, -70, 2.8, 2.4, 0),
        (53, 64, 3.2, 2.8, 1),   (-12, 60, 3.0, 2.6, 0),
        (-104, 16, 3.0, 2.6, 0), (116, 26, 2.8, 2.2, 1),
        (116, -50, 3.0, 2.6, 0), (-48, -46, 2.8, 2.4, 1),
        (44, -18, 2.8, 2.2, 0),  (-4, -20, 3.0, 2.6, 1),
    ]
    for lx, ly, lth, lcr, lst in lawn_trees:
        tree(lx, ly, lth, lcr, lst)

    # Street light poles (not on road surfaces, offset by ~4m)
    for lx in range(-108, 120, 18):
        light_pole(lx,  107, 7)
        light_pole(lx, -107, 7)
    for ly in range(-100, 105, 18):
        light_pole(-115, ly, 7)
        light_pole( 125, ly, 7)
        light_pole(  24, ly, 6)   # Yale west side
        light_pole(  36, ly, 6)   # Yale east side

    print("  [11/12] Sidewalks …")
    sidewalk(-8, 22, -8, 34, 2.2)
    sidewalk(-8, 34, -14, 34, 2.0)
    sidewalk(-10, 49, -22, 49, 2.0)
    sidewalk(-20, 2, -28, 10, 2.0)
    sidewalk(44, 10, 58, 10, 2.0)
    sidewalk(-60, 0, -52, 10, 2.0)
    sidewalk(-60, -20, -50, -9, 2.0)

    # Main quad green lawn
    _box([15, 6, 0.04], [0, 28, 0.04], color=C["median"])

    print("  [12/12] Done.\n")


# ═════════════════════════════════════════════════════════════════════
#  CAMERA CONTROLLER
# ═════════════════════════════════════════════════════════════════════

class Camera:
    """
    Smooth keyboard controls + PyBullet built-in mouse:
      Mouse left-drag  = orbit    Mouse right-drag = pan    Scroll = zoom
    """
    DEFAULT = dict(dist=200.0, yaw=28.0, pitch=-50.0, tgt=[0.0, 5.0, 0.0])

    def __init__(self):
        self.dist  = self.DEFAULT["dist"]
        self.yaw   = self.DEFAULT["yaw"]
        self.pitch = self.DEFAULT["pitch"]
        self.tgt   = list(self.DEFAULT["tgt"])

    def reset(self):
        d = self.DEFAULT
        self.dist, self.yaw, self.pitch, self.tgt = (
            d["dist"], d["yaw"], d["pitch"], list(d["tgt"]))

    def apply(self):
        p.resetDebugVisualizerCamera(
            cameraDistance=self.dist,
            cameraYaw=self.yaw,
            cameraPitch=self.pitch,
            cameraTargetPosition=self.tgt,
        )

    def update(self, keys):
        pan  = max(0.7, self.dist * 0.009)
        rot  = 1.6
        zoom = max(2.0, self.dist * 0.04)
        yr   = math.radians(self.yaw)

        def key_down(k):
            return k in keys and keys[k] & p.KEY_IS_DOWN

        def key_trig(k):
            return k in keys and keys[k] & p.KEY_WAS_TRIGGERED

        # Arrow keys → pan target
        if key_down(p.B3G_LEFT_ARROW):
            self.tgt[0] -= pan * math.cos(yr)
            self.tgt[1] -= pan * math.sin(yr)
        if key_down(p.B3G_RIGHT_ARROW):
            self.tgt[0] += pan * math.cos(yr)
            self.tgt[1] += pan * math.sin(yr)
        if key_down(p.B3G_UP_ARROW):
            self.tgt[0] += pan * math.sin(yr)
            self.tgt[1] -= pan * math.cos(yr)
        if key_down(p.B3G_DOWN_ARROW):
            self.tgt[0] -= pan * math.sin(yr)
            self.tgt[1] += pan * math.cos(yr)

        # W/S → tilt
        if key_down(ord('w')): self.pitch = min(-4,  self.pitch + rot)
        if key_down(ord('s')): self.pitch = max(-89, self.pitch - rot)

        # A/D → orbit
        if key_down(ord('a')): self.yaw -= rot
        if key_down(ord('d')): self.yaw += rot

        # +/- or PgUp/PgDn → zoom
        for k in (ord('='), ord('+'), p.B3G_PAGE_UP):
            if key_down(k): self.dist = max(15, self.dist - zoom)
        for k in (ord('-'), ord('_'), p.B3G_PAGE_DOWN):
            if key_down(k): self.dist = min(480, self.dist + zoom)

        # R → reset
        if key_trig(ord('r')): self.reset()

        self.yaw %= 360


# ═════════════════════════════════════════════════════════════════════
#  HUD
# ═════════════════════════════════════════════════════════════════════

def add_hud():
    lines = [
        "─── CAMERA ───",
        "L-drag : Orbit",
        "R-drag : Pan",
        "Scroll : Zoom",
        "Arrows : Pan",
        "A/D    : Orbit",
        "W/S    : Tilt",
        "+/-    : Zoom",
        "R      : Reset",
        "Q      : Quit",
    ]
    for i, ln in enumerate(lines):
        _txt(ln, [-178, 128 - i * 7, 0.5], 1.1, [0.96, 0.88, 0.20])

    _txt("Wichita State University",
         [-35, 135, 1.5], 2.5, [0.96, 0.85, 0.10])
    _txt("Smart Campus Parking Management System",
         [-55, 128, 0.8], 1.4, [0.85, 0.85, 0.85])


# ═════════════════════════════════════════════════════════════════════
#  SMART PARKING NAVIGATION SYSTEM
#  Directed-graph A* with one-way traffic rules and turn-cost penalties.
#
#  Public API:
#    find_valid_path(start_gate_id)  → best lot + full path
#    find_path_to_lot(lot_id, gate)  → path to a specific lot
# ═════════════════════════════════════════════════════════════════════

import heapq as _hq

# ── Waypoint positions [x, z] – mirrors config.js coordinate system ──
_WP = {
    'G_SM':[0,-520],'G_SE':[300,-520],'G_E':[530,0],'G_N':[0,520],
    'G_W':[-530,0],'G_NE':[420,430],'G_NW':[-420,430],
    'NS_S1':[0,-450],'NS_S2':[0,-370],'NS_SC':[0,-200],'NS_MC':[0,-100],
    'NS_NC':[0,100],'NS_NM':[0,200],'NS_N1':[0,380],'NS_N2':[0,450],
    'NS_SPER':[0,-420],
    'R0_S':[0,-26],'R0_SE':[18,-18],'R0_E':[26,0],'R0_NE':[18,18],
    'R0_N':[0,26],'R0_NW':[-18,18],'R0_W':[-26,0],'R0_SW':[-18,-18],
    'R1_S':[0,-322],'R1_SE':[16,-316],'R1_E':[22,-300],'R1_NE':[16,-284],
    'R1_N':[0,-278],'R1_NW':[-16,-284],'R1_W':[-22,-300],'R1_SW':[-16,-316],
    'R2_S':[0,278],'R2_SE':[16,284],'R2_E':[22,300],'R2_NE':[16,316],
    'R2_N':[0,322],'R2_NW':[-16,316],'R2_W':[-22,300],'R2_SW':[-16,284],
    'R3_W':[278,0],'R3_NW':[284,16],'R3_N':[300,22],'R3_NE':[316,16],
    'R3_E':[322,0],'R3_SE':[316,-16],'R3_S':[300,-22],'R3_SW':[284,-16],
    'R4_W':[-322,0],'R4_NW':[-316,16],'R4_N':[-300,22],'R4_NE':[-284,16],
    'R4_E':[-278,0],'R4_SE':[-284,-16],'R4_S':[-300,-22],'R4_SW':[-316,-16],
    'SX_W':[-200,-300],'SX_E':[200,-300],'SX_EE':[290,-300],'SX_WW':[-350,-300],
    'SE_S1':[300,-450],'SE_S2':[300,-360],'SE_N':[300,-280],
    'NR_W':[-400,300],'NR_WM':[-200,300],'NR_EM':[200,300],'NR_E':[400,300],
    'NR_NESPUR':[420,300],'NR_NE':[420,420],'NR_NW':[-420,420],
    'EW_W1':[-450,0],'EW_W2':[-370,0],'EW_WM':[-200,0],'EW_WC':[-100,0],
    'EW_EC':[100,0],'EW_EM':[200,0],'EW_E1':[380,0],'EW_E2':[450,0],
    'HOSP_J':[-300,80],'HOSP_E':[-400,80],
    'APT_J':[-400,0],'APT_S':[-400,-80],
    'PP5_J':[-455,-80],'PP5_ACC2':[-455,-68],
    'DORM_EW':[400,0],'DORM_N':[400,150],'DORM_S':[400,-150],'DORM_SE':[400,-250],
    'SA_W':[0,-420],'SA_M':[175,-420],'SA_P11':[230,-420],'SA_E':[350,-420],
    'RES_N':[300,-100],'RES_M':[300,-220],'RES_E':[360,-220],
    'AS_E1':[100,-200],'AS_E2':[185,-200],
    'EAST_N1':[300,55],'EAST_N2':[300,140],
    'SE_ART':[300,-350],'ART_J':[150,-350],'ART_W':[-150,-350],
    'PP15_J':[-290,-300],'PP15_ACC':[-290,-335],
    'PP1_ACC':[130,-220],'PP13_J':[-420,-80],
    # Lot entry waypoints
    'PP1':[130,-265],'PP2':[185,-215],'PP3':[-310,272],'PP4':[218,378],
    'PP5':[-455,-56],'PP6':[-200,142],'PP7':[418,-257],'PP8':[330,138],
    'PP9':[360,-280],'PP10':[-45,455],'PP11':[230,-413],'PP12':[308,52],
    'PP13':[-420,-28],'PP14':[460,332],'PP15':[-290,-357],
    'PP3_ACC':[-310,300],'PP4_ACC':[218,302],'PP6_N':[-200,82],
}

# ── Directed adjacency list – mirrors CAMPUS.waypoints.links ─────────
_EDGES = {
    'G_SM':['NS_S1'],'G_SE':['SE_S1'],'G_E':['EW_E2'],
    'G_N':['NS_N2'],'G_W':['EW_W1'],'G_NE':['NR_NE'],'G_NW':['NR_NW'],
    'NS_S1':['G_SM','NS_S2'],'NS_S2':['NS_S1','R1_S','NS_SPER'],
    'NS_SPER':['NS_S2','SA_W'],
    'R1_S':['NS_S2','R1_SE','R1_SW'],'R1_SE':['R1_E','R1_S'],
    'R1_E':['R1_NE','SX_E','R1_SE'],'R1_NE':['R1_N','R1_E'],
    'R1_N':['NS_SC','R1_NW','R1_NE'],'R1_NW':['R1_W','R1_N'],
    'R1_W':['R1_SW','SX_W','R1_NW'],'R1_SW':['R1_S','R1_W'],
    'NS_SC':['R1_N','NS_MC','AS_E1'],'NS_MC':['NS_SC','R0_S'],
    'R0_S':['NS_MC','R0_SE','R0_SW'],'R0_SE':['R0_E','R0_S'],
    'R0_E':['R0_NE','EW_EC','R0_SE'],'R0_NE':['R0_N','R0_E'],
    'R0_N':['NS_NC','R0_NW','R0_NE'],'R0_NW':['R0_W','R0_N'],
    'R0_W':['R0_SW','EW_WC','R0_NW'],'R0_SW':['R0_S','R0_W'],
    'NS_NC':['R0_N','NS_NM'],'NS_NM':['NS_NC','R2_S'],
    'R2_S':['NS_NM','R2_SE','R2_SW'],'R2_SE':['R2_E','R2_S'],
    'R2_E':['R2_NE','NR_EM','R2_SE'],'R2_NE':['R2_N','R2_E'],
    'R2_N':['NS_N1','R2_NW','R2_NE'],'R2_NW':['R2_W','R2_N'],
    'R2_W':['R2_SW','NR_WM','R2_NW'],'R2_SW':['R2_S','R2_W'],
    'NS_N1':['R2_N','NS_N2'],'NS_N2':['NS_N1','G_N','PP10'],
    'EW_W1':['G_W','EW_W2'],'EW_W2':['EW_W1','R4_W'],
    'R4_W':['EW_W2','R4_SW','R4_NW'],'R4_NW':['R4_N','R4_W'],
    'R4_N':['HOSP_J','R4_NE','R4_NW'],'R4_NE':['R4_E','R4_N'],
    'R4_E':['EW_WM','R4_SE','R4_NE'],'R4_SE':['R4_S','R4_E'],
    'R4_S':['R4_SW','R4_SE'],'R4_SW':['R4_W','R4_S'],
    'EW_WM':['R4_E','EW_WC','PP6_N'],'EW_WC':['EW_WM','R0_W'],
    'EW_EC':['R0_E','EW_EM'],'EW_EM':['EW_EC','R3_W'],
    'R3_W':['EW_EM','R3_SW','R3_NW'],'R3_NW':['R3_N','R3_W'],
    'R3_N':['EAST_N1','R3_NE','R3_NW'],'R3_NE':['R3_E','R3_N'],
    'R3_E':['EW_E1','R3_SE','R3_NE'],'R3_SE':['R3_S','R3_E'],
    'R3_S':['SE_N','RES_N','R3_SW','R3_SE'],'R3_SW':['R3_W','R3_S'],
    'EW_E1':['R3_E','EW_E2','DORM_EW'],'EW_E2':['EW_E1','G_E'],
    'SX_W':['R1_W','PP15_J'],'SX_WW':['PP15_J'],
    'SX_E':['R1_E','SX_EE'],'SX_EE':['SX_E','SE_N'],
    'SE_S1':['G_SE','SE_S2'],'SE_S2':['SE_S1','SE_N','SE_ART'],
    'SE_N':['SE_S2','R3_S','SX_EE'],'SE_ART':['SE_S2','ART_J'],
    'ART_J':['SE_ART','ART_W'],'ART_W':['ART_J'],
    'NR_NW':['G_NW','NR_W'],'NR_W':['NR_NW','NR_WM'],
    'NR_WM':['NR_W','R2_W','PP3_ACC'],'NR_EM':['R2_E','NR_E','PP4_ACC'],
    'NR_E':['NR_EM','NR_NESPUR','PP14','DORM_N'],
    'NR_NESPUR':['NR_E','NR_NE'],'NR_NE':['NR_NESPUR','G_NE'],
    'HOSP_J':['R4_N','HOSP_E'],'HOSP_E':['HOSP_J','APT_J'],
    'APT_J':['HOSP_E','APT_S'],'APT_S':['APT_J','PP5_J','PP13_J'],
    'PP5_J':['APT_S','PP5_ACC2'],'PP5_ACC2':['PP5_J','PP5'],
    'PP13_J':['APT_S','PP13'],
    'DORM_EW':['EW_E1','DORM_N','DORM_S'],'DORM_N':['DORM_EW','NR_E'],
    'DORM_S':['DORM_EW','DORM_SE'],'DORM_SE':['DORM_S','PP7'],
    'SA_W':['NS_SPER','SA_M'],'SA_M':['SA_W','SA_P11'],
    'SA_P11':['SA_M','SA_E','PP11'],'SA_E':['SA_P11'],
    'RES_N':['R3_S','RES_M'],'RES_M':['RES_N','RES_E'],'RES_E':['RES_M','PP9'],
    'AS_E1':['NS_SC','AS_E2','PP1_ACC'],'AS_E2':['AS_E1','PP2'],
    'PP1_ACC':['PP1','AS_E1'],'PP1':['PP1_ACC'],
    'PP2':['AS_E2'],
    'PP3_ACC':['NR_WM','PP3'],'PP3':['PP3_ACC'],
    'PP4_ACC':['NR_EM','PP4'],'PP4':['PP4_ACC'],
    'PP5':['PP5_ACC2'],
    'PP6_N':['EW_WM','PP6'],'PP6':['PP6_N'],
    'PP7':['DORM_SE'],
    'EAST_N1':['R3_N','PP12','EAST_N2'],'EAST_N2':['EAST_N1','PP8'],
    'PP8':['EAST_N2'],'PP9':['RES_E'],'PP10':['NS_N2'],'PP11':['SA_P11'],
    'PP12':['EAST_N1'],'PP13':['PP13_J'],'PP14':['NR_E'],
    'PP15_J':['SX_W','SX_WW','PP15_ACC'],'PP15_ACC':['PP15_J','PP15'],
    'PP15':['PP15_ACC'],
}

# ── One-way edges: roundabout rings are CCW-only ──────────────────────
# A car may NOT travel the REVERSE of these directed edges.
_ONE_WAY = frozenset([
    ('R0_SW','R0_S'),('R0_S','R0_SE'),('R0_SE','R0_E'),('R0_E','R0_NE'),
    ('R0_NE','R0_N'),('R0_N','R0_NW'),('R0_NW','R0_W'),('R0_W','R0_SW'),
    ('R1_SW','R1_S'),('R1_S','R1_SE'),('R1_SE','R1_E'),('R1_E','R1_NE'),
    ('R1_NE','R1_N'),('R1_N','R1_NW'),('R1_NW','R1_W'),('R1_W','R1_SW'),
    ('R2_SW','R2_S'),('R2_S','R2_SE'),('R2_SE','R2_E'),('R2_E','R2_NE'),
    ('R2_NE','R2_N'),('R2_N','R2_NW'),('R2_NW','R2_W'),('R2_W','R2_SW'),
    ('R3_SW','R3_S'),('R3_S','R3_SE'),('R3_SE','R3_E'),('R3_E','R3_NE'),
    ('R3_NE','R3_N'),('R3_N','R3_NW'),('R3_NW','R3_W'),('R3_W','R3_SW'),
    ('R4_SW','R4_S'),('R4_S','R4_SE'),('R4_SE','R4_E'),('R4_E','R4_NE'),
    ('R4_NE','R4_N'),('R4_N','R4_NW'),('R4_NW','R4_W'),('R4_W','R4_SW'),
])

# ── Gate / lot mappings ───────────────────────────────────────────────
_GATE_WP = {
    'south-main':'G_SM','south-east':'G_SE','east':'G_E',
    'north':'G_N','west':'G_W','northeast':'G_NE','northwest':'G_NW',
}
_LOT_WP = {
    'P1':'PP1','P2':'PP2','P3':'PP3','P4':'PP4','P5':'PP5',
    'P6':'PP6','P7':'PP7','P8':'PP8','P9':'PP9','P10':'PP10',
    'P11':'PP11','P12':'PP12','P13':'PP13','P14':'PP14','P15':'PP15',
}
_LOT_NAMES = {
    'P1':'Admin Parking','P2':'Academic Lot (2 Hr)','P3':'Stadium Lot (Event)',
    'P4':'Arena Lot (Event)','P5':'Hospital Parking','P6':'Library & Arts Lot',
    'P7':'Resident Parking','P8':'Central Parking Garage','P9':'Research Park Lot',
    'P10':'North Visitor Lot','P11':'South Campus Lot',
    'P12':'Engineering & Science Lot','P13':'Medical Campus Lot',
    'P14':'Sports Complex Lot','P15':'Chapel & Arts Lot',
}

_TURN_PENALTY = 8.0   # extra distance-units per radian of heading change


def _wp_dist(a, b):
    pa, pb = _WP[a], _WP[b]
    return math.hypot(pb[0]-pa[0], pb[1]-pa[1])


def _edge_legal(frm, to):
    """Return True if driving from→to is permitted under traffic rules."""
    return (to, frm) not in _ONE_WAY


def _turn_cost(prev, cur, nxt):
    """Turn-angle penalty (distance-units) for the bend prev→cur→nxt."""
    if prev is None:
        return 0.0
    p1, p2, p3 = _WP[prev], _WP[cur], _WP[nxt]
    in_x,  in_z  = p2[0]-p1[0], p2[1]-p1[1]
    out_x, out_z = p3[0]-p2[0], p3[1]-p2[1]
    len_in  = math.hypot(in_x,  in_z)  or 1.0
    len_out = math.hypot(out_x, out_z) or 1.0
    cos_a = max(-1.0, min(1.0,
        (in_x*out_x + in_z*out_z) / (len_in * len_out)))
    return _TURN_PENALTY * math.acos(cos_a)


def _astar(start, end):
    """
    A* on the directed campus graph with turn-cost penalties.

    Returns (path, cost) where path is a list of waypoint keys, or
    (None, inf) when no valid legal path exists.
    """
    if start not in _WP or end not in _WP:
        return None, float('inf')
    if start == end:
        return [start], 0.0

    def h(k):
        a, b = _WP[k], _WP[end]
        return math.hypot(b[0]-a[0], b[1]-a[1])

    # heap entry: (f, g, node, prev_node)
    heap = [(h(start), 0.0, start, None)]
    best_g  = {start: 0.0}
    came_from = {}   # node → prev_node
    closed  = set()

    while heap:
        f, g, cur, prev = _hq.heappop(heap)
        if cur in closed:
            continue
        closed.add(cur)
        came_from[cur] = prev

        if cur == end:
            path = []
            node = cur
            while node is not None:
                path.append(node)
                node = came_from.get(node)
            return list(reversed(path)), g

        for nb in _EDGES.get(cur, []):
            if nb not in _WP or nb in closed:
                continue
            if not _edge_legal(cur, nb):
                continue
            step = _wp_dist(cur, nb) + _turn_cost(prev, cur, nb)
            new_g = g + step
            if new_g < best_g.get(nb, float('inf')):
                best_g[nb] = new_g
                _hq.heappush(heap, (new_g + h(nb), new_g, nb, cur))

    return None, float('inf')


def find_valid_path(start_gate_id='south-main'):
    """
    Find the shortest legal path from a campus gate to the nearest parking lot.

    Considers all 15 parking lots and returns the one reachable with the
    lowest A* cost (Euclidean distance + turn penalties, one-way enforced).

    Args:
        start_gate_id: one of 'south-main', 'south-east', 'east', 'north',
                       'west', 'northeast', 'northwest'

    Returns:
        dict with keys:
          lot_id    – winning lot ('P1'…'P15')
          lot_name  – human-readable lot name
          path      – ordered list of waypoint keys
          cost      – total path cost (distance + turn penalties)
          positions – list of [x, z] world coordinates for the path
        or None if no lot is reachable.
    """
    start_wp = _GATE_WP.get(start_gate_id)
    if not start_wp:
        raise ValueError(
            f"Unknown gate {start_gate_id!r}. "
            f"Valid: {list(_GATE_WP)}"
        )

    best = {'lot_id': None, 'path': None, 'cost': float('inf')}
    for lot_id, end_wp in _LOT_WP.items():
        path, cost = _astar(start_wp, end_wp)
        if path and cost < best['cost']:
            best = {'lot_id': lot_id, 'path': path, 'cost': cost}

    if best['lot_id'] is None:
        return None

    return {
        'lot_id':    best['lot_id'],
        'lot_name':  _LOT_NAMES.get(best['lot_id'], best['lot_id']),
        'path':      best['path'],
        'cost':      best['cost'],
        'positions': [_WP[k] for k in best['path'] if k in _WP],
    }


def find_path_to_lot(lot_id, start_gate_id='south-main'):
    """
    Find the valid path from a campus gate to a specific parking lot.

    Args:
        lot_id:        parking lot ID ('P1'…'P15')
        start_gate_id: entry gate ID

    Returns:
        dict with lot_id, path, cost, positions, or None if unreachable.
    """
    start_wp = _GATE_WP.get(start_gate_id)
    end_wp   = _LOT_WP.get(lot_id)
    if not start_wp or not end_wp:
        return None
    path, cost = _astar(start_wp, end_wp)
    if not path:
        return None
    return {
        'lot_id':    lot_id,
        'lot_name':  _LOT_NAMES.get(lot_id, lot_id),
        'path':      path,
        'cost':      cost,
        'positions': [_WP[k] for k in path if k in _WP],
    }


# ── Quick self-test (run python campus_env.py to verify) ─────────────
def _selftest():
    print("\n── Parking Navigation Self-Test ──")
    for gate in ('south-main', 'east', 'north', 'west'):
        result = find_valid_path(gate)
        if result:
            print(f"  {gate:12s} → {result['lot_id']} ({result['lot_name']})"
                  f"  cost={result['cost']:.0f}  hops={len(result['path'])}")
        else:
            print(f"  {gate:12s} → NO PATH FOUND")
    print()


# ═════════════════════════════════════════════════════════════════════
#  MAIN
# ═════════════════════════════════════════════════════════════════════

def main():
    client = p.connect(p.GUI)
    if client < 0:
        print("ERROR: Could not open PyBullet GUI."); sys.exit(1)

    p.setAdditionalSearchPath(pybullet_data.getDataPath())
    p.setGravity(0, 0, -9.81)
    p.configureDebugVisualizer(p.COV_ENABLE_SHADOWS, 0)  # speed-up
    p.configureDebugVisualizer(p.COV_ENABLE_RGB_BUFFER_PREVIEW, 0)
    p.configureDebugVisualizer(p.COV_ENABLE_WIREFRAME, 0)
    # Keep mouse picking OFF so right-drag pans instead of picking objects
    p.configureDebugVisualizer(p.COV_ENABLE_MOUSE_PICKING, 0)
    p.setRealTimeSimulation(0)
    p.setPhysicsEngineParameter(numSolverIterations=4, fixedTimeStep=1/120.)

    cam = Camera()
    cam.apply()

    print("\n" + "═" * 60)
    print("  WSU Campus Simulation  –  campus_env.py")
    print("═" * 60)
    print("  Building campus… (~30-50 seconds)\n")
    t0 = time.time()
    build_campus()
    add_hud()
    cam.apply()
    print(f"  Campus ready in {time.time()-t0:.1f}s")
    _selftest()
    print("\n  MOUSE: Left-drag=orbit | Right-drag=pan | Scroll=zoom")
    print("  KEYS : Arrows=pan | A/D=orbit | W/S=tilt | +/-=zoom | R=reset | Q=quit")
    print("═" * 60 + "\n")

    while True:
        keys = p.getKeyboardEvents()
        if ord('q') in keys and keys[ord('q')] & p.KEY_WAS_TRIGGERED:
            break
        cam.update(keys)
        cam.apply()
        p.stepSimulation()
        time.sleep(1 / 60)

    p.disconnect()
    print("Goodbye!")


if __name__ == "__main__":
    main()