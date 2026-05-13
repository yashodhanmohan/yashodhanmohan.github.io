// Lissajous plotter.
//
// Two perpendicular oscillations: x(t) = sin(a·t + φ), y(t) = sin(b·t).
// Render the parametric pair on a square canvas; carry a ring-buffer
// trail of recent points so dragging the phase slider twists the whole
// figure smoothly. Side panel shows the rational-or-not status of a/b
// together with its continued-fraction expansion.

(() => {
  const TWO_PI = Math.PI * 2;
  const DT = 1 / 60; // arbitrary time units per frame
  const MAX_CF_TERMS = 7;
  const ALPHA_BUCKETS = 48; // trail rendered in N buckets so we don't
                            // call stroke() once per segment

  // ---------- state ----------
  let a = 3.0,
    b = 2.0,
    phase = Math.PI / 2;
  let aSnap = false,
    bSnap = false;
  let trailLength = 800;
  let t = 0;
  let points = []; // [{x, y}] in normalised [-1, 1]
  let playing = true;

  // ---------- DOM ----------
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");

  const aInput = document.getElementById("a");
  const bInput = document.getElementById("b");
  const phaseInput = document.getElementById("phase");
  const trailInput = document.getElementById("trail");

  const aSnapInput = document.getElementById("aSnap");
  const bSnapInput = document.getElementById("bSnap");

  const aValue = document.getElementById("aValue");
  const bValue = document.getElementById("bValue");
  const phaseValue = document.getElementById("phaseValue");
  const trailValue = document.getElementById("trailValue");

  const ratioLine = document.getElementById("ratioLine");
  const reducedLine = document.getElementById("reducedLine");
  const cfLine = document.getElementById("cfLine");
  const closeLine = document.getElementById("closeLine");

  const playPauseBtn = document.getElementById("playPause");
  const clearBtn = document.getElementById("clear");

  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Respect reduced-motion preference: start paused so the page is
  // still and usable; user can press play if they want movement.
  const prefersReduce = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  );
  if (prefersReduce.matches) {
    playing = false;
  }

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
    const cs = getComputedStyle(document.documentElement);
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

  // Convert a hex colour (#rrggbb) to "r, g, b" so we can interpolate
  // alpha at draw time without re-parsing every frame.
  function hexToRgbTuple(hex) {
    hex = hex.trim();
    if (hex[0] !== "#") return "0, 0, 0";
    if (hex.length === 4) {
      const r = parseInt(hex[1] + hex[1], 16);
      const g = parseInt(hex[2] + hex[2], 16);
      const b = parseInt(hex[3] + hex[3], 16);
      return `${r}, ${g}, ${b}`;
    }
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r}, ${g}, ${b}`;
  }

  // ---------- math helpers ----------

  // gcd for non-negative integers.
  function gcd(x, y) {
    x = Math.abs(x);
    y = Math.abs(y);
    while (y) {
      const t = y;
      y = x % y;
      x = t;
    }
    return x;
  }

  // Continued-fraction expansion of x to up to MAX_CF_TERMS terms.
  // Stops early if the remainder is effectively zero. We round-up
  // when v is within an epsilon of an integer from below, otherwise
  // IEEE-754 noise drags rationals into a never-terminating tail
  // (e.g. 7/5 → [1; 2, 1, 1] instead of [1; 2, 2]).
  const CF_EPS = 1e-9;
  function continuedFraction(x) {
    const terms = [];
    let terminated = false;
    let v = x;
    for (let i = 0; i < MAX_CF_TERMS; i++) {
      let ai = Math.floor(v);
      // If we're right below the next integer, snap to it.
      if (ai + 1 - v < CF_EPS) ai += 1;
      terms.push(ai);
      const frac = v - ai;
      if (Math.abs(frac) < CF_EPS) {
        terminated = true;
        break;
      }
      v = 1 / frac;
    }
    return { terms, terminated };
  }

  function formatCF(x) {
    if (!isFinite(x)) return "—";
    const { terms, terminated } = continuedFraction(x);
    if (terms.length === 0) return "—";
    const head = terms[0];
    if (terms.length === 1) {
      return terminated ? `[${head}]` : `[${head}; …]`;
    }
    const tail = terms.slice(1).join(", ");
    return terminated ? `[${head}; ${tail}]` : `[${head}; ${tail}, …]`;
  }

  // ---------- sim ----------

  function applySnap(value, snap) {
    if (!snap) return value;
    return Math.round(value);
  }

  function recompute() {
    // Update readouts based on current a, b, phase.
    aValue.textContent = a.toFixed(3);
    bValue.textContent = b.toFixed(3);
    phaseValue.textContent = phase.toFixed(2);
    trailValue.textContent = `${trailLength} pts`;

    ratioLine.textContent = `${a.toFixed(3)} : ${b.toFixed(3)}`;

    // Both within 0.005 of integers? Treat as rational.
    const ai = Math.round(a);
    const bi = Math.round(b);
    const rational =
      Math.abs(a - ai) < 0.005 && Math.abs(b - bi) < 0.005 && ai > 0 && bi > 0;

    if (rational) {
      const g = gcd(ai, bi);
      const p = ai / g;
      const q = bi / g;
      reducedLine.textContent = `${p}/${q}`;
      reducedLine.classList.remove("muted");
      // Curve closes after q periods of x and p periods of y.
      closeLine.textContent = `${q} x-period${q === 1 ? "" : "s"}, ${p} y-period${p === 1 ? "" : "s"}`;
      closeLine.classList.remove("muted");
    } else {
      reducedLine.textContent = "irrational";
      reducedLine.classList.add("muted");
      closeLine.textContent = "never (dense orbit)";
      closeLine.classList.add("muted");
    }

    cfLine.textContent = formatCF(a / b);
  }

  function step() {
    if (!playing) return;
    t += DT;
    const x = Math.sin(a * t + phase);
    const y = Math.sin(b * t);
    points.push({ x, y });
    while (points.length > trailLength) points.shift();
  }

  // ---------- render ----------
  function render() {
    const w = canvas._w;
    const h = canvas._h;
    const dpr = canvas._dpr || 1;
    if (!w || !h) return;
    const s = styles();

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear with background.
    ctx.fillStyle = s.bg;
    ctx.fillRect(0, 0, w, h);

    // Bounding square + cross-hair axes. The drawing square is a
    // centred inset so the figure has breathing room.
    const pad = Math.min(w, h) * 0.06;
    const side = Math.min(w, h) - pad * 2;
    const cx = w / 2;
    const cy = h / 2;
    const half = side / 2;

    ctx.lineWidth = 1;
    ctx.strokeStyle = s.rule;
    ctx.strokeRect(cx - half, cy - half, side, side);

    // Faint axes through the centre.
    ctx.beginPath();
    ctx.moveTo(cx - half, cy);
    ctx.lineTo(cx + half, cy);
    ctx.moveTo(cx, cy - half);
    ctx.lineTo(cx, cy + half);
    ctx.strokeStyle = s.rule;
    ctx.globalAlpha = 0.45;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Trail. Convert normalised [-1, 1] → canvas pixel coords. Older
    // points fade out; we batch by alpha bucket so we stroke at most
    // ALPHA_BUCKETS times per frame regardless of trail length.
    const n = points.length;
    if (n >= 2) {
      const accentRgb = hexToRgbTuple(s.accent);
      ctx.lineWidth = 1.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const toPx = (p) => ({
        x: cx + p.x * half,
        y: cy - p.y * half, // flip y so +y is up
      });

      for (let bucket = 0; bucket < ALPHA_BUCKETS; bucket++) {
        const startIdx = Math.floor((bucket * (n - 1)) / ALPHA_BUCKETS);
        const endIdx = Math.floor(((bucket + 1) * (n - 1)) / ALPHA_BUCKETS);
        if (endIdx <= startIdx) continue;

        // Alpha ramps from ~0 (oldest) to ~1 (newest). Square it to
        // bias visibility toward the head — the trail looks like a
        // streak with the active point at the bright end.
        const t01 = (bucket + 1) / ALPHA_BUCKETS;
        const alpha = Math.max(0.04, Math.pow(t01, 1.6));
        ctx.strokeStyle = `rgba(${accentRgb}, ${alpha.toFixed(3)})`;

        ctx.beginPath();
        const first = toPx(points[startIdx]);
        ctx.moveTo(first.x, first.y);
        for (let i = startIdx + 1; i <= endIdx; i++) {
          const p = toPx(points[i]);
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }

      // Head dot — the "pen tip". Drawn in ink so it pops against
      // the warm trail without re-using the same hue.
      const head = toPx(points[n - 1]);
      ctx.fillStyle = s.ink;
      ctx.beginPath();
      ctx.arc(head.x, head.y, 3, 0, TWO_PI);
      ctx.fill();
    }

    ctx.restore();
  }

  // ---------- main loop ----------
  let rafId = 0;
  function loop() {
    step();
    render();
    rafId = requestAnimationFrame(loop);
  }

  // ---------- wiring ----------

  function handleSliderInput() {
    const rawA = parseFloat(aInput.value);
    const rawB = parseFloat(bInput.value);
    a = applySnap(rawA, aSnap);
    b = applySnap(rawB, bSnap);
    phase = parseFloat(phaseInput.value);
    const newTrail = parseInt(trailInput.value, 10);
    if (newTrail !== trailLength) {
      trailLength = newTrail;
      // Drop overflow immediately so the visual length matches.
      while (points.length > trailLength) points.shift();
    }
    recompute();
  }

  [aInput, bInput, phaseInput, trailInput].forEach((el) =>
    el.addEventListener("input", handleSliderInput)
  );

  aSnapInput.addEventListener("change", () => {
    aSnap = aSnapInput.checked;
    if (aSnap) {
      a = Math.round(a);
      aInput.value = a;
    }
    recompute();
  });
  bSnapInput.addEventListener("change", () => {
    bSnap = bSnapInput.checked;
    if (bSnap) {
      b = Math.round(b);
      bInput.value = b;
    }
    recompute();
  });

  function setPlaying(p) {
    playing = p;
    playPauseBtn.textContent = playing ? "pause" : "play";
  }
  playPauseBtn.addEventListener("click", () => setPlaying(!playing));
  clearBtn.addEventListener("click", () => {
    points = [];
  });

  // Resize handling — keep canvas crisp on DPR/viewport changes.
  const resize = () => {
    sizeCanvas();
    render();
  };
  window.addEventListener("resize", resize, { passive: true });
  if (window.ResizeObserver) {
    new ResizeObserver(() => {
      sizeCanvas();
    }).observe(canvas);
  }

  // Re-pull CSS variables when the colour scheme flips (light/dark).
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const refresh = () => {
      cachedStyle = null;
    };
    if (mq.addEventListener) mq.addEventListener("change", refresh);
    else if (mq.addListener) mq.addListener(refresh);
  }

  // ---------- boot ----------
  sizeCanvas();
  recompute();
  setPlaying(playing); // sets button label
  loop();
})();
