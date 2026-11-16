// Optional low-draw-call preset for the original Speed Dreams graphics config.
// Physics, AI and content are untouched. Safari gains are NOT presumed.
const changes=Object.freeze({
  'LOD Factor':'0.40',
  'sky dome distance':'0',
  'dynamic sky dome':'disabled',
  'cloudlayer':'0',
  'background skydome':'disabled',
  'visibility':'1200',
  'shadow type':'shadow static',
});
export function applyMobileGraphicsProfile(fs,{enabled=true}={}) {
  if(!enabled)return {applied:false,changes:{}};
  if(!fs||typeof fs.readFile!=='function'||typeof fs.writeFile!=='function')throw new TypeError('Expected Emscripten FS');
  const path='/data/config/graph.xml';
  let doc=fs.readFile(path,{encoding:'utf8'});
  if(!doc.includes('<section name="Graphic">'))throw new Error('Speed Dreams original graphics config not found');
  const previous={};
  for(const [key,value] of Object.entries(changes)){
    // Attribute names above are exact literals with no regex metacharacters.
    const expression=new RegExp('(<att(?:num|str) name="'+key+'"[^>]*\\bval=")([^"]+)(")','g');
    const matches=[...doc.matchAll(expression)];
    if(matches.length!==1)throw new Error('Unexpected original Speed Dreams graphics option: '+key);
    previous[key]=matches[0][2];
    doc=doc.replace(expression,(_all,before,_old,after)=>before+value+after);
  }
  fs.writeFile(path,doc);
  return {applied:true,changes:{...changes},previous};
}
