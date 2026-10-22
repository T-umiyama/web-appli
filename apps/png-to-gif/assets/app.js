(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const ids = ['pngTab','videoTab','pngPanel','videoPanel','pngDrop','pngFiles','videoDrop','videoFile','frames','emptyFrames','frameCount','clearFrames','sourceVideo','videoStage','videoInfo','cropOverlay','videoSettings','trimStart','trimEnd','cropX','cropY','cropWidth','cropHeight','videoFps','resetCrop','setStart','setEnd','previewTrim','preview','previewEmpty','previewInfo','previewTitle','playPreview','outputSettings','outputWidth','background','delayLabel','frameDelay','loop','planInfo','estimate','estimateNote','refreshEstimate','convert','cancel','progress','status','result','resultInfo','resultState','resultImage','download'];
  const el = Object.fromEntries(ids.map(id => [id, $(id)]));
  const { LIMITS, createImagePlan, createVideoPlan, sampleIndices } = MediaGifTools;
  const state = { mode: 'png', frames: [], video: null, index: 0, playing: false, timer: null, drag: null, task: null, estimateAbort: null, estimateTimer: null, revision: 0, result: null };
  const ctx = el.preview.getContext('2d', { willReadFrequently: true });
  const videoEditor = VideoGifEditor.create({ video: el.sourceVideo, getSource: () => state.video, isEnabled: () => state.mode === 'video' && !state.task, onChange: () => { stopPreview(); changed(); }, onFrame: () => { if (state.mode === 'video') drawPreview(); }, onStatus: status });
  function sizeText(bytes) { return bytes < 1024 ? bytes + ' B' : bytes < 1048576 ? (bytes / 1024).toFixed(1) + ' KiB' : (bytes / 1048576).toFixed(2) + ' MiB'; }
  function status(text, error = false) { el.status.textContent = text; el.status.classList.toggle('error', error); }
  function abortError() { return new DOMException('取り消しました。', 'AbortError'); }
  function checkAbort(signal) { if (signal.aborted) throw abortError(); }
  function breathe(signal) { return new Promise((resolve, reject) => { setTimeout(() => { if (signal.aborted) reject(abortError()); else resolve(); }, 0); }); }
  function getPlan() {
    if (state.mode === 'png') {
      if (!state.frames.length) throw new Error('PNG画像を追加してください。');
      const first = state.frames[0];
      return createImagePlan({ sourceWidth: first.image.naturalWidth, sourceHeight: first.image.naturalHeight, width: el.outputWidth.value, frameCount: state.frames.length, delayMs: el.frameDelay.value });
    }
    if (!state.video) throw new Error('MP4動画を追加してください。');
    return createVideoPlan({ sourceWidth: state.video.width, sourceHeight: state.video.height, duration: state.video.duration, start: el.trimStart.value, end: el.trimEnd.value, fps: el.videoFps.value, width: el.outputWidth.value, crop: { x: el.cropX.value, y: el.cropY.value, width: el.cropWidth.value, height: el.cropHeight.value } });
  }
  function safePlan() { try { return getPlan(); } catch (_) { return null; } }
  function updateControls() {
    const busy = Boolean(state.task), plan = safePlan();
    for (const id of ['pngTab','videoTab','pngDrop','videoDrop','pngFiles','videoFile']) el[id].disabled = busy;
    el.outputSettings.disabled = busy;
    el.videoSettings.disabled = busy || !state.video;
    el.clearFrames.disabled = busy || !state.frames.length;
    el.playPreview.disabled = busy || state.mode !== 'png' || !state.frames.length;
    el.convert.disabled = busy || !plan;
    el.refreshEstimate.disabled = busy || !plan;
    el.cancel.hidden = !busy;
    el.cancel.disabled = !busy || state.task.signal.aborted;
    el.sourceVideo.controls = false;
    videoEditor.refresh();
    for (const button of el.frames.querySelectorAll('button')) button.disabled = busy || button.dataset.boundary === 'true';
    for (const card of el.frames.children) card.draggable = !busy;
  }
  function setTask(controller, text) {
    state.task = controller; stopPreview(); stopEstimate();
    if (state.video) videoEditor.stopPlayback();
    el.progress.hidden = false; el.progress.value = 0;
    status(text); updateControls();
  }
  function finishTask(controller) {
    if (state.task !== controller) return;
    state.task = null; el.progress.hidden = true; updateControls();
  }
  function stopEstimate() {
    clearTimeout(state.estimateTimer);
    if (state.estimateAbort) state.estimateAbort.abort();
    state.estimateAbort = null;
  }
  function outputInfo(plan) {
    return plan.width + ' × ' + plan.height + ' px · ' + plan.count + 'フレーム · GIF約' + plan.duration.toFixed(2) + '秒';
  }
  function updateResultState() {
    if (!state.result) return;
    el.resultState.textContent = state.result.revision === state.revision ? '現在の設定で作成したGIFです。' : '前回成功したGIFです。入力・設定を変更したため、現在の設定はまだ反映されていません。';
  }
  function changed(markRevision = true) {
    if (markRevision) state.revision++;
    stopEstimate();
    let plan;
    try { plan = getPlan(); el.planInfo.textContent = outputInfo(plan) + (state.mode === 'video' ? '（GIFは10 ms単位）' : ''); }
    catch (error) { el.planInfo.textContent = error.message; }
    el.estimate.textContent = plan ? '再計算中…' : '—';
    el.estimateNote.textContent = plan ? '設定を反映しています。最大3フレームを実際に圧縮します。' : '有効な入力と設定が揃うと、作成前に容量を表示します。';
    updateControls(); updateResultState(); drawPreview(); updateCropOverlay();
    if (plan && !state.task) state.estimateTimer = setTimeout(estimate, 450);
  }
  function defaultWidth(width, height) { return Math.max(1, Math.min(width, LIMITS.maxSide, Math.floor(LIMITS.maxSide * width / height))); }
  function fitImage(context, image, width, height, background) {
    context.fillStyle = background; context.fillRect(0, 0, width, height);
    const factor = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    const w = Math.max(1, Math.round(image.naturalWidth * factor)), h = Math.max(1, Math.round(image.naturalHeight * factor));
    context.drawImage(image, Math.round((width - w) / 2), Math.round((height - h) / 2), w, h);
  }
  function drawPreview() {
    const outputPlan = safePlan(), source = state.mode === 'png' ? state.frames[state.index] : state.video;
    let plan = outputPlan;
    if (!plan && state.mode === 'video' && source) {
      const crop = videoEditor.getCrop();
      if (crop) { const factor = Math.min(1, 640 / crop.width, 640 / crop.height); plan = { width: Math.max(1, Math.round(crop.width * factor)), height: Math.max(1, Math.round(crop.height * factor)), crop }; }
    }
    const ready = source && plan && (state.mode === 'png' || el.sourceVideo.readyState >= 2);
    el.preview.style.display = ready ? 'block' : 'none'; el.previewEmpty.hidden = Boolean(ready);
    el.playPreview.hidden = state.mode !== 'png';
    el.previewTitle.textContent = state.mode === 'png' ? '入力プレビュー' : '切り取り後のプレビュー';
    if (!ready) { el.previewInfo.textContent = plan ? '動画の読込完了を待っています。' : '有効な入力と設定を指定してください。'; return; }
    el.preview.width = plan.width; el.preview.height = plan.height;
    if (state.mode === 'png') fitImage(ctx, source.image, plan.width, plan.height, el.background.value);
    else {
      ctx.fillStyle = el.background.value; ctx.fillRect(0, 0, plan.width, plan.height);
      const crop = plan.crop; ctx.drawImage(el.sourceVideo, crop.x, crop.y, crop.width, crop.height, 0, 0, plan.width, plan.height);
    }
    // Match the exported palette in the input preview, including color reduction.
    const data = ctx.getImageData(0, 0, plan.width, plan.height), palette = GifEncoder.palette332();
    const indices = GifEncoder.index332(data.data);
    for (let i = 0; i < indices.length; i++) { const p = indices[i] * 3, d = i * 4; data.data[d] = palette[p]; data.data[d + 1] = palette[p + 1]; data.data[d + 2] = palette[p + 2]; data.data[d + 3] = 255; }
    ctx.putImageData(data, 0, 0);
    el.previewInfo.textContent = state.mode === 'png' ? (state.index + 1) + ' / ' + plan.count + ' 枚 · ' + outputInfo(plan) : '現在位置 ' + el.sourceVideo.currentTime.toFixed(2) + '秒 · ' + (outputPlan ? outputInfo(outputPlan) : '切り取り ' + plan.crop.width + ' × ' + plan.crop.height + ' px（出力設定を確認してください）');
    Array.from(el.frames.children).forEach((card, i) => card.classList.toggle('active', i === state.index));
  }
  function stopPreview() { state.playing = false; clearTimeout(state.timer); el.playPreview.textContent = '再生'; }
  function playStep() {
    if (!state.playing || state.mode !== 'png' || !state.frames.length) return;
    state.timer = setTimeout(() => {
      if (state.index + 1 >= state.frames.length && !el.loop.checked) { stopPreview(); return; }
      state.index = (state.index + 1) % state.frames.length; drawPreview(); playStep();
    }, Math.max(50, Number(el.frameDelay.value) || 500));
  }
  function loadImage(url, signal) {
    return new Promise((resolve, reject) => {
      const image = new Image(); let settled = false;
      const clean = () => { image.onload = null; image.onerror = null; signal.removeEventListener('abort', aborted); clearTimeout(timeout); };
      const done = (error) => { if (settled) return; settled = true; clean(); if (error) { image.src = ''; reject(error); } else resolve(image); };
      const aborted = () => done(abortError());
      const timeout = setTimeout(() => done(new Error('PNGの読込がタイムアウトしました。')), 20000);
      image.onload = () => done(); image.onerror = () => done(new Error('PNGを読み込めません。ファイルが壊れていないか確認してください。'));
      signal.addEventListener('abort', aborted, { once: true });
      if (signal.aborted) aborted(); else image.src = url;
    });
  }
  async function addPngs(fileList) {
    if (state.task) return;
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const pending = [], controller = new AbortController();
    try {
      if (files.some(file => !(/\.png$/i.test(file.name) || file.type === 'image/png'))) throw new Error('PNG画像だけを選択してください。');
      if (state.frames.length + files.length > LIMITS.maxFrames) throw new Error('PNGは合計240枚まで追加できます。');
      if (files.some(file => file.size > LIMITS.maxPngBytes)) throw new Error('PNGは1枚25 MiBまでです。');
      const totalBytes = state.frames.reduce((n, frame) => n + frame.file.size, 0) + files.reduce((n, file) => n + file.size, 0);
      if (totalBytes > LIMITS.maxPngTotalBytes) throw new Error('PNGのファイル容量は合計150 MiBまでです。');
      setTask(controller, 'PNGを読み込んでいます…');
      let totalPixels = state.frames.reduce((n, frame) => n + frame.image.naturalWidth * frame.image.naturalHeight, 0);
      for (let i = 0; i < files.length; i++) {
        checkAbort(controller.signal);
        const file = files[i];
        const header = new DataView(await file.slice(0, 24).arrayBuffer());
        checkAbort(controller.signal);
        if (header.byteLength < 24 || header.getUint32(0) !== 0x89504e47 || header.getUint32(4) !== 0x0d0a1a0a || header.getUint32(12) !== 0x49484452) throw new Error('正しいPNGファイルではありません。');
        const headerPixels = header.getUint32(16) * header.getUint32(20);
        if (!headerPixels || headerPixels > LIMITS.maxImagePixels) throw new Error('PNGの元画像は1枚3200万画素までです。');
        if (totalPixels + headerPixels > LIMITS.maxInputPixels) throw new Error('PNGの元画像は合計6400万画素までです。');
        const url = URL.createObjectURL(file), item = { file, url, image: null }; pending.push(item);
        item.image = await loadImage(url, controller.signal);
        const pixels = item.image.naturalWidth * item.image.naturalHeight;
        if (!pixels || pixels > LIMITS.maxImagePixels) throw new Error('PNGの元画像は1枚3200万画素までです。');
        totalPixels += pixels;
        if (totalPixels > LIMITS.maxInputPixels) throw new Error('PNGの元画像は合計6400万画素までです。');
        el.progress.value = (i + 1) / files.length * 100;
        await breathe(controller.signal);
      }
      checkAbort(controller.signal);
      const wasEmpty = !state.frames.length;
      state.frames.push(...pending); pending.length = 0; state.index = 0;
      if (wasEmpty) el.outputWidth.value = defaultWidth(state.frames[0].image.naturalWidth, state.frames[0].image.naturalHeight);
      renderFrames(); status(files.length + '枚のPNGを追加しました。');
      finishTask(controller); changed();
    } catch (error) {
      for (const frame of pending) { if (frame.image) frame.image.src = ''; URL.revokeObjectURL(frame.url); }
      status(error.name === 'AbortError' ? 'PNGの読込を取り消しました。追加前の画像と作成結果を保持しています。' : error.message, error.name !== 'AbortError');
      finishTask(controller); changed(false);
    }
  }
  function moveFrame(from, to) {
    if (state.task || from === to || from < 0 || to < 0 || from >= state.frames.length || to >= state.frames.length) return;
    stopPreview(); const [frame] = state.frames.splice(from, 1); state.frames.splice(to, 0, frame); state.index = to; renderFrames(); changed();
  }
  function renderFrames() {
    el.frames.replaceChildren(); el.frameCount.textContent = state.frames.length + ' / 240 枚'; el.emptyFrames.hidden = Boolean(state.frames.length);
    state.frames.forEach((frame, index) => {
      const card = document.createElement('article'); card.className = 'frame'; card.draggable = true; card.dataset.index = index;
      const image = document.createElement('img'); image.src = frame.url; image.alt = (index + 1) + '枚目のPNG';
      const num = document.createElement('span'); num.className = 'frame-index'; num.textContent = index + 1;
      const name = document.createElement('p'); name.className = 'frame-name'; name.textContent = frame.file.name; name.title = frame.file.name;
      const actions = document.createElement('div'); actions.className = 'frame-actions';
      function button(label, aria, handler, boundary = false) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.setAttribute('aria-label', (index + 1) + '枚目を' + aria); b.dataset.boundary = String(boundary); b.disabled = boundary; b.addEventListener('click', handler); actions.append(b); return b; }
      button('表示', 'プレビュー', () => { stopPreview(); state.index = index; drawPreview(); });
      button('前へ', '前へ移動', () => { moveFrame(index, index - 1); const target = el.frames.children[index - 1]; if (target) target.querySelector('button').focus(); }, index === 0);
      button('後へ', '後へ移動', () => { moveFrame(index, index + 1); const target = el.frames.children[index + 1]; if (target) target.querySelector('button').focus(); }, index === state.frames.length - 1);
      button('削除', '削除', () => { stopPreview(); URL.revokeObjectURL(frame.url); frame.image.src = ''; state.frames.splice(index, 1); state.index = Math.min(state.index, Math.max(0, state.frames.length - 1)); renderFrames(); changed(); });
      card.append(image, num, name, actions);
      card.addEventListener('dragstart', event => { if (state.task) { event.preventDefault(); return; } state.drag = index; card.classList.add('dragging'); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)); });
      card.addEventListener('dragover', event => { if (state.drag !== null) event.preventDefault(); });
      card.addEventListener('drop', event => { event.preventDefault(); if (state.drag !== null) moveFrame(state.drag, index); state.drag = null; });
      card.addEventListener('dragend', () => { state.drag = null; card.classList.remove('dragging'); });
      el.frames.append(card);
    });
    updateControls(); drawPreview();
  }
  function mediaEvent(media, eventName, signal, action, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      let done = false;
      const clean = () => { media.removeEventListener(eventName, success); media.removeEventListener('error', failed); signal.removeEventListener('abort', aborted); clearTimeout(timer); };
      const settle = error => { if (done) return; done = true; clean(); error ? reject(error) : resolve(); };
      const success = () => settle(), failed = () => settle(new Error('動画を読み込めません。Chromeで再生できるMP4か確認してください。')), aborted = () => settle(abortError());
      const timer = setTimeout(() => settle(new Error('動画の読込・シークがタイムアウトしました。')), timeoutMs);
      media.addEventListener(eventName, success, { once: true }); media.addEventListener('error', failed, { once: true }); signal.addEventListener('abort', aborted, { once: true });
      if (signal.aborted) aborted(); else { try { if (action) action(); } catch (error) { settle(error); } }
    });
  }
  function releaseVideo(video) { video.pause(); video.removeAttribute('src'); video.load(); }
  async function createCapture(source, signal) {
    const video = document.createElement('video'); video.preload = 'auto'; video.muted = true; video.playsInline = true;
    try {
      await mediaEvent(video, 'loadeddata', signal, () => { video.src = source.url; video.load(); });
      checkAbort(signal); return video;
    } catch (error) { releaseVideo(video); throw error; }
  }
  async function seekVideo(video, time, signal) {
    checkAbort(signal);
    // loadeddata guarantees the initial frame. A seeked event guarantees later
    // frames are ready; do not sample immediately after assigning currentTime.
    if (Math.abs(video.currentTime - time) < 0.000001 && video.readyState >= 2) return;
    await mediaEvent(video, 'seeked', signal, () => { video.currentTime = time; });
    checkAbort(signal);
    if (video.readyState < 2) await mediaEvent(video, 'loadeddata', signal);
  }
  async function addVideo(fileList) {
    if (state.task) return;
    const files = Array.from(fileList || []);
    if (!files.length) return;
    let url = null, candidate = null; const controller = new AbortController();
    try {
      if (files.length !== 1 || !(/\.mp4$/i.test(files[0].name) || files[0].type === 'video/mp4')) throw new Error('MP4動画を1つ選択してください。');
      const file = files[0];
      if (file.size > LIMITS.maxVideoBytes) throw new Error('MP4は200 MiBまでです。');
      setTask(controller, 'MP4を読み込んでいます…');
      url = URL.createObjectURL(file); candidate = document.createElement('video'); candidate.preload = 'auto'; candidate.muted = true;
      await mediaEvent(candidate, 'loadeddata', controller.signal, () => { candidate.src = url; candidate.load(); });
      checkAbort(controller.signal);
      const { videoWidth: width, videoHeight: height, duration } = candidate;
      if (!Number.isFinite(duration) || duration <= 0 || !width || !height) throw new Error('動画の長さ・サイズを読み取れません。');
      if (width * height > LIMITS.maxImagePixels) throw new Error('動画の元サイズは3200万画素までです。');
      const previous = state.video;
      el.sourceVideo.pause(); el.sourceVideo.src = url; el.sourceVideo.load();
      state.video = { file, url, width, height, duration }; url = null;
      if (previous) URL.revokeObjectURL(previous.url);
      el.videoStage.hidden = false;
      el.videoInfo.textContent = file.name + ' · ' + width + ' × ' + height + ' px · ' + duration.toFixed(2) + '秒 · ' + sizeText(file.size);
      el.trimStart.value = '0'; el.trimEnd.value = String(Math.min(duration, 5)); el.trimStart.max = duration; el.trimEnd.max = duration;
      el.cropX.value = '0'; el.cropY.value = '0'; el.cropWidth.value = width; el.cropHeight.value = height;
      el.outputWidth.value = defaultWidth(width, height);
      status('MP4を読み込みました。時間と画面の範囲を指定してください。'); finishTask(controller); changed();
    } catch (error) {
      status(error.name === 'AbortError' ? 'MP4の読込を取り消しました。前の動画と作成結果を保持しています。' : error.message, error.name !== 'AbortError');
      finishTask(controller); changed(false);
    } finally { if (candidate) releaseVideo(candidate); if (url) URL.revokeObjectURL(url); }
  }
  function updateCropOverlay() { videoEditor.refresh(); }
  function snapshot() { return { mode: state.mode, plan: getPlan(), frames: state.frames.slice(), video: state.video, loop: el.loop.checked, background: el.background.value, revision: state.revision }; }
  function makeCanvas(plan) { const canvas = document.createElement('canvas'); canvas.width = plan.width; canvas.height = plan.height; return { canvas, context: canvas.getContext('2d', { willReadFrequently: true }) }; }
  async function framePixels(snap, index, work, video, signal) {
    checkAbort(signal);
    const { plan } = snap;
    if (snap.mode === 'png') fitImage(work.context, snap.frames[index].image, plan.width, plan.height, snap.background);
    else {
      const time = Math.min(plan.end - 0.000001, plan.start + index / plan.fps);
      await seekVideo(video, Math.max(plan.start, time), signal);
      const crop = plan.crop; work.context.fillStyle = snap.background; work.context.fillRect(0, 0, plan.width, plan.height);
      work.context.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, plan.width, plan.height);
    }
    checkAbort(signal);
    return GifEncoder.index332(work.context.getImageData(0, 0, plan.width, plan.height).data);
  }
  async function estimate() {
    if (state.task) return;
    stopEstimate();
    let snap;
    try { snap = snapshot(); } catch (_) { return; }
    const controller = new AbortController(); state.estimateAbort = controller;
    let video = null, work = null;
    try {
      el.estimate.textContent = '見積もり中…';
      work = makeCanvas(snap.plan);
      if (snap.mode === 'video') video = await createCapture(snap.video, controller.signal);
      const samples = sampleIndices(snap.plan.count), sizes = [];
      for (const index of samples) {
        const pixels = await framePixels(snap, index, work, video, controller.signal);
        const compressed = GifEncoder.lzwEncode(pixels);
        sizes.push(20 + compressed.length + Math.ceil(compressed.length / 255));
        await breathe(controller.signal);
      }
      checkAbort(controller.signal);
      if (snap.revision !== state.revision || state.task) return;
      const header = 782 + (snap.loop ? 19 : 0), mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
      const predicted = Math.round(header + mean * snap.plan.count);
      if (samples.length === snap.plan.count) {
        el.estimate.textContent = sizeText(predicted) + '（全フレーム計算）';
        el.estimateNote.textContent = samples.length + 'フレームすべてを圧縮して算出。現在の設定でGIFを作成した場合の容量です。';
      } else {
        const min = header + Math.min(...sizes) * snap.plan.count, max = header + Math.max(...sizes) * snap.plan.count;
        el.estimate.textContent = '約 ' + sizeText(predicted);
        el.estimateNote.textContent = '先頭・中央・末尾の' + samples.length + 'フレームから推定。サンプルの最小〜最大を全体に換算: ' + sizeText(min) + '〜' + sizeText(max) + '。実際の容量はこの範囲を外れる場合があります。';
      }
    } catch (error) {
      if (error.name !== 'AbortError' && snap.revision === state.revision) { el.estimate.textContent = '見積もりできませんでした'; el.estimateNote.textContent = error.message + ' 「容量を再見積もり」でやり直せます。'; }
    } finally {
      if (video) releaseVideo(video);
      if (work) { work.canvas.width = 1; work.canvas.height = 1; }
      if (state.estimateAbort === controller) state.estimateAbort = null;
    }
  }
  async function convert() {
    if (state.task) return;
    let snap;
    try { snap = snapshot(); } catch (error) { status(error.message, true); return; }
    const controller = new AbortController(); let video = null, work = null;
    setTask(controller, 'GIFを作成しています…');
    try {
      work = makeCanvas(snap.plan);
      const encoder = GifEncoder.createEncoder({ width: snap.plan.width, height: snap.plan.height, delayMs: snap.plan.delayMs, loop: snap.loop });
      if (snap.mode === 'video') video = await createCapture(snap.video, controller.signal);
      for (let index = 0; index < snap.plan.count; index++) {
        const pixels = await framePixels(snap, index, work, video, controller.signal);
        encoder.addFrame(pixels, snap.plan.delays ? snap.plan.delays[index] : snap.plan.delayMs);
        el.progress.value = (index + 1) / snap.plan.count * 100;
        status('GIFを作成中: ' + (index + 1) + ' / ' + snap.plan.count + ' フレーム');
        await breathe(controller.signal);
      }
      checkAbort(controller.signal);
      const bytes = encoder.finish(), blob = new Blob([bytes], { type: 'image/gif' }), url = URL.createObjectURL(blob);
      if (state.result) URL.revokeObjectURL(state.result.url);
      state.result = { url, revision: snap.revision, size: blob.size };
      el.resultImage.src = url; el.download.href = url; el.download.download = snap.mode === 'png' ? 'png-animation.gif' : 'video-animation.gif';
      el.resultInfo.textContent = '実際のファイル容量: ' + sizeText(blob.size) + '（' + blob.size.toLocaleString('ja-JP') + ' B） · ' + outputInfo(snap.plan);
      el.result.hidden = false; updateResultState();
      el.estimate.textContent = sizeText(blob.size) + '（作成結果）';
      el.estimateNote.textContent = 'この設定で作成したGIFの実際の容量です。設定を変更すると再計算します。';
      status('GIFを作成しました。「GIFを保存」からダウンロードできます。');
    } catch (error) {
      status(error.name === 'AbortError' ? 'GIF作成を取り消しました。最後に成功したGIFを保持しています。' : 'GIFを作成できませんでした。' + error.message, error.name !== 'AbortError');
    } finally {
      if (video) releaseVideo(video);
      if (work) { work.canvas.width = 1; work.canvas.height = 1; }
      finishTask(controller);
      if (/再計算中|見積もり中/.test(el.estimate.textContent) && safePlan()) state.estimateTimer = setTimeout(estimate, 100);
    }
  }
  function switchMode(mode, focus = false) {
    if (state.task) return;
    stopPreview(); videoEditor.stopPlayback(); state.mode = mode;
    for (const [key, value] of [['png', 'pngTab'], ['video', 'videoTab']]) { const active = mode === key; el[value].setAttribute('aria-selected', String(active)); el[value].tabIndex = active ? 0 : -1; }
    el.pngPanel.hidden = mode !== 'png'; el.videoPanel.hidden = mode !== 'video'; el.delayLabel.hidden = mode !== 'png';
    if (focus) el[mode === 'png' ? 'pngTab' : 'videoTab'].focus();
    changed();
  }
  function dropInput(drop, input, handler) {
    drop.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { handler(input.files); input.value = ''; });
    for (const type of ['dragenter','dragover']) drop.addEventListener(type, event => { event.preventDefault(); if (!state.task) drop.classList.add('over'); });
    for (const type of ['dragleave','drop']) drop.addEventListener(type, event => { event.preventDefault(); drop.classList.remove('over'); });
    drop.addEventListener('drop', event => { if (!state.task) handler(event.dataTransfer.files); });
  }
  dropInput(el.pngDrop, el.pngFiles, addPngs); dropInput(el.videoDrop, el.videoFile, addVideo);
  el.pngTab.addEventListener('click', () => switchMode('png')); el.videoTab.addEventListener('click', () => switchMode('video'));
  for (const tab of [el.pngTab, el.videoTab]) tab.addEventListener('keydown', event => { if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) { event.preventDefault(); switchMode(event.key === 'Home' ? 'png' : event.key === 'End' ? 'video' : state.mode === 'png' ? 'video' : 'png', true); } });
  el.clearFrames.addEventListener('click', () => { if (state.task) return; stopPreview(); for (const frame of state.frames) { URL.revokeObjectURL(frame.url); frame.image.src = ''; } state.frames.length = 0; state.index = 0; renderFrames(); changed(); status('PNG画像をすべて削除しました。作成済みのGIFは保持しています。'); });
  el.playPreview.addEventListener('click', () => { if (state.playing) stopPreview(); else { if (state.index === state.frames.length - 1) state.index = 0; state.playing = true; el.playPreview.textContent = '停止'; drawPreview(); playStep(); } });
  for (const id of ['trimStart','trimEnd','cropX','cropY','cropWidth','cropHeight','videoFps','outputWidth','background','frameDelay','loop']) el[id].addEventListener('input', () => { stopPreview(); if (state.mode === 'video') videoEditor.stopPlayback(); changed(); });
  el.refreshEstimate.addEventListener('click', () => { stopEstimate(); el.estimate.textContent = '再計算中…'; estimate(); });
  el.convert.addEventListener('click', convert);
  el.cancel.addEventListener('click', () => { if (!state.task) return; state.task.abort(); el.cancel.disabled = true; status('処理を取り消しています…'); });
  window.addEventListener('resize', updateCropOverlay);
  // Keep file drops outside the drop zones from navigating away and losing work.
  window.addEventListener('dragover', event => { if (event.dataTransfer && event.dataTransfer.types.includes('Files')) event.preventDefault(); });
  window.addEventListener('drop', event => { if (event.dataTransfer && event.dataTransfer.files.length) event.preventDefault(); });
  window.addEventListener('beforeunload', () => { videoEditor.destroy(); stopEstimate(); stopPreview(); if (state.task) state.task.abort(); for (const frame of state.frames) URL.revokeObjectURL(frame.url); if (state.video) URL.revokeObjectURL(state.video.url); if (state.result) URL.revokeObjectURL(state.result.url); });
  renderFrames(); changed();
})();
