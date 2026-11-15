import { Link, Route, Routes } from "react-router-dom";
import Home from "./pages/Home.jsx";
import AstronautDetail from "./pages/AstronautDetail.jsx";
import EarthPage from "./earth/EarthPage.jsx";
import { ACTOR } from "./shared/request.js";

export default function App() {
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">
          Astro Health Monitor
        </Link>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/astronaut/:id" element={<AstronautDetail />} />
          <Route path="/earth" element={<EarthPage actor={ACTOR} />} />
        </Routes>
      </main>
    </>
  );
}