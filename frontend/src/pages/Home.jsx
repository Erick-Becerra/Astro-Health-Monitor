import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getJSON } from "../api.js";

// Placeholder page: the real astronaut list will come from the backend.
export default function Home() {
  const [backend, setBackend] = useState("checking");

  useEffect(() => {
    getJSON("/api/health")
      .then(() => setBackend("online"))
      .catch(() => setBackend("offline"));
  }, []);

  return (
    <section className="page">
      <h1>Registered astronauts</h1>
      <p className="muted">Health monitoring for astronauts on space missions.</p>
      <p className="muted">
        No astronauts yet. This list will be filled from the backend.
      </p>
      <p>
        <Link to="/astronaut/demo">Open the demo astronaut screen</Link>
      </p>
      <p className={`status status-${backend}`}>Backend: {backend}</p>
    </section>
  );
}
