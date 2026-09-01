// ZoneDash central unit (ESP32-S3, Matrix Portal S3) — ESP-NOW bring-up + hit
// cycle. Builds on the proven radio link: the brain discovers a target by its
// Hello, pings it (round-trip proof), then runs a simple ARM cycle so the whole
// hit path can be exercised end to end without a display, BLE, or the drill
// engine. It Syncs its clock to the node, Arms it, and waits for a Pressed —
// then logs the reaction time (t_hit − t_arm, both in the brain's clock domain)
// and re-arms after a beat. On the target, a BOOT-button press stands in for the
// sensor (still in transit). The drill engine / HUB75 / BLE layer on top later.
//
// The HUB75 panel is NOT needed for this step: bring-up is observed over
// USB-serial @ 115200 (docs/architecture.md "Testing without the app"). This
// file can't be host-compiled (Arduino + esp_now); flash it with
// `pio run -e brain -t upload` and read the serial log.
#include <Arduino.h>
#include <WiFi.h>
#include <driver/gpio.h> // gpio_set_drive_capability — see diag::setup()
#include <esp_now.h>
#include <esp_timer.h>
#include <esp_wifi.h>

#include <cstdio>
#include <cstring>

#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>

#include "layout.h"  // host-tested panel geometry (lib/display)
#include "pairing.h" // Mac type (reused; full pairing round is the next increment)
#include "protocol.h"

using namespace zd;

static const uint8_t BROADCAST[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

// Discovered nodes this session — a flat MAC list, capped at the physical max.
// This is deliberately NOT the pairing TargetMap (that binds MAC→court slot in a
// pairing round, the next increment); here we only prove who is on the air.
static Mac g_nodes[MAX_TARGETS];
static uint8_t g_node_count = 0;

// Arm-cycle state: drives Sync → Arm → (await Pressed) → advance, ROUND-ROBIN
// over every discovered node — so a bench of N targets proves the full hit path
// on each button in turn. Position = discovery index for now (0..N-1); binding
// positions to court slots is the pairing round, the next increment. The armed
// node advances on hit OR timeout, so one dead node can't wedge the cycle.
static uint32_t g_session_id = 0;
static bool g_synced = false;      // Sync sent for this session
static uint8_t g_cur = 0;          // round-robin index into g_nodes
static bool g_awaiting_hit = false;
static uint16_t g_seq = 0;         // step index, bumped per Arm
static uint64_t g_arm_us = 0;      // brain clock at the last Arm (reaction base)
static uint32_t g_next_arm_ms = 0; // when to Arm next (post-Sync / post-hit beat)
static uint32_t g_arm_deadline_ms = 0; // re-arm if no press by here

static constexpr uint32_t REARM_DELAY_MS = 1500;  // beat between hit and next Arm
static constexpr uint32_t ARM_TIMEOUT_MS = 15000; // missed-press safety re-arm

// Display state read by render_display: the last reaction shown in the status
// strip (-1 = none yet) and a brief green flash on the hit dot.
static double g_last_rt_ms = -1.0;
static uint32_t g_hit_flash_until = 0;
static constexpr uint32_t HIT_FLASH_MS = 300;

static bool mac_eq(const uint8_t* a, const Mac& b) {
  return memcmp(a, b.data(), 6) == 0;
}

// Returns true if this MAC is newly seen (added to the list); false if known or
// the list is full.
static bool remember_node(const uint8_t* mac) {
  for (uint8_t i = 0; i < g_node_count; i++)
    if (mac_eq(mac, g_nodes[i])) return false;
  if (g_node_count >= MAX_TARGETS) return false;
  memcpy(g_nodes[g_node_count].data(), mac, 6);
  g_node_count++;
  return true;
}

static bool add_peer(const uint8_t mac[6]) {
  if (esp_now_is_peer_exist(mac)) return true;
  esp_now_peer_info_t peer = {};
  memcpy(peer.peer_addr, mac, 6);
  peer.channel = ESPNOW_CHANNEL;
  peer.encrypt = false;
  return esp_now_add_peer(&peer) == ESP_OK;
}

// Surface an addressed tx that never reached its peer — a unicast Arm/Sync/Ping
// to a node that dropped off (a Pressed we're waiting on then simply never
// comes). Success is silent to keep the log readable; only a FAIL is news.
static void on_sent(const uint8_t* mac, esp_now_send_status_t status) {
  if (status == ESP_NOW_SEND_SUCCESS) return;
  Serial.printf("[tx-fail] -> %02x:%02x:%02x:%02x:%02x:%02x\n", mac[0], mac[1],
                mac[2], mac[3], mac[4], mac[5]);
}

static void send_ping(const uint8_t mac[6]) {
  Header ping = {PROTOCOL_VERSION, static_cast<uint8_t>(MsgType::Ping)};
  esp_now_send(mac, reinterpret_cast<const uint8_t*>(&ping), sizeof(ping));
}

// Broadcast the central clock so the node can map its local µs into this domain.
static void send_sync(const uint8_t mac[6], uint32_t session, uint64_t central_us) {
  Sync s = {};
  s.hdr.version = PROTOCOL_VERSION;
  s.hdr.type = static_cast<uint8_t>(MsgType::Sync);
  s.session_id = session;
  s.t_central_us = central_us;
  esp_now_send(mac, reinterpret_cast<const uint8_t*>(&s), sizeof(s));
}

static void send_arm(const uint8_t mac[6], uint32_t session, uint8_t position,
                     uint16_t seq) {
  Arm a = {};
  a.hdr.version = PROTOCOL_VERSION;
  a.hdr.type = static_cast<uint8_t>(MsgType::Arm);
  a.session_id = session;
  a.position = position;
  a.seq = seq;
  esp_now_send(mac, reinterpret_cast<const uint8_t*>(&a), sizeof(a));
}

static void handle_recv(const uint8_t* src, int rssi, const uint8_t* data,
                        int len) {
  MsgType type;
  if (!peek_header(data, static_cast<size_t>(len), type)) return; // reject junk
  switch (type) {
    case MsgType::Hello: {
      const Hello* h = reinterpret_cast<const Hello*>(data);
      const bool is_new = remember_node(src);
      Serial.printf("[%s] %02x:%02x:%02x:%02x:%02x:%02x rssi=%d fw=%u batt=%umV%s\n",
                    is_new ? "new " : "beat", src[0], src[1], src[2], src[3],
                    src[4], src[5], rssi, h->fw_version, h->batt_mv,
                    is_new ? "  (pinging back)" : "");
      if (is_new) {
        add_peer(src); // register before the first unicast to it
        send_ping(src);
      }
      break;
    }
    case MsgType::Pressed: {
      const Pressed* p = reinterpret_cast<const Pressed*>(data);
      // With several buttons on the bench, only the CURRENTLY armed step counts:
      // a press that lands after its timeout (or a duplicate) carries a stale
      // seq — log it as [late] so the operator sees it, but don't let it close
      // someone else's step.
      if (!g_awaiting_hit || p->seq != g_seq) {
        Serial.printf("[late] pos=%u seq=%u (armed seq=%u) — ignored\n",
                      p->position, p->seq, g_seq);
        break;
      }
      // Reaction = hit − arm, both in the brain's clock (target maps t_hit into
      // it via Sync). Guard a hit stamped before the arm (unsynced / stray).
      const double rt_ms =
          p->t_hit_us > g_arm_us ? (p->t_hit_us - g_arm_us) / 1000.0 : 0.0;
      Serial.printf("[hit] pos=%u seq=%u reaction=%.1fms sensor=%u\n", p->position,
                    p->seq, rt_ms, p->sensor);
      g_awaiting_hit = false;
      g_cur = (g_cur + 1) % (g_node_count ? g_node_count : 1); // next button
      g_next_arm_ms = millis() + REARM_DELAY_MS;
      g_last_rt_ms = rt_ms;                          // show it in the status strip
      g_hit_flash_until = millis() + HIT_FLASH_MS;   // flash the hit dot green
      break;
    }
    default:
      break; // Sync/Arm/Disarm/Ping are brain→target; ignore if echoed back
  }
}

#if ESP_ARDUINO_VERSION_MAJOR >= 3
static void on_recv(const esp_now_recv_info_t* info, const uint8_t* data,
                    int len) {
  handle_recv(info->src_addr, info->rx_ctrl ? info->rx_ctrl->rssi : 0, data, len);
}
#else
static void on_recv(const uint8_t* src, const uint8_t* data, int len) {
  handle_recv(src, 0, data, len);
}
#endif

// ── HUB75 display (ESP32-HUB75-MatrixPanel-DMA on MatrixPortal S3) ───────────
// Fixed MatrixPortal S3 HUB75 pin map (Adafruit) in this lib's i2s_pins order:
// r1,g1,b1, r2,g2,b2, a,b,c,d,e, lat,oe,clk.
//
// SCAN TYPE: the panel back silkscreen reads "P3(2121)64X64-32S" — 32S = a
// STANDARD 1/32-scan panel (2 rows lit per address, full A..E binary), NOT a
// four-scan one. So the plain 64x64 config below is correct; the four-scan
// VirtualMatrixPanel remap was the WRONG direction (it split the image into
// left/right halves — the width-doubling scrambling a normal panel). Reverted.
// The residual "content collapses to the top rows" fault is therefore an ADDRESS
// line not reaching the panel — the prime suspect on the MatrixPortal S3 is its
// ADDR-E solder jumper (routes E to HUB75 pin 8 OR pin 16; generic panels often
// need the other pad). That is hardware, verified separately before soldering.
static HUB75_I2S_CFG::i2s_pins DISP_PINS = {
    42, 41, 40, 38, 39, 37, // r1 g1 b1 r2 g2 b2
    45, 36, 48, 35, 21,     // a b c d e
    47, 14, 2,              // lat oe clk
};
static MatrixPanel_I2S_DMA* matrix = nullptr; // 64x64 1/32-scan panel
static bool g_display_ok = false;

// ── SOLO-SCAN ADDRESS DIAG (no DMA, no library) ─────────────────────────────
// Bit-bangs the panel directly so no library quirk is in the loop. A truly
// STATIC address probe turned out impossible on this panel: the TC7262 row
// driver has an anti-burn input-lockup self-check that BLANKS its outputs when
// the scan stops (protecting LEDs from a parked 100%-duty row) — every static
// mode read as a dead panel. So the refresh loop scans all 32 addresses
// continuously (keeping the chips alive) and selects a row by opening the OE
// window ONLY at the chosen scan position ("solo"). Address-bit health is read
// off which PHYSICAL row lights for each selected position.
//
// Serial (115200), single-character commands:
//   a b c d e  toggle that address bit     0  all bits low
//   s          print the current state     r  re-shift the pixel pattern
//   f          toggle FILL (every pixel red) vs sparse (every 8th)
//   w          toggle SCAN-ALL: bit-banged refresh over all 32 scan positions,
//              so the whole panel lights — the "is the panel alive at all" test
//   o          toggle OE by hand (rules out an OE-polarity surprise)
// Board buttons (MatrixPortal S3, active LOW): UP / DOWN step the selected scan
// position +1 / -1 — walking rows without touching the serial monitor. The
// 7→8 step is the D-bit crossing.
//
// Power: a full red row is ~128 LEDs ≈ 2.5 A instantaneous — far over a USB
// rail — so OE windows stay short (duty-capped). The panel therefore looks
// deliberately dim, brighter in solo than in scan-all; that's the USB power
// cap, not a fault.
//
// Expected on a healthy binary 1/32 panel: stepping the selected position
// 0→1→2… moves the lit row pair by one each step, and toggling A/B/C/D/E
// jumps it by 1/2/4/8/16. If crossing 7→8 (or toggling d) snaps back to the
// row for 0 instead of moving to 8, the D branch is dead inside the panel.
// OFF: display track is parked (clone board without level shifters + strict
// panel — awaiting the genuine MatrixPortal S3 + Adafruit #6484). Flip to 1 to
// boot the address probe again for the new panel's first flash.
#define DISPLAY_STATIC_DIAG 0
#if DISPLAY_STATIC_DIAG
namespace diag {

// Pin aliases from DISP_PINS, named for readability. PIN_-prefixed because
// Arduino's binary.h defines B0/B1/B10/... as macros, so a bare `B1` constant
// preprocesses into `1 = 40` and the whole block fails to compile.
constexpr int PIN_R1 = 42, PIN_G1 = 41, PIN_B1 = 40;
constexpr int PIN_R2 = 38, PIN_G2 = 39, PIN_B2 = 37;
constexpr int ADDR[5] = {45, 36, 48, 35, 21}; // A B C D E
constexpr int LAT = 47, OE = 14, CLK = 2;
// MatrixPortal S3 user buttons (per Adafruit board pinout): active LOW.
constexpr int PIN_BTN_UP = 6, PIN_BTN_DOWN = 7;

static bool bits[5] = {false, false, false, false, false};
static bool g_fill = false;     // false = every 8th pixel; true = EVERY pixel red
static bool g_scan_all = false; // refresh over all 32 scan positions (whole panel)
static bool g_oe_on = true;     // static modes: output enabled (o toggles)

static int scan_of_bits() {
  return (bits[0] ? 1 : 0) + (bits[1] ? 2 : 0) + (bits[2] ? 4 : 0) +
         (bits[3] ? 8 : 0) + (bits[4] ? 16 : 0);
}

static void write_addr(int scan) {
  for (int i = 0; i < 5; i++) digitalWrite(ADDR[i], (scan >> i) & 1 ? HIGH : LOW);
}

// Shift one row pattern into the column drivers. Sparse: every 8th pixel red
// on both halves. Fill: every pixel red on both halves.
//
// LATCH FIX: FM6124-family drivers sample LAT on the CLOCK edge — a bare LAT
// pulse with no clock never latches (which is how the fill/sparse patterns
// showed up swapped/stale on the panel). So LAT is raised DURING the last 3
// data clocks instead of pulsed after; that latches on FM6124 and still works
// on a plain latch-on-falling register.
static void shift_pattern() {
  digitalWrite(OE, HIGH); // blank while loading
  digitalWrite(PIN_G1, LOW);
  digitalWrite(PIN_B1, LOW);
  digitalWrite(PIN_G2, LOW);
  digitalWrite(PIN_B2, LOW);
  for (int x = 0; x < 64; x++) {
    const bool on = g_fill || (x % 8) == 0;
    digitalWrite(PIN_R1, on ? HIGH : LOW);
    digitalWrite(PIN_R2, on ? HIGH : LOW);
    if (x == 61) digitalWrite(LAT, HIGH); // overlap LAT with the last 3 clocks
    digitalWrite(CLK, HIGH);
    digitalWrite(CLK, LOW);
  }
  digitalWrite(LAT, LOW);
}

static void print_state() {
  const int scan = scan_of_bits();
  Serial.printf(
      "[diag] A=%d B=%d C=%d D=%d E=%d -> scan=%d (rows y=%d and y=%d) | fill=%d scan-all=%d oe=%d\n",
      (int)bits[0], (int)bits[1], (int)bits[2], (int)bits[3], (int)bits[4],
      scan, scan, scan + 32, (int)g_fill, (int)g_scan_all, (int)g_oe_on);
}

// Board-button row stepping: UP/DOWN move the selected scan position ±1 (mod
// 32) — serial-free debugging. A step exits scan-all into SOLO mode (the
// refresh keeps scanning; only the selected position gets an OE window).
static void step_scan(int dir) {
  if (g_scan_all) {
    g_scan_all = false;
    Serial.println("[diag] scan-all OFF (button step) — solo row");
  }
  const int scan = (scan_of_bits() + dir + 32) & 31;
  for (int i = 0; i < 5; i++) bits[i] = (scan >> i) & 1;
  print_state();
}

static void poll_buttons() {
  static bool prev_up = true, prev_dn = true;
  static uint32_t last_ms = 0;
  const bool up = digitalRead(PIN_BTN_UP) == HIGH;
  const bool dn = digitalRead(PIN_BTN_DOWN) == HIGH;
  if (millis() - last_ms >= 150) { // debounce + repeat cap
    if (!up && prev_up) { last_ms = millis(); step_scan(+1); }
    else if (!dn && prev_dn) { last_ms = millis(); step_scan(-1); }
  }
  prev_up = up;
  prev_dn = dn;
}

static void handle_key(int ch) {
  switch (ch) {
    case 'a': case 'b': case 'c': case 'd': case 'e': {
      const int i = ch - 'a';
      bits[i] = !bits[i];
      print_state();
      break;
    }
    case '0':
      for (bool& b : bits) b = false;
      print_state();
      break;
    case 'f':
      g_fill = !g_fill;
      shift_pattern(); // reload columns with the new pattern
      Serial.printf("[diag] fill %s\n", g_fill ? "ON (every pixel red)" : "OFF (sparse)");
      print_state();
      break;
    case 'w':
      g_scan_all = !g_scan_all;
      Serial.printf("[diag] scan-all %s\n",
                    g_scan_all ? "ON (whole panel, duty-capped)"
                               : "OFF (solo row — only the selected scan lights)");
      break;
    case 'o':
      g_oe_on = !g_oe_on;
      Serial.printf("[diag] OE %s\n", g_oe_on ? "ENABLED" : "BLANKED (no OE windows)");
      break;
    case 'r':
      shift_pattern();
      Serial.println("[diag] pattern reloaded");
      break;
    case 's':
      print_state();
      break;
    default:
      // Echo anything else (except line endings) so "are my keypresses even
      // reaching the board?" is answerable from the monitor alone.
      if (ch != '\r' && ch != '\n')
        Serial.printf("[diag] key 0x%02x ('%c') — unknown, ignored\n", ch,
                      (ch >= 32 && ch < 127) ? (char)ch : '?');
      break;
  }
}

static void setup() {
  const int outs[] = {PIN_R1, PIN_G1, PIN_B1, PIN_R2, PIN_G2, PIN_B2,
                      ADDR[0], ADDR[1], ADDR[2], ADDR[3], ADDR[4],
                      LAT, OE, CLK};
  for (int p : outs) {
    pinMode(p, OUTPUT);
    digitalWrite(p, LOW);
    // Max drive strength (40 mA vs the 20 mA default). Metered on the free
    // 16-pin header with the panel seated: the working address lines (B, E)
    // average ~2.0 V under the continuous scan, but A/C/D sag to ~1.13 V —
    // i.e. their HIGH level is loaded down to ~2.3 V. The TC7262 datasheet
    // wants VIH >= 3.0 V at VDD=5 V, so a sagged high never registers and
    // those bits read as dead. The S3's 3.3 V swing is borderline by design
    // (bom.md's 74AHCT245 level-shifter caveat); stronger drive may lift the
    // loaded highs back over the threshold without extra hardware.
    gpio_set_drive_capability((gpio_num_t)p, GPIO_DRIVE_CAP_3);
  }
  digitalWrite(OE, HIGH); // blanked until the pattern is loaded
  pinMode(PIN_BTN_UP, INPUT_PULLUP);
  pinMode(PIN_BTN_DOWN, INPUT_PULLUP);
  Serial.println("[diag] SOLO-SCAN ADDRESS PROBE — no DMA, pins bit-banged.");
  Serial.println("[diag] scan never stops (TC7262 blanks itself on frozen inputs); OE opens on the selected row only");
  Serial.println("[diag] keys: a/b/c/d/e bit, 0 all low, f fill, w scan-all, o OE, r reload, s state");
  Serial.println("[diag] board buttons: UP/DOWN step the selected row +-1");
  shift_pattern();
  print_state();
}

static void loop() {
  while (Serial.available()) handle_key(Serial.read());
  poll_buttons();

  // Heartbeat: the boot banner prints once, ~200 ms after reset — native
  // USB-CDC DROPS anything printed before the host actually opens the port,
  // so a monitor attached a moment later sees pure silence and the board
  // looks dead. A periodic line makes liveness unmissable regardless of when
  // the monitor attaches.
  static uint32_t last_beat = 0;
  if (millis() - last_beat >= 2000) {
    last_beat = millis();
    Serial.printf("[diag] alive t=%lus — keys: a/b/c/d/e bit, 0 low, f fill, "
                  "w scan-all, o OE, r reload, s state | UP/DOWN step row\n",
                  (unsigned long)(millis() / 1000));
  }

  // ONE bit-banged frame, ALWAYS scanning all 32 positions. The TC7262 row
  // driver has an anti-burn input-lockup self-check: if the address inputs
  // stop toggling it BLANKS its outputs (protecting LEDs from a parked
  // 100%-duty row) — which is exactly why every "hold the address static" mode
  // showed a dark panel. So the scan never stops; row SELECTION is done by
  // opening the OE window only at the chosen position (solo) or at every
  // position (scan-all). Duty stays capped for the USB rail.
  const int sel = scan_of_bits();
  const uint32_t on_us = g_fill ? 60 : 300;
  for (int s = 0; s < 32; s++) {
    write_addr(s);
    delayMicroseconds(5); // let the address settle before opening the window
    if (g_oe_on && (g_scan_all || s == sel)) {
      digitalWrite(OE, LOW);
      delayMicroseconds(on_us);
      digitalWrite(OE, HIGH);
    }
    delayMicroseconds(g_fill ? 60 : 20);
  }
}

} // namespace diag
#endif // DISPLAY_STATIC_DIAG

// Local RGB→565 so the draw code doesn't depend on which class exposes color565:
// the virtual panel is Adafruit_GFX-derived, and GFX has no color565 member.
static uint16_t rgb565(uint8_t r, uint8_t g, uint8_t b) {
  return (uint16_t)(((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3));
}

// Render one frame: a 12 px status strip (name + last reaction) over the 8-slot
// layout map. The currently armed node's dot tracks the live
// arm/hit state; the others are dim "off" markers so the court map still reads.
// Dim colours cap the panel draw for USB-bench power.
// DIAGNOSTIC E-line sweep — the single decisive test for "rows don't advance".
// ONE full-width white line steps down the panel a row every ~120 ms and wraps.
// Only one row is ever lit, so the draw is tiny (safe on USB — unlike a solid
// white fill, which on a P3 pulls several amps and browns the USB rail out, then
// itself looks like "only some rows light" and MISLEADS the diagnosis). A dim
// static column down the left edge and a mid marker give a fixed reference.
//
// Reading it:
//  - the line sweeps SMOOTHLY top→bottom across all 64 rows → the panel is fully
//    addressable, E works → the fault was mapping/config, NOT the jumper → do
//    NOT solder; retune in firmware.
//  - the line only ever appears in the TOP portion and never reaches the bottom
//    (or two lines fold onto the top) → the E address line never reaches the
//    panel → the MatrixPortal S3 E-jumper is on the wrong pad → soldering is
//    justified.
// Swap render_test → render_display in loop() once geometry is confirmed
// (DISPLAY_TEST below is the switch).
static void render_test() {
  if (!g_display_ok) return;
  matrix->fillScreen(0);
  // Fixed reference: a dim left-edge column spanning the full height, so the
  // eye has a "this is where row 0..63 should be" ruler even mid-sweep.
  const uint16_t D = rgb565(30, 30, 30);
  matrix->drawFastVLine(0, 0, PANEL_H, D);
  matrix->drawFastHLine(0, PANEL_H / 2, PANEL_W, D); // mid-height marker
  // The moving row — one bright white line, its Y stepping down over time.
  const int y = (int)((millis() / 120) % PANEL_H);
  matrix->drawFastHLine(0, y, PANEL_W, rgb565(180, 180, 180));
}

static void render_display() {
  if (!g_display_ok) return;
  const uint32_t now = millis();
  matrix->fillScreen(0);

  matrix->setTextColor(rgb565(220, 220, 220));
  matrix->setCursor(1, 2);
  matrix->print("ZD");
  if (g_last_rt_ms >= 0) {
    char buf[12];
    snprintf(buf, sizeof(buf), "%dms", (int)(g_last_rt_ms + 0.5));
    matrix->setCursor(PANEL_W - (int)strlen(buf) * 6, 2);
    matrix->print(buf);
  }

  for (uint8_t i = 0; i < MAX_TARGETS; i++) {
    const Point p = spot_xy(i);
    uint16_t col = rgb565(60, 60, 60); // unbound / off marker
    int half = 1;                                // every spot visible for now
    if (g_node_count > 0 && i == g_cur) { // dot of the currently armed node
      if (now < g_hit_flash_until) {
        col = rgb565(0, 255, 0); // hit flash (green)
        half = 2;
      } else if (g_awaiting_hit) {
        col = rgb565(90, 70, 255); // armed (accent)
        half = 2;
      } else {
        col = rgb565(180, 180, 180); // bound, idle (dim white)
        half = 1;
      }
    }
    matrix->fillRect(p.x - half, p.y - half, 2 * half + 1, 2 * half + 1, col);
  }
  // Single-buffered: the draw is live, no flush call needed.
}

void setup() {
  Serial.begin(115200);
  delay(200);

#if DISPLAY_STATIC_DIAG
  // Static probe ONLY: no radio, no DMA library — the fewest moving parts, so
  // whatever the panel does is the panel, not the driver stack. Flip the define
  // off to restore the normal radio + display firmware.
  diag::setup();
  return;
#endif

  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  esp_wifi_set_channel(ESPNOW_CHANNEL, WIFI_SECOND_CHAN_NONE);

  uint8_t mac[6] = {};
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  Serial.printf("[boot] brain mac=%02x:%02x:%02x:%02x:%02x:%02x ch=%u — listening\n",
                mac[0], mac[1], mac[2], mac[3], mac[4], mac[5], ESPNOW_CHANNEL);

  if (esp_now_init() != ESP_OK) {
    Serial.println("[fatal] esp_now_init failed");
    return;
  }
  esp_now_register_recv_cb(on_recv);
  esp_now_register_send_cb(on_sent); // report a unicast that never landed
  add_peer(BROADCAST);

  // Bring the panel up LAST, after the radio, so this one run also proves the
  // HUB75 output and ESP-NOW coexist on the S3 (the BOM's radio-coexistence
  // risk). A begin() failure is non-fatal: the radio cycle keeps running, so a
  // dead panel is told apart from a dead link in the serial log.
  // FINAL CONFIG per the chip markings read off the panel (UR8 = FM6124DJ
  // columns, U8 = TC7262FJ rows) + the TC7262 datasheet: the FM6124 columns are
  // plain shift registers (no init sequence — driver stays at the SHIFTREG
  // default; the FM6126A init was never needed), and the TC7262 row chip is a
  // purely COMBINATIONAL 74HC138-class 3-to-8 binary decoder with power FETs —
  // no clock, no data, no shift register. So the panel IS plain 5-bit binary
  // (TYPE138, the default) and every shift-register row mode (SM5266P/TYPE595)
  // was structurally wrong — their waveforms decoded on a binary panel exactly
  // reproduce the quarter-jump / stuck-at-0-and-32 sweeps that were observed.
  //
  // The REMAINING fault is HARDWARE: the connector position where binary D
  // (weight 8) belongs is GND on this panel — the real weight-8 input lives on
  // a nominally-GND HUB75 pin (16 or 4), so the board's D signal never reaches
  // the row chips. Signature (SM5266P run): lines snapped to 0/25/50/75% =
  // bits A..C + E acting, bit D dead. Fix is on the ribbon (route conductor 12
  // to the panel's real D pin) — nothing more to change in firmware.
  HUB75_I2S_CFG mxconfig(PANEL_W, PANEL_H, 1 /*chain*/, DISP_PINS);
  matrix = new MatrixPanel_I2S_DMA(mxconfig);
  g_display_ok = matrix->begin();
  if (g_display_ok) {
    matrix->setBrightness8(128); // ~50% — bench-readable; the sparse UI (text +
                                 // a few dots) keeps the draw small. Re-cap lower
                                 // for battery in the final build.
    matrix->clearScreen();
  }
  Serial.printf("[disp] hub75-dma begin=%d 64x64 binary/TYPE138 (%s)\n",
                (int)g_display_ok, g_display_ok ? "ok" : "FAILED");
}

void loop() {
#if DISPLAY_STATIC_DIAG
  diag::loop();
  return;
#endif

  const uint32_t now = millis();

  // Redraw at ~20 fps regardless of radio state, so the idle map shows before a
  // node is discovered and the armed/hit dot tracks the cycle after.
  // DIAGNOSTIC: flip to false once the calibration frame confirms the geometry,
  // and the normal court UI (render_display) resumes.
  static constexpr bool DISPLAY_TEST = true;
  static uint32_t last_render = 0;
  if (g_display_ok && now - last_render >= 50) {
    last_render = now;
    if (DISPLAY_TEST)
      render_test();
    else
      render_display();
  }

  if (g_node_count == 0) {
    delay(50); // nothing discovered yet — discovery is recv-callback driven
    return;
  }
  // Establish the clock once per session — to EVERY node found so far — then
  // let the targets record the offset for a beat before the first Arm. Nodes
  // that show up later are covered by the per-arm re-Sync below.
  if (!g_synced) {
    g_session_id++;
    for (uint8_t i = 0; i < g_node_count; i++)
      send_sync(g_nodes[i].data(), g_session_id,
                static_cast<uint64_t>(esp_timer_get_time()));
    g_synced = true;
    g_next_arm_ms = now + 500;
    Serial.printf("[sync] session=%u sent to %u node(s)\n", g_session_id,
                  g_node_count);
  }

  // Arm the next node in the round-robin when it's time and we're not already
  // waiting on a hit. Position = discovery index, echoed back in Pressed, so
  // the [hit] line identifies which button answered.
  if (!g_awaiting_hit && static_cast<int32_t>(now - g_next_arm_ms) >= 0) {
    g_cur %= g_node_count; // a node may have joined since the last wrap
    const uint8_t* node = g_nodes[g_cur].data();
    g_seq++;
    // Re-Sync the armed node's clock on every arm: a target that rebooted (the
    // C3 USB-CDC reset) lost its offset, so an Arm without a fresh Sync would
    // stamp t_hit in the node's own domain and the reaction would read 0. One
    // tiny extra packet keeps the hit timestamp comparable across a node reset.
    send_sync(node, g_session_id, static_cast<uint64_t>(esp_timer_get_time()));
    g_arm_us = static_cast<uint64_t>(esp_timer_get_time());
    send_arm(node, g_session_id, g_cur /*position*/, g_seq);
    g_awaiting_hit = true;
    g_arm_deadline_ms = now + ARM_TIMEOUT_MS;
    Serial.printf(
        "[arm] node%u/%u %02x:%02x:%02x:%02x:%02x:%02x seq=%u — press ITS "
        "BOOT button\n",
        g_cur, g_node_count, node[0], node[1], node[2], node[3], node[4],
        node[5], g_seq);
  }

  // A missed press must not wedge the cycle: on timeout move on to the NEXT
  // node, so one unplugged/dead button costs one 15 s window, not the session.
  if (g_awaiting_hit && static_cast<int32_t>(now - g_arm_deadline_ms) >= 0) {
    Serial.printf("[arm] timeout node%u seq=%u — no hit, advancing\n", g_cur,
                  g_seq);
    g_awaiting_hit = false;
    g_cur = (g_cur + 1) % g_node_count;
    g_next_arm_ms = now;
  }

  delay(10);
}
