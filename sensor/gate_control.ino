#include <AccelStepper.h>
#include "ESP_I2S.h"
#include <ggwave.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ----- API設定 -----
const char* API_URL = "https://norawork.jp/api/v1/device/command";
const char* COMPLETE_URL = "https://norawork.jp/api/v1/device/command/complete";
const unsigned long DEEP_SLEEP_TIME = 300;  // 5分 = 300秒

// ----- ピン設定 -----
#define STEP_PIN D3
#define DIR_PIN D2
#define SWITCH_OPEN D0
#define SWITCH_CLOSE D1

static const int8_t PDM_CLK_PIN = 42;
static const int8_t PDM_DATA_PIN = 41;
static const int8_t CONFIG_PIN = 7;     // D8
static const int8_t USER_LED_PIN = 21;  // XIAO ESP32S3 USER_LED

// ----- オーディオ設定 -----
static const uint32_t SAMPLE_RATE = 48000;
static const int SAMPLES_PER_FRAME = 1024;
static const int BYTES_PER_FRAME = SAMPLES_PER_FRAME * sizeof(int16_t);

// ----- グローバル変数 -----
I2SClass i2s;
GGWave ggwave;
Preferences prefs;
static int16_t sampleBuf[SAMPLES_PER_FRAME];
static char lastReceived[17] = {};

// ----- ゲート状態 -----
enum GateState {
  UNKNOWN,  // 中間位置
  OPEN,     // 全開
  CLOSE     // 全閉
};

AccelStepper stepper(AccelStepper::DRIVER, STEP_PIN, DIR_PIN);

long closePosition = 0;
long openPosition = 40000;

// ============================================================
// ggwave / I2S 初期化
// ============================================================
void initGGWave() {
  i2s.setPinsPdmRx(PDM_CLK_PIN, PDM_DATA_PIN);
  if (!i2s.begin(I2S_MODE_PDM_RX,
                 SAMPLE_RATE,
                 I2S_DATA_BIT_WIDTH_16BIT,
                 I2S_SLOT_MODE_MONO)) {
    Serial.println(F("ERROR: I2S init failed"));
    while (1) { delay(1000); }
  }
  Serial.println(F("I2S PDM RX initialized"));

  ggwave.setLogFile(nullptr);

  auto p = GGWave::getDefaultParameters();
  p.payloadLength = 16;
  p.sampleRateInp = SAMPLE_RATE;
  p.sampleRateOut = SAMPLE_RATE;
  p.sampleRate = SAMPLE_RATE;
  p.samplesPerFrame = SAMPLES_PER_FRAME;
  p.sampleFormatInp = GGWAVE_SAMPLE_FORMAT_I16;
  p.sampleFormatOut = GGWAVE_SAMPLE_FORMAT_U8;
  p.operatingMode = GGWAVE_OPERATING_MODE_RX;

  GGWave::Protocols::tx().disableAll();
  GGWave::Protocols::rx().disableAll();
  GGWave::Protocols::rx().toggle(GGWAVE_PROTOCOL_AUDIBLE_FASTEST, true);

  ggwave.prepare(p, false);
  Serial.print(F("ggwave heap required: "));
  Serial.print(ggwave.heapSize());
  Serial.println(F(" bytes"));
  if (ggwave.heapSize() > 300000) {
    Serial.println(F("WARNING: heap very large. PSRAM(OPI)が有効か確認"));
  }
  ggwave.prepare(p, true);
  Serial.println(F("ggwave initialized."));
}

String getStateString(GateState state) {
  switch (state) {
    case UNKNOWN: return "UNKNOWN";
    case OPEN: return "OPEN";
    case CLOSE: return "CLOSE";
    default: return "UNKNOWN";
  }
}

GateState getCurrentState() {
  delay(500);
  if (digitalRead(SWITCH_OPEN) == HIGH) {
    return OPEN;
  } else if (digitalRead(SWITCH_CLOSE) == HIGH) {
    return CLOSE;
  } else {
    return UNKNOWN;
  }
}

void connectWiFi(String ssid, String pass) {
  Serial.print("WiFi接続中: ");
  Serial.println(ssid);

  WiFi.begin(ssid.c_str(), pass.c_str());

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi接続成功");
    Serial.print("IPアドレス: ");
    Serial.println(WiFi.localIP());
    delay(1000); 
  } else {
    Serial.println("\nWiFi接続失敗");
  }
}

String getCommandFromServer(GateState state, String token) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi未接続");
    return "NONE";
  }

  WiFiClientSecure client;
  client.setInsecure();  // 証明書検証スキップ

  HTTPClient http;
  http.begin(client, API_URL);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  // 現在の状態をJSON化
  JsonDocument doc;
  doc["state"] = getStateString(state);
  doc["token"] = token;

  String requestBody;
  serializeJson(doc, requestBody);

  Serial.print("状態送信: ");
  Serial.println(requestBody);

  // POSTリクエスト送信
  int httpCode = http.POST(requestBody);

  String command = "NONE";

  if (httpCode == HTTP_CODE_OK) {
    String payload = http.getString();
    Serial.print("レスポンス受信: ");
    Serial.println(payload);

    // レスポンスからコマンド取得
    JsonDocument responseDoc;
    DeserializationError error = deserializeJson(responseDoc, payload);

    if (!error) {
      const char* cmd = responseDoc["command"];
      if (cmd != nullptr && strlen(cmd) > 0) {
        command = String(cmd);
        Serial.print("コマンド取得: ");
        Serial.println(command);
      }
    } else {
      Serial.print("JSONパースエラー: ");
      Serial.println(error.c_str());
    }
  } else if (httpCode > 0) {
    Serial.print("HTTP エラー: ");
    Serial.println(httpCode);
  } else {
    Serial.print("接続エラー: ");
    Serial.println(http.errorToString(httpCode));
  }

  http.end();
  return command;
}

void reportCommandComplete(GateState state, String token) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi未接続 - 完了報告スキップ");
    return;
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.begin(client, COMPLETE_URL);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  JsonDocument doc;
  doc["state"] = getStateString(state);
  doc["token"] = token;

  String requestBody;
  serializeJson(doc, requestBody);

  Serial.print("完了報告送信: ");
  Serial.println(requestBody);

  int httpCode = http.POST(requestBody);

  if (httpCode == HTTP_CODE_OK) {
    Serial.println("完了報告成功");
  } else if (httpCode > 0) {
    Serial.print("完了報告エラー: ");
    Serial.println(httpCode);
  } else {
    Serial.print("接続エラー: ");
    Serial.println(http.errorToString(httpCode));
  }

  http.end();
}

void openGate() {
  Serial.println("Opening...");
  stepper.moveTo(openPosition);

  // OPENリミット到達まで待つ
  while (digitalRead(SWITCH_OPEN) == LOW) {
    stepper.run();
  }

  stepper.setCurrentPosition(openPosition);
  Serial.println("OPEN limit reached");
}

void closeGate() {
  Serial.println("Closing...");
  stepper.moveTo(closePosition);

  // CLOSEリミット到達まで待つ
  while (digitalRead(SWITCH_CLOSE) == LOW) {
    stepper.run();
  }

  stepper.setCurrentPosition(closePosition);
  Serial.println("CLOSE limit reached");
}

void executeCommand(String command, String token) {
  command.toUpperCase();

  if (command == "OPEN") {
    openGate();
    reportCommandComplete(OPEN, token);
  } else if (command == "CLOSE") {
    closeGate();
    reportCommandComplete(CLOSE, token);
  } else if (command == "NONE" || command == "") {
    Serial.println("コマンドなし");
  } else {
    Serial.println("不明なコマンド: " + command);
  }
}

void goToDeepSleep() {
  Serial.print("Deep Sleep for ");
  Serial.print(DEEP_SLEEP_TIME);
  Serial.println(" seconds...");
  delay(100);

  esp_sleep_enable_timer_wakeup(DEEP_SLEEP_TIME * 1000000ULL);  // マイクロ秒単位
  esp_deep_sleep_start();
}

void setup() {
  Serial.begin(115200);
  delay(1000);  // シリアル初期化待ち（シリアル無しでも動作）

  // USER_LED
  pinMode(USER_LED_PIN, OUTPUT);
  digitalWrite(USER_LED_PIN, HIGH);  // 消灯

  // 設定ボタン (内蔵プルダウン、ボタン押下でHIGH)
  pinMode(CONFIG_PIN, INPUT_PULLDOWN);
  delay(10);  // GPIO安定待ち

  bool configMode = (digitalRead(CONFIG_PIN) == HIGH);

  if (configMode) {
    // ======================================================
    // 設定モード
    // ======================================================
    Serial.println(F("=== CONFIG MODE ==="));
    digitalWrite(USER_LED_PIN, LOW);  // LED点灯

    initGGWave();
    Serial.println(F("Waiting for S<ssid> / P<pass> / T<Token> ..."));

    char ssid[17] = {};
    char pass[17] = {};
    char CamToken[17] = {};
    bool gotSSID = false;
    bool gotPass = false;
    bool gotCamToken = false;

    while (!(gotSSID && gotPass && gotCamToken)) {
      // --- 1フレーム分読み込み ---
      int bytesRead = 0;
      while (bytesRead < BYTES_PER_FRAME) {
        int n = i2s.readBytes(
          reinterpret_cast<char*>(sampleBuf) + bytesRead,
          BYTES_PER_FRAME - bytesRead);
        if (n > 0) {
          bytesRead += n;
        } else {
          break;  // timeout: 次のループへ
        }
      }
      if (bytesRead < BYTES_PER_FRAME) continue;

      // --- デコード ---
      if (!ggwave.decode(sampleBuf, BYTES_PER_FRAME)) continue;

      GGWave::TxRxData result;
      int nr = ggwave.rxTakeData(result);
      if (nr <= 0) continue;

      // 固定長バッファに受け取り
      char str[17] = {};
      memcpy(str, result.data(), nr);

      // 重複チェック
      if (strncmp(str, lastReceived, 16) == 0) continue;
      memcpy(lastReceived, str, 16);

      Serial.print(F("Received: "));
      Serial.println(str);

      // 先頭文字でSSID/Pass/Tokenを振り分け
      switch (str[0]) {
        case 'S':
          strncpy(ssid, str + 1, 15);
          gotSSID = true;
          Serial.print(F("  -> SSID: "));
          Serial.println(ssid);
          break;
        case 'P':
          strncpy(pass, str + 1, 15);
          gotPass = true;
          Serial.print(F("  -> Password: "));
          Serial.println(pass);
          break;
        case 'T':
          strncpy(CamToken, str + 1, 15);
          gotCamToken = true;
          Serial.print(F("  -> Token: "));
          Serial.println(CamToken);
          break;
        default:
          Serial.println(F("  -> Unknown prefix, ignored."));
          break;
      }

      // 受信状況を表示
      Serial.printf("  [%s] SSID  %s\n", gotSSID ? "OK" : "--", gotSSID ? ssid : "");
      Serial.printf("  [%s] Pass  %s\n", gotPass ? "OK" : "--", gotPass ? "****" : "");
      Serial.printf("  [%s] Token %s\n", gotCamToken ? "OK" : "--", gotCamToken ? CamToken : "");
    }

    // --- NVSに保存 ---
    prefs.begin("config", false);
    prefs.putString("ssid", ssid);
    prefs.putString("pass", pass);
    prefs.putString("CamToken", CamToken);
    prefs.end();

    Serial.println(F("=== Saved to NVS. Rebooting... ==="));
    delay(500);
    digitalWrite(USER_LED_PIN, HIGH);
    ESP.restart();

  } else {
    // ======================================================
    // 通常動作モード
    // ======================================================
    Serial.println(F("=== NORMAL MODE ==="));

    // NVSから設定読み込み
    prefs.begin("config", true);  // read-only
    String ssid = prefs.getString("ssid", "");
    String pass = prefs.getString("pass", "");
    String CamToken = prefs.getString("CamToken", "");
    prefs.end();

    if (ssid.isEmpty()) {
      Serial.println(F("WARNING: SSID not set. Boot with CONFIG button to configure."));
      goToDeepSleep();
      return;
    }

    Serial.print(F("SSID : "));
    Serial.println(ssid);
    Serial.print(F("Token: "));
    Serial.println(CamToken);

    // ピン初期化
    pinMode(SWITCH_OPEN, INPUT_PULLUP);
    pinMode(SWITCH_CLOSE, INPUT_PULLUP);

    stepper.setMaxSpeed(6000);
    stepper.setAcceleration(2000);

    // 現在位置確認
    GateState currentState = getCurrentState();
    Serial.print("Current state: ");
    Serial.println(getStateString(currentState));

    // 位置不明の場合は強制的にCLOSEへ
    if (currentState == UNKNOWN) {
      Serial.println("Unknown position - forcing CLOSE");
      stepper.setCurrentPosition(0);          // 現在位置を仮に0とする
      stepper.moveTo(closePosition - 50000);  // 大きな負の値で閉方向へ強制移動

      // CLOSEリミット到達まで待つ
      while (digitalRead(SWITCH_CLOSE) == LOW) {
        stepper.run();
      }
      stepper.setCurrentPosition(closePosition);
      stepper.moveTo(closePosition);  // targetPositionも0にして停止
      currentState = CLOSE;
      Serial.println("Forced to CLOSE position");
    } else if (currentState == OPEN) {
      stepper.setCurrentPosition(openPosition);
    } else if (currentState == CLOSE) {
      stepper.setCurrentPosition(closePosition);
    }

    // WiFi接続
    connectWiFi(ssid, pass);

    // サーバーからコマンド取得
    String command = getCommandFromServer(currentState, CamToken);

    // コマンド実行（完了報告含む）
    executeCommand(command, CamToken);

    // WiFi切断
    WiFi.disconnect(true);
    WiFi.mode(WIFI_OFF);

    // Deep Sleep
    goToDeepSleep();
  }
}

void loop() {
  // Deep Sleepに入るのでloopは実行されない
}
