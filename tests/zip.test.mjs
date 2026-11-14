import test from 'node:test';
import assert from 'node:assert/strict';
import {installZip,normalizeZipPath} from '../web/zip.mjs';

// Tiny valid STORE ZIP fixture generator; tests parser without external modules.
function crc32(bytes){let c=-1;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^(c&1?0xedb88320:0)}return(c^-1)>>>0}
function zip(name,text){
  const e=new TextEncoder(),n=e.encode(name),b=e.encode(text),crc=crc32(b);
  const size=30+n.length+b.length+46+n.length+22,arr=new Uint8Array(size),d=new DataView(arr.buffer);let p=0;
  const U16=v=>{d.setUint16(p,v,true);p+=2},U32=v=>{d.setUint32(p,v,true);p+=4},B=bytes=>{arr.set(bytes,p);p+=bytes.length};
  U32(0x04034b50);U16(20);U16(0);U16(0);U16(0);U16(0);U32(crc);U32(b.length);U32(b.length);U16(n.length);U16(0);B(n);B(b);
  const dir=p;U32(0x02014b50);U16(20);U16(20);U16(0);U16(0);U16(0);U16(0);U32(crc);U32(b.length);U32(b.length);U16(n.length);U16(0);U16(0);U16(0);U16(0);U32(0);U32(0);B(n);
  const dirSize=p-dir;U32(0x06054b50);U16(0);U16(0);U16(1);U16(1);U32(dirSize);U32(dir);U16(0);
  assert.equal(p,size);return arr;
}
function fakeFS(){const files=new Map();return{files,mkdirTree:()=>{},writeFile:(p,b)=>files.set(p,new TextDecoder().decode(b))}}
test('read original game data pack file into Emscripten FS',()=>{
  const fs=fakeFS(),r=installZip(zip('data/config/test.xml','original-game-config'),fs,()=>{throw new Error('No inflate for STORE')});
  assert.equal(r.installed,1);assert.equal(fs.files.get('/data/config/test.xml'),'original-game-config');
});
test('seed files install to original local game settings',()=>{
  const fs=fakeFS();installZip(zip('seed/config/raceman/quickrace.xml','quickrace'),fs,()=>{});
  assert.equal(fs.files.get('/home/web_user/.speed-dreams-2/config/raceman/quickrace.xml'),'quickrace');
});
test('reject traversal and unexpected asset roots',()=>{
  for(const name of ['data/../../escape','/data/hack','data\\hack','music/song.ogg','data//empty']){
    assert.throws(()=>normalizeZipPath(name));
  }
  assert.throws(()=>installZip(zip('data/../../escape','evil'),fakeFS(),()=>{}));
});
test('reject ZIP with corrupt CRC',()=>{
  const z=zip('data/a.txt','hello');z[30+'data/a.txt'.length]^=0xff; // flip first payload byte
  assert.throws(()=>installZip(z,fakeFS(),()=>{}),/corrupted|directory|truncated/);
});
