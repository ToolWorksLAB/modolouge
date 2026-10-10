// Run against the owner's private, explicitly unsmoothed web copy, not tset4.gh.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

const [source, destination] = process.argv.slice(2);
assert(source && destination, 'Supply a private web-copy GHX and results directory');
const root = process.env.MODOLOUGE_WORKER || '/opt/modolouge-worker';
const bridge = process.env.MODOLOUGE_BRIDGE || path.join(root, 'tools/GhBridge/publish/GhBridge.dll');
const {compute, makeValues} = await import(pathToFileURL(path.join(root, 'compute.js')));
const {previewGeometry} = await import(pathToFileURL(path.join(root, 'geometry.js')));
const hash = data => createHash('sha256').update(data).digest('hex');
await mkdir(destination, {recursive:true, mode:0o700});
const parsed = JSON.parse(execFileSync('/usr/share/dotnet/dotnet', [bridge,source], {timeout:30000,maxBuffer:64*1024*1024}));
assert.equal(parsed.graph.nodes.length, 71);
assert.equal(parsed.graph.wires.length, 82);
assert.equal(parsed.graph.notes.length, 0);
assert(!parsed.graph.nodes.some(n => n.componentId === '4098ec7a-819a-4ced-9eee-86835d7e21c9'));
const io = await compute('/io',{algo:parsed.algo,filename:'mesh-builtins.ghx'});
assert.equal(io.Errors?.length || 0, 0, 'Compute can load the reviewed built-ins');
const names = new Set((io.Inputs || []).map(i => i.Name));
const controls = parsed.controls.filter(c => names.has(c.name));
assert.equal(controls.filter(c => c.kind === 'number').length, 9);
assert.equal(io.Outputs.length, 4); // Geometry and Transform ports from each of two nodes.
assert.equal(io.Outputs.filter(o => o.ParamType === 'Geometry').length, 2);
await writeFile(path.join(destination,'definition.json'),JSON.stringify({controls,graph:parsed.graph,outputs:io.Outputs}),{mode:0o600});
const reports=[];
for (const [name,changes] of [['default',{}],['wider',{X:1251}],['amplitude',{'Amplitude A':42.6}]]) {
 const supplied=Object.fromEntries(controls.map(c=>[c.name,changes[c.label]??c.value]));
 const start=performance.now();
 const result=await compute('/grasshopper',{algo:parsed.algo,filename:'mesh-builtins.ghx',values:makeValues(controls,supplied),cachesolve:false});
 const preview=await previewGeometry(result.values || []);
 const errors=result.errors || [], warnings=[...(result.warnings||[]),...preview.warnings];
 await writeFile(path.join(destination,name+'.json'),JSON.stringify({...preview,errors,warnings}),{mode:0o600});
 const positions=preview.objects.flatMap(o=>o.mesh?.data?.attributes?.position?.array || []);
 assert.equal(errors.length,0,JSON.stringify(errors));
 assert.equal(warnings.length,0,JSON.stringify(warnings));
 assert(positions.length>0 && positions.every(Number.isFinite),'Finite mesh geometry');
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 positions.forEach((v,i)=>{min[i%3]=Math.min(min[i%3],v);max[i%3]=Math.max(max[i%3],v);});
 reports.push({name,ms:Math.round(performance.now()-start),objects:preview.objects.length,vertices:positions.length/3,bounds:{min,max},fingerprint:hash(JSON.stringify(preview.objects)),errors,warnings});
}
assert.notEqual(reports[0].fingerprint,reports[1].fingerprint,'Width changes the live geometry');
assert.notEqual(reports[0].fingerprint,reports[2].fingerprint,'Amplitude changes the live geometry');
const report={recordedAt:new Date().toISOString(),sourceSha256:hash(await readFile(source)),variant:'Weaverbird bypassed; unsmoothed mesh; live previews enabled',nodes:71,wires:82,sliders:9,outputs:2,reports};
await writeFile(path.join(destination,'report.json'),JSON.stringify(report,null,2),{mode:0o600});
console.log(JSON.stringify(report));
