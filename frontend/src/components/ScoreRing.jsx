export default function ScoreRing({ score, max, level, size = 56, showMax = false }) {
  const stroke = Math.max(4, size / 11);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const known = score != null && max;
  const filled = known ? Math.min(Math.max(score / max, 0), 1) : 0;

  return (
    <span className={`ring level-${level ?? "none"}`} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} />
        {known && (
          <circle
            className="ring-fill"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={stroke}
            strokeDasharray={`${filled * circumference} ${circumference}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>
      <span className="ring-number" style={{ fontSize: size * 0.34 }}>
        {known ? score : "–"}
        {showMax && known && <small style={{ fontSize: size * 0.15 }}>/{max}</small>}
      </span>
    </span>
  );
}
