import { memo } from "react";
import { FEMALE_HAIR, FOOT, HAND, LIMBS, outlinePath } from "../lib/bodyOutline.js";

// Flat, glowing body diagram (SVG). Everything is drawn around the centre line
// x = 0 and then moved to the middle of the picture. Heights follow the
// "eight heads" canon described in lib/bodyOutline.js.
const WIDTH = 440;
const HEIGHT = 640;
const CENTER = WIDTH / 2;

// Click areas on the skin, clipped to the silhouette. [x0, x1, y0, y1]
function areasFor(female) {
  const chest = female ? 46 : 55; // half width of the torso
  const forearm = female ? 60 : 66; // where the lower arms start
  return [
    { id: "head", box: [-130, 130, 40, 128] },
    { id: "chest", box: [-chest, chest, 128, 262] },
    { id: "abdomen", box: [-chest, chest, 262, 346] },
    { id: "right-leg", box: [-150, 0, 346, 625] },
    { id: "left-leg", box: [0, 150, 346, 625] },
    { id: "right-arm", box: [-150, -chest, 140, 300] },
    { id: "left-arm", box: [chest, 150, 140, 300] },
    { id: "right-arm", box: [-150, -forearm, 300, 440] },
    { id: "left-arm", box: [forearm, 150, 300, 440] },
  ];
}

const HEART = "M0,-10 C-8,-22 -26,-14 -22,2 C-20,12 -8,20 0,28 C8,20 20,12 22,2 C26,-14 8,-22 0,-10 Z";
const BRAIN_FOLDS = "M-9 74 Q-4 78 -9 84 M-10 86 Q-5 90 -8 93 M9 74 Q4 78 9 84 M10 86 Q5 90 8 93 M0 68 V96";
const BRONCHI = "M0 158 L-12 172 L-22 188 M0 158 L12 172 L22 188 M-12 172 L-18 166 M12 172 L18 166";
const AORTA = "M-3 122 C-3 140 -2 170 -3 215 V330";
const VESSEL_BRANCHES = [
  "M-5 118 V150 M5 118 V150",
  "M-3 158 C-26 158 -50 162 -63 176 C-68 216 -71 250 -72 262 L-80 330",
  "M3 158 C26 158 50 162 63 176 C68 216 71 250 72 262 L80 330",
  "M-2 330 C-12 346 -26 370 -28 420 L-26 470 L-22 580",
  "M2 330 C12 346 26 370 28 420 L26 470 L22 580",
];
const GUT =
  "M-26 296 q6.5 -8 13 0 t13 0 t13 0 t13 0 q9 5 0 10 q-6.5 8 -13 0 t-13 0 t-13 0 t-13 0 q-9 5 0 10 q6.5 -8 13 0 t13 0 t13 0 t13 0";

// Labels: where the line starts on the organ, which side the text goes on,
// and the text row.
const LABELS = [
  { id: "brain", name: "BRAIN", from: [-17, 75], side: -1, y: 74 },
  { id: "eyes", name: "EYES", from: [14, 98], side: 1, y: 98 },
  { id: "airway", name: "AIRWAY", from: [1, 130], side: 1, y: 124 },
  { id: "lungs", name: "LUNGS", from: [-34, 200], side: -1, y: 196 },
  { id: "heart", name: "HEART", from: [22, 198], side: 1, y: 186 },
  { id: "liver", name: "LIVER", from: [-40, 248], side: -1, y: 248 },
  { id: "stomach", name: "STOMACH", from: [32, 244], side: 1, y: 236 },
  { id: "kidneys", name: "KIDNEYS", from: [28, 272], side: 1, y: 272 },
  { id: "intestines", name: "INTESTINES", from: [30, 306], side: 1, y: 308 },
  { id: "bladder", name: "BLADDER", from: [-8, 318], side: -1, y: 322 },
  { id: "vessels", name: "VESSELS", from: [3, 300], side: 1, y: 346 },
];

const number = (value, digits = 0) => (value == null ? "–" : Number(value).toFixed(digits));

// Hands and feet: [path, transform] for both sides.
function limbs(gender) {
  const { wrist, hand, ankle, foot } = LIMBS[gender];
  return [
    { key: "hand-l", path: HAND, transform: `translate(${-wrist[0]} ${wrist[1]}) rotate(${-hand}) scale(-1 1)` },
    { key: "hand-r", path: HAND, transform: `translate(${wrist[0]} ${wrist[1]}) rotate(${hand})` },
    { key: "foot-l", path: FOOT, transform: `translate(${-ankle[0]} ${ankle[1]}) rotate(${-foot}) scale(-1 1)` },
    { key: "foot-r", path: FOOT, transform: `translate(${ankle[0]} ${ankle[1]}) rotate(${foot})` },
  ];
}

function BodyDiagram({ gender = "male", flags = {}, selected, onSelect, vitals = {} }) {
  const female = gender === "female";
  const silhouette = outlinePath(female ? "female" : "male");
  const parts = limbs(female ? "female" : "male");
  // Organs sit inside the torso, which is narrower on the female figure.
  const organScale = female ? 0.88 : 1;

  const state = (id) => {
    const flag = flags[id];
    return `${flag ? ` flag flag-${flag}` : ""}${selected === id ? " is-selected" : ""}`;
  };
  const pick = (id) => (event) => {
    event.stopPropagation();
    onSelect(id);
  };

  // A heart beats once per heart beat; clamped so it never looks frantic.
  const beat = Math.min(Math.max(60 / (vitals.heart_rate || 70), 0.4), 1.5);

  // Value shown under some labels
  const values = {
    heart: vitals.heart_rate == null ? null : `${number(vitals.heart_rate)} bpm`,
    brain: vitals.body_temperature == null ? null : `${number(vitals.body_temperature, 1)} °C`,
    vessels:
      vitals.blood_pressure_systolic == null
        ? null
        : `${number(vitals.blood_pressure_systolic)}/${number(vitals.blood_pressure_diastolic)}`,
  };

  // Props shared by every clickable organ group.
  const organ = (id, extra = "") => ({
    className: `organ${extra}${state(id)}`,
    onClick: pick(id),
  });

  const bodyClass = `body${flags.skin ? ` flag flag-${flags.skin}` : ""}`;

  return (
    <svg
      className="diagram"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="group"
      aria-label={`${female ? "Female" : "Male"} body diagram`}
      onClick={() => onSelect(null)}
    >
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" className="grid-line" />
        </pattern>
        <radialGradient id="vignette" cx="50%" cy="48%" r="60%">
          <stop offset="0" stopColor="#0a4aa8" stopOpacity="0.55" />
          <stop offset="0.6" stopColor="#00235a" stopOpacity="0.25" />
          <stop offset="1" stopColor="#050a30" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bodyFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1f6fd0" stopOpacity="0.34" />
          <stop offset="1" stopColor="#0a2f78" stopOpacity="0.18" />
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <clipPath id="bodyClip">
          <path d={silhouette} />
          {parts.map(({ key, path, transform }) => (
            <path key={key} d={path} transform={transform} />
          ))}
        </clipPath>
      </defs>

      <rect width={WIDTH} height={HEIGHT} fill="url(#grid)" />
      <rect width={WIDTH} height={HEIGHT} fill="url(#vignette)" />

      <g transform={`translate(${CENTER} 0)`}>
        {/* Aura */}
        <ellipse className="aura" cx="0" cy="332" rx="165" ry="300" />
        <ellipse className="aura aura-inner" cx="0" cy="332" rx="150" ry="284" />

        {/* Body: hands and feet first, so the body outline sits on top */}
        {female && FEMALE_HAIR.map((d, i) => <path key={i} d={d} className="hair" />)}
        {parts.map(({ key, path, transform }) => (
          <path key={key} d={path} transform={transform} className={`${bodyClass} limb`} filter="url(#glow)" />
        ))}
        <path d={silhouette} className={bodyClass} filter="url(#glow)" />

        {/* Clickable areas of the skin */}
        <g clipPath="url(#bodyClip)">
          {areasFor(female).map(({ id, box: [x0, x1, y0, y1] }, i) => (
            <rect
              key={`${id}-${i}`}
              className={`area${selected === id ? " is-selected" : ""}`}
              x={x0}
              y={y0}
              width={x1 - x0}
              height={y1 - y0}
              onClick={pick(id)}
            >
              <title>{id.replace("-", " ")}</title>
            </rect>
          ))}
        </g>

        {/* Organs */}
        <g transform={`scale(${organScale} 1)`}>
          {/* Spine */}
          <g {...organ("spine", " organ-soft")}>
            <path d="M0 138V330" className="shape line thin" />
            {Array.from({ length: 17 }, (_, i) => (
              <rect key={i} x="-4.5" y={140 + i * 11.5} width="9" height="7" rx="2.5" className="shape" />
            ))}
            <path d="M0 138V330" className="hit" />
            <title>Spine</title>
          </g>

          {/* Rib cage (outline only, so the organs inside can be clicked) */}
          <g {...organ("ribcage", " organ-dashed")}>
            <path d="M-38 158 Q0 152 38 158 L40 238 Q0 254 -40 238 Z" className="shape" />
            <title>Rib cage</title>
          </g>

          {/* Blood vessels */}
          <g {...organ("vessels", " organ-line")}>
            <path d={AORTA} className="shape line" />
            {VESSEL_BRANCHES.map((d, i) => (
              <path key={i} d={d} className="shape line thin" />
            ))}
            <path d={AORTA} className="hit" />
            <title>Blood vessels</title>
          </g>

          {/* Brain */}
          <g {...organ("brain")}>
            <g transform="translate(0 -7)">
              <ellipse cx="0" cy="82" rx="17" ry="15" className="shape" />
              <path d={BRAIN_FOLDS} className="shape line thin" />
            </g>
            <title>Brain</title>
          </g>

          {/* Eyes */}
          <g {...organ("eyes")}>
            <ellipse cx="-9" cy="98" rx="5.5" ry="3" className="shape" />
            <ellipse cx="9" cy="98" rx="5.5" ry="3" className="shape" />
            <title>Eyes</title>
          </g>

          {/* Airway */}
          <g {...organ("airway", " organ-line")}>
            <path d="M0 108V158" className="shape line" />
            <path d={BRONCHI} className="shape line thin" />
            <path d="M0 108V158" className="hit" />
            <title>Trachea and airways</title>
          </g>

          {/* Lungs */}
          <g {...organ("lungs")}>
            <path d="M-4 164 C-22 164 -36 188 -35 214 C-34 232 -18 240 -6 234 C-2 214 -2 184 -4 164 Z" className="shape" />
            <path d="M4 164 C22 164 36 188 35 214 C34 232 20 240 10 232 C16 218 0 214 3 202 C4 188 4 174 4 164 Z" className="shape" />
            <title>Lungs</title>
          </g>

          {/* Heart */}
          <g {...organ("heart")}>
            <g transform="translate(8 198) scale(0.62)">
              <path d={HEART} className="shape beat" style={{ animationDuration: `${beat}s` }} />
            </g>
            <title>Heart</title>
          </g>

          {/* Liver, stomach, kidneys, intestines, bladder */}
          <g {...organ("liver")}>
            <path d="M-40 236 C-30 232 -6 232 4 238 C2 254 -12 264 -30 260 C-40 256 -43 244 -40 236 Z" className="shape" />
            <title>Liver</title>
          </g>
          <g {...organ("stomach")}>
            <path d="M8 228 C22 224 34 232 33 244 C32 258 18 262 10 256 C4 250 3 234 8 228 Z" className="shape" />
            <title>Stomach</title>
          </g>
          <g {...organ("kidneys")}>
            <ellipse cx="-24" cy="272" rx="5" ry="10" className="shape" transform="rotate(8 -24 272)" />
            <ellipse cx="24" cy="272" rx="5" ry="10" className="shape" transform="rotate(-8 24 272)" />
            <title>Kidneys</title>
          </g>
          <g {...organ("intestines", " organ-line")}>
            <path d={GUT} className="shape line" />
            <path d={GUT} className="hit" />
            <title>Intestines</title>
          </g>
          <g {...organ("bladder")}>
            <circle cx="0" cy="318" r="8" className="shape" />
            <title>Bladder</title>
          </g>
        </g>

        {/* Labels */}
        {LABELS.map(({ id, name, from, side, y }) => {
          const x = side * 128;
          const value = values[id];
          return (
            <g key={id} className={`label${state(id)}`} onClick={pick(id)}>
              <polyline points={`${from[0] * organScale},${from[1]} ${side * 112},${y} ${x - side * 4},${y}`} />
              <text x={x} y={y - 2} textAnchor={side < 0 ? "end" : "start"}>
                {name}
              </text>
              {value && (
                <text x={x} y={y + 10} textAnchor={side < 0 ? "end" : "start"} className="value">
                  {value}
                </text>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

// Only redraws when its own props change, not every time the page polls.
export default memo(BodyDiagram);
