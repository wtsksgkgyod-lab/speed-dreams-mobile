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
const isIOS=/iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform==='MacIntel' && (navigator.maxTouchPoints||0)>1);
// Safari doesn't expose deviceMemory; assume a conservative mobile budget by
// default, rather than treating unknown device memory as unlimited.
// ?full=1 retains the previous rendering/audio policy for comparison.
const lowMemoryMode=(smallTouchScreen||isIOS)&&params.get('full')!=='1';
const startupStorageKey='sdm.boot.stage.v1';
let startupHistory=[];
let startupStage='ready';
function markStartup(stage,detail='') {
  startupStage=stage;
  startupHistory.push({elapsedMs:Math.round(performance.now()),stage,detail:String(detail).slice(0,180)});
  if(startupHistory.length>28)startupHistory.shift();
  try {localStorage.setItem(startupStorageKey,JSON.stringify({stage,when:Date.now(),detail:String(detail).slice(0,180)}));}catch{}
}
function lastStartup() {
  try {return JSON.parse(localStorage.getItem(startupStorageKey)||'null');}catch{return null;}
}
const memoryGiB=Number.isFinite(navigator.deviceMemory)?navigator.deviceMemory:null;
let wasmModule=null, packManager=null, native=null, publisher=null, engineStarted=false;
let renderScale=lowMemoryMode ? .64 : initialRenderScale({touch:smallTouchScreen,width:Math.max(innerWidth,innerHeight),memoryGiB});
const resolutionGovernor=new AdaptiveResolution(renderScale);
let qualityMode='auto', lastFrame=performance.now();
let totalFrames=0, secondFrames=0, secondStart=performance.now();
let frameSample=[], fps=0, toastTimeout;
let orientation=window.innerWidth>window.innerHeight?'landscape':'portrait';

function message(value) { $('status-text').textContent = value; }
function showError(error) {
  markStartup('error',error?.message||error);
  console.error('[Speed Dreams Mobile]',error);
  state.releaseAll();
  if(native) try{native.release();}catch{}
  $('start').disabled=false;
  $('start').textContent='RETRY / RELOAD';
  $('quick-race').disabled=true;
  $('race-start-help').hidden=true;
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
  const pixelRatio=Math.min(lowMemoryMode&&qualityMode!=='high'?1.2:(smallTouchScreen&&qualityMode!=='high'?1.55:1.7),devicePixelRatio||1);
  let actualW=Math.min(1280,Math.round(w*pixelRatio*renderScale));
  let actualH=Math.min(800,Math.round(h*pixelRatio*renderScale));
  const pixelCap=lowMemoryMode&&qualityMode!=='high'?360000:(smallTouchScreen&&qualityMode!=='high'?760000:1024000);
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

// Original Speed Dreams uses a keyboard/joystick confirmation on the pre-race screen.
// Keep the native menus and game intact; emulate only the missing Enter key on mobile.
// Dispatch on the SDL canvas so events bubble to document/window Emscripten listeners.
function confirmNativeRace() {
  if (!engineStarted || $('race-confirm').disabled) return;
  // The original racing UI is paused in RmAddPreRacePauseItems; browsers do
  // not guarantee that untrusted KeyboardEvent will reach SDL (notably Safari).
  // Call the exact original RmReadyToRace callback from WASM instead, so its
  // config Apply, UI dismissal and race unpause are performed atomically.
  try {
    const waiting=native?.preraceWaiting?.();
    if (waiting!==1) {
      toast('レースの準備中です。画面が開始待ちになるまでお待ちください。');
      markStartup('race_waiting_for_native',String(waiting));
      return;
    }
    markStartup('native_prerace_confirming');
    const accepted=native.confirmPrerace();
    if (accepted!==1) {
      toast('レース開始を受け付けられませんでした。診断をコピーしてください。',true);
      markStartup('native_prerace_rejected',String(accepted));
      return;
    }
    markStartup('native_prerace_confirmed');
    $('race-start-help').hidden=true;
    toast('原作レースを開始しました。アクセルで走行できます。');
  } catch(error) {
    markStartup('native_prerace_error',error?.message||error);
    showError(error);
  }
}
$('race-confirm').addEventListener('click',confirmNativeRace);

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
    preraceWaiting:wrap('wg_mobile_prerace_waiting',num,[]),
    confirmPrerace:wrap('wg_mobile_confirm_prerace',num,[]),
  };
}
function updateHUD() {
  if(!engineStarted||!native)return;
  try {
    const speedKph=Math.abs(native.speed());
    if(speedKph>2 && startupStage!=='vehicle_moving') markStartup('vehicle_moving',Math.round(speedKph)+'km/h');
    $('speed').textContent=String(Math.round(speedKph)).padStart(3,'0');
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
      const packInfo=(packManager?.getMetrics()??[]).map(p=>`${p.id}: ${(p.bytes/1048576).toFixed(1)} MiB, net:${p.fetchMs}ms hash:${p.integrityMs}ms install:${p.installMs}ms`).join('\n');
      $('diagnostic-data').textContent=`Page RAF proxy: ${fps} fps\nRAF mean/p95: ${sampled.meanMs.toFixed(1)}/${sampled.p95Ms.toFixed(1)} ms\nWASM heap: ${heap?Math.round(heap/1048576)+' MiB':'unavailable'}\nViewport: ${canvas.width}x${canvas.height}\nScale: ${renderScale}\nNative sends / deduped: ${publisher?.transfers??0} / ${publisher?.skips??0}\nJS heap (Chromium only): ${performance.memory?.usedJSHeapSize?Math.round(performance.memory.usedJSHeapSize/1048576)+' MiB':'unavailable'}\nAsset loading (sequential on touch):\n${packInfo}\nNot GPU FPS; not phone benchmarking.`;
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
  markStartup('launch_requested',mode);
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
    markStartup('wasm_loading');
    message('ゲームエンジンを読み込んでいます');setProgress(.15);
    await loadScript(manifest.runtime.js);
    wasmModule=await runtimeReady;
    markStartup('wasm_ready');
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
    },{maxConcurrent:smallTouchScreen?1:2});
    wasmModule.wgDataReady = directory => packManager.isReady(directory)?1:0;
    markStartup('starter_pack_loading');
    await packManager.load('start');
    markStartup('starter_pack_ready');
    // Speed Dreams' music is optional for the initial race. Holding a second
    // ~23 MiB compressed asset and its decoded files alongside the ~84 MiB
    // starter pack has been a likely iOS memory pressure point. Leave music
    // to the existing wgDataReady on-demand mechanism on small touch devices.
    // Desktop and ?full=1 still exercise the original eager-audio path.
    if (!lowMemoryMode) {
      markStartup('music_pack_loading');
      await packManager.load('music');
      markStartup('music_pack_ready');
    }
    setProgress(.97);message('オリジナルシミュレーターを起動中');
    // The original Speed Dreams GfApplication supports these official CLI flags.
    // SDL's Emscripten main loop deliberately unwinds instead of returning.
    const args=['-dd','/data','-ld','/lib','-lc','/home/web_user/.speed-dreams-2'];
    // The original main.cpp explicitly supports -s/--startrace. This bypasses
    // mouse-heavy native menus and starts the preserved Quick Race config.
    if(mode==='quickrace')args.push('-s','quickrace');
    markStartup('native_main_starting',mode);
    try {wasmModule.callMain(args);}
    catch(e){if(String(e)!=='unwind' && e?.message!=='unwind')throw e;}
    engineStarted=true;
    markStartup('native_main_ready',mode);
    if(mode==='quickrace')toggleTouch(true);
    else native.enable(0);
    resizeCanvas();setProgress(1);
    $('boot').hidden=true;$('toolbar').hidden=false;$('footer').hidden=false;
    $('race-start-help').hidden=mode!=='quickrace';
    if(mode==='quickrace' && lowMemoryMode){
      // Preload the initial track while the pre-race confirmation is visible,
      // never in the same synchronous event as the player's START RACE tap.
      const button=$('race-confirm'),help=$('race-start-help').querySelector('small');
      button.disabled=true;
      button.textContent='コース準備中…';
      help.textContent='原作のコース素材を読み込んでいます。画面が反応するまま処理します。';
      markStartup('quickrace_track_loading');
      packManager.load('track-brno').then(()=>{
        markStartup('quickrace_track_ready');
        button.textContent='START RACE ▶';button.disabled=false;
        help.textContent='準備完了。タップして原作レースを開始してください。';
      },err=>{
        markStartup('quickrace_track_failed',err?.message||err);
        button.textContent='START RACE ▶';button.disabled=false;
        help.textContent='コースの読み込みに失敗しました。RETRY DATAを試してください。';
        $('retry-assets').hidden=false;
      });
    }
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
  const previous=lastStartup();
  if(previous && Date.now()-previous.when<40*60*1000 &&
     !['ready','native_main_ready','race_running_or_loading'].includes(previous.stage)) {
    $('boot-help').textContent='前回の最終段階: '+previous.stage+
      '。もしSafariが停止・再読み込みした場合は、下の「診断をコピー」で状態を共有できます。';
  }
  $('start').disabled=false;
  $('start').textContent='OPEN SIMULATOR →';
  $('quick-race').disabled=false;
  message('エンジンの準備ができました。初回はデータの読み込みが発生します。');
  if(debug)$('diagnostics').hidden=false;
  checkOrientation();
}
prepare();

function diagnosticReport() {
  const mod=wasmModule;
  return JSON.stringify({
    build:'ios-startup-guard-v1',
    stage:startupStage,
    previous:lastStartup(),
    latest:startupHistory,
    platform:navigator.platform,
    userAgent:navigator.userAgent,
    viewport:[innerWidth,innerHeight],
    canvas:[canvas.width,canvas.height],
    smallTouchScreen,isIOS,lowMemoryMode,
    mode:qualityMode,
    wasmHeapMiB:mod?.HEAPU8?.byteLength?Math.round(mod.HEAPU8.byteLength/1048576):null,
    gameStarted:engineStarted,
    packs:packManager?.getMetrics()||[]
  },null,2);
}
$('copy-report').addEventListener('click',async ()=>{
  const report=diagnosticReport();
  try {await navigator.clipboard.writeText(report);toast('診断情報をコピーしました。チャットに貼り付けてください。');}
  catch { $('diagnostics').hidden=false;$('diagnostic-data').textContent=report;toast('診断を下の表示欄に出しました。テキストをコピーしてください。'); }
});
