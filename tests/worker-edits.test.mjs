import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {graphEditsSchema} from '../lib/graph-edits.js';

// Exercise execute(), including its job guard, rather than calling GhBridge directly.
// External services and the native process are mocked here; the Linux integration
// regression invokes the same entry point with real storage and Compute.
let bridgeCalls=[], computeCalls=[], writes=[], downloads=0, storedStatus='ready';
const parsed={algo:'dGVzdA==',controls:[],outputs:[],graph:{nodes:[],wires:[]},warnings:[]};
mock.module('../worker/storage.js',{exports:{
 get:async()=>({id:'source',owner:'owner',status:storedStatus,preparedKey:'source.json',filename:'source.gh',ttl:Math.floor(Date.now()/1000)+3600}),
 download:async()=>{downloads++;return Buffer.from(JSON.stringify(parsed));},
 upload:async(key,value)=>writes.push({key,value}),
 put:async(value)=>writes.push({definition:value}),
}});
mock.module('node:child_process',{exports:{execFile:(file,args,options,callback)=>{
 readFile(args[3],'utf8').then(text=>{bridgeCalls.push(JSON.parse(text));callback(null,{stdout:JSON.stringify(parsed)});},callback);
}}});
mock.module('../worker/compute.js',{exports:{
 compute:async(route)=>{computeCalls.push(route);return route==='/io'?{Inputs:[],Outputs:[],Errors:[]}:{values:[],errors:[],warnings:[]};},
 makeValues:()=>[],
}});
mock.module('../worker/geometry.js',{exports:{previewGeometry:async()=>({objects:[{kind:'point',point:[0,0,0]}],warnings:[]})}});
const {execute}=await import('../worker/execute.js');
const edit={op:'rename',nodeId:'11111111-1111-4111-8111-111111111111',text:'Name',value:null,min:null,max:null,input:null,sourceNode:null,output:null,newId:null};
const job=(count)=>({id:'candidate',type:'edit',owner:'owner',definitionId:'source',edits:Array.from({length:count},()=>({...edit}))});
function reset(){bridgeCalls=[];computeCalls=[];writes=[];downloads=0;storedStatus='ready';}

test('API-accepted batches above the old limit reach the worker bridge and solve',async()=>{
 for(const count of [0,24,25,43,54,96]){
  reset();const request=job(count);assert(graphEditsSchema.safeParse(request.edits).success);
  const result=await execute(request);
  assert.equal(result.passed,true);assert.equal(bridgeCalls[0].length,count);
  assert.deepEqual(computeCalls,['/io','/grasshopper']);
  assert.equal(result.definition.id,'candidate');
  assert.equal(writes[0].key,'prepared/owner/candidate.json');
  assert.equal(writes[1].definition.id,'candidate');
 }
});
test('API and worker reject 97 edits before downloading or executing anything',async()=>{
 reset();assert(!graphEditsSchema.safeParse(job(97).edits).success);
 await assert.rejects(execute(job(97)),/received 97; maximum is 96/);
 assert.equal(downloads,0);assert.equal(bridgeCalls.length,0);assert.equal(writes.length,0);
});
test('invalid jobs retain specific errors and never execute',async()=>{
 reset();await assert.rejects(execute({...job(0),edits:null}),/must be an array/);
 storedStatus='pending';await assert.rejects(execute(job(0)),/not ready for graph edits/);
 assert.equal(downloads,0);assert.equal(bridgeCalls.length,0);
});
