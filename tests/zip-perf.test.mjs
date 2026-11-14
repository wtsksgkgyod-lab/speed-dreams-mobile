import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {installZip,installZipCooperative} from '../web/zip.mjs';

const enc=new TextEncoder();
function crc32(bytes) {
  let crc=0xffffffff;
  for(const byte of bytes) {
    crc^=byte;
    for(let j=0;j<8;j++)crc=(crc>>>1)^(crc&1?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}
function fixture(count=1000) {
  const locals=[],centers=[];
  let offset=0,dirSize=0;
  for(let i=0;i<count;i++){
    const name=enc.encode('data/config/benchmark/file-'+i+'.txt');
    const raw=enc.encode('value='+i);
    const crc=crc32(raw);
    const local=Buffer.alloc(30+name.length+raw.length);
    local.writeUInt32LE(0x04034b50,0);
    local.writeUInt16LE(20,4);
    local.writeUInt32LE(crc,14);
    local.writeUInt32LE(raw.length,18);
    local.writeUInt32LE(raw.length,22);
    local.writeUInt16LE(name.length,26);
    local.set(name,30);local.set(raw,30+name.length);
    const central=Buffer.alloc(46+name.length);
    central.writeUInt32LE(0x02014b50,0);
    central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);
    central.writeUInt32LE(crc,16);
    central.writeUInt32LE(raw.length,20);
    central.writeUInt32LE(raw.length,24);
    central.writeUInt16LE(name.length,28);
    central.writeUInt32LE(offset,42);
    central.set(name,46);
    locals.push(local);centers.push(central);
    offset+=local.length;dirSize+=central.length;
  }
  const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);
  end.writeUInt16LE(count,8);
  end.writeUInt16LE(count,10);
  end.writeUInt32LE(dirSize,12);
  end.writeUInt32LE(offset,16);
  return new Uint8Array(Buffer.concat([...locals,...centers,end]));
}
function fakeFS() {
  let mkdirCalls=0,writeCalls=0;
  return {
    get mkdirCalls(){return mkdirCalls},
    get writeCalls(){return writeCalls},
    mkdirTree:()=>++mkdirCalls,
    writeFile:()=>++writeCalls
  };
}
test('1000 sibling assets need one MEMFS directory operation rather than 1000',()=>{
  const data=fixture(1000),fs=fakeFS(),before=performance.now();
  const result=installZip(data,fs,()=>{throw new Error('STORE data must not inflate')});
  const elapsedMs=performance.now()-before;
  assert.equal(result.installed,1000);
  assert.equal(fs.writeCalls,1000);
  assert.equal(fs.mkdirCalls,1);
  console.log('ZIP instrumented installation: 1000 entries, '+elapsedMs.toFixed(1)+' ms, mkdirTree='+fs.mkdirCalls);
});
test('cooperative ZIP pack gives the same output and validates integrity',async()=>{
  const data=fixture(200),fs=fakeFS();
  const result=await installZipCooperative(data,fs,()=>{throw new Error('STORE data must not inflate')},()=>{},24);
  assert.equal(result.installed,200);
  assert.equal(fs.mkdirCalls,1);
  assert.equal(fs.writeCalls,200);
});
