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
    p=Path(t)/'rthumandriver.cpp';p.write_text(SAMPLE)
    subprocess.run([sys.executable,str(SCRIPT),str(p)],check=True,capture_output=True)
    after=p.read_text()
    assert 'wg_mobile_set_controls' in after
    assert 'sd_mobile::useControls(car)' in after
    assert 'sd_mobile::changeGear(car)' in after
    assert 'HumanDriver::drive_at' in after
    second=subprocess.run([sys.executable,str(SCRIPT),str(p)],capture_output=True)
    assert second.returncode!=0
print('PASS: native patch anchor + idempotency test')
