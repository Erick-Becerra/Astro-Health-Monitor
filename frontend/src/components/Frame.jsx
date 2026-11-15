// A panel with corner brackets, used for every block of the dashboard.
export default function Frame({ title, aside, area, className = "", children }) {
  return (
    <section className={`frame ${className}`} style={{ gridArea: area }}>
      {(title || aside) && (
        <header className="frame-head">
          <h2>{title}</h2>
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}
