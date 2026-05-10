// Sine combinator. Plain canvas + DOM, no build step.
// Each source: { amplitude (0..2), frequency (Hz, 0.1..8), phase (0..2π) }

(() => {
  const TWO_PI = Math.PI * 2;
  const T_WINDOW = 4; // seconds shown across each waveform
  const MAX_SOURCES = 8;

  // Mutable state — populated by applyPreset('sine') at boot.
  const sources = [];

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
  const compositeStackCanvas = document.getElementById("compositeStack");
  const spectrumCanvas = document.getElementById("spectrum");
  const playPauseBtn = document.getElementById("playPause");
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ------- build rows -------

  function rebuildRows() {
    rowsEl.innerHTML = "";

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
      wave.setAttribute("aria-label", `Waveform of source ${i + 1}`);
      row.appendChild(wave);

      const remove = document.createElement("button");
      remove.className = "row-remove";
      remove.type = "button";
      remove.setAttribute("aria-label", `Remove source ${i + 1}`);
      remove.textContent = "×";
      remove.disabled = sources.length <= 1;
      remove.addEventListener("click", () => removeSource(i));
      row.appendChild(remove);

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

    if (sources.length < MAX_SOURCES) {
      const add = document.createElement("button");
      add.className = "add-source";
      add.type = "button";
      add.textContent = `+ add sine  (${sources.length}/${MAX_SOURCES})`;
      add.addEventListener("click", addSource);
      rowsEl.appendChild(add);
    }
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

  function addSource() {
    if (sources.length >= MAX_SOURCES) return;
    const last = sources[sources.length - 1];
    const nextF = last ? Math.min(8, +(last.frequency + 1).toFixed(2)) : 1;
    sources.push({ amplitude: 0, frequency: nextF, phase: 0 });
    rebuildRows();
    clearActivePreset();
    requestAnimationFrame(sizeAllCanvases);
  }

  function removeSource(i) {
    if (sources.length <= 1) return;
    sources.splice(i, 1);
    rebuildRows();
    clearActivePreset();
    requestAnimationFrame(sizeAllCanvases);
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
      .querySelectorAll(".circle-canvas, .wave-canvas, .spectrum-canvas")
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

  // ------- composite phasor stack -------

  function drawCompositeStack(canvas, srcs) {
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
    const s = styles();

    // crosshair axes
    ctx.strokeStyle = s.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(w, cy);
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, h);
    ctx.stroke();

    // pick a scale that keeps the chain inside the canvas at any time —
    // worst case is total amplitude all in one direction.
    const totalAmp = srcs.reduce((sum, s2) => sum + Math.abs(s2.amplitude), 0);
    if (totalAmp < 0.001) return;
    const scale = (maxR * 0.92) / totalAmp;

    let x = cx;
    let y = cy;
    for (const src of srcs) {
      if (src.amplitude < 0.001) continue;
      const r = src.amplitude * scale;
      const angle = TWO_PI * src.frequency * t + src.phase;
      const nx = x + Math.cos(angle) * r;
      const ny = y - Math.sin(angle) * r;

      // faint ring
      ctx.strokeStyle = s.rule;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TWO_PI);
      ctx.stroke();

      // arm
      ctx.strokeStyle = s.inkSoft;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(nx, ny);
      ctx.stroke();

      // tiny joint dot
      ctx.fillStyle = s.inkSoft;
      ctx.beginPath();
      ctx.arc(x, y, 1.4, 0, TWO_PI);
      ctx.fill();

      x = nx;
      y = ny;
    }

    // final endpoint
    ctx.fillStyle = s.accent;
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, TWO_PI);
    ctx.fill();
  }

  // ------- spectrum -------

  const SPECTRUM_F_MAX = 8;
  const SPECTRUM_A_MAX = 2;
  const SPECTRUM_FONT =
    '10px ui-monospace, "JetBrains Mono", SFMono-Regular, Menlo, monospace';

  function drawSpectrum(canvas, srcs) {
    if (!canvas._w) return;
    const dpr = canvas._dpr;
    const ctx = canvas.getContext("2d");
    const w = canvas._w;
    const h = canvas._h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const padL = 32;
    const padR = 14;
    const padT = 18;
    const padB = 30;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const yAxis = h - padB;
    const s = styles();

    // axes
    ctx.strokeStyle = s.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, yAxis);
    ctx.lineTo(w - padR, yAxis);
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, yAxis);
    ctx.stroke();

    ctx.font = SPECTRUM_FONT;
    ctx.fillStyle = s.muted;

    // x ticks at integer Hz
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let i = 0; i <= SPECTRUM_F_MAX; i++) {
      const tx = padL + (i / SPECTRUM_F_MAX) * plotW;
      ctx.beginPath();
      ctx.moveTo(tx, yAxis);
      ctx.lineTo(tx, yAxis + 4);
      ctx.stroke();
      if (i === 1 || i % 2 === 0) {
        ctx.fillText(String(i), tx, yAxis + 7);
      }
    }

    // y reference lines + labels at amplitude 1 and 2
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const amp of [1, 2]) {
      const ty = yAxis - (amp / SPECTRUM_A_MAX) * plotH;
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = s.rule;
      ctx.beginPath();
      ctx.moveTo(padL, ty);
      ctx.lineTo(w - padR, ty);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = s.muted;
      ctx.fillText(String(amp), padL - 6, ty);
    }

    // axis labels
    ctx.fillStyle = s.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("Hz", padL + plotW / 2, h - 6);

    ctx.save();
    ctx.translate(11, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("amplitude", 0, 0);
    ctx.restore();

    // stems
    for (const src of srcs) {
      if (src.amplitude < 0.001) continue;
      const fx =
        padL + Math.min(src.frequency / SPECTRUM_F_MAX, 1) * plotW;
      const fy =
        yAxis - (Math.min(src.amplitude, SPECTRUM_A_MAX) / SPECTRUM_A_MAX) * plotH;

      ctx.strokeStyle = s.accent;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(fx, yAxis);
      ctx.lineTo(fx, fy);
      ctx.stroke();

      ctx.fillStyle = s.accent;
      ctx.beginPath();
      ctx.arc(fx, fy, 3, 0, TWO_PI);
      ctx.fill();
    }
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
    drawCompositeStack(compositeStackCanvas, sources);
    drawWave(compositeCanvas, sources, true);
    drawSpectrum(spectrumCanvas, sources);

    requestAnimationFrame(frame);
  }

  // ------- presets / actions -------

  function applyPreset(name) {
    const preset = presets[name];
    if (!preset) return;
    sources.length = 0;
    preset.forEach((p) => sources.push({ ...p }));
    rebuildRows();
    requestAnimationFrame(sizeAllCanvases);

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

  applyPreset("sine"); // populates sources and builds rows

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
