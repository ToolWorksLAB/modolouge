import test from 'node:test';
import assert from 'node:assert/strict';
import {arithmeticExpressionAllowed,preflightGraphEdits} from '../lib/graph-preflight.js';

test('early expression check accepts native arithmetic and rejects functions, malformed syntax and unbounded input',()=>{
 for(const text of ['', ' ', '-x', 'x*x', '(x+20)/(1+x)', 'x^0.5', '1e-3*x', '.5 + 2.', 'x%2', '+-x'])
  assert.equal(arithmeticExpressionAllowed(text),true,text);
 for(const text of [null, 'Sqrt(x)+20','Math.sqrt(x)','x=4','x;1','xx','2x','x+','(x','x)','1e','1e309','Infinity','NaN','.', 'x'.repeat(257),'('.repeat(20)+'x'+')'.repeat(20)])
  assert.equal(arithmeticExpressionAllowed(text),false,String(text));
 const errors=preflightGraphEdits([{op:'expression',nodeId:'sphere',input:1,text:'Sqrt(x)'}]);
 assert.match(errors[0],/Edit 1, node sphere, input 1/);
 assert.match(errors[0],/No Compute test was used/);
 assert.deepEqual(preflightGraphEdits([{op:'rename',text:'Sqrt(x)'}]),[]);
});
