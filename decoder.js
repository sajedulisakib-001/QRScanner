/**
 * Universal Barcode & QR Code Decoder Engine
 * 100% Pure Vanilla JavaScript - ZERO NPM Libraries - ZERO External Dependencies
 * Works cross-platform on Windows, Linux, macOS, Android, and ChromeOS.
 *
 * Supported Symbologies:
 * - QR Code (Model 2, Versions 1-20, all EC levels L/M/Q/H, Numeric/Alphanumeric/Byte UTF-8)
 * - Code 128 (Subsets A, B, C with auto-mode switching, GS1-128 FNC1, mod 103 checksum)
 * - EAN-13 & UPC-A (Standard GS1 retail with mod 10 checksum)
 * - EAN-8 (Compact GS1 retail with mod 10 checksum)
 * - Code 39 (Standard 3-of-9 alphanumeric with start/stop delimiters)
 * - Interleaved 2 of 5 (ITF / ITF-14 logistics carton codes)
 * - Codabar / NW-7 (Standard library and logistics barcode)
 */

(function (global) {
  'use strict';

  // ==========================================
  // 1. Galois Field GF(256) & Reed-Solomon Engine
  // ==========================================
  const GF_EXP = new Uint8Array(512);
  const GF_LOG = new Uint8Array(256);

  (function initGF() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      GF_EXP[i] = x;
      GF_EXP[i + 255] = x;
      GF_LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d; // Primitive polynomial x^8 + x^4 + x^3 + x^2 + 1
    }
    GF_LOG[0] = 0;
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
  }

  function gfDiv(a, b) {
    if (a === 0) return 0;
    if (b === 0) throw new Error("GF divide by zero");
    return GF_EXP[(GF_LOG[a] + 255 - GF_LOG[b]) % 255];
  }

  function rsCorrect(received, numEcc) {
    const numData = received.length - numEcc;
    const syndromes = new Uint8Array(numEcc);
    let hasError = false;

    for (let i = 0; i < numEcc; i++) {
      let sum = 0;
      const alpha = GF_EXP[i];
      for (let j = 0; j < received.length; j++) {
        sum = received[j] ^ gfMul(sum, alpha);
      }
      syndromes[i] = sum;
      if (sum !== 0) hasError = true;
    }

    if (!hasError) return received.slice(0, numData);

    // Berlekamp-Massey Algorithm for Error Locator Polynomial
    let C = [1];
    let B = [1];
    let L = 0;
    let m = 1;
    let b = 1;

    for (let n = 0; n < numEcc; n++) {
      let d = syndromes[n];
      for (let i = 1; i <= L; i++) {
        d ^= gfMul(C[i], syndromes[n - i]);
      }

      if (d === 0) {
        m++;
      } else {
        const T = C.slice();
        const coeff = gfDiv(d, b);
        const shiftB = new Array(m).fill(0).concat(B.map(val => gfMul(coeff, val)));
        const maxLen = Math.max(C.length, shiftB.length);
        const newC = new Array(maxLen).fill(0);
        for (let i = 0; i < C.length; i++) newC[i] ^= C[i];
        for (let i = 0; i < shiftB.length; i++) newC[i] ^= shiftB[i];

        if (2 * L <= n) {
          L = n + 1 - L;
          B = T;
          b = d;
          m = 1;
        } else {
          m++;
        }
        C = newC;
      }
    }

    const numErrors = C.length - 1;
    const errPos = [];
    for (let i = 0; i < received.length; i++) {
      const xInv = GF_EXP[(255 - i) % 255];
      let sum = 0;
      for (let j = 0; j < C.length; j++) {
        sum ^= gfMul(C[j], GF_EXP[(GF_LOG[xInv] * j) % 255]);
      }
      if (sum === 0) errPos.push(received.length - 1 - i);
    }

    if (errPos.length !== numErrors) {
      throw new Error("Uncorrectable Reed-Solomon errors");
    }

    // Forney Algorithm for Error Magnitudes
    const omega = new Uint8Array(numEcc);
    for (let i = 0; i < numEcc; i++) {
      for (let j = 0; j <= i && j < C.length; j++) {
        omega[i] ^= gfMul(C[j], syndromes[i - j]);
      }
    }

    const cPrime = [];
    for (let i = 1; i < C.length; i += 2) {
      cPrime[i - 1] = C[i];
      if (i < C.length - 1) cPrime[i] = 0;
    }

    const corrected = received.slice();
    for (const pos of errPos) {
      const xiInv = GF_EXP[(255 - pos) % 255];
      let omegaVal = 0;
      for (let j = 0; j < omega.length; j++) {
        omegaVal ^= gfMul(omega[j], GF_EXP[(GF_LOG[xiInv] * j) % 255]);
      }
      let cPrimeVal = 0;
      for (let j = 0; j < cPrime.length; j++) {
        if (cPrime[j]) cPrimeVal ^= gfMul(cPrime[j], GF_EXP[(GF_LOG[xiInv] * j) % 255]);
      }
      const magnitude = gfDiv(omegaVal, cPrimeVal);
      corrected[pos] ^= magnitude;
    }

    return corrected.slice(0, numData);
  }

  // ==========================================
  // 2. QR Code Tables & BCH Decoding
  // ==========================================
  function getFormatBits(data5) {
    let val = data5 << 10;
    for (let i = 4; i >= 0; i--) {
      if (val & (1 << (i + 10))) {
        val ^= (0x537 << i);
      }
    }
    return ((data5 << 10) | val) ^ 0x5412;
  }

  const EC_MAP = { 1: 'L', 0: 'M', 3: 'Q', 2: 'H' };

  function decodeFormatInfo(raw15) {
    let best = null;
    let minDistance = 4; // Can correct up to 3 bit errors in BCH(15, 5)
    for (let ec = 0; ec < 4; ec++) {
      for (let mask = 0; mask < 8; mask++) {
        const data5 = (ec << 3) | mask;
        const expected = getFormatBits(data5);
        let v = (raw15 ^ expected) & 0x7FFF;
        let dist = 0;
        while (v > 0) { dist += v & 1; v >>= 1; }
        if (dist < minDistance) {
          minDistance = dist;
          best = { ecLevel: EC_MAP[ec], mask, ec };
        }
      }
    }
    return best;
  }

  // Standard QR Block Capacity Table (Versions 1-20)
  // [totalCodewords, ecCodewordsPerBlock, numBlocksG1, dataPerBlockG1, numBlocksG2, dataPerBlockG2]
  const QR_BLOCK_CAPACITY = [
    null,
    { L: [26, 7, 1, 19, 0, 0], M: [26, 10, 1, 16, 0, 0], Q: [26, 13, 1, 13, 0, 0], H: [26, 17, 1, 9, 0, 0] },
    { L: [44, 10, 1, 34, 0, 0], M: [44, 16, 1, 28, 0, 0], Q: [44, 22, 1, 22, 0, 0], H: [44, 28, 1, 16, 0, 0] },
    { L: [70, 15, 1, 55, 0, 0], M: [70, 26, 1, 44, 0, 0], Q: [70, 18, 2, 17, 0, 0], H: [70, 22, 2, 13, 0, 0] },
    { L: [100, 20, 1, 80, 0, 0], M: [100, 18, 2, 32, 0, 0], Q: [100, 26, 2, 24, 0, 0], H: [100, 16, 4, 9, 0, 0] },
    { L: [134, 26, 1, 108, 0, 0], M: [134, 24, 2, 43, 0, 0], Q: [134, 18, 2, 15, 2, 16], H: [134, 22, 2, 11, 2, 12] },
    { L: [172, 18, 2, 68, 0, 0], M: [172, 16, 4, 27, 0, 0], Q: [172, 24, 4, 19, 0, 0], H: [172, 28, 4, 15, 0, 0] },
    { L: [196, 20, 2, 78, 0, 0], M: [196, 18, 4, 31, 0, 0], Q: [196, 18, 2, 14, 4, 15], H: [196, 26, 4, 13, 1, 14] },
    { L: [242, 24, 2, 97, 0, 0], M: [242, 22, 2, 38, 2, 39], Q: [242, 22, 4, 18, 2, 19], H: [242, 26, 4, 14, 2, 15] },
    { L: [292, 30, 2, 116, 0, 0], M: [292, 22, 3, 36, 2, 37], Q: [292, 20, 4, 16, 4, 17], H: [292, 24, 4, 12, 4, 13] },
    { L: [346, 18, 2, 68, 2, 69], M: [346, 26, 4, 43, 1, 44], Q: [346, 24, 6, 19, 2, 20], H: [346, 28, 6, 15, 2, 16] },
    { L: [404, 20, 4, 81, 0, 0], M: [404, 30, 1, 50, 4, 51], Q: [404, 28, 4, 22, 4, 23], H: [404, 24, 3, 12, 8, 13] },
    { L: [466, 24, 2, 92, 2, 93], M: [466, 22, 6, 36, 2, 37], Q: [466, 26, 4, 20, 6, 21], H: [466, 28, 7, 14, 4, 15] },
    { L: [532, 26, 4, 107, 0, 0], M: [532, 22, 8, 37, 1, 38], Q: [532, 24, 8, 20, 4, 21], H: [532, 22, 12, 11, 4, 12] },
    { L: [581, 30, 3, 115, 1, 116], M: [581, 24, 4, 40, 5, 41], Q: [581, 20, 11, 16, 5, 17], H: [581, 24, 11, 12, 5, 13] },
    { L: [655, 22, 5, 87, 1, 88], M: [655, 24, 5, 41, 5, 42], Q: [655, 30, 5, 24, 7, 25], H: [655, 24, 11, 12, 7, 13] },
    { L: [733, 24, 5, 98, 1, 99], M: [733, 28, 7, 45, 3, 46], Q: [733, 24, 15, 19, 2, 20], H: [733, 30, 3, 15, 13, 16] },
    { L: [815, 28, 1, 107, 5, 108], M: [815, 28, 10, 46, 1, 47], Q: [815, 28, 1, 22, 15, 23], H: [815, 28, 2, 14, 17, 15] },
    { L: [901, 30, 5, 120, 1, 121], M: [901, 26, 9, 43, 4, 44], Q: [901, 28, 17, 22, 1, 23], H: [901, 28, 2, 14, 19, 15] },
    { L: [991, 28, 3, 113, 4, 114], M: [991, 26, 3, 44, 11, 45], Q: [991, 26, 17, 21, 4, 22], H: [991, 26, 9, 13, 16, 14] },
    { L: [1085, 28, 3, 107, 5, 108], M: [1085, 26, 3, 41, 13, 42], Q: [1085, 30, 15, 24, 5, 25], H: [1085, 28, 15, 15, 10, 16] }
  ];

  // Alignment Pattern Center Coordinates (Versions 1-20)
  const QR_ALIGN_COORDS = [
    [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
    [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
    [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66],
    [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78],
    [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90]
  ];

  function isMasked(mask, r, c) {
    switch (mask) {
      case 0: return ((r + c) % 2) === 0;
      case 1: return (r % 2) === 0;
      case 2: return (c % 3) === 0;
      case 3: return ((r + c) % 3) === 0;
      case 4: return ((Math.floor(r / 2) + Math.floor(c / 3)) % 2) === 0;
      case 5: return (((r * c) % 2) + ((r * c) % 3)) === 0;
      case 6: return ((((r * c) % 2) + ((r * c) % 3)) % 2) === 0;
      case 7: return ((((r + c) % 2) + ((r * c) % 3)) % 2) === 0;
      default: return false;
    }
  }

  // ==========================================
  // 3. Image Preprocessing & Adaptive Binarization
  // ==========================================
  function binarizeImage(imageData) {
    const w = imageData.width;
    const h = imageData.height;
    const data = imageData.data;

    const lum = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      lum[j] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
    }

    // Integral Image for Fast Local Adaptive Thresholding (Bradley-Roth)
    const integral = new Float64Array(w * h);
    for (let y = 0; y < h; y++) {
      let sum = 0;
      const rowOffset = y * w;
      for (let x = 0; x < w; x++) {
        sum += lum[rowOffset + x];
        integral[rowOffset + x] = sum + (y > 0 ? integral[rowOffset - w + x] : 0);
      }
    }

    const binary = new Uint8Array(w * h);
    const S = Math.max(4, Math.round(Math.min(w, h) / 16));
    const s2 = Math.round(S / 2);
    const T = 0.88; // 12% lower than local average to classify as black

    for (let y = 0; y < h; y++) {
      const y1 = Math.max(0, y - s2);
      const y2 = Math.min(h - 1, y + s2);
      const rowOffset = y * w;

      for (let x = 0; x < w; x++) {
        const x1 = Math.max(0, x - s2);
        const x2 = Math.min(w - 1, x + s2);
        const count = (x2 - x1 + 1) * (y2 - y1 + 1);

        const sum = integral[y2 * w + x2]
                  - (x1 > 0 ? integral[y2 * w + (x1 - 1)] : 0)
                  - (y1 > 0 ? integral[(y1 - 1) * w + x2] : 0)
                  + (x1 > 0 && y1 > 0 ? integral[(y1 - 1) * w + (x1 - 1)] : 0);

        binary[rowOffset + x] = (lum[rowOffset + x] * count <= sum * T) ? 1 : 0;
      }
    }

    return { w, h, binary, lum };
  }

  function binarizeOtsu(imageData) {
    const w = imageData.width;
    const h = imageData.height;
    const data = imageData.data;

    const lum = new Uint8Array(w * h);
    const hist = new Int32Array(256);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      const l = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
      lum[j] = l;
      hist[l]++;
    }

    const total = w * h;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];

    let sumB = 0, wB = 0, wF = 0, varMax = 0, threshold = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (wB === 0) continue;
      wF = total - wB;
      if (wF === 0) break;

      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const varBetween = wB * wF * (mB - mF) * (mB - mF);

      if (varBetween > varMax) {
        varMax = varBetween;
        threshold = t;
      }
    }

    const binary = new Uint8Array(w * h);
    for (let i = 0; i < lum.length; i++) {
      binary[i] = lum[i] < threshold ? 1 : 0;
    }

    return { w, h, binary, lum };
  }

  // ==========================================
  // 4. QR Code Detector & Multi-Version Sampler
  // ==========================================
  function findQRFinders(binary, w, h) {
    const stateCount = [0, 0, 0, 0, 0];
    const centers = [];

    function checkRatio(state) {
      const total = state[0] + state[1] + state[2] + state[3] + state[4];
      if (total < 7) return false;
      const mod = total / 7.0;
      const maxVar = mod * 0.65;
      return (
        Math.abs(mod - state[0]) < maxVar &&
        Math.abs(mod - state[1]) < maxVar &&
        Math.abs(3.0 * mod - state[2]) < 3.0 * maxVar &&
        Math.abs(mod - state[3]) < maxVar &&
        Math.abs(mod - state[4]) < maxVar
      );
    }

    // Vertical confirmation cross-check
    function crossCheckVertical(startRow, centerCol, maxCount, originalTotal) {
      const vState = [0, 0, 0, 0, 0];
      let r = startRow;
      // Walk up
      while (r >= 0 && binary[r * w + centerCol] === 1) { vState[2]++; r--; }
      if (r < 0) return null;
      while (r >= 0 && binary[r * w + centerCol] === 0 && vState[1] <= maxCount) { vState[1]++; r--; }
      if (r < 0 || vState[1] > maxCount) return null;
      while (r >= 0 && binary[r * w + centerCol] === 1 && vState[0] <= maxCount) { vState[0]++; r--; }
      if (vState[0] > maxCount) return null;

      // Walk down
      r = startRow + 1;
      while (r < h && binary[r * w + centerCol] === 1) { vState[2]++; r++; }
      if (r >= h) return null;
      while (r < h && binary[r * w + centerCol] === 0 && vState[3] <= maxCount) { vState[3]++; r++; }
      if (r >= h || vState[3] > maxCount) return null;
      while (r < h && binary[r * w + centerCol] === 1 && vState[4] <= maxCount) { vState[4]++; r++; }
      if (vState[4] > maxCount) return null;

      const totalV = vState[0] + vState[1] + vState[2] + vState[3] + vState[4];
      if (Math.abs(totalV - originalTotal) > originalTotal * 0.45) return null;
      if (!checkRatio(vState)) return null;

      const cy = r - vState[4] - vState[3] - vState[2] / 2;
      return { cy, size: totalV / 7 };
    }

    // Scan horizontal lines across height
    const step = Math.max(1, Math.floor(h / 320));
    for (let y = 0; y < h; y += step) {
      stateCount.fill(0);
      let currentState = 0;

      for (let x = 0; x < w; x++) {
        const isBlack = binary[y * w + x] === 1;
        if (isBlack) {
          if ((currentState & 1) === 1) currentState++;
          stateCount[currentState]++;
        } else {
          if ((currentState & 1) === 0) {
            if (currentState === 4) {
              if (checkRatio(stateCount)) {
                const totalH = stateCount[0] + stateCount[1] + stateCount[2] + stateCount[3] + stateCount[4];
                const cx = x - stateCount[4] - stateCount[3] - stateCount[2] / 2;
                const vRes = crossCheckVertical(y, Math.round(cx), stateCount[2], totalH);
                if (vRes) {
                  centers.push({ x: cx, y: vRes.cy, size: (totalH / 7 + vRes.size) / 2 });
                }
              }
              stateCount[0] = stateCount[2];
              stateCount[1] = stateCount[3];
              stateCount[2] = stateCount[4];
              stateCount[3] = 1;
              stateCount[4] = 0;
              currentState = 3;
            } else {
              currentState++;
              stateCount[currentState]++;
            }
          } else {
            stateCount[currentState]++;
          }
        }
      }
    }

    // Cluster candidate points
    const clusters = [];
    for (const pt of centers) {
      let matched = false;
      for (const cl of clusters) {
        if (Math.hypot(pt.x - cl.x, pt.y - cl.y) < pt.size * 2.5) {
          cl.x = (cl.x * cl.count + pt.x) / (cl.count + 1);
          cl.y = (cl.y * cl.count + pt.y) / (cl.count + 1);
          cl.size = (cl.size * cl.count + pt.size) / (cl.count + 1);
          cl.count++;
          matched = true;
          break;
        }
      }
      if (!matched) clusters.push({ x: pt.x, y: pt.y, size: pt.size, count: 1 });
    }

    const validClusters = clusters.filter(c => c.count >= 1);
    if (validClusters.length < 3) return null;

    // Pick 3 clusters forming right isosceles triangle
    let best = null;
    let minErr = Infinity;

    for (let i = 0; i < validClusters.length; i++) {
      for (let j = i + 1; j < validClusters.length; j++) {
        for (let k = j + 1; k < validClusters.length; k++) {
          const p1 = validClusters[i], p2 = validClusters[j], p3 = validClusters[k];
          const d12 = Math.hypot(p1.x - p2.x, p1.y - p2.y);
          const d23 = Math.hypot(p2.x - p3.x, p2.y - p3.y);
          const d31 = Math.hypot(p3.x - p1.x, p3.y - p1.y);

          const sides = [
            { a: p1, b: p2, c: p3, opp: d12, d1: d23, d2: d31 },
            { a: p2, b: p3, c: p1, opp: d23, d1: d31, d2: d12 },
            { a: p3, b: p1, c: p2, opp: d31, d1: d12, d2: d23 }
          ];

          sides.sort((s1, s2) => s2.opp - s1.opp);
          const longest = sides[0]; // hypotenuse

          const ratio = Math.abs(longest.d1 - longest.d2) / Math.max(longest.d1, longest.d2);
          const pyth = Math.abs(longest.opp - Math.hypot(longest.d1, longest.d2)) / longest.opp;
          const score = ratio + pyth;

          if (score < minErr && score < 0.5) {
            minErr = score;
            const TL = longest.c;
            const pA = longest.a, pB = longest.b;
            const cross = (pA.x - TL.x) * (pB.y - TL.y) - (pA.y - TL.y) * (pB.x - TL.x);
            const TR = cross > 0 ? pA : pB;
            const BL = cross > 0 ? pB : pA;

            best = { TL, TR, BL, moduleSize: (longest.d1 + longest.d2) / 2 };
          }
        }
      }
    }

    return best;
  }

  function decodeQRCode(binaryObj) {
    const { w, h, binary } = binaryObj;
    const finders = findQRFinders(binary, w, h);
    if (!finders) return null;

    const { TL, TR, BL } = finders;
    const distH = Math.hypot(TR.x - TL.x, TR.y - TL.y);
    const distV = Math.hypot(BL.x - TL.x, BL.y - TL.y);
    const avgDist = (distH + distV) / 2;
    const modSizeEst = (TL.size + TR.size + BL.size) / 3 || 10;

    // Estimate Version N modules (N = 4V + 17, center-to-center span is N - 7 = 4V + 10)
    const baseVersion = Math.round(((avgDist / modSizeEst) - 10) / 4);
    const candidateVersions = [];
    for (const delta of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
      const v = baseVersion + delta;
      if (v >= 1 && v <= 20 && !candidateVersions.includes(v)) candidateVersions.push(v);
    }

    // Try candidate versions
    for (const version of candidateVersions) {
      const N = 4 * version + 17;
      const BR = { x: TR.x + BL.x - TL.x, y: TR.y + BL.y - TL.y };

      function sampleModule(r, c) {
        const u = (c + 0.5 - 3.5) / (N - 7);
        const v = (r + 0.5 - 3.5) / (N - 7);
        const x = (1 - u) * (1 - v) * TL.x + u * (1 - v) * TR.x + (1 - u) * v * BL.x + u * v * BR.x;
        const y = (1 - u) * (1 - v) * TL.y + u * (1 - v) * TR.y + (1 - u) * v * BL.y + u * v * BR.y;
        const px = Math.round(x);
        const py = Math.round(y);
        if (px < 0 || px >= w || py < 0 || py >= h) return 0;
        return binary[py * w + px];
      }

      // Read format info around TL
      const formatCoords1 = [
        [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
        [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
      ];
      let rawFormat1 = 0;
      for (let i = 0; i < 15; i++) {
        rawFormat1 = (rawFormat1 << 1) | sampleModule(formatCoords1[i][0], formatCoords1[i][1]);
      }

      const formatInfo = decodeFormatInfo(rawFormat1);
      if (!formatInfo) continue;

      // Sample full grid
      const matrix = Array.from({ length: N }, () => new Uint8Array(N));
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          matrix[r][c] = sampleModule(r, c);
        }
      }

      // Mark function modules
      const isFunction = Array.from({ length: N }, () => new Uint8Array(N));
      function markFinder(startR, startC) {
        for (let r = -1; r <= 7; r++) {
          for (let c = -1; c <= 7; c++) {
            const pr = startR + r, pc = startC + c;
            if (pr >= 0 && pr < N && pc >= 0 && pc < N) isFunction[pr][pc] = 1;
          }
        }
      }
      markFinder(0, 0);
      markFinder(0, N - 7);
      markFinder(N - 7, 0);

      // Timing lines
      for (let i = 0; i < N; i++) {
        isFunction[6][i] = 1;
        isFunction[i][6] = 1;
      }

      // Format bits around TL
      formatCoords1.forEach(([r, c]) => { isFunction[r][c] = 1; });

      // Format bits at TR and BL
      for (let i = 0; i < 7; i++) isFunction[N - 1 - i][8] = 1;
      for (let i = 0; i < 8; i++) isFunction[8][N - 8 + i] = 1;

      // Dark module
      if (4 * version + 9 < N) isFunction[4 * version + 9][8] = 1;

      // Alignment patterns for Version 2+
      if (version >= 2 && version < QR_ALIGN_COORDS.length) {
        const locs = QR_ALIGN_COORDS[version];
        for (const ar of locs) {
          for (const ac of locs) {
            if ((ar < 9 && ac < 9) || (ar < 9 && ac >= N - 8) || (ar >= N - 8 && ac < 9)) continue;
            for (let dr = -2; dr <= 2; dr++) {
              for (let dc = -2; dc <= 2; dc++) {
                const pr = ar + dr, pc = ac + dc;
                if (pr >= 0 && pr < N && pc >= 0 && pc < N) isFunction[pr][pc] = 1;
              }
            }
          }
        }
      }

      // Version Information blocks for Version 7+
      if (version >= 7) {
        for (let r = 0; r < 6; r++) {
          for (let c = 0; c < 3; c++) {
            isFunction[r][N - 11 + c] = 1;
            isFunction[N - 11 + c][r] = 1;
          }
        }
      }

      // Unmask data modules & extract codewords
      const bits = [];
      let upwards = true;
      for (let col = N - 1; col > 0; col -= 2) {
        if (col === 6) col = 5;
        const rows = upwards
          ? Array.from({ length: N }, (_, i) => N - 1 - i)
          : Array.from({ length: N }, (_, i) => i);

        for (const row of rows) {
          for (const c of [col, col - 1]) {
            if (!isFunction[row][c]) {
              const rawBit = matrix[row][c];
              const maskBit = isMasked(formatInfo.mask, row, c) ? 1 : 0;
              bits.push(rawBit ^ maskBit);
            }
          }
        }
        upwards = !upwards;
      }

      // Convert bits to codewords
      const totalCodewords = Math.floor(bits.length / 8);
      const codewords = new Uint8Array(totalCodewords);
      for (let i = 0; i < totalCodewords; i++) {
        let b = 0;
        for (let k = 0; k < 8; k++) b = (b << 1) | bits[i * 8 + k];
        codewords[i] = b;
      }

      // De-interleave and RS-correct blocks
      const cap = QR_BLOCK_CAPACITY[version] && QR_BLOCK_CAPACITY[version][formatInfo.ecLevel];
      if (!cap) continue;

      const [totalBytes, eccPerBlock, numG1, dataG1, numG2, dataG2] = cap;
      const totalBlocks = numG1 + numG2;

      const blockData = Array.from({ length: totalBlocks }, (_, idx) => {
        const dataLen = idx < numG1 ? dataG1 : dataG2;
        return new Uint8Array(dataLen + eccPerBlock);
      });

      let cwIdx = 0;
      const maxDataLen = Math.max(dataG1, dataG2 || 0);
      for (let i = 0; i < maxDataLen; i++) {
        for (let b = 0; b < totalBlocks; b++) {
          const dataLen = b < numG1 ? dataG1 : dataG2;
          if (i < dataLen && cwIdx < codewords.length) {
            blockData[b][i] = codewords[cwIdx++];
          }
        }
      }
      for (let i = 0; i < eccPerBlock; i++) {
        for (let b = 0; b < totalBlocks; b++) {
          const dataLen = b < numG1 ? dataG1 : dataG2;
          if (cwIdx < codewords.length) {
            blockData[b][dataLen + i] = codewords[cwIdx++];
          }
        }
      }

      // Correct each block with Reed-Solomon
      let allData = [];
      let decodeSuccess = true;
      for (let b = 0; b < totalBlocks; b++) {
        try {
          const corrected = rsCorrect(blockData[b], eccPerBlock);
          allData.push(...corrected);
        } catch (e) {
          decodeSuccess = false;
          break;
        }
      }
      if (!decodeSuccess) continue;

      // Unpack QR string payload
      const decodedText = decodeQRPayload(new Uint8Array(allData), version);
      if (decodedText && decodedText.length > 0) {
        return { format: 'qr_code', text: decodedText };
      }
    }

    return null;
  }

  function decodeQRPayload(dataBytes, version) {
    let bitPos = 0;
    function readBits(num) {
      let res = 0;
      for (let i = 0; i < num; i++) {
        const byteIdx = (bitPos + i) >> 3;
        const bitInByte = 7 - ((bitPos + i) & 7);
        if (byteIdx < dataBytes.length) {
          const bit = (dataBytes[byteIdx] >> bitInByte) & 1;
          res = (res << 1) | bit;
        }
      }
      bitPos += num;
      return res;
    }

    let text = "";
    while (bitPos + 4 <= dataBytes.length * 8) {
      const mode = readBits(4);
      if (mode === 0) break; // Terminator

      if (mode === 1) { // Numeric
        const countBits = version < 10 ? 10 : (version < 27 ? 12 : 14);
        let count = readBits(countBits);
        while (count >= 3) {
          text += readBits(10).toString().padStart(3, '0');
          count -= 3;
        }
        if (count === 2) text += readBits(7).toString().padStart(2, '0');
        else if (count === 1) text += readBits(4).toString();
      } else if (mode === 2) { // Alphanumeric
        const ALPHANUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
        const countBits = version < 10 ? 9 : (version < 27 ? 11 : 13);
        let count = readBits(countBits);
        while (count >= 2) {
          const val = readBits(11);
          text += ALPHANUM[Math.floor(val / 45)] + ALPHANUM[val % 45];
          count -= 2;
        }
        if (count === 1) text += ALPHANUM[readBits(6)];
      } else if (mode === 4) { // 8-bit Byte
        const countBits = version < 10 ? 8 : 16;
        const count = readBits(countBits);
        const bytes = new Uint8Array(count);
        for (let i = 0; i < count; i++) bytes[i] = readBits(8);
        try {
          text += new TextDecoder('utf-8').decode(bytes);
        } catch (e) {
          for (let i = 0; i < count; i++) text += String.fromCharCode(bytes[i]);
        }
      } else {
        break;
      }
    }
    return text;
  }

  // ==========================================
  // 5. Pure-JS 1D Barcode Decoders
  // ==========================================
  const CODE128_PATTERNS = [
    "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
    "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
    "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
    "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
    "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
    "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
    "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
    "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
    "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
    "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
    "114131", "311141", "411131", "211412", "211214", "211232", "2331112"
  ];

  function scanlineRuns(binaryLine) {
    const runs = [];
    let currentVal = binaryLine[0];
    let count = 0;
    for (let i = 0; i < binaryLine.length; i++) {
      if (binaryLine[i] === currentVal) {
        count++;
      } else {
        runs.push({ isBar: currentVal === 1, length: count });
        currentVal = binaryLine[i];
        count = 1;
      }
    }
    if (count > 0) runs.push({ isBar: currentVal === 1, length: count });
    return runs;
  }

  // Code 128 with Full Mode Switching (A, B, C) and Fault-Tolerant Pattern Matching
  function decodeCode128(runs) {
    for (let i = 0; i < runs.length - 7; i++) {
      if (!runs[i].isBar) continue;
      const sixRuns = runs.slice(i, i + 6);
      const totalLen = sixRuns.reduce((sum, r) => sum + r.length, 0);
      const unit = totalLen / 11;
      if (unit < 0.5) continue;

      const norm = sixRuns.map(r => Math.round(r.length / unit)).join("");
      let startCode = -1;
      if (norm === "211412") startCode = 103; // Start A
      else if (norm === "211214") startCode = 104; // Start B
      else if (norm === "211232") startCode = 105; // Start C

      if (startCode !== -1) {
        const codes = [startCode];
        let pos = i + 6;
        let foundStop = false;

        while (pos <= runs.length - 6) {
          if (pos <= runs.length - 7) {
            const stopRuns = runs.slice(pos, pos + 7);
            const stopLen = stopRuns.reduce((s, r) => s + r.length, 0);
            const stopUnit = stopLen / 13;
            const stopNorm = stopRuns.map(r => Math.round(r.length / stopUnit)).join("");
            if (stopNorm === "2331112") {
              foundStop = true;
              break;
            }
          }

          const symRuns = runs.slice(pos, pos + 6);
          const symLen = symRuns.reduce((s, r) => s + r.length, 0);
          const symUnit = symLen / 11;
          const symNorm = symRuns.map(r => Math.round(r.length / symUnit)).join("");

          let matched = -1;
          for (let c = 0; c < 106; c++) {
            if (CODE128_PATTERNS[c] === symNorm) { matched = c; break; }
          }

          // Fault-tolerant matching for antialiased / resized bars
          if (matched === -1) {
            let bestDist = 999;
            for (let c = 0; c < 106; c++) {
              const pat = CODE128_PATTERNS[c];
              let dist = 0;
              for (let k = 0; k < 6; k++) dist += Math.abs(parseInt(pat[k], 10) - (symRuns[k].length / symUnit));
              if (dist < bestDist && dist < 1.8) {
                bestDist = dist;
                matched = c;
              }
            }
          }

          if (matched === -1) break;
          codes.push(matched);
          pos += 6;
        }

        if (foundStop && codes.length >= 2) {
          const checkCode = codes[codes.length - 1];
          let sum = codes[0];
          for (let c = 1; c < codes.length - 1; c++) sum += codes[c] * c;
          if (sum % 103 === checkCode) {
            let res = "";
            let mode = codes[0] === 103 ? 'A' : (codes[0] === 104 ? 'B' : 'C');
            let shift = false;

            for (let c = 1; c < codes.length - 1; c++) {
              const val = codes[c];
              const curMode = shift ? (mode === 'A' ? 'B' : 'A') : mode;
              shift = false;

              if (curMode === 'A') {
                if (val === 99) mode = 'C';
                else if (val === 100) mode = 'B';
                else if (val === 98) shift = true;
                else if (val === 101 || val === 102) { /* FNC4 / FNC1 */ }
                else if (val < 64) res += String.fromCharCode(val + 32);
                else if (val <= 95) res += String.fromCharCode(val - 64);
              } else if (curMode === 'B') {
                if (val === 99) mode = 'C';
                else if (val === 101) mode = 'A';
                else if (val === 98) shift = true;
                else if (val === 100 || val === 102) { /* FNC4 / FNC1 */ }
                else if (val <= 95) res += String.fromCharCode(val + 32);
              } else if (curMode === 'C') {
                if (val === 100) mode = 'B';
                else if (val === 101) mode = 'A';
                else if (val === 102) { /* FNC1 */ }
                else if (val <= 99) res += (val < 10 ? '0' : '') + val;
              }
            }
            return { format: 'code_128', text: res };
          }
        }
      }
    }
    return null;
  }

  // EAN-13 & UPC-A
  const EAN_L_CODES = ["3211", "2221", "2122", "1411", "1132", "1231", "1114", "1312", "1213", "3112"];
  const EAN_G_CODES = ["1123", "1222", "2212", "1141", "2311", "1321", "4111", "2131", "3121", "2113"];
  const EAN_R_CODES = ["3211", "2221", "2122", "1411", "1132", "1231", "1114", "1312", "1213", "3112"];
  const EAN_FIRST_PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

  function decodeEAN13(runs) {
    for (let i = 0; i <= runs.length - 59; i++) {
      if (!runs[i].isBar || runs[i + 1].isBar || !runs[i + 2].isBar) continue;

      const guardLen = runs[i].length + runs[i + 1].length + runs[i + 2].length;
      const unit = guardLen / 3;
      if (unit < 0.5) continue;

      const centerIdx = i + 3 + 24;
      if (centerIdx + 5 > runs.length) continue;
      const centerRuns = runs.slice(centerIdx, centerIdx + 5);
      const centerLen = centerRuns.reduce((s, r) => s + r.length, 0);
      if (Math.abs(centerLen / 5 - unit) > unit * 0.7) continue;

      const endIdx = centerIdx + 5 + 24;
      if (endIdx + 3 > runs.length) continue;
      const endRuns = runs.slice(endIdx, endIdx + 3);
      const endLen = endRuns.reduce((s, r) => s + r.length, 0);
      if (Math.abs(endLen / 3 - unit) > unit * 0.7) continue;

      let leftDigits = [];
      let leftParity = "";
      let validLeft = true;

      for (let d = 0; d < 6; d++) {
        const dRuns = runs.slice(i + 3 + d * 4, i + 3 + (d + 1) * 4);
        const dLen = dRuns.reduce((s, r) => s + r.length, 0);
        const dUnit = dLen / 7;
        const dNorm = dRuns.map(r => Math.round(r.length / dUnit)).join("");

        let matchedDigit = -1, matchedType = '', bestDist = 999;
        for (let num = 0; num < 10; num++) {
          let distL = 0;
          for (let k = 0; k < 4; k++) distL += Math.abs(parseInt(EAN_L_CODES[num][k]) - parseInt(dNorm[k] || "0"));
          if (distL < bestDist && distL <= 1) { bestDist = distL; matchedDigit = num; matchedType = 'L'; }
          let distG = 0;
          for (let k = 0; k < 4; k++) distG += Math.abs(parseInt(EAN_G_CODES[num][k]) - parseInt(dNorm[k] || "0"));
          if (distG < bestDist && distG <= 1) { bestDist = distG; matchedDigit = num; matchedType = 'G'; }
        }
        if (matchedDigit === -1) { validLeft = false; break; }
        leftDigits.push(matchedDigit);
        leftParity += matchedType;
      }
      if (!validLeft) continue;

      const firstDigit = EAN_FIRST_PARITY.indexOf(leftParity);
      if (firstDigit === -1) continue;

      let rightDigits = [];
      let validRight = true;
      for (let d = 0; d < 6; d++) {
        const dRuns = runs.slice(centerIdx + 5 + d * 4, centerIdx + 5 + (d + 1) * 4);
        const dLen = dRuns.reduce((s, r) => s + r.length, 0);
        const dUnit = dLen / 7;
        const dNorm = dRuns.map(r => Math.round(r.length / dUnit)).join("");

        let matchedDigit = -1, bestDist = 999;
        for (let num = 0; num < 10; num++) {
          let dist = 0;
          for (let k = 0; k < 4; k++) dist += Math.abs(parseInt(EAN_R_CODES[num][k]) - parseInt(dNorm[k] || "0"));
          if (dist < bestDist && dist <= 1) { bestDist = dist; matchedDigit = num; }
        }
        if (matchedDigit === -1) { validRight = false; break; }
        rightDigits.push(matchedDigit);
      }
      if (!validRight) continue;

      const allDigits = [firstDigit, ...leftDigits, ...rightDigits].join("");
      let sum = 0;
      for (let k = 0; k < 12; k++) {
        const val = parseInt(allDigits[k], 10);
        sum += (k % 2 === 0) ? val : val * 3;
      }
      const expectedCheck = (10 - (sum % 10)) % 10;
      if (expectedCheck === parseInt(allDigits[12], 10)) {
        return { format: allDigits.startsWith("0") ? "upc_a" : "ean_13", text: allDigits };
      }
    }
    return null;
  }

  // EAN-8
  function decodeEAN8(runs) {
    for (let i = 0; i <= runs.length - 43; i++) {
      if (!runs[i].isBar || runs[i + 1].isBar || !runs[i + 2].isBar) continue;

      const guardLen = runs[i].length + runs[i + 1].length + runs[i + 2].length;
      const unit = guardLen / 3;
      if (unit < 0.5) continue;

      const centerIdx = i + 3 + 16;
      if (centerIdx + 5 > runs.length) continue;
      const centerRuns = runs.slice(centerIdx, centerIdx + 5);
      const centerLen = centerRuns.reduce((s, r) => s + r.length, 0);
      if (Math.abs(centerLen / 5 - unit) > unit * 0.7) continue;

      const endIdx = centerIdx + 5 + 16;
      if (endIdx + 3 > runs.length) continue;
      const endRuns = runs.slice(endIdx, endIdx + 3);
      const endLen = endRuns.reduce((s, r) => s + r.length, 0);
      if (Math.abs(endLen / 3 - unit) > unit * 0.7) continue;

      let leftDigits = [];
      let validLeft = true;
      for (let d = 0; d < 4; d++) {
        const dRuns = runs.slice(i + 3 + d * 4, i + 3 + (d + 1) * 4);
        const dLen = dRuns.reduce((s, r) => s + r.length, 0);
        const dUnit = dLen / 7;
        const dNorm = dRuns.map(r => Math.round(r.length / dUnit)).join("");

        let matched = -1, bestDist = 999;
        for (let num = 0; num < 10; num++) {
          let dist = 0;
          for (let k = 0; k < 4; k++) dist += Math.abs(parseInt(EAN_L_CODES[num][k]) - parseInt(dNorm[k] || "0"));
          if (dist < bestDist && dist <= 1) { bestDist = dist; matched = num; }
        }
        if (matched === -1) { validLeft = false; break; }
        leftDigits.push(matched);
      }
      if (!validLeft) continue;

      let rightDigits = [];
      let validRight = true;
      for (let d = 0; d < 4; d++) {
        const dRuns = runs.slice(centerIdx + 5 + d * 4, centerIdx + 5 + (d + 1) * 4);
        const dLen = dRuns.reduce((s, r) => s + r.length, 0);
        const dUnit = dLen / 7;
        const dNorm = dRuns.map(r => Math.round(r.length / dUnit)).join("");

        let matched = -1, bestDist = 999;
        for (let num = 0; num < 10; num++) {
          let dist = 0;
          for (let k = 0; k < 4; k++) dist += Math.abs(parseInt(EAN_R_CODES[num][k]) - parseInt(dNorm[k] || "0"));
          if (dist < bestDist && dist <= 1) { bestDist = dist; matched = num; }
        }
        if (matched === -1) { validRight = false; break; }
        rightDigits.push(matched);
      }
      if (!validRight) continue;

      const allDigits = [...leftDigits, ...rightDigits].join("");
      let sum = 0;
      for (let k = 0; k < 7; k++) {
        const val = parseInt(allDigits[k], 10);
        sum += (k % 2 === 0) ? val * 3 : val;
      }
      const expectedCheck = (10 - (sum % 10)) % 10;
      if (expectedCheck === parseInt(allDigits[7], 10)) {
        return { format: 'ean_8', text: allDigits };
      }
    }
    return null;
  }

  // Code 39
  const CODE39_ENCODINGS = {
    "0": "000110100", "1": "100100001", "2": "001100001", "3": "101100000",
    "4": "000110001", "5": "100110000", "6": "001110000", "7": "000100101",
    "8": "100100100", "9": "001100100", "A": "100001001", "B": "001001001",
    "C": "101001000", "D": "000011001", "E": "100011000", "F": "001011000",
    "G": "000001101", "H": "100001100", "I": "001001100", "J": "000011100",
    "K": "100000011", "L": "001000011", "M": "101000010", "N": "000010011",
    "O": "100010010", "P": "001010010", "Q": "000000111", "R": "100000110",
    "S": "001000110", "T": "000010110", "U": "110000001", "V": "011000001",
    "W": "111000000", "X": "010010001", "Y": "110010000", "Z": "011010000",
    "-": "010000101", ".": "110000100", " ": "011000100", "$": "010101000",
    "/": "010100010", "+": "010001010", "%": "000101010", "*": "010010100"
  };

  function decodeCode39(runs) {
    for (let i = 0; i <= runs.length - 19; i++) {
      if (!runs[i].isBar) continue;
      const nineRuns = runs.slice(i, i + 9);
      const sorted = nineRuns.map(r => r.length).sort((a, b) => a - b);
      const narrowAvg = (sorted[0] + sorted[1] + sorted[2] + sorted[3] + sorted[4] + sorted[5]) / 6;
      const wideAvg = (sorted[6] + sorted[7] + sorted[8]) / 3;
      if (wideAvg < narrowAvg * 1.5) continue;
      const threshold = (narrowAvg + wideAvg) / 2;

      const pat = nineRuns.map(r => r.length > threshold ? '1' : '0').join("");
      if (CODE39_ENCODINGS["*"] !== pat) continue;

      let res = "";
      let pos = i + 9;
      let foundStop = false;

      while (pos <= runs.length - 9) {
        if (pos < runs.length && !runs[pos].isBar) pos++;
        if (pos + 9 > runs.length) break;
        const charRuns = runs.slice(pos, pos + 9);
        const cPat = charRuns.map(r => r.length > threshold ? '1' : '0').join("");
        let matchedChar = null;
        for (const [ch, p] of Object.entries(CODE39_ENCODINGS)) {
          if (p === cPat) { matchedChar = ch; break; }
        }
        if (!matchedChar) break;
        if (matchedChar === '*') { foundStop = true; break; }
        res += matchedChar;
        pos += 9;
      }

      if (foundStop && res.length > 0) {
        return { format: 'code_39', text: res };
      }
    }
    return null;
  }

  // Interleaved 2 of 5 (ITF)
  const ITF_PATTERNS = [
    "00110", "10001", "01001", "11000", "00101",
    "10100", "01100", "00011", "10010", "01010"
  ];

  function decodeITF(runs) {
    for (let i = 0; i <= runs.length - 17; i++) {
      if (!runs[i].isBar || runs[i + 1].isBar || !runs[i + 2].isBar || runs[i + 3].isBar) continue;

      const startRuns = runs.slice(i, i + 4);
      const startAvg = startRuns.reduce((s, r) => s + r.length, 0) / 4;
      if (startAvg < 0.5) continue;
      let isStart = true;
      for (const r of startRuns) {
        if (Math.abs(r.length - startAvg) > startAvg * 0.75) { isStart = false; break; }
      }
      if (!isStart) continue;

      let threshold = startAvg * 1.75;
      let pos = i + 4;
      let digits = "";

      while (pos + 10 <= runs.length) {
        const pairRuns = runs.slice(pos, pos + 10);
        const barRuns = [pairRuns[0], pairRuns[2], pairRuns[4], pairRuns[6], pairRuns[8]];
        const spaceRuns = [pairRuns[1], pairRuns[3], pairRuns[5], pairRuns[7], pairRuns[9]];

        const allLens = pairRuns.map(r => r.length).sort((a, b) => a - b);
        const currNarrow = (allLens[0] + allLens[1] + allLens[2] + allLens[3] + allLens[4] + allLens[5]) / 6;
        const currWide = (allLens[6] + allLens[7] + allLens[8] + allLens[9]) / 4;
        if (currWide > currNarrow * 1.5) {
          threshold = (currNarrow + currWide) / 2;
        }

        const barPat = barRuns.map(r => r.length > threshold ? '1' : '0').join("");
        const spacePat = spaceRuns.map(r => r.length > threshold ? '1' : '0').join("");

        const d1 = ITF_PATTERNS.indexOf(barPat);
        const d2 = ITF_PATTERNS.indexOf(spacePat);
        if (d1 === -1 || d2 === -1) break;

        digits += d1.toString() + d2.toString();
        pos += 10;
      }

      if (digits.length >= 2 && pos <= runs.length - 3) {
        if (runs[pos].isBar && !runs[pos + 1].isBar && runs[pos + 2].isBar) {
          if (runs[pos].length > threshold * 0.8 && runs[pos + 1].length <= threshold * 1.2 && runs[pos + 2].length <= threshold * 1.2) {
            return { format: 'itf', text: digits };
          }
        }
      }
    }
    return null;
  }

  // Codabar / NW-7
  const CODABAR_PATTERNS = {
    "0000011": "0", "0000110": "1", "0001001": "2", "1100000": "3",
    "0010010": "4", "1000010": "5", "0100001": "6", "0100100": "7",
    "0110000": "8", "1001000": "9", "0001100": "-", "0011000": "$",
    "1000101": ":", "1010001": "/", "1010100": ".", "0010101": "+",
    "0011010": "A", "0101001": "B", "0001011": "C", "0001110": "D"
  };

  function decodeCodabar(runs) {
    for (let i = 0; i <= runs.length - 15; i++) {
      if (!runs[i].isBar) continue;

      const sevenRuns = runs.slice(i, i + 7);
      const sorted = sevenRuns.map(r => r.length).sort((a, b) => a - b);
      const narrowAvg = (sorted[0] + sorted[1] + sorted[2] + sorted[3]) / 4;
      const wideAvg = (sorted[4] + sorted[5] + sorted[6]) / 3;
      if (wideAvg < narrowAvg * 1.5) continue;
      const threshold = (narrowAvg + wideAvg) / 2;

      const pat = sevenRuns.map(r => r.length > threshold ? '1' : '0').join("");
      const startChar = CODABAR_PATTERNS[pat];
      if (!startChar || !['A', 'B', 'C', 'D'].includes(startChar)) continue;

      let res = "";
      let pos = i + 7;
      let foundStop = false;

      while (pos <= runs.length - 7) {
        if (pos < runs.length && !runs[pos].isBar) pos++;
        if (pos + 7 > runs.length) break;

        const cRuns = runs.slice(pos, pos + 7);
        const cSort = cRuns.map(r => r.length).sort((a, b) => a - b);
        const cThresh = (cSort[2] + cSort[4]) / 2;
        const cPat = cRuns.map(r => r.length > cThresh ? '1' : '0').join("");
        const ch = CODABAR_PATTERNS[cPat];
        if (!ch) break;

        if (['A', 'B', 'C', 'D'].includes(ch)) {
          foundStop = true;
          break;
        }
        res += ch;
        pos += 7;
      }

      if (foundStop && res.length >= 1) {
        return { format: 'codabar', text: res };
      }
    }
    return null;
  }

  function decode1D(binaryObj) {
    const { w, h, binary } = binaryObj;

    // Scan 35 dense horizontal slices from 5% to 92% height
    const hSlices = [];
    for (let r = 0.05; r <= 0.92; r += 0.025) {
      hSlices.push(Math.round(h * r));
    }

    for (const y of hSlices) {
      if (y < 0 || y >= h) continue;
      const line = new Uint8Array(w);
      for (let x = 0; x < w; x++) line[x] = binary[y * w + x];
      const runs = scanlineRuns(line);

      // Try forward
      let c128 = decodeCode128(runs);
      if (c128) return c128;
      let ean = decodeEAN13(runs);
      if (ean) return ean;
      let ean8 = decodeEAN8(runs);
      if (ean8) return ean8;
      let itf = decodeITF(runs);
      if (itf) return itf;
      let c39 = decodeCode39(runs);
      if (c39) return c39;
      let cbar = decodeCodabar(runs);
      if (cbar) return cbar;

      // Try reverse (barcode in flipped orientation)
      const revRuns = runs.slice().reverse().map(r => ({ isBar: r.isBar, length: r.length }));
      c128 = decodeCode128(revRuns);
      if (c128) return c128;
      ean = decodeEAN13(revRuns);
      if (ean) return ean;
      ean8 = decodeEAN8(revRuns);
      if (ean8) return ean8;
      itf = decodeITF(revRuns);
      if (itf) return itf;
      c39 = decodeCode39(revRuns);
      if (c39) return c39;
      cbar = decodeCodabar(revRuns);
      if (cbar) return cbar;
    }

    // Scan vertical slices (vertical barcodes)
    const vSlices = [];
    for (let r = 0.05; r <= 0.92; r += 0.03) {
      vSlices.push(Math.round(w * r));
    }
    for (const x of vSlices) {
      if (x < 0 || x >= w) continue;
      const line = new Uint8Array(h);
      for (let y = 0; y < h; y++) line[y] = binary[y * w + x];
      const runs = scanlineRuns(line);

      let c128 = decodeCode128(runs);
      if (c128) return c128;
      let ean = decodeEAN13(runs);
      if (ean) return ean;
      let ean8 = decodeEAN8(runs);
      if (ean8) return ean8;
      let itf = decodeITF(runs);
      if (itf) return itf;
      let c39 = decodeCode39(runs);
      if (c39) return c39;
      let cbar = decodeCodabar(runs);
      if (cbar) return cbar;

      const revRuns = runs.slice().reverse().map(r => ({ isBar: r.isBar, length: r.length }));
      c128 = decodeCode128(revRuns);
      if (c128) return c128;
      ean = decodeEAN13(revRuns);
      if (ean) return ean;
      ean8 = decodeEAN8(revRuns);
      if (ean8) return ean8;
      itf = decodeITF(revRuns);
      if (itf) return itf;
      c39 = decodeCode39(revRuns);
      if (c39) return c39;
      cbar = decodeCodabar(revRuns);
      if (cbar) return cbar;
    }

    return null;
  }

  // ==========================================
  // 6. Universal Decoder Entry Point
  // ==========================================
  const UniversalBarcodeDecoder = {
    async decode(canvas, ctx) {
      // 1. Try Hardware-accelerated BarcodeDetector if available on OS (macOS/ChromeOS)
      if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
        try {
          const supported = await BarcodeDetector.getSupportedFormats().catch(() => []);
          if (supported && supported.length > 0) {
            const detector = new BarcodeDetector({ formats: supported });
            const results = await detector.detect(canvas);
            if (results && results.length > 0) {
              const res = results[0];
              return {
                found: true,
                format: res.format || 'barcode',
                text: res.rawValue,
                engine: 'Hardware (BarcodeDetector)'
              };
            }
          }
        } catch (err) {
          console.warn("Native BarcodeDetector not available or failed, using Pure JS fallback.", err);
        }
      }

      // 2. Pure JavaScript Engine Fallback (Windows, Linux, macOS)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const binarizers = [
        () => binarizeImage(imageData), // Bradley-Roth local adaptive threshold
        () => binarizeOtsu(imageData)   // Otsu global threshold
      ];

      for (const getBin of binarizers) {
        const binaryObj = getBin();

        // 2a. Check QR Code (normal)
        try {
          const qr = decodeQRCode(binaryObj);
          if (qr) return { found: true, format: 'qr_code', text: qr.text, engine: 'Pure JavaScript Engine' };
        } catch (e) {}

        // 2b. Check QR Code (inverted / dark mode)
        try {
          const invBin = new Uint8Array(binaryObj.binary.length);
          for (let i = 0; i < binaryObj.binary.length; i++) invBin[i] = binaryObj.binary[i] ^ 1;
          const invObj = { w: binaryObj.w, h: binaryObj.h, binary: invBin, lum: binaryObj.lum };
          const qrInv = decodeQRCode(invObj);
          if (qrInv) return { found: true, format: 'qr_code', text: qrInv.text, engine: 'Pure JavaScript Engine (Dark Mode)' };
        } catch (e) {}

        // 2c. Check 1D Barcodes (Code 128, EAN-13, EAN-8, UPC-A, Code 39, ITF, Codabar)
        try {
          const bc = decode1D(binaryObj);
          if (bc) return { found: true, format: bc.format, text: bc.text, engine: 'Pure JavaScript Engine' };
        } catch (e) {}

        // 2d. Check 1D Barcodes (inverted)
        try {
          const invBin = new Uint8Array(binaryObj.binary.length);
          for (let i = 0; i < binaryObj.binary.length; i++) invBin[i] = binaryObj.binary[i] ^ 1;
          const invObj = { w: binaryObj.w, h: binaryObj.h, binary: invBin, lum: binaryObj.lum };
          const bcInv = decode1D(invObj);
          if (bcInv) return { found: true, format: bcInv.format, text: bcInv.text, engine: 'Pure JavaScript Engine (Inverted)' };
        } catch (e) {}
      }

      return { found: false };
    }
  };

  // Export to global scope
  global.UniversalBarcodeDecoder = UniversalBarcodeDecoder;

})(typeof window !== 'undefined' ? window : globalThis);
