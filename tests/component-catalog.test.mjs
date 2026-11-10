import test from 'node:test';
import assert from 'node:assert/strict';
import { searchComponents } from '../lib/component-catalog.js';
import { graphEditsSchema } from '../lib/graph-edits.js';
test('catalog provides native sphere ports without leaking archive XML', () => {
 const result=searchComponents('Sphere');
 const sphere=result.matches.find(x=>x.name==='Sphere');
 assert.equal(sphere.id,'dabc854d-f50e-408a-b001-d043c7de151d');
 assert.equal(sphere.inputs[1].name,'Radius');
 assert.equal(sphere.inputs[1].type,'Number');
 assert(!Object.hasOwn(sphere,'xml'));
 assert(result.matches.length<=6);
 assert.equal(searchComponents('invented-executable-plugin').matches.length,0);
});
test('add operations use the bounded existing edit contract',()=>{
 const edit={op:'add',nodeId:'11111111-1111-4111-8111-111111111111',text:'dabc854d-f50e-408a-b001-d043c7de151d',value:null,min:null,max:null,input:null,sourceNode:null,output:null,newId:null};
 assert(graphEditsSchema.safeParse([edit]).success);
 assert(!graphEditsSchema.safeParse(Array(97).fill(edit)).success);
 assert(!graphEditsSchema.safeParse([{...edit,xml:'<archive />'}]).success);
});
