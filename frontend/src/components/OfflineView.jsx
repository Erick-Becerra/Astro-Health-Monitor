import { useState } from "react";
import { connection, needsBackend } from "../connection.js";
import BodyDiagram from "./BodyDiagram.jsx";
import Frame from "./Frame.jsx";
import VitalCards from "./VitalCards.jsx";
import WellbeingPanel from "./WellbeingPanel.jsx";

// The screen as it looks with no data: the same layout, with empty values.
// It is shown while the backend cannot be reached; the real screen takes its
// place by itself as soon as the first answer arrives.
const TITLES = ["Sleep", "Mood and stress", "Heart rate", "Blood pressure", "Temperature", "Radiation", "Glucose"];
const EMPTY_CARDS = TITLES.map((title) => ({ id: title, title, level: null, main: { text: "No data" }, rows: [] }));
const NO_FLAGS = {};
const NO_VITALS = {};

export default function OfflineView() {
  const [region, setRegion] = useState(null);

  return (
    <div className="dashboard">
      <header className="dash-head">
        <div>
          <h1>Crew health</h1>
          <h2 className="subtitle">Real-time health monitoring for your crew</h2>
        </div>
        <p className="pill pill-bad">
          <span className="dot" aria-hidden="true" />
          No connection to the station
        </p>
      </header>

      <nav className="tabs" aria-label="Crew">
        <span className="tab muted">No astronauts loaded</span>
      </nav>

      <div className="grid">
        <section className="banner level-none" style={{ gridArea: "banner" }}>
          <strong>Waiting for the station</strong>
          <span>This is the layout only. The data appears here when the connection is back.</span>
        </section>

        <Frame area="body" className="frame-body" title="No astronaut selected">
          <p className="muted frame-sub">No data</p>
          <div className="scene">
            <BodyDiagram gender="male" flags={NO_FLAGS} selected={region} onSelect={setRegion} vitals={NO_VITALS} />
          </div>
          <div className="scene-note">
            <p>Colours come from the station. They show up here when there is data.</p>
          </div>
        </Frame>

        <Frame area="cards" title="Vital signs">
          <VitalCards cards={EMPTY_CARDS} />
        </Frame>

        <Frame area="chart" title="Recent trend">
          <p className="muted">No readings yet.</p>
        </Frame>

        <div className="side" style={{ gridArea: "side" }}>
          <Frame title="Wellbeing questionnaires">
            <WellbeingPanel
              offline
              now={Date.now()}
              onAnswer={needsBackend(() => {})}
              onHistory={() => connection.warn()}
            />
          </Frame>
          <Frame title="Systems">
            <p className="muted">No data</p>
          </Frame>
          <Frame title="What to do">
            <p className="muted">No data</p>
          </Frame>
          <Frame title="Messages from Earth">
            <p className="muted">No data</p>
          </Frame>
        </div>
      </div>
    </div>
  );
}
