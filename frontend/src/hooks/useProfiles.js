import { useEffect, useState } from "react";
import { getJSON } from "../api.js";

// Name and gender of each astronaut. They rarely change, so each one is read
// once (the station keeps them in the astronaut's profile).
const cache = {};

export function useProfiles(ids) {
  const [profiles, setProfiles] = useState({});
  const key = ids.join("|");

  useEffect(() => {
    let cancelled = false;
    ids.forEach(async (id) => {
      cache[id] ??= getJSON(`/api/crew/${id}/config`)
        .then((config) => {
          const data = config?.profile?.data ?? {};
          return { name: data.name ?? id, gender: data.gender === "female" ? "female" : "male" };
        })
        .catch(() => {
          delete cache[id]; // try again on the next poll
          return null;
        });
      const profile = await cache[id];
      if (profile && !cancelled) setProfiles((prev) => ({ ...prev, [id]: profile }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return profiles;
}
