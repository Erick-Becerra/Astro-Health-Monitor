import { LEVEL_TEXT } from "../lib/levels.js";

// The seven cards. The colour is the level the backend gave; a sensor with no
// reading says "NO SIGNAL" and never shows an old number.
export default function VitalCards({ cards }) {
  return (
    <div className="cards">
      {cards.map((card) => (
        <article key={card.id} className={`card level-${card.level ?? "none"}${card.alert ? " card-alert" : ""}`}>
          <header>
            <h3>{card.title}</h3>
            {card.level && <span className={`level-tag level-${card.level}`}>{LEVEL_TEXT[card.level]}</span>}
          </header>
          {card.main.text ? (
            <p className="card-empty">{card.main.text}</p>
          ) : (
            <p className="card-value">
              {card.main.value} <small>{card.main.unit}</small>
            </p>
          )}
          {card.bar != null && (
            <div className="bar" role="img" aria-label={`${card.bar} percent of the limit`}>
              <span style={{ width: `${Math.min(Math.max(card.bar, 0), 100)}%` }} />
            </div>
          )}
          <dl>
            {card.rows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
    </div>
  );
}
