import test from 'node:test';
import assert from 'node:assert/strict';
import {pixelDifference} from '../tools/diagnostics/pixel-diff.mjs';
test('pixel difference retains inputs and identifies exact changed bounds including alpha',()=>{
 const before=new Uint8ClampedArray(3*2*4),after=before.slice();after[4]=3;after[23]=255;
 const result=pixelDifference(before,after,3,2);assert.equal(result.changed,2);assert.equal(result.maxDelta,255);
 assert.deepEqual(result.bounds,{x:1,y:0,width:2,height:2});assert.equal(before[4],0);assert.equal(after[4],3);
 assert.equal(pixelDifference(before,after,3,2,3).changed,1);
 const identical=pixelDifference(before,before,3,2);assert.equal(identical.changed,0);assert.equal(identical.bounds,null);
});
test('geometry, work budget and tolerance fail explicitly',()=>{
 assert.throws(()=>pixelDifference([],[],4001,1000),/limit/);
 assert.throws(()=>pixelDifference([0],[],1,1),/geometry/);
 assert.throws(()=>pixelDifference([],[],1,1,-1),/tolerance/);
});
