# Working together on the local network

One computer (the **host**) runs Docker and acts as the core: the space station,
the Earth base and the database live there. Everyone else connects to it over
the same Wi-Fi or router.

```
 teammate's browser ──► http://<HOST_IP>:5173   (app)
 teammate's code    ──► http://<HOST_IP>:8000   (Earth base API)
 ESP32 / sensor     ──► http://<HOST_IP>:8001   (space station API)
                        └── host computer: Docker ──► database (host only)
```

## Host: one-time setup

1. Start Docker Desktop.
2. Open PowerShell **as Administrator** in the project folder and run:

   ```
   powershell -ExecutionPolicy Bypass -File scripts\share-on-lan.ps1
   ```

   It finds your IP, saves it as `HOST_IP` in `.env`, and opens ports 5173, 8000
   and 8001 in Windows Firewall for the local subnet only.
3. Start (or restart) the environment:

   ```
   docker compose up -d --build
   ```
4. Send your teammates the addresses the script prints.

If your IP changes (new Wi-Fi, hotspot restarted), run the script again and
restart with `docker compose up -d`. To close the ports when you are done:
`scripts\share-on-lan.ps1 -Remove`.

## Teammates

| I want to... | Do this |
|---|---|
| See the app | Open `http://<HOST_IP>:5173` in a browser |
| Try the APIs | Open `http://<HOST_IP>:8000/docs` and `http://<HOST_IP>:8001/docs` |
| Demo a fever, a blackout... | The commands in [architecture.md](architecture.md), replacing `localhost` with `<HOST_IP>` |
| Work on the frontend on my own computer | Run it with `VITE_API_URL=http://<HOST_IP>:8000` (CORS already allows `localhost:5173`) |
| Flash the ESP32 | Use `http://<HOST_IP>:8001/api/readings` in the firmware |

You do not need Docker to use the app or the APIs. Only the host needs it.
The database is not open to the network on purpose: use the APIs.

## If it does not connect

1. **Same network?** Everyone must be on the same Wi-Fi/router. Guest Wi-Fi and
   some university or office networks isolate devices from each other.
2. **Check from a teammate's computer**: open `http://<HOST_IP>:8000/api/health`.
   If it times out, it is the firewall or network isolation. If it answers but
   the app shows "Backend: offline", `HOST_IP` in `.env` is wrong or old:
   run the script again and `docker compose up -d`.
3. **Phone hotspot**: connect every computer to the hotspot of the same phone.
   The IP often changes each time the hotspot restarts.
4. **Firewall rule missing**: check with
   `Get-NetFirewallRule -DisplayName "Astro Health Monitor (LAN)"`.

## Security note

The APIs have no login. That is fine for a team on a private network during the
hackathon, but anyone on that network can call them (including the demo
commands that cut the link or create fevers). Do not use this on a public network
that you do not trust, and remove the firewall rule when you finish.
