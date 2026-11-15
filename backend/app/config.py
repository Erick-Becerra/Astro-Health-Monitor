"""Settings read from environment variables (see docker-compose.yml)."""
import os

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://astro:astro@db:5432/astro_health",
)

# Origins allowed to call this API from a browser (the frontend dev server).
CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
).split(",")
