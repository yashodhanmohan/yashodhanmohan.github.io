// 1D collisions toy.
//
// Two balls on a frictionless track. Each ball has a mass and a velocity.
// User can also drop in any number of fixed walls along the track; balls
// bounce off them with the same coefficient of restitution e. Stats panel
// reports the initial state, the live state (which changes every frame),
// and the predicted post-collision state if the two balls collided right
// now at their current velocities.

(() => {
  const TWO_PI = Math.PI * 2;
  const BASE_PX_PER_M = 70;
  const REST_SPEED = 0.02; // m/s — below this both balls are considered stopped

  // ---------- state ----------
  let m1 = 1, v1 = 2;
  let m2 = 1, v2 = -1;
  let e = 1;
  let zoom = 1;

  let ball1, ball2;
  let collided = false; // flag for first ball-ball collision after fire
  let animating = false;
  let lastFrame = 0;

  // Walls: each { id, xMeters }
  let walls = [];
  let nextWallId = 1;

  // ---------- DOM ----------
  const canvas = document.getElementById("board");
  const m1Input = document.getElementById("m1");
  const v1Input = document.getElementById("v1");
  const m2Input = document.getElementById("m2");
  const v2Input = document.getElementById("v2");
  const eInput = document.getElementById("e");
  const zoomInput = document.getElementById("zoom");

  const m1Value = document.getElementById("m1Value");
  const v1Value = document.getElementById("v1Value");
  const m2Value = document.getElementById("m2Value");
  const v2Value = document.getElementById("v2Value");
  const eValue = document.getElementById("eValue");
  const zoomValue = document.getElementById("zoomValue");

  const v1Before = document.getElementById("v1Before");
  const v2Before = document.getElementById("v2Before");
  const pBefore = document.getElementById("pBefore");
  const keBefore = document.getElementById("keBefore");

  const v1Live = document.getElementById("v1Live");
  const v2Live = document.getElementById("v2Live");
  const pLive = document.getElementById("pLive");
  const keLive = document.getElementById("keLive");

  const v1After = document.getElementById("v1After");
  const v2After = document.getElementById("v2After");
  const pAfter = document.getElementById("pAfter");
  const keAfter = document.getElementById("keAfter");
  const dKE = document.getElementById("dKE");
  const typeValue = document.getElementById("typeValue");

  const fireBtn = document.getElementById("fire");
  const resetBtn = document.getElementById("reset");
  const addWallBtn = document.getElementById("addWall");
  const wallsList = document.getElementById("wallsList");
  const wallsEmpty = document.getElementById("wallsEmpty");

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

  // ---------- helpers ----------
  const fmtV = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)} m/s`;
  const fmtKg = (m) => `${m.toFixed(1)} kg`;
  const fmtP = (p) => `${p >= 0 ? "+" : ""}${p.toFixed(2)} kg·m/s`;
  const fmtJ = (j) => `${j.toFixed(2)} J`;
  const fmtM = (m) => `${m >= 0 ? "+" : ""}${m.toFixed(2)} m`;

  function pxPerM() {
    return BASE_PX_PER_M * zoom;
  }
  function radiusPx(m) {
    return (14 + 9 * Math.sqrt(m)) * zoom;
  }

  // Pure-physics ball-ball collision.
  function collisionResult(m1, v1, m2, v2, e) {
    const sum = m1 + m2;
    const v1p = ((m1 - e * m2) * v1 + (1 + e) * m2 * v2) / sum;
    const v2p = ((1 + e) * m1 * v1 + (m2 - e * m1) * v2) / sum;
    return [v1p, v2p];
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
    ball1 = { x: w * 0.22, y: yCenter, v: v1, m: m1, r: radiusPx(m1) };
    ball2 = { x: w * 0.78, y: yCenter, v: v2, m: m2, r: radiusPx(m2) };
  }

  // ---------- physics step ----------
  function step(dt) {
    if (!ball1 || !ball2) return;
    if (dt > 0.05) dt = 0.05;

    const scale = pxPerM();
    ball1.x += ball1.v * scale * dt;
    ball2.x += ball2.v * scale * dt;

    // Ball-ball collision. Trigger only when the gap is closing.
    {
      const gap = ball2.x - ball1.x;
      const min = ball1.r + ball2.r;
      const approaching = ball1.v - ball2.v > 0;
      if (gap < min && approaching) {
        const [v1p, v2p] = collisionResult(
          ball1.m, ball1.v, ball2.m, ball2.v, e
        );
        ball1.v = v1p;
        ball2.v = v2p;
        const overlap = min - gap;
        ball1.x -= overlap * 0.5;
        ball2.x += overlap * 0.5;
        collided = true;
      }
    }

    // Ball-wall collisions (treat wall as immovable: v' = −e · v).
    if (walls.length) {
      const center = canvas._w / 2;
      for (const wall of walls) {
        const wallX = center + wall.xMeters * scale;
        for (const ball of [ball1, ball2]) {
          const dx = ball.x - wallX;
          const r = ball.r;
          if (Math.abs(dx) < r) {
            const approachingWall =
              (dx > 0 && ball.v < 0) || (dx < 0 && ball.v > 0);
            if (approachingWall) {
              ball.v = -e * ball.v;
              ball.x = wallX + Math.sign(dx) * r;
            }
          }
        }
      }
    }

    // Stop conditions: both balls effectively at rest, or both off-canvas
    // with no walls behind to bounce them back.
    const speed1 = Math.abs(ball1.v);
    const speed2 = Math.abs(ball2.v);
    if (speed1 < REST_SPEED && speed2 < REST_SPEED) {
      animating = false;
    }
    const w = canvas._w;
    const offLeft = ball1.x < -200 && ball2.x < -200;
    const offRight = ball1.x > w + 200 && ball2.x > w + 200;
    if (offLeft || offRight) animating = false;
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
    const center = w / 2;
    const scale = pxPerM();

    // Track baseline.
    ctx.strokeStyle = s.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, yCenter + 56);
    ctx.lineTo(w - 20, yCenter + 56);
    ctx.stroke();

    // Meter ticks + labels.
    ctx.font =
      '10px ui-monospace, "JetBrains Mono", SFMono-Regular, monospace';
    ctx.fillStyle = s.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const halfMeters = Math.floor((w / 2 - 20) / scale);
    const labelStep = halfMeters > 8 ? 2 : 1;
    for (let i = -halfMeters; i <= halfMeters; i++) {
      const xm = center + i * scale;
      if (xm < 20 || xm > w - 20) continue;
      ctx.strokeStyle = s.rule;
      ctx.beginPath();
      ctx.moveTo(xm, yCenter + 53);
      ctx.lineTo(xm, yCenter + 59);
      ctx.stroke();
      if (i % labelStep === 0)
        ctx.fillText(`${i} m`, xm, yCenter + 62);
    }

    // Walls (drawn behind balls).
    if (walls.length) {
      ctx.strokeStyle = s.ink;
      ctx.lineWidth = 3;
      ctx.lineCap = "square";
      for (const wall of walls) {
        const xPx = center + wall.xMeters * scale;
        if (xPx < -10 || xPx > w + 10) continue;
        ctx.beginPath();
        ctx.moveTo(xPx, yCenter - 80);
        ctx.lineTo(xPx, yCenter + 56);
        ctx.stroke();
      }
    }

    drawBall(ctx, ball1, s.accent, "1");
    drawBall(ctx, ball2, s.ink, "2");
    drawArrow(ctx, ball1, s.accent);
    drawArrow(ctx, ball2, s.ink);
  }

  function drawBall(ctx, b, color, label) {
    if (!b) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = styles().bg;
    ctx.font = `${Math.max(11, b.r * 0.55)}px "Instrument Serif", Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, b.x, b.y + 1);
  }

  function drawArrow(ctx, b, color) {
    if (!b) return;
    const len = Math.max(-160, Math.min(160, b.v * 30 * zoom));
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

  // ---------- stats ----------
  function updateBefore() {
    v1Before.textContent = fmtV(v1);
    v2Before.textContent = fmtV(v2);
    const pPre = m1 * v1 + m2 * v2;
    const kePre = 0.5 * m1 * v1 * v1 + 0.5 * m2 * v2 * v2;
    pBefore.textContent = fmtP(pPre);
    keBefore.textContent = fmtJ(kePre);
    typeValue.textContent = classify(e);
  }

  function updateLiveAndNext() {
    const lv1 = ball1 ? ball1.v : v1;
    const lv2 = ball2 ? ball2.v : v2;
    v1Live.textContent = fmtV(lv1);
    v2Live.textContent = fmtV(lv2);
    const pCur = m1 * lv1 + m2 * lv2;
    const keCur = 0.5 * m1 * lv1 * lv1 + 0.5 * m2 * lv2 * lv2;
    pLive.textContent = fmtP(pCur);
    keLive.textContent = fmtJ(keCur);

    // Predict what happens IF they collide right now at live velocities.
    const [v1p, v2p] = collisionResult(m1, lv1, m2, lv2, e);
    v1After.textContent = fmtV(v1p);
    v2After.textContent = fmtV(v2p);
    const pPost = m1 * v1p + m2 * v2p;
    const kePost = 0.5 * m1 * v1p * v1p + 0.5 * m2 * v2p * v2p;
    pAfter.textContent = fmtP(pPost);
    keAfter.textContent = fmtJ(kePost);
    const dPct = keCur > 0 ? ((kePost - keCur) / keCur) * 100 : 0;
    const dAbs = kePost - keCur;
    dKE.textContent = `${dAbs.toFixed(2)} J  (${dPct.toFixed(0)}%)`;
  }

  // ---------- walls UI ----------
  function renderWallsList() {
    wallsList.innerHTML = "";
    for (const wall of walls) {
      const li = document.createElement("li");
      li.className = "wall-row";
      li.dataset.wallId = wall.id;
      li.innerHTML = `
        <span class="wall-label">wall ${wall.id}</span>
        <input type="range" min="-5" max="5" step="0.1" value="${wall.xMeters}" />
        <span class="wall-pos">${fmtM(wall.xMeters)}</span>
        <button class="wall-remove" type="button" aria-label="Remove wall ${wall.id}">×</button>
      `;
      const input = li.querySelector("input");
      const pos = li.querySelector(".wall-pos");
      input.addEventListener("input", (ev) => {
        wall.xMeters = +ev.target.value;
        pos.textContent = fmtM(wall.xMeters);
      });
      li.querySelector(".wall-remove").addEventListener("click", () => {
        walls = walls.filter((w) => w.id !== wall.id);
        renderWallsList();
      });
      wallsList.appendChild(li);
    }
    wallsEmpty.classList.toggle("hidden", walls.length > 0);
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
    updateLiveAndNext();
    requestAnimationFrame(frame);
  }

  // ---------- slider wiring ----------
  function refreshLabels() {
    m1Value.textContent = fmtKg(m1);
    v1Value.textContent = fmtV(v1);
    m2Value.textContent = fmtKg(m2);
    v2Value.textContent = fmtV(v2);
    eValue.textContent = e.toFixed(2);
    zoomValue.textContent = `${zoom.toFixed(2)}×`;
  }
  function onParamChange() {
    refreshLabels();
    updateBefore();
    reset();
  }

  m1Input.addEventListener("input", (ev) => {
    m1 = +ev.target.value;
    onParamChange();
  });
  v1Input.addEventListener("input", (ev) => {
    v1 = +ev.target.value;
    onParamChange();
  });
  m2Input.addEventListener("input", (ev) => {
    m2 = +ev.target.value;
    onParamChange();
  });
  v2Input.addEventListener("input", (ev) => {
    v2 = +ev.target.value;
    onParamChange();
  });
  eInput.addEventListener("input", (ev) => {
    e = +ev.target.value;
    onParamChange();
  });
  zoomInput.addEventListener("input", (ev) => {
    zoom = +ev.target.value;
    onParamChange();
  });

  fireBtn.addEventListener("click", () => {
    reset();
    animating = true;
  });
  resetBtn.addEventListener("click", () => {
    reset();
  });

  addWallBtn.addEventListener("click", () => {
    walls.push({ id: nextWallId++, xMeters: 0 });
    renderWallsList();
  });

  // ---------- boot ----------
  refreshLabels();
  updateBefore();
  renderWallsList();

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
