# Firmware (ESP32)

Code for the ESP32 that simulates an astronaut's vital signs and sends them
wirelessly to the backend.

- This folder is NOT part of Docker. Use Arduino IDE or PlatformIO to build and flash it.
- The ESP32 and the computer running the backend must be on the same Wi-Fi network.
- The ESP32 sends data to `http://<COMPUTER_IP>:8000/...` (the endpoint is defined together with the backend owner).
- Never commit Wi-Fi names or passwords. Keep them in a local file that is listed in `.gitignore`.
- The message format is defined in [`docs/data-format.md`](../docs/data-format.md).
