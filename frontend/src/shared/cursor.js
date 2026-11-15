const HOT = "6 6";
const CLICKABLE =
  "a,button,summary,label,select,[role=button],.organ,.label,.area,.choice,.chip,.severity,.card,.history button,.steps button,input[type=radio],input[type=checkbox]";

function ship(flame) {
  const edge = flame ? "#ffffff" : "#3a8fd8";
  const fire = flame
    ? `<path d="M13.6 21.4 L18.4 21.4 L16 ${21.4 + flame} Z" fill="#ff7a2e"/><path d="M14.7 21.4 L17.3 21.4 L16 ${21.4 + flame * 0.68} Z" fill="#ffd24a"/><path d="M15.4 21.4 L16.6 21.4 L16 ${21.4 + flame * 0.38} Z" fill="#ffffff"/>`
    : `<rect x="14.4" y="20.8" width="3.2" height="1.8" rx="0.6" fill="#51607f"/>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g transform="rotate(-45 16 16)">` +
    fire +
    `<g transform="translate(16 2) scale(0.8) translate(-16 -2)">` +
    `<path d="M11 16 L3.5 25.5 L11 22.5 Z M21 16 L28.5 25.5 L21 22.5 Z" fill="#8fb4ff" stroke="${edge}" stroke-width="1.1" stroke-linejoin="round"/>` +
    `<path d="M16 2 L21 13.5 L21 24.5 L16 27 L11 24.5 L11 13.5 Z" fill="#eaf2ff" stroke="${edge}" stroke-width="1.3" stroke-linejoin="round"/>` +
    `<circle cx="16" cy="12" r="2.4" fill="#2a7fd4"/></g></g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, "%27")}") ${HOT}`;
}

const OFF = ship(0);
const FRAMES = [ship(6.5), ship(8.5), ship(7.2), ship(9)];

export function startCursor() {
  const root = document.documentElement;
  root.style.setProperty("--cursor-ship", `${OFF}, auto`);
  root.style.setProperty("--cursor-ship-active", `${FRAMES[0]}, pointer`);

  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  let timer = null;
  let frame = 0;
  const stop = () => {
    clearInterval(timer);
    timer = null;
  };
  const start = () => {
    if (timer || reduce) return;
    timer = setInterval(() => {
      frame = (frame + 1) % FRAMES.length;
      root.style.setProperty("--cursor-ship-active", `${FRAMES[frame]}, pointer`);
    }, 110);
  };

  document.addEventListener(
    "pointerover",
    (event) => {
      const target = event.target instanceof Element ? event.target.closest(CLICKABLE) : null;
      if (target && !target.disabled) start();
      else stop();
    },
    { passive: true },
  );
  document.addEventListener("pointerleave", stop);
  window.addEventListener("blur", stop);
}
