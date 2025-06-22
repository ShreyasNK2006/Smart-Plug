// Copyright 2024, Shrey
// IOT-based AC Energy Meter

// Libraries
#include <Arduino.h>
#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <ModbusMaster.h>
#include <SPIFFS.h>
#include <ArduinoJson.h>
#include <TimeLib.h>

// WiFi Credentials
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// PZEM-004T is connected to Serial2 of ESP32
#define RX2_PIN 16
#define TX2_PIN 17

// Relay is connected to GPIO 23
#define RELAY_PIN 23

// Globals
AsyncWebServer server(80);
AsyncWebSocket ws("/ws");
ModbusMaster node;

bool relayState = false; // Initial state of the relay
unsigned long timer_on_ms = 0;
unsigned long timer_off_ms = 0;
bool timer_on_enabled = false;
bool timer_off_enabled = false;

// Data storage structure
struct EnergyReading {
    time_t timestamp;
    float energy;
    float power;
};

// Circular buffer for hourly readings (24 hours)
const int HOURLY_READINGS = 24;
EnergyReading hourlyData[HOURLY_READINGS];
int hourlyIndex = 0;

// Daily readings for a month
const int DAILY_READINGS = 31;
EnergyReading dailyData[DAILY_READINGS];
int dailyIndex = 0;

// Monthly readings for a year
const int MONTHLY_READINGS = 12;
EnergyReading monthlyData[MONTHLY_READINGS];
int monthlyIndex = 0;

String currentDevice = ""; // Current device type
float lastEnergy = 0;     // Last energy reading for calculating consumption

// Function Prototypes
void initWiFi();
void initSPIFFS();
void initWebSocket();
void initRelay();
void getPzemData();
void notifyClients(String data);
void handleWebSocketMessage(void *arg, uint8_t *data, size_t len);
void onEvent(AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type, void *arg, uint8_t *data, size_t len);
void saveEnergyData();
void loadEnergyData();
void updateEnergyReadings(float energy, float power);
void sendHistoricalData(const char* period);


void setup() {
  Serial.begin(115200);

  initRelay();
  
  // Set up Serial2 for PZEM-004T
  Serial2.begin(9600, SERIAL_8N1, RX2_PIN, TX2_PIN);
  node.begin(1, Serial2); // Slave ID 1

  initWiFi();
  initSPIFFS();
  initWebSocket();
  loadEnergyData(); // Load existing energy data

  // Route for root / web page
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request){
    request->send(SPIFFS, "/index.html", String(), false);
  });

  // Route to load style.css file
  server.on("/style.css", HTTP_GET, [](AsyncWebServerRequest *request){
    request->send(SPIFFS, "/style.css", "text/css");
  });

  // Route to load script.js file
  server.on("/script.js", HTTP_GET, [](AsyncWebServerRequest *request){
    request->send(SPIFFS, "/script.js", "text/javascript");
  });
  
  server.begin();
}

void loop() {
  getPzemData();

  if (timer_on_enabled && millis() >= timer_on_ms) {
    relayState = true;
    digitalWrite(RELAY_PIN, relayState);
    timer_on_enabled = false;
    // Notify clients about relay state change
    String stateString = relayState ? "true" : "false";
    ws.textAll("{\"type\":\"relayState\",\"state\":" + stateString + "}");
    ws.textAll("{\"type\":\"alert\",\"message\":\"Timer ON expired. Plug turned ON.\"}");
  }

  if (timer_off_enabled && millis() >= timer_off_ms) {
    relayState = false;
    digitalWrite(RELAY_PIN, relayState);
    timer_off_enabled = false;
    // Notify clients about relay state change
    String stateString = relayState ? "true" : "false";
    ws.textAll("{\"type\":\"relayState\",\"state\":" + stateString + "}");
    ws.textAll("{\"type\":\"alert\",\"message\":\"Timer OFF expired. Plug turned OFF.\"}");
  }

  ws.cleanupClients();
  delay(2000); // Update data every 2 seconds
}

void initWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi ..");
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print('.');
    delay(1000);
  }
  Serial.println(WiFi.localIP());
}

void initSPIFFS() {
  if (!SPIFFS.begin()) {
    Serial.println("An Error has occurred while mounting SPIFFS");
    return;
  }
}

void initWebSocket() {
  ws.onEvent(onEvent);
  server.addHandler(&ws);
}

void onEvent(AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type, void *arg, uint8_t *data, size_t len) {
    switch (type) {
      case WS_EVT_CONNECT:
        Serial.printf("WebSocket client #%u connected from %s\n", client->id(), client->remoteIP().toString().c_str());
        // Send current relay state
        String stateString = relayState ? "true" : "false";
        client->text("{\"type\":\"relayState\",\"state\":" + stateString + "}");
        break;
      case WS_EVT_DISCONNECT:
        Serial.printf("WebSocket client #%u disconnected\n", client->id());
        break;
      case WS_EVT_DATA:
        handleWebSocketMessage(arg, data, len);
        break;
      case WS_EVT_PONG:
      case WS_EVT_ERROR:
        break;
  }
}

void handleWebSocketMessage(void *arg, uint8_t *data, size_t len) {
    AwsFrameInfo *info = (AwsFrameInfo*)arg;
    if (info->final && info->index == 0 && info->len == len && info->opcode == WS_TEXT) {
        data[len] = 0;
        String message = (char*)data;
        
        StaticJsonDocument<200> doc;
        DeserializationError error = deserializeJson(doc, message);
        
        if (error) {
            Serial.println("Error parsing JSON");
            return;
        }

        const char* type = doc["type"];

        if (strcmp(type, "setDevice") == 0) {
            currentDevice = doc["device"].as<String>();
            loadEnergyData();
            // Send current data for the new device
            sendHistoricalData();
        }
        else if (strcmp(type, "getData") == 0) {
            const char* period = doc["period"];
            sendHistoricalData(period);
        }
        else if (strcmp(type, "relayControl") == 0) {
            relayState = doc["state"];
            digitalWrite(RELAY_PIN, relayState);
            String stateString = relayState ? "true" : "false";
            ws.textAll("{\"type\":\"relayState\",\"state\":" + stateString + "}");
        }
        else if (strcmp(type, "setTimer") == 0) {
            const char* timerType = doc["timerType"];
            int minutes = doc["minutes"];
            
            if (strcmp(timerType, "on") == 0) {
                timer_on_ms = millis() + (minutes * 60000);
                timer_on_enabled = true;
                ws.textAll("{\"type\":\"alert\",\"message\":\"Timer ON set for " + String(minutes) + " minutes\"}");
            }
            else if (strcmp(timerType, "off") == 0) {
                timer_off_ms = millis() + (minutes * 60000);
                timer_off_enabled = true;
                ws.textAll("{\"type\":\"alert\",\"message\":\"Timer OFF set for " + String(minutes) + " minutes\"}");
            }
        }
    }
}

void sendHistoricalData(const char* period = "day") {
    StaticJsonDocument<4096> doc;
    doc["type"] = "historicalData";
    doc["period"] = period;
    JsonArray data = doc.createNestedArray("data");
    
    if (strcmp(period, "day") == 0) {
        for (int i = 0; i < HOURLY_READINGS; i++) {
            if (hourlyData[i].timestamp > 0) {
                JsonObject reading = data.createNestedObject();
                reading["t"] = hourlyData[i].timestamp;
                reading["e"] = hourlyData[i].energy;
                reading["p"] = hourlyData[i].power;
            }
        }
    }
    else if (strcmp(period, "week") == 0 || strcmp(period, "month") == 0) {
        for (int i = 0; i < DAILY_READINGS; i++) {
            if (dailyData[i].timestamp > 0) {
                JsonObject reading = data.createNestedObject();
                reading["t"] = dailyData[i].timestamp;
                reading["e"] = dailyData[i].energy;
                reading["p"] = dailyData[i].power;
            }
        }
    }
    else if (strcmp(period, "year") == 0) {
        for (int i = 0; i < MONTHLY_READINGS; i++) {
            if (monthlyData[i].timestamp > 0) {
                JsonObject reading = data.createNestedObject();
                reading["t"] = monthlyData[i].timestamp;
                reading["e"] = monthlyData[i].energy;
                reading["p"] = monthlyData[i].power;
            }
        }
    }
    
    String jsonString;
    serializeJson(doc, jsonString);
    ws.textAll(jsonString);
}

void initRelay() {
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, relayState); // Initially off
}

void getPzemData() {
  uint8_t result;
  // Read input registers from the PZEM-004T
  result = node.readInputRegisters(0x0000, 10); // Read 10 registers starting from 0x0000
  
  if (result == node.ku8MBSuccess) {
    float voltage = node.getResponseBuffer(0x00) / 10.0f;
    float current = (node.getResponseBuffer(0x01) | (node.getResponseBuffer(0x02) << 16)) / 1000.0f;
    float power = (node.getResponseBuffer(0x03) | (node.getResponseBuffer(0x04) << 16)) / 10.0f;
    float energy = (node.getResponseBuffer(0x05) | (node.getResponseBuffer(0x06) << 16)) / 1000.0f;
    float frequency = node.getResponseBuffer(0x07) / 10.0f;
    
    String json = "{\"type\":\"data\",\"voltage\":" + String(voltage) + 
                  ",\"current\":" + String(current, 3) + 
                  ",\"power\":" + String(power, 2) + 
                  ",\"energy\":" + String(energy, 3) + 
                  ",\"frequency\":" + String(frequency, 1) + "}";
    
    ws.textAll(json);

    // Example Alert: High Power Consumption
    if (power > 3000) { // e.g., 3000W
        ws.textAll("{\"type\":\"alert\",\"message\":\"High power consumption alert!\"}");
    }

    // Update energy readings for historical data
    updateEnergyReadings(energy, power);

  } else {
    Serial.println("Failed to read from PZEM-004T");
  }
}

// Function to save energy data
void saveEnergyData() {
    String filename = "/" + currentDevice + "_data.json";
    File file = SPIFFS.open(filename, "w");
    if (!file) {
        Serial.println("Failed to open file for writing");
        return;
    }

    StaticJsonDocument<4096> doc;
    JsonArray hourly = doc.createNestedArray("hourly");
    JsonArray daily = doc.createNestedArray("daily");
    JsonArray monthly = doc.createNestedArray("monthly");

    // Save hourly data
    for (int i = 0; i < HOURLY_READINGS; i++) {
        if (hourlyData[i].timestamp > 0) {
            JsonObject reading = hourly.createNestedObject();
            reading["t"] = hourlyData[i].timestamp;
            reading["e"] = hourlyData[i].energy;
            reading["p"] = hourlyData[i].power;
        }
    }

    // Save daily data
    for (int i = 0; i < DAILY_READINGS; i++) {
        if (dailyData[i].timestamp > 0) {
            JsonObject reading = daily.createNestedObject();
            reading["t"] = dailyData[i].timestamp;
            reading["e"] = dailyData[i].energy;
            reading["p"] = dailyData[i].power;
        }
    }

    // Save monthly data
    for (int i = 0; i < MONTHLY_READINGS; i++) {
        if (monthlyData[i].timestamp > 0) {
            JsonObject reading = monthly.createNestedObject();
            reading["t"] = monthlyData[i].timestamp;
            reading["e"] = monthlyData[i].energy;
            reading["p"] = monthlyData[i].power;
        }
    }

    serializeJson(doc, file);
    file.close();
}

// Function to load energy data
void loadEnergyData() {
    if (currentDevice.length() == 0) return;
    
    String filename = "/" + currentDevice + "_data.json";
    if (!SPIFFS.exists(filename)) return;

    File file = SPIFFS.open(filename, "r");
    if (!file) return;

    StaticJsonDocument<4096> doc;
    DeserializationError error = deserializeJson(doc, file);
    if (error) {
        Serial.println("Failed to parse file");
        file.close();
        return;
    }

    // Load hourly data
    JsonArray hourly = doc["hourly"];
    hourlyIndex = 0;
    for (JsonObject reading : hourly) {
        if (hourlyIndex < HOURLY_READINGS) {
            hourlyData[hourlyIndex].timestamp = reading["t"];
            hourlyData[hourlyIndex].energy = reading["e"];
            hourlyData[hourlyIndex].power = reading["p"];
            hourlyIndex++;
        }
    }

    // Load daily data
    JsonArray daily = doc["daily"];
    dailyIndex = 0;
    for (JsonObject reading : daily) {
        if (dailyIndex < DAILY_READINGS) {
            dailyData[dailyIndex].timestamp = reading["t"];
            dailyData[dailyIndex].energy = reading["e"];
            dailyData[dailyIndex].power = reading["p"];
            dailyIndex++;
        }
    }

    // Load monthly data
    JsonArray monthly = doc["monthly"];
    monthlyIndex = 0;
    for (JsonObject reading : monthly) {
        if (monthlyIndex < MONTHLY_READINGS) {
            monthlyData[monthlyIndex].timestamp = reading["t"];
            monthlyData[monthlyIndex].energy = reading["e"];
            monthlyData[monthlyIndex].power = reading["p"];
            monthlyIndex++;
        }
    }

    file.close();
}

// Function to update energy readings
void updateEnergyReadings(float energy, float power) {
    time_t now = time(nullptr);
    
    // Update hourly data
    if (hourlyIndex >= HOURLY_READINGS) hourlyIndex = 0;
    hourlyData[hourlyIndex].timestamp = now;
    hourlyData[hourlyIndex].energy = energy - lastEnergy;
    hourlyData[hourlyIndex].power = power;
    hourlyIndex++;
    
    // Update daily data at midnight
    if (hour(now) == 0 && minute(now) == 0) {
        if (dailyIndex >= DAILY_READINGS) dailyIndex = 0;
        dailyData[dailyIndex].timestamp = now;
        dailyData[dailyIndex].energy = energy - lastEnergy;
        dailyData[dailyIndex].power = power;
        dailyIndex++;
    }
    
    // Update monthly data on the first of each month
    if (day(now) == 1 && hour(now) == 0 && minute(now) == 0) {
        if (monthlyIndex >= MONTHLY_READINGS) monthlyIndex = 0;
        monthlyData[monthlyIndex].timestamp = now;
        monthlyData[monthlyIndex].energy = energy - lastEnergy;
        monthlyData[monthlyIndex].power = power;
        monthlyIndex++;
    }
    
    lastEnergy = energy;
    saveEnergyData();
}