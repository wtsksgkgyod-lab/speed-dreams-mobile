import test from 'node:test';
import assert from 'node:assert/strict';
import {PackManager} from '../web/packs.mjs';

function fixture() {
  const e=new TextEncoder(),name=e.encode('data/config/probe.txt'),data=e.encode('a');
  let c=0xffffffff;
  for(const byte of data){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^(c&1?0xedb88320:0);}
  const crc=(c^0xffffffff)>>>0;
  const buf=new Uint8Array(30+name.length+1+46+name.length+22);
  const view=new DataView(buf.buffer);
  let pos=0;
  const put16=v=>{view.setUint16(pos,v,true);pos+=2;};
  const put32=v=>{view.setUint32(pos,v,true);pos+=4;};
  const copy=a=>{buf.set(a,pos);pos+=a.length;};
  put32(0x04034b50);put16(20);put16(0);put16(0);put16(0);put16(0);
  put32(crc);put32(1);put32(1);put16(name.length);put16(0);copy(name);copy(data);
  const center=pos;
  put32(0x02014b50);put16(20);put16(20);put16(0);put16(0);put16(0);put16(0);
  put32(crc);put32(1);put32(1);put16(name.length);put16(0);put16(0);put16(0);put16(0);put32(0);put32(0);copy(name);
  const centerLength=pos-center;
  put32(0x06054b50);put16(0);put16(0);put16(1);put16(1);put32(centerLength);put32(center);put16(0);
  return buf;
}
test('on-demand game packs are queued to bound peak concurrent in-memory downloads',async()=>{
  const zip=fixture(),original=globalThis.fetch;
  const calls=[],fs={mkdirTree(){},writeFile(){}};
  let concurrent=0,peak=0;
  globalThis.fetch=async(url)=>{
    calls.push(url);concurrent++;peak=Math.max(peak,concurrent);
    await new Promise(r=>setTimeout(r,4));
    concurrent--;
    return {ok:true,arrayBuffer:async()=>zip.slice().buffer};
  };
  try {
    const manifest={packs:Object.fromEntries(['a','b','c','d'].map(id=>[id,{url:'/data/'+id+'.zip',bytes:zip.length}])),packPaths:{}};
    const mgr=new PackManager(manifest,fs,()=>{},{maxConcurrent:1});
    assert.deepEqual((await Promise.all(['a','b','c','d'].map(id=>mgr.load(id)))).map(x=>x.installed),[1,1,1,1]);
    assert.equal(peak,1);
    assert.equal(calls.length,4);
    assert.equal(mgr.getMetrics().length,4);
    assert(mgr.getMetrics().every(x=>x.files===1 && x.bytes===zip.length));
  }finally{globalThis.fetch=original;}
});
test('invalid pack concurrency limits are rejected',()=>{
  assert.throws(()=>new PackManager({packs:{}},{},()=>{},{maxConcurrent:0}),RangeError);
});
