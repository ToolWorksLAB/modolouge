import test from 'node:test';
import assert from 'node:assert/strict';
import {makeValues} from '../worker/compute.js';
import {estimate} from '../lib/config.js';
const control={name:'radius',label:'Radius',kind:'number',min:2,max:30,value:12,interval:0};
test('numeric bounds are enforced on the server',()=>{assert.equal(makeValues([control],{radius:100})[0].InnerTree['{0}'][0].data,'30');assert.equal(makeValues([control],{radius:-4})[0].InnerTree['{0}'][0].data,'2');});
test('non-finite numbers and mismatched booleans are rejected',()=>{for(const radius of [NaN,Infinity,'12',null])assert.throws(()=>makeValues([control],{radius}));assert.throws(()=>makeValues([{...control,kind:'boolean'}],{radius:'true'}));});
test('odd and even integer sliders retain parity at boundaries',()=>{for(const interval of [2,3])for(const value of [-50,2,4.7,100]){const result=+makeValues([{...control,interval}],{radius:value})[0].InnerTree['{0}'][0].data;assert.ok(result>=2&&result<=30);assert.equal(result%2,interval===3?1:0);}});
test('zero job time allocates zero cost',()=>{assert.equal(estimate(0),0);assert.ok(estimate(3600)>.5);});
