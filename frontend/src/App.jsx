import { Link, Route, Routes } from "react-router-dom";
import ConnectionToast from "./components/ConnectionToast.jsx";
import Dashboard from "./pages/Dashboard.jsx";

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
          <Route path="/" element={<Dashboard />} />
          <Route path="/astronaut/:id" element={<Dashboard />} />
        </Routes>
      </main>
      <ConnectionToast />
    </>
  );
}
