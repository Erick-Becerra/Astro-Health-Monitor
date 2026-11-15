# Contributing

Short rules so five people can work in the same repository without breaking each other's work.

## Rules

1. `main` is always working. Nobody commits directly to it.
2. Every task goes in its own branch, created from an up-to-date `main`.
3. Small, frequent commits. Open a Pull Request (PR) as soon as the task works.
4. Every PR is reviewed by at least one other person before merging.
5. Pull from `main` before you start working each time.

## Step by step

```
git checkout main
git pull
git checkout -b feature/frontend-body-model
```

Work, then save your changes:

```
git add .
git commit -m "feat: add clickable body regions"
git push -u origin feature/frontend-body-model
```

Then open the repository on GitHub and click **Compare & pull request**.
After the PR is merged, go back to `main` and `git pull`.

## Names

- Branches: `feature/<area>-<short-description>` or `fix/<area>-<short-description>`
- Commits: start with `feat:` (new), `fix:` (repair), `docs:` (documentation) or `chore:` (setup)
- Write everything in English: code, comments, commits and documentation.

## Who edits what

To avoid conflicts, each folder has a main owner. Talk to the owner before making big changes in their area.

| Folder | Area |
|---|---|
| `Space Interface/` | Interface with the body diagram, vital signs, alerts, questionnaires and symptom reports |
| `Earth Interface/` | Ground-control monitoring app (list of astronauts, telemetry log, symptoms, records, reports) |
| `Backend Server/` | Earth base and space station APIs, analysis and database |
| `Data Simulator/` | Sensor telemetry simulator and the ESP32 firmware |

Each folder is a separate project that runs on its own machine. Keep changes inside the folder you own, and write
down in the root `README.md` any change to the addresses, ports or messages that connect them.

## If you get a conflict

Do not panic and do not delete the other person's work. Ask for help in the team chat before choosing which version to keep.
