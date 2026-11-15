import { STATION_URL } from "../api.js";
import { connection, useConnection } from "../connection.js";

// A floating warning for when the backend cannot be reached. It can be closed;
// the screen keeps working with the last data. It comes back if the user tries
// something that needs the backend, and it goes away by itself when the
// connection returns.
export default function ConnectionToast() {
  const { down, hidden } = useConnection();
  if (!down || hidden) return null;

  return (
    <div className="toast" role="alert">
      <span className="toast-icon" aria-hidden="true">
        !
      </span>
      <div className="toast-text">
        <strong>Could not connect to the backend</strong>
        <p>
          The station at {STATION_URL} did not answer, so the data is not updating. Check that the server is
          running and that VITE_STATION_URL in the .env file has its current address. The screen reconnects by
          itself when the server is back.
        </p>
      </div>
      <button type="button" className="toast-close" aria-label="Close this warning" onClick={connection.dismiss}>
        ×
      </button>
    </div>
  );
}
