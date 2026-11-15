"""Settings read from environment variables (see docker-compose.yml).

Both services use this file. Each container gets its own values.
"""
import os

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://astro:astro@db:5432/astro_health",
)

# Origins allowed to call these APIs from a browser (the frontend dev server).
CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
).split(",")

# Also allow a frontend served from this computer or from a private network
# address on ANY port (a teammate running Vite, Next.js, Live Server...).
# Private ranges only: localhost, 127.x, 10.x, 192.168.x, 172.16-31.x.
CORS_ORIGIN_REGEX = os.getenv(
    "CORS_ORIGIN_REGEX",
    r"^https?://(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+"
    r"|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$",
)

# Where each service finds the other one (Docker service names).
EARTH_URL = os.getenv("EARTH_URL", "http://earth-base:8000")
STATION_URL = os.getenv("STATION_URL", "http://space-station:8001")

# Station: simulated astronauts, and how often they are measured (seconds).
SIM_ASTRONAUTS = [a.strip() for a in os.getenv("SIM_ASTRONAUTS", "A001,A002,A003").split(",") if a.strip()]
SIM_INTERVAL_SECONDS = float(os.getenv("SIM_INTERVAL_SECONDS", "2"))

# Station -> Earth link. Real one-way delay to Mars is 3 to 22 minutes;
# the default is short so the demo is watchable. Raise it to show the effect.
LINK_DELAY_SECONDS = float(os.getenv("LINK_DELAY_SECONDS", "3"))
# How Earth gets the station's data:
#   db   (default) Earth reads the station tables in the shared database; the station sends nothing.
#   http the station posts to Earth's /api/sync (store-and-forward with the link latency).
UPLINK_MODE = os.getenv("UPLINK_MODE", "db")
PULL_INTERVAL_SECONDS = float(os.getenv("PULL_INTERVAL_SECONDS", "0.5"))
UPLINK_INTERVAL_SECONDS = float(os.getenv("UPLINK_INTERVAL_SECONDS", "2"))
