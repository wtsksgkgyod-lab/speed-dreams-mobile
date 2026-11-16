import test from 'node:test';
import assert from 'node:assert/strict';
import {applyMobileGraphicsProfile} from '../web/graphics-profile.mjs';
const original=[
'<params><section name="Graphic">',
'<attnum name="LOD Factor" val="1"/>',
'<attnum name="sky dome distance" val="12000"/>',
'<attstr name="dynamic sky dome" val="enabled"/>',
'<attnum name="cloudlayer" val="1"/>',
'<attstr name="background skydome" val="enabled"/>',
'<attnum name="visibility" val="10000"/>',
'<attstr name="shadow type" val="light shadowmap"/>',
'</section></params>'].join('\n');
function fileSystem(){
  let doc=original,writes=0;
  const fs={readFile(path){assert.equal(path,'/data/config/graph.xml');return doc;},
    writeFile(path,data){assert.equal(path,'/data/config/graph.xml');doc=data;writes++;}};
  return {fs,read:()=>doc,writes:()=>writes};
}
test('mobile graphics preset reduces draw costs but retains native XML structure',()=>{
  const x=fileSystem(),result=applyMobileGraphicsProfile(x.fs);
  assert.equal(result.applied,true);
  assert.equal(result.previous['sky dome distance'],'12000');
  assert.match(x.read(),/name="LOD Factor" val="0.40"/);
  assert.match(x.read(),/name="visibility" val="1200"/);
  assert.match(x.read(),/name="dynamic sky dome" val="disabled"/);
  assert.match(x.read(),/name="shadow type" val="shadow static"/);
  assert.equal(x.writes(),1);
});
test('control build retains original graphics settings',()=>{
  const x=fileSystem();assert.equal(applyMobileGraphicsProfile(x.fs,{enabled:false}).applied,false);
  assert.equal(x.read(),original);assert.equal(x.writes(),0);
});
test('fail closed if required options disappear',()=>{
  const x=fileSystem();
  assert.throws(()=>applyMobileGraphicsProfile({readFile(){return '<params><section name="Graphic">bad</section></params>'},writeFile(){throw Error('must not write')}}),/Unexpected original/);
  assert.equal(x.writes(),0);
});
