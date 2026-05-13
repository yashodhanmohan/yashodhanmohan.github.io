/* Mandelbrot lab.
 *
 * Renders the Mandelbrot set via chunked smooth-escape-time iteration. Pan,
 * zoom, and palette controls re-render asynchronously. Hovering the main
 * canvas renders the Julia set for the cursor's c into a 180×180 inset.
 *
 * Design choices:
 *   - Float64 throughout (JS default). No SIMD/WebGL — keep dependency-free.
 *   - The render is split into horizontal strips of ~24 rows and processed
 *     across requestAnimationFrame ticks. A generation counter cancels any
 *     stale render the moment the view (or any parameter) changes.
 *   - The palette is a 256-entry LUT packed as Uint32. The cobalt palette
 *     reads --accent-warm dynamically so light/dark themes stay correct.
 *   - The Julia inset uses a smaller internal buffer (120×120) and a lower
 *     iteration cap (80) so the hover stays responsive.
 */

(function () {
  "use strict";

  // ---- footer year ----------------------------------------------------------
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // ---- DOM ------------------------------------------------------------------
  const mainCanvas = document.getElementById("mb-main");
  const juliaCanvas = document.getElementById("mb-julia");
  const cReadout = document.getElementById("mb-c");
  const zoomReadout = document.getElementById("mb-zoom");

  const iterSlider = document.getElementById("mb-iter");
  const iterValue = document.getElementById("mb-iterValue");
  const paletteValue = document.getElementById("mb-paletteValue");
  const juliaValue = document.getElementById("mb-juliaValue");
  const juliaToggle = document.getElementById("mb-juliaToggle");
  const paletteRadios = Array.from(
    document.querySelectorAll('input[name="mb-palette"]'),
  );

  const zoomInBtn = document.getElementById("mb-zoomIn");
  const zoomOutBtn = document.getElementById("mb-zoomOut");
  const resetBtn = document.getElementById("mb-reset");

  const mainCtx = mainCanvas.getContext("2d", { willReadFrequently: false });
  const juliaCtx = juliaCanvas.getContext("2d", { willReadFrequently: false });

  // ---- state ----------------------------------------------------------------
  const defaultView = (W) => ({
    cx: -0.5,
    cy: 0,
    scale: 3.2 / W, // complex units per pixel
  });

  let view = defaultView(640); // overwritten once we know real width
  let maxIter = parseInt(iterSlider.value, 10);
  let paletteName = "cobalt";
  let juliaEnabled = true;

  // Render-cancellation token. Bumped on any view/param change. The render
  // loop checks this and bails out if it's been superseded.
  let renderGen = 0;
  let juliaGen = 0;

  // Backing buffers for the main canvas. Recreated on resize.
  let mainW = 0;
  let mainH = 0;
  let mainImage = null;
  let mainData32 = null;

  // Julia inset uses a fixed-size buffer regardless of CSS size.
  const JULIA_W = 120;
  const JULIA_H = 120;
  const JULIA_MAX_ITER = 80;
  const JULIA_RE_RANGE = [-1.6, 1.6];
  const JULIA_IM_RANGE = [-1.6, 1.6];
  let juliaImage = null;
  let juliaData32 = null;

  // ---- palette --------------------------------------------------------------
  // Returns a Uint32Array LUT of length 257. Index `maxIter` is the
  // "interior" colour (black). Indices 0..maxIter-1 are escape colours.
  // We rebuild the LUT whenever the palette name (or theme) changes.

  function hexToRGB(hex) {
    hex = hex.trim();
    if (hex.startsWith("#")) hex = hex.slice(1);
    if (hex.length === 3) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
      ];
    }
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }

  // Resolve --accent-warm to RGB. Falls back to a sensible cobalt.
  function resolveAccentRGB() {
    const cs = getComputedStyle(document.documentElement);
    const raw = cs.getPropertyValue("--accent-warm").trim();
    if (raw.startsWith("#")) {
      try {
        return hexToRGB(raw);
      } catch (e) {
        /* fallthrough */
      }
    }
    // try rgb(...)
    const m = raw.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const parts = m[1].split(/[\s,]+/).map(Number);
      if (parts.length >= 3) return [parts[0], parts[1], parts[2]];
    }
    return [46, 76, 199];
  }

  // pack r,g,b into a Uint32 in little-endian RGBA (canvas ImageData order).
  function packRGBA(r, g, b) {
    return (255 << 24) | (b << 16) | (g << 8) | r;
  }

  // Smooth interpolation between two colour stops.
  function lerp(a, b, t) {
    return Math.round(a + (b - a) * t);
  }

  function buildPaletteLUT(name) {
    const N = 256;
    const lut = new Uint32Array(N + 1);
    // interior — black in light theme, near-black in dark
    lut[N] = packRGBA(0, 0, 0);

    if (name === "fire") {
      // black → red → orange → yellow → white
      const stops = [
        [0, 0, 0],
        [120, 12, 0],
        [220, 70, 0],
        [255, 170, 30],
        [255, 240, 160],
        [255, 255, 255],
      ];
      fillStops(lut, stops, N);
    } else if (name === "mono") {
      // pure greyscale, dark blue-grey to off-white
      const stops = [
        [12, 14, 22],
        [60, 64, 76],
        [140, 144, 156],
        [220, 222, 224],
        [255, 255, 255],
      ];
      fillStops(lut, stops, N);
    } else {
      // cobalt: dark navy → accent → cool blue → white
      const accent = resolveAccentRGB();
      // cool tint = accent lightened toward white
      const cool = [
        Math.min(255, accent[0] + 60),
        Math.min(255, accent[1] + 70),
        Math.min(255, accent[2] + 50),
      ];
      const stops = [
        [4, 8, 24],
        [accent[0] * 0.35, accent[1] * 0.35, accent[2] * 0.55],
        accent,
        cool,
        [240, 244, 255],
      ];
      fillStops(lut, stops, N);
    }
    return lut;
  }

  function fillStops(lut, stops, N) {
    // Even-spaced stops across 0..N-1.
    const segs = stops.length - 1;
    for (let i = 0; i < N; i++) {
      const f = (i / (N - 1)) * segs;
      const k = Math.min(segs - 1, Math.floor(f));
      const t = f - k;
      const a = stops[k];
      const b = stops[k + 1];
      const r = lerp(a[0], b[0], t);
      const g = lerp(a[1], b[1], t);
      const bl = lerp(a[2], b[2], t);
      lut[i] = packRGBA(r, g, bl);
    }
  }

  let paletteLUT = buildPaletteLUT(paletteName);

  // Rebuild LUT on theme change so cobalt picks up dark-mode accent.
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => {
      paletteLUT = buildPaletteLUT(paletteName);
      scheduleMainRender();
    };
    if (mq.addEventListener) mq.addEventListener("change", onScheme);
    else if (mq.addListener) mq.addListener(onScheme);
  }

  // ---- canvas sizing --------------------------------------------------------
  function sizeMainCanvas() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = mainCanvas.getBoundingClientRect();
    // Use a modest DPR cap; doubling pixel count for a 200M-iter render adds
    // up fast. 1.5× is a good compromise between sharp and fast.
    const eff = Math.min(dpr, 1.5);
    const W = Math.max(64, Math.floor(rect.width * eff));
    const H = Math.max(64, Math.floor(rect.height * eff));
    if (W === mainW && H === mainH && mainImage) return false;
    mainCanvas.width = W;
    mainCanvas.height = H;
    mainW = W;
    mainH = H;
    mainImage = mainCtx.createImageData(W, H);
    mainData32 = new Uint32Array(mainImage.data.buffer);
    return true;
  }

  function sizeJuliaCanvas() {
    juliaCanvas.width = JULIA_W;
    juliaCanvas.height = JULIA_H;
    juliaImage = juliaCtx.createImageData(JULIA_W, JULIA_H);
    juliaData32 = new Uint32Array(juliaImage.data.buffer);
  }

  // ---- main render ---------------------------------------------------------
  // Chunked: process STRIP rows per frame. Each frame check the renderGen
  // to abort if a newer render has been kicked off.

  const STRIP = 24;
  let scheduledRender = false;

  function scheduleMainRender() {
    // Coalesce successive setView() calls into one fresh render kickoff.
    if (scheduledRender) return;
    scheduledRender = true;
    requestAnimationFrame(() => {
      scheduledRender = false;
      startMainRender();
    });
  }

  function startMainRender() {
    if (!mainImage) return;
    renderGen++;
    const gen = renderGen;

    // Clear backing buffer to bg-ish (it'll be overwritten anyway, but if
    // a render is aborted mid-flight the partial result reads better than
    // garbage).
    const bgPack = paletteLUT[256];
    mainData32.fill(bgPack);

    const W = mainW;
    const H = mainH;
    const v = view;
    const halfW = W / 2;
    const halfH = H / 2;
    const scale = v.scale * (640 / W); // see sizeMainCanvas: scale is in "logical" px units
    // The view.scale field is calibrated to a 640-px-wide canvas (so that
    // setView/zoom math is independent of DPR). Convert it back to
    // per-actual-pixel for iteration.
    const lut = paletteLUT;
    const N = maxIter;

    let row = 0;
    function step() {
      if (gen !== renderGen) return; // aborted
      const endRow = Math.min(H, row + STRIP);
      for (let py = row; py < endRow; py++) {
        const ci0 = v.cy + (py - halfH) * scale;
        const rowBase = py * W;
        for (let px = 0; px < W; px++) {
          const cr = v.cx + (px - halfW) * scale;
          const ci = ci0;

          // iterate z = z² + c, z0 = 0
          let zr = 0.0;
          let zi = 0.0;
          let zr2 = 0.0;
          let zi2 = 0.0;
          let n = 0;
          while (n < N && zr2 + zi2 <= 256) {
            zi = 2 * zr * zi + ci;
            zr = zr2 - zi2 + cr;
            zr2 = zr * zr;
            zi2 = zi * zi;
            n++;
          }

          let colour;
          if (n >= N) {
            colour = lut[256];
          } else {
            // smooth: n + 1 - log2(log(|z|))
            const logZ = Math.log(zr2 + zi2) * 0.5;
            const nu = Math.log(logZ / Math.LN2) / Math.LN2;
            let s = n + 1 - nu;
            if (!isFinite(s) || s < 0) s = n;
            // Map s onto 0..255. We deliberately use a non-linear stretch
            // so that the visually-busy "near the boundary" region (low s
            // relative to N) gets more of the LUT.
            let t = Math.sqrt(s / N);
            if (t > 1) t = 1;
            if (t < 0) t = 0;
            const idx = Math.min(255, Math.floor(t * 255));
            colour = lut[idx];
          }
          mainData32[rowBase + px] = colour;
        }
      }
      mainCtx.putImageData(mainImage, 0, 0, 0, row, W, endRow - row);
      row = endRow;
      if (row < H) {
        requestAnimationFrame(step);
      }
    }
    step();
  }

  // ---- julia inset ---------------------------------------------------------
  let juliaPending = null;
  let juliaTimer = 0;

  function scheduleJuliaRender(cr, ci) {
    juliaPending = [cr, ci];
    if (juliaTimer) return;
    juliaTimer = window.setTimeout(() => {
      juliaTimer = 0;
      if (!juliaPending) return;
      const [r, i] = juliaPending;
      juliaPending = null;
      renderJulia(r, i);
    }, 30);
  }

  function renderJulia(cr, ci) {
    if (!juliaImage) sizeJuliaCanvas();
    juliaGen++;
    const gen = juliaGen;
    const W = JULIA_W;
    const H = JULIA_H;
    const N = JULIA_MAX_ITER;
    const lut = paletteLUT;
    const reMin = JULIA_RE_RANGE[0];
    const reMax = JULIA_RE_RANGE[1];
    const imMin = JULIA_IM_RANGE[0];
    const imMax = JULIA_IM_RANGE[1];
    const dr = (reMax - reMin) / (W - 1);
    const di = (imMax - imMin) / (H - 1);

    // Julia is small enough to do synchronously, but if a newer hover is
    // queued before paint we skip writing.
    for (let py = 0; py < H; py++) {
      const z0i = imMin + py * di;
      const rowBase = py * W;
      for (let px = 0; px < W; px++) {
        let zr = reMin + px * dr;
        let zi = z0i;
        let zr2 = zr * zr;
        let zi2 = zi * zi;
        let n = 0;
        while (n < N && zr2 + zi2 <= 256) {
          zi = 2 * zr * zi + ci;
          zr = zr2 - zi2 + cr;
          zr2 = zr * zr;
          zi2 = zi * zi;
          n++;
        }
        let colour;
        if (n >= N) {
          colour = lut[256];
        } else {
          const logZ = Math.log(zr2 + zi2) * 0.5;
          const nu = Math.log(logZ / Math.LN2) / Math.LN2;
          let s = n + 1 - nu;
          if (!isFinite(s) || s < 0) s = n;
          let t = Math.sqrt(s / N);
          if (t > 1) t = 1;
          if (t < 0) t = 0;
          const idx = Math.min(255, Math.floor(t * 255));
          colour = lut[idx];
        }
        juliaData32[rowBase + px] = colour;
      }
    }
    if (gen !== juliaGen) return;
    juliaCtx.putImageData(juliaImage, 0, 0);
  }

  // ---- coordinate helpers --------------------------------------------------
  // Map a cursor position (in CSS px relative to canvas) to a complex c.
  function cursorToComplex(eventClientX, eventClientY) {
    const rect = mainCanvas.getBoundingClientRect();
    const xCSS = eventClientX - rect.left;
    const yCSS = eventClientY - rect.top;
    // Convert to canvas-internal pixels.
    const px = (xCSS / rect.width) * mainW;
    const py = (yCSS / rect.height) * mainH;
    const halfW = mainW / 2;
    const halfH = mainH / 2;
    const scale = view.scale * (640 / mainW);
    return {
      cr: view.cx + (px - halfW) * scale,
      ci: view.cy + (py - halfH) * scale,
      px,
      py,
    };
  }

  function updateReadout(cr, ci) {
    cReadout.textContent =
      formatSigned(cr, 4) + " " + (ci >= 0 ? "+" : "−") + " " + formatSigned(Math.abs(ci), 4) + "i";
    // zoom = ratio of default scale to current scale
    const W = mainW || 640;
    const defaultScale = 3.2 / W;
    const z = defaultScale / (view.scale * (640 / W));
    zoomReadout.textContent = formatZoom(z);
  }

  function formatSigned(v, dp) {
    if (!isFinite(v)) return "—";
    const sign = v < 0 ? "−" : "";
    return sign + Math.abs(v).toFixed(dp);
  }
  function formatZoom(z) {
    if (z < 10) return z.toFixed(2) + "×";
    if (z < 1000) return z.toFixed(0) + "×";
    if (z < 1e6) return (z / 1000).toFixed(1) + "k×";
    return z.toExponential(1) + "×";
  }

  // ---- pan & zoom ----------------------------------------------------------
  let dragging = false;
  let dragStart = null;
  let dragStartView = null;

  mainCanvas.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    dragging = true;
    mainCanvas.classList.add("mb-dragging");
    try {
      mainCanvas.setPointerCapture(e.pointerId);
    } catch (err) {
      /* ignore */
    }
    dragStart = { x: e.clientX, y: e.clientY };
    dragStartView = { cx: view.cx, cy: view.cy };
  });

  mainCanvas.addEventListener("pointermove", (e) => {
    if (dragging) {
      const rect = mainCanvas.getBoundingClientRect();
      const dx = (e.clientX - dragStart.x) * (mainW / rect.width);
      const dy = (e.clientY - dragStart.y) * (mainH / rect.height);
      const scale = view.scale * (640 / mainW);
      view.cx = dragStartView.cx - dx * scale;
      view.cy = dragStartView.cy - dy * scale;
      scheduleMainRender();
    } else {
      const c = cursorToComplex(e.clientX, e.clientY);
      updateReadout(c.cr, c.ci);
      if (juliaEnabled) scheduleJuliaRender(c.cr, c.ci);
    }
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    mainCanvas.classList.remove("mb-dragging");
    try {
      mainCanvas.releasePointerCapture(e.pointerId);
    } catch (err) {
      /* ignore */
    }
    scheduleMainRender();
  }
  mainCanvas.addEventListener("pointerup", endDrag);
  mainCanvas.addEventListener("pointercancel", endDrag);

  mainCanvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const factor = Math.pow(1.2, -e.deltaY / 100);
      zoomAtCursor(factor, e.clientX, e.clientY);
    },
    { passive: false },
  );

  // Zoom by factor `k` around a cursor position; the complex point under
  // the cursor stays under the cursor.
  function zoomAtCursor(k, clientX, clientY) {
    const c = cursorToComplex(clientX, clientY);
    // new scale (smaller = more zoomed in)
    view.scale = view.scale / k;
    // After scale change, the complex coord at cursor is:
    //   newC = view.cx + (px - halfW) * newScale
    // We want newC == c.cr / c.ci, so adjust view.cx / view.cy.
    const halfW = mainW / 2;
    const halfH = mainH / 2;
    const newScale = view.scale * (640 / mainW);
    view.cx = c.cr - (c.px - halfW) * newScale;
    view.cy = c.ci - (c.py - halfH) * newScale;
    updateReadout(c.cr, c.ci);
    scheduleMainRender();
  }

  function zoomAtCenter(k) {
    view.scale = view.scale / k;
    updateReadout(view.cx, view.cy);
    scheduleMainRender();
  }

  zoomInBtn.addEventListener("click", () => zoomAtCenter(1.5));
  zoomOutBtn.addEventListener("click", () => zoomAtCenter(1 / 1.5));
  resetBtn.addEventListener("click", () => {
    view = defaultView(640);
    updateReadout(view.cx, view.cy);
    scheduleMainRender();
  });

  // ---- controls ------------------------------------------------------------
  iterSlider.addEventListener("input", () => {
    maxIter = parseInt(iterSlider.value, 10);
    iterValue.textContent = String(maxIter);
    scheduleMainRender();
  });

  paletteRadios.forEach((r) => {
    r.addEventListener("change", () => {
      if (r.checked) {
        paletteName = r.value;
        paletteValue.textContent = paletteName;
        paletteLUT = buildPaletteLUT(paletteName);
        scheduleMainRender();
        // also refresh the julia inset if visible
        if (juliaEnabled && !juliaCanvas.classList.contains("mb-hidden")) {
          // re-render with last known c (just use view center as a sane default)
          renderJulia(view.cx, view.cy);
        }
      }
    });
  });

  juliaToggle.addEventListener("change", () => {
    juliaEnabled = juliaToggle.checked;
    juliaValue.textContent = juliaEnabled ? "on" : "off";
    juliaCanvas.classList.toggle("mb-hidden", !juliaEnabled);
  });

  // hide julia when cursor leaves
  mainCanvas.addEventListener("pointerleave", () => {
    if (!juliaEnabled) return;
    // keep last frame visible — no-op. (Subtle, but feels nicer than a
    // flash to blank as you exit the canvas.)
  });

  // ---- bootstrap -----------------------------------------------------------
  function init() {
    sizeMainCanvas();
    sizeJuliaCanvas();
    // Scale is calibrated against a logical 640-wide canvas so the math
    // stays stable across DPR/resize.
    view = defaultView(640);
    iterValue.textContent = String(maxIter);
    paletteValue.textContent = paletteName;
    juliaValue.textContent = juliaEnabled ? "on" : "off";
    updateReadout(view.cx, view.cy);
    scheduleMainRender();
    // a placeholder Julia so the inset isn't blank at first paint
    renderJulia(view.cx, view.cy);
  }

  // Resize handling — debounced so dragging the window doesn't fire 200
  // re-renders.
  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      resizeTimer = 0;
      if (sizeMainCanvas()) scheduleMainRender();
    }, 120);
  });

  init();
})();
