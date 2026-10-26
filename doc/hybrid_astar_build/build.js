// Builds doc/Hybrid_Astar_Group_B9.pptx.  Figures come from figs.py / figs2.py / figs3.py (the real planner).
const pptxgen = require("pptxgenjs");
const { applyTheme } = require("C:/Users/harshithKV/AppData/Roaming/Claude/local-agent-mode-sessions/skills-plugin/f2803cf8-d45f-439f-8823-e2aa5288f7da/f10d00d4-070e-419e-a245-d048e20b419f/skills/pptx/scripts/apply_theme.js");

const OUT = "../Hybrid_Astar_Group_B9.pptx";
const THEME = {
  name: "Yard",
  headFontFace: "Calibri",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "1E2A33", lt1: "FFFFFF", dk2: "3E4C59", lt2: "F4F6F8",
    accent1: "1F7A8C", accent2: "E8A33D", accent3: "C0392B", accent4: "5B6B78",
    accent5: "DCEBEE", accent6: "FBE7C6", hlink: "1F7A8C", folHlink: "5B6B78",
  },
};
const HEX = THEME.colors;

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10 x 5.625 in
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.title = "Hybrid A*: Trailer Parking Guidance";
pres.author = "Group B9";
const C = pres.SchemeColor;
const TEAL = C.accent1, AMB = C.accent2, RED = C.accent3, MUTE = C.accent4, PALE = C.accent5, PAMB = C.accent6;
const INK = C.text1, INK2 = C.text2, BG2 = C.background2, WHITE = C.background1;

// ---------- layouts ----------
pres.defineSlideMaster({
  title: "TITLE_DARK",
  background: { color: HEX.dk1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 1.35, w: 4.9, h: 1.1, fontSize: 54, bold: true, color: WHITE, align: "left", valign: "bottom", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: 0.6, y: 2.6, w: 4.7, h: 1.0, fontSize: 20, color: PAMB, valign: "top", margin: 0 }, text: "" } },
  ],
});
pres.defineSlideMaster({
  title: "DIVIDER",
  background: { color: HEX.dk1 },
  objects: [
    { placeholder: { options: { name: "kicker", type: "body", x: 0.8, y: 1.75, w: 8.4, h: 0.5, fontSize: 18, bold: true, color: AMB, margin: 0 }, text: "" } },
    { placeholder: { options: { name: "title", type: "title", x: 0.8, y: 2.25, w: 8.4, h: 1.0, fontSize: 44, bold: true, color: WHITE, align: "left", valign: "top", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: 0.8, y: 3.25, w: 8.4, h: 0.6, fontSize: 18, color: PALE, valign: "top", margin: 0 }, text: "" } },
  ],
  slideNumber: { x: 9.0, y: 5.2, w: 0.6, h: 0.3, fontSize: 10, color: MUTE, align: "right" },
});
pres.defineSlideMaster({
  title: "CONTENT",
  background: { color: HEX.lt1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.5, y: 0.3, w: 9.0, h: 0.75, fontSize: 28, bold: true, color: INK, align: "left", valign: "middle", margin: 0 }, text: "" } },
    { text: { text: "Hybrid A*  ·  Group B9", options: { x: 0.5, y: 5.2, w: 4, h: 0.3, fontSize: 10, color: MUTE, margin: 0 } } },
  ],
  slideNumber: { x: 9.0, y: 5.2, w: 0.5, h: 0.3, fontSize: 10, color: MUTE, align: "right" },
});

// ---------- helpers ----------
let n = 0;
const T = (s, text, o) => s.addText(text, Object.assign({ isTextBox: true, margin: 0, fontSize: 15, color: INK, valign: "top", objectName: "t" + (n++) }, o));
const box = (s, o) => s.addShape(o.radius ? pres.ShapeType.roundRect : pres.ShapeType.rect,
  Object.assign({ line: { type: "none" }, objectName: "b" + (n++) }, o.radius ? { rectRadius: o.radius } : {}, o));
const dot = (s, x, y, d, fill, label, o = {}) => {
  s.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: fill }, line: { type: "none" }, objectName: "d" + (n++) });
  if (label !== undefined) T(s, String(label), { x, y, w: d, h: d, align: "center", valign: "middle", bold: true, color: WHITE, fontSize: o.fs || 14 });
};
const arrow = (s, x1, y1, x2, y2, color = MUTE, w = 2) => s.addShape(pres.ShapeType.line, {
  x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1) || 0.001, h: Math.abs(y2 - y1) || 0.001,
  flipH: x2 < x1, flipV: y2 < y1, line: { color, width: w, endArrowType: "triangle" }, objectName: "a" + (n++) });
const seg = (s, x1, y1, x2, y2, color = MUTE, w = 2) => s.addShape(pres.ShapeType.line, {
  x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1) || 0.001, h: Math.abs(y2 - y1) || 0.001,
  flipH: x2 < x1, flipV: y2 < y1, line: { color, width: w }, objectName: "l" + (n++) });
const img = (s, path, x, y, w, h) => s.addImage({ path, x, y, w, h, objectName: "img" + (n++) });
const content = (title, section) => { const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: section }); s.addText(title, { placeholder: "title" }); return s; };
const caption = (s, text, o) => T(s, text, Object.assign({ fontSize: 11, color: MUTE, italic: true }, o));

const P1 = "Part 1: Hybrid A* in general", P2 = "Part 2: Hybrid A* in our project";

// ================= 1. Title =================
pres.addSection({ title: "Introduction" });
{
  const s = pres.addSlide({ masterName: "TITLE_DARK", sectionTitle: "Introduction" });
  s.addText("Hybrid A*", { placeholder: "title" });
  s.addText("How our tractor-trailer finds a drivable path into the bay", { placeholder: "body" });
  T(s, "Trailer Parking Guidance: NMPC + Hybrid A*", { x: 0.6, y: 4.05, w: 4.7, h: 0.3, fontSize: 13, bold: true, color: WHITE });
  T(s, "Group B9 · Harshith KV, G Venugopalan, Rithvik Arulprakash, Vipin Sudhakar", { x: 0.6, y: 4.35, w: 4.7, h: 0.55, fontSize: 12, color: PALE });
  box(s, { x: 5.75, y: 0.45, w: 3.85, h: 4.7, fill: { color: HEX.lt2 }, radius: 0.12 });
  img(s, "path.png", 5.85, 0.6, 3.65, 4.4); // 1394x1532
  s.addNotes(
    "Today we focus on one part of our project: the path planner, Hybrid A*.\n" +
    "First the general idea: what A* is, why it is not enough for a vehicle, and how Hybrid A* fixes that.\n" +
    "Then how we adapted it for a tractor-trailer, whose reversing is unstable.\n" +
    "The picture on the right is a real path from our planner: the truck drives in from the gate, stops, and reverses into the highlighted bay.");
}

// ================= 2. Where the planner sits =================
{
  const s = content("The planner decides the route; the controller follows it", "Introduction");
  const xs = [0.5, 2.85, 5.2, 7.55], W = 1.95, Y = 1.35, H = 1.45;
  const items = [
    ["Yard + bay", "obstacles, parked trucks, start pose, chosen bay", false],
    ["Hybrid A*", "plans the whole route, gate to bay", true],
    ["NMPC", "tracks the route, keeps hitch below 60°", false],
    ["Driver guidance", "gear, steering turns, speed, distance", false],
  ];
  items.forEach(([h, b, hl], i) => {
    box(s, { x: xs[i], y: Y, w: W, h: H, fill: { color: hl ? HEX.accent1 : HEX.lt2 }, radius: 0.1 });
    T(s, h, { x: xs[i] + 0.15, y: Y + 0.2, w: W - 0.3, h: 0.4, fontSize: 17, bold: true, color: hl ? WHITE : INK });
    T(s, b, { x: xs[i] + 0.15, y: Y + 0.65, w: W - 0.3, h: 0.7, fontSize: 13, color: hl ? WHITE : INK2 });
    if (i < 3) arrow(s, xs[i] + W + 0.05, Y + H / 2, xs[i + 1] - 0.05, Y + H / 2, MUTE, 2);
  });
  T(s, "TODAY", { x: xs[1], y: Y - 0.32, w: W, h: 0.25, fontSize: 11, bold: true, color: TEAL, align: "center", charSpacing: 2 });
  // planner vs controller
  const cols = [
    ["Planner (Hybrid A*)", ["Looks at the whole yard, once", "Finds a route around every obstacle", "Answers: which way to go?"], TEAL],
    ["Controller (NMPC)", ["Looks 9.6 s ahead, every 0.25 s", "Corrects drift, enforces limits", "Answers: how to steer right now?"], MUTE],
  ];
  cols.forEach(([h, lines, col], i) => {
    const x = 0.5 + i * 4.6;
    dot(s, x, 3.3, 0.32, col);
    T(s, h, { x: x + 0.45, y: 3.3, w: 3.9, h: 0.35, fontSize: 16, bold: true, valign: "middle" });
    T(s, lines.map((t, j) => ({ text: t, options: { bullet: true, breakLine: j < lines.length - 1 } })),
      { x: x + 0.45, y: 3.75, w: 3.9, h: 1.2, fontSize: 14, color: INK2, paraSpaceAfter: 4 });
  });
  s.addNotes(
    "Our system has three layers. Given the yard and the bay the driver clicked, the planner computes a complete route from the gate to the bay.\n" +
    "The NMPC controller then tracks that route in closed loop and enforces the hard hitch-angle limit, and the guidance layer turns it into instructions for the driver.\n" +
    "The split matters: the planner thinks globally, about walls, parked trucks and where to turn around. The controller thinks locally, a few seconds ahead.\n" +
    "Without a good plan the controller has nothing sensible to follow, so the planner is where the route is decided.");
}

// ================= 3. Divider Part 1 =================
pres.addSection({ title: P1 });
{
  const s = pres.addSlide({ masterName: "DIVIDER", sectionTitle: P1 });
  s.addText("PART 1", { placeholder: "kicker" });
  s.addText("Hybrid A* in general", { placeholder: "title" });
  s.addText("From grid search to paths a vehicle can drive", { placeholder: "body" });
  s.addNotes("First, the general algorithm, independent of our project.");
}

// ================= 4. A* =================
{
  const s = content("A* expands the most promising grid cell first", P1);
  img(s, "astar.png", 0.5, 1.3, 5.2, 3.35); // ratio ~1.55
  caption(s, "Shaded: the 55 cells A* explored.  Line: the shortest path from S to G.", { x: 0.5, y: 4.75, w: 5.2, h: 0.3 });
  T(s, "f = g + h", { x: 6.1, y: 1.3, w: 3.4, h: 0.6, fontSize: 32, bold: true, color: AMB });
  const rows = [
    ["g", "cost so far: the path length from the start"],
    ["h", "heuristic: an estimate of the cost still to go"],
    ["f", "the open list always pops the lowest f next"],
  ];
  rows.forEach(([k, v], i) => {
    const y = 2.15 + i * 0.85;
    dot(s, 6.1, y, 0.45, i === 2 ? HEX.accent2 : HEX.accent1, k, { fs: 16 });
    T(s, v, { x: 6.7, y: y - 0.02, w: 2.8, h: 0.7, fontSize: 14, color: INK2 });
  });
  T(s, "If h never overestimates, the path found is the shortest on the grid.", { x: 6.1, y: 4.65, w: 3.4, h: 0.5, fontSize: 12, color: MUTE, italic: true });
  s.addNotes(
    "A* is the classic shortest-path search. The map is a grid; each cell is a node.\n" +
    "For each cell we track g, the cost to reach it, and h, an estimate of the cost from there to the goal, here the Manhattan distance.\n" +
    "The search always expands the cell with the lowest f = g + h. Because h pulls it toward the goal, it explores only part of the map: the shaded cells, 55 of 126.\n" +
    "If h never overestimates the real cost, A* is guaranteed to return the shortest grid path.");
}

// ================= 5. Grid path vs vehicle =================
{
  const s = content("A grid path is not a path a truck can drive", P1);
  img(s, "grid_vs_drive.png", 0.5, 1.3, 5.2, 3.35);
  caption(s, "Dashed: the A* grid path.  Solid: a path a vehicle can actually follow.", { x: 0.5, y: 4.75, w: 5.2, h: 0.3 });
  const pts = [
    ["Sharp corners", "A* turns 90° in place; a truck has a minimum turning radius."],
    ["No sideways motion", "Wheels roll forward or back, never sideways (non-holonomic)."],
    ["Heading matters", "Where the truck points is part of the state, not just where it is."],
  ];
  pts.forEach(([h, b], i) => {
    const y = 1.35 + i * 1.12;
    dot(s, 6.1, y + 0.02, 0.32, HEX.accent3);
    T(s, h, { x: 6.55, y, w: 2.95, h: 0.35, fontSize: 16, bold: true });
    T(s, b, { x: 6.55, y: y + 0.36, w: 2.95, h: 0.65, fontSize: 13, color: INK2 });
  });
  s.addNotes(
    "The A* path is fine for a robot that can turn on the spot. A truck cannot.\n" +
    "It has a minimum turning radius, it cannot slide sideways, and its heading is part of its state.\n" +
    "Smoothing the grid path afterwards is not enough: a smoothed corner may still be too tight, or may clip an obstacle.\n" +
    "We need a search that only ever produces motions the vehicle can actually make.");
}

// ================= 6. Hybrid A* idea =================
{
  const s = content("Hybrid A* keeps the search but moves like a vehicle", P1);
  const ideas = [
    ["Nodes are real poses", "(x, y, heading), anywhere in a cell, not snapped to its centre."],
    ["Children come from driving", "Short arcs at a few steering values, forward (teal) and reverse (red)."],
    ["The grid only remembers", "Two poses in the same cell count as one: keep the cheaper, drop the other."],
  ];
  ideas.forEach(([h, b], i) => {
    const y = 1.3 + i * 1.18;
    dot(s, 0.5, y, 0.45, HEX.accent1, i + 1, { fs: 16 });
    T(s, h, { x: 1.1, y: y - 0.02, w: 3.5, h: 0.38, fontSize: 17, bold: true });
    T(s, b, { x: 1.1, y: y + 0.38, w: 3.5, h: 0.7, fontSize: 14, color: INK2 });
  });
  img(s, "hybrid.png", 4.85, 1.3, 4.65, 3.18); // ratio ~1.46
  caption(s, "One node (black) and its ten children; faint arcs: the next expansion.", { x: 4.85, y: 4.6, w: 4.65, h: 0.3 });
  s.addNotes(
    "Hybrid A* is still A*: an open list, g plus h, always expand the best node. Three things change.\n" +
    "One: a node is a continuous pose, x, y and heading, wherever the vehicle really is, not the centre of a cell.\n" +
    "Two: to make children we simulate driving a short arc with a few steering angles, in both gears. Every edge in the tree is therefore a motion the vehicle can make.\n" +
    "Three: the grid is used only to detect revisits. If two poses fall in the same x, y, heading cell, we keep the cheaper one. That keeps the search finite.\n" +
    "The name comes from this mix: continuous states, discrete bookkeeping.");
}

// ================= 7. Comparison table =================
{
  const s = content("A* vs Hybrid A*", P1);
  const hdr = (t) => ({ text: t, options: { bold: true, color: WHITE, fill: { color: HEX.dk1 }, fontSize: 14 } });
  const lab = (t) => ({ text: t, options: { bold: true, color: INK, fill: { color: HEX.lt2 }, fontSize: 13 } });
  const c = (t, hl) => ({ text: t, options: { color: hl ? TEAL : INK2, bold: !!hl, fontSize: 13 } });
  const rows = [
    [hdr(""), hdr("A*"), hdr("Hybrid A*")],
    [lab("A node is"), c("a grid cell (x, y)"), c("a continuous pose (x, y, heading)", 1)],
    [lab("Moves"), c("to neighbouring cells"), c("short drivable arcs, both gears", 1)],
    [lab("The grid is used for"), c("the state itself"), c("spotting revisits only", 1)],
    [lab("Reaching the goal"), c("land on the goal cell"), c("a direct \"shot\" to the exact pose", 1)],
    [lab("Output path"), c("corners, not drivable"), c("drivable by construction", 1)],
    [lab("Guarantee"), c("shortest on the grid"), c("not strictly optimal; good and fast", 1)],
  ];
  s.addTable(rows, { x: 0.5, y: 1.3, w: 9.0, colW: [2.4, 3.0, 3.6], rowH: 0.48, fontFace: THEME.bodyFontFace,
    border: { type: "solid", pt: 0.75, color: "D5DBE1" }, valign: "middle", margin: [0, 0.1, 0, 0.1], objectName: "cmp" });
  s.addNotes(
    "A summary of the differences.\n" +
    "The price we pay: because nodes are merged per cell and arcs come from a finite set, Hybrid A* is not guaranteed optimal and can, in principle, miss a very narrow passage.\n" +
    "In return every path it produces is drivable, and it is fast enough to plan live. That is the trade-off every practical vehicle planner makes; Hybrid A* is the method used in the DARPA Urban Challenge (Stanford's Junior) and in many parking systems.");
}

// ================= 8. Two heuristics =================
{
  const s = content("Two heuristics, and the search uses the larger", P1);
  const cards = [
    ["Respects turning, ignores obstacles", "Shortest curve with the minimum turning radius (Dubins / Reeds-Shepp) in empty space.", "Knows the truck must loop around to face the bay.", TEAL],
    ["Respects obstacles, ignores turning", "Shortest 2-D distance around walls and parked trucks (Dijkstra on a grid).", "Knows that a wall blocks the straight route.", AMB],
  ];
  cards.forEach(([h, b, k, col], i) => {
    const x = i === 0 ? 0.5 : 5.6;
    box(s, { x, y: 1.35, w: 3.9, h: 2.75, fill: { color: HEX.lt2 }, radius: 0.1 });
    dot(s, x + 0.25, 1.6, 0.35, col);
    T(s, h, { x: x + 0.75, y: 1.55, w: 3.0, h: 0.5, fontSize: 16, bold: true });
    T(s, b, { x: x + 0.25, y: 2.25, w: 3.4, h: 0.9, fontSize: 14, color: INK2 });
    T(s, k, { x: x + 0.25, y: 3.25, w: 3.4, h: 0.7, fontSize: 13, color: col === TEAL ? TEAL : RED, italic: true });
  });
  dot(s, 4.55, 2.35, 0.9, HEX.dk1, "max", { fs: 18 });
  T(s, "Each one alone underestimates the cost. The larger of the two is still a lower estimate, but far sharper, so the search wastes much less time.",
    { x: 0.5, y: 4.35, w: 9.0, h: 0.6, fontSize: 14, color: INK2 });
  s.addNotes(
    "The heuristic decides how quickly the search finds the goal. Hybrid A* uses two.\n" +
    "The first ignores obstacles but respects the turning radius: in empty space, how long is the shortest drivable curve to the goal pose? That catches cases where the truck has to turn around.\n" +
    "The second ignores turning but respects obstacles: a plain 2-D shortest path around the walls. That catches dead ends.\n" +
    "Each is an underestimate on its own, so taking the maximum still is, but it is much closer to the real cost.");
}

// ================= 9. Search loop =================
{
  const s = content("The search loop, with a shortcut to the goal", P1);
  const steps = [
    ["Pop", "lowest-f node from the open list", HEX.lt2, INK],
    ["Try a shot", "direct curve to the goal pose", HEX.accent6, INK],
    ["Expand", "drive every motion primitive", HEX.lt2, INK],
    ["Prune", "collisions, limits, visited cells", HEX.lt2, INK],
    ["Push", "survivors with f = g + h", HEX.lt2, INK],
  ];
  const W = 1.6, G = 0.25, Y = 1.75, H = 1.15;
  steps.forEach(([h, b, fill], i) => {
    const x = 0.5 + i * (W + G);
    box(s, { x, y: Y, w: W, h: H, fill: { color: fill }, radius: 0.08 });
    T(s, h, { x: x + 0.12, y: Y + 0.12, w: W - 0.24, h: 0.35, fontSize: 16, bold: true });
    T(s, b, { x: x + 0.12, y: Y + 0.48, w: W - 0.24, h: 0.6, fontSize: 12, color: INK2 });
    if (i < 4) arrow(s, x + W + 0.02, Y + H / 2, x + W + G - 0.02, Y + H / 2, MUTE, 1.75);
  });
  // loop back: from last box up, across, down into first
  const xl = 0.5 + 4 * (W + G) + W / 2, xf = 0.5 + W / 2, yt = Y - 0.3;
  seg(s, xl, Y, xl, yt, MUTE, 1.75); seg(s, xl, yt, xf, yt, MUTE, 1.75); arrow(s, xf, yt, xf, Y - 0.02, MUTE, 1.75);
  T(s, "repeat", { x: 4.4, y: yt - 0.28, w: 1.2, h: 0.25, fontSize: 11, color: MUTE, align: "center" });
  // success branch
  const xs = 0.5 + (W + G) + W / 2;
  arrow(s, xs, Y + H, xs, 3.3, HEX.accent2, 2);
  T(s, "collision-free?", { x: xs + 0.1, y: Y + H + 0.08, w: 1.4, h: 0.25, fontSize: 11, color: AMB, italic: true });
  box(s, { x: xs - 0.8, y: 3.3, w: 1.6, h: 0.55, fill: { color: HEX.accent2 }, radius: 0.08 });
  T(s, "Done: return path", { x: xs - 0.8, y: 3.3, w: 1.6, h: 0.55, fontSize: 13, bold: true, color: WHITE, align: "center", valign: "middle" });
  T(s, [
    { text: "Analytic expansion (the \"shot\"). ", options: { bold: true, color: INK } },
    { text: "Arcs alone almost never land exactly on the goal pose. So from promising nodes, the search tries one exact curve straight to the goal. The first shot that is collision-free ends the search.", options: { color: INK2 } },
  ], { x: 0.5, y: 4.15, w: 9.0, h: 0.9, fontSize: 14 });
  s.addNotes(
    "Here is the whole loop. Pop the best node. Try to connect it straight to the goal. If that fails, expand its motion primitives, throw away children that collide, break a limit, or land in a cell we already reached more cheaply, and push the rest.\n" +
    "The shot, also called analytic expansion, is what makes Hybrid A* practical. Arcs on a lattice almost never end exactly at the goal pose, so instead, from nodes that are close enough, we compute an exact curve to the goal and check it for collisions. The first successful shot completes the path.");
}

// ================= 10. Divider Part 2 =================
pres.addSection({ title: P2 });
{
  const s = pres.addSlide({ masterName: "DIVIDER", sectionTitle: P2 });
  s.addText("PART 2", { placeholder: "kicker" });
  s.addText("Hybrid A* in our project", { placeholder: "title" });
  s.addText("What changes for a tractor-trailer", { placeholder: "body" });
  s.addNotes("Now how we applied this to a tractor pulling a trailer, and what we had to change.");
}

// ================= 11. Trailer is unstable =================
{
  const s = content("A trailer adds a fourth state, and reversing it is unstable", P2);
  dot(s, 0.5, 1.35, 0.32, HEX.accent2);
  T(s, "State: (x, y, heading, hitch angle ψ)", { x: 0.95, y: 1.33, w: 3.6, h: 0.4, fontSize: 16, bold: true });
  T(s, "ψ is the angle between tractor and trailer. Past 60° the rig jackknifes.", { x: 0.95, y: 1.75, w: 3.6, h: 0.65, fontSize: 14, color: INK2 });
  dot(s, 0.5, 2.6, 0.32, HEX.accent3);
  T(s, "Fixed steering fails in reverse", { x: 0.95, y: 2.58, w: 3.6, h: 0.4, fontSize: 16, bold: true });
  T(s, "With the wheel held straight, a 3° hitch error grows to the jackknife limit in about 25 m.", { x: 0.95, y: 3.0, w: 3.6, h: 0.75, fontSize: 14, color: INK2 });
  T(s, "Standard Hybrid A* arcs use a fixed steering angle, so the search could not even hold a straight reverse.", { x: 0.95, y: 3.85, w: 3.6, h: 0.8, fontSize: 14, color: RED, italic: true });
  img(s, "unstable.png", 4.75, 1.35, 4.75, 2.62); // 1227x678
  caption(s, "Our rig model, reversing at constant speed from a 3° hitch angle.", { x: 4.75, y: 4.1, w: 4.75, h: 0.3 });
  s.addNotes(
    "For a car the state is x, y and heading. A tractor-trailer adds the hitch angle psi, the angle between tractor and trailer.\n" +
    "Driving forward, the trailer straightens out by itself. In reverse it is the opposite: any small hitch angle grows. The red curve is our own model reversing with the wheel straight: 3 degrees becomes 60, a jackknife, in about 25 metres.\n" +
    "Standard Hybrid A* generates arcs with a fixed steering angle. In reverse those arcs fold the trailer, so the search cannot even produce a straight reverse. That is the problem we had to solve.");
}

// ================= 12. Stabilised primitives =================
{
  const s = content("Our fix: each primitive steers to a target hitch angle", P2);
  img(s, "primitives.png", 0.5, 1.4, 5.0, 3.03); // 1303x790
  caption(s, "From a straight rig, each target held for 10 m. Teal: forward.  Red: reverse.", { x: 0.5, y: 4.55, w: 5.0, h: 0.3 });
  const pts = [
    ["Pick a target hitch angle", "-45°, -25°, 0°, +25° or +45°"],
    ["A small regulator holds it", "turns the wheel so ψ settles on the target, stable in both gears (teal curve on the last slide)"],
    ["10 children per node", "2 gears × 5 targets, each a 2 m arc on the real model"],
  ];
  pts.forEach(([h, b], i) => {
    const y = 1.35 + i * 1.12;
    dot(s, 5.85, y, 0.4, HEX.accent1, i + 1);
    T(s, h, { x: 6.4, y: y - 0.02, w: 3.1, h: 0.38, fontSize: 16, bold: true });
    T(s, b, { x: 6.4, y: y + 0.36, w: 3.1, h: 0.72, fontSize: 13, color: INK2 });
  });
  T(s, "The search becomes an ordinary car-style Hybrid A*, with gear changes as cusps.", { x: 5.85, y: 4.5, w: 3.65, h: 0.55, fontSize: 13, color: TEAL, bold: true });
  s.addNotes(
    "Our key change: instead of choosing a steering angle, each primitive chooses a target hitch angle, one of five values.\n" +
    "While the primitive is driven, a regulator, obtained by inverting the hitch-angle equation, computes the steering that makes the hitch angle settle on that target. It is stable forward and in reverse.\n" +
    "So from any node we get 10 children: 2 gears times 5 targets, each 2 m long, simulated on the real kinematics.\n" +
    "From the search's point of view the trailer now behaves like a car, and the rest of Hybrid A* applies unchanged.");
}

// ================= 13. Settings =================
{
  const s = content("Safety limits are built into the pruning", P2);
  const stats = [
    ["0.5 m · 5° · 12°", "cell size for revisits: position, heading, hitch"],
    ["52°", "hitch cap while planning; the jackknife limit is 60°"],
    ["0.35 m", "minimum clearance to every obstacle and parked truck"],
    ["85%", "of the steering lock; the rest is kept for the NMPC"],
    ["2 m", "length of each motion primitive"],
    ["40,000", "expansions at most before the search gives up"],
  ];
  stats.forEach(([v, l], i) => {
    const col = i % 3, row = Math.floor(i / 3), x = 0.5 + col * 3.07, y = 1.35 + row * 1.85;
    box(s, { x, y, w: 2.86, h: 1.6, fill: { color: i === 1 ? HEX.accent6 : HEX.lt2 }, radius: 0.1 });
    T(s, v, { x: x + 0.2, y: y + 0.18, w: 2.5, h: 0.65, fontSize: i === 0 ? 24 : 32, bold: true, color: i === 1 ? RED : TEAL, valign: "middle" });
    T(s, l, { x: x + 0.2, y: y + 0.88, w: 2.5, h: 0.65, fontSize: 13, color: INK2 });
  });
  s.addNotes(
    "These are the settings in our planner, in sim/planner.py.\n" +
    "Any child that breaks a limit is simply discarded, so every path the planner returns already respects them.\n" +
    "We deliberately plan inside tighter limits than the controller: hitch at most 52 degrees against the true 60, and only 85 percent of the steering lock. The margin is room for the NMPC to correct disturbances without hitting a limit.");
}

// ================= 14. Cost =================
{
  const s = content("The cost function decides what a good path looks like", P2);
  const rows = [
    ["×1.0", "per metre driven forward", TEAL],
    ["×1.4", "per metre in reverse: slower and harder for a driver", RED],
    ["+6", "per gear change, about 6 m of extra driving", AMB],
    ["+0.25", "per metre, times how hard the primitive steers", MUTE],
    ["+0.6", "times the change in steering target between arcs", MUTE],
    ["+0.6", "per metre, times how far the hitch angle is from straight", MUTE],
  ];
  rows.forEach(([v, l, col], i) => {
    const y = 1.3 + i * 0.6;
    T(s, v, { x: 0.5, y, w: 1.1, h: 0.45, fontSize: 22, bold: true, color: col, valign: "middle", align: "right" });
    T(s, l, { x: 1.85, y, w: 4.0, h: 0.45, fontSize: 14, color: INK2, valign: "middle" });
  });
  box(s, { x: 6.25, y: 1.3, w: 3.25, h: 3.4, fill: { color: HEX.dk1 }, radius: 0.1 });
  T(s, "Net effect", { x: 6.5, y: 1.5, w: 2.8, h: 0.4, fontSize: 18, bold: true, color: AMB });
  T(s, ["Few gear changes", "Short reverse legs", "Gentle, steady steering", "Trailer kept nearly straight"].map((t, j, a) =>
    ({ text: t, options: { bullet: true, breakLine: j < a.length - 1 } })),
    { x: 6.5, y: 2.05, w: 2.8, h: 2.4, fontSize: 15, color: WHITE, paraSpaceAfter: 8 });
  s.addNotes(
    "g, the cost so far, is not just distance. Reverse driving costs 40 percent more, each gear change costs as much as 6 metres of driving, and there are small penalties for steering hard, changing the steering, and for a bent trailer.\n" +
    "Together they make the planner prefer paths a human driver would also prefer: drive forward past the bay, one gear change, then a smooth reverse in.");
}

// ================= 15. Heuristic and shot =================
{
  const s = content("Our heuristic and shot follow the trailer axle", P2);
  box(s, { x: 0.5, y: 1.3, w: 9.0, h: 0.75, fill: { color: HEX.accent5 }, radius: 0.08 });
  T(s, [
    { text: "Key fact: ", options: { bold: true, color: TEAL } },
    { text: "the curvature of the trailer axle's path fixes the hitch angle. So the trailer axle behaves like a car whose steering wheel is ψ.", options: { color: INK } },
  ], { x: 0.75, y: 1.3, w: 8.5, h: 0.75, fontSize: 14, valign: "middle" });
  const cols = [
    ["Heuristic", TEAL, [
      "max( Dubins length of the trailer axle, radius 10 m ; Dijkstra distance around obstacles )",
      "plus a term for the current hitch angle",
      "weighted ×3: greedier and much faster, not strictly optimal"]],
    ["Shot into the bay", AMB, [
      "tried when within 45 m (Dubins) or already lined up with the bay",
      "a Dubins path for the trailer axle, driven on the real model by a controller",
      "accepted only if it ends in the bay: within 0.35 m, 4°, hitch within 5°, clear the whole way"]],
  ];
  cols.forEach(([h, col, lines], i) => {
    const x = 0.5 + i * 4.65;
    dot(s, x, 2.35, 0.32, col === TEAL ? HEX.accent1 : HEX.accent2);
    T(s, h, { x: x + 0.45, y: 2.32, w: 3.8, h: 0.4, fontSize: 17, bold: true });
    T(s, lines.map((t, j) => ({ text: t, options: { bullet: true, breakLine: j < lines.length - 1 } })),
      { x: x + 0.45, y: 2.8, w: 3.85, h: 2.2, fontSize: 13, color: INK2, paraSpaceAfter: 6 });
  });
  s.addNotes(
    "Both the heuristic and the shot use one fact about the trailer: the curvature of the trailer axle's path fixes the hitch angle. So the trailer axle moves like a car whose steering is the hitch angle.\n" +
    "Heuristic: a Dubins path for the trailer axle, with a 10 m turning radius, gives a turning-aware estimate; a Dijkstra distance field gives the obstacle-aware estimate; we take the larger and add a hitch-angle term. We weight it by 3, which makes the search greedy and fast at the cost of strict optimality.\n" +
    "Shot: we plan a Dubins path for the trailer axle into the bay and actually drive the full rig model along it with a controller. It only counts if the simulated rig ends parked, aligned and clear. So the final path is consistent with the real kinematics end to end, not just geometrically.");
}

// ================= 16. Real search =================
{
  const s = content("A real search: cross yard, fill 1, bay 6", P2);
  img(s, "search.png", 0.5, 1.15, 3.6, 3.96); // 1394x1532
  const stats = [["185", "nodes expanded"], ["1,840", "primitives driven and checked"], ["137", "shots tried; the last one reached the bay"], ["0.14 s", "planning time on our laptop"]];
  stats.forEach(([v, l], i) => {
    const y = 1.3 + i * 0.82;
    T(s, v, { x: 4.5, y, w: 1.7, h: 0.6, fontSize: 30, bold: true, color: i === 2 ? AMB : TEAL, valign: "middle" });
    T(s, l, { x: 6.3, y, w: 3.2, h: 0.6, fontSize: 14, color: INK2, valign: "middle" });
  });
  const leg = [["Primitives tried", HEX.accent5], ["Path found by the search", HEX.accent1], ["The shot into the bay (dashed)", HEX.accent2]];
  leg.forEach(([t, col], i) => {
    const x = 4.5 + i * 1.75;
    box(s, { x, y: 4.72, w: 0.3, h: 0.1, fill: { color: col } });
    T(s, t, { x: x + 0.38, y: 4.6, w: 1.35, h: 0.45, fontSize: 10, color: MUTE });
  });
  s.addNotes(
    "This is the planner's real search on one of our yards, recorded from the code.\n" +
    "The truck starts on the left. The pale fan near the right is every primitive the search tried: 1,840 arcs from 185 expanded nodes. The search drives forward past the bays and explores pulling up and turning.\n" +
    "At every promising node it tries a shot. After 137 attempts one shot, the dashed amber curve, reverses the trailer cleanly into bay 6, and the search stops.\n" +
    "The whole plan took 0.14 seconds.");
}

// ================= 17. Final path =================
{
  const s = content("The final path: 82 m, one gear change", P2);
  img(s, "path.png", 0.5, 1.15, 3.6, 3.96);
  const pts = [
    ["Shorten", "try a shot from ever-later points of the path and keep the earliest that connects: removes detours"],
    ["Final leg", "a straight run along the bay axis into the parked pose"],
    ["Hand over", "every waypoint carries pose, hitch angle, steering and gear, from the real kinematics"],
  ];
  pts.forEach(([h, b], i) => {
    const y = 1.35 + i * 1.05;
    dot(s, 4.5, y, 0.4, HEX.accent1, i + 1);
    T(s, h, { x: 5.05, y: y - 0.02, w: 4.45, h: 0.36, fontSize: 16, bold: true });
    T(s, b, { x: 5.05, y: y + 0.35, w: 4.45, h: 0.65, fontSize: 13, color: INK2 });
  });
  box(s, { x: 4.5, y: 4.6, w: 0.3, h: 0.1, fill: { color: HEX.accent1 } });
  T(s, "forward", { x: 4.88, y: 4.5, w: 0.9, h: 0.3, fontSize: 11, color: MUTE });
  box(s, { x: 5.8, y: 4.6, w: 0.3, h: 0.1, fill: { color: HEX.accent3 } });
  T(s, "reverse", { x: 6.18, y: 4.5, w: 0.9, h: 0.3, fontSize: 11, color: MUTE });
  T(s, "ghosts: tractor (teal), trailer (amber)", { x: 7.1, y: 4.5, w: 2.4, h: 0.3, fontSize: 11, color: MUTE });
  s.addNotes(
    "After the search, two finishing steps. First, shortening: the greedy search can take detours, so we try a shot from later and later points of the path and keep the earliest one that connects.\n" +
    "Second, the last leg into the bay is a straight line along the bay axis.\n" +
    "The result for this bay: 82 m, forward past the bay, one gear change, a smooth reverse in. The peak hitch angle on the plan is 47 degrees, under the 52-degree planning cap.\n" +
    "Each waypoint carries the full state and the gear, so the NMPC receives a reference it can actually follow.");
}

// ================= 18. Hand-off =================
{
  const s = content("How the planner works with the rest of the system", P2);
  const steps = [
    ["Hybrid A*", "plans a drivable route inside tighter limits", HEX.accent1, WHITE],
    ["NMPC", "tracks it; uses the steering and hitch margin left free", HEX.lt2, INK],
    ["Certification", "a full simulated run must park, never jackknife", HEX.lt2, INK],
    ["Second attempt", "if not: re-plan from where it stopped, or a new route", HEX.accent6, INK],
  ];
  const W = 2.05, G = 0.27, Y = 1.3, H = 1.35;
  steps.forEach(([h, b, fill, tc], i) => {
    const x = 0.5 + i * (W + G);
    box(s, { x, y: Y, w: W, h: H, fill: { color: fill }, radius: 0.08 });
    T(s, h, { x: x + 0.14, y: Y + 0.14, w: W - 0.28, h: 0.36, fontSize: 16, bold: true, color: tc });
    T(s, b, { x: x + 0.14, y: Y + 0.52, w: W - 0.28, h: 0.78, fontSize: 12, color: tc === WHITE ? WHITE : INK2 });
    if (i < 3) arrow(s, x + W + 0.02, Y + H / 2, x + W + G - 0.02, Y + H / 2, MUTE, 1.75);
  });
  const res = [["98 / 110", "library bays certified"], ["53.3°", "peak hitch in any certified run (limit 60°)"], ["60 / 60", "reversing bays where an unaided driver jackknifes"]];
  res.forEach(([v, l], i) => {
    const x = 0.5 + i * 3.07;
    T(s, v, { x, y: 3.15, w: 2.86, h: 0.75, fontSize: 36, bold: true, color: i === 2 ? RED : TEAL });
    T(s, l, { x, y: 3.95, w: 2.86, h: 0.6, fontSize: 13, color: INK2 });
  });
  caption(s, "Second attempt: pull forward and park again, stop and re-plan near an obstacle, or a fresh route with a gentler search weight and more clearance.", { x: 0.5, y: 4.6, w: 9.0, h: 0.45 });
  s.addNotes(
    "The planner is the first link in a chain. The NMPC tracks its path, using the margins the planner deliberately left free.\n" +
    "Every bay is then certified: a full closed-loop simulated run must park within tolerance, never jackknife, and never touch anything.\n" +
    "If it fails, the planner is called again, the way a driver would retry: from where the rig stopped, or from the gate with different planner settings.\n" +
    "Across the 110-bay library, 98 bays certify, the worst hitch angle in any certified run is 53.3 degrees, and on all 60 reversing bays a driver without guidance jackknifes. That is the value of the plan plus the controller.");
}

// ================= 19. Takeaways =================
pres.addSection({ title: "Summary" });
{
  const s = pres.addSlide({ masterName: "DIVIDER", sectionTitle: "Summary" });
  T(s, "Takeaways", { x: 0.8, y: 0.5, w: 8.4, h: 0.7, fontSize: 36, bold: true, color: WHITE });
  const cols = [
    ["What Hybrid A* gives us", AMB, [
      "Paths that are drivable by construction",
      "Safety limits enforced while searching",
      "Fast enough to plan live (0.14 s for bay 6)",
      "Our addition: hitch-angle primitives make reversing a trailer searchable"]],
    ["Limitations", PALE, [
      "Not strictly optimal: lattice resolution and the ×3 heuristic weight",
      "Can miss very narrow gaps between cells",
      "Plans on a static map: if the yard changes, it must re-plan",
      "Gives up after 40,000 expansions; the second attempt then retries"]],
  ];
  cols.forEach(([h, col, lines], i) => {
    const x = 0.8 + i * 4.4;
    T(s, h, { x, y: 1.45, w: 4.0, h: 0.45, fontSize: 18, bold: true, color: col });
    T(s, lines.map((t, j) => ({ text: t, options: { bullet: true, breakLine: j < lines.length - 1 } })),
      { x, y: 2.0, w: 4.0, h: 2.9, fontSize: 14, color: WHITE, paraSpaceAfter: 8 });
  });
  s.addNotes(
    "To summarise. Hybrid A* combines A*'s efficient search with motion that a vehicle can actually perform, so every path it returns is drivable, and our safety limits are enforced during the search itself.\n" +
    "Our main contribution on the planning side is the stabilised primitive: steering to a target hitch angle, which makes reversing a trailer searchable at all.\n" +
    "The limitations are the usual ones for this family: no strict optimality, finite resolution, and a static map.\n" +
    "Thank you. Happy to take questions.");
}

(async () => {
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("wrote", OUT);
})();
