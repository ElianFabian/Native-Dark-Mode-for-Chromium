import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {decodeScreenshotPng} from '../scripts/dev/diagnostics/png-pixels.mjs';
function chunk(type,data){const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4);data.copy(b,8);let crc=0xffffffff;for(const v of b.subarray(4,-4)){crc^=v;for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}b.writeUInt32BE((crc^0xffffffff)>>>0,b.length-4);return b;}
function png(data,{width=1,height=2,color=2,interlace=0}={}){const h=Buffer.alloc(13);h.writeUInt32BE(width);h.writeUInt32BE(height,4);h[8]=8;h[9]=color;h[12]=interlace;return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',h),chunk('IDAT',deflateSync(Buffer.from(data))),chunk('IEND',Buffer.alloc(0))]);}
test('PNG filters match independent RGB row vectors and preserve RGBA alpha',()=>{
 for(const [filter,second]of [[0,[15,25,35]],[1,[15,25,35]],[2,[5,5,5]],[3,[10,15,20]],[4,[5,5,5]]]){
  assert.deepEqual([...decodeScreenshotPng(png([filter,10,20,30,filter,...second])).pixels],[10,20,30,255,15,25,35,255]);
 }
 assert.deepEqual([...decodeScreenshotPng(png([1,10,20,30,30,30,30],{width:2,height:1})).pixels],[10,20,30,255,40,50,60,255]);
 assert.deepEqual([...decodeScreenshotPng(png([0,7,8,9,32],{height:1,color:6})).pixels],[7,8,9,32]);
});
test('PNG decoding rejects corrupt, oversized, truncated and unsupported encoding',()=>{
 const broken=png([0,1,2,3,0,4,5,6]);broken[20]^=1;assert.throws(()=>decodeScreenshotPng(broken),/checksum/);
 assert.throws(()=>decodeScreenshotPng(png([],{width:4001,height:1000})),/geometry/);
 assert.throws(()=>decodeScreenshotPng(png([],{color:3})),/encoding/);
 assert.throws(()=>decodeScreenshotPng(png([],{interlace:1})),/encoding/);
 assert.throws(()=>decodeScreenshotPng(png([0,1,2])),/size/);
 const regular=png([0,1,2,3,0,4,5,6]);
 for(const type of ['tRNS','acTL'])assert.throws(()=>decodeScreenshotPng(Buffer.concat([regular.subarray(0,33),chunk(type,Buffer.alloc(6)),regular.subarray(33)])),/transparency\/animation/);
 assert.throws(()=>decodeScreenshotPng(Buffer.alloc(0)),/PNG/);
});
