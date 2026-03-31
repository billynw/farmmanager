#include <AccelStepper.h>
#include "ESP_I2S.h"
#include <ggwave.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>
#include "esp_camera.h"

// ----- API設定 -----
const char* API_URL = "https://norawork.jp/api/v1/device/command";
const char* COMPLETE_URL = "https://norawork.jp/api/v1/device/command/complete";
const char* PHOTO_UPLOAD_URL = "https://norawork.jp/api/v1/sensors/%d/photos";
const unsigned long WAKE_INTERVAL_MINUTES = 5;  // 起動間隔(分) ※cronでいう*/5の5

// NTP設定
const char* NTP_SERVER = "ntp.nict.jp";
const long GMT_OFFSET_SEC = 9 * 3600;  // JST = UTC+9
const int DAYLIGHT_OFFSET_SEC = 0;

// ----- ピン設定 -----
#define STEP_PIN D3
#define DIR_PIN D2
#define SWITCH_OPEN D0
#define SWITCH_CLOSE D1
#define PDM_CLK_PIN 42
#define PDM_DATA_PIN 41
#define CONFIG_PIN 7     // D8
#define USER_LED_PIN 21  // XIAO ESP32S3 USER_LED

// ----- カメラピン設定 (XIAO ESP32S3 Sense) -----
#define PWDN_GPIO_NUM     -1
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM     10
#define SIOD_GPIO_NUM     40
#define SIOC_GPIO_NUM     39
#define Y9_GPIO_NUM       48
#define Y8_GPIO_NUM       11
#define Y7_GPIO_NUM       12
#define Y6_GPIO_NUM       14
#define Y5_GPIO_NUM       16
#define Y4_GPIO_NUM       18
#define Y3_GPIO_NUM       17
#define Y2_GPIO_NUM       15
#define VSYNC_GPIO_NUM    38
#define HREF_GPIO_NUM     47
#define PCLK_GPIO_NUM     13

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

void syncNTP() {
  Serial.println("NTP時刻同期中...");
  configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER);
  
  struct tm timeinfo;
  int retry = 0;
  while (!getLocalTime(&timeinfo) && retry < 10) {
    delay(500);
    retry++;
  }
  
  if (retry < 10) {
    Serial.print("現在時刻: ");
    Serial.println(&timeinfo, "%Y-%m-%d %H:%M:%S");
  } else {
    Serial.println("NTP同期失敗");
  }
}

bool initCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
  config.pin_d0       = Y2_GPIO_NUM;
  config.pin_d1       = Y3_GPIO_NUM;
  config.pin_d2       = Y4_GPIO_NUM;
  config.pin_d3       = Y5_GPIO_NUM;
  config.pin_d4       = Y6_GPIO_NUM;
  config.pin_d5       = Y7_GPIO_NUM;
  config.pin_d6       = Y8_GPIO_NUM;
  config.pin_d7       = Y9_GPIO_NUM;
  config.pin_xclk     = XCLK_GPIO_NUM;
  config.pin_pclk     = PCLK_GPIO_NUM;
  config.pin_vsync    = VSYNC_GPIO_NUM;
  config.pin_href     = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn     = PWDN_GPIO_NUM;
  config.pin_reset    = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  
  // PSRAMチェックしてサイズ調整
  if (psramFound()) {
    config.frame_size = FRAMESIZE_SVGA;  // 800x600
    config.jpeg_quality = 12;
    config.fb_count = 2;
    config.fb_location = CAMERA_FB_IN_PSRAM;  // PSRAM使用を明示
    config.grab_mode = CAMERA_GRAB_LATEST;
  } else {
    config.frame_size = FRAMESIZE_VGA;   // 640x480
    config.jpeg_quality = 12;
    config.fb_count = 1;
    config.fb_location = CAMERA_FB_IN_DRAM;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("カメラ初期化失敗: 0x%x\n", err);
    return false;
  }
  
  Serial.println("カメラ初期化成功");
  if (psramFound()) {
    Serial.println("PSRAM使用中");
  } else {
    Serial.println("WARNING: PSRAM未検出 - 低解像度モード");
  }
  return true;
}

void takeAndUploadPhoto(int sensorId, String token) {
  Serial.println("写真撮影開始");
  
  if (!initCamera()) {
    Serial.println("カメラ初期化失敗 - 撮影スキップ");
    return;
  }

  // 撮影
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("撮影失敗");
    esp_camera_deinit();
    return;
  }

  Serial.printf("撮影成功: %d bytes\n", fb->len);

  // アップロード
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi未接続 - アップロードスキップ");
    esp_camera_fb_return(fb);
    esp_camera_deinit();
    return;
  }

  WiFiClientSecure client;
  client.setInsecure();

  char url[128];
  snprintf(url, sizeof(url), PHOTO_UPLOAD_URL, sensorId);
  
  HTTPClient http;
  http.begin(client, url);
  http.setTimeout(30000);  // 30秒タイムアウト

  // multipart/form-data boundary
  String boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW";
  http.addHeader("Content-Type", "multipart/form-data; boundary=" + boundary);

  // multipart body作成
  String head = "--" + boundary + "\r\n";
  head += "Content-Disposition: form-data; name=\"token\"\r\n\r\n";
  head += token + "\r\n";
  head += "--" + boundary + "\r\n";
  head += "Content-Disposition: form-data; name=\"file\"; filename=\"photo.jpg\"\r\n";
  head += "Content-Type: image/jpeg\r\n\r\n";

  String tail = "\r\n--" + boundary + "--\r\n";

  uint32_t totalLen = head.length() + fb->len + tail.length();

  // ストリーム送信
  client.print(String("POST ") + url + " HTTP/1.1\r\n");
  client.print(String("Host: norawork.jp\r\n"));
  client.print("Content-Type: multipart/form-data; boundary=" + boundary + "\r\n");
  client.print("Content-Length: " + String(totalLen) + "\r\n");
  client.print("\r\n");
  client.print(head);
  
  // 画像データ送信
  uint8_t* buf = fb->buf;
  size_t len = fb->len;
  size_t sent = 0;
  while (sent < len) {
    size_t chunk = (len - sent > 4096) ? 4096 : (len - sent);
    size_t written = client.write(buf + sent, chunk);
    sent += written;
    if (written == 0) break;
  }
  
  client.print(tail);

  // レスポンス待ち
  unsigned long timeout = millis();
  while (client.available() == 0) {
    if (millis() - timeout > 10000) {
      Serial.println("アップロードタイムアウト");
      esp_camera_fb_return(fb);
      esp_camera_deinit();
      client.stop();
      return;
    }
  }

  // レスポンス読み取り
  while (client.available()) {
    String line = client.readStringUntil('\n');
    if (line.startsWith("HTTP/1.1")) {
      Serial.println(line);
      if (line.indexOf("200") > 0) {
        Serial.println("写真アップロード成功");
      }
    }
  }

  client.stop();
  esp_camera_fb_return(fb);
  esp_camera_deinit();
  Serial.println("写真撮影完了");
}

String getCommandFromServer(GateState state, String token, bool* takePhoto, int* sensorId) {
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
  *takePhoto = false;
  *sensorId = 0;

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
      
      // take_photoフラグ取得
      if (!responseDoc["take_photo"].isNull()) {
        *takePhoto = responseDoc["take_photo"].as<bool>();
        Serial.print("写真撮影: ");
        Serial.println(*takePhoto ? "YES" : "NO");
      }
      
      // sensor_id取得
      if (!responseDoc["sensor_id"].isNull()) {
        *sensorId = responseDoc["sensor_id"].as<int>();
        Serial.print("SensorID: ");
        Serial.println(*sensorId);
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
  } else if (command == "CLOSE") {
    closeGate();
  } else if (command == "NONE" || command == "") {
    Serial.println("コマンドなし");
  } else {
    Serial.println("不明なコマンド: " + command);
  }
}

void goToDeepSleep() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    // NTP同期失敗時は固定間隔でスリープ
    Serial.println("時刻取得失敗 - 固定間隔でスリープ");
    unsigned long sleepTime = WAKE_INTERVAL_MINUTES * 60;
    Serial.print("Deep Sleep for ");
    Serial.print(sleepTime);
    Serial.println(" seconds...");
    delay(100);
    esp_sleep_enable_timer_wakeup(sleepTime * 1000000ULL);
    esp_deep_sleep_start();
    return;
  }

  // 現在の分を取得
  int currentMinute = timeinfo.tm_min;
  int currentSecond = timeinfo.tm_sec;
  
  // 次の起動タイミングまでの分数を計算
  int minutesUntilNextWake = WAKE_INTERVAL_MINUTES - (currentMinute % WAKE_INTERVAL_MINUTES);
  
  // 秒単位でのスリープ時間を計算
  unsigned long sleepSeconds = (minutesUntilNextWake * 60) - currentSecond;
  
  Serial.print("現在: ");
  Serial.print(timeinfo.tm_hour);
  Serial.print(":");
  Serial.print(currentMinute);
  Serial.print(":");
  Serial.println(currentSecond);
  
  Serial.print("次回起動まで ");
  Serial.print(sleepSeconds);
  Serial.println(" 秒スリープ");
  
  delay(100);
  esp_sleep_enable_timer_wakeup(sleepSeconds * 1000000ULL);
  esp_deep_sleep_start();
}

void setup() {
  Serial.begin(115200);
  delay(1000);  // シリアル初期化待ち

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

    // NTP時刻同期
    if (WiFi.status() == WL_CONNECTED) {
      syncNTP();
    }

    // サーバーからコマンド取得
    bool takePhoto = false;
    int sensorId = 0;
    String command = getCommandFromServer(currentState, CamToken, &takePhoto, &sensorId);

    // コマンド実行
    executeCommand(command, CamToken);

    // 最終的な状態を取得して完了報告
    GateState finalState = getCurrentState();
    reportCommandComplete(finalState, CamToken);

    // 写真撮影
    if (takePhoto && sensorId > 0) {
      takeAndUploadPhoto(sensorId, CamToken);
    }

    // Deep Sleep前にNTP再取得（写真撮影後に時刻がずれている可能性）
    if (WiFi.status() == WL_CONNECTED) {
      syncNTP();
    }

    // WiFi切断
    WiFi.disconnect(true);
    WiFi.mode(WIFI_OFF);

    // Deep Sleep (NTPベースの次回起動タイミング計算)
    goToDeepSleep();
  }
}

void loop() {
  // Deep Sleepに入るのでloopは実行されない
}
