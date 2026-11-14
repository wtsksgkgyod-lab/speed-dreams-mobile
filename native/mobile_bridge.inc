// SPEED DREAMS MOBILE: isolated WebAssembly-only human-driver input bridge.
// Compiled inside rthumandriver.cpp after the original wasm port patch.
// Does not change simuv5, tyres, physics integration, or AI drivers.
#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#include <cmath>
#include <cstdint>
#include <climits>

namespace sd_mobile {
struct Controls {
    bool enabled = false;
    bool automatic = true;
    float steering = 0.0f;
    float throttle = 0.0f;
    float brake = 0.0f;
    uint32_t upSeq = 0, downSeq = 0;
    unsigned queuedUp = 0, queuedDown = 0;
    int waitingForGear = INT_MIN;
    float kph = 0.0f, rpm = 0.0f;
    int gear = 0;
};
static Controls state;
static float clamp(float v, float lo, float hi) {
    return !std::isfinite(v) ? 0.0f : (v < lo ? lo : (v > hi ? hi : v));
}
static void appendEvents(unsigned &queue, uint32_t newSeq, uint32_t &previous) {
    const uint32_t delta = newSeq - previous; // wrap-safe unsigned sequence
    previous = newSeq;
    // Prevent a corrupt or reset JS counter from issuing hundreds of shifts.
    if (delta > 0 && delta <= 4) queue = (queue + delta > 4 ? 4 : queue + delta);
}
static void useControls(tCarElt* car) {
    if (!state.enabled) return;
    // Original HumanDriver uses LEFT=positive and RIGHT=negative.
    // The touch pad naturally reports left=-1 and right=+1.
    car->_steerCmd = -state.steering;
    car->_accelCmd = state.throttle;
    car->_brakeCmd = state.brake;
}
static void changeGear(tCarElt* car) {
    // The physical gearbox needs time to complete a shift. Do not consume
    // a second touch event until the requested gear has actually engaged.
    if (state.waitingForGear != INT_MIN) {
        if (car->_gear != state.waitingForGear) return;
        state.waitingForGear = INT_MIN;
    }
    const int from = car->_gear;
    int target = from;
    if (state.queuedUp) {
        --state.queuedUp;
        if (from == -1) target = 1;
        else if (from < car->_gearNb - 1) target = from + 1;
    } else if (state.queuedDown) {
        --state.queuedDown;
        if (from > 1) target = from - 1;
    }
    if (target != from) {
        car->_gearCmd = target;
        state.waitingForGear = target;
    }

}
}

extern "C" EMSCRIPTEN_KEEPALIVE void wg_mobile_enable(int active) {
    sd_mobile::state.enabled = active != 0;
    if (!active) {
        sd_mobile::state.steering = sd_mobile::state.throttle = sd_mobile::state.brake = 0;
        sd_mobile::state.queuedUp = sd_mobile::state.queuedDown = 0;
        sd_mobile::state.waitingForGear = INT_MIN;
    }
}
extern "C" EMSCRIPTEN_KEEPALIVE void wg_mobile_set_controls(
        float steering, float throttle, float brake, int automatic, int shiftUpSeq, int shiftDownSeq) {
    auto &s = sd_mobile::state;
    s.steering = sd_mobile::clamp(steering, -1, 1);
    s.throttle = sd_mobile::clamp(throttle, 0, 1);
    s.brake = sd_mobile::clamp(brake, 0, 1);
    s.automatic = automatic != 0;
    sd_mobile::appendEvents(s.queuedUp, static_cast<uint32_t>(shiftUpSeq), s.upSeq);
    sd_mobile::appendEvents(s.queuedDown, static_cast<uint32_t>(shiftDownSeq), s.downSeq);
    if (s.automatic) { s.queuedUp = s.queuedDown = 0; s.waitingForGear = INT_MIN; }
}
extern "C" EMSCRIPTEN_KEEPALIVE void wg_mobile_release_all() {
    auto &s = sd_mobile::state;
    s.steering = s.throttle = s.brake = 0;
    s.queuedUp = s.queuedDown = 0;
    s.waitingForGear = INT_MIN;
}
extern "C" EMSCRIPTEN_KEEPALIVE float wg_mobile_speed_kph() { return sd_mobile::state.kph; }
extern "C" EMSCRIPTEN_KEEPALIVE float wg_mobile_engine_rpm() { return sd_mobile::state.rpm; }
extern "C" EMSCRIPTEN_KEEPALIVE int wg_mobile_gear() { return sd_mobile::state.gear; }
#endif
