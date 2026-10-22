'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const codec = require('../apps/png-to-gif/gif-encoder.js');
const { inspectGif } = require('./helpers/gif-inspect.cjs');
const output = path.resolve('test-results/png-to-gif/codec');
fs.mkdirSync(output,{recursive:true});
const solid=(index,w=20,h=10)=>new Uint8Array(w*h).fill(index);
test('332 palette/index maps primary endpoints and full 256-entry palette',()=>{
  const palette=codec.palette332();assert.equal(palette.length,768);
  assert.deepEqual([...palette.slice(0,3)],[0,0,0]);assert.deepEqual([...palette.slice(765)],[255,255,255]);
  assert.deepEqual([...codec.index332(Uint8Array.from([255,0,0,255,0,255,0,255,0,0,255,255,255,255,255,255]))],[224,28,3,255]);
});
test('actual GIF independently decodes dimensions, frame order, delay and infinite loop',()=>{
  const bytes=codec.encodeGif({width:20,height:10,frames:[solid(224),solid(28),solid(3)],delayMs:125,loop:true});
  fs.writeFileSync(path.join(output,'red-green-blue.gif'),bytes);
  const gif=inspectGif(bytes);assert.equal(gif.width,20);assert.equal(gif.height,10);assert.equal(gif.frames.length,3);assert.equal(gif.loop,0);
  for(const [i,index]of[224,28,3].entries()){assert.deepEqual(gif.frames[i].indices,solid(index));assert.equal(gif.frames[i].delay,13);}
});
test('streaming encoder keeps per-frame durations and omits loop extension when off',()=>{
  const encoder=codec.createEncoder({width:20,height:10,delayMs:500,loop:false});encoder.addFrame(solid(224),70);encoder.addFrame(solid(28),140);
  const gif=inspectGif(encoder.finish());assert.equal(gif.loop,null);assert.deepEqual(gif.frames.map(f=>f.delay),[7,14]);
});
test('large high-entropy LZW stream resets before code width changes without pixel loss',()=>{
  let seed=0x12345678;const random=new Uint8Array(512*256);for(let i=0;i<random.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;random[i]=seed&255;}
  const bytes=codec.encodeGif({width:512,height:256,frames:[random],loop:false});fs.writeFileSync(path.join(output,'dictionary-boundaries.gif'),bytes);
  const frame=inspectGif(bytes).frames[0];assert.deepEqual(frame.indices,random);assert.deepEqual(frame.codeWidths,[9]);assert.ok(frame.clearCount>500);
  const flat=codec.encodeGif({width:512,height:256,frames:[solid(0,512,256)],loop:false});assert.ok(flat.length<bytes.length/10,'flat content compresses meaningfully');
});
test('LZW repeated-prefix and dictionary-boundary streams independently round trip',()=>{
  for(const size of[1,2,252,253,254,255,256,510,511,512,2048,16384]){
    for(const kind of['same','alternate','sequence']){
      const expected=Uint8Array.from({length:size},(_,i)=>kind==='same'?7:kind==='alternate'?i%2:i%256);
      const gif=inspectGif(codec.encodeGif({width:size,height:1,frames:[expected],loop:false}));
      assert.deepEqual(gif.frames[0].indices,expected,kind+' length '+size);
    }
  }
});
test('ffmpeg independent reference decoder reproduces the GIF palette colors',t=>{
  const probe=spawnSync(process.env.FFMPEG_EXECUTABLE||'ffmpeg',['-version']);if(probe.error){t.skip('ffmpeg unavailable');return;}
  const result=spawnSync(process.env.FFMPEG_EXECUTABLE||'ffmpeg',['-v','error','-i',path.join(output,'red-green-blue.gif'),'-vsync','0','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{maxBuffer:8*1024*1024});
  assert.equal(result.status,0,result.stderr.toString());assert.equal(result.stdout.length,20*10*3*3);
  for(const [f,c]of[[255,0,0],[0,255,0],[0,0,255]].entries())for(let p=0;p<200;p++)assert.deepEqual([...result.stdout.subarray((f*200+p)*3,(f*200+p)*3+3)],c);
  const randomFile=path.join(output,'dictionary-boundaries.gif'),source=inspectGif(fs.readFileSync(randomFile)).frames[0];
  const random=spawnSync(process.env.FFMPEG_EXECUTABLE||'ffmpeg',['-v','error','-i',randomFile,'-vsync','0','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{maxBuffer:8*1024*1024});
  assert.equal(random.status,0,random.stderr.toString());assert.equal(random.stdout.length,512*256*3);
  for(let p=0;p<source.indices.length;p++){const i=source.indices[p]*3;assert.deepEqual([...random.stdout.subarray(p*3,p*3+3)],[...source.palette.subarray(i,i+3)]);}
});
test('invalid dimensions, frame lengths and non-finite delays are rejected',()=>{
  for(const width of[0,-1,1.5,65536,NaN])assert.throws(()=>codec.encodeGif({width,height:10,frames:[solid(1)]}));
  assert.throws(()=>codec.encodeGif({width:20,height:10,frames:[]}));assert.throws(()=>codec.encodeGif({width:20,height:10,frames:[new Uint8Array(2)]}));
  for(const delayMs of[NaN,Infinity,-1])assert.throws(()=>codec.encodeGif({width:20,height:10,frames:[solid(1)],delayMs}));
});
