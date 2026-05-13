// Diffraction lab — Fraunhofer N-slit grating.
// Plain canvas + DOM, no build step.
//
//   β = π a sin θ / λ
//   γ = π d sin θ / λ
//   I(θ) = (sin β / β)² · (sin N γ / sin γ)²
//
// Slits, slit-width and spacing in micrometres; wavelength in nanometres.
// Everything is converted to nm before the trig.

(() => {
  // ---------- DOM ----------
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");

  const NSlider = document.getElementById("N");
  const dSlider = document.getElementById("d");
  const aSlider = document.getElementById("a");
  const lambdaSlider = document.getElementById("lambda");

  const NValue = document.getElementById("NValue");
  const dValue = document.getElementById("dValue");
  const aValue = document.getElementById("aValue");
  const lambdaValue = document.getElementById("lambdaValue");

  const modeBtn = document.getElementById("mode");
  const resetBtn = document.getElementById("reset");

  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ---------- state ----------
  const DEFAULTS = { N: 4, d: 5.0, a: 1.0, lambda: 550, whiteLight: false };
  let N = DEFAULTS.N;
  let d = DEFAULTS.d; // μm
  let a = DEFAULTS.a; // μm
  let lambda = DEFAULTS.lambda; // nm
  let whiteLight = DEFAULTS.whiteLight;

  // Wavelengths plotted in white-light mode.
  const WHITE_BAND = [450, 480, 520, 580, 620, 680];

  // ---------- canvas sizing ----------
  function sizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas._w = rect.width;
    canvas._h = rect.height;
    canvas._dpr = dpr;
  }

  // ---------- style cache ----------
  let cachedStyle = null;
  let cachedAt = 0;
  function styles() {
    const now = performance.now();
    if (cachedStyle && now - cachedAt < 500) return cachedStyle;
    const cs = getComputedStyle(document.body);
    cachedStyle = {
      bg: cs.getPropertyValue("--bg").trim() || "#eef0ee",
      bgDeep: cs.getPropertyValue("--bg-deep").trim() || "#e3e6e3",
      ink: cs.getPropertyValue("--ink").trim() || "#14161e",
      inkSoft: cs.getPropertyValue("--ink-soft").trim() || "#2c2f3a",
      muted: cs.getPropertyValue("--muted").trim() || "#5b5f68",
      rule: cs.getPropertyValue("--rule").trim() || "#d2d5d2",
      accent: cs.getPropertyValue("--accent-warm").trim() || "#2e4cc7",
    };
    cachedAt = now;
    return cachedStyle;
  }

  // ---------- colour helpers ----------
  function withAlpha(hex, alpha) {
    const h = hex.replace("#", "");
    if (h.length !== 6) return hex;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  function rgbCss(rgb, alpha = 1) {
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
  }

  // Dan Bruton wavelength → RGB approximation, with attenuation near 380 & 780.
  function wavelengthToRGB(lam) {
    let r = 0,
      g = 0,
      b = 0;
    if (lam >= 380 && lam < 440) {
      r = -(lam - 440) / (440 - 380);
      g = 0;
      b = 1;
    } else if (lam < 490) {
      r = 0;
      g = (lam - 440) / (490 - 440);
      b = 1;
    } else if (lam < 510) {
      r = 0;
      g = 1;
      b = -(lam - 510) / (510 - 490);
    } else if (lam < 580) {
      r = (lam - 510) / (580 - 510);
      g = 1;
      b = 0;
    } else if (lam < 645) {
      r = 1;
      g = -(lam - 645) / (645 - 580);
      b = 0;
    } else if (lam <= 780) {
      r = 1;
      g = 0;
      b = 0;
    }
    let factor = 0;
    if (lam >= 380 && lam < 420) {
      factor = 0.3 + (0.7 * (lam - 380)) / (420 - 380);
    } else if (lam < 700) {
      factor = 1;
    } else if (lam <= 780) {
      factor = 0.3 + (0.7 * (780 - lam)) / (780 - 700);
    }
    const gamma = 0.8;
    const R = r === 0 ? 0 : Math.round(255 * Math.pow(r * factor, gamma));
    const G = g === 0 ? 0 : Math.round(255 * Math.pow(g * factor, gamma));
    const B = b === 0 ? 0 : Math.round(255 * Math.pow(b * factor, gamma));
    return [R, G, B];
  }

  // ---------- intensity ----------
  // All distances in nm.
  // Returns intensity normalized so the central (θ=0) peak = 1.
  function intensity(theta, aNm, dNm, NSlits, lamNm) {
    const sinT = Math.sin(theta);
    const beta = (Math.PI * aNm * sinT) / lamNm;
    const gamma = (Math.PI * dNm * sinT) / lamNm;

    let single;
    if (Math.abs(beta) < 1e-9) {
      single = 1;
    } else {
      const s = Math.sin(beta) / beta;
      single = s * s;
    }

    let multi;
    const sinG = Math.sin(gamma);
    if (Math.abs(sinG) < 1e-9) {
      // sin(Nγ)/sin(γ) → N at γ = mπ; (sin Nγ / sin γ)² → N²
      // Normalised by N², gives 1.
      multi = 1;
    } else {
      const f = Math.sin(NSlits * gamma) / sinG;
      multi = (f * f) / (NSlits * NSlits);
    }
    return single * multi;
  }

  // ---------- drawing ----------
  function draw() {
    if (!canvas._w) return;
    const w = canvas._w;
    const h = canvas._h;
    const dpr = canvas._dpr;
    const s = styles();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Top schematic ≈ 220/480 of the height; bottom is the pattern.
    const splitY = Math.round(h * (220 / 480));
    drawSchematic(0, 0, w, splitY, s);
    drawPattern(0, splitY, w, h - splitY, s);
  }

  function drawSchematic(x, y, w, h, s) {
    ctx.save();
    ctx.translate(x, y);

    // ---- plane wave on the left third ----
    const waveX0 = w * 0.04;
    const waveX1 = w * 0.34;
    const nWaves = 10;
    ctx.strokeStyle = withAlpha(s.accent, 0.5);
    ctx.lineWidth = 1;
    for (let i = 0; i < nWaves; i++) {
      const px = waveX0 + ((waveX1 - waveX0) * i) / (nWaves - 1);
      ctx.beginPath();
      ctx.moveTo(px, h * 0.16);
      ctx.lineTo(px, h * 0.84);
      ctx.stroke();
    }

    // arrow-of-propagation
    ctx.strokeStyle = withAlpha(s.muted, 0.6);
    ctx.lineWidth = 1;
    const arrowY = h * 0.5;
    ctx.beginPath();
    ctx.moveTo(waveX1 + 6, arrowY);
    ctx.lineTo(waveX1 + 36, arrowY);
    ctx.moveTo(waveX1 + 30, arrowY - 4);
    ctx.lineTo(waveX1 + 36, arrowY);
    ctx.lineTo(waveX1 + 30, arrowY + 4);
    ctx.stroke();

    // ---- grating (vertical bar with horizontal slits) ----
    const grX = w * 0.46;
    const barTop = h * 0.10;
    const barBottom = h * 0.90;
    const barW = 8;

    ctx.fillStyle = s.inkSoft;
    ctx.fillRect(grX - barW / 2, barTop, barW, barBottom - barTop);

    // Slit layout: visual spacing scales with d (μm); thickness with a (μm).
    const centerY = (barTop + barBottom) / 2;
    const maxSpan = (barBottom - barTop) * 0.84;
    let gapPx = 10 + d * 1.1; // grows with d
    if (N > 1) {
      const totalSpan = (N - 1) * gapPx;
      if (totalSpan > maxSpan) gapPx = maxSpan / (N - 1);
    }
    const slitThickness = Math.max(1.6, 1.4 + a * 0.9);

    // "Cut" each slit by overpainting with page bg.
    ctx.fillStyle = s.bg;
    for (let i = 0; i < N; i++) {
      const offset = (i - (N - 1) / 2) * gapPx;
      const sy = centerY + offset;
      ctx.fillRect(grX - barW / 2 - 0.5, sy - slitThickness / 2, barW + 1, slitThickness);
    }

    // ---- diffracted rays fanning to the screen ----
    const screenX = w * 0.96;
    const fanAngles = [-0.32, -0.16, 0, 0.16, 0.32];
    const rayColor = whiteLight
      ? withAlpha(s.inkSoft, 0.32)
      : rgbCss(wavelengthToRGB(lambda), 0.45);
    ctx.strokeStyle = rayColor;
    ctx.setLineDash([2, 3]);
    ctx.lineWidth = 1;
    for (let i = 0; i < N; i++) {
      const offset = (i - (N - 1) / 2) * gapPx;
      const sy = centerY + offset;
      for (const ang of fanAngles) {
        const dx = screenX - grX;
        const ey = sy + Math.tan(ang) * dx;
        ctx.beginPath();
        ctx.moveTo(grX, sy);
        ctx.lineTo(screenX, ey);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    // ---- screen line at the right edge ----
    ctx.strokeStyle = withAlpha(s.muted, 0.7);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(screenX, h * 0.08);
    ctx.lineTo(screenX, h * 0.92);
    ctx.stroke();

    // ---- labels ----
    ctx.fillStyle = s.muted;
    ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillText("plane wave", waveX0, h - 6);
    ctx.textAlign = "center";
    ctx.fillText("grating · N=" + N, grX, h - 6);
    ctx.textAlign = "right";
    ctx.fillText("screen", screenX, h - 6);

    ctx.restore();
  }

  function drawPattern(x, y, w, h, s) {
    ctx.save();
    ctx.translate(x, y);

    const thetaMax = Math.PI / 4;
    const aNm = a * 1000;
    const dNm = d * 1000;

    const stripTop = 8;
    const stripBottom = Math.round(h * 0.40);
    const curveTop = stripBottom + 10;
    const curveBottom = h - 24;

    // High-res sampling for clean curves and a crisp strip.
    const samples = Math.max(720, Math.floor(w));
    const wavelengths = whiteLight ? WHITE_BAND : [lambda];

    const intensities = wavelengths.map((lam) => {
      const arr = new Float32Array(samples);
      for (let i = 0; i < samples; i++) {
        const theta = (-1 + (2 * i) / (samples - 1)) * thetaMax;
        arr[i] = intensity(theta, aNm, dNm, N, lam);
      }
      return arr;
    });
    const peaks = intensities.map((arr) => {
      let m = 0;
      for (let i = 0; i < arr.length; i++) if (arr[i] > m) m = arr[i];
      return m < 1e-12 ? 1 : m;
    });

    // ---- intensity strip ----
    // Render at sample resolution into a tiny offscreen canvas, then stretch.
    const stripCanvas = document.createElement("canvas");
    stripCanvas.width = samples;
    stripCanvas.height = 1;
    const stripCtx = stripCanvas.getContext("2d");
    const img = stripCtx.createImageData(samples, 1);
    const data = img.data;
    for (let i = 0; i < samples; i++) {
      let R = 0,
        G = 0,
        B = 0;
      for (let k = 0; k < wavelengths.length; k++) {
        const lam = wavelengths[k];
        const [r, g, b] = wavelengthToRGB(lam);
        const Inorm = intensities[k][i] / peaks[k];
        R += r * Inorm;
        G += g * Inorm;
        B += b * Inorm;
      }
      R = Math.min(255, R);
      G = Math.min(255, G);
      B = Math.min(255, B);
      const idx = i * 4;
      data[idx] = R;
      data[idx + 1] = G;
      data[idx + 2] = B;
      data[idx + 3] = 255;
    }
    stripCtx.putImageData(img, 0, 0);

    // Dim base behind strip (so subpixel gaps don't show the page through).
    ctx.fillStyle = "#000";
    ctx.fillRect(0, stripTop, w, stripBottom - stripTop);
    // Stretch the 1-row strip up to full strip height.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(stripCanvas, 0, stripTop, w, stripBottom - stripTop);
    ctx.imageSmoothingEnabled = true;

    // Subtle frame around the strip
    ctx.strokeStyle = withAlpha(s.rule, 0.7);
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, stripTop + 0.5, w - 1, stripBottom - stripTop - 1);

    // ---- curve(s) ----
    const curveH = curveBottom - curveTop;

    // Baseline
    ctx.strokeStyle = withAlpha(s.rule, 0.9);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, curveBottom);
    ctx.lineTo(w, curveBottom);
    ctx.stroke();

    // Centre tick
    ctx.strokeStyle = withAlpha(s.muted, 0.4);
    ctx.beginPath();
    ctx.moveTo(w / 2, curveTop);
    ctx.lineTo(w / 2, curveBottom);
    ctx.stroke();

    if (whiteLight) {
      // One curve per λ, each in its own colour.
      for (let k = 0; k < wavelengths.length; k++) {
        const lam = wavelengths[k];
        const arr = intensities[k];
        const localPeak = peaks[k];
        ctx.strokeStyle = rgbCss(wavelengthToRGB(lam), 0.85);
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        for (let i = 0; i < samples; i++) {
          const xp = (i / (samples - 1)) * w;
          const yp = curveBottom - (arr[i] / localPeak) * curveH;
          if (i === 0) ctx.moveTo(xp, yp);
          else ctx.lineTo(xp, yp);
        }
        ctx.stroke();
      }
    } else {
      // Single-slit envelope (dotted, muted) sitting under the full pattern.
      ctx.strokeStyle = withAlpha(s.muted, 0.6);
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < samples; i++) {
        const theta = (-1 + (2 * i) / (samples - 1)) * thetaMax;
        const sinT = Math.sin(theta);
        const beta = (Math.PI * aNm * sinT) / lambda;
        let env;
        if (Math.abs(beta) < 1e-9) env = 1;
        else {
          const ss = Math.sin(beta) / beta;
          env = ss * ss;
        }
        const xp = (i / (samples - 1)) * w;
        const yp = curveBottom - env * curveH;
        if (i === 0) ctx.moveTo(xp, yp);
        else ctx.lineTo(xp, yp);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Full I(θ) curve in the accent colour.
      ctx.strokeStyle = s.accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const arr = intensities[0];
      const localPeak = peaks[0];
      for (let i = 0; i < samples; i++) {
        const xp = (i / (samples - 1)) * w;
        const yp = curveBottom - (arr[i] / localPeak) * curveH;
        if (i === 0) ctx.moveTo(xp, yp);
        else ctx.lineTo(xp, yp);
      }
      ctx.stroke();
    }

    // ---- x-axis labels ----
    ctx.fillStyle = s.muted;
    ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText("−π/4", 2, curveBottom + 6);
    ctx.textAlign = "center";
    ctx.fillText("θ = 0", w / 2, curveBottom + 6);
    ctx.textAlign = "right";
    ctx.fillText("+π/4", w - 2, curveBottom + 6);
    ctx.textAlign = "left";

    ctx.restore();
  }

  // ---------- UI sync ----------
  function syncLabels() {
    NValue.textContent = String(N);
    dValue.textContent = `${d.toFixed(1)} μm`;
    aValue.textContent = `${a.toFixed(2)} μm`;
    lambdaValue.textContent = `${lambda} nm`;
  }
  function refresh() {
    syncLabels();
    draw();
  }

  NSlider.addEventListener("input", () => {
    N = parseInt(NSlider.value, 10);
    refresh();
  });
  dSlider.addEventListener("input", () => {
    d = parseFloat(dSlider.value);
    refresh();
  });
  aSlider.addEventListener("input", () => {
    a = parseFloat(aSlider.value);
    refresh();
  });
  lambdaSlider.addEventListener("input", () => {
    lambda = parseInt(lambdaSlider.value, 10);
    refresh();
  });

  modeBtn.addEventListener("click", () => {
    whiteLight = !whiteLight;
    modeBtn.textContent = whiteLight ? "white-light" : "monochromatic";
    modeBtn.classList.toggle("is-white", whiteLight);
    lambdaSlider.disabled = whiteLight;
    refresh();
  });

  resetBtn.addEventListener("click", () => {
    N = DEFAULTS.N;
    d = DEFAULTS.d;
    a = DEFAULTS.a;
    lambda = DEFAULTS.lambda;
    whiteLight = DEFAULTS.whiteLight;
    NSlider.value = String(N);
    dSlider.value = String(d);
    aSlider.value = String(a);
    lambdaSlider.value = String(lambda);
    modeBtn.textContent = "monochromatic";
    modeBtn.classList.remove("is-white");
    lambdaSlider.disabled = false;
    refresh();
  });

  // ---------- resize ----------
  let resizeQueued = false;
  window.addEventListener("resize", () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      sizeCanvas();
      draw();
      resizeQueued = false;
    });
  });

  // ---------- boot ----------
  sizeCanvas();
  syncLabels();
  draw();
})();
