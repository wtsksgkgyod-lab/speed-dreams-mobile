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
source.write_text(body)
print(f"Applied Speed Dreams Mobile native input bridge: {source}")
