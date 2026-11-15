// Everything the dashboard can select or paint red. Add more here.
// Left and right are the person's own sides (the viewer's right is their left).
export const REGIONS = [
  // Body areas (picked by clicking the skin)
  { id: "head", label: "Head and neck" },
  { id: "chest", label: "Chest" },
  { id: "abdomen", label: "Abdomen and pelvis" },
  { id: "left-arm", label: "Left arm" },
  { id: "right-arm", label: "Right arm" },
  { id: "left-leg", label: "Left leg" },
  { id: "right-leg", label: "Right leg" },
  // Organs and systems
  { id: "brain", label: "Brain" },
  { id: "eyes", label: "Eyes" },
  { id: "airway", label: "Trachea and airways" },
  { id: "heart", label: "Heart" },
  { id: "lungs", label: "Lungs" },
  { id: "ribcage", label: "Rib cage" },
  { id: "spine", label: "Spine" },
  { id: "liver", label: "Liver" },
  { id: "stomach", label: "Stomach" },
  { id: "kidneys", label: "Kidneys" },
  { id: "intestines", label: "Intestines" },
  { id: "bladder", label: "Bladder" },
  { id: "vessels", label: "Blood vessels" },
  // Whole body (only painted, never picked directly)
  { id: "skin", label: "Whole body" },
];
