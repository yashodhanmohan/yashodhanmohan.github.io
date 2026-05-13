// Lotka–Volterra predator-prey lab.
//
//   ẋ = αx − βxy        (prey: grow alone, eaten on encounter)
//   ẏ = δxy − γy        (predators: grow with food, die without)
//
// RK4 at dt = 0.01 (forward Euler visibly spirals out — orbits should be
// neutrally stable, so the integrator matters). Optional noise added per
// step via Euler–Maruyama with Box–Muller normals. Two canvases: meadow
// (sprites scattered with stable seeded jitter) and phase plane (trajectory
// drawn on a persistent offscreen canvas with a slow alpha fade for trails).

(() => {
  // ---------- defaults / state ----------
  const DEFAULTS = {
    alpha: 1.10,
    beta: 0.040,
    delta: 0.020,
    gamma: 0.40,
    sigma: 0.00,
    speed: 1.00,
  };

  let alpha = DEFAULTS.alpha;
  let beta = DEFAULTS.beta;
  let delta = DEFAULTS.delta;
  let gamma = DEFAULTS.gamma;
  let sigma = DEFAULTS.sigma;
  let speed = DEFAULTS.speed;

  let x = 0, y = 0;          // current populations
  let lastX = 0, lastY = 0;  // previous step (for phase plane segment)
  let paused = false;
  let raf = 0;

  const DT = 0.01;
  const BASE_STEPS_PER_FRAME = 6;

  const reducedMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- DOM ----------
  const meadow = document.getElementById("meadow");
  const phase = document.getElementById("phase");
  const mctx = meadow.getContext("2d");
  const pctx = phase.getContext("2d");

  const alphaInput = document.getElementById("alpha");
  const betaInput = document.getElementById("beta");
  const deltaInput = document.getElementById("delta");
  const gammaInput = document.getElementById("gamma");
  const sigmaInput = document.getElementById("sigma");
  const speedInput = document.getElementById("speed");

  const alphaVal = document.getElementById("alphaValue");
  const betaVal = document.getElementById("betaValue");
  const deltaVal = document.getElementById("deltaValue");
  const gammaVal = document.getElementById("gammaValue");
  const sigmaVal = document.getElementById("sigmaValue");
  const speedVal = document.getElementById("speedValue");

  const xLive = document.getElementById("xLive");
  const yLive = document.getElementById("yLive");
  const xStar = document.getElementById("xStar");
  const yStar = document.getElementById("yStar");
  const tPeriod = document.getElementById("tPeriod");

  const pauseBtn = document.getElementById("pause");
  const resetBtn = document.getElementById("reset");
  const presetBtn = document.getElementById("preset");

  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ---------- offscreen trail canvas ----------
  // Phase plane trajectory is drawn here and blitted to the visible canvas
  // each frame. A faint per-frame fade keeps trails lingering but slowly
  // dissolving.
  let trailCanvas = document.createElement("canvas");
  let tctx = trailCanvas.getContext("2d");

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
      accentWarm: cs.getPropertyValue("--accent-warm").trim() || "#2e4cc7",
      accentCool: cs.getPropertyValue("--accent-cool").trim() || "#7a92dc",
    };
    cachedAt = now;
    return cachedStyle;
  }

  // ---------- canvas sizing (DPR-aware) ----------
  function sizeCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvas.width === w && canvas.height === h) {
      canvas._w = rect.width;
      canvas._h = rect.height;
      canvas._dpr = dpr;
      return false;
    }
    canvas.width = w;
    canvas.height = h;
    canvas._w = rect.width;
    canvas._h = rect.height;
    canvas._dpr = dpr;
    return true;
  }

  function sizeTrailCanvas() {
    // Match phase plane backing dimensions.
    const w = phase.width;
    const h = phase.height;
    if (w === 0 || h === 0) return false;
    if (trailCanvas.width === w && trailCanvas.height === h) return false;
    trailCanvas.width = w;
    trailCanvas.height = h;
    tctx = trailCanvas.getContext("2d");
    return true;
  }

  // ---------- physics ----------
  function deriv(xv, yv) {
    // ẋ = αx − βxy, ẏ = δxy − γy
    return [alpha * xv - beta * xv * yv, delta * xv * yv - gamma * yv];
  }

  function rk4Step(xv, yv, dt) {
    const k1 = deriv(xv, yv);
    const k2 = deriv(xv + 0.5 * dt * k1[0], yv + 0.5 * dt * k1[1]);
    const k3 = deriv(xv + 0.5 * dt * k2[0], yv + 0.5 * dt * k2[1]);
    const k4 = deriv(xv + dt * k3[0], yv + dt * k3[1]);
    return [
      xv + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
      yv + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
    ];
  }

  // Box–Muller standard normal.
  let nextGauss = null;
  function randn() {
    if (nextGauss !== null) {
      const v = nextGauss;
      nextGauss = null;
      return v;
    }
    let u1 = 0, u2 = 0;
    while (u1 === 0) u1 = Math.random();
    while (u2 === 0) u2 = Math.random();
    const r = Math.sqrt(-2 * Math.log(u1));
    const theta = 2 * Math.PI * u2;
    nextGauss = r * Math.sin(theta);
    return r * Math.cos(theta);
  }

  function clamp(v) {
    return v < 0.001 ? 0.001 : v;
  }

  function step(dt) {
    [x, y] = rk4Step(x, y, dt);
    if (sigma > 0) {
      const s = Math.sqrt(dt) * sigma;
      x += s * randn();
      y += s * randn();
    }
    x = clamp(x);
    y = clamp(y);
  }

  // ---------- meadow rendering ----------
  // Stable per-dot jitter — positions depend only on an integer index, so
  // they don't flicker frame-to-frame. We use a simple deterministic hash
  // (fract(sin)) to spread offsets in [0, 1].
  function jitter(i, salt) {
    const s = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
    return s - Math.floor(s);
  }

  function drawMeadow() {
    sizeCanvas(meadow);
    const dpr = meadow._dpr || 1;
    const w = meadow._w, h = meadow._h;
    const s = styles();

    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mctx.clearRect(0, 0, w, h);

    // soft inner ground tint
    mctx.fillStyle = s.bgDeep;
    mctx.globalAlpha = 0.35;
    mctx.fillRect(0, 0, w, h);
    mctx.globalAlpha = 1;

    const xi = Math.round(x);
    const yi = Math.round(y);
    const CAP = 300;

    // foxes drawn first (under), rabbits on top — purely aesthetic
    drawSpecies(yi, /*salt=*/7, s.ink, 3.5, w, h, CAP);
    drawSpecies(xi, /*salt=*/31, s.accentWarm, 3.2, w, h, CAP);

    // tiny legend in the corner so colours are readable
    mctx.font = "11px " + (getComputedStyle(document.body).getPropertyValue("--mono") || "monospace");
    mctx.textBaseline = "middle";
    const pad = 10;
    const lx = pad, ly = h - pad - 6;
    mctx.fillStyle = s.accentWarm;
    mctx.beginPath();
    mctx.arc(lx + 4, ly, 3.2, 0, Math.PI * 2);
    mctx.fill();
    mctx.fillStyle = s.muted;
    mctx.fillText(`rabbits  ${xi}`, lx + 12, ly);
    mctx.fillStyle = s.ink;
    mctx.beginPath();
    mctx.arc(lx + 4 + 110, ly, 3.2, 0, Math.PI * 2);
    mctx.fill();
    mctx.fillStyle = s.muted;
    mctx.fillText(`foxes  ${yi}`, lx + 12 + 110, ly);
  }

  function drawSpecies(count, salt, color, radius, w, h, CAP) {
    const visible = Math.min(count, CAP);
    // Above CAP we scale opacity by sqrt(count/CAP) up to 1 (we already are
    // showing the cap; this is just a small visual hint that more are off).
    let alpha = 1;
    if (count > CAP) {
      alpha = Math.min(1, Math.sqrt(count / CAP));
    }
    mctx.fillStyle = color;
    mctx.globalAlpha = alpha;
    // Inset bounds so dots don't crowd the border.
    const padX = 14, padY = 14;
    const innerW = Math.max(1, w - 2 * padX);
    const innerH = Math.max(1, h - 2 * padY - 14 /* legend strip */);
    for (let i = 0; i < visible; i++) {
      const jx = jitter(i, salt);
      const jy = jitter(i, salt + 1);
      const cx = padX + jx * innerW;
      const cy = padY + jy * innerH;
      mctx.beginPath();
      mctx.arc(cx, cy, radius, 0, Math.PI * 2);
      mctx.fill();
    }
    mctx.globalAlpha = 1;
  }

  // ---------- phase plane rendering ----------
  // Trajectory is drawn on the offscreen trailCanvas. Each frame we fade it
  // slightly, draw the new segment, then blit it to the visible canvas and
  // overlay the fixed-point cross + axes labels.
  let phaseRanges = { xMax: 80, yMax: 80 };

  function updatePhaseRanges() {
    // Fit roughly: scale by fixed point so the orbit centre sits near middle.
    const xs = gamma / delta;
    const ys = alpha / beta;
    phaseRanges.xMax = Math.max(80, Math.ceil(Math.max(xs * 2.5, x * 1.4, 40) / 10) * 10);
    phaseRanges.yMax = Math.max(80, Math.ceil(Math.max(ys * 2.5, y * 1.4, 40) / 10) * 10);
  }

  function phaseProj(xv, yv) {
    // Returns pixel coords in trailCanvas backing space.
    const w = trailCanvas.width;
    const h = trailCanvas.height;
    const px = (xv / phaseRanges.xMax) * (w - 30) + 25;
    const py = h - 25 - (yv / phaseRanges.yMax) * (h - 40);
    return [px, py];
  }

  function clearTrail() {
    if (trailCanvas.width === 0 || trailCanvas.height === 0) return;
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
  }

  function fadeTrail() {
    // Slight per-frame fade so trails dissolve over a long window. Pure
    // transparent-clear with destination-out is the cleanest fade and is
    // independent of the page background colour.
    tctx.save();
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.globalCompositeOperation = "destination-out";
    tctx.fillStyle = "rgba(0,0,0,0.005)";
    tctx.fillRect(0, 0, trailCanvas.width, trailCanvas.height);
    tctx.restore();
  }

  function drawTrailSegment(x0, y0, x1, y1) {
    const s = styles();
    const [a, b] = phaseProj(x0, y0);
    const [c, d] = phaseProj(x1, y1);
    tctx.strokeStyle = s.accentWarm;
    tctx.lineWidth = 1.4 * (window.devicePixelRatio || 1);
    tctx.lineCap = "round";
    tctx.beginPath();
    tctx.moveTo(a, b);
    tctx.lineTo(c, d);
    tctx.stroke();
  }

  function drawPhase() {
    sizeCanvas(phase);
    sizeTrailCanvas();
    const dpr = phase._dpr || 1;
    const w = phase._w, h = phase._h;
    const s = styles();

    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pctx.clearRect(0, 0, w, h);

    // background tint
    pctx.fillStyle = s.bgDeep;
    pctx.globalAlpha = 0.35;
    pctx.fillRect(0, 0, w, h);
    pctx.globalAlpha = 1;

    // axes
    pctx.strokeStyle = s.rule;
    pctx.lineWidth = 1;
    pctx.beginPath();
    pctx.moveTo(25, 5);
    pctx.lineTo(25, h - 25);
    pctx.lineTo(w - 5, h - 25);
    pctx.stroke();

    // axis labels
    pctx.fillStyle = s.muted;
    pctx.font = `11px ${getComputedStyle(document.body).getPropertyValue("--mono") || "monospace"}`;
    pctx.textBaseline = "alphabetic";
    pctx.textAlign = "right";
    pctx.fillText("y", 22, 14);
    pctx.textAlign = "left";
    pctx.fillText("x", w - 12, h - 10);

    // tick numbers — quarter / max for each axis
    pctx.textAlign = "center";
    pctx.fillText(String(Math.round(phaseRanges.xMax)), w - 18, h - 10);
    pctx.textAlign = "right";
    pctx.fillText(String(Math.round(phaseRanges.yMax)), 22, 14 + 10);

    // blit trail (it's in backing-pixel coords; reset transform to draw 1:1)
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    pctx.drawImage(trailCanvas, 0, 0);
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // fixed-point cross
    const xs = gamma / delta;
    const ys = alpha / beta;
    const [fx, fy] = phaseProj(xs, ys);
    // convert from backing to CSS-pixel space for overlay
    const cx = fx / dpr;
    const cy = fy / dpr;
    pctx.strokeStyle = s.accentWarm;
    pctx.lineWidth = 1.2;
    const r = 5;
    pctx.beginPath();
    pctx.moveTo(cx - r, cy);
    pctx.lineTo(cx + r, cy);
    pctx.moveTo(cx, cy - r);
    pctx.lineTo(cx, cy + r);
    pctx.stroke();

    // current-state dot
    const [px, py] = phaseProj(x, y);
    pctx.fillStyle = s.ink;
    pctx.beginPath();
    pctx.arc(px / dpr, py / dpr, 3, 0, Math.PI * 2);
    pctx.fill();
  }

  // ---------- readout ----------
  function updateReadout() {
    xLive.textContent = x.toFixed(2);
    yLive.textContent = y.toFixed(2);
    const xs = gamma / delta;
    const ys = alpha / beta;
    xStar.textContent = xs.toFixed(2);
    yStar.textContent = ys.toFixed(2);
    const T = (2 * Math.PI) / Math.sqrt(alpha * gamma);
    tPeriod.textContent = T.toFixed(2);
  }

  // ---------- control wiring ----------
  function updateLabels() {
    alphaVal.textContent = alpha.toFixed(2);
    betaVal.textContent = beta.toFixed(3);
    deltaVal.textContent = delta.toFixed(3);
    gammaVal.textContent = gamma.toFixed(2);
    sigmaVal.textContent = sigma.toFixed(2);
    speedVal.textContent = `${speed.toFixed(2)}×`;
  }

  function resetState() {
    // Init slightly off the fixed point so motion starts.
    x = gamma / delta + 2;
    y = alpha / beta;
    lastX = x;
    lastY = y;
    updatePhaseRanges();
    clearTrail();
  }

  function onRateChange() {
    // Rates change → fixed point moves → old trail is misleading. Clear it
    // and re-fit the phase plane window.
    updatePhaseRanges();
    clearTrail();
    updateReadout();
  }

  alphaInput.addEventListener("input", () => {
    alpha = parseFloat(alphaInput.value);
    updateLabels();
    onRateChange();
  });
  betaInput.addEventListener("input", () => {
    beta = parseFloat(betaInput.value);
    updateLabels();
    onRateChange();
  });
  deltaInput.addEventListener("input", () => {
    delta = parseFloat(deltaInput.value);
    updateLabels();
    onRateChange();
  });
  gammaInput.addEventListener("input", () => {
    gamma = parseFloat(gammaInput.value);
    updateLabels();
    onRateChange();
  });
  sigmaInput.addEventListener("input", () => {
    sigma = parseFloat(sigmaInput.value);
    updateLabels();
  });
  speedInput.addEventListener("input", () => {
    speed = parseFloat(speedInput.value);
    updateLabels();
  });

  pauseBtn.addEventListener("click", () => {
    paused = !paused;
    pauseBtn.textContent = paused ? "resume" : "pause";
    if (!paused && !raf) tick();
  });

  resetBtn.addEventListener("click", () => {
    resetState();
    updateReadout();
  });

  presetBtn.addEventListener("click", () => {
    // Classic Hudson's-Bay-ish hare/lynx parameters: ~10-year cycle.
    alpha = 0.55;
    beta = 0.028;
    delta = 0.026;
    gamma = 0.84;
    alphaInput.value = String(alpha);
    betaInput.value = String(beta);
    deltaInput.value = String(delta);
    gammaInput.value = String(gamma);
    updateLabels();
    resetState();
    updateReadout();
  });

  // ---------- main loop ----------
  function tick() {
    if (paused) {
      raf = 0;
      // still draw once so static state is visible
      drawMeadow();
      drawPhase();
      return;
    }
    const stepsThisFrame = Math.max(1, Math.round(BASE_STEPS_PER_FRAME * speed));
    for (let i = 0; i < stepsThisFrame; i++) {
      lastX = x;
      lastY = y;
      step(DT);
      drawTrailSegment(lastX, lastY, x, y);
    }
    fadeTrail();
    drawMeadow();
    drawPhase();
    updateReadout();
    raf = requestAnimationFrame(tick);
  }

  // ---------- init ----------
  function init() {
    sizeCanvas(meadow);
    sizeCanvas(phase);
    sizeTrailCanvas();
    updateLabels();
    resetState();
    updateReadout();
    drawMeadow();
    drawPhase();
    if (reducedMotion) {
      paused = true;
      pauseBtn.textContent = "resume";
    } else {
      tick();
    }
  }

  window.addEventListener("resize", () => {
    // Resize wipes the trail (the offscreen canvas dimensions change).
    sizeCanvas(meadow);
    sizeCanvas(phase);
    if (sizeTrailCanvas()) clearTrail();
    drawMeadow();
    drawPhase();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
