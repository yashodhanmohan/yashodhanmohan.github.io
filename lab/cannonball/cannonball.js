// Newton's cannonball.
//
// Inverse-square gravity, velocity-Verlet integration, units chosen so
// GM = 1 and R_earth = 1 — which makes v_circ = 1 and v_esc = √2.
// Each shot keeps its own trail; trail style encodes the trajectory type.

(() => {
  const TWO_PI = Math.PI * 2;
  const GM = 1;
  const R_EARTH = 1;
  const V_CIRC = 1; // sqrt(GM / R_EARTH)
  const V_ESC = Math.SQRT2;

  // Physics integrator
  const PHYSICS_DT = 0.004; // sim seconds per substep
  const SUBSTEPS_PER_FRAME = 5;

  // View
  const VIEW_RANGE_R = 5; // half-width of viewport in R units at zoom = 1

  // Termination
  const ESCAPE_R = 22; // shot is "escaped" once it passes this radius
  const TRAIL_MAX_POINTS = 6000;
  const TRAIL_MIN_STEP_SQ = 0.00025; // physics units²

  // ---------- state ----------
  let cannonAngle = Math.PI / 2; // top of Earth
  let speed = 0.7; // in v_circ units (== absolute since v_circ = 1)
  let launchAngleDeg = 0;
  let zoom = 1;
  let playing = true;
  let shots = [];
  let lastFrame = 0;

  // ---------- DOM ----------
  const canvas = document.getElementById("board");
  const speedInput = document.getElementById("speed");
  const angleInput = document.getElementById("angle");
  const cannonInput = document.getElementById("cannonPos");
  const zoomInput = document.getElementById("zoom");
  const speedValueEl = document.getElementById("speedValue");
  const angleValueEl = document.getElementById("angleValue");
  const cannonValueEl = document.getElementById("cannonValue");
  const zoomValueEl = document.getElementById("zoomValue");
  const fireBtn = document.getElementById("fire");
  const clearBtn = document.getElementById("clear");
  const pausePlayBtn = document.getElementById("pausePlay");
  const speedDisplay = document.getElementById("speedDisplay");
  const speedSubEl = document.getElementById("speedSub");
  const trajTypeEl = document.getElementById("trajType");
  const apogeeEl = document.getElementById("apogee");
  const perigeeEl = document.getElementById("perigee");
  const eccentricityEl = document.getElementById("eccentricity");
  const periodEl = document.getElementById("period");
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

  // ---------- coords ----------
  function pxPerR() {
    if (!canvas._w) return 1;
    return (Math.min(canvas._w, canvas._h) / 2 / VIEW_RANGE_R) * zoom;
  }
  function toCanvas(x, y) {
    const s = pxPerR();
    return [canvas._w / 2 + x * s, canvas._h / 2 - y * s];
  }

  // ---------- orbital elements ----------
  function computeElements(x, y, vx, vy) {
    const r = Math.hypot(x, y);
    const v2 = vx * vx + vy * vy;
    const v = Math.sqrt(v2);
    const energy = v2 / 2 - GM / r;
    const h = x * vy - y * vx; // angular momentum (signed)
    const absH = Math.abs(h);

    let type, a, e, apogee, perigee, period;

    if (energy < -1e-7) {
      // bound
      a = -GM / (2 * energy);
      const inside = 1 + (2 * energy * absH * absH) / (GM * GM);
      e = Math.sqrt(Math.max(0, inside));
      apogee = a * (1 + e);
      perigee = a * (1 - e);
      period = TWO_PI * Math.sqrt((a * a * a) / GM);
      if (perigee < R_EARTH) type = "sub-orbital";
      else if (e < 0.005) type = "circular";
      else type = "elliptical";
    } else if (energy > 1e-7) {
      // hyperbolic
      a = -GM / (2 * energy); // negative
      e = Math.sqrt(1 + (2 * energy * absH * absH) / (GM * GM));
      apogee = Infinity;
      perigee = Math.abs(a) * (e - 1);
      period = Infinity;
      type = "hyperbolic";
    } else {
      // parabolic edge case
      a = Infinity;
      e = 1;
      apogee = Infinity;
      perigee = (absH * absH) / (2 * GM);
      period = Infinity;
      type = "parabolic";
    }

    return { type, energy, a, e, apogee, perigee, period, v0: v };
  }

  // ---------- fire ----------
  function fire() {
    const launchRad = (launchAngleDeg * Math.PI) / 180;
    const r0 = R_EARTH + 0.005;
    const x = r0 * Math.cos(cannonAngle);
    const y = r0 * Math.sin(cannonAngle);
    // CCW tangent and outward radial unit vectors
    const tx = -Math.sin(cannonAngle);
    const ty = Math.cos(cannonAngle);
    const rx = Math.cos(cannonAngle);
    const ry = Math.sin(cannonAngle);
    const vT = speed * Math.cos(launchRad);
    const vR = speed * Math.sin(launchRad);
    const vx = vT * tx + vR * rx;
    const vy = vT * ty + vR * ry;

    const elements = computeElements(x, y, vx, vy);
    const shot = {
      x,
      y,
      vx,
      vy,
      ...elements,
      trail: [[x, y]],
      dead: false,
      crashed: false,
      escaped: false,
    };
    shots.push(shot);
    updateLastShotStats(shot);
  }

  // ---------- physics step ----------
  function stepShot(shot, dt) {
    if (shot.dead) return;

    const x = shot.x;
    const y = shot.y;
    const r = Math.hypot(x, y);
    const r3 = r * r * r;
    const ax = (-GM * x) / r3;
    const ay = (-GM * y) / r3;

    const vxh = shot.vx + 0.5 * ax * dt;
    const vyh = shot.vy + 0.5 * ay * dt;

    const nx = x + vxh * dt;
    const ny = y + vyh * dt;
    const nr = Math.hypot(nx, ny);

    const nr3 = nr * nr * nr;
    const nax = (-GM * nx) / nr3;
    const nay = (-GM * ny) / nr3;

    shot.x = nx;
    shot.y = ny;
    shot.vx = vxh + 0.5 * nax * dt;
    shot.vy = vyh + 0.5 * nay * dt;

    if (nr <= R_EARTH) {
      // Snap to surface along the radial direction.
      const norm = R_EARTH / nr;
      shot.x = nx * norm;
      shot.y = ny * norm;
      shot.dead = true;
      shot.crashed = true;
    } else if (nr > ESCAPE_R) {
      shot.dead = true;
      shot.escaped = true;
    }
  }

  function appendTrail(shot) {
    const trail = shot.trail;
    const last = trail[trail.length - 1];
    const dx = shot.x - last[0];
    const dy = shot.y - last[1];
    if (dx * dx + dy * dy > TRAIL_MIN_STEP_SQ || shot.dead) {
      trail.push([shot.x, shot.y]);
      if (trail.length > TRAIL_MAX_POINTS) trail.shift();
    }
  }

  function step(dt) {
    const subDt = Math.min(PHYSICS_DT, dt / SUBSTEPS_PER_FRAME);
    const subs = Math.max(1, Math.round(dt / subDt));
    for (let i = 0; i < subs; i++) {
      for (const s of shots) stepShot(s, subDt);
    }
    for (const s of shots) appendTrail(s);
  }

  // ---------- render ----------
  function render() {
    if (!canvas._w) return;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(canvas._dpr, 0, 0, canvas._dpr, 0, 0);
    ctx.clearRect(0, 0, canvas._w, canvas._h);

    const s = styles();

    // Earth
    const [cx, cy] = toCanvas(0, 0);
    const earthPx = R_EARTH * pxPerR();

    // Soft atmospheric ring
    ctx.strokeStyle = s.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, earthPx + 5, 0, TWO_PI);
    ctx.stroke();

    // Earth body with a subtle radial shading
    const grad = ctx.createRadialGradient(
      cx - earthPx * 0.35,
      cy - earthPx * 0.35,
      earthPx * 0.1,
      cx,
      cy,
      earthPx
    );
    grad.addColorStop(0, s.inkSoft);
    grad.addColorStop(1, s.ink);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, earthPx, 0, TWO_PI);
    ctx.fill();

    // Trails (older shots first so newer overdraw)
    for (const shot of shots) drawTrail(ctx, shot, s);

    // Cannon (current pose)
    drawCannon(ctx, s);

    // Active balls + crash markers
    for (const shot of shots) {
      if (!shot.dead) {
        const [px, py] = toCanvas(shot.x, shot.y);
        ctx.fillStyle = s.accent;
        ctx.beginPath();
        ctx.arc(px, py, 3.5, 0, TWO_PI);
        ctx.fill();
      } else if (shot.crashed) {
        const [px, py] = toCanvas(shot.x, shot.y);
        ctx.fillStyle = s.muted;
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, TWO_PI);
        ctx.fill();
      }
    }
  }

  function drawTrail(ctx, shot, s) {
    if (shot.trail.length < 2) return;
    let strokeStyle = s.accent;
    let lineWidth = 1.4;
    let dash = [];
    let alpha = 1;

    if (shot.type === "sub-orbital") {
      strokeStyle = s.muted;
      alpha = 0.85;
      lineWidth = 1.2;
    } else if (shot.type === "circular" || shot.type === "elliptical") {
      strokeStyle = s.accent;
      lineWidth = 1.6;
    } else {
      // hyperbolic / parabolic
      strokeStyle = s.accent;
      lineWidth = 1.4;
      dash = [5, 4];
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(dash);
    ctx.beginPath();
    for (let i = 0; i < shot.trail.length; i++) {
      const [px, py] = toCanvas(shot.trail[i][0], shot.trail[i][1]);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawCannon(ctx, s) {
    const baseX = R_EARTH * Math.cos(cannonAngle);
    const baseY = R_EARTH * Math.sin(cannonAngle);
    const [bpx, bpy] = toCanvas(baseX, baseY);

    const launchRad = (launchAngleDeg * Math.PI) / 180;
    const tx = -Math.sin(cannonAngle);
    const ty = Math.cos(cannonAngle);
    const rx = Math.cos(cannonAngle);
    const ry = Math.sin(cannonAngle);
    const dirX = Math.cos(launchRad) * tx + Math.sin(launchRad) * rx;
    const dirY = Math.cos(launchRad) * ty + Math.sin(launchRad) * ry;

    const barrelLen = 14 + speed * 12;
    // Canvas Y is flipped relative to physics Y.
    const tipPx = bpx + dirX * barrelLen;
    const tipPy = bpy - dirY * barrelLen;

    ctx.strokeStyle = s.accent;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(bpx, bpy);
    ctx.lineTo(tipPx, tipPy);
    ctx.stroke();
    ctx.lineCap = "butt";

    // Small base dot to anchor it on the surface.
    ctx.fillStyle = s.accent;
    ctx.beginPath();
    ctx.arc(bpx, bpy, 2.5, 0, TWO_PI);
    ctx.fill();
  }

  // ---------- stats display ----------
  function updateLastShotStats(shot) {
    speedDisplay.textContent = shot.v0.toFixed(2);
    speedSubEl.innerHTML =
      `${(shot.v0 / V_CIRC).toFixed(2)} v<sub>c</sub> · ` +
      `${(shot.v0 / V_ESC).toFixed(2)} v<sub>e</sub>`;
    trajTypeEl.textContent = shot.type;
    apogeeEl.textContent = Number.isFinite(shot.apogee)
      ? `${shot.apogee.toFixed(2)} R`
      : "∞";
    perigeeEl.textContent = `${shot.perigee.toFixed(2)} R`;
    eccentricityEl.textContent = shot.e.toFixed(3);
    periodEl.textContent = Number.isFinite(shot.period)
      ? `${shot.period.toFixed(2)} t`
      : "—";
  }

  function clearStats() {
    speedDisplay.textContent = "—";
    speedSubEl.textContent = "—";
    trajTypeEl.textContent = "—";
    apogeeEl.textContent = "—";
    perigeeEl.textContent = "—";
    eccentricityEl.textContent = "—";
    periodEl.textContent = "—";
  }

  // ---------- main loop ----------
  function frame(now) {
    if (!lastFrame) lastFrame = now;
    const dt = Math.min((now - lastFrame) / 1000, 1 / 30);
    lastFrame = now;
    if (playing) step(dt);
    render();
    requestAnimationFrame(frame);
  }

  // ---------- control wiring ----------
  function refreshSpeedLabel() {
    speedValueEl.innerHTML = `${(speed / V_CIRC).toFixed(2)} v<sub>c</sub>`;
  }
  function refreshAngleLabel() {
    angleValueEl.textContent = `${launchAngleDeg}°`;
  }
  function refreshCannonLabel() {
    cannonValueEl.textContent = `${Math.round(
      ((cannonAngle * 180) / Math.PI + 360) % 360
    )}°`;
  }
  function refreshZoomLabel() {
    zoomValueEl.textContent = `${zoom.toFixed(2)}×`;
  }

  speedInput.addEventListener("input", (e) => {
    speed = +e.target.value;
    refreshSpeedLabel();
  });
  angleInput.addEventListener("input", (e) => {
    launchAngleDeg = +e.target.value;
    refreshAngleLabel();
  });
  cannonInput.addEventListener("input", (e) => {
    cannonAngle = (+e.target.value * Math.PI) / 180;
    refreshCannonLabel();
  });
  zoomInput.addEventListener("input", (e) => {
    zoom = +e.target.value;
    refreshZoomLabel();
  });

  fireBtn.addEventListener("click", fire);
  clearBtn.addEventListener("click", () => {
    shots = [];
    clearStats();
  });
  pausePlayBtn.addEventListener("click", () => {
    playing = !playing;
    pausePlayBtn.textContent = playing ? "pause" : "play";
    if (playing) lastFrame = 0;
  });

  // ---------- boot ----------
  refreshSpeedLabel();
  refreshAngleLabel();
  refreshCannonLabel();
  refreshZoomLabel();

  requestAnimationFrame(() => {
    sizeCanvas(canvas);
    requestAnimationFrame(frame);
  });

  let resizeQueued = false;
  window.addEventListener("resize", () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      sizeCanvas(canvas);
      resizeQueued = false;
    });
  });
})();
