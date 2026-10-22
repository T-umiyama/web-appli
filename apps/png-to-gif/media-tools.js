(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MediaGifTools = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const LIMITS = Object.freeze({ maxFrames: 240, maxSide: 1280, maxPixels: 60000000, maxImagePixels: 32000000, maxInputPixels: 64000000, maxPngBytes: 25 * 1048576, maxPngTotalBytes: 150 * 1048576, maxVideoBytes: 200 * 1048576 });
  function number(value, name, min, max, whole = false) {
    if (value === '' || value === null || typeof value === 'boolean') throw new Error(name + 'を入力してください。');
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max || (whole && !Number.isInteger(n))) throw new Error(name + 'は' + min + '〜' + max + (whole ? 'の整数' : '') + 'で指定してください。');
    return n;
  }
  function output(width, ratio, count) {
    const w = number(width, '出力幅', 1, LIMITS.maxSide, true), h = Math.max(1, Math.round(w * ratio));
    if (h > LIMITS.maxSide) throw new Error('出力高さは最大1280 pxです。出力幅を小さくしてください。');
    if (w * h * count > LIMITS.maxPixels) throw new Error('合計画素数は6000万画素までです。出力幅・FPS・切り取り時間を小さくしてください。');
    return { width: w, height: h };
  }
  function createImagePlan(options) {
    const { sourceWidth, sourceHeight, width, frameCount, delayMs } = options;
    number(sourceWidth, '画像の幅', 1, 65535, true); number(sourceHeight, '画像の高さ', 1, 65535, true);
    const count = number(frameCount, 'フレーム数', 1, LIMITS.maxFrames, true);
    const delay = number(delayMs, '切り替え間隔', 50, 3000, true);
    return { ...output(width, sourceHeight / sourceWidth, count), count, delayMs: Math.round(delay / 10) * 10, duration: count * Math.round(delay / 10) / 100 };
  }
  function createVideoPlan(options) {
    const { sourceWidth, sourceHeight, duration, start, end, fps, width, crop } = options;
    const sw = number(sourceWidth, '動画の幅', 1, 65535, true), sh = number(sourceHeight, '動画の高さ', 1, 65535, true);
    const length = number(duration, '動画の長さ', 0.001, Number.MAX_SAFE_INTEGER);
    const from = number(start, '開始秒', 0, length), to = number(end, '終了秒', 0, length);
    if (to <= from) throw new Error('終了秒は開始秒より後にしてください。');
    const frequency = number(fps, 'FPS', 1, 30, true);
    const count = Math.max(1, Math.ceil((to - from) * frequency - 1e-8));
    if (count > LIMITS.maxFrames) throw new Error('最大240フレームです。FPSまたは切り取り時間を小さくしてください。');
    if (!crop) throw new Error('切り取り範囲を指定してください。');
    const x = number(crop.x, '切り取りX', 0, sw - 1, true), y = number(crop.y, '切り取りY', 0, sh - 1, true);
    const cw = number(crop.width, '切り取り幅', 1, sw, true), ch = number(crop.height, '切り取り高さ', 1, sh, true);
    if (x + cw > sw || y + ch > sh) throw new Error('切り取り範囲が動画の外にはみ出しています。');
    const delays = [];
    let elapsedCs = 0;
    for (let i = 0; i < count; i++) {
      const boundaryCs = Math.round(Math.min(to - from, (i + 1) / frequency) * 100);
      const frameCs = Math.max(1, boundaryCs - elapsedCs);
      delays.push(frameCs * 10); elapsedCs += frameCs;
    }
    return { ...output(width, ch / cw, count), count, start: from, end: to, fps: frequency, crop: { x, y, width: cw, height: ch }, delayMs: delays[0], delays, duration: elapsedCs / 100 };
  }
  function sampleIndices(count, max = 3) {
    number(count, 'フレーム数', 1, LIMITS.maxFrames, true);
    number(max, 'サンプル数', 1, LIMITS.maxFrames, true);
    if (count <= max) return Array.from({ length: count }, (_, i) => i);
    if (max === 1) return [0];
    return Array.from({ length: max }, (_, i) => Math.round(i * (count - 1) / (max - 1)));
  }
  return Object.freeze({ LIMITS, createImagePlan, createVideoPlan, sampleIndices });
});
