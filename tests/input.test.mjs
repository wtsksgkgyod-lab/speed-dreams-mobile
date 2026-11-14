import test from 'node:test';
import assert from 'node:assert/strict';
import {MobileControls,PointerOwnership,clamp} from '../web/core.mjs';

test('normalized analog inputs clamp and reject NaN',()=>{
  const s=new MobileControls();
  s.setAxis('steering',2.7);s.setAxis('throttle',-5);s.setAxis('brake',.58);
  assert.deepEqual(s.snapshot().slice(0,3),[1,0,.58]);
  s.setAxis('steering',NaN);assert.equal(s.steering,0);
  assert.equal(clamp(Infinity,0,1),0);
});
test('shift counters only increment for active sequential manual',()=>{
  const s=new MobileControls();s.shift('up');assert.equal(s.upSeq,0);
  s.enabled=true;s.shift('up');assert.equal(s.upSeq,0);
  s.automatic=false;s.shift('up');s.shift('up');s.shift('down');
  assert.deepEqual(s.snapshot().slice(3),[0,2,1]);
});
test('multitouch captures one unique pointer per control',()=>{
  const s=new MobileControls();const p=new PointerOwnership(s);
  assert.equal(p.acquire('throttle',7),true);
  assert.equal(p.acquire('brake',7),false);
  assert.equal(p.acquire('throttle',8),false);
  assert.equal(p.acquire('brake',8),true);
  s.setAxis('throttle',.6);s.setAxis('brake',.3);
  assert.equal(p.release('throttle',8),false);
  assert.equal(s.throttle,.6);
  assert.equal(p.release('throttle',7),true);
  assert.equal(s.throttle,0);
  p.releaseAll();assert.equal(s.brake,0);assert.equal(p.owner.size,0);
});
test('lost focus failsafe releases all pedals and steering',()=>{
  const s=new MobileControls();const p=new PointerOwnership(s);
  s.enabled=true;s.setAxis('steering',-.6);s.setAxis('throttle',1);s.setAxis('brake',.2);
  p.acquire('steering',1);p.acquire('throttle',2);p.releaseAll();
  assert.deepEqual(s.snapshot().slice(0,3),[0,0,0]);
});
