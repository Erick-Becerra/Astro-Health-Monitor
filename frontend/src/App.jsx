import { Link, Route, Routes } from "react-router-dom";
import Home from "./pages/Home.jsx";
import AstronautDetail from "./pages/AstronautDetail.jsx";

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
        </Routes>
      </main>
    </>
  );
}
