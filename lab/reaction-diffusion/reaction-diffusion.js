// Reaction–diffusion lab: the Gray–Scott model on a 200×200 torus.
//
// Two scalar fields u, v live on every grid cell. Per simulation step:
//   Δu = Dᵤ·∇²u − u·v² + f·(1 − u)
//   Δv = Dᵥ·∇²v + u·v² − (f + k)·v
// The Laplacian uses a 5-point stencil with toroidal wrap. Painting with
// the pointer sets v=1, u=0.5 inside a disk; the rest of the field is the
// dye that gets eaten and replenished. Tiny shifts in (f, k) change which
// regime the dynamics settle into — spots, stripes, mitosis, solitons.

(() => {
  const N = 200;
  const SIZE = N * N;
  const Du = 0.16;
  const Dv = 0.08;
  const DT = 1.0;

  // ---------- state ----------
  let u = new Float32Array(SIZE);
  let v = new Float32Array(SIZE);
  let u2 = new Float32Array(SIZE);
  let v2 = new Float32Array(SIZE);

  let f = 0.0367;
  let k = 0.0649;
  let brush = 8;
  let speed = 10;
  let paused = false;
  let painting = false;
  let lastPaint = null; // {x, y} in grid coords; interpolate for fast drags

  // ---------- DOM ----------
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d", { alpha: false });
  const phaseMap = document.getElementById("phaseMap");
  const phaseCtx = phaseMap.getContext("2d");

  const fInput = document.getElementById("f");
  const kInput = document.getElementById("k");
  const brushInput = document.getElementById("brush");
  const speedInput = document.getElementById("speed");
  const fValue = document.getElementById("fValue");
  const kValue = document.getElementById("kValue");
  const brushValue = document.getElementById("brushValue");
  const speedValue = document.getElementById("speedValue");

  const pauseBtn = document.getElementById("pause");
  const clearBtn = document.getElementById("clear");
  const presetBtns = Array.from(document.querySelectorAll("[data-preset]"));

  // Five named regimes. Coordinates must match the slider data attributes.
  const PRESETS = [
    { name: "spots",   f: 0.030,  k: 0.062  },
    { name: "stripes", f: 0.022,  k: 0.051  },
    { name: "mitosis", f: 0.0367, k: 0.0649 },
    { name: "coral",   f: 0.055,  k: 0.062  },
    { name: "u-skate", f: 0.062,  k: 0.0609 },
  ];

  // Phase-map axes
  const F_MIN = 0.010, F_MAX = 0.080;
  const K_MIN = 0.040, K_MAX = 0.075;

  // ImageData buffer for the chemistry render.
  const image = ctx.createImageData(N, N);
  const pixels = image.data;
  for (let i = 0; i < SIZE; i++) pixels[i * 4 + 3] = 255; // alpha

  // ---------- colours read from CSS variables ----------
  let bgRGB = [238, 240, 238];
  let inkRGB = [20, 22, 30];

  function parseCssColour(str) {
    // CSS vars in this project are hex. Trim whitespace and parse #rrggbb.
    const s = (str || "").trim();
    if (s.startsWith("#")) {
      if (s.length === 7) {
        return [
          parseInt(s.slice(1, 3), 16),
          parseInt(s.slice(3, 5), 16),
          parseInt(s.slice(5, 7), 16),
        ];
      }
      if (s.length === 4) {
        return [
          parseInt(s[1] + s[1], 16),
          parseInt(s[2] + s[2], 16),
          parseInt(s[3] + s[3], 16),
        ];
      }
    }
    // Fall back: try rgb() match.
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const parts = m[1].split(",").map((p) => parseFloat(p));
      return [parts[0] | 0, parts[1] | 0, parts[2] | 0];
    }
    return null;
  }

  function readColours() {
    const cs = getComputedStyle(document.documentElement);
    bgRGB = parseCssColour(cs.getPropertyValue("--bg")) || bgRGB;
    inkRGB = parseCssColour(cs.getPropertyValue("--ink")) || inkRGB;
  }

  // ---------- field init / clear ----------
  function clearField() {
    u.fill(1.0);
    v.fill(0.0);
  }

  // Drop a small central seed so the page animates immediately at load.
  function seedCentre() {
    const cx = N / 2, cy = N / 2;
    paintDisk(cx, cy, 10);
  }

  // ---------- painting ----------
  function paintDisk(cx, cy, r) {
    const r2 = r * r;
    const cxi = Math.round(cx), cyi = Math.round(cy);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r2) {
          // toroidal wrap so painting near the edge bleeds across
          const x = ((cxi + dx) % N + N) % N;
          const y = ((cyi + dy) % N + N) % N;
          const idx = y * N + x;
          v[idx] = 1.0;
          u[idx] = 0.5;
        }
      }
    }
  }

  function paintSegment(x0, y0, x1, y1, r) {
    // Stamp disks along the segment so fast drags don't leave gaps.
    const dx = x1 - x0, dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / Math.max(1, r * 0.4)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      paintDisk(x0 + dx * t, y0 + dy * t, r);
    }
  }

  function pointerToGrid(ev) {
    const rect = canvas.getBoundingClientRect();
    const gx = ((ev.clientX - rect.left) / rect.width) * N;
    const gy = ((ev.clientY - rect.top) / rect.height) * N;
    return { x: gx, y: gy };
  }

  canvas.addEventListener("pointerdown", (e) => {
    painting = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    const p = pointerToGrid(e);
    paintDisk(p.x, p.y, brush);
    lastPaint = p;
    if (paused) renderField();
    e.preventDefault();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!painting) return;
    e.preventDefault();
    const p = pointerToGrid(e);
    if (lastPaint) {
      paintSegment(lastPaint.x, lastPaint.y, p.x, p.y, brush);
    } else {
      paintDisk(p.x, p.y, brush);
    }
    lastPaint = p;
    if (paused) renderField();
  });
  function endPaint(e) {
    painting = false;
    lastPaint = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  }
  canvas.addEventListener("pointerup", endPaint);
  canvas.addEventListener("pointercancel", endPaint);
  canvas.addEventListener("pointerleave", () => { lastPaint = null; });

  // ---------- simulation ----------
  function step() {
    // 5-point Laplacian with toroidal wrap. The inner loop is the hot path;
    // hoist row offsets and stencil neighbours per cell. ~40k cells × `speed`
    // sub-steps per frame is comfortably real-time in modern V8.
    for (let y = 0; y < N; y++) {
      const ym = (y === 0 ? N - 1 : y - 1) * N;
      const yp = (y === N - 1 ? 0 : y + 1) * N;
      const yr = y * N;
      for (let x = 0; x < N; x++) {
        const xm = x === 0 ? N - 1 : x - 1;
        const xp = x === N - 1 ? 0 : x + 1;
        const idx = yr + x;
        const uC = u[idx], vC = v[idx];
        const lapU =
          u[yr + xm] + u[yr + xp] + u[ym + x] + u[yp + x] - 4 * uC;
        const lapV =
          v[yr + xm] + v[yr + xp] + v[ym + x] + v[yp + x] - 4 * vC;
        const uvv = uC * vC * vC;
        let nu = uC + DT * (Du * lapU - uvv + f * (1 - uC));
        let nv = vC + DT * (Dv * lapV + uvv - (f + k) * vC);
        // Numerical guard: values can briefly drift outside [0,1] otherwise.
        if (nu < 0) nu = 0; else if (nu > 1) nu = 1;
        if (nv < 0) nv = 0; else if (nv > 1) nv = 1;
        u2[idx] = nu;
        v2[idx] = nv;
      }
    }
    // swap
    const tu = u; u = u2; u2 = tu;
    const tv = v; v = v2; v2 = tv;
  }

  function renderField() {
    // Map v through a 2-stop gradient: bg at v≈0, ink at v≳0.4.
    // v rarely climbs above ~0.4 in these regimes; clamping there keeps the
    // dynamic range usable.
    const SCALE = 1 / 0.4;
    const br = bgRGB[0], bg = bgRGB[1], bb = bgRGB[2];
    const ir = inkRGB[0], ig = inkRGB[1], ib = inkRGB[2];
    for (let i = 0; i < SIZE; i++) {
      let t = v[i] * SCALE;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const oi = i * 4;
      pixels[oi]     = br + (ir - br) * t;
      pixels[oi + 1] = bg + (ig - bg) * t;
      pixels[oi + 2] = bb + (ib - bb) * t;
    }
    ctx.putImageData(image, 0, 0);
  }

  function tick() {
    if (!paused) {
      for (let s = 0; s < speed; s++) step();
    }
    renderField();
    requestAnimationFrame(tick);
  }

  // ---------- phase map ----------

  function setupPhaseMap() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cssW = phaseMap.clientWidth || 280;
    const cssH = (cssW * 180) / 280;
    phaseMap.width = Math.round(cssW * dpr);
    phaseMap.height = Math.round(cssH * dpr);
    phaseCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawPhaseMap();
  }

  function fkToCanvas(fv, kv) {
    const cssW = phaseMap.width / (window.devicePixelRatio || 1);
    const cssH = phaseMap.height / (window.devicePixelRatio || 1);
    const padL = 22, padR = 8, padT = 8, padB = 18;
    const w = cssW - padL - padR;
    const h = cssH - padT - padB;
    const x = padL + ((fv - F_MIN) / (F_MAX - F_MIN)) * w;
    // invert y so higher k sits at the top
    const y = padT + (1 - (kv - K_MIN) / (K_MAX - K_MIN)) * h;
    return { x, y, w, h, padL, padT };
  }

  function drawPhaseMap() {
    const cs = getComputedStyle(document.documentElement);
    const ruleCol = cs.getPropertyValue("--rule").trim() || "#d2d5d2";
    const mutedCol = cs.getPropertyValue("--muted").trim() || "#5b5f68";
    const inkSoftCol = cs.getPropertyValue("--ink-soft").trim() || "#2c2f3a";
    const accentCol = cs.getPropertyValue("--accent-warm").trim() || "#2e4cc7";

    const dpr = window.devicePixelRatio || 1;
    const cssW = phaseMap.width / dpr;
    const cssH = phaseMap.height / dpr;
    phaseCtx.clearRect(0, 0, cssW, cssH);

    // subtle gridlines on a small frame
    const ref = fkToCanvas(F_MIN, K_MIN);
    phaseCtx.strokeStyle = ruleCol;
    phaseCtx.lineWidth = 1;

    // gridlines: every 0.01 in f, every 0.005 in k
    phaseCtx.beginPath();
    for (let fv = 0.01; fv <= F_MAX + 1e-9; fv += 0.01) {
      const p = fkToCanvas(fv, K_MIN);
      phaseCtx.moveTo(Math.round(p.x) + 0.5, ref.padT);
      phaseCtx.lineTo(Math.round(p.x) + 0.5, ref.padT + ref.h);
    }
    for (let kv = 0.04; kv <= K_MAX + 1e-9; kv += 0.005) {
      const p = fkToCanvas(F_MIN, kv);
      phaseCtx.moveTo(ref.padL, Math.round(p.y) + 0.5);
      phaseCtx.lineTo(ref.padL + ref.w, Math.round(p.y) + 0.5);
    }
    phaseCtx.stroke();

    // outer frame
    phaseCtx.strokeStyle = mutedCol;
    phaseCtx.strokeRect(ref.padL + 0.5, ref.padT + 0.5, ref.w, ref.h);

    // axis labels
    phaseCtx.fillStyle = mutedCol;
    phaseCtx.font = "9px JetBrains Mono, ui-monospace, monospace";
    phaseCtx.textBaseline = "alphabetic";
    phaseCtx.textAlign = "center";
    phaseCtx.fillText("f", ref.padL + ref.w / 2, cssH - 4);
    phaseCtx.save();
    phaseCtx.translate(8, ref.padT + ref.h / 2);
    phaseCtx.rotate(-Math.PI / 2);
    phaseCtx.fillText("k", 0, 0);
    phaseCtx.restore();

    // preset dots + labels
    phaseCtx.fillStyle = inkSoftCol;
    phaseCtx.font = "9px JetBrains Mono, ui-monospace, monospace";
    for (const p of PRESETS) {
      const c = fkToCanvas(p.f, p.k);
      phaseCtx.beginPath();
      phaseCtx.arc(c.x, c.y, 2.2, 0, Math.PI * 2);
      phaseCtx.fill();
      phaseCtx.textAlign = c.x > ref.padL + ref.w - 30 ? "right" : "left";
      const tx = c.x + (phaseCtx.textAlign === "right" ? -5 : 5);
      phaseCtx.fillText(p.name, tx, c.y + 3);
    }

    // current (f, k) cross — drawn over the rest
    const c = fkToCanvas(f, k);
    phaseCtx.strokeStyle = accentCol;
    phaseCtx.lineWidth = 1.5;
    phaseCtx.beginPath();
    phaseCtx.moveTo(c.x - 5, c.y);
    phaseCtx.lineTo(c.x + 5, c.y);
    phaseCtx.moveTo(c.x, c.y - 5);
    phaseCtx.lineTo(c.x, c.y + 5);
    phaseCtx.stroke();
    phaseCtx.fillStyle = accentCol;
    phaseCtx.beginPath();
    phaseCtx.arc(c.x, c.y, 1.5, 0, Math.PI * 2);
    phaseCtx.fill();
  }

  // ---------- UI wiring ----------

  function fmt(n, digits) {
    return Number(n).toFixed(digits);
  }
  function refreshLabels() {
    fValue.textContent = fmt(f, 4);
    kValue.textContent = fmt(k, 4);
    brushValue.textContent = `${brush} px`;
    speedValue.textContent = `${speed}×`;
  }

  fInput.addEventListener("input", () => {
    f = parseFloat(fInput.value);
    refreshLabels();
    drawPhaseMap();
    markActivePreset();
  });
  kInput.addEventListener("input", () => {
    k = parseFloat(kInput.value);
    refreshLabels();
    drawPhaseMap();
    markActivePreset();
  });
  brushInput.addEventListener("input", () => {
    brush = parseInt(brushInput.value, 10);
    refreshLabels();
  });
  speedInput.addEventListener("input", () => {
    speed = parseInt(speedInput.value, 10);
    refreshLabels();
  });

  pauseBtn.addEventListener("click", () => {
    paused = !paused;
    pauseBtn.textContent = paused ? "resume" : "pause";
    pauseBtn.classList.toggle("is-active", paused);
  });
  clearBtn.addEventListener("click", () => {
    clearField();
    renderField();
  });

  function applyPreset(pf, pk) {
    f = pf;
    k = pk;
    fInput.value = String(pf);
    kInput.value = String(pk);
    refreshLabels();
    drawPhaseMap();
    markActivePreset();
  }
  function markActivePreset() {
    for (const btn of presetBtns) {
      const pf = parseFloat(btn.dataset.f);
      const pk = parseFloat(btn.dataset.k);
      const match = Math.abs(pf - f) < 1e-4 && Math.abs(pk - k) < 1e-4;
      btn.classList.toggle("is-active", match);
    }
  }
  for (const btn of presetBtns) {
    btn.addEventListener("click", () => {
      applyPreset(parseFloat(btn.dataset.f), parseFloat(btn.dataset.k));
      // Seed the centre if the field is essentially empty so the preset
      // actually has something to act on.
      let any = false;
      for (let i = 0; i < SIZE; i += 97) {
        if (v[i] > 0.01) { any = true; break; }
      }
      if (!any) seedCentre();
    });
  }

  // ---------- prefers-color-scheme listener ----------
  const darkMQ = window.matchMedia("(prefers-color-scheme: dark)");
  const onSchemeChange = () => {
    readColours();
    drawPhaseMap();
    renderField();
  };
  if (darkMQ.addEventListener) darkMQ.addEventListener("change", onSchemeChange);
  else if (darkMQ.addListener) darkMQ.addListener(onSchemeChange);

  // Phase-map needs to redraw on viewport resizes (its CSS width changes).
  let resizeRaf = 0;
  window.addEventListener("resize", () => {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      setupPhaseMap();
    });
  });

  // ---------- boot ----------
  readColours();
  clearField();
  seedCentre();
  refreshLabels();
  setupPhaseMap();
  markActivePreset();
  renderField();
  requestAnimationFrame(tick);
})();
