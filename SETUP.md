# Setup guide

This guide gets the full development environment running from zero.
It is written so a person can follow it step by step. An AI assistant can
follow it too (see the last section).

## What you need

| Tool | Why | Check it |
|---|---|---|
| Git | Download and share the code | `git --version` |
| Docker Desktop | Runs frontend, backend and database | `docker --version` |
| A code editor (VS Code recommended) | Edit files | - |

Docker Desktop must be **open and running** (whale icon in the system tray).
On Windows, accept the option to use WSL 2 if the installer offers it.

You do NOT need to install Python, Node.js or PostgreSQL. Docker provides them.

## Step 1: Download the project

Open a terminal in the folder where you keep your projects and run:

```
git clone https://github.com/Erick-Becerra/Astro-Health-Monitor.git
cd Astro-Health-Monitor
```

## Step 2: Start everything

```
docker compose up --build
```

The first time takes a few minutes because Docker downloads images and installs
dependencies. Later starts take seconds. Keep this terminal open: it shows the logs.

You are done when you see lines like these (order may vary):

- `database system is ready to accept connections` (database)
- `Application startup complete` (backend)
- `Local: http://localhost:5173/` (frontend)

## Step 3: Check that it works

| Open this | You should see |
|---|---|
| http://localhost:5173 | The app, with "Backend: online" |
| http://localhost:8000/api/health | `{"status":"ok"}` |
| http://localhost:8000/api/health/db | `{"status":"ok"}` |
| http://localhost:8000/docs | Interactive API documentation |
| http://localhost:5173/astronaut/demo | A rotating 3D body made of points. Click a body part. |

## Step 4: Daily use

| Action | Command |
|---|---|
| Start | `docker compose up` |
| Stop | Press `Ctrl+C` in that terminal |
| Start in the background | `docker compose up -d` |
| Stop a background run | `docker compose down` |
| See logs of one service | `docker compose logs -f backend` |

Your code changes appear automatically: the page reloads when you save a
frontend file, and the API restarts when you save a backend file.

## Step 5: Use Git

Never work directly on `main`. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Troubleshooting

**"Cannot connect to the Docker daemon" / "docker: command not found"**
Docker Desktop is not running or not installed. Open it, wait until it says it is running, and try again.

**"port is already allocated" or "address already in use"**
Another program uses port 5173, 8000 or 5432. Close it, or stop other copies of this project with `docker compose down`.

**Backend shows "Database is not reachable"**
Wait a few seconds and reload. If it continues: `docker compose down` and then `docker compose up --build`.

**Someone added a new library and my app fails**
Rebuild the containers and renew the stored packages:
`docker compose up --build -V`

**I changed the database schema and nothing changed**
Scripts in `database/init/` only run when the database is first created. To start the database from scratch (this DELETES stored data): `docker compose down -v` and then `docker compose up --build`.

**Changes in files are not detected**
Make sure the project folder is on your normal disk (for example `Documents`), not in a network or synced folder.

**The ESP32 cannot reach the backend**
Both must be on the same Wi-Fi network. Use your computer's local IP address (not `localhost`) in the firmware. If it still fails, allow ports 8000 in your firewall for private networks.

## For AI assistants

If you can run commands on the user's computer:

1. Check that `git` and `docker` are installed and that Docker is running. If not, tell the user what to install and stop.
2. Clone the repository (Step 1) if it is not already there.
3. Run `docker compose up --build -d` (Step 2, in the background) and wait until all three containers are running (`docker compose ps`).
4. Verify the URLs in Step 3 and report the result.
5. Do not change files, push to GitHub or install extra software without asking the user first.

If you cannot run commands (chat only), explain each step in simple words,
help the user read error messages, and use the Troubleshooting section.
