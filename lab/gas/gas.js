// Gas processes — ideal gas with four canonical processes, draggable
// state point on a PV diagram, and a piston-cylinder visualization
// whose molecules speed up and slow down with T.

(() => {
  const TWO_PI = Math.PI * 2;

  // ---------- physics ----------
  const R = 8.314; // J / (mol·K)
  const N_MOL = 1;

  const V_MIN = 0.004; // 4 L in m³
  const V_MAX = 0.06; // 60 L
  const P_MIN = 10e3; // 10 kPa in Pa
  const P_MAX = 600e3; // 600 kPa

  // Initial state
  const P_INIT = 100e3;
  const V_INIT = 0.025;
  const T_INIT = (P_INIT * V_INIT) / (N_MOL * R); // ~300.7 K

  // PV display ranges
  const X_MAX_L = 60;
  const Y_MAX_KPA = 500;

  // Reference isotherms (K)
  const REF_T = [200, 400, 600, 900, 1500];

  // ---------- state ----------
  let P = P_INIT;
  let V = V_INIT;
  let T = T_INIT;
  let gamma = 1.4;
  let currentProcess = "isothermal";
  let trail = [[V, P]];
  let accW = 0;
  let accQ = 0;
  let molecules = [];
  let dragging = false;

  // Animation
  let lastFrame = 0;

  // ---------- DOM ----------
  const pvCanvas = document.getElementById("pv");
  const cylinderCanvas = document.getElementById("cylinder");
  const pDisplay = document.getElementById("pDisplay");
  const vDisplay = document.getElementById("vDisplay");
  const tDisplay = document.getElementById("tDisplay");
  const uDisplay = document.getElementById("uDisplay");
  const wDisplay = document.getElementById("wDisplay");
  const qDisplay = document.getElementById("qDisplay");
  const processName = document.getElementById("processName");

  const processButtons = document.querySelectorAll(
    'button[data-process]'
  );
  const gammaButtons = document.querySelectorAll('button[data-gamma]');
  const resetBtn = document.getElementById("reset");
  const clearTrailBtn = document.getElementById("clearTrail");

  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ---------- canvas sizing ----------
  function sizeCanvas(c) {
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    c.width = Math.round(rect.width * dpr);
    c.height = Math.round(rect.height * dpr);
    c._w = rect.width;
    c._h = rect.height;
    c._dpr = dpr;
  }
  function sizeAll() {
    sizeCanvas(pvCanvas);
    sizeCanvas(cylinderCanvas);
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
      muted: cs.getPropertyValue("--muted").trim() || "#6b6f78",
      rule: cs.getPropertyValue("--rule").trim() || "#d2d5d2",
      accent: cs.getPropertyValue("--accent-warm").trim() || "#2e4cc7",
    };
    cachedAt = now;
    return cachedStyle;
  }

  // ---------- formatters ----------
  function fmtP(P_) {
    return `${(P_ / 1000).toFixed(1)} kPa`;
  }
  function fmtV(V_) {
    return `${(V_ * 1000).toFixed(2)} L`;
  }
  function fmtT(T_) {
    return `${T_.toFixed(0)} K`;
  }
  function fmtJ(j) {
    const a = Math.abs(j);
    if (a >= 1000) return `${(j / 1000).toFixed(2)} kJ`;
    return `${j.toFixed(1)} J`;
  }

  // ---------- PV diagram geometry ----------
  function pvGeom() {
    const w = pvCanvas._w || 600;
    const h = pvCanvas._h || 480;
    const padL = 54;
    const padR = 16;
    const padT = 18;
    const padB = 38;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    return { w, h, padL, padR, padT, padB, plotW, plotH };
  }
  function VtoX(V_) {
    const g = pvGeom();
    return g.padL + ((V_ * 1000) / X_MAX_L) * g.plotW;
  }
  function PtoY(P_) {
    const g = pvGeom();
    return g.h - g.padB - ((P_ / 1000) / Y_MAX_KPA) * g.plotH;
  }
  function XtoV(x) {
    const g = pvGeom();
    return Math.max(
      V_MIN,
      Math.min(V_MAX, ((x - g.padL) / g.plotW) * X_MAX_L * 1e-3)
    );
  }
  function YtoP(y) {
    const g = pvGeom();
    return Math.max(
      P_MIN,
      Math.min(
        P_MAX,
        ((g.h - g.padB - y) / g.plotH) * Y_MAX_KPA * 1000
      )
    );
  }

  // ---------- molecules ----------
  const T_REF = 300;
  const V_REF_PX = 70; // px/s at T_REF
  const NUM_MOL = 50;
  const MOL_R = 2.6;

  function speedFor(T_) {
    return V_REF_PX * Math.sqrt(Math.max(0, T_) / T_REF);
  }

  function cylinderBounds() {
    const w = cylinderCanvas._w || 320;
    const h = cylinderCanvas._h || 200;
    const left = 22;
    const usableW = w - left - 64; // leave room for piston rod on the right
    const pistonX = left + (V / V_MAX) * usableW;
    const top = h * 0.22;
    const bottom = h * 0.78;
    return { left, pistonX, top, bottom, w, h };
  }

  function initMolecules() {
    molecules = [];
    const b = cylinderBounds();
    const v0 = speedFor(T);
    for (let i = 0; i < NUM_MOL; i++) {
      const ang = Math.random() * TWO_PI;
      molecules.push({
        x: b.left + MOL_R + Math.random() * Math.max(1, b.pistonX - b.left - 2 * MOL_R),
        y: b.top + MOL_R + Math.random() * (b.bottom - b.top - 2 * MOL_R),
        vx: v0 * Math.cos(ang),
        vy: v0 * Math.sin(ang),
      });
    }
  }

  function updateMolecules(dt) {
    const b = cylinderBounds();
    for (const m of molecules) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.x < b.left + MOL_R) {
        m.x = b.left + MOL_R;
        if (m.vx < 0) m.vx = -m.vx;
      }
      if (m.x > b.pistonX - MOL_R) {
        m.x = b.pistonX - MOL_R;
        if (m.vx > 0) m.vx = -m.vx;
      }
      if (m.y < b.top + MOL_R) {
        m.y = b.top + MOL_R;
        if (m.vy < 0) m.vy = -m.vy;
      }
      if (m.y > b.bottom - MOL_R) {
        m.y = b.bottom - MOL_R;
        if (m.vy > 0) m.vy = -m.vy;
      }
    }
  }

  // Rescale molecule velocities to match a new T
  function rescaleMoleculesForT(T_old, T_new) {
    if (T_old <= 0 || T_new <= 0) return;
    const scale = Math.sqrt(T_new / T_old);
    for (const m of molecules) {
      m.vx *= scale;
      m.vy *= scale;
    }
  }

  // ---------- physics step (drag-driven) ----------
  function applyDrag(mx, my) {
    const cursorV = XtoV(mx);
    const cursorP = YtoP(my);
    const oldV = V;
    const oldP = P;
    const oldT = T;

    let newV, newP, newT;

    switch (currentProcess) {
      case "isothermal": {
        newV = Math.max(V_MIN, Math.min(V_MAX, cursorV));
        newP = (N_MOL * R * oldT) / newV;
        if (newP > P_MAX) {
          newP = P_MAX;
          newV = (N_MOL * R * oldT) / newP;
        } else if (newP < P_MIN) {
          newP = P_MIN;
          newV = (N_MOL * R * oldT) / newP;
        }
        newT = oldT;
        break;
      }
      case "adiabatic": {
        newV = Math.max(V_MIN, Math.min(V_MAX, cursorV));
        const K = oldP * Math.pow(oldV, gamma);
        newP = K / Math.pow(newV, gamma);
        if (newP > P_MAX) {
          newP = P_MAX;
          newV = Math.pow(K / newP, 1 / gamma);
        } else if (newP < P_MIN) {
          newP = P_MIN;
          newV = Math.pow(K / newP, 1 / gamma);
        }
        newT = (newP * newV) / (N_MOL * R);
        break;
      }
      case "isobaric": {
        newV = Math.max(V_MIN, Math.min(V_MAX, cursorV));
        newP = oldP;
        newT = (newP * newV) / (N_MOL * R);
        break;
      }
      case "isochoric": {
        newV = oldV;
        newP = Math.max(P_MIN, Math.min(P_MAX, cursorP));
        newT = (newP * newV) / (N_MOL * R);
        break;
      }
    }

    // Work and heat for this step (closed form per process)
    let dW = 0;
    switch (currentProcess) {
      case "isothermal":
        if (newV > 0 && oldV > 0)
          dW = N_MOL * R * oldT * Math.log(newV / oldV);
        break;
      case "adiabatic":
        dW = (oldP * oldV - newP * newV) / (gamma - 1);
        break;
      case "isobaric":
        dW = oldP * (newV - oldV);
        break;
      case "isochoric":
        dW = 0;
        break;
    }
    const Cv = R / (gamma - 1);
    const dU = N_MOL * Cv * (newT - oldT);
    const dQ = dU + dW;
    accW += dW;
    accQ += dQ;

    // Rescale molecule velocities for the new temperature
    rescaleMoleculesForT(oldT, newT);

    // Commit
    P = newP;
    V = newV;
    T = newT;

    // Append to trail if moved meaningfully
    appendTrail(V, P);
    updateStats();
  }

  function appendTrail(V_, P_) {
    const last = trail[trail.length - 1];
    if (!last) {
      trail.push([V_, P_]);
      return;
    }
    const dV = (V_ - last[0]) * 1000; // L
    const dP = (P_ - last[1]) / 1000; // kPa
    if (dV * dV + dP * dP > 0.04) {
      trail.push([V_, P_]);
    }
  }

  // ---------- drawing: PV diagram ----------
  function drawPV() {
    if (!pvCanvas._w) return;
    const ctx = pvCanvas.getContext("2d");
    const g = pvGeom();
    ctx.setTransform(pvCanvas._dpr, 0, 0, pvCanvas._dpr, 0, 0);
    ctx.clearRect(0, 0, g.w, g.h);

    const s = styles();

    // Axes
    ctx.strokeStyle = s.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(g.padL, g.h - g.padB);
    ctx.lineTo(g.w - g.padR, g.h - g.padB);
    ctx.moveTo(g.padL, g.padT);
    ctx.lineTo(g.padL, g.h - g.padB);
    ctx.stroke();

    // x ticks (V in L)
    ctx.font =
      '10px ui-monospace, "JetBrains Mono", SFMono-Regular, monospace';
    ctx.fillStyle = s.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let v = 0; v <= X_MAX_L; v += 10) {
      const x = VtoX(v / 1000);
      ctx.beginPath();
      ctx.moveTo(x, g.h - g.padB);
      ctx.lineTo(x, g.h - g.padB + 4);
      ctx.stroke();
      ctx.fillText(`${v}`, x, g.h - g.padB + 6);
    }
    // y ticks (P in kPa)
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let p = 0; p <= Y_MAX_KPA; p += 100) {
      const y = PtoY(p * 1000);
      ctx.beginPath();
      ctx.moveTo(g.padL - 4, y);
      ctx.lineTo(g.padL, y);
      ctx.stroke();
      ctx.fillText(`${p}`, g.padL - 6, y);
    }
    // axis labels
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("V (L)", g.padL + g.plotW / 2, g.h - 10);
    ctx.save();
    ctx.translate(14, g.padT + g.plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("P (kPa)", 0, 0);
    ctx.restore();

    // Reference isotherms (faint)
    ctx.strokeStyle = s.rule;
    ctx.lineWidth = 0.9;
    for (const refT of REF_T) {
      drawIsotherm(ctx, refT);
      // tiny label at the right edge if curve is visible there
      const PatVmax = (N_MOL * R * refT) / V_MAX;
      if (PatVmax >= P_MIN * 0.5 && PatVmax <= P_MAX) {
        const labelX = VtoX(V_MAX) - 6;
        const labelY = PtoY(PatVmax) - 2;
        ctx.fillStyle = s.muted;
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.font =
          '9px ui-monospace, "JetBrains Mono", SFMono-Regular, monospace';
        ctx.fillText(`${refT} K`, labelX, labelY);
      }
    }

    // Active constraint preview through current state
    drawConstraintPreview(ctx, s);

    // Trail
    if (trail.length >= 2) {
      ctx.strokeStyle = s.accent;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i < trail.length; i++) {
        const [tv, tp] = trail[i];
        const x = VtoX(tv);
        const y = PtoY(tp);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // State point
    const sx = VtoX(V);
    const sy = PtoY(P);
    ctx.fillStyle = s.accent;
    ctx.beginPath();
    ctx.arc(sx, sy, 6.5, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = s.bg;
    ctx.beginPath();
    ctx.arc(sx, sy, 2.2, 0, TWO_PI);
    ctx.fill();
  }

  function drawIsotherm(ctx, T_) {
    const K = N_MOL * R * T_; // PV = K
    const steps = 200;
    ctx.beginPath();
    let first = true;
    for (let i = 0; i <= steps; i++) {
      const Lit = (i / steps) * X_MAX_L;
      const V_ = Lit / 1000;
      if (V_ < V_MIN * 0.5) continue;
      const P_ = K / V_;
      if (P_ < P_MIN * 0.2 || P_ > P_MAX * 1.2) {
        if (!first) {
          ctx.stroke();
          ctx.beginPath();
          first = true;
        }
        continue;
      }
      const x = VtoX(V_);
      const y = PtoY(P_);
      if (first) {
        ctx.moveTo(x, y);
        first = false;
      } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function drawConstraintPreview(ctx, s) {
    ctx.save();
    ctx.strokeStyle = s.accent;
    ctx.lineWidth = 1.1;
    ctx.globalAlpha = 0.32;
    ctx.setLineDash([4, 4]);

    if (currentProcess === "isothermal") {
      const K = N_MOL * R * T;
      ctx.beginPath();
      let first = true;
      for (let i = 0; i <= 200; i++) {
        const Lit = (i / 200) * X_MAX_L;
        const V_ = Lit / 1000;
        if (V_ < V_MIN * 0.5) continue;
        const P_ = K / V_;
        if (P_ < P_MIN * 0.5 || P_ > P_MAX * 1.2) {
          if (!first) {
            ctx.stroke();
            ctx.beginPath();
            first = true;
          }
          continue;
        }
        const x = VtoX(V_);
        const y = PtoY(P_);
        if (first) {
          ctx.moveTo(x, y);
          first = false;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else if (currentProcess === "adiabatic") {
      const K = P * Math.pow(V, gamma);
      ctx.beginPath();
      let first = true;
      for (let i = 0; i <= 200; i++) {
        const Lit = (i / 200) * X_MAX_L;
        const V_ = Lit / 1000;
        if (V_ < V_MIN * 0.5) continue;
        const P_ = K / Math.pow(V_, gamma);
        if (P_ < P_MIN * 0.5 || P_ > P_MAX * 1.2) {
          if (!first) {
            ctx.stroke();
            ctx.beginPath();
            first = true;
          }
          continue;
        }
        const x = VtoX(V_);
        const y = PtoY(P_);
        if (first) {
          ctx.moveTo(x, y);
          first = false;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else if (currentProcess === "isobaric") {
      ctx.beginPath();
      ctx.moveTo(VtoX(V_MIN), PtoY(P));
      ctx.lineTo(VtoX(V_MAX), PtoY(P));
      ctx.stroke();
    } else if (currentProcess === "isochoric") {
      ctx.beginPath();
      ctx.moveTo(VtoX(V), PtoY(P_MIN));
      ctx.lineTo(VtoX(V), PtoY(P_MAX));
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- drawing: cylinder ----------
  function drawCylinder() {
    if (!cylinderCanvas._w) return;
    const ctx = cylinderCanvas.getContext("2d");
    const w = cylinderCanvas._w;
    const h = cylinderCanvas._h;
    ctx.setTransform(cylinderCanvas._dpr, 0, 0, cylinderCanvas._dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const s = styles();
    const b = cylinderBounds();

    // Walls (3 sides + interior fill)
    ctx.fillStyle = s.bg;
    ctx.fillRect(b.left, b.top, b.pistonX - b.left, b.bottom - b.top);

    ctx.strokeStyle = s.inkSoft;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(b.pistonX, b.top - 2);
    ctx.lineTo(b.left, b.top - 2);
    ctx.lineTo(b.left, b.bottom + 2);
    ctx.lineTo(b.pistonX, b.bottom + 2);
    ctx.stroke();

    // Molecules
    ctx.fillStyle = s.accent;
    for (const m of molecules) {
      if (m.x < b.left - MOL_R || m.x > b.pistonX + MOL_R) continue;
      ctx.beginPath();
      ctx.arc(m.x, m.y, MOL_R, 0, TWO_PI);
      ctx.fill();
    }

    // Piston (filled rect)
    ctx.fillStyle = s.ink;
    ctx.fillRect(b.pistonX - 3, b.top - 6, 7, b.bottom - b.top + 12);

    // Piston rod
    ctx.strokeStyle = s.ink;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    const midY = (b.top + b.bottom) / 2;
    ctx.beginPath();
    ctx.moveTo(b.pistonX + 3, midY);
    ctx.lineTo(w - 12, midY);
    ctx.stroke();
    ctx.lineCap = "butt";

    // Temperature label
    ctx.font =
      '11px ui-monospace, "JetBrains Mono", SFMono-Regular, monospace';
    ctx.fillStyle = s.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`T = ${T.toFixed(0)} K`, w / 2, h - 12);
  }

  // ---------- stats ----------
  function updateStats() {
    pDisplay.textContent = fmtP(P);
    vDisplay.textContent = fmtV(V);
    tDisplay.textContent = fmtT(T);
    const Cv = R / (gamma - 1);
    const dU = N_MOL * Cv * (T - T_INIT);
    uDisplay.textContent = fmtJ(dU);
    wDisplay.textContent = fmtJ(accW);
    qDisplay.textContent = fmtJ(accQ);
    processName.textContent = currentProcess;
  }

  // ---------- main loop ----------
  function frame(now) {
    if (!lastFrame) lastFrame = now;
    const dt = Math.min((now - lastFrame) / 1000, 1 / 30);
    lastFrame = now;

    updateMolecules(dt);
    drawPV();
    drawCylinder();

    requestAnimationFrame(frame);
  }

  // ---------- mouse + touch ----------
  function eventPos(e) {
    const rect = pvCanvas.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return [point.clientX - rect.left, point.clientY - rect.top];
  }
  function inPlotArea(mx, my) {
    const g = pvGeom();
    return (
      mx >= g.padL - 6 &&
      mx <= g.w - g.padR + 6 &&
      my >= g.padT - 6 &&
      my <= g.h - g.padB + 6
    );
  }
  function onDown(e) {
    const [mx, my] = eventPos(e);
    if (!inPlotArea(mx, my)) return;
    dragging = true;
    pvCanvas.classList.add("dragging");
    applyDrag(mx, my);
    e.preventDefault();
  }
  function onMove(e) {
    if (!dragging) return;
    const [mx, my] = eventPos(e);
    applyDrag(mx, my);
    e.preventDefault();
  }
  function onUp() {
    dragging = false;
    pvCanvas.classList.remove("dragging");
  }
  pvCanvas.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  pvCanvas.addEventListener("touchstart", onDown, { passive: false });
  window.addEventListener("touchmove", onMove, { passive: false });
  window.addEventListener("touchend", onUp);

  // ---------- buttons ----------
  processButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      processButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentProcess = btn.dataset.process;
      updateStats();
    });
  });
  gammaButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      gammaButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      gamma = parseFloat(btn.dataset.gamma);
      updateStats();
    });
  });
  resetBtn.addEventListener("click", () => {
    const oldT = T;
    P = P_INIT;
    V = V_INIT;
    T = T_INIT;
    accW = 0;
    accQ = 0;
    trail = [[V, P]];
    rescaleMoleculesForT(oldT, T);
    initMolecules();
    updateStats();
  });
  clearTrailBtn.addEventListener("click", () => {
    trail = [[V, P]];
  });

  // ---------- boot ----------
  updateStats();
  requestAnimationFrame(() => {
    sizeAll();
    initMolecules();
    requestAnimationFrame(frame);
  });

  let resizeQueued = false;
  window.addEventListener("resize", () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      sizeAll();
      resizeQueued = false;
    });
  });
})();
