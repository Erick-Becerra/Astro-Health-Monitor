"""Saves real responses of the API as JSON files, so the frontends can work against mocks
without depending on the backend running.

    python scripts/export_mocks.py                      # uses localhost
    python scripts/export_mocks.py 172.20.10.2          # another host (the one running Docker)

Run it when the contract changes and commit the new files. It only reads (GET) and writes the
files of docs/mocks/. It uses the demo astronauts AST-01 to AST-03 (see backend/seed_apps_demo.py),
so load that demo data first.
"""
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

HOST = sys.argv[1] if len(sys.argv) > 1 else "localhost"
EARTH = f"http://{HOST}:8000"
STATION = f"http://{HOST}:8001"
OUT = Path(__file__).resolve().parent.parent / "docs" / "mocks"

# (file, server, path). The request that produces each file is written in the index.
EARTH_CALLS = [
    ("earth/astronauts.json", "/api/astronauts"),
    ("earth/astronaut-AST-03.json", "/api/astronauts/AST-03"),
    ("earth/astronaut-AST-02.json", "/api/astronauts/AST-02"),
    ("earth/dashboard-AST-01.json", "/api/astronauts/AST-01/dashboard"),
    ("earth/dashboard-AST-03.json", "/api/astronauts/AST-03/dashboard"),
    ("earth/readings-latest-AST-03.json", "/api/astronauts/AST-03/readings?limit=5"),
    ("earth/readings-chart-AST-03.json", "/api/astronauts/AST-03/readings?bucket_seconds=1800&limit=100"),
    ("earth/alerts.json", "/api/alerts?limit=15"),
    ("earth/alerts-AST-03.json", "/api/alerts?astronaut_id=AST-03&limit=15"),
    ("earth/manual-AST-03.json", "/api/astronauts/AST-03/manual?limit=20"),
    ("earth/questionnaires-AST-03.json", "/api/astronauts/AST-03/questionnaires"),
    ("earth/questionnaires.json", "/api/questionnaires?limit=20"),
    ("earth/context-AST-03.json", "/api/astronauts/AST-03/context?series=20"),
    ("earth/level-history-AST-02.json", "/api/astronauts/AST-02/level-history?limit=20"),
    ("earth/radiation-AST-02.json", "/api/astronauts/AST-02/radiation"),
    ("earth/thresholds-AST-02.json", "/api/astronauts/AST-02/thresholds"),
    ("earth/exercise-goals-AST-03.json", "/api/astronauts/AST-03/exercise-goals"),
    ("earth/changes.json", "/api/changes?limit=15"),
    ("earth/outbox.json", "/api/outbox?limit=5"),
    ("earth/station-link.json", "/api/station"),
    ("variables.json", "/api/variables"),
]
STATION_CALLS = [
    ("station/dashboard-AST-01.json", "/api/crew/AST-01/dashboard"),
    ("station/dashboard-AST-02.json", "/api/crew/AST-02/dashboard"),
    ("station/dashboard-AST-03.json", "/api/crew/AST-03/dashboard"),
    ("station/manual-AST-03.json", "/api/crew/AST-03/manual?limit=20"),
    ("station/questionnaires-AST-03.json", "/api/crew/AST-03/questionnaires"),
    ("station/config-AST-02.json", "/api/crew/AST-02/config"),
    ("station/messages-AST-03.json", "/api/messages?astronaut_id=AST-03"),
    ("station/status.json", "/api/status"),
    ("station/mission.json", "/api/sim/mission"),
    ("station/changes.json", "/api/changes?limit=15"),
]

# Packets the simulator app sends (requests, not responses): the shape of the JSON schema v1.1.
PACKET_NORMAL = {
    "schema_version": "1.1",
    "header": {"packet_id": "TLM-20261114-0042", "astronaut_id": "AST-01", "measured_at": "2026-11-14T17:30:00Z",
               "source": "automated_sensor_stream"},
    "mission_context": {"activity_state": "resting", "comm_latency_sec": 2.6,
                        "environment": {"cabin_co2_mmhg": 2.4}},
    "biometrics": {
        "cardiovascular": {"heart_rate_bpm": 68, "blood_pressure_systolic_mmhg": 118,
                           "blood_pressure_diastolic_mmhg": 76, "sensor_hardware": "Bio-Monitor ECG",
                           "signal_quality": "good"},
        "respiratory": {"spo2_percent": 98, "respiratory_rate_rpm": 14, "sensor_hardware": "Pulse Oximeter",
                        "signal_quality": "good"},
        "thermoregulation": {"core_temp_c": 37.1, "sensor_hardware": "Double Sensor Forehead",
                             "signal_quality": "good"}},
    "daily_assessment": None,
    "radiation_dosimetry": {"daily_rate_msv": 0.42, "solar_particle_event": {"active": False, "event_dose_msv": 0.0},
                            "sensor_hardware": "RAD / Liulin Active Dosimeter", "signal_quality": "good"},
}
PACKET_LOST = json.loads(json.dumps(PACKET_NORMAL))
PACKET_LOST["header"].update(packet_id="TLM-20261114-0043", measured_at="2026-11-14T17:31:00Z")
PACKET_LOST["biometrics"]["cardiovascular"].update(heart_rate_bpm=None, blood_pressure_systolic_mmhg=None,
                                                   blood_pressure_diastolic_mmhg=None, signal_quality="lost")
PACKET_DAILY = json.loads(json.dumps(PACKET_NORMAL))
PACKET_DAILY["header"].update(packet_id="TLM-20261115-0001", measured_at="2026-11-15T07:00:00Z",
                              source="periodic_device_trigger")
PACKET_DAILY["daily_assessment"] = {"assessment_date": "2026-11-15", "sleep_hours_last_night": 5.4,
                                    "pvt_reaction_time_ms": 410, "sensor_hardware": "Actiwatch / PVT-B",
                                    "signal_quality": "good"}
PACKET_SOLAR = json.loads(json.dumps(PACKET_NORMAL))
PACKET_SOLAR["header"].update(packet_id="TLM-20261115-0100", measured_at="2026-11-15T09:00:00Z")
PACKET_SOLAR["radiation_dosimetry"].update(daily_rate_msv=8.0, solar_particle_event={"active": True, "event_dose_msv": 250.0})
SIMULATOR_FILES = {"simulator/packet-normal.json": PACKET_NORMAL, "simulator/packet-sensor-lost.json": PACKET_LOST,
                   "simulator/packet-daily-assessment.json": PACKET_DAILY,
                   "simulator/packet-solar-event.json": PACKET_SOLAR}


def get(url: str):
    with urllib.request.urlopen(url, timeout=30) as response:
        return json.load(response)


def save(name: str, data) -> None:
    path = OUT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False, default=str) + "\n", encoding="utf-8")


def main() -> int:
    index = {}
    failed = []
    for server, base, calls in (("Earth", EARTH, EARTH_CALLS), ("Station", STATION, STATION_CALLS)):
        for name, path in calls:
            try:
                save(name, get(base + path))
                index[name] = {"server": server, "request": f"GET {path}"}
            except (urllib.error.URLError, OSError, ValueError) as exc:
                failed.append((name, str(exc)))
    for name, packet in SIMULATOR_FILES.items():
        save(name, packet)
        index[name] = {"server": "Station", "request": "POST /api/sim/packet (body)"}
    save("index.json", {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                        "note": "Real responses of the demo data. Times are those of the demo history.",
                        "files": index})
    print(f"{len(index)} files in {OUT}")
    for name, error in failed:
        print(f"  FAILED {name}: {error}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
