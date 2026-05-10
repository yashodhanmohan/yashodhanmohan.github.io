// Galton board with circle-on-circle peg collisions, gravity-tilt bias,
// and a live overlay of the theoretical Binomial(N, p) distribution.

(() => {
  // ---------- physics constants ----------
  const GRAVITY_Y = 900; // px / s²
  const GRAVITY_X_MAX = 360; // px / s² at the bias extremes
  const RESTITUTION_PEG = 0.28; // ball-on-peg
  const RESTITUTION_BALL = 0.35; // ball-on-ball
  const RESTITUTION_WALL = 0.18; // ball-on-side-wall
  const HORIZ_DAMPING = 0.965; // per frame (~60fps) — air-drag-ish
  const BALL_RADIUS = 4;
  const PEG_RADIUS = 3.5;
  const COLLISION_JITTER = 14; // px / s — broken-symmetry kick on each peg hit
  const VX_CAP = 480;
  const MAX_BALLS_IN_FLIGHT = 220;
  const MAX_BALL_AGE = 9; // seconds before a stuck ball is force-binned

  // ---------- state ----------
  let rows = 10;
  let bias = 0.5;
  let rate = 60; // balls per second
  let playing = true;

  let bins = new Array(rows + 1).fill(0);
  let totalDropped = 0;
  let activeBalls = [];
  let pegs = [];

  let lastFrame = 0;
  let dropAcc = 0;

  // geometry
  let originX = 0,
    pegboardTop = 0,
    binsTop = 0,
    binsBottom = 0,
    binsLeft = 0,
    dx = 0,
    dy = 0;

  // ---------- DOM ----------
  const boardCanvas = document.getElementById("board");
  const dropCountEl = document.getElementById("dropCount");
  const meanEl = document.getElementById("mean");
  const sigmaEl = document.getElementById("sigma");
  const meanTheoryEl = document.getElementById("meanTheory");
  const sigmaTheoryEl = document.getElementById("sigmaTheory");
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const rowsInput = document.getElementById("rows");
  const biasInput = document.getElementById("bias");
  const rateInput = document.getElementById("rate");
  const rowsValueEl = document.getElementById("rowsValue");
  const biasValueEl = document.getElementById("biasValue");
  const rateValueEl = document.getElementById("rateValue");

  const dropOneBtn = document.getElementById("dropOne");
  const resetBtn = document.getElementById("reset");
  const playPauseBtn = document.getElementById("playPause");

  // ---------- canvas sizing ----------

  function sizeCanvas(canvas) {
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
      ink: cs.getPropertyValue("--ink").trim() || "#14161e",
      inkSoft: cs.getPropertyValue("--ink-soft").trim() || "#2c2f3a",
      muted: cs.getPropertyValue("--muted").trim() || "#6b6f78",
      rule: cs.getPropertyValue("--rule").trim() || "#d2d5d2",
      accent: cs.getPropertyValue("--accent-warm").trim() || "#2e4cc7",
      bg: cs.getPropertyValue("--bg").trim() || "#eef0ee",
    };
    cachedAt = now;
    return cachedStyle;
  }

  // ---------- geometry ----------

  function recomputeGeometry() {
    const w = boardCanvas._w;
    const h = boardCanvas._h;
    if (!w || !h) return;

    const sideMargin = 16;
    const topMargin = 18;
    const usableWidth = w - 2 * sideMargin;
    const pegboardH = Math.round(h * 0.62);

    pegboardTop = topMargin;
    binsTop = pegboardTop + pegboardH + 6;
    binsBottom = h - 16;

    // Horizontal column spacing — must accommodate (rows + 1) bins.
    dx = Math.floor(usableWidth / (rows + 1));
    dy = (pegboardH - topMargin) / (rows + 1);

    originX = w / 2;
    binsLeft = originX - (dx * (rows + 1)) / 2;

    pegs = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c <= r; c++) {
        const x = originX + (c - r / 2) * dx;
        const y = pegboardTop + (r + 1) * dy;
        pegs.push({ x, y });
      }
    }
  }

  // ---------- balls ----------

  function dropBall() {
    if (activeBalls.length >= MAX_BALLS_IN_FLIGHT) return;
    // Don't spawn on top of an existing ball — keeps the spawn point from
    // jamming when the rate slider is high.
    for (const b of activeBalls) {
      if (b.y < 24 && Math.abs(b.x - originX) < BALL_RADIUS * 2.2) return;
    }
    activeBalls.push({
      x: originX + (Math.random() - 0.5) * 2,
      y: 6,
      vx: (Math.random() - 0.5) * 12,
      vy: 0,
      age: 0,
    });
  }

  function settle(ball) {
    const idx = Math.floor((ball.x - binsLeft) / dx);
    const k = Math.max(0, Math.min(rows, idx));
    bins[k]++;
    totalDropped++;
    ball.dead = true;
  }

  function step(dt) {
    dropAcc += rate * dt;
    while (dropAcc >= 1 && activeBalls.length < MAX_BALLS_IN_FLIGHT) {
      dropBall();
      dropAcc -= 1;
    }
    if (rate <= 0) dropAcc = 0;

    const gx = (bias - 0.5) * 2 * GRAVITY_X_MAX;
    const w = boardCanvas._w;
    const leftWall = 4;
    const rightWall = w - 4;

    // Per-frame air drag — converts repeated 60fps integration to a smooth
    // exponential decay of horizontal velocity. Without this, vx accumulates
    // through the lattice and the histogram blows out toward the walls.
    const dampingThisFrame = Math.pow(HORIZ_DAMPING, dt * 60);

    for (const ball of activeBalls) {
      ball.age += dt;

      ball.vx += gx * dt;
      ball.vy += GRAVITY_Y * dt;
      ball.vx *= dampingThisFrame;

      if (ball.vx > VX_CAP) ball.vx = VX_CAP;
      else if (ball.vx < -VX_CAP) ball.vx = -VX_CAP;

      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      // Peg collisions — vertically near the ball only.
      for (const peg of pegs) {
        if (Math.abs(ball.y - peg.y) > 14) continue;
        const ddx = ball.x - peg.x;
        const ddy = ball.y - peg.y;
        const distSq = ddx * ddx + ddy * ddy;
        const minDist = BALL_RADIUS + PEG_RADIUS;
        if (distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq) || 0.001;
          const nx = ddx / dist;
          const ny = ddy / dist;
          const overlap = minDist - dist;
          ball.x += nx * overlap;
          ball.y += ny * overlap;

          const vDotN = ball.vx * nx + ball.vy * ny;
          if (vDotN < 0) {
            ball.vx -= (1 + RESTITUTION_PEG) * vDotN * nx;
            ball.vy -= (1 + RESTITUTION_PEG) * vDotN * ny;
            // Tiny symmetry-break — keeps a perfectly head-on drop from
            // resting on top of a peg.
            ball.vx += (Math.random() - 0.5) * COLLISION_JITTER;
          }
        }
      }

      // Side walls (mostly absorbing).
      if (ball.x < leftWall + BALL_RADIUS) {
        ball.x = leftWall + BALL_RADIUS;
        ball.vx = Math.abs(ball.vx) * RESTITUTION_WALL;
      } else if (ball.x > rightWall - BALL_RADIUS) {
        ball.x = rightWall - BALL_RADIUS;
        ball.vx = -Math.abs(ball.vx) * RESTITUTION_WALL;
      }

      // Reached the bin floor — settle.
      if (ball.y > binsBottom - BALL_RADIUS - 1 || ball.age > MAX_BALL_AGE) {
        settle(ball);
      }
    }

    // Ball-on-ball collisions (single Jacobi sweep, equal mass, mild
    // restitution). Inner loop bails early on horizontal distance — most
    // pairs are nowhere near each other.
    const minBB = BALL_RADIUS * 2;
    const minBBsq = minBB * minBB;
    for (let i = 0; i < activeBalls.length; i++) {
      const a = activeBalls[i];
      if (a.dead) continue;
      for (let j = i + 1; j < activeBalls.length; j++) {
        const b = activeBalls[j];
        if (b.dead) continue;
        const dxij = b.x - a.x;
        if (dxij > minBB || dxij < -minBB) continue;
        const dyij = b.y - a.y;
        if (dyij > minBB || dyij < -minBB) continue;
        const distSq = dxij * dxij + dyij * dyij;
        if (distSq >= minBBsq || distSq < 0.0001) continue;
        const dist = Math.sqrt(distSq);
        const nx = dxij / dist;
        const ny = dyij / dist;
        const overlap = (minBB - dist) * 0.5;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;
        const relN = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (relN < 0) {
          const j_ = (1 + RESTITUTION_BALL) * relN * 0.5;
          a.vx += j_ * nx;
          a.vy += j_ * ny;
          b.vx -= j_ * nx;
          b.vy -= j_ * ny;
        }
      }
    }

    activeBalls = activeBalls.filter((b) => !b.dead);
  }

  // ---------- binomial PMF ----------

  const logFactCache = [0]; // log(0!)
  function logFact(n) {
    while (logFactCache.length <= n) {
      const i = logFactCache.length;
      logFactCache.push(logFactCache[i - 1] + Math.log(i));
    }
    return logFactCache[n];
  }
  function binomialPMF(n, k, p) {
    if (k < 0 || k > n) return 0;
    if (p <= 0) return k === 0 ? 1 : 0;
    if (p >= 1) return k === n ? 1 : 0;
    const logP = logFact(n) - logFact(k) - logFact(n - k) +
      k * Math.log(p) + (n - k) * Math.log(1 - p);
    return Math.exp(logP);
  }

  // ---------- render ----------

  function render() {
    if (!boardCanvas._w) return;
    const w = boardCanvas._w;
    const h = boardCanvas._h;
    const dpr = boardCanvas._dpr;
    const ctx = boardCanvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const s = styles();

    // ---- bins frame ----
    ctx.strokeStyle = s.rule;
    ctx.lineWidth = 1;
    for (let i = 0; i <= rows + 1; i++) {
      const x = binsLeft + i * dx;
      ctx.beginPath();
      ctx.moveTo(x, binsTop);
      ctx.lineTo(x, binsBottom);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(binsLeft, binsBottom);
    ctx.lineTo(binsLeft + (rows + 1) * dx, binsBottom);
    ctx.stroke();

    // ---- pegs (muted, distinct from balls) ----
    ctx.fillStyle = s.muted;
    for (const peg of pegs) {
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, PEG_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- bead piles in bins ----
    // Beads are drawn at fixed pixel size and stacked. Theoretical curve
    // is scaled to the same units (bead-pile heights), so empirical and
    // theoretical are pixel-comparable.
    const binPad = 2;
    const beadSpacing = 7.6;
    const beadRadius = 3.2;
    const beadsPerRow = Math.max(
      1,
      Math.floor((dx - 2 * binPad) / beadSpacing)
    );
    const rowSpacing = beadSpacing * 0.92; // mild vertical compression
    const binInteriorH = binsBottom - binsTop - binPad;
    const maxRows = Math.max(1, Math.floor(binInteriorH / rowSpacing));
    const maxVisibleBeads = beadsPerRow * maxRows;

    ctx.fillStyle = s.inkSoft;
    for (let k = 0; k <= rows; k++) {
      const visible = Math.min(bins[k], maxVisibleBeads);
      if (visible === 0) continue;
      const xLeft = binsLeft + k * dx;
      const stripeWidth = beadsPerRow * beadSpacing;
      const xOffset = (dx - stripeWidth) / 2 + beadSpacing / 2;
      for (let i = 0; i < visible; i++) {
        const r = Math.floor(i / beadsPerRow);
        const c = i % beadsPerRow;
        const cx = xLeft + xOffset + c * beadSpacing;
        const cy = binsBottom - beadRadius - r * rowSpacing;
        ctx.beginPath();
        ctx.arc(cx, cy, beadRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ---- theoretical curve (scaled to match bead-pile heights) ----
    if (totalDropped > 0) {
      const beadsToY = (count) =>
        binsBottom - beadRadius - (count / beadsPerRow) * rowSpacing;

      ctx.strokeStyle = s.accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let k = 0; k <= rows; k++) {
        const x = binsLeft + (k + 0.5) * dx;
        const tCount = binomialPMF(rows, k, bias) * totalDropped;
        const y = beadsToY(tCount);
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.fillStyle = s.accent;
      for (let k = 0; k <= rows; k++) {
        const x = binsLeft + (k + 0.5) * dx;
        const tCount = binomialPMF(rows, k, bias) * totalDropped;
        const y = beadsToY(tCount);
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ---- active balls ----
    ctx.fillStyle = s.ink;
    for (const ball of activeBalls) {
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------- stats ----------

  function updateStats() {
    dropCountEl.textContent = totalDropped.toLocaleString();

    if (totalDropped > 0) {
      let sum = 0;
      let sum2 = 0;
      for (let k = 0; k <= rows; k++) {
        sum += k * bins[k];
        sum2 += k * k * bins[k];
      }
      const mean = sum / totalDropped;
      const variance = Math.max(0, sum2 / totalDropped - mean * mean);
      meanEl.textContent = mean.toFixed(2);
      sigmaEl.textContent = Math.sqrt(variance).toFixed(2);
    } else {
      meanEl.textContent = "—";
      sigmaEl.textContent = "—";
    }

    meanTheoryEl.textContent = (rows * bias).toFixed(2);
    sigmaTheoryEl.textContent = Math.sqrt(rows * bias * (1 - bias)).toFixed(2);
  }

  // ---------- main loop ----------

  function frame(now) {
    if (!lastFrame) lastFrame = now;
    const dt = Math.min((now - lastFrame) / 1000, 1 / 30);
    lastFrame = now;

    if (playing) step(dt);
    render();
    updateStats();

    requestAnimationFrame(frame);
  }

  // ---------- reset / control wiring ----------

  function fullReset() {
    bins = new Array(rows + 1).fill(0);
    activeBalls = [];
    totalDropped = 0;
    dropAcc = 0;
    recomputeGeometry();
  }

  function setRows(v) {
    const next = Math.max(4, Math.min(16, Math.round(v)));
    if (next === rows) return;
    rows = next;
    rowsValueEl.textContent = String(rows);
    fullReset();
  }
  function setBias(v) {
    const next = Math.max(0.05, Math.min(0.95, v));
    if (Math.abs(next - bias) < 1e-4) return;
    bias = next;
    biasValueEl.textContent = bias.toFixed(2);
    // Bias change → past data is from a different experiment.
    bins = new Array(rows + 1).fill(0);
    totalDropped = 0;
  }
  function setRate(v) {
    rate = Math.max(0, Math.min(250, Math.round(v)));
    rateValueEl.textContent = `${rate} / s`;
  }

  rowsInput.addEventListener("input", (e) => setRows(+e.target.value));
  biasInput.addEventListener("input", (e) => setBias(+e.target.value));
  rateInput.addEventListener("input", (e) => setRate(+e.target.value));

  dropOneBtn.addEventListener("click", () => dropBall());
  resetBtn.addEventListener("click", () => fullReset());
  playPauseBtn.addEventListener("click", () => {
    playing = !playing;
    playPauseBtn.textContent = playing ? "pause" : "play";
    if (playing) lastFrame = 0; // avoid a giant dt jump on resume
  });

  // ---------- boot ----------

  setRate(+rateInput.value);
  setBias(+biasInput.value);
  rowsValueEl.textContent = rowsInput.value;

  requestAnimationFrame(() => {
    sizeCanvas(boardCanvas);
    recomputeGeometry();
    requestAnimationFrame(frame);
  });

  let resizeQueued = false;
  window.addEventListener("resize", () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      sizeCanvas(boardCanvas);
      recomputeGeometry();
      resizeQueued = false;
    });
  });
})();
