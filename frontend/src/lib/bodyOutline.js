// Body silhouettes for the 2D diagram.
//
// Proportions follow the classic "eight heads" figure-drawing canon
// (see the notes at the end of this file). One head is H = 70 units, the top of
// the head is y = 50, so:
//   chin 120 (1H)   nipples 190 (2H)   navel / elbows 260 (3H)
//   crotch / wrists 330 (4H)   knees 470 (6H)   soles 610 (8H)
// Shoulders are about 2 heads wide on a man and 1.6 on a woman; hips are about
// 1.4 heads on a man and 1.5 on a woman. A hand is about as long as a face
// (0.75 H) and a foot about one head, shown foreshortened from the front.
//
// Each list is the RIGHT half of the body as [distance from the centre line, y],
// from the top of the head down to the crotch. The left half is mirrored and a
// smooth curve is drawn through every point.

const MALE = [
  // head and neck
  [0, 50], [9, 51], [17, 56], [22, 66], [23, 80], [22, 92], [18, 106], [13, 115], [10, 121],
  [10, 132], [13, 142],
  // shoulder and deltoid
  [30, 146], [54, 151], [68, 157], [74, 168], [76, 186],
  // arm, outer edge down to the wrist
  [78, 215], [81, 245], [82, 262], [84, 296], [87, 326],
  // wrist
  [87, 333], [82, 337], [76, 333],
  // arm, inner edge back up to the armpit
  [75, 300], [70, 275], [62, 258], [60, 230], [57, 200], [54, 182],
  // torso side: chest, waist, hip
  [49, 192], [47, 225], [41, 255], [40, 262], [42, 285], [48, 305], [51, 318],
  // leg, outer edge: thigh, knee, calf, ankle
  [50, 340], [47, 380], [42, 430], [38, 468], [40, 492], [39, 520], [35, 555], [30, 582],
  // ankle
  [30, 588], [22, 596], [14, 588],
  // leg, inner edge back up to the crotch
  [14, 560], [13, 520], [11, 490], [10, 468], [10, 430], [8, 390], [4, 352], [0, 335],
];

const FEMALE = [
  [0, 51], [9, 52], [16, 57], [21, 67], [22, 80], [20, 92], [17, 105], [12, 114], [9, 121],
  [9, 132], [11, 142],
  [28, 148], [46, 153], [57, 159], [62, 170], [63, 188],
  [65, 216], [68, 246], [69, 262], [71, 296], [73, 326],
  [72, 333], [68, 337], [63, 333],
  [62, 300], [58, 275], [52, 258], [50, 232], [48, 206], [45, 186],
  [43, 197], [41, 225], [36, 250], [33, 262], [38, 288], [49, 306], [54, 318],
  [52, 342], [48, 382], [42, 430], [37, 468], [39, 492], [37, 520], [33, 555], [29, 582],
  [29, 588], [21, 596], [14, 588],
  [13, 560], [12, 520], [10, 490], [9, 468], [9, 430], [7, 392], [3, 354], [0, 337],
];

export const OUTLINES = { male: MALE, female: FEMALE };

// Hair for the female figure: long locks falling from the head to the shoulders.
export const FEMALE_HAIR = [
  "M -20 60 C -32 92 -34 128 -30 156",
  "M -14 53 C -27 72 -29 96 -25 118",
  "M 20 60 C 32 92 34 128 30 156",
  "M 14 53 C 27 72 29 96 25 118",
];

// A right-side hand, palm toward the viewer, thumb out, wrist at (0, 0),
// pointing down. Built the way hand tutorials teach it:
//  - the palm is a trapezoid about as wide as it is long (28 x 28),
//  - the knuckle line is a slight slope, the little finger's knuckle sitting
//    nearest the wrist,
//  - the middle finger is as long as the palm; the index and ring fingers are a
//    little shorter and the little finger only reaches the ring finger's first
//    joint,
//  - the thumb leaves the lower side of the palm at an angle: only a little
//    longer than the first joint of the index finger, and a bit thicker.
// The other side is mirrored.
export const HAND =
  "M -7 0 C -11 6 -14 12 -14 22 L -14 36 Q -11.25 43 -8.5 36 L -8.5 28 L -7 28 L -7 44 " +
  "Q -4.1 51 -1.2 44 L -1.2 28 L 0.4 28 L 0.4 49 Q 3.4 56 6.4 49 L 6.4 28 L 8 28 L 8 45 " +
  "Q 10.9 52 13.8 45 L 13.8 23 L 18 25.5 L 21.5 31 Q 24.5 35 27 30.5 L 24 22.5 L 18 14.5 L 12 8 " +
  "C 10 5 8 2 7 0 Z";

// A right-side foot seen from the front, toes turned slightly out, ankle at (0, 0).
export const FOOT =
  "M -8 0 L -9 14 L -15 26 L -16 31 L -15 37 Q -10 42 -5 37 L -5 33 L -4 33 L -4 39 Q -1 42 2 39 L 2 34 " +
  "L 3 34 L 3 38 Q 6 41 9 38 L 9 35 L 10 35 L 10 37 Q 13 40 15 37 L 15 35 L 16 35 L 16 36 Q 19 39 21 35 " +
  "L 20 28 L 14 14 L 9 0 Z";

// Where hands and feet attach, and how much they turn outward (degrees).
export const LIMBS = {
  male: { wrist: [82, 336], hand: -7, ankle: [22, 592], foot: 10 },
  female: { wrist: [68, 336], hand: -6, ankle: [21, 592], foot: 10 },
};

// Closed Catmull-Rom spline through the points, as an SVG path.
function smoothClosed(points) {
  const n = points.length;
  const at = (i) => points[(i + n) % n];
  let d = `M ${at(0)[0].toFixed(1)} ${at(0)[1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + " Z";
}

// Path of the whole body (without hands and feet), centred on x = 0.
export function outlinePath(gender) {
  const half = OUTLINES[gender] ?? MALE;
  const left = half
    .slice(1, -1)
    .reverse()
    .map(([x, y]) => [-x, y]);
  return smoothClosed([...half, ...left]);
}

// Sources for the proportions:
//  - Proko, "Human Proportions: Cranial Units" (8-head canon, landmarks).
//  - MakingComics, "Standard proportions of the human body".
//  - Drawing guides on hands and feet: a hand is about the length of the face,
//    a foot about one head long.
//  - Hand construction (palm shape, knuckle line, finger lengths, thumb):
//    doncorgi.com/blog/how-to-draw-hands, drawingforall.net, rapidfireart.com.
