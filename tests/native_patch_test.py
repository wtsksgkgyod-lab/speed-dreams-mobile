"""Patch anchor and idempotency smoke test; does NOT compile C++ engine."""
from pathlib import Path
import subprocess,tempfile,sys
SCRIPT=Path(__file__).resolve().parent.parent/'scripts/apply_native.py'
SAMPLE='''
static void common_drive(const int index, tCarElt* car, tSituation *s)
{
    // Linear delay of autoclutch
}
void HumanDriver::drive_mt(int index, tCarElt* car, tSituation *s)
{
    const int idx = index - 1;
    common_drive(index, car, s);

    //Can it be left out? car->_gearCmd = car->_gear;
}
void HumanDriver::drive_at(int index, tCarElt* car, tSituation *s)
{
    const int idx = index - 1;
    common_drive(index, car, s);
}
'''
with tempfile.TemporaryDirectory() as t:
    p=Path(t)/'src/drivers/human/rthumandriver.cpp'
    p.parent.mkdir(parents=True)
    p.write_text(SAMPLE)
    racing=Path(t)/'src/modules/userinterface/legacymenu/racescreens/racerunningmenus.cpp'
    racing.parent.mkdir(parents=True)
    racing.write_text('''static void* rmScreenHandle;
static bool rmPreRacePause;
static void RmReadyToRace(void*) {}
static void
rmUpdateRaceEngine(unsigned ms, void *)
{
    LmRaceEngine().updateState(ms);
}
static void
rmRedisplay()
{
	const bool bUpdateGraphics =
		LmRaceEngine().outData()->_displayMode == RM_DISP_MODE_NORMAL
		&& !bPitRequested && LegacyMenu::self().graphicsEngine();
	if (bUpdateGraphics)
	{
		LegacyMenu::self().redrawGraphicsView(LmRaceEngine().outData()->s);
	}
	if (bUpdateGraphics || rmbMenuChanged)
		GfuiRedraw();
	if (bUpdateGraphics || rmbMenuChanged)
		GfuiSwapBuffers();
}
static void
rmCloseCfg(void * /* dummy */)
{
    RmReadyToRace(NULL);
}
''')
    subprocess.run([sys.executable,str(SCRIPT),str(p)],check=True,capture_output=True)
    after=p.read_text()
    race_after=racing.read_text()
    assert 'wg_mobile_prerace_waiting' in race_after
    assert 'wg_mobile_confirm_prerace' in race_after
    assert 'RmReadyToRace(nullptr)' in race_after
    assert 'rmScreenHandle && rmPreRacePause' in race_after
    assert 'wg_mobile_perf_sim_total_ms' in race_after
    assert 'wg_mobile_perf_draw_total_ms' in race_after
    assert 'wg_mobile_perf_set_graphics' in race_after
    assert 'sd_mobile_perf::graphics_enabled' in race_after
    assert 'wg_mobile_set_controls' in after
    assert 'sd_mobile::useControls(car)' in after
    assert 'sd_mobile::changeGear(car)' in after
    assert 'HumanDriver::drive_at' in after
    second=subprocess.run([sys.executable,str(SCRIPT),str(p)],capture_output=True)
    assert second.returncode!=0
print('PASS: native patch anchor + idempotency test')
