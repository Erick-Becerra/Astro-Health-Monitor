# Database

PostgreSQL 16. Scripts in `init/` run in alphabetical order the first time the
database volume is created (`001_schema.sql`, `002_seed.sql`, ...).

To start from scratch (this DELETES all stored data):

```
docker compose down -v
docker compose up --build
```
