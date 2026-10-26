// Builds doc/Robotics_Final_Group_B9.pptx: intro + four parts (modelling, kinematics, Hybrid A* and NMPC,
// limitations), for the final review. Figures and equations come from figs.py (python figs.py first).
//
// House style, applied by hand on every slide:
//   - Slide titles in Title Case (Chicago: a, an, the, and, or, of, to, in, on, for, with, as stay lower case).
//   - Body text in sentence case, no full stop at the end of a bullet.
//   - Segoe UI Semibold for titles, Segoe UI for text, Computer Modern (rendered) for maths.
//   - Primary text 22-24 pt; figure labels 20 pt+; only footers, captions and references go smaller.
//   - Teal = tractor, amber = trailer, red = danger / hitch term, everywhere.
const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");
const { applyTheme } = require("./apply_theme.js");

const OUT = path.join(__dirname, "..", "Robotics_Final_Group_B9.pptx");
const IMG = path.join(__dirname, "img");
const SIZES = JSON.parse(fs.readFileSync(path.join(IMG, "sizes.json"), "utf8"));

// Who presents each part: fill in to show "Presented by ..." on the part dividers (left empty, nothing shows).
const PRESENTERS = { 1: "", 2: "", 3: "", 4: "" };

const THEME = {
  name: "B9 Yard",
  headFontFace: "Segoe UI Semibold",
  bodyFontFace: "Segoe UI",
  // Dark deck: the "dark" slots hold the light text colours and the "light" slots the dark backgrounds, so
  // PowerPoint's standard mapping (text = dk1, background = lt1) gives light text on slate, also on new slides.
  // Same colours as figs.py.
  colors: {
    dk1: "E6EDF3", lt1: "11161C", dk2: "AEB8C2", lt2: "1A2129",
    accent1: "4FB3C2", accent2: "F0A847", accent3: "F0705F", accent4: "7D8996",
    accent5: "163039", accent6: "3A2F1C", hlink: "4FB3C2", folHlink: "7D8996",
  },
};
const HEX = THEME.colors;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 in
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.title = "Model Predictive Control for Automated Reverse Docking";
pres.author = "Group B9";
const C = pres.SchemeColor;
const TEAL = C.accent1, AMB = C.accent2, RED = C.accent3, MUTE = C.accent4, PALE = C.accent5, PAMB = C.accent6;
const INK = C.text1, INK2 = C.text2, BG2 = C.background2, WHITE = C.background1;
const AMB_D = "F2B45A", GREEN = "4CC38A", REDT = "3A1F1F"; // amber for text, the figures' "safe" green, a red-tinted card

const SW = 13.333, M = 0.6, CW = SW - 2 * M; // slide width, side margin, content width
const TOP = 1.62;                             // content starts here on content slides
const FOOT = "Group B9  ·  Tractor-Trailer Parking Guidance";

// ---------- layouts ----------
pres.defineSlideMaster({
  title: "TITLE",
  background: { color: HEX.lt1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: M, y: 1.8, w: 6.3, h: 2.1, fontSize: 34, color: INK, align: "left", valign: "top", margin: 0 }, text: "" } },
  ],
});
pres.defineSlideMaster({
  title: "DIVIDER",
  background: { color: HEX.lt1 },
  objects: [
    { placeholder: { options: { name: "kicker", type: "body", x: 4.1, y: 2.45, w: 8.6, h: 0.5, fontSize: 18, bold: true, color: TEAL, margin: 0, valign: "middle" }, text: "" } },
    { placeholder: { options: { name: "title", type: "title", x: 4.1, y: 2.95, w: 8.6, h: 1.1, fontSize: 34, color: INK, align: "left", valign: "middle", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: 4.1, y: 4.1, w: 8.4, h: 1.0, fontSize: 18, color: INK2, valign: "top", margin: 0 }, text: "" } },
    { text: { text: FOOT, options: { x: M, y: 6.95, w: 6, h: 0.3, fontSize: 12, color: MUTE, margin: 0 } } },
  ],
  slideNumber: { x: SW - M - 0.6, y: 6.95, w: 0.6, h: 0.3, fontSize: 12, color: MUTE, align: "right" },
});
pres.defineSlideMaster({
  title: "CONTENT",
  background: { color: HEX.lt1 },
  objects: [
    { placeholder: { options: { name: "kicker", type: "body", x: M + 0.45, y: 0.36, w: 8, h: 0.34, fontSize: 13, bold: true, color: TEAL, margin: 0, valign: "middle" }, text: "" } },
    { placeholder: { options: { name: "title", type: "title", x: M, y: 0.74, w: CW, h: 0.72, fontSize: 28, color: INK, align: "left", valign: "middle", margin: 0 }, text: "" } },
    { text: { text: FOOT, options: { x: M, y: 6.95, w: 6, h: 0.3, fontSize: 12, color: MUTE, margin: 0 } } },
  ],
  slideNumber: { x: SW - M - 0.6, y: 6.95, w: 0.6, h: 0.3, fontSize: 12, color: MUTE, align: "right" },
});

// ---------- helpers ----------
let n = 0;
const id = (p) => p + (n++);
// Sizes below are written on a 24 pt scale; SZ maps them to normal reading sizes (24 -> 18 pt).
// NB keeps "Hybrid A*", "x <= 60°" and a number with its unit from breaking across lines (no-break spaces).
const SZ = (pt) => Math.max(10, Math.round(pt * 0.75));
const NB = (t) => t.replace(/Hybrid A\*/g, "Hybrid\u00a0A*").replace(/ ([≤≥=]) /g, "\u00a0$1\u00a0")
  .replace(/(\d) (m\/s|km\/h|ms|m|s)(?=$|[\s,.;:)])/g, "$1\u00a0$2");
const T = (s, text, o) => {
  const opts = Object.assign({ isTextBox: true, margin: 0, fontSize: 24, color: INK2, valign: "top", objectName: id("t") }, o);
  opts.fontSize = SZ(opts.fontSize);
  if (typeof text === "string") text = NB(text);
  if (Array.isArray(text)) text = text.map((r) => Object.assign({}, r, { text: NB(r.text) },
    r.options && r.options.fontSize ? { options: Object.assign({}, r.options, { fontSize: SZ(r.options.fontSize) }) } : {}));
  return s.addText(text, opts);
};
const card = (s, x, y, w, h, fill = BG2) => s.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.12, fill: { color: fill }, line: { type: "none" }, objectName: id("card") });
const badge = (s, x, y, d, num, fill = TEAL, fs = 16) => {
  s.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: fill }, line: { type: "none" }, objectName: id("badge") });
  T(s, String(num), { x, y, w: d, h: d, align: "center", valign: "middle", bold: true, color: WHITE, fontSize: fs });
};
const arrow = (s, x1, y1, x2, y2, color = MUTE, w = 2.25) => s.addShape(pres.ShapeType.line, {
  x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1) || 0.001, h: Math.abs(y2 - y1) || 0.001,
  flipH: x2 < x1, flipV: y2 < y1, line: { color, width: w, endArrowType: "triangle" }, objectName: id("arrow") });

// image pixel size, PNG or JPEG
function pixels(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  let i = 2;
  while (i < b.length) {
    const marker = b[i + 1], len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  throw new Error("no size for " + file);
}
// place an image inside a box, keeping its aspect; align "l" | "c" | "r", valign "t" | "m" | "b"
function fit(s, file, x, y, w, h, o = {}) {
  const full = path.join(IMG, file);
  const key = file.replace(/\.(png|jpg)$/, "");
  const [pw, ph] = SIZES[key] || pixels(full);
  const native = SIZES[key] && !o.stretch;
  let sc = Math.min(w / pw, h / ph);
  if (native) sc = Math.min(sc, o.scale || 1);   // figures and equations never grow past the size they were drawn at
  const iw = pw * sc, ih = ph * sc;
  const ix = x + (o.align === "c" ? (w - iw) / 2 : o.align === "r" ? w - iw : 0);
  const iy = y + (o.valign === "m" ? (h - ih) / 2 : o.valign === "b" ? h - ih : 0);
  s.addImage({ path: full, x: ix, y: iy, w: iw, h: ih, altText: o.alt || "", objectName: id("img") });
  return { x: ix, y: iy, w: iw, h: ih };
}
// cover-crop a photo into an exact box
function photo(s, file, x, y, w, h, alt, rounding = true) {
  s.addImage({ path: path.join(IMG, file), x, y, w, h, sizing: { type: "cover", w, h }, rounding: false, altText: alt, objectName: id("photo") });
}
const bullets = (s, items, o) => T(s, items.map((t, j) => ({
  text: typeof t === "string" ? t : t.text,
  options: Object.assign({ bullet: { indent: 16 }, breakLine: j < items.length - 1 }, typeof t === "string" ? {} : t.options),
})), Object.assign({ paraSpaceAfter: 6 }, o));

const PARTS = {
  0: "Introduction",
  1: "Part 1  ·  Modelling",
  2: "Part 2  ·  Vehicle Kinematics",
  3: "Part 3  ·  Hybrid A* and NMPC",
  4: "Part 4  ·  Results, Limitations and Future Scope",
};
const SECTIONS = { 0: "Introduction", 1: "Part 1: Modelling", 2: "Part 2: Vehicle Kinematics", 3: "Part 3: Hybrid A* and NMPC", 4: "Part 4: Limitations and Future Scope", 5: "Closing" };
let lastSection = null;
function section(k) {
  if (lastSection !== k) { pres.addSection({ title: SECTIONS[k] }); lastSection = k; }
  return SECTIONS[k];
}
function content(part, title, sec = part) {
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: section(sec) });
  if (part !== null) {
    badge(s, M, 0.39, 0.28, part, TEAL, 14);
    s.addText(PARTS[part], { placeholder: "kicker" });
  }
  s.addText(title, { placeholder: "title" });
  return s;
}
function divider(part, title, body) {
  const s = pres.addSlide({ masterName: "DIVIDER", sectionTitle: section(part) });
  badge(s, 1.5, 2.55, 2.0, part, TEAL, 96);
  s.addText(`Part ${part}`, { placeholder: "kicker" });
  s.addText(title, { placeholder: "title" });
  s.addText(body, { placeholder: "body" });
  if (PRESENTERS[part]) T(s, `Presented by ${PRESENTERS[part]}`, { x: 4.1, y: 5.15, w: 8.4, h: 0.45, fontSize: 20, color: MUTE });
  return s;
}

// =====================================================================================================
// 1. Title
{
  const s = pres.addSlide({ masterName: "TITLE", sectionTitle: section(0) });
  T(s, "Robotics  ·  Semester 3  ·  Group B9", { x: M, y: 1.25, w: 6.3, h: 0.4, fontSize: 18, bold: true, color: TEAL });
  s.addText("Model Predictive Control for Automated Reverse Docking", { placeholder: "title" });
  T(s, "Jackknife-safe parking guidance for a tractor-trailer, using Hybrid A* path planning and nonlinear MPC",
    { x: M, y: 3.3, w: 6.1, h: 0.8, fontSize: 22, color: INK2 });
  const team = [["Harshith KV", "AID25119"], ["G Venugopalan", "AID25115"], ["Rithvik Arulprakash", "AID25148"], ["Vipin Sudhakar", "AID25166"]];
  team.forEach(([nm, roll], i) => {
    const x = M + (i % 2) * 3.15, y = 4.55 + Math.floor(i / 2) * 0.66;
    T(s, [{ text: nm, options: { bold: true, color: INK, breakLine: true } }, { text: roll, options: { color: MUTE, fontSize: 14 } }],
      { x, y, w: 3.0, h: 0.6, fontSize: 18 });
  });
  card(s, 7.25, 0.6, 5.5, 6.3, BG2);
  fit(s, "fig_path.png", 7.45, 0.75, 5.1, 5.35, { align: "c", valign: "m", alt: "A route from our planner: in through the gate, a forward set-up, then reversing into the highlighted bay" });
  T(s, "A real route from our planner: drive in, set up, reverse into the bay", { x: 7.45, y: 6.2, w: 5.1, h: 0.5, fontSize: 14, color: MUTE, italic: true, align: "center" });
  s.addNotes(
    "[Opening, any one of us, about 30 seconds]\n" +
    "Good morning. We are Group B9. Our project is model predictive control for automated reverse docking: a system that guides a driver, " +
    "or in future drives the truck itself, to reverse a tractor-trailer into a parking bay without jackknifing.\n" +
    "The talk has four parts, each presented by one of us: the model, the kinematics, the two algorithms, and the limits and future scope.");
}

// 2. Part 0: the BE 6 and XEV 9e
{
  const s = content(0, "Cars Can Already Park Themselves");
  const pw = 5.95, ph = 3.55, y = TOP;
  photo(s, "car_be6.jpg", M, y, pw, ph, "Mahindra BE 6, front three-quarter view");
  photo(s, "car_xev9e.jpg", SW - M - pw, y, pw, ph, "Mahindra XEV 9e, front three-quarter view");
  T(s, "Mahindra BE 6", { x: M, y: y + ph + 0.12, w: pw, h: 0.45, fontSize: 24, bold: true, color: INK });
  T(s, "Mahindra XEV 9e", { x: SW - M - pw, y: y + ph + 0.12, w: pw, h: 0.45, fontSize: 24, bold: true, color: INK });
  card(s, M, 5.85, CW, 0.82, PALE);
  T(s, [
    { text: "Autopark: ", options: { bold: true, color: TEAL } },
    { text: "12 ultrasonic sensors; self-parks in perpendicular, angled and parallel bays", options: { color: INK } },
  ], { x: M + 0.3, y: 5.85, w: CW - 0.6, h: 0.82, fontSize: 21, valign: "middle" });
  T(s, "Photos: Cppfront, Wikimedia Commons (CC0)", { x: SW - M - 4.5, y: 6.95, w: 3.8, h: 0.3, fontSize: 10, color: MUTE, align: "right" });
  s.addNotes(
    "[Part 0, intro]\n" +
    "These are Mahindra's BE 6 and XEV 9e. Their top variants come with Autopark: twelve ultrasonic sensors, and the car parks itself " +
    "in perpendicular, angled and parallel bays, the same three layouts our project uses.\n" +
    "So self-parking is already a product for a car. The question we asked is: what about the vehicle that needs it most, a truck with a trailer? " +
    "That is the next slide.\n" +
    "(If asked: the feature is from Mahindra's own launch material for the Pack Three variants; we use the cars only as motivation, not as our platform.)");
}

// 3. Why a trailer is different
{
  const s = content(0, "Why a Truck With a Trailer Is a Different Problem");
  const rows = [
    ["", "Car", "Tractor-Trailer"],
    ["Rigid Bodies", "1", "2, joined at a hitch"],
    ["State Variables", "3", "4"],
    ["Reversing", "Stable", "Unstable: jackknifes"],
    ["Self-Parking Today", "Yes", "No"],
  ];
  const x0 = M, cw = [3.15, 1.25, 3.0], rh = 0.72;
  rows.forEach((r, i) => {
    const y = TOP + 0.05 + i * rh;
    if (i > 0) card(s, x0, y + 0.06, cw[0] + cw[1] + cw[2], rh - 0.12, i % 2 ? BG2 : WHITE);
    let x = x0 + 0.2;
    r.forEach((c, j) => {
      const head = i === 0;
      const color = head ? (j === 2 ? AMB_D : TEAL) : j === 0 ? INK : (i === 3 && j === 2 ? RED : INK2);
      T(s, c, { x, y, w: cw[j] - 0.2, h: rh, valign: "middle", fontSize: 22, bold: head || j === 0, color });
      x += cw[j];
    });
  });
  fit(s, "app_jackknife.png", 8.25, TOP + 0.05, 4.5, 3.4, { align: "r", alt: "Unaided reverse in our simulator: the trailer folds against the tractor" });
  T(s, "Unaided reverse in our simulator: the rig folds", { x: 8.25, y: TOP + 3.2, w: 4.5, h: 0.4, fontSize: 14, italic: true, color: MUTE, align: "right" });
  card(s, M, 5.6, CW, 1.05, PAMB);
  T(s, [
    { text: "Our Goal: ", options: { bold: true, color: INK } },
    { text: "guide the truck from the gate into a chosen bay while the hitch angle never exceeds 60°", options: { color: INK } },
  ], { x: M + 0.3, y: 5.6, w: CW - 0.6, h: 1.05, fontSize: 22, valign: "middle" });
  s.addNotes(
    "[Part 0, intro, continued]\n" +
    "A car is one rigid body with three numbers to describe it: position and heading. A tractor-trailer is two bodies joined at a hitch, so it needs four.\n" +
    "More importantly, a car reversing is stable. A trailer reversing is not: the hitch angle grows on its own until the trailer folds against the cab. " +
    "That is a jackknife, and the picture is our simulator with no guidance.\n" +
    "Nobody sells Autopark for an articulated truck. Our goal: take the truck from the gate into a chosen bay while the hitch angle never exceeds 60 degrees.");
}

// 4. Roadmap
{
  const s = content(null, "How This Presentation Is Organised", 0);
  T(s, "Four Parts, One Presenter Each", { x: M, y: 0.36, w: 8, h: 0.34, fontSize: 16, bold: true, color: TEAL, valign: "middle" });
  const parts = [
    ["Modelling", "The truck as a robot: bodies, joint, states and inputs"],
    ["Vehicle Kinematics", "How it moves: the equations and where they come from"],
    ["Hybrid A* and NMPC", "How we plan the route and keep the trailer stable"],
    ["Limitations and Future Scope", "Results, what is still missing, what comes next"],
  ];
  const w = (CW - 3 * 0.3) / 4;
  parts.forEach(([h, b], i) => {
    const x = M + i * (w + 0.3), y = TOP + 0.25;
    card(s, x, y, w, 3.9, BG2);
    badge(s, x + 0.3, y + 0.35, 0.8, i + 1, TEAL, 28);
    T(s, h, { x: x + 0.3, y: y + 1.4, w: w - 0.6, h: 0.8, fontSize: 24, bold: true, color: INK });
    T(s, b, { x: x + 0.3, y: y + 2.3, w: w - 0.6, h: 1.4, fontSize: 21, color: INK2 });
    if (PRESENTERS[i + 1]) T(s, PRESENTERS[i + 1], { x: x + 0.3, y: y + 3.35, w: w - 0.6, h: 0.4, fontSize: 18, color: TEAL, bold: true });
  });
  s.addNotes(
    "[Hand-over plan]\n" +
    "Part 1, modelling: what kind of robot this is, which robotics principles apply, and the state and input variables.\n" +
    "Part 2, kinematics: how the truck moves, the equations, and why reversing is unstable.\n" +
    "Part 3, the two algorithms: Hybrid A* plans the route, NMPC follows it with a hard hitch limit.\n" +
    "Part 4: results, limitations and future scope.");
}

// =====================================================================================================
// PART 1: Modelling
divider(1, "Modelling the Tractor-Trailer", "What kind of robot it is, which laws govern it, and how we describe its state");

{
  const s = content(1, "A Tractor-Trailer Is a Wheeled Mobile Robot");
  fit(s, "fig_bodies.png", M - 0.1, TOP, 7.4, 4.9, { alt: "Tractor and trailer as two rigid bodies with their own frames, joined by a passive revolute hitch, in a world frame" });
  const x = 8.0, w = SW - M - x;
  bullets(s, [
    "Two rigid bodies: the tractor and the trailer",
    "Joined by one passive revolute joint, the hitch",
    "Its configuration needs four numbers:",
  ], { x, y: TOP + 0.15, w, h: 1.6, fontSize: 24 });
  fit(s, "eq_config.png", x + 0.3, TOP + 1.8, w - 0.3, 0.6, { alt: "q equals x1, y1, theta0, theta1" });
  card(s, x, TOP + 2.75, w, 1.0, PAMB);
  T(s, "Only two inputs are driven: speed and steering. The hitch just follows",
    { x: x + 0.25, y: TOP + 2.75, w: w - 0.5, h: 1.0, fontSize: 21, color: INK, valign: "middle" });
  s.addNotes(
    "[Part 1, Person A]\n" +
    "We model the truck the way robotics models any wheeled mobile robot. There are two rigid bodies: the tractor, frame T, and the trailer, frame R, in a world frame W.\n" +
    "They are joined by one revolute joint, the hitch, the fifth wheel. Like a joint in a robot arm it rotates about one axis, but it has no motor: it is passive.\n" +
    "To say where the whole rig is we need four numbers, the configuration q: the x and y of the tractor rear axle, the tractor heading theta0 and the trailer heading theta1.\n" +
    "But the driver controls only two things: speed and steering. Four coordinates, two inputs, so the system is under-actuated. The trailer goes wherever the hitch drags it.");
}

{
  const s = content(1, "Three Robotics Principles Behind the Model");
  const items = [
    ["Rigid-Body Transforms", "Hitch and trailer poses follow from the tractor pose: a chain of frames, like a 2-link arm"],
    ["Rolling Without Slipping", "Each axle moves only along its own heading, never sideways"],
    ["Nonholonomic but Controllable", "2 inputs still reach all 4 states: that is why parking manoeuvres work [7]"],
  ];
  const x = M, w = 7.0;
  items.forEach(([h, b], i) => {
    const y = TOP + 0.05 + i * 1.62;
    badge(s, x, y + 0.05, 0.6, i + 1, TEAL, 22);
    T(s, h, { x: x + 0.85, y, w: w - 0.85, h: 0.5, fontSize: 24, bold: true, color: INK });
    T(s, b, { x: x + 0.85, y: y + 0.52, w: w - 0.85, h: 1.0, fontSize: 20, color: INK2 });
  });
  fit(s, "fig_wheel.png", 8.0, TOP - 0.1, 4.7, 3.65, { align: "c", alt: "A wheel can roll along its heading but cannot slide sideways" });
  card(s, 7.95, TOP + 3.65, SW - M - 7.95, 1.45, BG2);
  T(s, "No-Slip Constraint, One per Axle", { x: 8.2, y: TOP + 3.75, w: 4.4, h: 0.4, fontSize: 18, color: INK2 });
  fit(s, "eq_noslip.png", 8.2, TOP + 4.25, 4.35, 0.7, { align: "c", alt: "x-dot sin theta minus y-dot cos theta equals zero" });
  s.addNotes(
    "[Part 1, Person A: the laws of robotics that apply]\n" +
    "Three principles from our robotics course give us the whole model.\n" +
    "One, rigid-body transforms. Once we know where the tractor rear axle is and which way it points, the hitch and the trailer axle follow by chaining frames, " +
    "exactly like forward kinematics of a two-link planar arm.\n" +
    "Two, rolling without slipping. A wheel rolls along its heading but cannot slide sideways. Written as an equation, the velocity perpendicular to the wheel is zero: " +
    "x-dot sin theta minus y-dot cos theta equals zero. We get one such constraint at the tractor rear axle and one at the trailer axle. These constraints are on velocities, " +
    "not positions, so they cannot be integrated away: the system is nonholonomic.\n" +
    "Three, it is still controllable. Four coordinates minus two velocity constraints leaves two free motions, which are exactly our two inputs. " +
    "By combining them, forward, reverse, steer, the truck can still reach any position and heading; mathematically that is Chow's theorem, Lie brackets of the two input fields. " +
    "In plain words: you cannot slide a truck sideways into a bay, but you can always manoeuvre into it, which is what parking is.");
}

{
  const s = content(1, "State Variables and Control Inputs");
  fit(s, "fig_geometry.png", M - 0.2, TOP + 0.05, 7.1, 4.4, { alt: "Geometry of the rig: rear axle (x1, y1), headings theta0 and theta1, hitch angle psi, steering delta, wheelbases L1 and L2" });
  const x = 7.6, w = SW - M - x, lw = 1.75;
  const row = (sym, txt, y) => {
    T(s, sym, { x, y, w: lw, h: 0.42, fontSize: 20, italic: true, color: INK, fontFace: "Cambria Math", valign: "middle" });
    T(s, txt, { x: x + lw, y, w: w - lw, h: 0.42, fontSize: 20, color: INK2, valign: "middle" });
  };
  T(s, "State", { x, y: TOP - 0.05, w, h: 0.4, fontSize: 20, bold: true, color: TEAL });
  fit(s, "eq_state.png", x, TOP + 0.38, w, 0.6, { alt: "X equals x1, y1, theta0, psi, transposed" });
  row("x₁, y₁", "rear-axle position", TOP + 1.08);
  row("θ₀", "tractor heading", TOP + 1.52);
  row("ψ = θ₀ − θ₁", "hitch angle", TOP + 1.96);
  T(s, "Inputs", { x, y: TOP + 2.55, w, h: 0.4, fontSize: 20, bold: true, color: TEAL });
  fit(s, "eq_input.png", x, TOP + 2.98, w, 0.6, { alt: "U equals v, delta, transposed" });
  row("v", "speed (< 0 in reverse)", TOP + 3.68);
  row("δ", "steering angle", TOP + 4.12);
  const chips = ["L₁ = 4 m", "L₂ = 8 m", "d = 0.5 m", "|δ| ≤ 35°", "|ψ| ≤ 60°", "|v| ≤ 2 m/s"];
  const cwid = (CW - 5 * 0.2) / 6;
  chips.forEach((c, i) => {
    const x0 = M + i * (cwid + 0.2);
    card(s, x0, 6.2, cwid, 0.55, i < 3 ? BG2 : PALE);
    T(s, c, { x: x0, y: 6.2, w: cwid, h: 0.55, fontSize: 20, color: INK, align: "center", valign: "middle", fontFace: "Cambria Math" });
  });
  s.addNotes(
    "[Part 1, Person A: state and inputs]\n" +
    "The state X has four entries: x1, y1, the position of the tractor rear axle; theta0, the tractor heading; and psi, the hitch angle, " +
    "tractor heading minus trailer heading.\n" +
    "Why psi and not theta1? They carry the same information, but psi is the quantity we must keep safe. A jackknife is psi growing too large, so we make it a state and put a hard limit on it.\n" +
    "The inputs U are the two things a driver controls: speed v, negative when reversing, and the front-wheel steering angle delta.\n" +
    "Parameters along the bottom: a 4 m tractor wheelbase L1, an 8 m trailer from hitch to axle L2, the hitch 0.5 m ahead of the rear axle d, " +
    "35 degrees of steering lock, a 60 degree hitch limit, and yard speed up to 2 m/s, about 7 km/h.");
}

// =====================================================================================================
// PART 2: Vehicle kinematics
divider(2, "Vehicle Kinematics", "How the rig moves for a given speed and steering angle, and why reversing is unstable");

{
  const s = content(2, "The Tractor: Kinematic Bicycle Model");
  fit(s, "fig_bicycle.png", M - 0.1, TOP - 0.15, 5.6, 5.3, { alt: "Bicycle model: rear and front wheel, steering angle delta, both wheel axes meeting at the instantaneous centre of rotation at radius R" });
  const x = 6.55, w = SW - M - x;
  bullets(s, [
    "Front wheels lumped into one, rear wheels into one",
    "Both wheel axes meet at the instantaneous centre of rotation (ICR)",
  ], { x, y: TOP, w, h: 1.7, fontSize: 22 });
  fit(s, "eq_R.png", x + 0.35, TOP + 1.15, 2.4, 0.95, { alt: "R equals L1 over tan delta" });
  card(s, x, TOP + 2.35, w, 2.15, PALE);
  T(s, "Rear-Axle Motion", { x: x + 0.3, y: TOP + 2.45, w: w - 0.6, h: 0.4, fontSize: 18, bold: true, color: TEAL });
  fit(s, "eq_bx.png", x + 0.3, TOP + 2.95, 2.6, 0.55, { alt: "x1 dot equals v cos theta0" });
  fit(s, "eq_by.png", x + 0.3, TOP + 3.65, 2.6, 0.55, { alt: "y1 dot equals v sin theta0" });
  fit(s, "eq_bth.png", x + 3.0, TOP + 3.0, w - 3.2, 1.2, { valign: "m", alt: "theta0 dot equals v over R equals v over L1 tan delta" });
  s.addNotes(
    "[Part 2, Person B]\n" +
    "We start with the tractor alone. Each axle's two wheels are lumped into one wheel on the centre line: the kinematic bicycle model.\n" +
    "Because no wheel may slide sideways, the line through each wheel's axle must pass through one common point, the instantaneous centre of rotation. " +
    "The rear axle is perpendicular to the body, the front axle is turned by delta, and the geometry of that triangle gives the turning radius R = L1 / tan delta.\n" +
    "The rear axle moves along the heading at speed v, so x-dot is v cos theta0 and y-dot is v sin theta0.\n" +
    "It moves on a circle of radius R, so the heading changes at v over R, which is v tan delta over L1.\n" +
    "These three equations are the first three of our model.");
}

{
  const s = content(2, "The Trailer: Hitch Geometry and No-Slip Constraint");
  fit(s, "fig_hitch.png", M - 0.2, TOP - 0.1, 7.2, 4.7, { alt: "Hitch velocity v_h split into a component along the trailer and a component v-perpendicular across it; the trailer axle has no sideways slip" });
  const x = 7.55, w = SW - M - x;
  const steps = [
    ["Hitch Position", "eq_ph.png", 0.5],
    ["Trailer-Axle Position", "eq_p2.png", 0.5],
    ["Only v⊥ Turns the Trailer", "eq_th1.png", 1.0],
  ];
  let y = TOP - 0.05;
  steps.forEach(([h, eqf, eh], i) => {
    badge(s, x, y + 0.02, 0.42, i + 1, AMB_D, 16);
    T(s, h, { x: x + 0.6, y, w: w - 0.6, h: 0.45, fontSize: 22, bold: true, color: INK });
    fit(s, eqf, x + 0.6, y + 0.55, w - 0.6, eh, { alt: h });
    y += 0.55 + eh + 0.38;
  });
  s.addNotes(
    "[Part 2, Person B]\n" +
    "Now the trailer. Step 1, rigid-body transform: the hitch sits a distance d ahead of the tractor rear axle along the tractor heading.\n" +
    "Step 2: the trailer axle is L2 behind the hitch along the trailer heading theta1.\n" +
    "Step 3 is the no-slip constraint at the trailer axle. Differentiate the hitch position: its velocity v_h is the rear-axle velocity plus d times theta0-dot sideways. " +
    "Split v_h into a part along the trailer and a part across it, v-perpendicular. The trailer axle cannot slide, so the along part just drags the trailer straight, " +
    "and the across part rotates the trailer about its axle, with radius L2.\n" +
    "Working out the components: v-perpendicular is v sin psi plus d theta0-dot cos psi, so theta1-dot is that over L2.");
}

{
  const s = content(2, "The Complete Four-State Model");
  card(s, M, TOP, 4.0, 3.1, PALE);
  T(s, "Tractor", { x: M + 0.3, y: TOP + 0.15, w: 3.4, h: 0.4, fontSize: 20, bold: true, color: TEAL });
  fit(s, "eq_bx.png", M + 0.3, TOP + 0.7, 3.4, 0.55, { alt: "x1 dot equals v cos theta0" });
  fit(s, "eq_by.png", M + 0.3, TOP + 1.35, 3.4, 0.55, { alt: "y1 dot equals v sin theta0" });
  fit(s, "eq_bth.png", M + 0.3, TOP + 2.0, 3.4, 0.95, { scale: 0.92, alt: "theta0 dot equals v over L1 tan delta" });
  const x = M + 4.3, w = SW - M - x;
  card(s, x, TOP, w, 3.1, BG2);
  T(s, "Hitch Angle", { x: x + 0.3, y: TOP + 0.15, w: 3, h: 0.4, fontSize: 20, bold: true, color: INK });
  fit(s, "eq_psidef.png", x + 0.3, TOP + 0.7, w - 0.6, 0.6, { alt: "psi dot equals theta0 dot minus theta1 dot" });
  fit(s, "eq_psidot.png", x + 0.3, TOP + 1.6, w - 0.6, 1.2, { align: "c", alt: "psi dot equals v times: tan delta over L1, minus sin psi over L2, minus d tan delta cos psi over L1 L2" });
  const terms = [
    ["Steering Term", "The only input that acts on the hitch", TEAL, PALE],
    ["Hitch Term", "Restores ψ going forward, destabilises it in reverse", RED, REDT],
    ["Offset Term", "Hitch 0.5 m ahead of the axle: a small correction", MUTE, BG2],
  ];
  const tw = (CW - 2 * 0.3) / 3;
  terms.forEach(([h, b, col, fill], i) => {
    const x0 = M + i * (tw + 0.3), y0 = TOP + 3.35;
    card(s, x0, y0, tw, 1.3, fill);
    T(s, h, { x: x0 + 0.25, y: y0 + 0.15, w: tw - 0.5, h: 0.45, fontSize: 22, bold: true, color: col });
    T(s, b, { x: x0 + 0.25, y: y0 + 0.65, w: tw - 0.5, h: 1.0, fontSize: 20, color: INK });
  });
  s.addNotes(
    "[Part 2, Person B]\n" +
    "Putting it together. The hitch angle is theta0 minus theta1, so its rate is theta0-dot minus theta1-dot. Substituting both, we get the fourth equation.\n" +
    "It has three terms, colour coded. The teal steering term is the only way the driver influences psi. The red hitch term, minus v sin psi over L2, is the trailer's own reaction. " +
    "The grey term exists because the hitch is 0.5 m ahead of the rear axle; it is a few per cent.\n" +
    "Notice every term is multiplied by v: the path the rig traces depends on distance travelled, not on speed. So we choose the path first and the speed separately.\n" +
    "We integrate these four equations with fourth-order Runge-Kutta, and exactly this model is used by the planner, the controller and the viewer.");
}

{
  const s = content(2, "Why Reversing Is Unstable");
  fit(s, "fig_unstable.png", M - 0.25, TOP - 0.1, 6.6, 4.9, { alt: "Hitch angle from a 2 degree start: forward it decays, in reverse it grows past 60 degrees after 28 metres" });
  const x = 7.0, w = SW - M - x;
  T(s, "Linearise at ψ ≈ 0 and δ = 0:", { x, y: TOP, w, h: 0.45, fontSize: 22, color: INK2 });
  fit(s, "eq_lin.png", x, TOP + 0.55, w, 0.9, { alt: "psi dot is approximately minus v over L2 times psi, so lambda equals minus v over L2" });
  bullets(s, [
    { text: "Forward, v > 0: λ < 0, ψ decays", options: { color: GREEN } },
    { text: "Reverse, v < 0: λ > 0, ψ grows", options: { color: RED } },
    { text: "It grows ×e every L₂ = 8 m of travel", options: { color: INK } },
  ], { x, y: TOP + 1.65, w, h: 1.75, fontSize: 22 });
  card(s, x, TOP + 3.6, w, 1.45, REDT);
  T(s, "28 m", { x: x + 0.3, y: TOP + 3.6, w: 2.3, h: 1.45, fontSize: 54, bold: true, color: RED, valign: "middle" });
  T(s, "From a 2° error to the 60° limit, in reverse", { x: x + 2.6, y: TOP + 3.6, w: w - 2.85, h: 1.45, fontSize: 20, color: INK, valign: "middle" });
  s.addNotes(
    "[Part 2, Person B: the key insight of the whole project]\n" +
    "Take the hitch equation with straight steering and a small angle, so sin psi is about psi. We get psi-dot = minus v over L2 times psi: a first-order system with eigenvalue lambda = minus v over L2.\n" +
    "Driving forward, v is positive, lambda is negative, and any hitch angle dies out: the trailer straightens itself.\n" +
    "Reversing, v is negative, lambda is positive, and the angle grows exponentially, by a factor e every L2 = 8 metres travelled.\n" +
    "The graph is the exact solution, not a simulation: starting from just 2 degrees, reversing reaches the 60 degree limit after 28 metres, while forward it vanishes.\n" +
    "This is why a simple reactive controller fails, and why Part 3 needs a planner and a predictive controller.");
}

// =====================================================================================================
// PART 3: Hybrid A* and NMPC
divider(3, "Hybrid A* and NMPC", "Hybrid A* plans a route the truck can drive; NMPC follows it without breaking the hitch limit");

{
  const s = content(3, "Hybrid A*: Planning a Path the Truck Can Drive");
  const w = (CW - 0.4) / 2;
  [[M, "In General"], [M + w + 0.4, "In Our Project"]].forEach(([x, h], i) => {
    card(s, x, TOP, w, 5.1, i ? PALE : BG2);
    T(s, h, { x: x + 0.3, y: TOP + 0.15, w: w - 0.6, h: 0.45, fontSize: 22, bold: true, color: i ? TEAL : INK });
  });
  const gx = M;
  fit(s, "fig_grid.png", gx + 0.3, TOP + 0.75, w - 0.6, 2.45, { align: "c", alt: "Grid A* path with sharp corners against a smooth drivable Hybrid A* path around an obstacle" });
  bullets(s, [
    "A* always expands the lowest f = g + h",
    "Grid paths have corners no truck can drive",
    "Hybrid A* keeps the exact pose and grows the tree with short drivable arcs",
  ], { x: gx + 0.3, y: TOP + 3.38, w: w - 0.6, h: 1.65, fontSize: 20, paraSpaceAfter: 4 });
  const ox = M + w + 0.4;
  fit(s, "fig_primitives.png", ox + 0.3, TOP + 0.75, w - 0.6, 2.45, { align: "c", alt: "Ten motion primitives from one pose: five forward, five reverse" });
  bullets(s, [
    "State (x, y, θ₀, ψ); 10 arcs of 2 m per node, forward and reverse",
    "Arcs with |ψ| > 52° or under 0.35 m clearance are dropped",
    "Heuristic: trailer-axle Dubins path [4], [5]",
  ], { x: ox + 0.3, y: TOP + 3.38, w: w - 0.6, h: 1.65, fontSize: 20, paraSpaceAfter: 4 });
  s.addNotes(
    "[Part 3, Person C: Hybrid A*]\n" +
    "In general: A* is a graph search. It keeps a list of open cells and always expands the one with the lowest f = g + h, where g is the cost so far and h an estimate of the cost to go. " +
    "With an admissible h it finds the shortest path. But on a grid the path has sharp corners, and a 12 metre truck cannot turn on the spot.\n" +
    "Hybrid A*, from the Stanford DARPA Urban Challenge team (Dolgov 2010), fixes this: each node stores the exact continuous pose, and children are generated by simulating short drivable arcs with the vehicle model. " +
    "The grid is used only to detect that two nodes are about the same.\n" +
    "In our project: the search state includes the hitch angle psi. From every node we try ten arcs, two metres each, forward and reverse, each steering the hitch toward 0, plus or minus 25 or plus or minus 45 degrees. " +
    "Because reversing is unstable, each arc uses a small feedback law that holds the hitch at its target; without it, reverse arcs blow up. " +
    "Any arc that goes beyond 52 degrees, which keeps margin below 60, or comes within 35 cm of an obstacle is discarded. " +
    "The cost to go is the shortest Dubins path of the trailer axle, because the trailer axle behaves like a car whose steering is the hitch angle.");
}

{
  const s = content(3, "NMPC: Predict, Optimise, Apply, Repeat");
  fit(s, "fig_horizon.png", M - 0.2, TOP - 0.1, 6.4, 4.15, { alt: "Receding horizon: measured hitch angle up to now, predicted angle over the next 9.6 seconds below the 60 degree limit, and eight steering moves of which only the first is applied" });
  const x = 6.95, w = SW - M - x;
  T(s, "In General", { x, y: TOP - 0.05, w, h: 0.4, fontSize: 20, bold: true, color: INK });
  const steps = ["Predict the next seconds with the model", "Minimise a cost under hard limits", "Apply the first input, then repeat"];
  steps.forEach((t, i) => {
    const y = TOP + 0.45 + i * 0.55;
    badge(s, x, y + 0.05, 0.38, i + 1, INK2, 14);
    T(s, t, { x: x + 0.58, y, w: w - 0.58, h: 0.48, fontSize: 19, color: INK2, valign: "middle" });
  });
  T(s, "In Our Project", { x, y: TOP + 2.25, w, h: 0.4, fontSize: 20, bold: true, color: TEAL });
  bullets(s, [
    "Horizon 9.6 s, 8 steering moves",
    "Hard limits on ψ (60°), δ (35°) and clearance",
    "Re-solved every 0.25 s in 19–42 ms (SLSQP [6])",
  ], { x, y: TOP + 2.7, w, h: 1.6, fontSize: 19, paraSpaceAfter: 6 });
  card(s, M, 5.78, CW, 1.0, BG2);
  T(s, "Cost:", { x: M + 0.3, y: 5.78, w: 1.2, h: 1.0, fontSize: 18, bold: true, color: INK2, valign: "middle" });
  fit(s, "eq_cost.png", M + 1.3, 5.82, CW - 1.9, 0.92, { align: "c", valign: "m", alt: "Cost J: tracking error over 24 steps weighted by Q, plus R times steering squared plus S times steering change squared over 8 moves" });
  s.addNotes(
    "[Part 3, Person C: NMPC]\n" +
    "In general, model predictive control works like a chess player. At every step it uses the model to predict the next few seconds, picks the sequence of inputs that " +
    "minimises a cost while respecting hard limits, applies only the first input, then measures again and repeats. 'Nonlinear' means we predict with the full nonlinear model from Part 2, not a linearised one.\n" +
    "In our project: the horizon is 9.6 seconds, 24 steps of 0.4 s, which is longer than the instability needs to grow, so the controller sees the jackknife coming. " +
    "To keep it fast we choose only 8 steering moves, each held for 1.2 s.\n" +
    "The cost at the bottom penalises distance from the planned path, mainly the trailer axle, plus steering effort and changes of steering so the wheel does not jerk.\n" +
    "The hitch limit of 60 degrees, the 35 degree steering lock and 25 cm clearance are hard constraints: the solver may not violate them, rather than just paying a penalty.\n" +
    "SciPy's SLSQP solves it in 19 to 42 milliseconds, far inside the quarter-second control period.");
}

{
  const s = content(3, "How Hybrid A* and NMPC Work Together");
  const boxes = [
    ["Yard and Bay", "Obstacles, parked trucks, chosen bay", BG2, INK],
    ["Hybrid A*", "Plans the whole route once", PALE, TEAL],
    ["NMPC", "Tracks it every 0.25 s, ψ ≤ 60°", PALE, TEAL],
    ["Driver Guidance", "Gear, km/h, wheel turns, distance", BG2, INK],
  ];
  const bw = 2.7, gap = (CW - 4 * bw) / 3;
  boxes.forEach(([h, b, fill, col], i) => {
    const x = M + i * (bw + gap);
    card(s, x, TOP, bw, 1.55, fill);
    T(s, h, { x: x + 0.2, y: TOP + 0.12, w: bw - 0.4, h: 0.5, fontSize: 22, bold: true, color: col });
    T(s, b, { x: x + 0.2, y: TOP + 0.65, w: bw - 0.4, h: 0.8, fontSize: 17, color: INK2 });
    if (i < 3) arrow(s, x + bw + 0.08, TOP + 0.78, x + bw + gap - 0.08, TOP + 0.78, MUTE, 2.5);
  });
  fit(s, "app_guided.png", M, TOP + 1.9, 6.1, 2.95, { alt: "Viewer screenshot: rig reversing with the NMPC look-ahead and the planned path" });
  T(s, "Planned path (dashed) and the NMPC look-ahead as ghost rigs", { x: M, y: TOP + 4.92, w: 6.1, h: 0.3, fontSize: 14, italic: true, color: MUTE });
  const x = 7.1, w = SW - M - x;
  const cols = [
    ["Planner: Global", "Sees the whole yard; decides which way to go and where to switch gear", TEAL],
    ["Controller: Local", "Sees 9.6 s ahead; decides how to steer right now and corrects drift", AMB_D],
  ];
  cols.forEach(([h, b, col], i) => {
    const y = TOP + 1.95 + i * 1.65;
    T(s, h, { x, y, w, h: 0.45, fontSize: 22, bold: true, color: col });
    T(s, b, { x, y: y + 0.48, w, h: 1.0, fontSize: 20, color: INK2 });
  });
  s.addNotes(
    "[Part 3, Person C: tying it to our project]\n" +
    "The pipeline: the user picks a yard layout and a free bay. Hybrid A* plans the whole route once, from the gate to the bay, including where to stop and switch into reverse.\n" +
    "NMPC then follows that route in closed loop every quarter second, and it is the NMPC that guarantees the 60 degree hitch limit, even when the truck drifts or is disturbed.\n" +
    "Finally the guidance layer turns the controller's steering angles into something a person can follow: gear, speed in km/h, steering-wheel turns and how far to hold them.\n" +
    "Why both? The planner is global but open loop; on its own, a small error in reverse grows, as Part 2 showed. The controller is closed loop but local; on its own, it does not know how to get around a parked truck. " +
    "Together: the planner says which way, the controller says how to steer now.");
}

// =====================================================================================================
// PART 4: Results, limitations, future scope
divider(4, "Limitations and Future Scope", "What the system achieves today, what it does not do yet, and where it goes next");

{
  const s = content(4, "Results at a Glance");
  const stats = [
    ["110/110", "Bays certified for guidance", TEAL],
    ["0", "Hitch-limit violations with NMPC", TEAL],
    ["50.1°", "Worst hitch angle (limit 60°)", TEAL],
    ["72/72", "Unaided reverses jackknife", RED],
  ];
  const sw = (CW - 3 * 0.3) / 4;
  stats.forEach(([v, l, col], i) => {
    const x = M + i * (sw + 0.3);
    card(s, x, TOP, sw, 1.75, BG2);
    T(s, v, { x: x + 0.25, y: TOP + 0.12, w: sw - 0.4, h: 0.85, fontSize: 38, bold: true, color: col, valign: "middle" });
    T(s, l, { x: x + 0.25, y: TOP + 0.98, w: sw - 0.5, h: 0.7, fontSize: 17, color: INK2 });
  });
  fit(s, "fig_compare.png", M, TOP + 2.0, 4.9, 3.2, { alt: "Hitch angle against time for one bay: NMPC stays inside 60 degrees, the unaided driver jackknifes" });
  const iw = (CW - 4.9 - 0.6) / 2;
  [["app_parked.png", "With NMPC guidance: parked"], ["app_jackknife.png", "Without guidance: jackknife"]].forEach(([f, cap], i) => {
    const x = M + 4.9 + 0.3 + i * (iw + 0.3);
    photo(s, f, x, TOP + 2.05, iw, 2.65, cap);
    T(s, cap, { x, y: TOP + 4.78, w: iw, h: 0.4, fontSize: 16, color: i ? RED : GREEN, bold: true });
  });
  s.addNotes(
    "[Part 4, Person D: results first, briefly]\n" +
    "We tested four layouts, cross, angled, parallel and tandem, each with six random fills of parked trucks: 110 free bays. Every bay was planned, driven by the NMPC and checked: " +
    "within 0.8 m of the bay centre, within 10 degrees of heading, never above 60 degrees of hitch, never closer than 10 cm to anything.\n" +
    "All 110 pass. The hitch limit was never violated; the worst case was 50.1 degrees. On the same paths, a driver model with no hitch awareness jackknifed on all 72 reversing manoeuvres.\n" +
    "The plot is one bay: the NMPC deliberately swings the hitch to about minus 48 degrees and brings it back; the unaided run passes 60 and folds.");
}

{
  const s = content(4, "Limitations and Future Scope");
  const w = (CW - 0.4) / 2;
  const cols = [
    ["Limitations", BG2, INK, [
      "Kinematic model: no tyre slip or load transfer",
      "Pose assumed known: no camera or LiDAR yet",
      "One trailer, in a simulated yard",
      "Solver runs on a laptop; tight yards plan slowly",
    ]],
    ["Future Scope", PALE, TEAL, [
      "Camera and LiDAR pose feedback, as base paper [1] proposes",
      "Faster NMPC (acados, IPOPT) for tighter yards",
      "Re-planning inside the control loop",
      "Trials with real drivers; double-trailer rigs",
    ]],
  ];
  cols.forEach(([h, fill, col, items], i) => {
    const x = M + i * (w + 0.4);
    card(s, x, TOP, w, 5.1, fill);
    T(s, h, { x: x + 0.35, y: TOP + 0.25, w: w - 0.7, h: 0.5, fontSize: 26, bold: true, color: col });
    bullets(s, items, { x: x + 0.35, y: TOP + 1.0, w: w - 0.7, h: 3.9, fontSize: 22, paraSpaceAfter: 16, color: INK });
  });
  s.addNotes(
    "[Part 4, Person D]\n" +
    "Limitations, honestly. One: the model is kinematic, it assumes the wheels never slip. At yard speeds of a few km/h that holds to a few centimetres, inside our clearance margin, but not on ice or at speed.\n" +
    "Two: we assume the truck's position and hitch angle are known. A real truck needs sensors to measure them.\n" +
    "Three: one trailer and a simulated yard.\n" +
    "Four: the solver runs on a laptop for one user; very tight bays can take the planner several seconds.\n" +
    "Future scope, mapping to those: add camera and LiDAR state estimation, which is the sensing layer base paper [1] proposes; a dedicated NMPC solver like acados to handle tighter yards in real time; " +
    "re-planning inside the loop when the truck drifts; trials with human drivers following the instructions, and double-trailer road trains, which add another unstable mode.");
}

{
  const s = content(4, "Conclusion");
  const items = [
    "Reversing a trailer is unstable: a 2° error reaches 60° in 28 m",
    "Hybrid A* plans a route the rig can drive; NMPC holds |ψ| ≤ 60°",
    "All 110 test bays parked; every unaided reverse jackknifed",
    "Driver output: gear, speed, wheel turns",
  ];
  items.forEach((t, i) => {
    const y = TOP + 0.35 + i * 1.05;
    badge(s, M, y + 0.05, 0.55, i + 1, TEAL, 20);
    T(s, t, { x: M + 0.85, y, w: 6.3, h: 1.05, fontSize: 22, color: INK, valign: "top" });
  });
  photo(s, "app_parked.png", 8.0, TOP + 0.1, SW - M - 8.0, 4.6, "The rig parked in its bay under NMPC guidance");
  s.addNotes(
    "[Part 4, Person D: close]\n" +
    "To conclude: reversing a trailer is open-loop unstable, a 2 degree error becomes 60 in 28 metres. We modelled the rig as a nonholonomic wheeled robot, " +
    "planned drivable routes with Hybrid A*, and tracked them with an NMPC that treats the hitch limit as a hard constraint. " +
    "Every one of the 110 test bays parked, and every unaided reverse jackknifed. And the output is something a human driver can execute.\n" +
    "Thank you; we are happy to take questions, or show the live demo.");
}

// =====================================================================================================
// Closing: references and thanks
{
  const s = content(null, "References", 5);
  const refs = [
    "G. Alenchery et al., “Parking Assistance for Trailer-Truck Transport Vehicles Using Sensor Fusion and Motion Planning,” arXiv:2605.02716, 2026.",
    "M. Beglini, T. Belvedere, L. Lanari, G. Oriolo, “An Intrinsically Stable MPC Approach for Anti-Jackknifing Control of Tractor-Trailer Vehicles,” IEEE/ASME Trans. Mechatronics, 27(6), 4417–4428, 2022.",
    "E. Kayacan, E. Kayacan, H. Ramon, W. Saeys, “Robust Tube-Based Decentralized Nonlinear Model Predictive Control of an Autonomous Tractor-Trailer System,” IEEE/ASME Trans. Mechatronics, 20(1), 447–456, 2015.",
    "D. Dolgov, S. Thrun, M. Montemerlo, J. Diebel, “Path Planning for Autonomous Vehicles in Unknown Semi-structured Environments,” Int. J. Robotics Research, 29(5), 485–501, 2010.",
    "L. E. Dubins, “On Curves of Minimal Length with a Constraint on Average Curvature,” American J. Mathematics, 79(3), 497–516, 1957.",
    "D. Kraft, “A Software Package for Sequential Quadratic Programming,” DFVLR-FB 88-28, DLR, 1988.",
    "S. M. LaValle, Planning Algorithms, Cambridge University Press, 2006, ch. 13 (nonholonomic systems).",
    "Mahindra & Mahindra, “Mahindra Democratises Premium EV Technology, Announces Top Variant Prices of BE 6 and XEV 9e,” press release, 2025.",
  ];
  T(s, refs.map((r, i) => ({ text: `[${i + 1}]  ${r}`, options: { breakLine: i < refs.length - 1 } })),
    { x: M, y: TOP - 0.05, w: CW, h: 5.2, fontSize: 18, color: INK2, paraSpaceAfter: 10 });
  s.addNotes("References cited on the slides as [n]. [1] and [2] are our two base papers.");
}

{
  const s = content(null, "Thank You", 5);
  T(s, "Questions?", { x: M, y: TOP + 0.1, w: 6.0, h: 0.8, fontSize: 32, bold: true, color: TEAL });
  T(s, [
    { text: "Harshith KV", options: { breakLine: true } },
    { text: "G Venugopalan", options: { breakLine: true } },
    { text: "Rithvik Arulprakash", options: { breakLine: true } },
    { text: "Vipin Sudhakar" },
  ], { x: M, y: TOP + 1.15, w: 6.0, h: 2.2, fontSize: 24, color: INK, paraSpaceAfter: 6 });
  card(s, M, TOP + 3.65, 6.0, 1.35, PALE);
  T(s, [
    { text: "Live Demo: ", options: { bold: true, color: TEAL } },
    { text: "pick a yard, click a free bay, watch the NMPC drive it, then push the trailer", options: { color: INK } },
  ], { x: M + 0.3, y: TOP + 3.65, w: 5.4, h: 1.35, fontSize: 20, valign: "middle" });
  card(s, 7.25, TOP + 0.85, SW - M - 7.25, 3.3, BG2);
  fit(s, "app_guided.png", 7.4, TOP + 1.0, SW - M - 7.55, 3.0, { align: "c", valign: "m", alt: "The rig reversing under NMPC guidance in our viewer" });
  s.addNotes(
    "Offer the live demo: run v2 (run_demo.bat), pick a layout, click a green bay, show the guidance, switch to Unaided on the same bay to show the jackknife, " +
    "then switch to Live and press the push button to kick the hitch 10 degrees and watch the NMPC catch it.");
}

(async () => {
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("wrote", OUT);
})();
