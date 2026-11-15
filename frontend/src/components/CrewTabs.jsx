import { NavLink } from "react-router-dom";
import { connection } from "../connection.js";

// One tab per astronaut. The dot is the level the backend gave that astronaut.
export default function CrewTabs({ crew }) {
  return (
    <nav className="tabs" aria-label="Crew">
      {crew.map((member) => (
        <NavLink
          key={member.id}
          to={`/astronaut/${member.id}`}
          className={({ isActive }) => `tab${isActive ? " tab-active" : ""}`}
          onClick={(event) => {
            // Changing astronaut needs fresh data from the backend.
            if (connection.isDown()) {
              event.preventDefault();
              connection.warn();
            }
          }}
        >
          <span className={`dot level-${member.level ?? "none"}`} aria-hidden="true" />
          <span className="tab-name">{member.name}</span>
          <span className="tab-id">{member.id}</span>
        </NavLink>
      ))}
    </nav>
  );
}
