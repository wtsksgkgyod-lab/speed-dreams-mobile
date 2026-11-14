import { MobileControls, PointerOwnership, clamp } from './core.mjs';
import { PackManager } from './packs.mjs';
import {InputPublisher, AdaptiveResolution, initialRenderScale, frameStats} from './perf.mjs';

const $ = id => document.getElementById(id);
const canvas = $('canvas');
const state = new MobileControls();
const owners = new PointerOwnership(state);
const params = new URLSearchParams(location.search);
const debug = params.get('debug') === '1';
const QUALITY = [0.68, 0.78, 1.0];
const smallTouchScreen=(navigator.maxTouchPoints||0)>0 && Math.min(innerWidth,innerHeight)<550;
const memoryGiB=Number.isFinite(navigator.deviceMemory)?navigator.deviceMemory:null;
let wasmModule=null, packManager=null, native=null, publisher=null, engineStarted=false;
let renderScale=initialRenderScale({touch:smallTouchScreen,width:Math.max(innerWidth,innerHeight),memoryGiB});
const resolutionGovernor=new AdaptiveResolution(renderScale);
let qualityMode='auto', lastFrame=performance.now();
let totalFrames=0, secondFrames=0, secondStart=performance.now();
let frameSample=[], fps=0, toastTimeout;
let orientation=window.innerWidth>window.innerHeight?'landscape':'portrait';

function message(value) { $('status-text').textContent = value; }
function showError(error) {
  console.error('[Speed Dreams Mobile]',error);
  state.releaseAll();
  if(native) try{native.release();}catch{}
  $('start').disabled=false;
  $('start').textContent='RETRY / RELOAD';
  $('quick-race').disabled=true;
  $('boot').hidden=false;
  $('boot-help').textContent='復旧できない場合はページを再読み込みしてください。ゲーム本体が未インストールの場合はREADMEのビルド手順を確認。';
  message(`エラー: ${error?.message||error}`);
  const diagnostic=String(error?.stack||error);
  if(debug) $('diagnostic-data').textContent=diagnostic;
}
function toast(text,sticky=false) {
  $('toast').textContent=text;$('toast').hidden=false;
  clearTimeout(toastTimeout);
  if(!sticky)toastTimeout=setTimeout(()=>$('toast').hidden=true,4000);
}
function setProgress(value) { $('progress-bar').style.width=`${Math.round(clamp(value,0,1)*100)}%`; }
function checkOrientation() {
  const next=innerWidth>innerHeight?'landscape':'portrait';
  if(orientation!==next){resetInput();orientation=next;}
  $('rotate-hint').hidden=next==='landscape';
  resizeCanvas();
}
function getCanvasSize() {
  const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);
  const pixelRatio=Math.min(smallTouchScreen&&qualityMode!=='high'?1.55:1.7,devicePixelRatio||1);
  let actualW=Math.min(1280,Math.round(w*pixelRatio*renderScale));
  let actualH=Math.min(800,Math.round(h*pixelRatio*renderScale));
  const pixelCap=smallTouchScreen&&qualityMode!=='high'?760000:1024000;
  if(actualW*actualH>pixelCap){const k=Math.sqrt(pixelCap/(actualW*actualH));actualW=Math.round(actualW*k);actualH=Math.round(actualH*k);}
  return [Math.max(320,actualW),Math.max(180,actualH)];
}
function resizeCanvas(){
  const [w,h]=getCanvasSize();
  if(canvas.width===w&&canvas.height===h)return;
  canvas.width=w;canvas.height=h;
  if (native?.resize && engineStarted) try{native.resize(w,h);}catch(e){console.warn('Resize not yet possible',e);}
}

function flushControls(force=false) {
  if(publisher && engineStarted)try {
    publisher.publish(state.snapshot(),force);
  }catch(e){console.error('Native input bridge',e);}
}
function resetInput(){
  owners.releaseAll();
  $('steering-marker').style.left='50%';
  for(const id of ['throttle','brake'])$(id).querySelector('.fill').style.height='0%';
  for(const el of document.querySelectorAll('[aria-valuenow]'))el.setAttribute('aria-valuenow','0');
  flushControls(true);if(native)try{native.release();}catch{}
  if(publisher)publisher.reset();
}
window.addEventListener('blur',resetInput);
window.addEventListener('pagehide',resetInput);
document.addEventListener('visibilitychange',()=>{if(document.hidden)resetInput();});
window.addEventListener('resize',checkOrientation);
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();showError(new Error('WebGLコンテキストが失われました。再読み込みしてください。'));});
canvas.addEventListener('webglcontextrestored',()=>toast('WebGLが復旧しました。レースを続ける場合は再読み込みを推奨します。',true));

function attachAxis(el,axis,compute) {
  let activeRect=null;
  const update = event => {
    if(!owners.owns(axis,event.pointerId))return;
    const value=compute(activeRect||el.getBoundingClientRect(),event);
    state.setAxis(axis,value);
    el.setAttribute('aria-valuenow',Math.round(value*100));
    if(axis==='steering') $('steering-marker').style.left=`${(value+1)*50}%`;
    else el.querySelector('.fill').style.height=`${Math.round(value*100)}%`;
    flushControls();
  };
  el.addEventListener('pointerdown',e=>{
    if(!state.enabled || !owners.acquire(axis,e.pointerId))return;
    e.preventDefault();activeRect=el.getBoundingClientRect();el.setPointerCapture(e.pointerId);update(e);
  });
  el.addEventListener('pointermove',e=>{if(owners.owns(axis,e.pointerId)){e.preventDefault();update(e);}});
  const release=e=>{
    if(owners.release(axis,e.pointerId)){
      activeRect=null;
      if(axis==='steering')$('steering-marker').style.left='50%';
      else el.querySelector('.fill').style.height='0%';
      el.setAttribute('aria-valuenow','0');flushControls();
    }
  };
  for(const ev of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(ev,release);
  el.addEventListener('keydown',e=>{
    const step=e.shiftKey?0.2:0.08;
    if(['ArrowLeft','ArrowDown','ArrowRight','ArrowUp'].includes(e.key)){
      e.preventDefault();const dir=['ArrowLeft','ArrowDown'].includes(e.key)?-1:1;
      state.setAxis(axis,state[axis]+dir*step);flushControls();
    }
  });
}
attachAxis($('steering-pad'),'steering',(rect,e)=>clamp((e.clientX-(rect.left+rect.width/2))/(rect.width*0.4),-1,1));
const pedalFromEvent=(r,e)=>clamp(1-(e.clientY-r.top)/r.height,0,1);
attachAxis($('throttle'),'throttle',pedalFromEvent);
attachAxis($('brake'),'brake',pedalFromEvent);
for(const button of document.querySelectorAll('[data-shift]')){
  button.addEventListener('pointerdown',e=>{
    if(!state.enabled || state.automatic)return;
    e.preventDefault();button.setPointerCapture(e.pointerId);
    state.shift(button.dataset.shift);flushControls();
    button.style.background='#476a65';
  });
  for(const ev of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(ev,()=>{button.style.background='';});
}
async function retryAssets() {
  if(!packManager) return;
  $('retry-assets').disabled=true;
  toast('失敗したデータを再ダウンロードしています…');
  const outcomes=await packManager.retryFailed();
  const failures=outcomes.filter(o=>o.status==='rejected');
  $('retry-assets').hidden=failures.length===0;
  $('retry-assets').disabled=false;
  toast(failures.length ? '再取得に失敗しました。通信を確認してRETRY DATAを押してください。' : 'データの再取得が完了しました。', failures.length>0);
}
$('retry-assets').addEventListener('click',retryAssets);

function toggleTouch(enabled) {
  state.enabled=!!enabled;
  if(!enabled) resetInput();
  if(native)native.enable(enabled?1:0);
  $('touch-controls').hidden=!enabled;
  $('touch-toggle').classList.toggle('active',enabled);
  $('touch-toggle').setAttribute('aria-pressed',String(enabled));
  $('touch-toggle').textContent=enabled?'TOUCH ON':'TOUCH OFF';
  if(enabled)toast('メニュー操作中はTOUCH OFFにしてください。ブレーキ・アクセルは上下スライドで調整。');
}
$('touch-toggle').addEventListener('click',()=>toggleTouch(!state.enabled));
$('manual').addEventListener('click',()=>{
  state.automatic=!state.automatic;
  $('manual').textContent=state.automatic?'AT':'MT';
  $('manual').classList.toggle('active',!state.automatic);
  $('shift-buttons').hidden=state.automatic;
  flushControls();
});
$('quality').addEventListener('click',()=>{
  qualityMode=qualityMode==='auto'?'low':qualityMode==='low'?'high':'auto';
  renderScale=qualityMode==='low'?QUALITY[0]:qualityMode==='high'?QUALITY[2]:initialRenderScale({touch:smallTouchScreen,width:Math.max(innerWidth,innerHeight),memoryGiB});
  resolutionGovernor.setScale(renderScale);
  $('quality').textContent=qualityMode.toUpperCase();resizeCanvas();
  toast(`描画品質: ${qualityMode.toUpperCase()}。物理演算の精度は変更しません。`);
});

function loadScript(url) {
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=url;script.async=true;
    script.onload=resolve;script.onerror=()=>reject(new Error(`ゲーム実行ファイルを読み込めません: ${url}`));
    document.head.append(script);
  });
}
function buildNativeAPI(mod) {
  const wrap=(name,result,args)=>mod.cwrap(name,result,args);
  const num='number';
  return {
    enable:wrap('wg_mobile_enable',null,[num]),
    set:wrap('wg_mobile_set_controls',null,[num,num,num,num,num,num]),
    release:wrap('wg_mobile_release_all',null,[]),
    speed:wrap('wg_mobile_speed_kph',num,[]),
    rpm:wrap('wg_mobile_engine_rpm',num,[]),
    gear:wrap('wg_mobile_gear',num,[]),
    resize:wrap('wg_resize',null,[num,num]),
  };
}
function updateHUD() {
  if(!engineStarted||!native)return;
  try {
    $('speed').textContent=String(Math.round(Math.abs(native.speed()))).padStart(3,'0');
    const gear=native.gear();$('gear').textContent=gear===0?'N':gear===-1?'R':String(gear);
  }catch(e){console.warn('HUD unavailable',e);}
}
function instrumentationFrame(time) {
  const delta=Math.max(0,time-lastFrame);
  if(delta>0&&delta<3000){frameSample.push(delta);if(frameSample.length>180)frameSample.shift();}
  totalFrames++;secondFrames++;lastFrame=time;
  if(time-secondStart>1000){
    fps=Math.round(secondFrames*1000/(time-secondStart));
    const sampled=frameStats(frameSample);
    if(debug){
      const heap=wasmModule?.HEAPU8?.buffer?.byteLength;
      $('diagnostic-data').textContent=`Page RAF proxy: ${fps} fps\nRAF mean/p95: ${sampled.meanMs.toFixed(1)}/${sampled.p95Ms.toFixed(1)} ms\nWASM heap: ${heap?Math.round(heap/1048576)+' MiB':'unavailable'}\nViewport: ${canvas.width}x${canvas.height}\nScale: ${renderScale}\nNative sends / deduped: ${publisher?.transfers??0} / ${publisher?.skips??0}\nJS heap (Chromium only): ${performance.memory?.usedJSHeapSize?Math.round(performance.memory.usedJSHeapSize/1048576)+' MiB':'unavailable'}\nNot GPU FPS; not phone benchmarking.`;
    }
    const proposed=resolutionGovernor.update({fps,now:time,active:engineStarted&&!document.hidden&&qualityMode==='auto'&&frameSample.length>120});
    if(proposed!==null){renderScale=proposed;resizeCanvas();}
    secondFrames=0;secondStart=time;
  }
  // Input events publish immediately. Avoid one redundant C++/WASM call on every RAF.
  requestAnimationFrame(instrumentationFrame);
}
requestAnimationFrame(instrumentationFrame);
setInterval(updateHUD,160);

async function start(mode='menu') {
  $('start').disabled=true;
  $('quick-race').disabled=true;
  $('start').textContent='STARTING…';
  try {
    if(!globalThis.WebAssembly)throw new Error('WebAssembly is not supported by this browser');
    // Never create/lose a WebGL context on the game's SDL canvas before SDL.
    const probe=document.createElement('canvas');
    if(!(probe.getContext('webgl2')||probe.getContext('webgl')))throw new Error('WebGL is unavailable on this device');
    message('ゲーム情報を取得しています');setProgress(.06);
    const response=await fetch('./app-manifest.json',{cache:'no-store'});
    if(!response.ok)throw new Error('WASMビルドが配置されていません。READMEの build_mobile.sh を実行してください。');
    const manifest=await response.json();
    if(!manifest.packs?.start||!manifest.runtime?.js)throw new Error('Invalid app manifest');
    if (!globalThis.fflate?.inflateSync) throw new Error('ZIP decoder missing (vendor/fflate.js)');
    resizeCanvas();
    let runtimeResolved,runtimeRejected;
    const runtimeReady=new Promise((res,rej)=>{runtimeResolved=res;runtimeRejected=rej;});
    const mod={
      canvas,
      noInitialRun:true,
      locateFile:file=>file.endsWith('.wasm')?manifest.runtime.wasm:('game/'+file),
      print:(...args)=>debug&&console.log('[WASM]',...args),
      printErr:(...args)=>console.error('[WASM]',...args),
      onRuntimeInitialized:()=>runtimeResolved(mod),
      onAbort:reason=>{runtimeRejected(new Error(String(reason)));if(engineStarted)showError(new Error(String(reason)));},
      setStatus:status=>{if(status&&debug)console.debug('emscripten:',status)},
    };
    window.Module=mod;
    message('ゲームエンジンを読み込んでいます');setProgress(.15);
    await loadScript(manifest.runtime.js);
    wasmModule=await runtimeReady;
    native=buildNativeAPI(wasmModule);
    publisher=new InputPublisher((...values)=>native.set(...values));
    const FS=wasmModule.FS;
    for(const dir of ['/data','/lib','/home/web_user/.speed-dreams-2'])FS.mkdirTree(dir);
    packManager=new PackManager(manifest,FS,(id,phase,ratio,error)=>{
      if(id==='start')setProgress(.25+ratio*.68);
      if(phase==='failed') {
        $('retry-assets').hidden=false;
        toast(`${id}: ${error?.message||'download failed'} — RETRY DATAで再試行`,true);
      } else if (phase==='ready' && packManager?.failedIds().length===0) {
        $('retry-assets').hidden=true;
      }
      else if(phase==='fetching')message(`${id} をダウンロードしています`);
      else if(phase==='unpacking')message(`${id} を展開しています ${Math.round(ratio*100)}%`);
      else if(phase==='ready')message(`${id} の読み込み完了`);
    });
    wasmModule.wgDataReady = directory => packManager.isReady(directory)?1:0;
    await packManager.load('start');
    // Retain upstream menu/race music from its separate original asset pack.
    await packManager.load('music');
    setProgress(.97);message('オリジナルシミュレーターを起動中');
    // The original Speed Dreams GfApplication supports these official CLI flags.
    // SDL's Emscripten main loop deliberately unwinds instead of returning.
    const args=['-dd','/data','-ld','/lib','-lc','/home/web_user/.speed-dreams-2'];
    // The original main.cpp explicitly supports -s/--startrace. This bypasses
    // mouse-heavy native menus and starts the preserved Quick Race config.
    if(mode==='quickrace')args.push('-s','quickrace');
    try {wasmModule.callMain(args);}
    catch(e){if(String(e)!=='unwind' && e?.message!=='unwind')throw e;}
    engineStarted=true;
    if(mode==='quickrace')toggleTouch(true);
    else native.enable(0);
    resizeCanvas();setProgress(1);
    $('boot').hidden=true;$('toolbar').hidden=false;$('footer').hidden=false;
    if(debug)$('diagnostics').hidden=false;
    canvas.focus();checkOrientation();
    toast(mode==='quickrace'?'Quick Race開始。必要な車・コースを読み込んでいます。':'ゲーム内のメニューでレースを開始し、走行中は TOUCH ON を押してください。');
  }catch(error){showError(error);}
}
$('start').addEventListener('click',()=>{
  if(engineStarted||wasmModule){location.reload();return;}
  // This click is the required user gesture to unlock browser audio APIs.
  start('menu');
});
$('quick-race').addEventListener('click',()=>{
  if(engineStarted||wasmModule){location.reload();return;}
  start('quickrace');
});
async function prepare() {
  $('start').disabled=false;
  $('start').textContent='OPEN SIMULATOR →';
  $('quick-race').disabled=false;
  message('エンジンの準備ができました。初回はデータの読み込みが発生します。');
  if(debug)$('diagnostics').hidden=false;
  checkOrientation();
}
prepare();
