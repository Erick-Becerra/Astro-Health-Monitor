# Data Simulator

The sensor side of the platform. It measures or emulates the vital signs of the crew and sends them to the **space
station** of the Backend Server as `telemetry-v1.1` packets.

| Part | Folder | What it does |
|---|---|---|
| Telemetry simulator | `Simulator/emitter/` | Browser app with synthetic controls, an anatomical panel, a live ECG trace, and live inputs from a Bluetooth smartwatch (heart rate) and the ESP32 (temperature) |
| ESP32 thermometer | `ESP32/` | Firmware that reads a K-type thermocouple through a MAX6675 and serves the temperature over Wi-Fi |
| Local backend experiment | `Simulator/backend/` | A FastAPI package for telemetry ingestion and clinical evaluation, used while developing the simulator. The Backend Server is what receives the packets in the normal setup |

The simulator does not compute any colour or severity: the station does.

## Run the simulator

No build step is needed. Serve this folder with any static server and open it in **Chrome or Edge** (Web Bluetooth and
Web Serial need them):

```
python -m http.server 5500
```

Open http://localhost:5500/Simulator/emitter/ and, in the top bar, set:

- **Crew ID**, for example `AST-01`;
- **X-Actor**, who is moving the controls (it appears in the station's change log);
- **Space station endpoint**: `http://<BACKEND_IP>:8001/api/sim/packet`.

Click **Ping Health** (it should say `ONLINE`), then **Push Once** to send one packet or **Start Stream** to send
continuously. The simulator waits at least 1.1 seconds between packets per astronaut.

The laptop must be on the same network as the Backend Server. If the ping fails, check the IP of the backend, that it
is running, and that the firewall allows port 8001.

## ESP32 thermometer

Follow [ESP32/readme_esp32.md](ESP32/readme_esp32.md): wiring, how to flash `ESP32/firmware/esp32_temperature`, and how
to copy `secrets.h.example` to `secrets.h` with your Wi-Fi name and password (that file is never committed).

## Documentation

- [Simulator/sensor_telemetry_simulator_documentation.md](Simulator/sensor_telemetry_simulator_documentation.md): features,
  data flow, packet rules and hardware connection.
- The packet format and how to connect a simulator are also described in the Backend Server docs:
  `../Backend Server/docs/simulator/README.md`.

Some paths inside these guides still say `sensor-simulator/`; in this repository that folder is `Data Simulator/`.

This folder is one of the four projects of the repository; see the [root README](../README.md) for how they connect.
