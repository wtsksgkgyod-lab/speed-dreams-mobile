#!/usr/bin/env python3
"""Apply a checked, fail-closed patch to the pinned Speed Dreams upstream file.

Use only after wasmgame/speeddreams.diff has been applied to its upstream tree.
The file is intentionally modified in place; upstream commit remains pinned.
"""
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent.parent
source = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path("/nonexistent")
assert source.exists(), f"Missing original human driver: {source}"
body = source.read_text()
if "SPEED DREAMS MOBILE: isolated" in body:
    raise SystemExit("Native mobile patch already applied (refusing double application)")

def add_once(anchor, replacement):
    global body
    count = body.count(anchor)
    if count != 1:
        raise RuntimeError(f"Expected ONE patch anchor, found {count}: {anchor[:80]}")
    body = body.replace(anchor, replacement, 1)

# Insert after the baseline's actual control-reader globals, before common_drive.
bridge = (HERE / "native/mobile_bridge.inc").read_text()
add_once('static void common_drive(const int index, tCarElt* car, tSituation *s)',
         bridge + '\nstatic void common_drive(const int index, tCarElt* car, tSituation *s)')

# The override occurs before the ORIGINAL auto clutch, ABS and traction control.
# We do not overwrite these safety/drivetrain routines after they have run.
add_once('    // Linear delay of autoclutch\n', '''#ifdef __EMSCRIPTEN__
    if (sd_mobile::state.enabled) sd_mobile::useControls(car);
    sd_mobile::state.kph = (float)fabs(car->_speed_x * 3.6);
    sd_mobile::state.rpm = (float)(car->_enginerpm * 60.0 / (2.0 * 3.141592653589793));
    sd_mobile::state.gear = car->_gear;
#endif
    // Linear delay of autoclutch
''')

mt_anchor = '''void HumanDriver::drive_mt(int index, tCarElt* car, tSituation *s)
{
    const int idx = index - 1;
'''
add_once(mt_anchor, '''void HumanDriver::drive_mt(int index, tCarElt* car, tSituation *s)
{
#ifdef __EMSCRIPTEN__
    if (sd_mobile::state.enabled && sd_mobile::state.automatic) {
        drive_at(index, car, s);
        return;
    }
#endif
    const int idx = index - 1;
''')
mt_common = '''    common_drive(index, car, s);

    //Can it be left out? car->_gearCmd = car->_gear;'''
add_once(mt_common, '''    common_drive(index, car, s);
#ifdef __EMSCRIPTEN__
    if (sd_mobile::state.enabled && !sd_mobile::state.automatic) {
        sd_mobile::changeGear(car);
        // Touch has no clutch pedal. Reuse the ORIGINAL auto-clutch model.
        if (car->_clutchCmd == 0.0f)
            car->_clutchCmd = getAutoClutch(idx, car->_gear, car->_gearCmd, car);
        common_brake(idx, car, s);
        return;
    }
#endif

    //Can it be left out? car->_gearCmd = car->_gear;''')

at_anchor = '''void HumanDriver::drive_at(int index, tCarElt* car, tSituation *s)
{
    const int idx = index - 1;
'''
add_once(at_anchor, '''void HumanDriver::drive_at(int index, tCarElt* car, tSituation *s)
{
#ifdef __EMSCRIPTEN__
    if (sd_mobile::state.enabled && !sd_mobile::state.automatic) {
        drive_mt(index, car, s);
        return;
    }
#endif
    const int idx = index - 1;
#ifdef __EMSCRIPTEN__
    if (sd_mobile::state.enabled) HCtx[idx]->manual = false;
#endif
''')
# The original pre-race dialog (tires/fuel + Enter-to-start banner) is
# implemented in LegacyMenu, not in the HumanDriver input bridge.
# Browser-created KeyboardEvent is not guaranteed to reach SDL on Safari,
# so export an explicit native entry point to the SAME original menu callback.
# This preserves the original race configuration, pause state and physics.
race_source = source.parents[2] / "modules/userinterface/legacymenu/racescreens/racerunningmenus.cpp"
assert race_source.exists(), f"Missing pinned race running menu: {race_source}"
race_body = race_source.read_text()
if "SPEED DREAMS MOBILE: native pre-race confirmation" in race_body:
    raise SystemExit("Native pre-race confirmation already applied (refusing double application)")
race_anchor = 'static void\\nrmCloseCfg(void * /* dummy */)\\n{'.replace('\\n', '\n')
assert race_body.count(race_anchor) == 1, "Pinned LegacyMenu pre-race callback anchor not unique"
race_bridge = """// SPEED DREAMS MOBILE: native pre-race confirmation for touch browsers.
// Invoke the SAME callback as Enter/joystick from the original LegacyMenu.
// Do not simulate a browser keyboard event: iOS Safari can reject that path.
#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
extern "C" EMSCRIPTEN_KEEPALIVE int wg_mobile_prerace_waiting()
{
    return rmScreenHandle && rmPreRacePause ? 1 : 0;
}
extern "C" EMSCRIPTEN_KEEPALIVE int wg_mobile_confirm_prerace()
{
    if (!rmScreenHandle || !rmPreRacePause)
        return 0;
    RmReadyToRace(nullptr);
    return 1;
}
#endif

"""
race_body = race_body.replace(race_anchor, race_bridge + race_anchor, 1)

# Profile the real race loop, not the DOM requestAnimationFrame proxy.
# This lets actual Safari hardware distinguish sim/AI CPU from native PLIB/GL4ES
# draw calls and browser GPU submission. The optional no-render trial never
# changes physics and is automatically restored by the browser diagnostic UI.
perf_anchor = """static void
rmUpdateRaceEngine(unsigned ms, void *)
{
    LmRaceEngine().updateState(ms);
}"""
assert race_body.count(perf_anchor) == 1, "Missing pinned native race update callback"
perf_code = """#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
namespace sd_mobile_perf {
  static bool graphics_enabled = true;
  static double sim_total_ms = 0, draw_total_ms = 0, gui_total_ms = 0, swap_total_ms = 0;
  static unsigned sim_calls = 0, draw_frames = 0;
  static double clock() { return emscripten_get_now(); }
}
extern "C" EMSCRIPTEN_KEEPALIVE void wg_mobile_perf_set_graphics(int enabled) {
  sd_mobile_perf::graphics_enabled = enabled != 0;
}
extern "C" EMSCRIPTEN_KEEPALIVE int wg_mobile_perf_graphics_enabled() {
  return sd_mobile_perf::graphics_enabled ? 1 : 0;
}
extern "C" EMSCRIPTEN_KEEPALIVE double wg_mobile_perf_sim_total_ms() {return sd_mobile_perf::sim_total_ms;}
extern "C" EMSCRIPTEN_KEEPALIVE double wg_mobile_perf_draw_total_ms() {return sd_mobile_perf::draw_total_ms;}
extern "C" EMSCRIPTEN_KEEPALIVE double wg_mobile_perf_gui_total_ms() {return sd_mobile_perf::gui_total_ms;}
extern "C" EMSCRIPTEN_KEEPALIVE double wg_mobile_perf_swap_total_ms() {return sd_mobile_perf::swap_total_ms;}
extern "C" EMSCRIPTEN_KEEPALIVE int wg_mobile_perf_sim_calls() {return (int)sd_mobile_perf::sim_calls;}
extern "C" EMSCRIPTEN_KEEPALIVE int wg_mobile_perf_draw_frames() {return (int)sd_mobile_perf::draw_frames;}
#endif
"""
perf_replacement = perf_code + """static void
rmUpdateRaceEngine(unsigned ms, void *)
{
#ifdef __EMSCRIPTEN__
    const double started = sd_mobile_perf::clock();
#endif
    LmRaceEngine().updateState(ms);
#ifdef __EMSCRIPTEN__
    sd_mobile_perf::sim_total_ms += sd_mobile_perf::clock() - started;
    ++sd_mobile_perf::sim_calls;
#endif
}"""
race_body = race_body.replace(perf_anchor, perf_replacement, 1)
# In the race display loop, guard ONLY 3D drawing. Never disable race
# updates or original GUI state changes.
display_anchor = """\tconst bool bUpdateGraphics =
\t\tLmRaceEngine().outData()->_displayMode == RM_DISP_MODE_NORMAL
\t\t&& !bPitRequested && LegacyMenu::self().graphicsEngine();"""
assert race_body.count(display_anchor)==1, "Native race display guard changed"
race_body=race_body.replace(display_anchor, """\tconst bool bUpdateGraphics =
#ifdef __EMSCRIPTEN__
        sd_mobile_perf::graphics_enabled &&
#endif
\t\tLmRaceEngine().outData()->_displayMode == RM_DISP_MODE_NORMAL
\t\t&& !bPitRequested && LegacyMenu::self().graphicsEngine();""",1)
draw_anchor = "\t\tLegacyMenu::self().redrawGraphicsView(LmRaceEngine().outData()->s);"
assert race_body.count(draw_anchor)==1, "Native graphics callback changed"
race_body=race_body.replace(draw_anchor,"""#ifdef __EMSCRIPTEN__
        const double started = sd_mobile_perf::clock();
#endif
""" + draw_anchor + """
#ifdef __EMSCRIPTEN__
        sd_mobile_perf::draw_total_ms += sd_mobile_perf::clock()-started;
        ++sd_mobile_perf::draw_frames;
#endif""",1)
gui_anchor = """\tif (bUpdateGraphics || rmbMenuChanged)
\t\tGfuiRedraw();"""
assert race_body.count(gui_anchor)==1, "Native GUI callback changed"
race_body=race_body.replace(gui_anchor,"""\tif (bUpdateGraphics || rmbMenuChanged) {
#ifdef __EMSCRIPTEN__
        const double started = sd_mobile_perf::clock();
#endif
        GfuiRedraw();
#ifdef __EMSCRIPTEN__
        sd_mobile_perf::gui_total_ms += sd_mobile_perf::clock()-started;
#endif
    }""",1)
swap_anchor = """\tif (bUpdateGraphics || rmbMenuChanged)
\t\tGfuiSwapBuffers();"""
assert race_body.count(swap_anchor)==1, "Native swap callback changed"
race_body=race_body.replace(swap_anchor,"""\tif (bUpdateGraphics || rmbMenuChanged) {
#ifdef __EMSCRIPTEN__
        const double started = sd_mobile_perf::clock();
#endif
        GfuiSwapBuffers();
#ifdef __EMSCRIPTEN__
        sd_mobile_perf::swap_total_ms += sd_mobile_perf::clock()-started;
#endif
    }""",1)

source.write_text(body)
race_source.write_text(race_body)
print(f"Applied Speed Dreams Mobile native input bridge: {source}")
print(f"Applied native pre-race confirmation to pinned LegacyMenu: {race_source}")
