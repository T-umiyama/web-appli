// Independent GIF parser / LZW decoder for exported-file verification.
'use strict';
const assert = require('node:assert/strict');
function inspectGif(input) {
  const bytes = Buffer.from(input); let pos = 0;
  const take = count => { assert.ok(pos + count <= bytes.length, 'truncated GIF'); const out = bytes.subarray(pos,pos+count); pos += count; return out; };
  const byte = () => take(1)[0], u16 = () => take(2).readUInt16LE();
  assert.match(take(6).toString(), /^GIF8[79]a$/);
  const width=u16(),height=u16(),packed=byte(),background=byte();byte();
  const globalPalette=packed&128?take(3*(1<<((packed&7)+1))):null;
  const blocks=()=>{const out=[];let n;while((n=byte())!==0)out.push(take(n));return Buffer.concat(out);};
  let control={delay:0,disposal:0,transparent:null},loop=null,trailer=false;const frames=[];
  while(pos<bytes.length){
    const marker=byte();
    if(marker===0x3b){trailer=true;break;}
    if(marker===0x21){const type=byte();if(type===0xf9){assert.equal(byte(),4);const f=byte(),delay=u16(),index=byte();assert.equal(byte(),0);control={delay,disposal:(f>>2)&7,transparent:f&1?index:null};}else if(type===0xff){const app=take(byte()).toString();const payload=blocks();if(app==='NETSCAPE2.0'||app==='ANIMEXTS1.0')loop=payload.readUInt16LE(1);}else{blocks();}continue;}
    assert.equal(marker,0x2c,'image descriptor');
    const left=u16(),top=u16(),w=u16(),h=u16(),flags=byte();
    const palette=flags&128?take(3*(1<<((flags&7)+1))):globalPalette;
    const min=byte(),data=blocks(),decoded=decodeLzw(data,min,w*h);
    assert.equal(flags&64,0,'fixture outputs are not interlaced');
    frames.push({left,top,width:w,height:h,palette:Buffer.from(palette),...control,...decoded});control={delay:0,disposal:0,transparent:null};
  }
  assert.ok(trailer,'GIF trailer'); assert.equal(pos,bytes.length,'no trailing garbage');
  return {width,height,background,loop,frames};
}
function decodeLzw(data,min,expected){
  const clear=1<<min,end=clear+1;let width=min+1,next=end+1,bit=0,previous=null,clearCount=0,ended=false;
  let dictionary=[];const pixels=[],widths=new Set();
  const reset=()=>{dictionary=Array.from({length:clear},(_,i)=>[i]);next=end+1;width=min+1;previous=null;};
  reset();
  while(bit+width<=data.length*8){
    widths.add(width);let code=0;for(let i=0;i<width;i++)code|=((data[(bit+i)>>3]>>((bit+i)&7))&1)<<i;bit+=width;
    if(code===clear){clearCount++;reset();continue;}
    if(code===end){ended=true;break;}
    let entry=dictionary[code];if(!entry&&code===next&&previous)entry=[...previous,previous[0]];
    assert.ok(entry,'valid LZW dictionary code '+code+' / '+next+' at bit '+bit);pixels.push(...entry);
    if(previous&&next<4096){dictionary[next++]=[...previous,entry[0]];if(next===(1<<width)&&width<12)width++;}
    previous=entry;
  }
  assert.ok(ended,'LZW end code');assert.equal(pixels.length,expected,'decoded pixel count');
  return {indices:Uint8Array.from(pixels),clearCount,codeWidths:[...widths]};
}
module.exports={inspectGif,decodeLzw};
