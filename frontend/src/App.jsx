import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import EarthPage from "./earth/EarthPage.jsx";
import ConnectionToast from "./earth/ConnectionToast.jsx";
import { ACTOR } from "./shared/request.js";

const BASE_W = 1440;
const BASE_H = 810;

function useUiScale() {
  const measure = () => {
    const scale = Math.min(Math.max(Math.min(window.innerWidth / BASE_W, window.innerHeight / BASE_H), 0.4), 3);
    return { scale, width: window.innerWidth / scale, height: window.innerHeight / scale };
  };
  const [size, setSize] = useState(measure);
  useEffect(() => {
    const onResize = () => setSize(measure());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

export default function App() {
  const ui = useUiScale();
  return (
    <div
      className="ui-root"
      style={{ zoom: ui.scale, width: ui.width, height: ui.height, "--ui-w": ui.width, "--ui-h": ui.height }}
    >
      <header className="topbar">
        <span className="brand">Astro Health Monitor</span>
      </header>
      <main>
        <Routes>
          <Route path="/earth" element={<EarthPage actor={ACTOR} />} />

          <Route path="*" element={<Navigate to="/earth" replace />} />
        </Routes>
      </main>
      <ConnectionToast />
    </div>
  );
}
