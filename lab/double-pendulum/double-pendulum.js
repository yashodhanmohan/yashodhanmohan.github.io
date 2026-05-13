// Double pendulum — chaos visualised with ghost twins.
//
// A primary pendulum plus up to four "ghosts" each started at θ₁ + i·ε°
// (θ₂ unperturbed — staggering one coordinate is the cleanest signature
// of sensitive dependence on initial conditions). They obey the same
// equations of motion, derived from the Lagrangian for a planar
// chain double pendulum with θ measured from downward vertical.
//
// Integrator: classical RK4 at dt = 0.005, 12 substeps per
// requestAnimationFrame. Forward Euler inflates energy noticeably for
// this system; RK4 is more or less symplectic over the timescales we
// show and the chaos signature is then in the equations, not the
// integrator.

(() => {
  const DT = 0.005;
  const SUBSTEPS = 12;
  const G_BASE = 9.81;
  const PIVOT_Y = 80;              // px from top of logical canvas
  const BOTTOM_MARGIN = 30;
  const MAX_PX_PER_UNIT = 140;     // 140 px per L = 1; auto-scaled down if needed
  const DEG = Math.PI / 180;
  const TRAIL_FADE_ALPHA = 0.012;

  // ---------- live state ----------
  let theta1Deg = 120, theta2Deg = 60;
  let massRatio = 1, lengthRatio = 1;
  let damping = 0;
  let ghostsCount = 3;
  let epsilonDeg = 0.1;
  let gScale = 1;

  // pendulums: array of [θ₁, ω₁, θ₂, ω₂] in radians/rad·s. Index 0 is
  // primary; the rest are ghosts.
  const pendulums = [];
  // Previous bob-2 position in logical canvas px, per pendulum. Used to
  // stitch line segments into the persistent trail.
  const prevBob2 = [];

  let animating = false;
  let rafId = 0;

  // ---------- DOM ----------
  const canvas = document.getElementById("dpCanvas");
  const ctx = canvas.getContext("2d");

  const theta1Input = document.getElementById("theta1");
  const theta2Input = document.getElementById("theta2");
  const massRatioInput = document.getElementById("massRatio");
  const lengthRatioInput = document.getElementById("lengthRatio");
  const dampingInput = document.getElementById("damping");
  const ghostsInput = document.getElementById("ghosts");
  const epsilonInput = document.getElementById("epsilon");
  const gScaleInput = document.getElementById("gScale");

  const theta1Value = document.getElementById("theta1Value");
  const theta2Value = document.getElementById("theta2Value");
  const massRatioValue = document.getElementById("massRatioValue");
  const lengthRatioValue = document.getElementById("lengthRatioValue");
  const dampingValue = document.getElementById("dampingValue");
  const ghostsValue = document.getElementById("ghostsValue");
  const epsilonValue = document.getElementById("epsilonValue");
  const gScaleValue = document.getElementById("gScaleValue");

  const releaseBtn = document.getElementById("release");
  const resetBtn = document.getElementById("reset");

  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ---------- formatters ----------
  const fmtDeg = (d) => `${d >= 0 ? "+" : ""}${d.toFixed(0)} deg`;
  const fmtMul = (v) => `${v.toFixed(2)}×`;
  const fmtDmp = (v) => v.toFixed(4);
  const fmtEps = (v) => `${v.toFixed(3)} deg`;
  const fmtInt = (v) => v.toFixed(0);

  // ---------- style cache ----------
  // Re-read CSS vars on demand (cheap-ish) and explicitly on
  // prefers-color-scheme change so the colour scheme tracks the page.
  let cachedStyle = null;
  let cachedAt = 0;
  function styles() {
    const now = performance.now();
    if (cachedStyle && now - cachedAt < 1000) return cachedStyle;
    const cs = getComputedStyle(document.body);
    cachedStyle = {
      bg: cs.getPropertyValue("--bg").trim() || "#eef0ee",
      ink: cs.getPropertyValue("--ink").trim() || "#14161e",
      inkSoft: cs.getPropertyValue("--ink-soft").trim() || "#2c2f3a",
      muted: cs.getPropertyValue("--muted").trim() || "#5b5f68",
      rule: cs.getPropertyValue("--rule").trim() || "#d2d5d2",
      accentWarm: cs.getPropertyValue("--accent-warm").trim() || "#2e4cc7",
      accentCool: cs.getPropertyValue("--accent-cool").trim() || "#7a92dc",
    };
    cachedAt = now;
    return cachedStyle;
  }
  const mqDark = window.matchMedia("(prefers-color-scheme: dark)");
  const onSchemeChange = () => {
    cachedStyle = null;
    clearTrail();
  };
  if (mqDark.addEventListener) mqDark.addEventListener("change", onSchemeChange);
  else mqDark.addListener(onSchemeChange);

  // "#rrggbb" → "rgba(r,g,b,a)". Only used for the trail fade and the
  // ghost trail tint — both of which need explicit alpha.
  function hexToRgba(hex, a) {
    let h = (hex || "").trim();
    if (h.startsWith("#")) h = h.slice(1);
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    if (h.length !== 6) return `rgba(0,0,0,${a})`;
    const n = parseInt(h, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  // ---------- canvas sizing ----------
  let logicalW = 640, logicalH = 520, dpr = 1;
  let trailCanvas = null;
  let trailCtx = null;

  function sizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    logicalW = rect.width;
    logicalH = rect.height;
    canvas.width = Math.round(logicalW * dpr);
    canvas.height = Math.round(logicalH * dpr);

    // Offscreen trail buffer matches physical pixels so blits are 1:1.
    trailCanvas = document.createElement("canvas");
    trailCanvas.width = canvas.width;
    trailCanvas.height = canvas.height;
    trailCtx = trailCanvas.getContext("2d");
    trailCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Reset prev positions so we don't draw a wild segment from the old
    // coordinate space.
    for (let i = 0; i < prevBob2.length; i++) prevBob2[i] = null;
  }

  function clearTrail() {
    if (!trailCtx) return;
    trailCtx.save();
    trailCtx.setTransform(1, 0, 0, 1, 0, 0);
    trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
    trailCtx.restore();
  }

  // ---------- physics ----------
  // Equations of motion (standard Lagrangian derivation):
  //   num1 = -g (2 m₁ + m₂) sin θ₁
  //          - m₂ g sin(θ₁ - 2 θ₂)
  //          - 2 sin(θ₁ - θ₂) m₂ (ω₂² L₂ + ω₁² L₁ cos(θ₁ - θ₂))
  //   den  = L₁ (2 m₁ + m₂ - m₂ cos(2 θ₁ - 2 θ₂))
  //   α₁   = num1 / den
  //   num2 = 2 sin(θ₁ - θ₂)
  //          × (ω₁² L₁ (m₁ + m₂)
  //             + g (m₁ + m₂) cos θ₁
  //             + ω₂² L₂ m₂ cos(θ₁ - θ₂))
  //   α₂   = num2 / (L₂ (2 m₁ + m₂ - m₂ cos(2 θ₁ - 2 θ₂)))
  function derivs(y, out, m1, m2, L1, L2, g) {
    const t1 = y[0], w1 = y[1], t2 = y[2], w2 = y[3];
    const d = t1 - t2;
    const sd = Math.sin(d);
    const cd = Math.cos(d);
    const denomCommon = 2 * m1 + m2 - m2 * Math.cos(2 * t1 - 2 * t2);

    const num1 = -g * (2 * m1 + m2) * Math.sin(t1)
                 - m2 * g * Math.sin(t1 - 2 * t2)
                 - 2 * sd * m2 * (w2 * w2 * L2 + w1 * w1 * L1 * cd);
    const a1 = num1 / (L1 * denomCommon);

    const num2 = 2 * sd * (
      w1 * w1 * L1 * (m1 + m2)
      + g * (m1 + m2) * Math.cos(t1)
      + w2 * w2 * L2 * m2 * cd
    );
    const a2 = num2 / (L2 * denomCommon);

    out[0] = w1;
    out[1] = a1;
    out[2] = w2;
    out[3] = a2;
  }

  // Single RK4 step on y, in place. Scratch arrays passed in so we
  // don't churn the GC.
  const _k1 = new Float64Array(4);
  const _k2 = new Float64Array(4);
  const _k3 = new Float64Array(4);
  const _k4 = new Float64Array(4);
  const _yt = new Float64Array(4);

  function rk4Step(y, dt, m1, m2, L1, L2, g) {
    derivs(y, _k1, m1, m2, L1, L2, g);
    for (let i = 0; i < 4; i++) _yt[i] = y[i] + 0.5 * dt * _k1[i];
    derivs(_yt, _k2, m1, m2, L1, L2, g);
    for (let i = 0; i < 4; i++) _yt[i] = y[i] + 0.5 * dt * _k2[i];
    derivs(_yt, _k3, m1, m2, L1, L2, g);
    for (let i = 0; i < 4; i++) _yt[i] = y[i] + dt * _k3[i];
    derivs(_yt, _k4, m1, m2, L1, L2, g);
    for (let i = 0; i < 4; i++) {
      y[i] += (dt / 6) * (_k1[i] + 2 * _k2[i] + 2 * _k3[i] + _k4[i]);
    }
  }

  // ---------- init ----------
  // Build pendulums fresh from current slider values. Primary at
  // (θ₁°, θ₂°, 0, 0); each ghost staggers θ₁ by i·ε°.
  function initPendulums() {
    pendulums.length = 0;
    prevBob2.length = 0;
    pendulums.push([theta1Deg * DEG, 0, theta2Deg * DEG, 0]);
    for (let i = 1; i <= ghostsCount; i++) {
      pendulums.push([
        (theta1Deg + i * epsilonDeg) * DEG,
        0,
        theta2Deg * DEG,
        0,
      ]);
    }
    for (let i = 0; i < pendulums.length; i++) prevBob2.push(null);
    clearTrail();
  }

  // ---------- physics tick ----------
  function step() {
    const m1 = 1;
    const m2 = massRatio;       // m₂/m₁ ratio with m₁ = 1
    const L1 = 1;
    const L2 = lengthRatio;
    const g = G_BASE * gScale;
    const oneMinusDamp = 1 - damping;

    for (let s = 0; s < SUBSTEPS; s++) {
      for (let i = 0; i < pendulums.length; i++) {
        rk4Step(pendulums[i], DT, m1, m2, L1, L2, g);
        if (damping > 0) {
          pendulums[i][1] *= oneMinusDamp;
          pendulums[i][3] *= oneMinusDamp;
        }
      }
    }
  }

  // ---------- render ----------
  function render() {
    if (!trailCtx) return;
    const st = styles();
    const w = logicalW, h = logicalH;
    const L1 = 1, L2 = lengthRatio;
    const totalLen = L1 + L2;
    // Auto-scale so even a 3× length ratio still fits in frame.
    const pxPerUnit = Math.min(
      MAX_PX_PER_UNIT,
      (h - PIVOT_Y - BOTTOM_MARGIN) / totalLen
    );
    const pivotX = w / 2;
    const pivotY = PIVOT_Y;

    // --- update trail buffer ---
    // 1. Fade entire trail towards page bg.
    trailCtx.save();
    trailCtx.setTransform(1, 0, 0, 1, 0, 0);
    trailCtx.fillStyle = hexToRgba(st.bg, TRAIL_FADE_ALPHA);
    trailCtx.fillRect(0, 0, trailCanvas.width, trailCanvas.height);
    trailCtx.restore();

    // 2. Stitch new segments from previous to current bob-2 position.
    trailCtx.lineWidth = 1;
    trailCtx.lineCap = "round";
    for (let i = 0; i < pendulums.length; i++) {
      const p = pendulums[i];
      const x1 = pivotX + pxPerUnit * L1 * Math.sin(p[0]);
      const y1 = pivotY + pxPerUnit * L1 * Math.cos(p[0]);
      const x2 = x1 + pxPerUnit * L2 * Math.sin(p[2]);
      const y2 = y1 + pxPerUnit * L2 * Math.cos(p[2]);
      const prev = prevBob2[i];
      if (prev && animating) {
        trailCtx.strokeStyle =
          i === 0 ? st.accentWarm : hexToRgba(st.accentCool, 0.45);
        trailCtx.beginPath();
        trailCtx.moveTo(prev.x, prev.y);
        trailCtx.lineTo(x2, y2);
        trailCtx.stroke();
      }
      prevBob2[i] = { x: x2, y: y2 };
    }

    // --- main canvas ---
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Trail underlay.
    ctx.drawImage(trailCanvas, 0, 0, w, h);

    // Pivot pin.
    ctx.fillStyle = st.muted;
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, 3, 0, Math.PI * 2);
    ctx.fill();

    const m1Mass = 1, m2Mass = massRatio;
    const r1 = 6 * Math.cbrt(m1Mass);
    const r2 = 6 * Math.cbrt(m2Mass);

    // Ghosts first (back), primary last (front).
    for (let i = pendulums.length - 1; i >= 0; i--) {
      const isPrimary = i === 0;
      const p = pendulums[i];
      const x1 = pivotX + pxPerUnit * L1 * Math.sin(p[0]);
      const y1 = pivotY + pxPerUnit * L1 * Math.cos(p[0]);
      const x2 = x1 + pxPerUnit * L2 * Math.sin(p[2]);
      const y2 = y1 + pxPerUnit * L2 * Math.cos(p[2]);

      // Rods.
      ctx.lineWidth = isPrimary ? 1.5 : 1;
      ctx.strokeStyle = isPrimary ? st.rule : st.inkSoft;
      ctx.globalAlpha = isPrimary ? 1 : 0.55;
      ctx.beginPath();
      ctx.moveTo(pivotX, pivotY);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Bobs.
      ctx.fillStyle = isPrimary ? st.accentWarm : st.inkSoft;
      ctx.globalAlpha = isPrimary ? 1 : 0.55;
      ctx.beginPath();
      ctx.arc(x1, y1, r1, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x2, y2, r2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ---------- loop ----------
  function tick() {
    if (animating) step();
    render();
    rafId = requestAnimationFrame(tick);
  }

  // ---------- slider wiring ----------
  function updateValueDisplays() {
    theta1Value.textContent = fmtDeg(theta1Deg);
    theta2Value.textContent = fmtDeg(theta2Deg);
    massRatioValue.textContent = fmtMul(massRatio);
    lengthRatioValue.textContent = fmtMul(lengthRatio);
    dampingValue.textContent = fmtDmp(damping);
    ghostsValue.textContent = fmtInt(ghostsCount);
    epsilonValue.textContent = fmtEps(epsilonDeg);
    gScaleValue.textContent = fmtMul(gScale);
  }

  function readSliders() {
    theta1Deg = +theta1Input.value;
    theta2Deg = +theta2Input.value;
    massRatio = +massRatioInput.value;
    lengthRatio = +lengthRatioInput.value;
    damping = +dampingInput.value;
    ghostsCount = +ghostsInput.value;
    epsilonDeg = +epsilonInput.value;
    gScale = +gScaleInput.value;
  }

  theta1Input.addEventListener("input", () => {
    theta1Deg = +theta1Input.value;
    updateValueDisplays();
    initPendulums();
  });
  theta2Input.addEventListener("input", () => {
    theta2Deg = +theta2Input.value;
    updateValueDisplays();
    initPendulums();
  });
  massRatioInput.addEventListener("input", () => {
    massRatio = +massRatioInput.value;
    updateValueDisplays();
    initPendulums();
  });
  lengthRatioInput.addEventListener("input", () => {
    lengthRatio = +lengthRatioInput.value;
    updateValueDisplays();
    initPendulums();
  });
  dampingInput.addEventListener("input", () => {
    damping = +dampingInput.value;
    updateValueDisplays();
    // No re-init — damping applies mid-flight.
  });
  ghostsInput.addEventListener("input", () => {
    ghostsCount = +ghostsInput.value;
    updateValueDisplays();
    initPendulums();
  });
  epsilonInput.addEventListener("input", () => {
    epsilonDeg = +epsilonInput.value;
    updateValueDisplays();
    // ε is initial-condition-only — no re-init while mid-flight; the
    // next reset will pick up the new value.
  });
  gScaleInput.addEventListener("input", () => {
    gScale = +gScaleInput.value;
    updateValueDisplays();
    initPendulums();
  });

  releaseBtn.addEventListener("click", () => {
    animating = !animating;
    releaseBtn.textContent = animating ? "pause" : "release";
  });

  resetBtn.addEventListener("click", () => {
    animating = false;
    releaseBtn.textContent = "release";
    initPendulums();
  });

  // ---------- boot ----------
  window.addEventListener("resize", () => {
    sizeCanvas();
    clearTrail();
  });

  sizeCanvas();
  readSliders();
  updateValueDisplays();
  initPendulums();

  // Honour prefers-reduced-motion: start paused. We start paused for
  // everyone, actually — the release button is meant as the explicit
  // "go". This satisfies the reduced-motion case the same way.
  animating = false;
  releaseBtn.textContent = "release";

  tick();
})();
