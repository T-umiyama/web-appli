// PC Chrome visual-editing regression. Only locally generated fixtures are used.
'use strict';
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {inspectGif}=require(path.resolve('tests/helpers/gif-inspect.cjs'));
const output=path.resolve('test-results/png-to-gif-editor/browser');fs.mkdirSync(output,{recursive:true});
for(const script of[path.resolve('tests/helpers/make-gif-fixtures.cjs'),path.resolve('tests/helpers/make-gif-editor-fixtures.cjs')]){
  const result=spawnSync(process.execPath,[script],{encoding:'utf8'});if(result.status!==0)throw Error(result.stderr||result.stdout);
}
const fixture=name=>path.resolve('test-results/png-to-gif/fixtures',name),extra=name=>path.resolve('test-results/png-to-gif-editor/fixtures',name);
const checks=[],errors=[],requests=[],observations={};
const pass=message=>{checks.push(message);console.log('PASS '+message);};
const close=(actual,expected,tolerance=.021,message='value')=>assert.ok(Math.abs(actual-expected)<=tolerance,`${message}: ${actual} vs ${expected}`);
const pixel=(f,x,y)=>{const i=f.indices[y*f.width+x]*3;return[...f.palette.subarray(i,i+3)];};
const color=(actual,expected)=>assert.ok(actual.every((v,i)=>Math.abs(v-expected[i])<=2),JSON.stringify(actual)+' vs '+JSON.stringify(expected));
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1,acceptDownloads:true});page.setDefaultTimeout(15000);
 page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(!/^(file|blob|data):/.test(r.url()))requests.push(r.url());});
 const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const ready=()=>page.waitForFunction(()=>!document.querySelector('#convert').disabled);
 const estimate=async()=>{await page.waitForFunction(()=>/\d/.test(document.querySelector('#estimate').textContent)&&!/見積もり中|計算中/.test(document.querySelector('#estimate').textContent));return page.locator('#estimate').textContent();};
 const values=()=>page.evaluate(()=>Object.fromEntries(['trimStart','trimEnd','cropX','cropY','cropWidth','cropHeight'].map(id=>[id,Number(document.getElementById(id).value)])));
 const fill=async(id,v)=>{await page.locator('#'+id).fill(String(v));await page.locator('#'+id).press('Tab');await settle();};
 const setRange=async(start,end)=>{await fill('trimStart',start);await fill('trimEnd',end);};
 const setCrop=async(x,y,w,h)=>{await fill('cropX',0);await fill('cropY',0);await fill('cropWidth',w);await fill('cropHeight',h);await fill('cropX',x);await fill('cropY',y);await settle();};
 const expectCrop=async(expected)=>{const v=await values();for(const[k,value]of Object.entries(expected))assert.equal(v[k],value,k);};
 const result=()=>page.evaluate(()=>({src:document.querySelector('#resultImage').getAttribute('src'),href:document.querySelector('#download').getAttribute('href'),info:document.querySelector('#resultInfo').textContent}));
 const center=async(selector)=>{const r=await page.locator(selector).boundingBox();assert.ok(r,selector+' visible');return{x:r.x+r.width/2,y:r.y+r.height/2};};
 const drag=async(from,to,cancel)=>{await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:8});await settle();if(cancel==='escape')await page.keyboard.press('Escape');if(cancel==='pointer')await page.locator(cancelSurface).dispatchEvent('pointercancel',{pointerId:1,pointerType:'mouse',bubbles:true});await page.mouse.up();await settle();};
 let cancelSurface='#timelineTrack';
 const track=async()=>{await page.locator('.timeline-shell').scrollIntoViewIfNeeded();return page.locator('#timelineTrack').evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return{x:r.left+parseFloat(s.borderLeftWidth)+parseFloat(s.paddingLeft),y:r.top+parseFloat(s.borderTopWidth)+parseFloat(s.paddingTop),width:el.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight),height:el.clientHeight-parseFloat(s.paddingTop)-parseFloat(s.paddingBottom)};});};
 const timePoint=async(time)=>{const t=await track(),duration=await page.locator('#sourceVideo').evaluate(v=>v.duration);return{x:t.x+t.width*time/duration,y:t.y+t.height/2};};
 const timelineDrag=async(selector,time,cancel)=>{const t=await track(),duration=await page.locator('#sourceVideo').evaluate(v=>v.duration);cancelSurface='#timelineTrack';const grab=selector==='#playhead'?selector:selector+' span';const from=await center(grab),to={x:t.x+t.width*time/duration,y:t.y+t.height/2};await drag(from,to,cancel);await page.waitForFunction(()=>!document.querySelector('#sourceVideo').seeking);};
 const geometry=async()=>{await page.locator('#videoViewport').scrollIntoViewIfNeeded();return page.locator('#sourceVideo').evaluate(v=>{const r=v.getBoundingClientRect(),s=getComputedStyle(v),l=parseFloat(s.borderLeftWidth)+parseFloat(s.paddingLeft),t=parseFloat(s.borderTopWidth)+parseFloat(s.paddingTop),cw=r.width-parseFloat(s.borderLeftWidth)-parseFloat(s.borderRightWidth)-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight),ch=r.height-parseFloat(s.borderTopWidth)-parseFloat(s.borderBottomWidth)-parseFloat(s.paddingTop)-parseFloat(s.paddingBottom),scale=Math.min(cw/v.videoWidth,ch/v.videoHeight);return{x:r.x+l+(cw-v.videoWidth*scale)/2,y:r.y+t+(ch-v.videoHeight*scale)/2,width:v.videoWidth*scale,height:v.videoHeight*scale,scale,sourceWidth:v.videoWidth,sourceHeight:v.videoHeight,element:{x:r.x+l,y:r.y+t,width:cw,height:ch}};});};
 const sourcePoint=(g,x,y)=>({x:g.x+x*g.scale,y:g.y+y*g.scale});
 const drawCrop=async(x1,y1,x2,y2)=>{await page.locator('#cropDraw').click();const g=await geometry();cancelSurface='#videoViewport';await drag(sourcePoint(g,x1===0?.2:x1,y1===0?.2:y1),sourcePoint(g,x2,y2));};
 const moveCrop=async(dx,dy,cancel)=>{await page.locator('#cropMove').click();const g=await geometry(),v=await values();cancelSurface='#videoViewport';const p=sourcePoint(g,v.cropX+v.cropWidth/2,v.cropY+v.cropHeight/2);await drag(p,{x:p.x+dx*g.scale,y:p.y+dy*g.scale},cancel);};
 const resize=async(handle,dx,dy,cancel)=>{const g=await geometry();cancelSurface='#videoViewport';const p=await center('[data-crop-handle="'+handle+'"]');await drag(p,{x:p.x+dx*g.scale,y:p.y+dy*g.scale},cancel);};
 const aligned=async()=>{const g=await geometry(),v=await values(),r=await page.locator('#cropOverlay').boundingBox();close(r.x,g.x+v.cropX*g.scale,1.2,'crop left');close(r.y,g.y+v.cropY*g.scale,1.2,'crop top');close(r.width,v.cropWidth*g.scale,1.2,'crop width');close(r.height,v.cropHeight*g.scale,1.2,'crop height');};
 const importVideo=async(filename)=>{await page.locator('#videoFile').setInputFiles(filename);await page.waitForFunction(()=>!document.querySelector('#videoSettings').disabled&&document.querySelector('#sourceVideo').readyState>=2);await ready();await settle();};
 const convert=async(name)=>{await ready();const old=(await result()).src;await page.locator('#convert').click();await page.waitForFunction(old=>{const s=document.querySelector('#resultImage').getAttribute('src');return s&&s!==old;},old,{timeout:30000});await ready();const event=page.waitForEvent('download');await page.locator('#download').click();const download=await event,filename=path.join(output,name+'.gif');await download.saveAs(filename);const bytes=fs.readFileSync(filename),gif=inspectGif(bytes);observations[name]={bytes:bytes.length,width:gif.width,height:gif.height,frames:gif.frames.length,delaysCs:gif.frames.map(f=>f.delay)};return gif;};
 try{
  await page.goto('file://'+path.resolve('apps/png-to-gif/index.html'));await page.locator('#videoTab').click();await importVideo(fixture('quadrants-timeline.mp4'));
  assert.equal(await page.locator('#sourceVideo').evaluate(v=>v.controls),false);assert.equal(await page.locator('[data-crop-handle]').count(),8);
  await timelineDrag('#trimStartHandle',1);await timelineDrag('#trimEndHandle',3);let v=await values();close(v.trimStart,1);close(v.trimEnd,3);observations.dragRange=v;
  pass('タイムラインIN/OUTドラッグが開始1秒・終了3秒へ同期');
  await setRange(0,4);await fill('videoFps',30);await fill('outputWidth',1280);assert.equal(await page.locator('#convert').isDisabled(),true);assert.equal(await page.locator('#trimEndHandle').isEnabled(),true);
  await timelineDrag('#trimEndHandle',1);await ready();close((await values()).trimEnd,1);observations.repairedOutputPlan=await page.locator('#planInfo').textContent();await fill('outputWidth',120);await fill('videoFps',10);await setRange(1,3);
  pass('出力画素数の上限エラー中も視覚編集は有効で、OUT短縮で作成可能な範囲へ修復');
  await setRange(.5,2.5);let t=await track(),start=await center('#trimStartHandle'),end=await center('#trimEndHandle');close((start.x-t.x)/t.width,.125,.006,'number→start handle');close((end.x-t.x)/t.width,.625,.006,'number→end handle');
  await setRange(1,3);await page.locator('#trimStartHandle').focus();await page.keyboard.press('ArrowRight');close((await values()).trimStart,1.01,.001);await page.keyboard.press('Shift+ArrowRight');close((await values()).trimStart,2.01,.001);await page.keyboard.press('Home');close((await values()).trimStart,0,.001);await page.keyboard.press('End');v=await values();assert.ok(v.trimStart<v.trimEnd);close(v.trimEnd-v.trimStart,.01,.001);
  await page.locator('#trimEndHandle').focus();await page.keyboard.press('End');close((await values()).trimEnd,4,.001);await setRange(1,3);
  pass('数値入力とhandle位置が双方向同期し、矢印・Shift・Home/Endで範囲を調整');
  await timelineDrag('#trimStartHandle',3.8);v=await values();assert.ok(v.trimStart<v.trimEnd);assert.ok(v.trimEnd-v.trimStart>=.009);await setRange(1,3);
  await timelineDrag('#trimStartHandle',2,'escape');close((await values()).trimStart,1,.001);await timelineDrag('#trimEndHandle',2.2,'pointer');close((await values()).trimEnd,3,.001);
  pass('ハンドル交差を抑止し、Escape・pointercancelで時間範囲を復元');
  t=await track();let p=await timePoint(2.25);await page.mouse.click(p.x,p.y);await page.waitForFunction(()=>!document.querySelector('#sourceVideo').seeking&&Math.abs(document.querySelector('#sourceVideo').currentTime-2.25)<.025);close(await page.locator('#sourceVideo').evaluate(v=>v.currentTime),2.25);
  await timelineDrag('#playhead',.5);close(await page.locator('#sourceVideo').evaluate(v=>v.currentTime),.5);await timelineDrag('#playhead',2.25,'escape');close(await page.locator('#sourceVideo').evaluate(v=>v.currentTime),.5);
  await page.locator('#playhead').focus();await page.keyboard.press('ArrowRight');close(await page.locator('#sourceVideo').evaluate(v=>v.currentTime),.51,.015);
  await page.locator('#toggleVideoPlayback').click();await page.waitForFunction(()=>document.querySelector('#sourceVideo').currentTime>.65);await page.locator('#toggleVideoPlayback').click();assert.equal(await page.locator('#sourceVideo').evaluate(v=>v.paused),true);
  await setRange(1,1.5);await page.locator('#previewTrim').click();await page.waitForFunction(()=>!document.querySelector('#sourceVideo').paused);await page.waitForFunction(()=>document.querySelector('#sourceVideo').paused&&document.querySelector('#sourceVideo').currentTime>=1.48);close(await page.locator('#sourceVideo').evaluate(v=>v.currentTime),1.5,.15);await setRange(1,3);
  pass('タイムラインscrub・playheadドラッグ/キー・再生停止・指定区間再生が映像と同期');
  await drawCrop(10,10,50,35);await expectCrop({cropX:10,cropY:10,cropWidth:40,cropHeight:25});await aligned();
  await page.locator('#resetCrop').click();await drawCrop(50,35,10,10);await expectCrop({cropX:10,cropY:10,cropWidth:40,cropHeight:25});
  await moveCrop(10,10);await expectCrop({cropX:20,cropY:20,cropWidth:40,cropHeight:25});await aligned();
  pass('映像上で切り取り枠を新規描画・移動し、元動画pxと枠表示が一致');
  const handleCases=[['n',0,-5,{cropX:20,cropY:15,cropWidth:60,cropHeight:45}],['s',0,5,{cropX:20,cropY:20,cropWidth:60,cropHeight:45}],['w',-5,0,{cropX:15,cropY:20,cropWidth:65,cropHeight:40}],['e',5,0,{cropX:20,cropY:20,cropWidth:65,cropHeight:40}],['nw',-5,-5,{cropX:15,cropY:15,cropWidth:65,cropHeight:45}],['ne',5,-5,{cropX:20,cropY:15,cropWidth:65,cropHeight:45}],['sw',-5,5,{cropX:15,cropY:20,cropWidth:65,cropHeight:45}],['se',5,5,{cropX:20,cropY:20,cropWidth:65,cropHeight:45}]];
  for(const[handle,dx,dy,expected]of handleCases){await setCrop(20,20,60,40);await resize(handle,dx,dy);await expectCrop(expected);await aligned();}
  pass('四隅と四辺の全8handleでresizeし、元pxの位置・大きさへ正しく反映');
  await setCrop(20,20,60,40);const beforeCancel=await values();await moveCrop(10,5,'escape');assert.deepEqual(await values(),beforeCancel);await resize('se',10,5,'pointer');assert.deepEqual(await values(),beforeCancel);
  await setCrop(20,20,20,20);await moveCrop(120,80);await expectCrop({cropX:100,cropY:60,cropWidth:20,cropHeight:20});await moveCrop(-110,-70);await expectCrop({cropX:0,cropY:0,cropWidth:20,cropHeight:20});
  await setCrop(20,20,60,40);await resize('w',100,0);await expectCrop({cropX:79,cropWidth:1});await resize('n',0,100);await expectCrop({cropY:59,cropHeight:1});
  await page.locator('#cropOverlay').focus();for(let i=0;i<12;i++)await page.keyboard.press('Shift+ArrowRight');for(let i=0;i<8;i++)await page.keyboard.press('Shift+ArrowDown');await expectCrop({cropX:119,cropY:79,cropWidth:1,cropHeight:1});
  for(let i=0;i<12;i++)await page.keyboard.press('Shift+ArrowLeft');for(let i=0;i<8;i++)await page.keyboard.press('Shift+ArrowUp');await expectCrop({cropX:0,cropY:0,cropWidth:1,cropHeight:1});
  await page.keyboard.press('ArrowRight');await page.keyboard.press('Shift+ArrowDown');await expectCrop({cropX:1,cropY:10,cropWidth:1,cropHeight:1});
  pass('cropのEscape/pointercancel復元・1px最小・映像端clamp・キーボード移動を確認');
  await drawCrop(0,0,60,40);await expectCrop({cropX:0,cropY:0,cropWidth:60,cropHeight:40});await setRange(1,3);await fill('videoFps',2);await fill('outputWidth',60);await ready();observations.interactiveEstimate=await estimate();
  const gif=await convert('interactive-trim-crop');assert.equal(gif.width,60);assert.equal(gif.height,40);assert.equal(gif.frames.length,4);for(const[i,c]of[[0,255,0],[0,255,0],[0,0,255],[0,0,255]].entries()){color(pixel(gif.frames[i],30,20),c);assert.equal(gif.frames[i].delay,50);}
  const successful=await result();await moveCrop(5,5);assert.deepEqual(await result(),successful);await estimate();await page.screenshot({path:path.join(output,'landscape-editor.png'),fullPage:true});
  pass('グラフィカル指定を実GIFの60×40・4フレーム・緑緑青青・500msで検証し、設定変更後も成功GIF保持');
  await setRange(0,4);await fill('videoFps',30);await fill('outputWidth',640);await ready();const beforeBusy=await values();await page.locator('#convert').click();
  for(const selector of['#trimStartHandle','#trimEndHandle','#playhead','#cropDraw','[data-crop-handle="se"]'])assert.equal(await page.locator(selector).isDisabled(),true,selector+' disabled while converting');
  const bg=await geometry();await page.mouse.click(bg.x+bg.width*.75,bg.y+bg.height*.75);assert.deepEqual(await values(),beforeBusy);await page.locator('#cancel').click();await ready();assert.deepEqual(await result(),successful);await estimate();
  pass('変換中はタイムライン/crop操作を無効化し、取消後も成功GIFと見積もりを保持');
  await importVideo(extra('portrait-quadrants.mp4'));await page.locator('#resetCrop').click();let g=await geometry();assert.ok(g.element.width-g.width>100,'portrait has strong pillarboxing');const full=await values();
  await page.locator('#cropDraw').click();cancelSurface='#videoViewport';await drag({x:g.element.x+8,y:g.y+g.height*.2},{x:g.element.x+35,y:g.y+g.height*.7});assert.deepEqual(await values(),full);
  await drawCrop(5,20,25,80);await expectCrop({cropX:5,cropY:20,cropWidth:20,cropHeight:60});await aligned();
  for(const width of[1280,1680]){await page.setViewportSize({width,height:1100});await settle();await aligned();await moveCrop(5,5);v=await values();assert.equal(v.cropX,width===1280?10:15);assert.equal(v.cropY,width===1280?25:30);}
  await setCrop(5,20,20,60);await fill('trimStart',0);await fill('trimEnd',1);await fill('videoFps',2);await fill('outputWidth',20);await ready();const portrait=await convert('portrait-pillarbox');assert.equal(portrait.width,20);assert.equal(portrait.height,60);assert.equal(portrait.frames.length,2);for(const f of portrait.frames)color(pixel(f,10,30),[255,0,0]);
  await page.screenshot({path:path.join(output,'portrait-editor.png'),fullPage:true});
  pass('portrait黒帯での描画を除外し、枠線・viewport幅変更後も元px座標が一致。実GIFも20×60の赤2frame');
  await importVideo(extra('one-frame-40ms.mp4'));await page.locator('#trimStartHandle').focus();await page.keyboard.press('End');v=await values();assert.ok(v.trimStart>=0&&v.trimStart<v.trimEnd&&v.trimEnd<=.041);
  await page.locator('#trimEndHandle').focus();await page.keyboard.press('Home');v=await values();assert.ok(v.trimStart<v.trimEnd);await timelineDrag('#trimStartHandle',0);await timelineDrag('#trimEndHandle',.04);await ready();assert.ok((await values()).trimStart<(await values()).trimEnd);
  pass('40ms短動画でも端と最小区間を守り、有効な開始/終了へ戻せる');
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);pass('PC Chrome/file://でブラウザ例外・外部通信なし');
 }catch(error){observations.failure=String(error.stack||error);observations.values=await values().catch(()=>null);await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});throw error;}
 finally{fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({browser:await browser.version(),checks,errors,requests,observations,limitations:['合成MP4とPC Chromeのmouse/keyboardのみ。OSネイティブ選択・他端末・実データ・他codecは対象外。']},null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
