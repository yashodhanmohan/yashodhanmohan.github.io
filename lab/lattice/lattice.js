// Spring lattice — 30×30 grid of masses on Hookean springs.
//
// Each interior node i is pulled by its four neighbours:
//     F_i = k · Σ_n (z[n] − z[i]) − c · vz[i]
// integrated with symplectic Euler. Boundary behaviour is selected by
// edgeMode: 'clamped' (z=0 pinned), 'free' (no boundary constraint —
// missing neighbours contribute 0), or 'driven' (left column driven by
// A·sin(2π f t), all other edges free).

(() => {
  const N = 30;
  const COUNT = N * N;
  const MASS = 1;
  const MAX_Z = 3;

  // ---------- state ----------
  let k = 120;
  let cDamp = 0.005;
  let driveFreq = 0;
  let pluckStrength = 0.6;
  let edgeMode = "clamped"; // 'clamped' | 'free' | 'driven'

  const z = new Float32Array(COUNT);
  const vz = new Float32Array(COUNT);
  const F = new Float32Array(COUNT);

  let simTime = 0;

  // drag state
  let dragIdx = -1;
  let dragZ = 0;
  let pointerAnchorY = 0;
  let pointerAnchorZ = 0;
  let pointerStart = null;
  let pointerMoved = false;
  let activePointerId = null;

  // ---------- DOM ----------
  const canvas = document.getElementById("lattice-canvas");
  const ctx = canvas.getContext("2d");
  const kInput = document.getElementById("k");
  const cInput = document.getElementById("c");
  const fInput = document.getElementById("f");
  const pInput = document.getElementById("p");
  const kValue = document.getElementById("kValue");
  const cValue = document.getElementById("cValue");
  const fValue = document.getElementById("fValue");
  const pValue = document.getElementById("pValue");
  const resetBtn = document.getElementById("reset");
  const edgeBtns = Array.from(document.querySelectorAll(".edge-btn"));
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ---------- colours (sampled from CSS vars, refreshed on scheme change) ----------
  let rgbRule, rgbWarm, rgbCool;

  function parseColor(s) {
    s = (s || "").trim();
    if (s.startsWith("#")) {
      let h = s.slice(1);
      if (h.length === 3) h = h.split("").map((c) => c + c).join("");
      const v = parseInt(h, 16);
      return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    }
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const parts = m[1].split(",").map((x) => parseFloat(x));
      return [parts[0] | 0, parts[1] | 0, parts[2] | 0];
    }
    return [180, 180, 180];
  }

  function refreshColours() {
    const root = getComputedStyle(document.documentElement);
    rgbRule = parseColor(root.getPropertyValue("--rule"));
    rgbWarm = parseColor(root.getPropertyValue("--accent-warm"));
    rgbCool = parseColor(root.getPropertyValue("--accent-cool"));
  }
  refreshColours();
  const darkMQ = window.matchMedia("(prefers-color-scheme: dark)");
  if (darkMQ.addEventListener) darkMQ.addEventListener("change", refreshColours);
  else if (darkMQ.addListener) darkMQ.addListener(refreshColours);

  function lerp(a, b, t) { return a + (b - a) * t; }

  function colourForZ(zv) {
    const u = Math.max(-1, Math.min(1, zv));
    let r, g, b;
    if (u >= 0) {
      r = lerp(rgbRule[0], rgbWarm[0], u);
      g = lerp(rgbRule[1], rgbWarm[1], u);
      b = lerp(rgbRule[2], rgbWarm[2], u);
    } else {
      r = lerp(rgbRule[0], rgbCool[0], -u);
      g = lerp(rgbRule[1], rgbCool[1], -u);
      b = lerp(rgbRule[2], rgbCool[2], -u);
    }
    return "rgb(" + (r | 0) + "," + (g | 0) + "," + (b | 0) + ")";
  }

  // ---------- geometry ----------
  let canvasW = 720, canvasH = 420;
  let cellW = 20, cellH = 14;
  let baseX = 70, baseY = 7;
  const shearX = 5;
  const lift = 18;

  function projX(gx, zv) { return baseX + gx * cellW + zv * shearX; }
  function projY(gy, zv) { return baseY + gy * cellH - zv * lift; }

  function sizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    canvasW = rect.width;
    canvasH = rect.height;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // leave a margin to accommodate the z·lift overshoot
    const padX = Math.max(24, lift + shearX + 4);
    const padY = Math.max(24, lift + 6);
    cellW = (canvasW - 2 * padX) / (N - 1);
    cellH = (canvasH - 2 * padY) / (N - 1);
    baseX = padX;
    baseY = padY;
  }

  // ---------- sim ----------
  function idx(x, y) { return y * N + x; }

  function isClampedBoundary(x, y) {
    return x === 0 || y === 0 || x === N - 1 || y === N - 1;
  }

  function applyDrivenEdge() {
    if (edgeMode !== "driven") return;
    const A = 1;
    const v = driveFreq > 0
      ? A * Math.sin(2 * Math.PI * driveFreq * simTime)
      : 0;
    for (let y = 0; y < N; y++) {
      const i = idx(0, y);
      z[i] = v;
      vz[i] = 0;
    }
  }

  function step(dt) {
    applyDrivenEdge();

    if (dragIdx >= 0) {
      z[dragIdx] = dragZ;
      vz[dragIdx] = 0;
    }

    // forces
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = idx(x, y);
        if (edgeMode === "clamped" && isClampedBoundary(x, y)) {
          F[i] = 0;
          continue;
        }
        if (edgeMode === "driven" && x === 0) {
          F[i] = 0;
          continue;
        }
        let sum = 0;
        if (x > 0)     sum += z[idx(x - 1, y)] - z[i];
        if (x < N - 1) sum += z[idx(x + 1, y)] - z[i];
        if (y > 0)     sum += z[idx(x, y - 1)] - z[i];
        if (y < N - 1) sum += z[idx(x, y + 1)] - z[i];
        F[i] = k * sum - cDamp * vz[i];
      }
    }

    // symplectic Euler
    const invM = 1 / MASS;
    for (let i = 0; i < COUNT; i++) {
      vz[i] += F[i] * invM * dt;
      z[i] += vz[i] * dt;
      if (z[i] > MAX_Z) { z[i] = MAX_Z; vz[i] = 0; }
      else if (z[i] < -MAX_Z) { z[i] = -MAX_Z; vz[i] = 0; }
    }

    // re-pin clamped boundary
    if (edgeMode === "clamped") {
      for (let x = 0; x < N; x++) {
        z[idx(x, 0)] = 0; vz[idx(x, 0)] = 0;
        z[idx(x, N - 1)] = 0; vz[idx(x, N - 1)] = 0;
      }
      for (let y = 0; y < N; y++) {
        z[idx(0, y)] = 0; vz[idx(0, y)] = 0;
        z[idx(N - 1, y)] = 0; vz[idx(N - 1, y)] = 0;
      }
    }

    // re-apply drag (always wins)
    if (dragIdx >= 0) {
      z[dragIdx] = dragZ;
      vz[dragIdx] = 0;
    }

    simTime += dt;
  }

  // ---------- render ----------
  function render() {
    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.lineWidth = 1;

    // right-neighbour segments
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N - 1; x++) {
        const i1 = idx(x, y);
        const i2 = idx(x + 1, y);
        const z1 = z[i1], z2 = z[i2];
        ctx.beginPath();
        ctx.strokeStyle = colourForZ((z1 + z2) * 0.5);
        ctx.moveTo(projX(x, z1), projY(y, z1));
        ctx.lineTo(projX(x + 1, z2), projY(y, z2));
        ctx.stroke();
      }
    }
    // down-neighbour segments
    for (let y = 0; y < N - 1; y++) {
      for (let x = 0; x < N; x++) {
        const i1 = idx(x, y);
        const i2 = idx(x, y + 1);
        const z1 = z[i1], z2 = z[i2];
        ctx.beginPath();
        ctx.strokeStyle = colourForZ((z1 + z2) * 0.5);
        ctx.moveTo(projX(x, z1), projY(y, z1));
        ctx.lineTo(projX(x, z2), projY(y + 1, z2));
        ctx.stroke();
      }
    }
    // node dots
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = idx(x, y);
        const zv = z[i];
        ctx.beginPath();
        ctx.fillStyle = colourForZ(zv);
        const r = 1.5 + Math.min(1.0, Math.abs(zv) * 0.7);
        ctx.arc(projX(x, zv), projY(y, zv), r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // drag halo
    if (dragIdx >= 0) {
      const dx = dragIdx % N;
      const dy = (dragIdx - dx) / N;
      const zv = z[dragIdx];
      ctx.beginPath();
      ctx.strokeStyle = colourForZ(zv);
      ctx.lineWidth = 1.5;
      ctx.arc(projX(dx, zv), projY(dy, zv), 6.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  // ---------- animation ----------
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let lastFrame = 0;
  function tick(now) {
    if (!lastFrame) lastFrame = now;
    let elapsed = (now - lastFrame) / 1000;
    if (elapsed > 0.05) elapsed = 0.05; // cap after tab-throttle
    lastFrame = now;

    // CFL: dt_max = 0.5 / sqrt(k/m)
    const dtMax = 0.5 / Math.sqrt(k / MASS);
    let target = Math.min(elapsed, 1 / 30);
    if (reducedMotion) target = Math.min(target, 1 / 60);
    const needed = Math.ceil(target / dtMax);
    const substeps = Math.max(4, Math.min(16, needed));
    const dt = target / substeps;
    for (let s = 0; s < substeps; s++) step(dt);

    render();
    requestAnimationFrame(tick);
  }

  // ---------- pointer ----------
  function pickNode(e) {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    let bestIdx = -1;
    let bestD2 = 14 * 14;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = idx(x, y);
        const sx = projX(x, z[i]);
        const sy = projY(y, z[i]);
        const dx = sx - px;
        const dy = sy - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) { bestD2 = d2; bestIdx = i; }
      }
    }
    return { px, py, idx: bestIdx };
  }

  function nodeIsLocked(i) {
    const gx = i % N;
    const gy = (i - gx) / N;
    if (edgeMode === "clamped" && isClampedBoundary(gx, gy)) return true;
    if (edgeMode === "driven" && gx === 0) return true;
    return false;
  }

  function onPointerDown(e) {
    if (dragIdx >= 0) return;
    const hit = pickNode(e);
    if (hit.idx < 0) return;
    if (nodeIsLocked(hit.idx)) return;
    dragIdx = hit.idx;
    dragZ = z[dragIdx];
    pointerAnchorY = hit.py;
    pointerAnchorZ = dragZ;
    pointerStart = { x: hit.px, y: hit.py, t: performance.now() };
    pointerMoved = false;
    activePointerId = e.pointerId;
    canvas.classList.add("is-dragging");
    if (canvas.setPointerCapture) {
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    }
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (dragIdx < 0 || e.pointerId !== activePointerId) return;
    const rect = canvas.getBoundingClientRect();
    const py = e.clientY - rect.top;
    // 1 logical pixel of vertical motion ↦ 1/lift units of z, so the node
    // follows the pointer in screen space.
    const dy = py - pointerAnchorY;
    let nz = pointerAnchorZ - dy / lift;
    if (nz > 2) nz = 2;
    else if (nz < -2) nz = -2;
    dragZ = nz;
    if (pointerStart) {
      const dx = (e.clientX - rect.left) - pointerStart.x;
      const ddy = py - pointerStart.y;
      if (dx * dx + ddy * ddy > 9) pointerMoved = true;
    }
    e.preventDefault();
  }

  function onPointerUp(e) {
    if (dragIdx < 0) return;
    canvas.classList.remove("is-dragging");
    const elapsed = pointerStart ? performance.now() - pointerStart.t : 0;
    if (!pointerMoved && elapsed < 400) {
      // single-click pluck
      z[dragIdx] = pluckStrength;
      vz[dragIdx] = 0;
    } else {
      z[dragIdx] = dragZ;
      vz[dragIdx] = 0;
    }
    if (canvas.releasePointerCapture && activePointerId !== null) {
      try { canvas.releasePointerCapture(activePointerId); } catch (_) {}
    }
    dragIdx = -1;
    pointerStart = null;
    activePointerId = null;
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  // ---------- controls ----------
  function setEdgeMode(mode) {
    edgeMode = mode;
    edgeBtns.forEach((b) => {
      const active = b.dataset.mode === mode;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-checked", active ? "true" : "false");
    });
    // if switching to driven, zero out the held column's velocities so the
    // wave starts cleanly from the sinusoid
    if (mode === "driven") {
      for (let y = 0; y < N; y++) vz[idx(0, y)] = 0;
    }
  }

  kInput.addEventListener("input", () => {
    k = parseFloat(kInput.value);
    kValue.textContent = k.toFixed(0);
  });
  cInput.addEventListener("input", () => {
    cDamp = parseFloat(cInput.value);
    cValue.textContent = cDamp.toFixed(3);
  });
  fInput.addEventListener("input", () => {
    driveFreq = parseFloat(fInput.value);
    fValue.textContent = driveFreq.toFixed(2) + " Hz";
  });
  pInput.addEventListener("input", () => {
    pluckStrength = parseFloat(pInput.value);
    pValue.textContent = pluckStrength.toFixed(2);
  });
  edgeBtns.forEach((b) =>
    b.addEventListener("click", () => setEdgeMode(b.dataset.mode))
  );
  resetBtn.addEventListener("click", () => {
    z.fill(0);
    vz.fill(0);
    F.fill(0);
    simTime = 0;
    dragIdx = -1;
    pointerStart = null;
    activePointerId = null;
    canvas.classList.remove("is-dragging");
  });

  // ---------- init ----------
  sizeCanvas();
  window.addEventListener("resize", sizeCanvas);
  requestAnimationFrame(tick);
})();
