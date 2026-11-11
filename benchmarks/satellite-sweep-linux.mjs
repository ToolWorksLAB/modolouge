// Verify the successful queue replay's parametric behavior against real Compute.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const root=process.env.MODOLOUGE_WORKER||'/opt/modolouge-worker';
const {get,download}=await import(pathToFileURL(root+'/storage.js'));
const {compute,makeValues}=await import(pathToFileURL(root+'/compute.js'));
const {previewGeometry}=await import(pathToFileURL(root+'/geometry.js'));
const [replayFile,outputFile]=process.argv.slice(2);
const replay=JSON.parse(await readFile(replayFile,'utf8'));
const def=await get('DEF#'+replay.result.definition.id);
const prepared=JSON.parse(new TextDecoder().decode(await download(def.preparedKey)));
const main=prepared.controls.find(c=>c.instanceId==='54f5de9e-c9f2-427d-8c13-3f0097bb1b55');
assert(main,'Original sphere radius control must remain');
const rows=[];
for(const radius of [10,23,50,90]){
 const solved=await compute('/grasshopper',{algo:prepared.algo,values:makeValues(prepared.controls,{[main.name]:radius}),cachesolve:false});
 assert.equal((solved.errors||[]).length,0,JSON.stringify(solved.errors));
 const preview=await previewGeometry(solved.values||[]);
 assert.equal(preview.warnings.length,0,JSON.stringify(preview.warnings));
 const layers={};
 for(const obj of preview.objects){
  const p=obj.mesh?.data?.attributes?.position?.array;
  assert(p?.length,'Expected tessellated geometry');
  let lo=Infinity,hi=-Infinity;
  for(let i=2;i<p.length;i+=3){assert(Number.isFinite(p[i]));lo=Math.min(lo,p[i]);hi=Math.max(hi,p[i]);}
  (layers[obj.layer]??=[]).push((hi-lo)/2);
 }
 const groups=Object.entries(layers).map(([layer,radii])=>({layer,count:radii.length,min:Math.min(...radii),max:Math.max(...radii)}));
 const satellite=groups.find(g=>g.count===64), original=groups.find(g=>g.layer.includes('69a210ee-7fdb-4c66-8bef-df29f492fce4'));
 assert(satellite,'Expected 64 satellite spheres');
 assert(Math.abs(original.max-radius)<0.01,'Main sphere follows radius control');
 assert(satellite.min>0&&satellite.max<radius,'Satellite spheres stay smaller');
 rows.push({mainRadius:radius,objects:preview.objects.length,groups});
}
for(let i=1;i<rows.length;i++){
 const current=rows[i].groups.find(g=>g.count===64),previous=rows[i-1].groups.find(g=>g.count===64);
 assert(current.max<previous.max&&current.min<previous.min,'Satellites must shrink as main sphere grows');
}
await writeFile(outputFile,JSON.stringify({passed:true,rows},null,2));
console.log(JSON.stringify({passed:true,rows}));
