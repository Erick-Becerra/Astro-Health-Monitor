import { useState } from "react";
import { useParams } from "react-router-dom";
import BodyPointCloud, { REGIONS } from "../components/BodyPointCloud.jsx";

// Placeholder screen: shows the 3D body and the region the user clicked.
export default function AstronautDetail() {
  const { id } = useParams();
  const [selected, setSelected] = useState(null);
  const region = REGIONS.find((r) => r.id === selected);

  return (
    <section className="detail">
      <div className="scene">
        <BodyPointCloud selected={selected} onSelect={setSelected} />
      </div>
      <aside className="panel">
        <h1>Astronaut: {id}</h1>
        {region ? (
          <>
            <h2>{region.label}</h2>
            <p className="muted">
              No data yet. Vital signs for this area will appear here.
            </p>
          </>
        ) : (
          <p className="muted">Click a part of the body to see its status.</p>
        )}
      </aside>
    </section>
  );
}
