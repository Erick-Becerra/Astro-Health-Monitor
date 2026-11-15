import { useEffect, useState } from "react";
import { usePolling } from "../shared/hooks.js";
import { earth } from "./earthApi.js";

/**
 * The alerts, and which of them are new. `id` of an alert always grows, so "new" is "id above the
 * highest one seen". The first answer is the starting point: alerts that already existed when the screen
 * opened are not announced as new.
 *
 *   const { alerts, fresh, markSeen } = useNewAlerts();
 *   // fresh.length -> badge "3 alertas nuevas"; markSeen() when the person opens the list
 *
 * If you want it to survive a page reload, save the number in localStorage and start `seen` from it.
 */
export function useNewAlerts({ seconds = 3, limit = 30, astronautId } = {}) {
  const poll = usePolling(() => earth.alerts({ limit, astronautId }), { seconds, deps: [astronautId] });
  const alerts = poll.data ?? [];
  const highest = alerts.reduce((max, a) => Math.max(max, a.id), 0);
  const [seen, setSeen] = useState(null);

  useEffect(() => {
    if (seen === null && poll.data) setSeen(highest);
  }, [poll.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const fresh = seen === null ? [] : alerts.filter((a) => a.id > seen);
  return { ...poll, alerts, fresh, markSeen: () => setSeen(highest) };
}
