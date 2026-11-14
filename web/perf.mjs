// Conservative mobile runtime policy. No simulator physics or timestep changes.
// requestAnimationFrame is a page cadence proxy, NOT GPU or game-frame timing.
export class InputPublisher {
  constructor(send) {
    if(typeof send!=='function')throw new TypeError('send function required');
    this.send=send;this.previous=null;this.transfers=0;this.skips=0;
  }
  publish(values,force=false) {
    if(!Array.isArray(values)||values.length!==6||values.some(x=>!Number.isFinite(x)))
      throw new TypeError('Six finite control values required');
    if(!force&&this.previous&&values.every((x,i)=>x===this.previous[i])) {
      ++this.skips;return false;
    }
    // Do not update cache if the bridge throws; the next input can retry.
    this.send(...values);
    this.previous=values.slice();
    ++this.transfers;
    return true;
  }
  reset() { this.previous=null; }
}
export function initialRenderScale({touch=false,width=1280,memoryGiB=null}={}) {
  if(touch&&width<900) return memoryGiB!==null&&memoryGiB<=2 ? .7 : .78;
  return .85;
}
export class AdaptiveResolution {
  constructor(initial=.85) {
    this.scale=initial;this.low=0;this.high=0;this.lastChange=-Infinity;
  }
  update({fps,now,active=true}) {
    if(!active||!Number.isFinite(fps)||!Number.isFinite(now)||fps<=0) {
      this.low=0;this.high=0;return null;
    }
    // Reduce only after sustained frame-rate pressure. Never churn resolution
    // in menus, background tabs, or intermittent GC/network stalls.
    this.low=fps<26 ? this.low+1 : 0;
    this.high=fps>=57 ? this.high+1 : 0;
    if(now-this.lastChange<9000)return null;
    if(this.low>=6&&this.scale>.65) {
      this.scale=Math.max(.65,Math.round((this.scale-.06)*100)/100);
    } else if(this.high>=12&&this.scale<.95) {
      this.scale=Math.min(.95,Math.round((this.scale+.03)*100)/100);
    } else return null;
    this.lastChange=now;
    this.low=0;this.high=0;
    return this.scale;
  }
  setScale(value) {
    if(!Number.isFinite(value)||value<.5||value>1)throw new RangeError('Invalid render scale');
    this.scale=value;this.low=this.high=0;this.lastChange=-Infinity;
  }
}
export function frameStats(samples) {
  const a=samples.filter(x=>Number.isFinite(x)&&x>0).sort((x,y)=>x-y);
  if(a.length===0)return {meanMs:0,p95Ms:0,worstMs:0,samples:0};
  const meanMs=a.reduce((s,n)=>s+n,0)/a.length;
  return {meanMs,p95Ms:a[Math.min(a.length-1,Math.ceil(.95*a.length)-1)],
          worstMs:a[a.length-1],samples:a.length};
}
