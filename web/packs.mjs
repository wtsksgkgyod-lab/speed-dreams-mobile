import {installZipCooperative} from './zip.mjs';
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
export class PackManager {
  constructor(manifest, fs, progress=()=>{}) {
    this.manifest=manifest;
    this.fs=fs;
    this.progress=progress;
    this.states=new Map();
    this.rootByPack=new Map();
    for(const [id, dirs] of Object.entries(manifest.packPaths||{})) {
      for(const dir of dirs) this.rootByPack.set(dir,id);
    }
  }
  failedIds() {
    return Array.from(this.states, ([id, task]) => task.status==='failed' ? id : null).filter(Boolean);
  }
  async retryFailed() {
    return Promise.allSettled(this.failedIds().map(id=>this.load(id,true)));
  }
  resolve(directory) {
    for(const [root,id] of this.rootByPack) if(directory===root||directory.startsWith(root+'/')) return id;
    return null;
  }
  isReady(directory) {
    const id=this.resolve(directory);
    if(!id) return true; // Not an on-demand pack, was included in starter data.
    const state=this.states.get(id);
    if (state?.status==='ready') return true;
    if (!state) this.load(id).catch(()=>{}); // Failures wait for explicit retry; no network storm.
    return false;
  }
  async load(id, retry=false) {
    const state=this.states.get(id);
    if (!retry && state) return state.promise;
    const meta=this.manifest.packs?.[id];
    if (!meta) throw new Error(`Missing pack in manifest: ${id}`);
    const task={status:'loading',promise:null,error:null};
    this.states.set(id,task);
    task.promise=(async()=>{
      let attempt=0;
      while(attempt++<3) {
        try {
          this.progress(id,'fetching',0);
          const response=await fetch(meta.url,{cache:'force-cache'});
          if(!response.ok) throw new Error(`HTTP ${response.status}: ${meta.url}`);
          const buffer=await response.arrayBuffer();
          if(meta.sha256 && globalThis.crypto?.subtle) {
            const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),x=>x.toString(16).padStart(2,'0')).join('');
            if(digest!==meta.sha256) throw new Error(`SHA-256 mismatch for ${id}`);
          }
          this.progress(id,'unpacking',0);
          const result=await installZipCooperative(new Uint8Array(buffer),this.fs,packed=>globalThis.fflate.inflateSync(packed),
            (n,total)=>{if(n%12===0 || n===total)this.progress(id,'unpacking',n/total);});
          task.status='ready';
          this.progress(id,'ready',1);
          return result;
        } catch(error) {
          task.error=error;
          if(attempt>=3) break;
          await delay(600 * attempt);
        }
      }
      task.status='failed';
      this.progress(id,'failed',0,task.error);
      throw task.error;
    })();
    return task.promise;
  }
}
