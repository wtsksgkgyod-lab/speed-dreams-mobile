import test from 'node:test';
import assert from 'node:assert/strict';
import {InputPublisher,AdaptiveResolution,initialRenderScale,frameStats} from '../web/perf.mjs';

test('unchanged touch input skips redundant WASM control transfers',()=>{
  const messages=[],p=new InputPublisher((...values)=>messages.push(values));
  const neutral=[0,0,0,1,0,0];
  assert.equal(p.publish(neutral),true);
  for(let i=0;i<120;i++)assert.equal(p.publish(neutral),false);
  assert.equal(p.transfers,1);
  assert.equal(p.skips,120);
  assert.equal(p.publish([-.3,.8,0,1,0,0]),true);
  assert.equal(p.transfers,2);
  assert.deepEqual(messages.at(-1),[-.3,.8,0,1,0,0]);
  assert.equal(p.publish(neutral,true),true);
  assert.equal(p.transfers,3);
  p.reset();
  assert.equal(p.publish(neutral),true);
});
test('native bridge exceptions do not poison input cache',()=>{
  let n=0;
  const p=new InputPublisher(()=>{if(++n===1)throw new Error('temporary failure')});
  assert.throws(()=>p.publish([0,0,0,1,0,0]),/temporary/);
  assert.equal(p.publish([0,0,0,1,0,0]),true);
  assert.equal(n,2);
  assert.throws(()=>p.publish([NaN,0,0,1,0,0]),TypeError);
});
test('small touch devices get a bounded conservative initial resolution',()=>{
  assert.equal(initialRenderScale({touch:true,width:667,memoryGiB:2}),.7);
  assert.equal(initialRenderScale({touch:true,width:667,memoryGiB:null}),.78);
  assert.equal(initialRenderScale({touch:false,width:1920}),.85);
});
test('auto resolution avoids thrashing on one-off slow frames',()=>{
  const gov=new AdaptiveResolution(.78);
  for(let i=0;i<5;i++)assert.equal(gov.update({fps:20,now:1000*i}),null);
  assert.equal(gov.scale,.78);
  assert.equal(gov.update({fps:60,now:5000}),null); // interrupts slow streak
  for(let i=0;i<6;i++)gov.update({fps:20,now:6000+i*1000});
  assert.equal(gov.scale,.72);
  for(let i=0;i<6;i++)gov.update({fps:20,now:12000+i*1000});
  assert.equal(gov.scale,.72); // >=9 seconds since last change required
  gov.update({fps:20,now:20000});
  assert.equal(gov.scale,.66); // sustained pressure after the 9s cooldown
});
test('unreliable page RAF does not automatically upscale actual simulator rendering',()=>{
  const gov=new AdaptiveResolution(.75);
  for(let i=0;i<35;i++)assert.equal(gov.update({fps:60,now:1000*i}),null);
  assert.equal(gov.scale,.75);
  gov.update({fps:0,now:35000,active:false});
  assert.equal(gov.scale,.75);
});
test('frame proxy stats expose p95 without claiming GPU timing',()=>{
  const data=[12,15,17,16,40];
  const stats=frameStats(data);
  assert.equal(stats.samples,5);
  assert.equal(stats.meanMs,20);
  assert.equal(stats.p95Ms,40);
  assert.equal(stats.worstMs,40);
  assert.equal(frameStats([]).samples,0);
});
