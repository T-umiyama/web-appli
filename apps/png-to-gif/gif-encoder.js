/* Local GIF89a encoder. A 3-3-2 palette and bounded 9-bit LZW dictionary. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GifEncoder = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function integer(value, min, max, name) {
    if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(name + 'が範囲外です。');
    return value;
  }
  function palette332() {
    const palette = new Uint8Array(768);
    for (let i = 0; i < 256; i++) {
      palette[i * 3] = Math.round(((i >> 5) & 7) * 255 / 7);
      palette[i * 3 + 1] = Math.round(((i >> 2) & 7) * 255 / 7);
      palette[i * 3 + 2] = Math.round((i & 3) * 255 / 3);
    }
    return palette;
  }
  function index332(rgba) {
    if (!(rgba instanceof Uint8Array || rgba instanceof Uint8ClampedArray) || rgba.length % 4) throw new TypeError('RGBAデータが不正です。');
    const out = new Uint8Array(rgba.length / 4);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j++) out[j] = (rgba[i] & 224) | ((rgba[i + 1] >> 3) & 28) | (rgba[i + 2] >> 6);
    return out;
  }
  function lzwEncode(indices) {
    if (!(indices instanceof Uint8Array) || !indices.length) throw new TypeError('フレームのパレットデータが空または不正です。');
    const out = [];
    let dictionary = new Map(), nextCode = 258, bits = 0, count = 0;
    function emit(code) {
      bits |= code << count;
      count += 9;
      while (count >= 8) { out.push(bits & 255); bits >>>= 8; count -= 8; }
    }
    emit(256);
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const value = indices[i], key = prefix * 256 + value;
      if (dictionary.has(key)) prefix = dictionary.get(key);
      else {
        emit(prefix);
        // Clear before the decoder reaches a 10-bit code boundary. This is
        // ordinary GIF LZW, with deliberate dictionary resets for portability.
        if (nextCode < 510) dictionary.set(key, nextCode++);
        else { emit(256); dictionary = new Map(); nextCode = 258; }
        prefix = value;
      }
    }
    emit(prefix); emit(257);
    if (count) out.push(bits & 255);
    return Uint8Array.from(out);
  }
  function delayValue(delayMs) {
    if (!Number.isFinite(delayMs) || delayMs < 10 || delayMs > 655350) throw new RangeError('フレーム間隔が範囲外です。');
    return Math.max(1, Math.round(delayMs / 10));
  }
  function createEncoder(options) {
    const { width, height, delayMs = 500, loop = true } = options || {};
    integer(width, 1, 65535, '幅'); integer(height, 1, 65535, '高さ'); delayValue(delayMs);
    if (typeof loop !== 'boolean') throw new TypeError('繰り返し設定が不正です。');
    const chunks = [];
    let size = 0, frameCount = 0, finished = false, compressedSize = 0;
    function push(bytes) { const chunk = Uint8Array.from(bytes); chunks.push(chunk); size += chunk.length; }
    function u16(value) { return [value & 255, (value >> 8) & 255]; }
    push([71, 73, 70, 56, 57, 97, ...u16(width), ...u16(height), 247, 0, 0]);
    push(palette332());
    if (loop) push([33, 255, 11, 78, 69, 84, 83, 67, 65, 80, 69, 50, 46, 48, 3, 1, 0, 0, 0]);
    return {
      get byteLength() { return size; },
      get lastCompressedSize() { return compressedSize; },
      addFrame(indices, frameDelayMs = delayMs) {
        if (finished) throw new Error('完了したGIFへフレームを追加できません。');
        if (!(indices instanceof Uint8Array) || indices.length !== width * height) throw new RangeError('フレームの画素数が出力サイズと一致しません。');
        const delay = delayValue(frameDelayMs), compressed = lzwEncode(indices);
        compressedSize = compressed.length;
        push([33, 249, 4, 4, ...u16(delay), 0, 0, 44, 0, 0, 0, 0, ...u16(width), ...u16(height), 0, 8]);
        for (let i = 0; i < compressed.length; i += 255) { const block = compressed.subarray(i, i + 255); push([block.length]); push(block); }
        push([0]); frameCount++;
      },
      finish() {
        if (finished) throw new Error('GIFはすでに完了しています。');
        if (!frameCount) throw new Error('GIFには1枚以上のフレームが必要です。');
        finished = true; push([59]);
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        chunks.length = 0;
        return bytes;
      }
    };
  }
  function encodeGif(options) {
    if (!options || !Array.isArray(options.frames) || !options.frames.length) throw new TypeError('フレームを1枚以上指定してください。');
    const encoder = createEncoder(options);
    for (const frame of options.frames) encoder.addFrame(frame);
    return encoder.finish();
  }
  return Object.freeze({ palette332, index332, lzwEncode, createEncoder, encodeGif });
});
