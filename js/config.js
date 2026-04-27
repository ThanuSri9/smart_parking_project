// Eagle Eye University – Campus Configuration
// Coordinate system: x = east(+)/west(-), z = north(+)/south(-)
// All positions in meters relative to campus center (0,0)

const CAMPUS = {
  name: 'Eagle Eye University',
  abbr: 'EEU',

  // ─── USER START POSITION ───────────────────────────────────────────
  userStart: { gateId: 'south-main', pos: [0, -520] },

  // ─── BUILDINGS ─────────────────────────────────────────────────────
  buildings: [
    // Academic Core
    { id:'main-library',   name:'Main Library',           pos:[-60,  93],  size:[80,32,70],  color:0x6B4323, type:'academic' },
    { id:'admin',          name:'Administration Building', pos:[-60,-248],  size:[90,58,75],  color:0xC8922A, type:'admin' },
    { id:'block-a',        name:'Academic Block A',        pos:[-220,-120], size:[65,42,60], color:0x2E6AB5, type:'academic' },
    { id:'block-b',        name:'Academic Block B',        pos:[-130,-120], size:[65,42,60], color:0x2E6AB5, type:'academic' },
    { id:'block-c',        name:'Academic Block C',        pos:[ 130,-120], size:[65,42,60], color:0x3A7BD5, type:'academic' },
    { id:'block-d',        name:'Academic Block D',        pos:[ 220,-120], size:[65,42,60], color:0x3A7BD5, type:'academic' },
    { id:'block-e',        name:'Academic Block E',        pos:[-225,  88], size:[60,38,55], color:0x4A8BE5, type:'academic' },
    { id:'block-f',        name:'Academic Block F',        pos:[-140,  88], size:[60,38,55], color:0x4A8BE5, type:'academic' },
    { id:'engineering',    name:'Engineering Hall',        pos:[ 155,  88], size:[75,50,70], color:0x1B4F72, type:'academic' },
    { id:'science',        name:'Science Hall',            pos:[ 235,  95], size:[75,50,70], color:0x1B4F72, type:'academic' },
    { id:'business',       name:'Business School',         pos:[  80,-158], size:[80,46,70], color:0x2C3E50, type:'academic' },
    { id:'cs-building',    name:'CS & IT Building',        pos:[ -70,-158], size:[75,50,70], color:0x117A8B, type:'academic' },
    { id:'law-school',     name:'Law School',              pos:[ 170, 120], size:[70,42,65], color:0x2C3E50, type:'academic' },
    { id:'fine-arts',      name:'Fine Arts Center',        pos:[-300, -50], size:[65,36,75], color:0x6C3483, type:'academic' },
    { id:'med-school',     name:'Medical School',          pos:[-370, 140], size:[80,46,75], color:0x922B21, type:'academic' },
    { id:'pharmacy',       name:'Pharmacy School',         pos:[-375,  48], size:[65,40,60], color:0xB7950B, type:'academic' },
    // Student Life
    { id:'student-center', name:'Student Center',          pos:[-65, 155], size:[95,28,85],  color:0xE84118, type:'student' },
    { id:'food-court-1',   name:'Main Food Court',         pos:[-90, 185], size:[75,18,65],  color:0xE74C3C, type:'food' },
    { id:'food-court-2',   name:'North Food Court',        pos:[ 110,200], size:[65,16,55],  color:0xFF6348, type:'food' },
    { id:'recreation-center', name:'Recreation Center',    pos:[-65, 285], size:[105,24,95], color:0x27AE60, type:'recreation' },
    // Sports
    { id:'football-stadium',  name:'Football Stadium',         pos:[-310,390], size:[200,32,160], color:0x2E4053, type:'stadium' },
    { id:'basketball-arena',  name:'Eagle Eye Arena (Basketball)', pos:[ 110,390], size:[130,34,110], color:0x154360, type:'arena' },
    { id:'soccer-field',      name:'Soccer Complex',            pos:[ 340,390], size:[150,10,120], color:0x1E8449, type:'stadium' },
    { id:'aquatic-center',    name:'Aquatic Center',            pos:[ 355,265], size:[80,22,100],  color:0x1ABC9C, type:'sports' },
    { id:'track-complex',     name:'Track & Field',             pos:[-150,368], size:[120,8,100],  color:0x7D6608, type:'sports' },
    // Medical
    { id:'hospital',       name:'University Hospital',     pos:[-460, 80], size:[105,62,95], color:0xCB4335, type:'hospital' },
    // Dorms (east)
    { id:'dorm-a', name:'Eagle Residence Hall A', pos:[ 470,-200], size:[55,66,55], color:0xF0932B, type:'dorm' },
    { id:'dorm-b', name:'Eagle Residence Hall B', pos:[ 470,-110], size:[55,66,55], color:0xF0932B, type:'dorm' },
    { id:'dorm-c', name:'Eagle Residence Hall C', pos:[ 470, -20], size:[55,66,55], color:0xE67E22, type:'dorm' },
    { id:'dorm-d', name:'Eagle Residence Hall D', pos:[ 470,  70], size:[55,66,55], color:0xE67E22, type:'dorm' },
    { id:'dorm-e', name:'Eagle Residence Hall E', pos:[ 470, 160], size:[55,66,55], color:0xD35400, type:'dorm' },
    { id:'dining-hall',    name:'Eagle Dining Hall',       pos:[ 395,  62], size:[70,20,80],  color:0xFF6B6B, type:'food' },
    // Faculty Housing (west)
    { id:'apt-a', name:'Faculty Apartments A', pos:[-480,-180], size:[55,70,55], color:0x7D3C98, type:'housing' },
    { id:'apt-b', name:'Faculty Apartments B', pos:[-480, -80], size:[55,70,55], color:0x7D3C98, type:'housing' },
    { id:'apt-c', name:'Faculty Apartments C', pos:[-480,  48], size:[55,70,55], color:0x6C3483, type:'housing' },
    // Other
    { id:'church',          name:'EEU Chapel',             pos:[-365,-380], size:[45,52,55],  color:0xF5ECD7, type:'chapel' },
    { id:'research-park',   name:'Research Park A',        pos:[ 345,-210], size:[75,42,70],  color:0x148F77, type:'corporate' },
    { id:'research-park-b', name:'Research Park B',        pos:[ 425,-320], size:[65,40,60],  color:0x117A65, type:'corporate' },
    { id:'concert-hall',    name:'Eagle Concert Hall',     pos:[-155,-328], size:[80,36,70],  color:0x76448A, type:'arts' },
    { id:'auditorium',      name:'EEU Auditorium',         pos:[ -70,-328], size:[85,33,75],  color:0x6C3483, type:'arts' },
    { id:'greenhouse',      name:'Greenhouse Complex',     pos:[ 355,-110], size:[60,15,80],  color:0x52BE80, type:'facility' },
    { id:'power-plant',     name:'Central Energy Plant',   pos:[-390,350],  size:[70,36,60],  color:0x717D7E, type:'utility' },
    { id:'bookstore',       name:'EEU Bookstore',          pos:[  60, -60], size:[60,20,55],  color:0xF8C471, type:'student' },
    { id:'post-office',     name:'Campus Post Office',     pos:[ -80, -60], size:[45,16,40],  color:0xF0B27A, type:'facility' },
    { id:'health-center',   name:'Student Health Center',  pos:[ 200, -60], size:[55,22,50],  color:0xF1948A, type:'medical' },
    { id:'chapel-east',     name:'Interfaith Center',      pos:[ 300,-330], size:[40,28,45],  color:0xD5D8DC, type:'chapel' },
  ],

  // ─── PARKING LOTS ──────────────────────────────────────────────────
  // Positions chosen so no lot surface overlaps any road corridor.
  // Road corridors to avoid: N-S spine x=0±7, E-W spine z=0±7,
  // south cross z=-300±5, academic north z=50±5, academic east x=280±5,
  // hospital z=80±5, dorm road x=400±5, sports z=380±6, north z=300±6.
  parkingLots: [
    { id:'P1',  name:'Admin Parking (No Limit)',           pos:[ 155,-262], size:[ 90,55], spots:48, timeLimit:null, paid:false, rate:0,  isEvent:false, forBuildings:['admin','business','cs-building'],                    color:0x1C2833 },
    { id:'P2',  name:'Academic Lot (2 Hr)',                pos:[ 185,-237], size:[ 75,50], spots:38, timeLimit:120,  paid:false, rate:0,  isEvent:false, forBuildings:['block-a','block-b','block-c','block-d','main-library'],color:0x1C2833 },
    { id:'P3',  name:'Stadium Lot — Event (Paid)',         pos:[-310,262],  size:[118,60], spots:90, timeLimit:null, paid:true,  rate:10, isEvent:true,  forBuildings:['football-stadium'],                                  color:0x1A2E1A },
    { id:'P4',  name:'Arena Lot — Event (Paid)',           pos:[ 218,378],  size:[ 80,80], spots:80, timeLimit:null, paid:true,  rate:8,  isEvent:true,  forBuildings:['basketball-arena','soccer-field'],                   color:0x1A2E1A },
    { id:'P5',  name:'Hospital Parking (2 Hr)',            pos:[-455,-30],  size:[ 70,50], spots:34, timeLimit:120,  paid:false, rate:0,  isEvent:false, forBuildings:['hospital','pharmacy'],                               color:0x1C2833 },
    { id:'P6',  name:'Library & Arts Lot (2 Hr)',          pos:[-200,168],  size:[ 75,50], spots:30, timeLimit:120,  paid:false, rate:0,  isEvent:false, forBuildings:['main-library','block-e','block-f'],                  color:0x1C2833 },
    { id:'P7',  name:'Resident Parking (Permit)',          pos:[ 428,-258], size:[ 44,48], spots:40, timeLimit:null, paid:false, rate:0,  isEvent:false, forBuildings:['dorm-a','dorm-b','dorm-c','dorm-d','dorm-e','dining-hall'], color:0x1C2833 },
    { id:'P8',  name:'Central Parking Garage (Paid)',      pos:[ 345,138],  size:[ 90,70], spots:68, timeLimit:null, paid:true,  rate:3,  isEvent:false, forBuildings:['student-center','food-court-1','food-court-2','law-school'], color:0x202020 },
    { id:'P9',  name:'Research Park Lot',                  pos:[ 360,-295], size:[ 55,55], spots:40, timeLimit:null, paid:false, rate:0,  isEvent:false, forBuildings:['research-park','research-park-b','greenhouse'],        color:0x1C2833 },
    { id:'P10', name:'North Visitor Lot (3 Hr)',           pos:[ -90,460],  size:[ 85,50], spots:40, timeLimit:180,  paid:false, rate:0,  isEvent:false, forBuildings:['football-stadium','basketball-arena'],                color:0x1C2833 },
    { id:'P11', name:'South Campus Lot',                   pos:[ 230,-385], size:[ 88,55], spots:44, timeLimit:null, paid:false, rate:0,  isEvent:false, forBuildings:['admin','church','auditorium','concert-hall'],         color:0x1C2833 },
    { id:'P12', name:'Engineering & Science Lot (2 Hr)',   pos:[ 308, 52],  size:[ 65,40], spots:32, timeLimit:120,  paid:false, rate:0,  isEvent:false, forBuildings:['engineering','science'],                             color:0x1C2833 },
    { id:'P13', name:'Medical Campus Lot',                 pos:[-420,-55],  size:[ 65,55], spots:36, timeLimit:null, paid:false, rate:0,  isEvent:false, forBuildings:['hospital','med-school','pharmacy'],                  color:0x1C2833 },
    { id:'P14', name:'Sports Complex Lot (Event)',         pos:[ 460,338],  size:[ 58,52], spots:42, timeLimit:null, paid:true,  rate:5,  isEvent:true,  forBuildings:['soccer-field','aquatic-center','track-complex'],      color:0x1A2E1A },
    { id:'P15', name:'Chapel & Arts Lot (2 Hr)',           pos:[-290,-385], size:[ 82,55], spots:34, timeLimit:120,  paid:false, rate:0,  isEvent:false, forBuildings:['church','concert-hall','auditorium'],                 color:0x1C2833 },
  ],

  // ─── GATES ─────────────────────────────────────────────────────────
  gates: [
    { id:'south-main', name:'South Main Gate',  pos:[   0,-520], angle: Math.PI },
    { id:'south-east', name:'Southeast Gate',   pos:[ 300,-520], angle: Math.PI },
    { id:'east',       name:'East Gate',         pos:[ 530,   0], angle: Math.PI/2 },
    { id:'north',      name:'North Gate',        pos:[   0, 520], angle: 0 },
    { id:'west',       name:'West Gate',         pos:[-530,   0], angle:-Math.PI/2 },
    { id:'northeast',  name:'Northeast Gate',    pos:[ 420, 430], angle: Math.PI/4 },
    { id:'northwest',  name:'Northwest Gate',    pos:[-420, 430], angle:-Math.PI/4 },
  ],

  // ─── ROAD SEGMENTS [x1,z1, x2,z2, width] ──────────────────────────
  roads: [
    // Perimeter ring
    [-530,-420, 530,-420, 12], [-530,420, 530,420, 12],
    [-530,-420,-530, 420, 12], [ 530,-420, 530,420, 12],
    // Main N-S spine (x=0)
    [0,-520, 0, 520, 14],
    // Main E-W spine (z=0)
    [-530,0, 530, 0, 14],
    // South cross-road (z=-300, links south roundabout E/W)
    [-450,-300, 450,-300, 10],
    // Academic inner loop
    [-260,-200, 280,-200, 10], [-260, 50, 280, 50, 10],
    [-260,-200,-260, 50, 10],  [ 280,-200, 280, 50, 10],
    // North campus road (z=300)
    [-450,300, 450,300, 12],
    // Sports connector (z=380)
    [-450,380, 480,380, 12],
    // South lot access (z=-420)
    [0,-420, 350,-420, 10],
    // Hospital access (z=80)
    [-530,80,-300,80, 10],
    // Dorm road (x=400) — extended to north campus road z=300
    [400,-250, 400, 300, 10],
    // East spine road (x=300, SE gate to east roundabout)
    [300,-520, 300, 0, 10],
    // Research park road (x=300, south branch)
    [300,-18, 300,-350, 10],
    // West faculty road (x=-400) — extended to hospital road level z=80
    [-400,-250,-400, 80, 10],
    // Arts south road (z=-350)
    [-200,-350, 300,-350, 10],
    // West roundabout N exit to hospital road
    [-300,18,-300,80, 8],
    // Event lot access roads
    [-450,300,-300,300, 10], [50,300, 480,300, 10],
    // East campus north spur (P8, P12 access)
    [300, 18, 300, 165, 8],
    // P8 east spur (EAST_N2 → PP8, 30 m east)
    [300, 138, 330, 138, 8],
    // NE gate approach spur (north road x=420 → NE perimeter)
    [420, 300, 420, 420, 10],
    // West inner-north spur (P6 access — stops at lot south edge)
    [-200, 0, -200, 142, 8],
    // Academic south-east cross (P2 / PP1 access) — extended to x=200
    [0, -200, 200, -200, 8],
    // P2 short south spur (AS_E2 → PP2, 15 m south)
    [185, -200, 185, -215, 8],
    // PP1 spur: east jog then south to P1 lot
    [100, -200, 130, -200, 8], [130, -200, 130, -265, 8],
    // West faculty south spur (P5 / P13 access)
    [-400, 0, -400, -80, 8], [-400, -80, -455, -80, 8],
    // P5 south entrance spur (stops at lot south edge, not inside)
    [-455, -80, -455, -56, 8],
    // P13 north spur (PP13 chain)
    [-420, -80, -420, -27, 8],
    // P3 stadium lot south spur (from north road)
    [-310, 300, -310, 262, 8],
    // P4 arena lot north spur (from sports east road z=300)
    [218, 300, 218, 380, 8],
    // P7 dorm lot spur (from dorm road south end)
    [400, -250, 428, -258, 8],
    // P9 research lot spurs (east + south from RES_M)
    [300, -220, 360, -220, 8], [360, -220, 360, -295, 8],
    // P10 north visitor lot spur (from NS_N2)
    [0, 450, -90, 460, 8],
    // P11 south campus lot spur (from SA road north into lot)
    [230, -420, 230, -385, 8],
    // P14 sports complex lot spur (from NR_E east)
    [400, 300, 460, 340, 8],
    // P15 chapel/arts lot spur (south from cross road z=-300 to lot north edge)
    [-290, -300, -290, -357, 8],
  ],

  // ─── ROUNDABOUTS ───────────────────────────────────────────────────
  roundabouts: [
    { pos:[   0,   0], r:22 },
    { pos:[   0,-300], r:18 },
    { pos:[   0, 300], r:18 },
    { pos:[ 300,   0], r:18 },
    { pos:[-300,   0], r:18 },
  ],

  // ─── WAYPOINT GRAPH ────────────────────────────────────────────────
  // Each node: { pos:[x,z], links:['key',...] }
  // Ring order through roundabouts: S→E→N→W (clockwise on map, US-style)
  waypoints: {
    // ── Gates
    'G_SM':   { pos:[  0,-520], links:['NS_S1'] },
    'G_SE':   { pos:[300,-520], links:['SE_S1'] },
    'G_E':    { pos:[530,   0], links:['EW_E2'] },
    'G_N':    { pos:[  0, 520], links:['NS_N2'] },
    'G_W':    { pos:[-530,  0], links:['EW_W1'] },
    'G_NE':   { pos:[420, 430], links:['NR_NE'] },
    'G_NW':   { pos:[-420,430], links:['NR_NW'] },

    // ── N-S Spine (x=0)
    'NS_S1':  { pos:[  0,-450], links:['G_SM','NS_S2'] },
    'NS_S2':  { pos:[  0,-370], links:['NS_S1','R1_S','NS_SPER'] },
    'NS_SPER':{ pos:[  0,-420], links:['NS_S2','SA_W'] },    // south perimeter junction
    // South roundabout (0,-300) – CCW ring (S→SE→E→NE→N→NW→W→SW→S)
    // Nodes at R=22 so chord midpoints (22·cos22.5°=20.3) clear inner island edge (17.5)
    'R1_S':   { pos:[  0,-322], links:['NS_S2','R1_SE','R1_SW'] },  // SE first = CCW
    'R1_SE':  { pos:[ 16,-316], links:['R1_E','R1_S'] },
    'R1_E':   { pos:[ 22,-300], links:['R1_NE','SX_E','R1_SE'] },
    'R1_NE':  { pos:[ 16,-284], links:['R1_N','R1_E'] },
    'R1_N':   { pos:[  0,-278], links:['NS_SC','R1_NW','R1_NE'] },  // exit first, then CCW
    'R1_NW':  { pos:[-16,-284], links:['R1_W','R1_N'] },
    'R1_W':   { pos:[-22,-300], links:['R1_SW','SX_W','R1_NW'] },
    'R1_SW':  { pos:[-16,-316], links:['R1_S','R1_W'] },
    'NS_SC':  { pos:[  0,-200], links:['R1_N','NS_MC','AS_E1'] },
    'NS_MC':  { pos:[  0,-100], links:['NS_SC','R0_S'] },
    // Center roundabout (0,0) – CCW ring (S→SE→E→NE→N→NW→W→SW→S)
    // Nodes at R=26 so chord midpoints (26·cos22.5°=24.0) clear inner island edge (21.5)
    'R0_S':   { pos:[  0,-26],  links:['NS_MC','R0_SE','R0_SW'] },  // SE first = CCW
    'R0_SE':  { pos:[ 18,-18],  links:['R0_E','R0_S'] },
    'R0_E':   { pos:[ 26,  0],  links:['R0_NE','EW_EC','R0_SE'] },
    'R0_NE':  { pos:[ 18, 18],  links:['R0_N','R0_E'] },
    'R0_N':   { pos:[  0, 26],  links:['NS_NC','R0_NW','R0_NE'] },  // exit first, then CCW
    'R0_NW':  { pos:[-18, 18],  links:['R0_W','R0_N'] },
    'R0_W':   { pos:[-26,  0],  links:['R0_SW','EW_WC','R0_NW'] },
    'R0_SW':  { pos:[-18,-18],  links:['R0_S','R0_W'] },
    'NS_NC':  { pos:[  0, 100], links:['R0_N','NS_NM'] },
    'NS_NM':  { pos:[  0, 200], links:['NS_NC','R2_S'] },
    // North roundabout (0,300) – CCW ring
    // Nodes at R=22: chord midpoints clear inner island edge (17.5)
    'R2_S':   { pos:[  0, 278], links:['NS_NM','R2_SE','R2_SW'] },
    'R2_SE':  { pos:[ 16, 284], links:['R2_E','R2_S'] },
    'R2_E':   { pos:[ 22, 300], links:['R2_NE','NR_EM','R2_SE'] },
    'R2_NE':  { pos:[ 16, 316], links:['R2_N','R2_E'] },
    'R2_N':   { pos:[  0, 322], links:['NS_N1','R2_NW','R2_NE'] },
    'R2_NW':  { pos:[-16, 316], links:['R2_W','R2_N'] },
    'R2_W':   { pos:[-22, 300], links:['R2_SW','NR_WM','R2_NW'] },
    'R2_SW':  { pos:[-16, 284], links:['R2_S','R2_W'] },
    'NS_N1':  { pos:[  0, 380], links:['R2_N','NS_N2'] },
    'NS_N2':  { pos:[  0, 450], links:['NS_N1','G_N','PP10'] },

    // ── E-W Spine (z=0)
    'EW_W1':  { pos:[-450,  0], links:['G_W','EW_W2'] },
    'EW_W2':  { pos:[-370,  0], links:['EW_W1','R4_W'] },
    // West roundabout (-300,0)
    // West roundabout (-300,0) – CCW ring — nodes at R=22
    'R4_W':   { pos:[-322,  0], links:['EW_W2','R4_SW','R4_NW'] },
    'R4_NW':  { pos:[-316, 16], links:['R4_N','R4_W'] },
    'R4_N':   { pos:[-300, 22], links:['HOSP_J','R4_NE','R4_NW'] },
    'R4_NE':  { pos:[-284, 16], links:['R4_E','R4_N'] },
    'R4_E':   { pos:[-278,  0], links:['EW_WM','R4_SE','R4_NE'] },  // exit east first, then CCW
    'R4_SE':  { pos:[-284,-16], links:['R4_S','R4_E'] },
    'R4_S':   { pos:[-300,-22], links:['R4_SW','R4_SE'] },
    'R4_SW':  { pos:[-316,-16], links:['R4_W','R4_S'] },
    'EW_WM':  { pos:[-200,  0], links:['R4_E','EW_WC','PP6_N'] },
    'EW_WC':  { pos:[-100,  0], links:['EW_WM','R0_W'] },
    'EW_EC':  { pos:[ 100,  0], links:['R0_E','EW_EM'] },
    'EW_EM':  { pos:[ 200,  0], links:['EW_EC','R3_W'] },
    // East roundabout (300,0)
    // East roundabout (300,0) – CCW ring — nodes at R=22
    'R3_W':   { pos:[ 278,  0], links:['EW_EM','R3_SW','R3_NW'] },
    'R3_NW':  { pos:[ 284, 16], links:['R3_N','R3_W'] },
    'R3_N':   { pos:[ 300, 22], links:['EAST_N1','R3_NE','R3_NW'] },
    'R3_NE':  { pos:[ 316, 16], links:['R3_E','R3_N'] },
    'R3_E':   { pos:[ 322,  0], links:['EW_E1','R3_SE','R3_NE'] },
    'R3_SE':  { pos:[ 316,-16], links:['R3_S','R3_E'] },
    'R3_S':   { pos:[ 300,-22], links:['SE_N','RES_N','R3_SW','R3_SE'] },
    'R3_SW':  { pos:[ 284,-16], links:['R3_W','R3_S'] },
    'EW_E1':  { pos:[ 380,  0], links:['R3_E','EW_E2','DORM_EW'] },
    'EW_E2':  { pos:[ 450,  0], links:['EW_E1','G_E'] },

    // ── South cross-road (z=-300)
    'SX_W':   { pos:[-200,-300], links:['R1_W','PP15_J'] },
    'SX_WW':  { pos:[-350,-300], links:['PP15_J'] },
    'SX_E':   { pos:[ 200,-300], links:['R1_E','SX_EE'] },
    'SX_EE':  { pos:[ 290,-300], links:['SX_E','SE_N'] },  // connects to SE gate road

    // ── SE gate road (x=300, south)
    'SE_S1':  { pos:[300,-450], links:['G_SE','SE_S2'] },
    'SE_S2':  { pos:[300,-360], links:['SE_S1','SE_N','SE_ART'] },
    'SE_N':   { pos:[300,-280], links:['SE_S2','R3_S','SX_EE'] },
    'SE_ART': { pos:[300,-350], links:['SE_S2','ART_J'] },   // arts road junction

    // ── Arts south road (z=-350)
    'ART_J':  { pos:[ 150,-350], links:['SE_ART','ART_W'] },
    'ART_W':  { pos:[-150,-350], links:['ART_J'] },

    // ── North road (z=300)
    'NR_NW':  { pos:[-420,420], links:['G_NW','NR_W'] },
    'NR_W':   { pos:[-400,300], links:['NR_NW','NR_WM'] },
    'NR_WM':  { pos:[-200,300], links:['NR_W','R2_W','PP3_ACC'] },
    'NR_EM':  { pos:[ 200,300], links:['R2_E','NR_E','PP4_ACC'] },
    'NR_E':   { pos:[ 400,300], links:['NR_EM','NR_NESPUR','PP14','DORM_N'] },
    'NR_NESPUR':{ pos:[ 420,300], links:['NR_E','NR_NE'] },  // on north road, NE gate spur
    'NR_NE':  { pos:[ 420,420], links:['NR_NESPUR','G_NE'] },

    // ── Hospital road (z=80)
    'HOSP_J': { pos:[-300, 80], links:['R4_N','HOSP_E'] },
    'HOSP_E': { pos:[-400, 80], links:['HOSP_J','APT_J'] },  // west faculty meets hospital road

    // ── West faculty road (x=-400, south branch)
    'APT_J':  { pos:[-400,  0], links:['HOSP_E','APT_S'] },
    'APT_S':  { pos:[-400,-80], links:['APT_J','PP5_J','PP13_J'] },
    'PP5_J':  { pos:[-455,-80], links:['APT_S','PP5_ACC2'] },
    'PP13_J': { pos:[-420,-80], links:['APT_S','PP13'] },

    // ── Dorm road (x=400) — reached via EW spine (EW_E1), not diagonal from roundabout
    'DORM_EW':{ pos:[ 400,   0], links:['EW_E1','DORM_N','DORM_S'] },
    'DORM_N': { pos:[ 400, 150], links:['DORM_EW','NR_E'] },
    'DORM_S': { pos:[ 400,-150], links:['DORM_EW','DORM_SE'] },
    'DORM_SE':{ pos:[ 400,-250], links:['DORM_S','PP7'] },       // spur to dorm lot P7

    // ── South access lot road (z=-420)
    'SA_W':   { pos:[  0,-420], links:['NS_SPER','SA_M'] },
    'SA_M':   { pos:[175,-420], links:['SA_W','SA_P11'] },
    'SA_P11': { pos:[230,-420], links:['SA_M','SA_E','PP11'] }, // junction for P11 spur
    'SA_E':   { pos:[350,-420], links:['SA_P11'] },

    // ── Research road (x=300, south of east roundabout)
    'RES_N':  { pos:[300,-100], links:['R3_S','RES_M'] },
    'RES_M':  { pos:[300,-220], links:['RES_N','RES_E'] },
    'RES_E':  { pos:[360,-220], links:['RES_M','PP9'] },   // east spur to P9

    // ── Parking lot access nodes
    'PP1':    { pos:[ 130,-265], links:['PP1_ACC'] },
    'PP1_ACC':{ pos:[ 130,-220], links:['PP1','AS_E1'] },
    // P1 & P2 – Admin/Academic Lots: accessed from south academic east road
    'AS_E1':  { pos:[ 100,-200], links:['NS_SC','AS_E2','PP1_ACC'] },
    'AS_E2':  { pos:[ 185,-200], links:['AS_E1','PP2'] },   // on academic east road at P2 x
    'PP2':    { pos:[ 185,-215], links:['AS_E2'] },          // short south spur into P2 entrance
    'PP3_ACC':{ pos:[-310, 300], links:['NR_WM','PP3'] },   // on N-road, west spur south to P3
    'PP3':    { pos:[-310, 272], links:['PP3_ACC'] },
    'PP4_ACC':{ pos:[ 218, 302], links:['NR_EM','PP4'] },  // spur north to new P4 position
    'PP4':    { pos:[ 218, 378], links:['PP4_ACC'] },
    // P5 – Hospital Parking: accessed via west faculty south spur
    'PP5_ACC2':{ pos:[-455,-68], links:['PP5_J','PP5'] },
    'PP5':    { pos:[-455,-56], links:['PP5_ACC2'] },
    // P6 – Library Lot: accessed from EW_WM via north spur
    'PP6_N':  { pos:[-200,  82], links:['EW_WM','PP6'] },
    'PP6':    { pos:[-200, 142], links:['PP6_N'] },
    'PP7':    { pos:[ 418,-257], links:['DORM_SE'] },   // P7 lot entrance, south of dorms
    // P8 – Central Garage: accessed via east campus north spur
    'EAST_N1':{ pos:[ 300,  55], links:['R3_N','PP12','EAST_N2'] },
    'EAST_N2':{ pos:[ 300, 140], links:['EAST_N1','PP8'] },
    'PP8':    { pos:[ 330, 138], links:['EAST_N2'] },
    'PP9':    { pos:[ 360,-280], links:['RES_E'] },    // P9 lot entrance, south of research park
    'PP10':   { pos:[ -45, 455], links:['NS_N2'] },    // north visitor lot entrance
    'PP11':   { pos:[ 230,-413], links:['SA_P11'] },   // south campus lot entrance
    // P12 – Engineering Lot: off east campus north spur
    'PP12':   { pos:[ 308,  52], links:['EAST_N1'] },
    // P13 – Medical Lot: accessed via west faculty south spur
    'PP13':   { pos:[-420, -28], links:['PP13_J'] },   // north entrance to P13 lot
    'PP14':   { pos:[ 460, 332], links:['NR_E'] },     // sports complex lot
    'PP15_J':  { pos:[-290,-300], links:['SX_W','SX_WW','PP15_ACC'] },  // junction on south cross road
    'PP15_ACC':{ pos:[-290,-335], links:['PP15_J','PP15'] },
    'PP15':    { pos:[-290,-357], links:['PP15_ACC'] },
  },

  lotToWaypoint: {
    'P1':'PP1','P2':'PP2','P3':'PP3','P4':'PP4','P5':'PP5',
    'P6':'PP6','P7':'PP7','P8':'PP8','P9':'PP9','P10':'PP10',
    'P11':'PP11','P12':'PP12','P13':'PP13','P14':'PP14','P15':'PP15',
  },

  gateToWaypoint: {
    'south-main':'G_SM','south-east':'G_SE','east':'G_E',
    'north':'G_N','west':'G_W','northeast':'G_NE','northwest':'G_NW',
  },

  buildingParking: {
    'main-library':['P6','P2','P1'],    'admin':['P1','P2','P11'],
    'block-a':['P2','P6','P1'],         'block-b':['P2','P6','P1'],
    'block-c':['P2','P1','P12'],        'block-d':['P2','P1','P12'],
    'block-e':['P6','P2','P1'],         'block-f':['P6','P2','P1'],
    'engineering':['P12','P2','P8'],    'science':['P12','P8','P2'],
    'business':['P1','P2','P11'],       'cs-building':['P1','P2','P6'],
    'law-school':['P8','P12','P7'],     'fine-arts':['P6','P2','P15'],
    'med-school':['P13','P5','P6'],     'pharmacy':['P5','P13','P6'],
    'student-center':['P8','P6','P12'], 'food-court-1':['P8','P6','P2'],
    'food-court-2':['P8','P12','P7'],   'recreation-center':['P8','P7','P12'],
    'football-stadium':['P3','P10','P15'], 'basketball-arena':['P4','P10','P14'],
    'soccer-field':['P4','P14','P10'],  'aquatic-center':['P14','P4','P7'],
    'track-complex':['P10','P3','P4'],  'hospital':['P5','P13','P6'],
    'dorm-a':['P7','P8','P12'],         'dorm-b':['P7','P8','P12'],
    'dorm-c':['P7','P8','P12'],         'dorm-d':['P7','P8','P12'],
    'dorm-e':['P7','P8','P14'],         'dining-hall':['P7','P8','P12'],
    'apt-a':['P6','P5','P13'],          'apt-b':['P5','P13','P6'],
    'apt-c':['P5','P6','P13'],          'church':['P15','P11','P2'],
    'research-park':['P9','P12','P7'],  'research-park-b':['P9','P12','P7'],
    'concert-hall':['P15','P11','P2'],  'auditorium':['P15','P11','P2'],
    'greenhouse':['P9','P12','P7'],     'bookstore':['P2','P1','P8'],
    'health-center':['P12','P8','P7'],
  },

  eventParking: {
    'football-stadium':  { paid:['P3'], free:['P10','P15'] },
    'basketball-arena':  { paid:['P4'], free:['P10','P14'] },
    'soccer-field':      { paid:['P14','P4'], free:['P10'] },
    'concert-hall':      { paid:[], free:['P15','P11','P2'] },
    'auditorium':        { paid:[], free:['P15','P11','P2'] },
  },

  // ─── TRAFFIC LIGHTS ─ positions of controlled intersections ───────
  trafficLights: [
    // Center roundabout entries
    { pos:[ 0,-35], id:'TL_R0_S' }, { pos:[35, 0], id:'TL_R0_E' },
    { pos:[ 0, 35], id:'TL_R0_N' }, { pos:[-35,0], id:'TL_R0_W' },
    // South roundabout entries
    { pos:[ 0,-335], id:'TL_R1_S' }, { pos:[35,-300], id:'TL_R1_E' },
    { pos:[ 0,-265], id:'TL_R1_N' }, { pos:[-35,-300], id:'TL_R1_W' },
    // North roundabout entries
    { pos:[ 0, 265], id:'TL_R2_S' }, { pos:[35, 300], id:'TL_R2_E' },
    { pos:[ 0, 335], id:'TL_R2_N' }, { pos:[-35,300], id:'TL_R2_W' },
    // East roundabout entries
    { pos:[265,0], id:'TL_R3_W' },   { pos:[300,-35], id:'TL_R3_S' },
    { pos:[335,0], id:'TL_R3_E' },   { pos:[300, 35], id:'TL_R3_N' },
    // West roundabout entries
    { pos:[-335,0], id:'TL_R4_W' },  { pos:[-300,-35], id:'TL_R4_S' },
    { pos:[-265,0], id:'TL_R4_E' },  { pos:[-300, 35], id:'TL_R4_N' },
    // Hospital junction
    { pos:[-300,65], id:'TL_HOSP' },
    // South perimeter
    { pos:[ 0,-435], id:'TL_SPER' },
  ],

  // ─── ZEBRA CROSSINGS [x, z, width, angle] ─────────────────────────
  zebraCrossings: [
    // Main gate entries
    [ 0,-490, 16, 0], [300,-490, 14, 0], [530,-30, 14, Math.PI/2],
    [ 0, 490, 16, 0], [-530,-30, 14, Math.PI/2],
    // Center roundabout exits
    [ 0,-45, 14, 0], [45, 0, 14, Math.PI/2], [ 0, 45, 14, 0], [-45, 0, 14, Math.PI/2],
    // Student center / food court area
    [-80, 150, 14, 0], [ 80, 150, 14, 0], [ 0, 100, 14, Math.PI/2],
    // Academic area
    [-180,-200, 12, 0], [180,-200, 12, 0],
    // Hospital
    [-460, 60, 12, Math.PI/2],
    // Dorm area
    [460,-100, 12, Math.PI/2],
  ],

  // ─── TRAFFIC RULES ────────────────────────────────────────────────
  // One-way edges: roundabout rings are CCW-only (counterclockwise from above).
  // The REVERSE of any listed pair is an illegal manoeuvre.
  // Built into a Set at startup by Navigation.init() for O(1) lookup.
  trafficRules: {
    oneWayEdges: [
      // Center roundabout CCW: SW→S→SE→E→NE→N→NW→W→SW
      ['R0_SW','R0_S'],['R0_S','R0_SE'],['R0_SE','R0_E'],['R0_E','R0_NE'],
      ['R0_NE','R0_N'],['R0_N','R0_NW'],['R0_NW','R0_W'],['R0_W','R0_SW'],
      // South roundabout CCW
      ['R1_SW','R1_S'],['R1_S','R1_SE'],['R1_SE','R1_E'],['R1_E','R1_NE'],
      ['R1_NE','R1_N'],['R1_N','R1_NW'],['R1_NW','R1_W'],['R1_W','R1_SW'],
      // North roundabout CCW
      ['R2_SW','R2_S'],['R2_S','R2_SE'],['R2_SE','R2_E'],['R2_E','R2_NE'],
      ['R2_NE','R2_N'],['R2_N','R2_NW'],['R2_NW','R2_W'],['R2_W','R2_SW'],
      // East roundabout CCW
      ['R3_SW','R3_S'],['R3_S','R3_SE'],['R3_SE','R3_E'],['R3_E','R3_NE'],
      ['R3_NE','R3_N'],['R3_N','R3_NW'],['R3_NW','R3_W'],['R3_W','R3_SW'],
      // West roundabout CCW
      ['R4_SW','R4_S'],['R4_S','R4_SE'],['R4_SE','R4_E'],['R4_E','R4_NE'],
      ['R4_NE','R4_N'],['R4_N','R4_NW'],['R4_NW','R4_W'],['R4_W','R4_SW'],
    ],
    // Cost penalty (distance-units) per radian of heading change.
    // Discourages unnecessary turns and U-turns (π rad ≈ 25 extra units).
    turnPenaltyFactor: 8.0,
  },

  // ─── SPECIAL FEATURES ──────────────────────────────────────────────
  waterPond:  { pos:[210, 390], rx:70, rz:45 },
  bridge:     { x1:145,z1:390, x2:275,z2:390, w:14 },
  park:       { pos:[ -30, 395], w:110, d:90 },
  storageTanks: [[-385,320],[-420,320],[-385,360],[-420,360]],
  foodStalls: [
    {pos:[-50,190],name:'Campus Café'},{pos:[50,190],name:'Quick Eats'},
    {pos:[-200,200],name:'West Café'},{pos:[250,150],name:'East Snack Bar'},
    {pos:[0,-80],name:'Library Café'},
  ],
};
