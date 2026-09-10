/**
 * analysis.js
 * 画像から筆跡の統計的特徴を抽出し、試料群と対照群の類似度を算出する。
 *
 * 注意: これは正式な筆跡鑑定（筆圧・筆順・運筆速度などを含む専門的鑑定）を
 * 代替するものではない。ここで扱うのは、画像から機械的に取り出せる
 * 「インク密度」「線の太さ」「傾き」「方向分布」「余白の使い方」といった
 * 二次的な特徴に限られる、あくまで参考指標である。
 */
const HandAnalysis = (() => {

  const GRID = 6;        // 密度グリッドの分割数（GRID x GRID）
  const MAX_DIM = 700;    // 解析用に縮小する最大辺（処理速度のため）

  function loadImageFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { resolve(img); };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }

  function drawGrayscale(img) {
    const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);
    const gray = new Float32Array(w * h);
    for (let i = 0, p = 0; i < imgData.data.length; i += 4, p++) {
      const r = imgData.data[i], g = imgData.data[i + 1], b = imgData.data[i + 2];
      gray[p] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
    return { gray, w, h };
  }

  // Otsu's method for automatic threshold selection
  function otsuThreshold(gray) {
    const hist = new Array(256).fill(0);
    for (let i = 0; i < gray.length; i++) hist[Math.round(gray[i])]++;
    const total = gray.length;
    let sum = 0;
    for (let t = 0; t < 256; t++) sum += t * hist[t];
    let sumB = 0, wB = 0, wF = 0, maxVar = 0, threshold = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (wB === 0) continue;
      wF = total - wB;
      if (wF === 0) break;
      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const varBetween = wB * wF * (mB - mF) * (mB - mF);
      if (varBetween > maxVar) { maxVar = varBetween; threshold = t; }
    }
    return threshold;
  }

  function binarize(gray, w, h) {
    const t = otsuThreshold(gray);
    const ink = new Uint8Array(w * h); // 1 = ink (dark stroke), 0 = background
    for (let i = 0; i < gray.length; i++) ink[i] = gray[i] < t ? 1 : 0;
    return ink;
  }

  function boundingBox(ink, w, h) {
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (ink[y * w + x]) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return { minX: 0, minY: 0, maxX: w - 1, maxY: h - 1 };
    return { minX, minY, maxX, maxY };
  }

  function densityGrid(ink, w, h, box) {
    const bw = Math.max(1, box.maxX - box.minX + 1);
    const bh = Math.max(1, box.maxY - box.minY + 1);
    const cellW = bw / GRID, cellH = bh / GRID;
    const grid = new Array(GRID * GRID).fill(0);
    const counts = new Array(GRID * GRID).fill(0);
    for (let y = box.minY; y <= box.maxY; y++) {
      const gy = Math.min(GRID - 1, Math.floor((y - box.minY) / cellH));
      for (let x = box.minX; x <= box.maxX; x++) {
        const gx = Math.min(GRID - 1, Math.floor((x - box.minX) / cellW));
        const idx = gy * GRID + gx;
        counts[idx]++;
        if (ink[y * w + x]) grid[idx]++;
      }
    }
    for (let i = 0; i < grid.length; i++) grid[i] = counts[i] ? grid[i] / counts[i] : 0;
    return grid;
  }

  // Average horizontal run-length of ink pixels, as a proxy for stroke width
  function avgStrokeWidth(ink, w, h) {
    let totalRun = 0, runCount = 0;
    for (let y = 0; y < h; y++) {
      let run = 0;
      for (let x = 0; x < w; x++) {
        if (ink[y * w + x]) {
          run++;
        } else if (run > 0) {
          totalRun += run; runCount++; run = 0;
        }
      }
      if (run > 0) { totalRun += run; runCount++; }
    }
    return runCount ? totalRun / runCount : 0;
  }

  // Sobel-based gradient orientation histogram (captures dominant stroke direction)
  function orientationHistogram(gray, w, h, ink) {
    const bins = 8;
    const hist = new Array(bins).fill(0);
    let total = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (!ink[y * w + x]) continue;
        const gx =
          -gray[(y - 1) * w + (x - 1)] + gray[(y - 1) * w + (x + 1)] +
          -2 * gray[y * w + (x - 1)] + 2 * gray[y * w + (x + 1)] +
          -gray[(y + 1) * w + (x - 1)] + gray[(y + 1) * w + (x + 1)];
        const gy =
          -gray[(y - 1) * w + (x - 1)] - 2 * gray[(y - 1) * w + x] - gray[(y - 1) * w + (x + 1)] +
          gray[(y + 1) * w + (x - 1)] + 2 * gray[(y + 1) * w + x] + gray[(y + 1) * w + (x + 1)];
        const mag = Math.hypot(gx, gy);
        if (mag < 10) continue;
        let angle = Math.atan2(gy, gx); // -PI..PI
        if (angle < 0) angle += Math.PI; // fold to 0..PI (orientation, not direction)
        const bin = Math.min(bins - 1, Math.floor((angle / Math.PI) * bins));
        hist[bin] += mag;
        total += mag;
      }
    }
    return total > 0 ? hist.map(v => v / total) : hist;
  }

  // Estimate dominant slant angle (degrees from vertical) using orientation histogram
  function slantFromHistogram(hist) {
    let bestBin = 0, bestVal = -1;
    for (let i = 0; i < hist.length; i++) {
      if (hist[i] > bestVal) { bestVal = hist[i]; bestBin = i; }
    }
    const angleDeg = (bestBin / hist.length) * 180; // 0..180
    return angleDeg;
  }

  async function extractFeatures(blob) {
    const img = await loadImageFromBlob(blob);
    const { gray, w, h } = drawGrayscale(img);
    const ink = binarize(gray, w, h);
    const box = boundingBox(ink, w, h);

    let inkCount = 0;
    for (let i = 0; i < ink.length; i++) inkCount += ink[i];
    const inkRatio = inkCount / ink.length;

    const bw = box.maxX - box.minX + 1;
    const bh = box.maxY - box.minY + 1;
    const aspect = bw / bh;

    const grid = densityGrid(ink, w, h, box);
    const strokeWidth = avgStrokeWidth(ink, w, h);
    const orientHist = orientationHistogram(gray, w, h, ink);
    const slant = slantFromHistogram(orientHist);

    return { inkRatio, aspect, strokeWidth, slant, grid, orientHist };
  }

  function mean(arr) { return arr.reduce((a, b) => a + b, 0) / (arr.length || 1); }

  function averageFeatures(list) {
    const gridLen = list[0].grid.length;
    const histLen = list[0].orientHist.length;
    const avgGrid = new Array(gridLen).fill(0);
    const avgHist = new Array(histLen).fill(0);
    list.forEach(f => {
      f.grid.forEach((v, i) => avgGrid[i] += v / list.length);
      f.orientHist.forEach((v, i) => avgHist[i] += v / list.length);
    });
    return {
      inkRatio: mean(list.map(f => f.inkRatio)),
      aspect: mean(list.map(f => f.aspect)),
      strokeWidth: mean(list.map(f => f.strokeWidth)),
      slant: mean(list.map(f => f.slant)),
      grid: avgGrid,
      orientHist: avgHist
    };
  }

  function closeness(a, b, scale) {
    // 1 when equal, decays toward 0 as |a-b| grows relative to `scale`
    const diff = Math.abs(a - b);
    return Math.max(0, 1 - diff / scale);
  }

  function vectorCosine(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    if (na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  function compare(sampleAvg, referenceAvg) {
    const items = [
      { key: 'inkRatio', label: 'インク密度', score: closeness(sampleAvg.inkRatio, referenceAvg.inkRatio, 0.15) },
      { key: 'aspect', label: '書字領域の縦横比', score: closeness(sampleAvg.aspect, referenceAvg.aspect, 0.6) },
      { key: 'strokeWidth', label: '平均線幅', score: closeness(sampleAvg.strokeWidth, referenceAvg.strokeWidth, 3) },
      { key: 'slant', label: '傾き（推定角度）', score: closeness(sampleAvg.slant, referenceAvg.slant, 45) },
      { key: 'grid', label: '筆跡の空間分布', score: Math.max(0, vectorCosine(sampleAvg.grid, referenceAvg.grid)) },
      { key: 'orientHist', label: '線の方向分布', score: Math.max(0, vectorCosine(sampleAvg.orientHist, referenceAvg.orientHist)) },
    ];
    const weights = { inkRatio: 1, aspect: 0.7, strokeWidth: 1, slant: 1, grid: 1.4, orientHist: 1.4 };
    let sumW = 0, sumS = 0;
    items.forEach(it => { sumW += weights[it.key]; sumS += weights[it.key] * it.score; });
    const overall = sumW ? sumS / sumW : 0;
    return { overall, items };
  }

  function verdictFor(score) {
    if (score >= 0.8) return { label: '高い一致傾向', tone: 'good' };
    if (score >= 0.6) return { label: '中程度の一致傾向', tone: 'mid' };
    return { label: '一致傾向は低い', tone: 'low' };
  }

  return { extractFeatures, averageFeatures, compare, verdictFor };
})();
