import { EARTH_URL, STATION_URL } from "../shared/request.js";
import { connection, useConnection } from "../connection.js";
import { useT } from "../shared/useT.js";

export default function ConnectionToast() {
  const t = useT();
  const { down, hidden } = useConnection();
  if (!down || hidden) return null;

  return (
    <div className="toast" role="alert">
      <span className="toast-icon" aria-hidden="true">
        !
      </span>
      <div className="toast-text">
        <strong>{t.ui("toastTitle")}</strong>
        <p>{t.ui("toastBody", { earth: EARTH_URL, station: STATION_URL })}</p>
      </div>
      <button type="button" className="toast-close" aria-label={t.ui("toastClose")} onClick={connection.dismiss}>
        ×
      </button>
    </div>
  );
}
