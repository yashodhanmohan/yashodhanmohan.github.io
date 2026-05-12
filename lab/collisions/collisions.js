// 1D collisions toy.
//
// Two balls on a frictionless track. Mass + velocity per ball, coefficient
// of restitution e (0 = perfectly inelastic, 1 = perfectly elastic). Each
// frame: integrate positions; if overlapping and approaching, apply the
// collision response derived from conservation of momentum + e.

(() => {
  const TWO_PI = Math.PI * 2;
  const PX_PER_M = 70; // canvas pixels per meter of physics distance

  // ---------- state ----------
  let m1 = 1, v1 = 2;
  let m2 = 1, v2 = -1;
  let e = 1;

  // Animation state — ball positions in canvas pixels relative to canvas-left.
  // Initial positions for ball1, ball2 (set on reset()).
  let ball1, ball2;
  let collided = false;
  let animating = false;
  let lastFrame = 0;

  // ---------- DOM ----------
  const canvas = document.getElementById("board");
  const m1Input = document.getElementById("m1");
  const v1Input = document.getElementById("v1");
  const m2Input = document.getElementById("m2");
  const v2Input = document.getElementById("v2");
  const eInput = document.getElementById("e");

  const m1Value = document.getElementById("m1Value");
  const v1Value = document.getElementById("v1Value");
  const m2Value = document.getElementById("m2Value");
  const v2Value = document.getElementById("v2Value");
  const eValue = document.getElementById("eValue");

  const v1Before = document.getElementById("v1Before");
  const v2Before = document.getElementById("v2Before");
  const pBefore = document.getElementById("pBefore");
  const keBefore = document.getElementById("keBefore");
  const v1After = document.getElementById("v1After");
  const v2After = document.getElementById("v2After");
  const pAfter = document.getElementById("pAfter");
  const keAfter = document.getElementById("keAfter");
  const dKE = document.getElementById("dKE");
  const typeValue = document.getElementById("typeValue");

  const fireBtn = document.getElementById("fire");
  const resetBtn = document.getElementById("reset");
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

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
      ink: cs.getPropertyValue("--ink").trim() || "#14161e",
      inkSoft: cs.getPropertyValue("--ink-soft").trim() || "#2c2f3a",
      muted: cs.getPropertyValue("--muted").trim() || "#5b5f68",
      rule: cs.getPropertyValue("--rule").trim() || "#d2d5d2",
      accent: cs.getPropertyValue("--accent-warm").trim() || "#2e4cc7",
    };
    cachedAt = now;
    return cachedStyle;
  }

  // ---------- formatters ----------
  const fmtV = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)} m/s`;
  const fmtKg = (m) => `${m.toFixed(1)} kg`;
  const fmtP = (p) => `${p >= 0 ? "+" : ""}${p.toFixed(2)} kg·m/s`;
  const fmtJ = (j) => `${j.toFixed(2)} J`;

  // ---------- physics ----------
  function collisionResult(m1, v1, m2, v2, e) {
    const sum = m1 + m2;
    const v1p = ((m1 - e * m2) * v1 + (1 + e) * m2 * v2) / sum;
    const v2p = ((1 + e) * m1 * v1 + (m2 - e * m1) * v2) / sum;
    return [v1p, v2p];
  }

  function radiusPx(m) {
    // Visually scale ball size with mass without growing absurdly.
    return 14 + 9 * Math.sqrt(m);
  }

  function classify(eVal) {
    if (eVal >= 0.999) return "elastic";
    if (eVal <= 0.001) return "perfectly inelastic";
    return "partially elastic";
  }

  // ---------- reset to initial state ----------
  function reset() {
    animating = false;
    collided = false;
    lastFrame = 0;
    if (!canvas._w) return;
    const w = canvas._w;
    const yCenter = canvas._h / 2;
    ball1 = {
      x: w * 0.22,
      y: yCenter,
      v: v1,
      m: m1,
      r: radiusPx(m1),
    };
    ball2 = {
      x: w * 0.78,
      y: yCenter,
      v: v2,
      m: m2,
      r: radiusPx(m2),
    };
  }

  // ---------- animation step ----------
  function step(dt) {
    if (!ball1 || !ball2) return;
    // Cap dt against absurd browser jumps.
    if (dt > 0.05) dt = 0.05;

    ball1.x += ball1.v * PX_PER_M * dt;
    ball2.x += ball2.v * PX_PER_M * dt;

    if (!collided) {
      const gap = ball2.x - ball1.x;
      const min = ball1.r + ball2.r;
      // Approach test — only collide if the gap is closing.
      const approaching = ball1.v - ball2.v > 0;
      if (gap < min && approaching) {
        const [v1p, v2p] = collisionResult(ball1.m, ball1.v, ball2.m, ball2.v, e);
        ball1.v = v1p;
        ball2.v = v2p;
        // Separate to just-touching so they don't sit overlapped for e > 0.
        const overlap = min - gap;
        ball1.x -= overlap * 0.5;
        ball2.x += overlap * 0.5;
        collided = true;
      }
    }

    // Stop animating once both balls are well clear of the canvas.
    const w = canvas._w;
    if (ball1.x < -200 && ball2.x < -200) animating = false;
    if (ball1.x > w + 200 && ball2.x > w + 200) animating = false;
  }

  // ---------- rendering ----------
  function render() {
    if (!canvas._w) return;
    const ctx = canvas.getContext("2d");
    const w = canvas._w;
    const h = canvas._h;
    ctx.setTransform(canvas._dpr, 0, 0, canvas._dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const s = styles();
    const yCenter = h / 2;

    // Track line + tick marks at every meter (origin at the center of canvas).
    ctx.strokeStyle = s.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, yCenter + 56);
    ctx.lineTo(w - 20, yCenter + 56);
    ctx.stroke();

    const cx = w / 2;
    ctx.font =
      '10px ui-monospace, "JetBrains Mono", SFMono-Regular, monospace';
    ctx.fillStyle = s.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const halfMeters = Math.floor(((w / 2 - 20) / PX_PER_M));
    for (let i = -halfMeters; i <= halfMeters; i++) {
      const xm = cx + i * PX_PER_M;
      if (xm < 20 || xm > w - 20) continue;
      ctx.strokeStyle = s.rule;
      ctx.beginPath();
      ctx.moveTo(xm, yCenter + 53);
      ctx.lineTo(xm, yCenter + 59);
      ctx.stroke();
      if (i % 2 === 0) ctx.fillText(`${i} m`, xm, yCenter + 62);
    }

    // Balls.
    drawBall(ctx, ball1, s.accent, "1");
    drawBall(ctx, ball2, s.ink, "2");

    // Velocity arrows on top.
    drawArrow(ctx, ball1, s.accent);
    drawArrow(ctx, ball2, s.ink);
  }

  function drawBall(ctx, b, color, label) {
    if (!b) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, TWO_PI);
    ctx.fill();
    // Label inside the ball — paper color on dark fill.
    ctx.fillStyle = styles().bg;
    ctx.font = `${Math.max(11, b.r * 0.55)}px "Instrument Serif", Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, b.x, b.y + 1);
  }

  function drawArrow(ctx, b, color) {
    if (!b) return;
    // Length proportional to velocity, capped.
    const len = Math.max(-160, Math.min(160, b.v * 30));
    if (Math.abs(len) < 4) return;
    const y = b.y - b.r - 18;
    const x1 = b.x;
    const x2 = b.x + len;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
    // Arrowhead.
    const dir = Math.sign(len);
    ctx.beginPath();
    ctx.moveTo(x2, y);
    ctx.lineTo(x2 - dir * 8, y - 5);
    ctx.lineTo(x2 - dir * 8, y + 5);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineCap = "butt";
  }

  // ---------- stats panel ----------
  function updateStats() {
    v1Before.textContent = fmtV(v1);
    v2Before.textContent = fmtV(v2);
    const pPre = m1 * v1 + m2 * v2;
    const kePre = 0.5 * m1 * v1 * v1 + 0.5 * m2 * v2 * v2;
    pBefore.textContent = fmtP(pPre);
    keBefore.textContent = fmtJ(kePre);

    const [v1p, v2p] = collisionResult(m1, v1, m2, v2, e);
    v1After.textContent = fmtV(v1p);
    v2After.textContent = fmtV(v2p);
    const pPost = m1 * v1p + m2 * v2p;
    const kePost = 0.5 * m1 * v1p * v1p + 0.5 * m2 * v2p * v2p;
    pAfter.textContent = fmtP(pPost);
    keAfter.textContent = fmtJ(kePost);

    const dPct = kePre > 0 ? ((kePost - kePre) / kePre) * 100 : 0;
    const dAbs = kePost - kePre;
    dKE.textContent = `${dAbs.toFixed(2)} J  (${dPct.toFixed(0)}%)`;
    typeValue.textContent = classify(e);
  }

  // ---------- main loop ----------
  function frame(now) {
    if (animating) {
      if (!lastFrame) lastFrame = now;
      const dt = (now - lastFrame) / 1000;
      lastFrame = now;
      step(dt);
    } else {
      lastFrame = 0;
    }
    render();
    requestAnimationFrame(frame);
  }

  // ---------- slider wiring ----------
  function refreshLabels() {
    m1Value.textContent = fmtKg(m1);
    v1Value.textContent = fmtV(v1);
    m2Value.textContent = fmtKg(m2);
    v2Value.textContent = fmtV(v2);
    eValue.textContent = e.toFixed(2);
  }

  function onChange() {
    refreshLabels();
    updateStats();
    reset(); // Slider changes return the simulation to initial state.
  }

  m1Input.addEventListener("input", (ev) => {
    m1 = +ev.target.value;
    onChange();
  });
  v1Input.addEventListener("input", (ev) => {
    v1 = +ev.target.value;
    onChange();
  });
  m2Input.addEventListener("input", (ev) => {
    m2 = +ev.target.value;
    onChange();
  });
  v2Input.addEventListener("input", (ev) => {
    v2 = +ev.target.value;
    onChange();
  });
  eInput.addEventListener("input", (ev) => {
    e = +ev.target.value;
    onChange();
  });

  fireBtn.addEventListener("click", () => {
    reset();
    animating = true;
  });
  resetBtn.addEventListener("click", () => {
    reset();
  });

  // ---------- boot ----------
  refreshLabels();
  updateStats();

  requestAnimationFrame(() => {
    sizeCanvas();
    reset();
    requestAnimationFrame(frame);
  });

  let resizeQueued = false;
  window.addEventListener("resize", () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      sizeCanvas();
      reset();
      resizeQueued = false;
    });
  });
})();
