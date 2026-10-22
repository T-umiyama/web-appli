/* Visual source editing only. GIF output limits are intentionally independent. */
(function () {
  'use strict';
  function create(options) {
    const $ = id => document.getElementById(id), video = options.video;
    const ui = Object.fromEntries(['videoEditor','videoViewport','cropOverlay','cropDraw','cropMove','cropReadout','timelineTrack','timelineThumbnails','timelineTicks','timelineDimBefore','timelineDimAfter','timelineSelection','trimStartHandle','trimEndHandle','playhead','currentTime','rangeDuration','toggleVideoPlayback','previewTrim','trimStart','trimEnd','cropX','cropY','cropWidth','cropHeight','setStart','setEnd','resetCrop'].map(id => [id, $(id)]));
    const cropHandles = Array.from(ui.cropOverlay.querySelectorAll('[data-crop-handle]'));
    let source = null, enabled = false, range = null, crop = null, drawMode = true, drag = null, changeRaf = 0, playRaf = 0, rangePlayback = false, playRequest = 0, thumbnailAbort = null, thumbnailKey = null;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const abortError = () => new DOMException('取り消しました。', 'AbortError');
    function gap() { return Math.min(0.01, source.duration); }
    function finiteInput(input) { return input.value !== '' && Number.isFinite(Number(input.value)); }
    function readRange() {
      if (!source) return null;
      const start = Number(ui.trimStart.value), end = Number(ui.trimEnd.value);
      if ([ui.trimStart, ui.trimEnd].every(finiteInput) && start >= 0 && start < end && end <= source.duration) return { start, end };
      return null;
    }
    function readCrop() {
      if (!source) return null;
      const inputs = [ui.cropX,ui.cropY,ui.cropWidth,ui.cropHeight], values = inputs.map(input => Number(input.value));
      if (!inputs.every(finiteInput) || !values.every(Number.isInteger)) return null;
      const [x,y,width,height] = values;
      return x >= 0 && y >= 0 && width >= 1 && height >= 1 && x + width <= source.width && y + height <= source.height ? { x,y,width,height } : null;
    }
    function timeText(time) { return (Number.isFinite(time) ? time : 0).toFixed(source && source.duration < 0.01 ? 4 : 2); }
    function valueText(time) { return String(Math.round(time * 1000000) / 1000000); }
    function markChange() {
      if (changeRaf) return;
      changeRaf = requestAnimationFrame(() => { changeRaf = 0; options.onChange(); });
    }
    function flushChange() { if (changeRaf) { cancelAnimationFrame(changeRaf); changeRaf = 0; options.onChange(); } }
    function writeRange(next) {
      range = next; ui.trimStart.value = valueText(next.start); ui.trimEnd.value = valueText(next.end); renderTimeline(); markChange();
    }
    function writeCrop(next) {
      crop = next; ui.cropX.value = next.x; ui.cropY.value = next.y; ui.cropWidth.value = next.width; ui.cropHeight.value = next.height; renderCrop(); markChange();
    }
    function mediaRect() {
      if (!source) return null;
      const box = ui.videoViewport.getBoundingClientRect();
      if (!box.width || !box.height) return null;
      const scale = Math.min(box.width / source.width, box.height / source.height), width = source.width * scale, height = source.height * scale;
      return { left: box.left + (box.width - width) / 2, top: box.top + (box.height - height) / 2, width, height, scale, offsetX: (box.width - width) / 2, offsetY: (box.height - height) / 2 };
    }
    function point(event, allowOutside) {
      const rect = mediaRect(); if (!rect) return null;
      if (!allowOutside && (event.clientX < rect.left || event.clientX > rect.left + rect.width || event.clientY < rect.top || event.clientY > rect.top + rect.height)) return null;
      return { x: clamp(Math.round((event.clientX - rect.left) / rect.scale), 0, source.width), y: clamp(Math.round((event.clientY - rect.top) / rect.scale), 0, source.height) };
    }
    function renderCrop() {
      const rect = mediaRect(); ui.cropOverlay.hidden = !rect || !crop;
      if (!rect || !crop) return;
      Object.assign(ui.cropOverlay.style, { left: rect.offsetX + crop.x * rect.scale + 'px', top: rect.offsetY + crop.y * rect.scale + 'px', width: crop.width * rect.scale + 'px', height: crop.height * rect.scale + 'px' });
      ui.cropReadout.textContent = crop.width + ' × ' + crop.height + ' px · X ' + crop.x + ' / Y ' + crop.y;
      ui.cropOverlay.setAttribute('aria-label', '切り取り範囲 X ' + crop.x + ' Y ' + crop.y + ' 幅 ' + crop.width + ' 高さ ' + crop.height + '。矢印で移動、Shiftと矢印で10ピクセル移動');
      ui.videoViewport.classList.toggle('is-draw', drawMode); ui.videoViewport.classList.toggle('is-move', !drawMode);
      ui.cropDraw.setAttribute('aria-pressed', String(drawMode)); ui.cropMove.setAttribute('aria-pressed', String(!drawMode));
    }
    function slider(button, value, min, max) {
      button.style.left = clamp(value / source.duration * 100, 0, 100) + '%';
      button.setAttribute('aria-valuemin', valueText(min)); button.setAttribute('aria-valuemax', valueText(max)); button.setAttribute('aria-valuenow', valueText(value)); button.setAttribute('aria-valuetext', timeText(value) + '秒');
    }
    function renderTimeline() {
      if (!source || !range) return;
      const start = range.start / source.duration * 100, end = range.end / source.duration * 100;
      ui.timelineDimBefore.style.width = start + '%'; ui.timelineDimAfter.style.width = 100 - end + '%';
      ui.timelineSelection.style.left = start + '%'; ui.timelineSelection.style.width = end - start + '%';
      slider(ui.trimStartHandle, range.start, 0, Math.max(0, range.end - gap()));
      slider(ui.trimEndHandle, range.end, Math.min(source.duration, range.start + gap()), source.duration);
      slider(ui.playhead, clamp(video.currentTime || 0, 0, source.duration), 0, source.duration);
      ui.currentTime.textContent = timeText(video.currentTime) + ' / ' + timeText(source.duration) + ' 秒';
      ui.rangeDuration.textContent = '選択範囲 ' + timeText(range.start) + ' → ' + timeText(range.end) + ' 秒（' + timeText(range.end - range.start) + ' 秒）';
      ui.toggleVideoPlayback.textContent = video.paused ? '▶ 動画を再生' : '■ 停止';
      ui.previewTrim.textContent = rangePlayback && !video.paused ? '■ 選択範囲の再生を停止' : '▶ 選択範囲を再生';
    }
    function stopPlayback() { playRequest++; rangePlayback = false; video.pause(); cancelAnimationFrame(playRaf); playRaf = 0; renderTimeline(); }
    function seek(time) { if (!source) return; const target = clamp(time, 0, source.duration); try { video.currentTime = target; } catch (_) { /* loadeddata will restore the initial frame */ } renderTimeline(); }
    function animationTick() {
      if (!source || video.paused) { playRaf = 0; return; }
      if (rangePlayback && range && video.currentTime >= range.end) { video.pause(); rangePlayback = false; seek(Math.max(range.start, range.end - Math.min(0.001, (range.end - range.start) / 2))); }
      renderTimeline();
      if (!video.paused) playRaf = requestAnimationFrame(animationTick); else playRaf = 0;
    }
    async function play(selected) {
      if (!enabled || !source) return;
      if (!video.paused && (!selected || rangePlayback)) { stopPlayback(); return; }
      stopPlayback(); const request = ++playRequest;
      if (selected) { range = readRange() || range; rangePlayback = true; seek(range.start); }
      else if (video.currentTime >= source.duration - 0.000001) seek(0);
      try { await video.play(); if (!enabled) { video.pause(); return; } if (request !== playRequest) return; renderTimeline(); animationTick(); }
      catch (error) { if (request === playRequest) { rangePlayback = false; options.onStatus('動画を再生できませんでした。' + error.message, true); renderTimeline(); } }
    }
    function setBoundary(kind, value) {
      if (!enabled || !source || !range) return;
      stopPlayback(); const current = readRange() || range, minimum = gap();
      const rounded = source.duration >= 0.01 ? Math.round(value * 100) / 100 : value;
      const next = kind === 'start' ? { start: clamp(rounded, 0, Math.max(0, current.end - minimum)), end: current.end } : { start: current.start, end: clamp(rounded, Math.min(source.duration, current.start + minimum), source.duration) };
      writeRange(next); seek(kind === 'start' ? next.start : Math.max(next.start, next.end - Math.min(0.001, (next.end - next.start) / 2)));
    }
    function cropForResize(original, handle, dx, dy) {
      let left = original.x, top = original.y, right = left + original.width, bottom = top + original.height;
      if (handle.includes('w')) left = clamp(left + dx, 0, right - 1);
      if (handle.includes('e')) right = clamp(right + dx, left + 1, source.width);
      if (handle.includes('n')) top = clamp(top + dy, 0, bottom - 1);
      if (handle.includes('s')) bottom = clamp(bottom + dy, top + 1, source.height);
      return { x: left, y: top, width: right - left, height: bottom - top };
    }
    function beginDrag(event, kind, element, extra) {
      stopPlayback();
      drag = { kind, element, pointerId: event.pointerId, range: { ...range }, crop: { ...crop }, time: video.currentTime, drawMode, values: [ui.trimStart.value,ui.trimEnd.value,ui.cropX.value,ui.cropY.value,ui.cropWidth.value,ui.cropHeight.value], ...extra };
      element.setPointerCapture(event.pointerId); event.preventDefault();
    }
    function cancelInteraction(restore = true) {
      if (!drag) return;
      const previous = drag; drag = null;
      if (previous.element.hasPointerCapture(previous.pointerId)) previous.element.releasePointerCapture(previous.pointerId);
      if (restore) {
        [ui.trimStart.value,ui.trimEnd.value,ui.cropX.value,ui.cropY.value,ui.cropWidth.value,ui.cropHeight.value] = previous.values;
        range = previous.range; crop = previous.crop; drawMode = previous.drawMode;
        seek(previous.time); renderCrop(); renderTimeline(); markChange(); flushChange();
      } else flushChange();
    }
    function onCropDown(event) {
      if (!enabled || !crop || event.button !== 0) return;
      const p = point(event, false); if (!p) return;
      const handle = event.target.closest('[data-crop-handle]');
      const inside = event.target.closest('#cropOverlay');
      const kind = handle ? 'resize' : drawMode || !inside || event.shiftKey ? 'draw' : 'move';
      if (handle) handle.focus(); else ui.cropOverlay.focus({ preventScroll: true });
      beginDrag(event, kind, ui.videoViewport, { origin: p, handle: handle && handle.dataset.cropHandle });
    }
    function onCropMove(event) {
      if (!drag || drag.element !== ui.videoViewport || event.pointerId !== drag.pointerId) return;
      const p = point(event, true), original = drag.crop; if (!p) return;
      const dx = p.x - drag.origin.x, dy = p.y - drag.origin.y;
      if (drag.kind === 'move') writeCrop({ ...original, x: clamp(original.x + dx, 0, source.width - original.width), y: clamp(original.y + dy, 0, source.height - original.height) });
      else if (drag.kind === 'resize') writeCrop(cropForResize(original, drag.handle, dx, dy));
      else {
        const x = Math.min(source.width - 1, Math.min(drag.origin.x, p.x)), y = Math.min(source.height - 1, Math.min(drag.origin.y, p.y));
        writeCrop({ x, y, width: Math.max(1, Math.min(source.width - x, Math.abs(p.x - drag.origin.x))), height: Math.max(1, Math.min(source.height - y, Math.abs(p.y - drag.origin.y))) });
      }
      event.preventDefault();
    }
    function timeAt(event) { const box = ui.timelineTrack.getBoundingClientRect(); return clamp((event.clientX - box.left) / box.width, 0, 1) * source.duration; }
    function onTimeDown(event) {
      if (!enabled || !range || event.button !== 0) return;
      const kind = event.target.closest('#trimStartHandle') ? 'start' : event.target.closest('#trimEndHandle') ? 'end' : 'scrub';
      const focus = kind === 'start' ? ui.trimStartHandle : kind === 'end' ? ui.trimEndHandle : ui.playhead;
      focus.focus({ preventScroll: true }); beginDrag(event, kind, ui.timelineTrack, {}); onTimeMove(event);
    }
    function onTimeMove(event) {
      if (!drag || drag.element !== ui.timelineTrack || event.pointerId !== drag.pointerId) return;
      const time = timeAt(event);
      if (drag.kind === 'scrub') seek(time); else setBoundary(drag.kind, time);
      event.preventDefault();
    }
    function onUp(event) {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const previous = drag;
      if (previous.element === ui.videoViewport) { onCropMove(event); if (previous.kind === 'draw') drawMode = false; renderCrop(); }
      else onTimeMove(event);
      drag = null;
      if (previous.element.hasPointerCapture(event.pointerId)) previous.element.releasePointerCapture(event.pointerId);
      flushChange();
    }
    function cropKey(event) {
      if (!enabled || !crop || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation(); stopPlayback(); drawMode = false;
      const step = event.shiftKey ? 10 : 1, dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
      const handle = event.target.closest('[data-crop-handle]');
      if (handle) writeCrop(cropForResize(crop, handle.dataset.cropHandle, dx, dy));
      else writeCrop({ ...crop, x: clamp(crop.x + dx, 0, source.width - crop.width), y: clamp(crop.y + dy, 0, source.height - crop.height) });
      renderCrop(); flushChange();
    }
    function timeKey(event, kind) {
      if (!enabled || !range || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
      event.preventDefault(); stopPlayback();
      const current = kind === 'scrub' ? video.currentTime : range[kind], step = event.shiftKey ? 1 : Math.min(0.01, source.duration), minimum = kind === 'end' ? Math.min(source.duration, range.start + gap()) : 0, maximum = kind === 'start' ? Math.max(0, range.end - gap()) : source.duration;
      const value = event.key === 'Home' ? minimum : event.key === 'End' ? maximum : current + (['ArrowLeft','ArrowDown'].includes(event.key) ? -step : step);
      if (kind === 'scrub') seek(clamp(value, minimum, maximum)); else setBoundary(kind, value);
      flushChange();
    }
    function mediaWait(media, name, signal, action) {
      return new Promise((resolve,reject) => {
        let settled = false;
        function cleanup() { clearTimeout(timer); media.removeEventListener(name, success); media.removeEventListener('error', failure); signal.removeEventListener('abort', abort); }
        function end(error) { if (settled) return; settled = true; cleanup(); error ? reject(error) : resolve(); }
        const success = () => end(), failure = () => end(new Error('サムネイル読込失敗')), abort = () => end(abortError());
        const timer = setTimeout(() => end(new Error('サムネイル読込タイムアウト')), 10000);
        media.addEventListener(name,success,{ once:true }); media.addEventListener('error',failure,{ once:true }); signal.addEventListener('abort',abort,{ once:true });
        if (signal.aborted) abort(); else { try { action(); } catch(error) { end(error); } }
      });
    }
    function stopThumbnails() { if (thumbnailAbort) thumbnailAbort.abort(); thumbnailAbort = null; }
    async function thumbnails() {
      if (!enabled || !source || thumbnailAbort || thumbnailKey === source.url) return;
      const current = source, controller = new AbortController(), capture = document.createElement('video'); thumbnailAbort = controller; capture.muted = true; capture.preload = 'auto';
      try {
        await mediaWait(capture,'loadeddata',controller.signal,() => { capture.src = current.url; capture.load(); });
        const canvases = [];
        for (let i = 0; i < 6; i++) {
          const time = Math.max(0, current.duration * (i + 0.5) / 6);
          if (Math.abs(capture.currentTime - time) > 0.000001) await mediaWait(capture,'seeked',controller.signal,() => { capture.currentTime = time; });
          if (controller.signal.aborted) throw abortError();
          const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 80;
          const context = canvas.getContext('2d'), factor = Math.min(128 / current.width,80 / current.height), width = current.width * factor, height = current.height * factor;
          context.fillStyle = '#172121'; context.fillRect(0,0,128,80); context.drawImage(capture,(128-width)/2,(80-height)/2,width,height); canvases.push(canvas);
        }
        if (!controller.signal.aborted && source && source.url === current.url) { ui.timelineThumbnails.replaceChildren(...canvases); thumbnailKey = current.url; }
      } catch(error) { if (error.name !== 'AbortError' && source && source.url === current.url) thumbnailKey = current.url; }
      finally { capture.pause(); capture.removeAttribute('src'); capture.load(); if (thumbnailAbort === controller) thumbnailAbort = null; }
    }
    function refresh() {
      const next = options.getSource(), nextEnabled = Boolean(next && options.isEnabled());
      if ((next && next.url) !== (source && source.url)) {
        cancelInteraction(false); stopPlayback(); stopThumbnails(); source = next; thumbnailKey = null; ui.timelineThumbnails.replaceChildren(); drawMode = true;
        if (source) {
          range = readRange() || { start: 0, end: source.duration }; crop = readCrop() || { x:0,y:0,width:source.width,height:source.height };
          ui.timelineTicks.replaceChildren(...Array.from({ length:5 },(_,i) => { const span = document.createElement('span'); span.textContent = timeText(source.duration * i / 4) + 's'; return span; }));
        } else { range = null; crop = null; }
      }
      if (enabled && !nextEnabled) { cancelInteraction(false); stopPlayback(); stopThumbnails(); }
      enabled = nextEnabled; ui.videoEditor.hidden = !source; ui.videoEditor.setAttribute('aria-disabled',String(!enabled));
      if (source) { range = readRange() || range; crop = readCrop() || crop; }
      for (const button of ui.videoEditor.querySelectorAll('button')) button.disabled = !enabled;
      ui.cropOverlay.tabIndex = enabled ? 0 : -1;
      renderCrop(); renderTimeline(); thumbnails();
    }
    ui.videoViewport.addEventListener('pointerdown',onCropDown); ui.videoViewport.addEventListener('pointermove',onCropMove);
    ui.timelineTrack.addEventListener('pointerdown',onTimeDown); ui.timelineTrack.addEventListener('pointermove',onTimeMove);
    for (const element of [ui.videoViewport,ui.timelineTrack]) { element.addEventListener('pointerup',onUp); element.addEventListener('pointercancel',() => cancelInteraction(true)); element.addEventListener('lostpointercapture',() => { if (drag && drag.element === element) cancelInteraction(true); }); }
    window.addEventListener('keydown',event => { if (event.key === 'Escape' && drag) { event.preventDefault(); cancelInteraction(true); } });
    window.addEventListener('resize',() => { renderCrop(); renderTimeline(); });
    ui.cropOverlay.addEventListener('keydown',cropKey);
    ui.trimStartHandle.addEventListener('keydown',event => timeKey(event,'start')); ui.trimEndHandle.addEventListener('keydown',event => timeKey(event,'end')); ui.playhead.addEventListener('keydown',event => timeKey(event,'scrub'));
    ui.cropDraw.addEventListener('click',() => { drawMode = true; renderCrop(); }); ui.cropMove.addEventListener('click',() => { drawMode = false; renderCrop(); });
    ui.toggleVideoPlayback.addEventListener('click',() => play(false)); ui.previewTrim.addEventListener('click',() => play(true));
    ui.setStart.addEventListener('click',() => { setBoundary('start',video.currentTime); flushChange(); }); ui.setEnd.addEventListener('click',() => { setBoundary('end',video.currentTime); flushChange(); });
    ui.resetCrop.addEventListener('click',() => { if (!enabled || !source) return; drawMode = true; writeCrop({ x:0,y:0,width:source.width,height:source.height }); flushChange(); });
    for (const name of ['loadeddata','seeked','timeupdate','play','pause','ended']) video.addEventListener(name,() => {
      if (name === 'timeupdate' && rangePlayback && range && video.currentTime >= range.end) { video.pause(); rangePlayback = false; seek(Math.max(range.start,range.end - Math.min(0.001,(range.end-range.start)/2))); }
      renderTimeline(); if (name === 'loadeddata' || name === 'seeked' || name === 'timeupdate') options.onFrame();
      if (name === 'ended') { rangePlayback = false; renderTimeline(); }
    });
    return { refresh, getCrop: () => crop && { ...crop }, stopPlayback, cancelInteraction, destroy() { cancelInteraction(false); stopPlayback(); stopThumbnails(); cancelAnimationFrame(changeRaf); } };
  }
  window.VideoGifEditor = Object.freeze({ create });
})();
