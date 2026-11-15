import { useEffect, useState } from "react";
import { usePolling } from "../shared/hooks.js";
import { earth } from "./earthApi.js";

export function useNewAlerts({ seconds = 3, limit = 30, astronautId } = {}) {
  const poll = usePolling(() => earth.alerts({ limit, astronautId }), { seconds, deps: [astronautId] });
  const alerts = poll.data ?? [];
  const highest = alerts.reduce((max, a) => Math.max(max, a.id), 0);
  const [seen, setSeen] = useState(null);

  useEffect(() => {
    if (seen === null && poll.data) setSeen(highest);
  }, [poll.data]);

  const fresh = seen === null ? [] : alerts.filter((a) => a.id > seen);
  return { ...poll, alerts, fresh, markSeen: () => setSeen(highest) };
}
