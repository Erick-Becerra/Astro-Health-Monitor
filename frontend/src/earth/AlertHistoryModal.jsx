import Modal from "../components/Modal.jsx";
import { usePolling } from "../shared/hooks.js";
import { localeOf, useLang } from "../shared/lang.js";
import { earth } from "./earthApi.js";
import { isSignalAlert } from "./lastKnown.js";

export default function AlertHistoryModal({ astronautId, name, t, onClose }) {
  const lang = useLang();
  const history = usePolling(() => earth.alerts({ astronautId, limit: 500 }), { seconds: 5, deps: [astronautId] });
  const alerts = (history.data ?? []).filter((a) => !isSignalAlert(a));

  return (
    <Modal title={t.ui("alertHistory")} onClose={onClose}>
      {alerts.length === 0 && <p className="muted">{history.loading ? t.ui("loading") : t.ui("noAlerts")}</p>}
      <div className="alert-list">
        {alerts.map((a) => (
          <article key={a.id} data-severity={a.severity}>
            <small>{new Date(a.created_at).toLocaleString(localeOf(lang))}{` \u00b7 ${a.name ?? name ?? a.astronaut_id}`}</small>
            <p>{a.summary}</p>
          </article>
        ))}
      </div>
    </Modal>
  );
}
