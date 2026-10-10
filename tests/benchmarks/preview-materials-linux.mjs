// Supply private e.gh; its source and generated geometry must stay outside Git.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

const [source,destination,liveDiagnostic] = process.argv.slice(2);
assert(source && destination,'Supply private e.gh and a results directory');
const root=process.env.MODOLOUGE_WORKER || '/opt/modolouge-worker';
const bridge=process.env.MODOLOUGE_BRIDGE || path.join(root,'tools/GhBridge/publish/GhBridge.dll');
const {compute,makeValues}=await import(pathToFileURL(path.join(root,'compute.js')));
const {previewGeometry}=await import(pathToFileURL(path.join(root,'geometry.js')));
const hash=data=>createHash('sha256').update(data).digest('hex');
const sourceHash=hash(await readFile(source));
await mkdir(destination,{recursive:true,mode:0o700});
const prepare=file=>JSON.parse(execFileSync('/usr/share/dotnet/dotnet',[bridge,file],{timeout:30000,maxBuffer:64*1024*1024}));
const parsed=prepare(source);
assert.equal(parsed.graph.nodes.length,70);
assert.equal(parsed.graph.wires.length,82);
assert.equal(parsed.graph.notes.length,0);
assert.equal(parsed.graph.nodes.filter(n=>n.componentId==='8ec86459-bf01-4409-baee-174d0d2b13d0').length,12); // Three are internalized; nine are connected.
assert(parsed.warnings.some(w=>w.includes('2 Custom Preview')));
assert.equal(parsed.outputs.length,2);
const reports=[];
async function solve(definition,name,changes={}) {
 const io=await compute('/io',{algo:definition.algo,filename:'preview-materials.gh'});
 assert.equal(io.Errors?.length||0,0,'Definition loads on Linux');
 const names=new Set((io.Inputs||[]).map(i=>i.Name));
 const controls=definition.controls.filter(c=>names.has(c.name));
 assert.equal(controls.filter(c=>c.kind==='number').length,9);
 const values=Object.fromEntries(controls.map(c=>[c.name,changes[c.label]??c.value]));
 const start=performance.now();
 const response=await compute('/grasshopper',{algo:definition.algo,filename:'preview-materials.gh',values:makeValues(controls,values),cachesolve:false});
 const preview=await previewGeometry(response.values||[]);
 const errors=response.errors||[],warnings=[...(response.warnings||[]),...preview.warnings];
 assert.equal(errors.length,0,JSON.stringify(errors));
 assert.equal(warnings.length,0,JSON.stringify(warnings));
 const positions=preview.objects.flatMap(o=>o.mesh?.data?.attributes?.position?.array||[]);
 assert(positions.length>0&&positions.every(Number.isFinite),'Finite visible mesh geometry');
 await writeFile(path.join(destination,name+'.json'),JSON.stringify({...preview,errors,warnings}),{mode:0o600});
 const report={name,ms:Math.round(performance.now()-start),objects:preview.objects.length,vertices:positions.length/3,fingerprint:hash(JSON.stringify(preview.objects)),errors,warnings};
 reports.push(report);return report;
}
await solve(parsed,'original-visibility');
if(liveDiagnostic) {
 // This separate diagnostic changes visibility only. The original remains intact.
 const live=prepare(liveDiagnostic);
 assert.deepEqual(live.graph.nodes.map(({hidden,...n})=>n),parsed.graph.nodes.map(({hidden,...n})=>n));
 assert.deepEqual(live.graph.wires,parsed.graph.wires);
 const baseline=await solve(live,'diagnostic-live-default');
 const wide=await solve(live,'diagnostic-live-width',{X:1251});
 const amplitude=await solve(live,'diagnostic-live-amplitude',{'Amplitude A':42.6});
 assert.notEqual(baseline.fingerprint,wide.fingerprint,'Width changes the live branch geometry');
 assert.notEqual(baseline.fingerprint,amplitude.fingerprint,'Amplitude changes the live branch geometry');
}
assert.equal(hash(await readFile(source)),sourceHash,'Original archive remains unchanged');
const report={recordedAt:new Date().toISOString(),sourceSha256:sourceHash,nodes:70,wires:82,sliders:9,reports};
await writeFile(path.join(destination,'report.json'),JSON.stringify(report,null,2),{mode:0o600});
console.log(JSON.stringify(report));
