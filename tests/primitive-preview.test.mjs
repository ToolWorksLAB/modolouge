import test from 'node:test';import assert from 'node:assert/strict';
import {primitivePreview} from '../worker/primitive-preview.js';
const p={Origin:{X:10,Y:20,Z:30},XAxis:{X:0,Y:1,Z:0},YAxis:{X:-1,Y:0,Z:0},ZAxis:{X:0,Y:0,Z:1}};
test('oriented box preview respects local plane and full intervals',()=>{
 const m=primitivePreview('Rhino.Geometry.Box',{Plane:p,X:{T0:-1,T1:1},Y:{T0:0,T1:3},Z:{T0:0,T1:4}},'box');
 const a=m.mesh.data.attributes.position.array;assert.equal(a.length,108);
 const xs=a.filter((_,i)=>i%3===0),ys=a.filter((_,i)=>i%3===1),zs=a.filter((_,i)=>i%3===2);
 assert.deepEqual([Math.min(...xs),Math.max(...xs),Math.min(...ys),Math.max(...ys),Math.min(...zs),Math.max(...zs)],[7,10,19,21,30,34]);
});
test('rectangle is closed and invalid primitive values fail explicitly',()=>{
 const c=primitivePreview('Rhino.Geometry.Rectangle3d',{Plane:p,X:{T0:0,T1:2},Y:{T0:0,T1:3}},'r');assert.equal(c.points.length,5);assert.deepEqual(c.points[0],c.points[4]);
 assert.throws(()=>primitivePreview('Rhino.Geometry.Box',{Plane:p,X:{T0:0,T1:Infinity}},'bad'));
 assert.equal(primitivePreview('System.Double',3,'n'),null);
});
