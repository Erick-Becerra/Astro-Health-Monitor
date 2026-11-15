// Symbolic skeleton for the body diagram. It is drawn only while "Bone and muscle" is selected.
// Same coordinates as the silhouette (centre line x = 0, "eight heads" heights, see lib/bodyOutline.js).
// The right half is written once and mirrored. Every piece has the class "shape" so it takes the
// colour of the system (blue base, or yellow / orange / red from the backend).

// A bone shaft: a rounded bar from (x1, y1) to (x2, y2) with radius r.
const bar = (x1, y1, x2, y2, r) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const nx = (-dy / len) * r;
  const ny = (dx / len) * r;
  const f = (n) => n.toFixed(2);
  return (
    `M${f(x1 + nx)} ${f(y1 + ny)} L${f(x2 + nx)} ${f(y2 + ny)} A${r} ${r} 0 0 1 ${f(x2 - nx)} ${f(y2 - ny)} ` +
    `L${f(x1 - nx)} ${f(y1 - ny)} A${r} ${r} 0 0 1 ${f(x1 + nx)} ${f(y1 + ny)} Z`
  );
};

const Shape = ({ d, thin }) => <path d={d} className={thin ? "shape line thin" : "shape"} />;
const Ball = ({ x, y, r }) => <circle cx={x} cy={y} r={r} className="shape" />;
const Oval = ({ x, y, rx, ry, turn = 0 }) => (
  <ellipse cx={x} cy={y} rx={rx} ry={ry} className="shape" transform={`rotate(${turn} ${x} ${y})`} />
);

// ---- Centre line: skull, spine, sternum, sacrum ----
function Skull() {
  return (
    <g>
      <Oval x={0} y={76} rx={20} ry={25} />
      <Shape d="M-15 96 C-15 110 -8 120 0 120 C8 120 15 110 15 96" thin />
      {/* eye sockets and nose are dark holes */}
      <circle cx={-8} cy={91} r={4.6} className="hole" />
      <circle cx={8} cy={91} r={4.6} className="hole" />
      <path d="M0 98 L-2.8 107 L2.8 107 Z" className="hole" />
      <Shape d="M-8 112 H8" thin />
    </g>
  );
}

function Spine() {
  const rows = [];
  // cervical (small), thoracic (medium) and lumbar (large) vertebrae
  for (let i = 0; i < 7; i++) rows.push({ y: 124 + i * 3.7, w: 7 + i * 0.3, h: 2.8 });
  for (let i = 0; i < 12; i++) rows.push({ y: 150 + i * 8.4, w: 9 + i * 0.2, h: 5.6 });
  for (let i = 0; i < 5; i++) rows.push({ y: 252 + i * 8.6, w: 12.5, h: 6.4 });
  return (
    <g>
      {rows.map(({ y, w, h }, i) => (
        <rect key={i} x={-w / 2} y={y} width={w} height={h} rx={2} className="shape" />
      ))}
    </g>
  );
}

const STERNUM = "M-5 148 L5 148 L4 164 L3 206 L0 215 L-3 206 L-4 164 Z";
const SACRUM = "M-10 296 L10 296 L5 322 L0 334 L-5 322 Z";

// ---- Torso: ribs and clavicle (right half) ----
function Ribs() {
  const ribs = Array.from({ length: 10 }, (_, i) => {
    const y = 154 + i * 8.6;
    const w = 30 + 10 * Math.sin((Math.PI * (i + 1.5)) / 11.5); // the ribs widen, then shorten again
    return `M3 ${y} C${w * 0.5} ${y - 5} ${w} ${y + 1} ${w + 1} ${y + 15} C${w - 8} ${y + 19} 14 ${y + 17} 5 ${y + 11}`;
  });
  return (
    <g>
      {ribs.map((d, i) => <Shape key={i} d={d} thin />)}
      <Shape d="M4 148 C22 142 42 146 62 155" thin />
    </g>
  );
}

// ---- Arm (right half): humerus, ulna (inner), radius (outer) ----
function Arm() {
  return (
    <g>
      <Shape d={bar(64, 166, 71, 258, 2.6)} />
      <Ball x={64} y={165} r={5.8} />
      <Ball x={71} y={260} r={4.4} />
      <Shape d={bar(69, 266, 78.5, 330, 2)} />
      <Shape d={bar(75, 266, 84.5, 330, 1.7)} />
      <Ball x={78.5} y={331} r={2.8} />
      <Ball x={84.5} y={331} r={3} />
    </g>
  );
}

// ---- Hand and foot, in the local coordinates of lib/bodyOutline.js (wrist / ankle at 0, 0) ----
function HandBones() {
  const rays = [
    "M-8.5 4 L-10.5 38", // little finger
    "M-4 4 L-3.5 47", // ring
    "M1 4 L2.5 52", // middle
    "M6 4 L9 48", // index
    "M8 5 L22 29", // thumb
  ];
  return (
    <g>
      <Oval x={0} y={5} rx={9} ry={5} />
      {rays.map((d, i) => <Shape key={i} d={d} thin />)}
      {[[-10.5, 38], [-3.5, 47], [2.5, 52], [9, 48], [22, 29]].map(([x, y], i) => <Ball key={i} x={x} y={y} r={1.7} />)}
    </g>
  );
}

function FootBones() {
  const rays = ["M-3 10 L-10 32", "M0 10 L-3 34", "M3 10 L3 35", "M6 10 L9 34", "M9 10 L15 31"];
  return (
    <g>
      <Oval x={1} y={5} rx={7} ry={6} />
      {rays.map((d, i) => <Shape key={i} d={d} thin />)}
      {[[-10, 33], [-3, 35], [3, 36], [9, 35], [15, 32]].map(([x, y], i) => <Ball key={i} x={x} y={y} r={1.8} />)}
    </g>
  );
}

// ---- Pelvis and leg (right half) ----
const PELVIS = "M3 294 C16 288 34 289 41 299 C44 310 41 322 34 331 L31 338 C28 346 20 350 12 348 L4 341 L0 338 Z";

function Leg() {
  return (
    <g>
      <Shape d={bar(34, 362, 27.5, 462, 2.9)} />
      <Shape d={bar(28, 343, 37, 356, 2.3)} />
      <Ball x={28} y={343} r={6} />
      <Ball x={38} y={357} r={4.2} />
      <Ball x={23} y={467} r={4.6} />
      <Ball x={32} y={467} r={4.6} />
      <Oval x={27.5} y={471} rx={4} ry={5} />
      <Shape d={bar(22, 483, 22.5, 583, 3.2)} />
      <Oval x={23} y={481} rx={8.5} ry={3.2} />
      <Ball x={22} y={586} r={4.4} />
      <Shape d={bar(31.5, 487, 30, 580, 1.7)} />
      <Ball x={31.5} y={485} r={3} />
      <Ball x={30} y={584} r={3} />
    </g>
  );
}

// `parts` are the hand and foot transforms of BodyDiagram (the same ones that place the silhouettes).
export default function Skeleton({ female, parts }) {
  const mirror = (children) => (
    <>
      <g>{children}</g>
      <g transform="scale(-1 1)">{children}</g>
    </>
  );
  const torso = female ? 0.88 : 1;
  const arms = female ? 0.84 : 1;
  const hips = female ? 1.06 : 1;
  return (
    <g>
      {parts.map(({ key, transform }) => (
        <g key={key} transform={transform}>
          {key.startsWith("hand") ? <HandBones /> : <FootBones />}
        </g>
      ))}
      <g transform={`scale(${hips} 1)`}>
        <Shape d={SACRUM} />
        {mirror(
          <>
            <Shape d={PELVIS} />
            <Oval x={17} y={337} rx={3.6} ry={5} turn={-10} />
            <Leg />
          </>,
        )}
      </g>
      <g transform={`scale(${arms} 1)`}>{mirror(<Arm />)}</g>
      <g transform={`scale(${torso} 1)`}>
        <Spine />
        <Shape d={STERNUM} />
        {mirror(<Ribs />)}
      </g>
      <Skull />
    </g>
  );
}
