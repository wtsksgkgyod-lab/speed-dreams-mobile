// Minimal ZIP central-directory reader with streaming-per-entry installation.
// Relies on vendored fflate.inflateSync ONLY for DEFLATE. No whole-archive unzip.
const u16 = (v,i) => v.getUint16(i, true);
const u32 = (v,i) => v.getUint32(i, true);
const MAX_FILE = 96 * 1024 * 1024;
const MAX_TOTAL = 700 * 1024 * 1024;
const decoder = new TextDecoder('utf-8', {fatal:true});

// Table-driven CRC avoids eight bit-operations per byte on large 88MB packs.
// Still validates exactly the original ZIP CRC-32 before writing to WASM FS.
const CRC_TABLE = new Uint32Array(256);
for (let n=0; n<256; n++) {
  let c=n;
  for (let bit=0;bit<8;bit++) c=(c>>>1)^(c&1 ? 0xedb88320:0);
  CRC_TABLE[n]=c>>>0;
}
function crc32(bytes) {
  let crc=0xffffffff;
  for (let i=0;i<bytes.length;i++) crc=CRC_TABLE[(crc^bytes[i])&255]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
}
export function normalizeZipPath(path) {
  // Reject absolute, traversal, Windows, Unicode null and special device paths.
  if (!path || path.startsWith('/') || /[\\\0-\x1f]/.test(path) || path.split('/').some(x=>x==='.'||x==='..'||!x))
    throw new Error(`Unsafe asset path: ${path}`);
  if (!/^(data|seed|lib)\//.test(path)) throw new Error(`Unexpected asset root: ${path}`);
  return path;
}

function* installZipSteps(bytes, FS, inflateRaw, onFile) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i=bytes.length-22; i>=Math.max(0,bytes.length-65557); i--) {
    if (u32(view,i)===0x06054b50) {eocd=i;break;}
  }
  if (eocd<0) throw new Error('ZIP end-of-central-directory not found');
  const count=u16(view,eocd+10), start=u32(view,eocd+16);
  if (u16(view,eocd+8)!==count) throw new Error('Multidisk ZIP unsupported');
  if (count>15000 || start>=bytes.length) throw new Error('Invalid ZIP directory');
  let pos=start,total=0,installed=0;
  const entries=[];
  for(let n=0;n<count;n++) {
    if(pos+46>bytes.length || u32(view,pos)!==0x02014b50) throw new Error('Malformed ZIP central directory');
    const flags=u16(view,pos+8), method=u16(view,pos+10), expectedCrc=u32(view,pos+16);
    const compressed=u32(view,pos+20), plain=u32(view,pos+24);
    const nameLength=u16(view,pos+28), extra=u16(view,pos+30), comment=u16(view,pos+32), local=u32(view,pos+42);
    if (flags & 1 || (method!==0 && method!==8)) throw new Error('Encrypted or unsupported ZIP entry');
    if (plain>MAX_FILE || total+plain>MAX_TOTAL) throw new Error('Asset pack too large');
    if (pos+46+nameLength+extra+comment>bytes.length) throw new Error('Invalid ZIP filename');
    const name=decoder.decode(bytes.subarray(pos+46,pos+46+nameLength));
    pos+=46+nameLength+extra+comment;
    if (name.endsWith('/')) continue;
    const safe=normalizeZipPath(name);
    if(local+30>bytes.length || u32(view,local)!==0x04034b50) throw new Error('ZIP local header missing');
    const offset=local+30+u16(view,local+26)+u16(view,local+28);
    if(offset+compressed>bytes.length) throw new Error('ZIP entry truncated');
    entries.push({safe, offset, compressed, plain, method, expectedCrc});
    total+=plain;
  }
  for(const entry of entries) {
    const packed=bytes.subarray(entry.offset,entry.offset+entry.compressed);
    const data=entry.method===0 ? packed : inflateRaw(packed);
    if (data.length!==entry.plain || crc32(data)!==entry.expectedCrc) throw new Error(`Asset corrupted: ${entry.safe}`);
    const destination=entry.safe.startsWith('seed/')
      ? '/home/web_user/.speed-dreams-2/'+entry.safe.slice(5)
      : '/'+entry.safe;
    FS.mkdirTree(destination.slice(0,destination.lastIndexOf('/')));
    FS.writeFile(destination,data);
    installed++;
    onFile(installed,entries.length,entry.safe);
    yield installed; // Enables cooperative batch processing without duplicating validation.
  }
  return { installed, unpackedBytes: total };
}

// Synchronous API retained for compatibility and existing test fixtures.
export function installZip(bytes, FS, inflateRaw, onFile=()=>{}) {
  const iterator=installZipSteps(bytes,FS,inflateRaw,onFile);
  for(;;){const step=iterator.next();if(step.done)return step.value;}
}

// Original Speed Dreams packs can contain thousands of entries. Yield after
// small batches so UI/paint events are serviced during the large initial load.
export async function installZipCooperative(bytes, FS, inflateRaw, onFile=()=>{}, batchSize=24) {
  if(!Number.isInteger(batchSize)||batchSize<1||batchSize>1024) throw new Error('Invalid batch size');
  const iterator=installZipSteps(bytes,FS,inflateRaw,onFile);
  let written=0;
  for(;;){
    const step=iterator.next();
    if(step.done)return step.value;
    if(++written%batchSize===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
}
