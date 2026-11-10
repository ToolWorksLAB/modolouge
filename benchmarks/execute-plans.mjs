// Run under the worker's Compute environment against a staged bridge/runtime.
import { readFile,writeFile,mkdir,readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {createHash} from 'node:crypto';
const [directory,empty,shelf,destination]=process.argv.slice(2);
const root=process.env.MODOLOUGE_WORKER||'/opt/modolouge-worker';
const bridge=process.env.MODOLOUGE_BRIDGE;
if(!directory||!empty||!shelf||!destination||!bridge)throw Error('Specify plans, empty archive, shelf archive, results, and MODOLOUGE_BRIDGE');
const {compute,makeValues}=await import(pathToFileURL(path.join(root,'compute.js')));
const {previewGeometry}=await import(pathToFileURL(path.join(root,'geometry.js')));
await mkdir(destination,{recursive:true});
function bounds(objects){const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];for(const o of objects){let points=[];if(o.kind==='point')points=[o.point];if(o.kind==='curve')points=o.points;if(o.kind==='mesh'){const a=o.mesh?.data?.attributes?.position?.array||o.mesh?.attributes?.position?.array||[];for(let i=0;i<a.length;i+=3)points.push(a.slice(i,i+3));}for(const p of points)for(let i=0;i<3;i++){if(!Number.isFinite(p[i]))throw Error('Nonfinite preview coordinate');low[i]=Math.min(low[i],p[i]);high[i]=Math.max(high[i],p[i]);}}return {min:low,max:high,size:high.map((x,i)=>x-low[i])};}
for(const name of (await readdir(directory)).filter(x=>x.endsWith('.plan.json')).sort()){
 const contents=await readFile(path.join(directory,name),'utf8');const planSha256=createHash('sha256').update(contents).digest('hex');
 const record=JSON.parse(contents);const target=path.join(destination,record.id+'.result.json');try{const old=JSON.parse(await readFile(target,'utf8'));if(old.planSha256===planSha256)continue;}catch{}
 if(record.plan?.status!=='candidate'){await writeFile(target,JSON.stringify({id:record.id,planSha256,status:record.plan?.status||record.status,reason:record.plan?.reason||record.error},null,2));continue;}
 const start=Date.now();let result={id:record.id,status:'failed'};
 try {
  const editfile=path.join(destination,record.id+'.edits.json');await writeFile(editfile,JSON.stringify(record.plan.edits));
  const prepared=JSON.parse(execFileSync('/usr/share/dotnet/dotnet',[bridge,record.source==='shelf'?shelf:empty,'--patch',editfile],{timeout:30000,maxBuffer:64*1024*1024}));
  const io=await compute('/io',{algo:prepared.algo,filename:record.id+'.gh'});
  if(io.Errors?.length)throw Error(io.Errors.join('; '));
  async function solve(changes={}){const supplied=Object.fromEntries(prepared.controls.map(c=>[c.name,changes[c.instanceId]??c.value]));const raw=await compute('/grasshopper',{algo:prepared.algo,filename:record.id+'.gh',values:makeValues(prepared.controls,supplied),cachesolve:false});const preview=await previewGeometry(raw.values||[]);const errors=raw.errors||[];const warnings=[...(raw.warnings||[]),...preview.warnings];return {objects:preview.objects,errors,warnings,bounds:bounds(preview.objects),values:raw.values};}
  const baseline=await solve();const solved=!baseline.errors.length&&baseline.objects.length>0&&!baseline.warnings.some(x=>/not yet support|could not preview|failed/i.test(x));
  result={id:record.id,status:solved?'solved_semantics_unverified':'failed',objects:baseline.objects.length,kinds:baseline.objects.reduce((a,x)=>(a[x.kind]=(a[x.kind]||0)+1,a),{}),bounds:baseline.bounds,errors:baseline.errors,warnings:baseline.warnings,controls:prepared.controls,graph:prepared.graph,archiveWarnings:prepared.warnings};
  // Deterministic geometric oracle for the simplest failure reported by the owner.
  if(solved&&record.id==='G001'){
   const radii=prepared.controls.filter(c=>c.kind==='number'&&/radius/i.test(c.label));
   const sphere=prepared.graph.nodes.filter(n=>n.componentId==='dabc854d-f50e-408a-b001-d043c7de151d');
   if(radii.length!==1||sphere.length!==1)throw Error('Sphere oracle: need exactly one Sphere and one named radius control');
   const c=radii[0];const other=await solve({[c.instanceId]:6});
   const close=(a,b)=>Math.abs(a-b)<0.15;
   const correct=baseline.objects.length===1&&other.objects.length===1&&baseline.bounds.size.every(x=>close(x,6))&&other.bounds.size.every(x=>close(x,12))&&baseline.bounds.min.every(x=>close(x,-3));
   result.parameterCheck={radius3:baseline.bounds,radius6:other.bounds};result.status=correct?'verified':'semantic_failure';
  }
  await writeFile(path.join(destination,record.id+'.prepared.json'),JSON.stringify(prepared));
  await writeFile(path.join(destination,record.id+'.preview.json'),JSON.stringify(baseline));
 } catch(e){result.error=(e.stderr?.toString()||e.message).slice(0,1800);result.status='failed';}
 result.planSha256=planSha256;result.durationMs=Date.now()-start;await writeFile(target,JSON.stringify(result,null,2));console.log(record.id,result.status,result.objects??'',result.error??'');
}
