// Contract test for the standalone mobile bridge. Not the actual game build.
#include <cassert>
#include <cmath>
struct tCarElt {
  float _steerCmd = 0, _accelCmd = 0, _brakeCmd = 0;
  int _gear = 1, _gearNb = 6, _gearCmd = 1;
};
#define __EMSCRIPTEN__ 1
#include "../native/mobile_bridge.inc"
int main(){
  tCarElt car;
  wg_mobile_enable(1);
  wg_mobile_set_controls(2.0f,1.5f,-2.0f,0,2,0);
  sd_mobile::useControls(&car);
  assert(car._steerCmd==-1 && car._accelCmd==1 && car._brakeCmd==0);
  sd_mobile::changeGear(&car);
  assert(car._gearCmd==2);
  sd_mobile::changeGear(&car); // second shift cannot preempt physical gearbox
  assert(car._gearCmd==2);
  car._gear=2; sd_mobile::changeGear(&car); // now gear 2 engaged
  assert(car._gearCmd==3);
  wg_mobile_set_controls(NAN,.5f,.75f,0,2,0);
  sd_mobile::useControls(&car);
  assert(car._steerCmd==0 && car._accelCmd==.5f && car._brakeCmd==.75f);
  wg_mobile_release_all();
  sd_mobile::useControls(&car);
  assert(car._accelCmd==0 && car._brakeCmd==0);
  wg_mobile_enable(0);
  assert(!sd_mobile::state.enabled);
}
