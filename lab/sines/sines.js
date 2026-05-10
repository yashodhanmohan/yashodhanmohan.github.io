// Sine combinator. Plain canvas + DOM, no build step.
// Each source: { amplitude (0..2), frequency (Hz, 0.1..8), phase (0..2π) }

(() => {
  const TWO_PI = Math.PI * 2;
  const T_WINDOW = 4; // seconds shown across each waveform
  const N = 4; // number of source oscillators

  // Mutable state.
  const sources = Array.from({ length: N }, (_, i) => ({
    amplitude: i === 0 ? 1 : 0,
    frequency: i + 1,
    phase: 0,
  }));

  let t = 0;
  let lastFrame = 0;
  let playing = true;

  // Presets — frequencies remain editable continuously after applying.
  const presets = {
    sine: [
      { amplitude: 1, frequency: 1, phase: 0 },
      { amplitude: 0, frequency: 2, phase: 0 },
      { amplitude: 0, frequency: 3, phase: 0 },
      { amplitude: 0, frequency: 4, phase: 0 },
    ],
    square: [
      { amplitude: 4 / Math.PI, frequency: 1, phase: 0 },
      { amplitude: 4 / (3 * Math.PI), frequency: 3, phase: 0 },
      { amplitude: 4 / (5 * Math.PI), frequency: 5, phase: 0 },
      { amplitude: 4 / (7 * Math.PI), frequency: 7, phase: 0 },
    ],
    sawtooth: [
      { amplitude: 2 / Math.PI, frequency: 1, phase: 0 },
      { amplitude: 2 / (2 * Math.PI), frequency: 2, phase: Math.PI },
      { amplitude: 2 / (3 * Math.PI), frequency: 3, phase: 0 },
      { amplitude: 2 / (4 * Math.PI), frequency: 4, phase: Math.PI },
    ],
    triangle: [
      { amplitude: 8 / Math.PI ** 2, frequency: 1, phase: 0 },
      { amplitude: 8 / (Math.PI ** 2 * 9), frequency: 3, phase: Math.PI },
      { amplitude: 8 / (Math.PI ** 2 * 25), frequency: 5, phase: 0 },
      { amplitude: 8 / (Math.PI ** 2 * 49), frequency: 7, phase: Math.PI },
    ],
    reset: [
      { amplitude: 1, frequency: 1, phase: 0 },
      { amplitude: 0, frequency: 2, phase: 0 },
      { amplitude: 0, frequency: 3, phase: 0 },
      { amplitude: 0, frequency: 4, phase: 0 },
    ],
  };

  // DOM.
  const rowsEl = document.getElementById("rows");
  const compositeCanvas = document.getElementById("composite");
  const playPauseBtn = document.getElementById("playPause");
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ------- build rows -------

  function buildRows() {
    sources.forEach((src, i) => {
      const row = document.createElement("div");
      row.className = "row";
      row.dataset.index = i;

      const circle = document.createElement("canvas");
      circle.className = "circle-canvas";
      circle.setAttribute("aria-hidden", "true");
      row.appendChild(circle);

      const wave = document.createElement("canvas");
      wave.className = "wave-canvas";
      wave.setAttribute(
        "aria-label",
        `Waveform of source ${i + 1}`
      );
      row.appendChild(wave);

      const ctrls = document.createElement("div");
      ctrls.className = "row-controls";
      ctrls.innerHTML = `
        <label class="row-control">
          <span class="label-row">
            <span>amplitude</span><span class="value" data-display="amplitude"></span>
          </span>
          <input type="range" data-param="amplitude" min="0" max="2" step="0.01" />
        </label>
        <label class="row-control">
          <span class="label-row">
            <span>frequency</span><span class="value" data-display="frequency"></span>
          </span>
          <input type="range" data-param="frequency" min="0.1" max="8" step="0.01" />
        </label>
        <label class="row-control">
          <span class="label-row">
            <span>phase</span><span class="value" data-display="phase"></span>
          </span>
          <input type="range" data-param="phase" min="0" max="${TWO_PI.toFixed(4)}" step="0.01" />
        </label>
      `;
      row.appendChild(ctrls);
      rowsEl.appendChild(row);

      ctrls.querySelectorAll('input[type="range"]').forEach((input) => {
        const param = input.dataset.param;
        input.value = src[param];
        input.addEventListener("input", (e) => {
          sources[i][param] = parseFloat(e.target.value);
          updateValueDisplays(row, sources[i]);
          clearActivePreset();
        });
      });

      updateValueDisplays(row, src);
    });
  }

  function updateValueDisplays(row, src) {
    const setDisplay = (param, text) => {
      const el = row.querySelector(`[data-display="${param}"]`);
      if (el) el.textContent = text;
    };
    setDisplay("amplitude", src.amplitude.toFixed(2));
    setDisplay("frequency", src.frequency.toFixed(2) + " Hz");
    setDisplay("phase", (src.phase / Math.PI).toFixed(2) + "π");
  }

  function syncControls() {
    rowsEl.querySelectorAll(".row").forEach((row, i) => {
      const src = sources[i];
      row.querySelectorAll('input[type="range"]').forEach((input) => {
        input.value = src[input.dataset.param];
      });
      updateValueDisplays(row, src);
    });
  }

  // ------- canvas sizing -------

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

  function sizeAllCanvases() {
    document
      .querySelectorAll(".circle-canvas, .wave-canvas")
      .forEach(sizeCanvas);
  }

  // ------- styling helpers -------

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
    };
    cachedAt = now;
    return cachedStyle;
  }

  // ------- drawing -------

  function drawCircle(canvas, src) {
    if (!canvas._w) return;
    const dpr = canvas._dpr;
    const ctx = canvas.getContext("2d");
    const w = canvas._w;
    const h = canvas._h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.min(w, h) / 2 - 6;
    const radius = (Math.min(src.amplitude, 2) / 2) * maxR;
    const s = styles();

    // axes
    ctx.strokeStyle = s.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(w, cy);
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, h);
    ctx.stroke();

    if (radius < 0.5) return;

    // outline
    ctx.strokeStyle = s.inkSoft;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TWO_PI);
    ctx.stroke();

    // dot
    const angle = TWO_PI * src.frequency * t + src.phase;
    const dx = cx + Math.cos(angle) * radius;
    const dy = cy - Math.sin(angle) * radius;

    ctx.strokeStyle = s.accent;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(dx, dy);
    ctx.stroke();

    ctx.fillStyle = s.accent;
    ctx.beginPath();
    ctx.arc(dx, dy, 3.5, 0, TWO_PI);
    ctx.fill();
  }

  function drawWave(canvas, srcs, isComposite) {
    if (!canvas._w) return;
    const dpr = canvas._dpr;
    const ctx = canvas.getContext("2d");
    const w = canvas._w;
    const h = canvas._h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const cy = h / 2;
    const halfH = h / 2 - 8;
    const ampScale = isComposite ? halfH * 0.3 : halfH * 0.5;
    const s = styles();

    // zero axis
    ctx.strokeStyle = s.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(w, cy);
    ctx.stroke();

    // waveform — right edge = now, left edge = (now - T_WINDOW)
    ctx.strokeStyle = isComposite ? s.accent : s.inkSoft;
    ctx.lineWidth = isComposite ? 1.6 : 1.1;
    ctx.beginPath();
    const denom = w - 1;
    for (let x = 0; x < w; x++) {
      const tp = t - ((denom - x) / denom) * T_WINDOW;
      let y = 0;
      for (const src of srcs) {
        y += src.amplitude * Math.sin(TWO_PI * src.frequency * tp + src.phase);
      }
      const py = cy - y * ampScale;
      if (x === 0) ctx.moveTo(x, py);
      else ctx.lineTo(x, py);
    }
    ctx.stroke();

    // current value dot at right edge
    let yNow = 0;
    for (const src of srcs) {
      yNow += src.amplitude * Math.sin(TWO_PI * src.frequency * t + src.phase);
    }
    const dy = cy - yNow * ampScale;
    ctx.fillStyle = s.accent;
    ctx.beginPath();
    ctx.arc(w - 1.5, dy, 3, 0, TWO_PI);
    ctx.fill();
  }

  // ------- main loop -------

  function frame(now) {
    if (!lastFrame) lastFrame = now;
    const dt = Math.min((now - lastFrame) / 1000, 0.1); // clamp big jumps (tab focus)
    lastFrame = now;
    if (playing) t += dt;

    rowsEl.querySelectorAll(".row").forEach((row, i) => {
      const src = sources[i];
      const [circle, wave] = row.querySelectorAll("canvas");
      drawCircle(circle, src);
      drawWave(wave, [src], false);
    });
    drawWave(compositeCanvas, sources, true);

    requestAnimationFrame(frame);
  }

  // ------- presets / actions -------

  function applyPreset(name) {
    const preset = presets[name];
    if (!preset) return;
    preset.forEach((p, i) => {
      sources[i] = { ...p };
    });
    syncControls();

    document
      .querySelectorAll('.combinator-controls button[data-preset]')
      .forEach((b) => b.classList.remove("active"));
    if (name !== "reset") {
      const btn = document.querySelector(
        `.combinator-controls button[data-preset="${name}"]`
      );
      if (btn) btn.classList.add("active");
    }
  }

  function clearActivePreset() {
    document
      .querySelectorAll('.combinator-controls button[data-preset]')
      .forEach((b) => b.classList.remove("active"));
  }

  document
    .querySelectorAll(".combinator-controls button[data-preset]")
    .forEach((btn) => {
      btn.addEventListener("click", () => applyPreset(btn.dataset.preset));
    });

  playPauseBtn.addEventListener("click", () => {
    playing = !playing;
    playPauseBtn.textContent = playing ? "pause" : "play";
  });

  // ------- boot -------

  buildRows();
  applyPreset("sine");

  // Wait for fonts/layout before sizing canvases.
  requestAnimationFrame(() => {
    sizeAllCanvases();
    requestAnimationFrame(frame);
  });

  let resizeQueued = false;
  window.addEventListener("resize", () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      sizeAllCanvases();
      resizeQueued = false;
    });
  });
})();
