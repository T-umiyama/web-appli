'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createVideoPlan, createImagePlan, sampleIndices } = require('../apps/png-to-gif/media-tools.js');
const video = changes => ({ sourceWidth:120,sourceHeight:80,duration:4,start:1,end:3,fps:2,width:60,crop:{x:0,y:0,width:60,height:40},...changes });
test('video plan crops spatially, samples a trimmed half-open interval and keeps output ratio',()=>{
  const p=createVideoPlan(video());assert.equal(p.width,60);assert.equal(p.height,40);assert.equal(p.count,4);assert.deepEqual(p.crop,{x:0,y:0,width:60,height:40});assert.deepEqual(p.delays,[500,500,500,500]);assert.equal(p.duration,2);
  const fractional=createVideoPlan(video({start:.13,end:.88,fps:7}));assert.equal(fractional.count,6);assert.ok(fractional.start+(fractional.count-1)/fractional.fps<fractional.end);assert.ok(fractional.start+fractional.count/fractional.fps>=fractional.end);
});
test('video 24/30 FPS centisecond rounding keeps whole duration and final partial frame',()=>{
  for(const fps of[7,24,30]){
    const p=createVideoPlan(video({start:0,end:1,fps}));assert.equal(p.count,fps);assert.equal(p.delays.reduce((a,b)=>a+b,0),1000);assert.equal(p.duration,1);assert.ok(p.delays.every(d=>d>=10&&d%10===0));
  }
  const p=createVideoPlan(video({start:0,end:1.12,fps:2}));assert.equal(p.count,3);assert.deepEqual(p.delays,[500,500,120]);assert.equal(p.duration,1.12);
});
test('video plan rejects invalid trim, FPS, crop and empty numeric fields',()=>{
  for(const changes of[{start:3,end:1},{start:2,end:2},{start:-.1},{end:4.01},{fps:0},{fps:30.5},{fps:31},{fps:''},{start:''},{width:''},{crop:null},{crop:{x:61,y:0,width:60,height:40}},{crop:{x:0,y:41,width:60,height:40}},{crop:{x:-1,y:0,width:60,height:40}},{crop:{x:0,y:0,width:0,height:40}},{crop:{x:0,y:0,width:60.5,height:40}}])assert.throws(()=>createVideoPlan(video(changes)),JSON.stringify(changes));
});
test('frame, side and decoded-pixel budgets prevent excessive jobs',()=>{
  assert.equal(createVideoPlan(video({duration:8,start:0,end:8,fps:30,width:1})).count,240);
  assert.throws(()=>createVideoPlan(video({duration:9,start:0,end:8.01,fps:30})),/240/);
  assert.throws(()=>createVideoPlan(video({width:1281})),/1280/);
  assert.throws(()=>createVideoPlan(video({width:1280,crop:{x:0,y:0,width:1,height:80}})),/高さ/);
  assert.throws(()=>createImagePlan({sourceWidth:100,sourceHeight:100,width:1280,frameCount:240,delayMs:500}),/6000/);
});
test('PNG output aspect ratio, centisecond delay and sample endpoints are deterministic',()=>{
  const p=createImagePlan({sourceWidth:120,sourceHeight:80,width:60,frameCount:3,delayMs:125});assert.deepEqual(p,{width:60,height:40,count:3,delayMs:130,duration:.39});
  assert.deepEqual(sampleIndices(1),[0]);assert.deepEqual(sampleIndices(2),[0,1]);assert.deepEqual(sampleIndices(240),[0,120,239]);assert.deepEqual(sampleIndices(240,1),[0]);
  for(const changes of[{frameCount:0},{frameCount:241},{delayMs:49},{delayMs:3001},{width:''}])assert.throws(()=>createImagePlan({sourceWidth:120,sourceHeight:80,width:60,frameCount:3,delayMs:500,...changes}));
});
