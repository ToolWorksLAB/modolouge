import test from 'node:test';
import assert from 'node:assert/strict';
import { searchComponents, searchComponentSet } from '../lib/component-catalog.js';
import { graphEditsSchema } from '../lib/graph-edits.js';
import native from '../worker/component-catalog.json' with {type:'json'};
import metadata from '../lib/component-catalog-data.json' with {type:'json'};
test('frontend catalog exactly matches worker metadata without native archives',()=>{
 assert.deepEqual(metadata,native.map(({xml,...c})=>c));
});
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

test('batched discovery preserves per-query matches and shares helper metadata',()=>{
 const result=searchComponentSet(['Sphere','Populate Surface',' Sphere ','unknown-plugin']);
 assert.equal(result.results.length,3);
 assert(result.results[0].matches.some(c=>c.name==='Sphere'));
 assert(result.results[1].matches.some(c=>c.name.includes('Populate')));
 assert.equal(result.results[2].matches.length,0);
 assert(result.results.every(r=>r.matches.length<=3));
 assert(result.supportComponents.some(c=>c.name==='Number Slider'));
 assert(!JSON.stringify(result).includes('"xml"'));
});
