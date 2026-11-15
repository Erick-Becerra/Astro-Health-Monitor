// ESP32 + K-type thermocouple (MAX6675) -> core temperature for the Sensor Simulator
//
// The ESP32 only MEASURES and SERVES the temperature:
//   GET http://<ESP32_IP>/temperatura  ->  {"valida":true,"temperatura":36.50}
//
// The Sensor Simulator page (sensor-simulator/emitter, file js/esp32-temperature.js)
// reads that value and puts it in the "Core Body Temperature" field. The rest of the
// telemetry-v1.1 packet is still built and sent by the simulator, untouched.
//
// Wi-Fi name and password live in secrets.h (copy secrets.h.example). It is NOT committed.

#include <WiFi.h>
#include <WebServer.h>
#include "max6675.h"
#include "secrets.h"

// ==================================
// MAX6675 PINS
// ==================================

int thermoDO = 19;
int thermoCS = 5;
int thermoCLK = 18;

MAX6675 thermocouple(thermoCLK, thermoCS, thermoDO);

// ==================================
// STATE
// ==================================

WebServer server(80);

float temperature = NAN;
unsigned long lastReading = 0;
bool serverStarted = false;

// ==================================
// LOCAL DEBUG PAGE (original design)
// ==================================

const char page[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Monitor de Temperatura</title>
<style>
body { font-family: Arial, sans-serif; background: #101827; color: white; text-align: center; margin: 0; padding: 25px; }
.contenedor { max-width: 450px; margin: 50px auto; background: #1e293b; padding: 30px; border-radius: 20px; }
h1 { font-size: 25px; color: #38bdf8; }
.temperatura { font-size: 65px; font-weight: bold; margin: 30px 0; color: #38bdf8; }
.unidad { font-size: 25px; }
.estado { font-size: 16px; color: #22c55e; }
.info { color: #94a3b8; font-size: 14px; }
</style>
</head>
<body>
<div class="contenedor">
<h1>MONITOR DE TEMPERATURA</h1>
<p class="info">ESP32 + TERMOPAR TIPO K</p>
<div class="temperatura">
<span id="temp">--.--</span>
<span class="unidad">°C</span>
</div>
<p class="estado" id="estado">Conectando...</p>
<p class="info">Actualizacion automatica cada segundo</p>
</div>
<script>
async function actualizarTemperatura() {
  try {
    const respuesta = await fetch('/temperatura');
    const datos = await respuesta.json();
    if (datos.valida) {
      document.getElementById("temp").textContent = datos.temperatura.toFixed(2);
      document.getElementById("estado").textContent = "Sensor funcionando correctamente";
      document.getElementById("estado").style.color = "#22c55e";
    } else {
      document.getElementById("temp").textContent = "--.--";
      document.getElementById("estado").textContent = "Error: revisar termopar";
      document.getElementById("estado").style.color = "#ef4444";
    }
  } catch (error) {
    document.getElementById("estado").textContent = "Error de comunicacion";
    document.getElementById("estado").style.color = "#ef4444";
  }
}
setInterval(actualizarTemperatura, 1000);
actualizarTemperatura();
</script>
</body>
</html>
)rawliteral";

// ==================================
// ROUTES
// ==================================

void handleRoot() {
  server.send_P(200, "text/html", page);
}

void handleTemperature() {
  // CORS: the Sensor Simulator page runs on another address/port, so the
  // browser needs this header to be allowed to read the answer.
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Cache-Control", "no-store");

  if (isnan(temperature)) {
    server.send(200, "application/json", "{\"valida\":false}");
  } else {
    String body = "{\"valida\":true,\"temperatura\":";
    body += String(temperature, 2);
    body += "}";
    server.send(200, "application/json", body);
  }
}

// ==================================
// WI-FI
// ==================================

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Connecting to Wi-Fi");
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("Wi-Fi connected.");
    Serial.print("ESP32 IP (type it in the simulator): ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("Could not connect. Will retry in loop(). Check name and password.");
  }
}

// ==================================
// SETUP / LOOP
// ==================================

void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println();
  Serial.println("K-type thermocouple + ESP32 (Sensor Simulator temperature)");

  connectWiFi();
}

void loop() {
  // Reconnect without blocking forever
  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long lastAttempt = 0;
    if (millis() - lastAttempt > 10000) {
      lastAttempt = millis();
      Serial.println("Wi-Fi lost, retrying...");
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }
    return;
  }

  // Start the web server once, when Wi-Fi is available
  if (!serverStarted) {
    server.on("/", HTTP_GET, handleRoot);
    server.on("/temperatura", HTTP_GET, handleTemperature);
    server.begin();
    serverStarted = true;
    Serial.println("Web server started. Open the IP above in a browser to test.");
  }

  server.handleClient();

  // Read the thermocouple once per second (the MAX6675 needs >= 220 ms between reads)
  if (millis() - lastReading >= 1000) {
    lastReading = millis();

    temperature = thermocouple.readCelsius();

    Serial.print("Temperature: ");
    if (isnan(temperature)) {
      Serial.println("thermocouple error");
    } else {
      Serial.print(temperature);
      Serial.println(" C");
    }
  }
}
