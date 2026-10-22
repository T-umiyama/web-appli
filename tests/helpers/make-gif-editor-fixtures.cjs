// Strong letterboxing and short-duration fixtures. All pixels are synthetic.
'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const output=path.resolve('test-results/png-to-gif-editor/fixtures');fs.mkdirSync(output,{recursive:true});
function video(name,width,height,fps,count,pixel){
  const raw=Buffer.alloc(width*height*3*count);
  for(let f=0;f<count;f++)for(let y=0;y<height;y++)for(let x=0;x<width;x++)raw.set(pixel(f,x,y),((f*height+y)*width+x)*3);
  const result=spawnSync(process.env.FFMPEG_EXECUTABLE||'ffmpeg',['-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',`${width}x${height}`,'-r',String(fps),'-i','pipe:0','-an','-c:v','libx264','-qp','0','-pix_fmt','yuv420p','-movflags','+faststart',path.join(output,name)],{input:raw,maxBuffer:1024*1024});
  if(result.error||result.status!==0)throw result.error||Error(result.stderr.toString());
}
video('portrait-quadrants.mp4',60,180,8,16,(f,x,y)=>y<90?(x<30?(f<8?[255,0,0]:[255,255,0]):[0,255,0]):(x<30?[0,0,255]:[0,255,255]));
video('one-frame-40ms.mp4',60,40,25,1,()=>[255,0,0]);
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({portrait:{width:60,height:180,duration:2,fps:8,quadrants:['top-left red then yellow each second','top-right green','bottom-left blue','bottom-right cyan']},short:{width:60,height:40,duration:.04,fps:25,frames:1}},null,2));
console.log(output);
