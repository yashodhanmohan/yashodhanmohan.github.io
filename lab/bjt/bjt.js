// BJT explorer.
//
// Simplified Ebers-Moll model with constant V_BE,on, fixed V_CE,sat knee,
// and a mild Early effect. Two canvases — a textbook common-emitter
// schematic on the left, the I_C-vs-V_CE family of curves with a DC load
// line on the right — driven by five sliders.

(() => {
  // ---------- physics constants ----------
  const VBE_ON = 0.7; // V — base-emitter turn-on
  const VCE_SAT = 0.2; // V — saturation knee
  const VA = 80; // V — Early voltage

  // Reference I_B values for the gray curve family (in amps)
  const IB_REFS = [
    5e-6, 15e-6, 30e-6, 50e-6, 80e-6, 120e-6, 180e-6, 260e-6,
  ];

  // Resistor ranges (log)
  const RB_MIN = 1e3;
  const RB_MAX = 1e6;
  const RC_MIN = 1e2;
  const RC_MAX = 1e5;

  // ---------- state ----------
  let Vbb = 2;
  let Rb = 100e3;
  let Vcc = 12;
  let Rc = 2.2e3;
  let beta = 150;

  // ---------- DOM ----------
  const schematicCanvas = document.getElementById("schematic");
  const curvesCanvas = document.getElementById("curves");

  const VbbInput = document.getElementById("Vbb");
  const RbInput = document.getElementById("Rb");
  const VccInput = document.getElementById("Vcc");
  const RcInput = document.getElementById("Rc");
  const betaInput = document.getElementById("beta");

  const VbbValueEl = document.getElementById("VbbValue");
  const RbValueEl = document.getElementById("RbValue");
  const VccValueEl = document.getElementById("VccValue");
  const RcValueEl = document.getElementById("RcValue");
  const betaValueEl = document.getElementById("betaValue");

  const IbEl = document.getElementById("Ib");
  const IcEl = document.getElementById("Ic");
  const VbeEl = document.getElementById("Vbe");
  const VceEl = document.getElementById("Vce");
  const powerEl = document.getElementById("power");
  const regionEl = document.getElementById("region");
  const regionBadge = document.getElementById("regionBadge");

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
    sizeCanvas(schematicCanvas);
    sizeCanvas(curvesCanvas);
  }

  // ---------- styles ----------
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
  function fmtV(v) {
    return `${v.toFixed(2)} V`;
  }
  function fmtI(i) {
    const a = Math.abs(i);
    if (a >= 1e-3) return `${(i * 1e3).toFixed(2)} mA`;
    if (a >= 1e-6) return `${(i * 1e6).toFixed(1)} μA`;
    if (a >= 1e-9) return `${(i * 1e9).toFixed(1)} nA`;
    if (a === 0) return `0`;
    return `${i.toExponential(2)} A`;
  }
  function fmtR(r) {
    if (r >= 1e6) return `${(r / 1e6).toFixed(2)} MΩ`;
    if (r >= 1e3) return `${(r / 1e3).toFixed(r >= 10e3 ? 0 : 1)} kΩ`;
    return `${r.toFixed(0)} Ω`;
  }
  function fmtP(p) {
    const a = Math.abs(p);
    if (a >= 1) return `${p.toFixed(2)} W`;
    if (a >= 1e-3) return `${(p * 1e3).toFixed(2)} mW`;
    if (a >= 1e-6) return `${(p * 1e6).toFixed(1)} μW`;
    return `${p.toExponential(2)} W`;
  }

  // ---------- log slider helpers ----------
  function logFromSlider(v01, min, max) {
    return Math.exp(Math.log(min) + v01 * (Math.log(max) - Math.log(min)));
  }

  // ---------- physics ----------

  // Smooth Ic(Vce) curve for fixed Ib — handles knee and Early effect.
  function curveIc(Vce, Ib) {
    if (Ib <= 0 || Vce <= 0) return 0;
    const knee = 1 - Math.exp(-Vce / VCE_SAT);
    const early = 1 + Math.max(0, Vce - VCE_SAT) / VA;
    return beta * Ib * knee * early;
  }

  function operatingPoint() {
    if (Vbb < VBE_ON) {
      return {
        Ib: 0,
        Ic: 0,
        Vbe: Vbb,
        Vce: Vcc,
        region: "cutoff",
      };
    }
    const Ib = (Vbb - VBE_ON) / Rb;
    // Active-region solution: Ic = β·Ib·(1 + Vce/Va), Vce = Vcc - Ic·Rc
    const IcActive =
      (beta * Ib * (1 + Vcc / VA)) / (1 + (beta * Ib * Rc) / VA);
    const VceActive = Vcc - IcActive * Rc;
    if (VceActive >= VCE_SAT) {
      return {
        Ib,
        Ic: IcActive,
        Vbe: VBE_ON,
        Vce: VceActive,
        region: "active",
      };
    }
    // Saturated
    const IcSat = (Vcc - VCE_SAT) / Rc;
    return {
      Ib,
      Ic: IcSat,
      Vbe: VBE_ON,
      Vce: VCE_SAT,
      region: "saturation",
    };
  }

  // ---------- schematic rendering ----------

  function drawSchematic() {
    if (!schematicCanvas._w) return;
    const ctx = schematicCanvas.getContext("2d");
    const w = schematicCanvas._w;
    const h = schematicCanvas._h;
    ctx.setTransform(schematicCanvas._dpr, 0, 0, schematicCanvas._dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const s = styles();
    const op = operatingPoint();

    ctx.strokeStyle = s.ink;
    ctx.fillStyle = s.ink;
    ctx.lineWidth = 1.2;

    // Layout anchors
    const cx = w * 0.55; // transistor column
    const baseCol = w * 0.18; // Vbb / Rb column

    const Vcc_y = h * 0.06;
    const Rc_y0 = h * 0.13;
    const Rc_y1 = h * 0.27;
    const outNode_y = h * 0.34;
    const trCenter_y = h * 0.52;
    const trRadius = Math.min(w, h) * 0.075;
    const em_y0 = trCenter_y + trRadius * 1.05;
    const gnd_y = h * 0.83;

    const base_y = trCenter_y; // base wire height
    const Rb_y0 = trCenter_y + h * 0.06;
    const Rb_y1 = trCenter_y + h * 0.18;
    const battery_y0 = Rb_y1 + 6;
    const battery_y1 = battery_y0 + 24;
    const baseGnd_y = battery_y1 + 16;

    // -------- top column: Vcc -> Rc -> collector --------
    label(ctx, cx, Vcc_y - 14, `+V_CC = ${fmtV(Vcc)}`, "center", s.muted);
    // wire from Vcc to Rc top
    line(ctx, cx, Vcc_y, cx, Rc_y0);
    drawResistorVertical(ctx, cx, Rc_y0, Rc_y1);
    label(ctx, cx + 18, (Rc_y0 + Rc_y1) / 2, `R_C ${fmtR(Rc)}`, "left", s.muted);
    // wire from Rc bottom to output node
    line(ctx, cx, Rc_y1, cx, outNode_y);
    // junction
    junction(ctx, cx, outNode_y);
    label(
      ctx,
      cx + 14,
      outNode_y - 2,
      `V_C = ${fmtV(Vcc - op.Ic * Rc)}`,
      "left",
      s.inkSoft
    );
    // current label
    label(ctx, cx - 16, outNode_y + 16, `I_C ${fmtI(op.Ic)}`, "right", s.accent);
    // wire to transistor top
    line(ctx, cx, outNode_y, cx, trCenter_y - trRadius);

    // -------- transistor --------
    drawNPN(ctx, cx, trCenter_y, trRadius, s);
    // Vce label inside / next to
    label(
      ctx,
      cx + trRadius + 6,
      trCenter_y,
      `V_CE ${fmtV(op.Vce)}`,
      "left",
      s.inkSoft
    );

    // -------- emitter wire -> ground --------
    line(ctx, cx, em_y0, cx, gnd_y);
    drawGround(ctx, cx, gnd_y);

    // -------- base side: base lead -> Rb -> Vbb -> ground --------
    // wire from base (left of transistor) going left
    const baseLeadX = cx - trRadius * 1.05;
    line(ctx, baseLeadX, base_y, baseCol, base_y);
    // base current label
    label(
      ctx,
      (baseLeadX + baseCol) / 2,
      base_y - 8,
      `I_B ${fmtI(op.Ib)}`,
      "center",
      s.accent
    );
    // Vbe label on the lead near transistor
    label(
      ctx,
      baseLeadX - 8,
      base_y + 14,
      `V_BE ${fmtV(op.Vbe)}`,
      "right",
      s.muted
    );
    // wire from base column down to Rb top
    line(ctx, baseCol, base_y, baseCol, Rb_y0);
    drawResistorVertical(ctx, baseCol, Rb_y0, Rb_y1);
    label(
      ctx,
      baseCol - 14,
      (Rb_y0 + Rb_y1) / 2,
      `R_B ${fmtR(Rb)}`,
      "right",
      s.muted
    );
    // wire from Rb to battery top
    line(ctx, baseCol, Rb_y1, baseCol, battery_y0);
    drawBatteryVertical(ctx, baseCol, battery_y0, battery_y1);
    label(
      ctx,
      baseCol + 14,
      (battery_y0 + battery_y1) / 2,
      `V_BB ${fmtV(Vbb)}`,
      "left",
      s.muted
    );
    // wire from battery to ground
    line(ctx, baseCol, battery_y1, baseCol, baseGnd_y);
    drawGround(ctx, baseCol, baseGnd_y);
  }

  function line(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function junction(ctx, x, y) {
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawResistorVertical(ctx, x, yTop, yBottom) {
    const length = yBottom - yTop;
    const segments = 6;
    const segLen = length / segments;
    const swing = 6;
    ctx.beginPath();
    ctx.moveTo(x, yTop);
    for (let i = 0; i < segments; i++) {
      const y = yTop + i * segLen + segLen / 2;
      const off = (i % 2 === 0 ? 1 : -1) * swing;
      ctx.lineTo(x + off, y);
    }
    ctx.lineTo(x, yBottom);
    ctx.stroke();
  }

  function drawBatteryVertical(ctx, x, yTop, yBottom) {
    // Single-cell battery: long line on top (+), short line below (-)
    const mid = (yTop + yBottom) / 2;
    ctx.beginPath();
    ctx.moveTo(x, yTop);
    ctx.lineTo(x, mid - 5);
    ctx.stroke();
    // + (longer)
    ctx.beginPath();
    ctx.moveTo(x - 9, mid - 5);
    ctx.lineTo(x + 9, mid - 5);
    ctx.stroke();
    // - (shorter)
    ctx.beginPath();
    ctx.moveTo(x - 4.5, mid + 2);
    ctx.lineTo(x + 4.5, mid + 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, mid + 2);
    ctx.lineTo(x, yBottom);
    ctx.stroke();
  }

  function drawGround(ctx, x, y) {
    ctx.beginPath();
    ctx.moveTo(x - 11, y);
    ctx.lineTo(x + 11, y);
    ctx.moveTo(x - 7, y + 4);
    ctx.lineTo(x + 7, y + 4);
    ctx.moveTo(x - 3.5, y + 8);
    ctx.lineTo(x + 3.5, y + 8);
    ctx.stroke();
  }

  function drawNPN(ctx, cx, cy, r, s) {
    // Outer circle
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Base bar (vertical, inside left of circle)
    const bX = cx - r * 0.32;
    const bTopY = cy - r * 0.6;
    const bBotY = cy + r * 0.6;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bX, bTopY);
    ctx.lineTo(bX, bBotY);
    ctx.stroke();
    ctx.lineWidth = 1.2;

    // Collector line — from upper part of bar diagonally up-right to circle edge
    const collectorTip = polarPointOnCircle(cx, cy, r, -Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(bX, bTopY + r * 0.2);
    ctx.lineTo(collectorTip[0], collectorTip[1]);
    ctx.stroke();

    // Emitter line — from lower bar to circle edge down-right, with arrow
    const emitterTip = polarPointOnCircle(cx, cy, r, Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(bX, bBotY - r * 0.2);
    ctx.lineTo(emitterTip[0], emitterTip[1]);
    ctx.stroke();
    // NPN arrow on emitter (pointing OUT, away from base)
    drawArrowHead(
      ctx,
      bX,
      bBotY - r * 0.2,
      emitterTip[0],
      emitterTip[1],
      0.65,
      6.5
    );

    // External pins
    // Collector going up out of the circle
    line(ctx, collectorTip[0], collectorTip[1], cx, cy - r * 1.05);
    // turn so the wire above the transistor is vertical from cx
    // Actually the collector tip is at (cx, cy-r), so vertical out
    // Emitter going down out of the circle to cx, cy + r
    line(ctx, emitterTip[0], emitterTip[1], cx, cy + r * 1.05);
    // Base going left
    line(ctx, bX, cy, cx - r * 1.05, cy);

    // Pin labels
    ctx.font = "10px ui-monospace, 'JetBrains Mono', SFMono-Regular, monospace";
    ctx.fillStyle = s.muted;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText("C", cx + 4, cy - r * 0.55);
    ctx.fillText("E", cx + 4, cy + r * 0.55);
    ctx.textAlign = "right";
    ctx.fillText("B", cx - r * 0.45, cy - r * 0.05);
    ctx.fillStyle = s.ink;
  }

  function polarPointOnCircle(cx, cy, r, theta) {
    // theta measured from +x axis CCW in canvas (where +y is down).
    return [cx + r * Math.cos(theta), cy + r * Math.sin(theta)];
  }

  function drawArrowHead(ctx, x1, y1, x2, y2, t, size) {
    // Arrowhead at fraction t along (x1,y1)->(x2,y2)
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const tipX = x1 + t * (x2 - x1);
    const tipY = y1 + t * (y2 - y1);
    const a1 = ang + Math.PI * (5 / 6);
    const a2 = ang - Math.PI * (5 / 6);
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX + size * Math.cos(a1), tipY + size * Math.sin(a1));
    ctx.lineTo(tipX + size * Math.cos(a2), tipY + size * Math.sin(a2));
    ctx.closePath();
    ctx.fill();
  }

  function label(ctx, x, y, text, align, color) {
    ctx.font = "11px ui-monospace, 'JetBrains Mono', SFMono-Regular, monospace";
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
    ctx.fillStyle = styles().ink;
    ctx.textAlign = "left";
  }

  // ---------- curves rendering ----------

  function drawCurves() {
    if (!curvesCanvas._w) return;
    const ctx = curvesCanvas.getContext("2d");
    const w = curvesCanvas._w;
    const h = curvesCanvas._h;
    ctx.setTransform(curvesCanvas._dpr, 0, 0, curvesCanvas._dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const s = styles();
    const op = operatingPoint();

    const padL = 46;
    const padR = 14;
    const padT = 14;
    const padB = 36;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const x0 = padL;
    const y0 = h - padB;

    // x-axis range: 0 to Vcc (with a tiny bit of headroom)
    const xMax = Math.max(Vcc * 1.05, 1);
    // y-axis range: cover load line max and op point with headroom
    const Ic_load_max = (Vcc - VCE_SAT) / Rc;
    let yMax = Math.max(Ic_load_max * 1.2, op.Ic * 1.3, 1e-5);
    // Snap to a "nice" y range
    yMax = niceMax(yMax);

    const px = (Vce) => x0 + (Vce / xMax) * plotW;
    const py = (Ic) => y0 - (Ic / yMax) * plotH;

    // axes
    ctx.strokeStyle = s.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + plotW, y0);
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0, y0 - plotH);
    ctx.stroke();

    // ticks
    ctx.font =
      "10px ui-monospace, 'JetBrains Mono', SFMono-Regular, monospace";
    ctx.fillStyle = s.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const xTickStep = niceStep(xMax, 5);
    for (let v = 0; v <= xMax + 1e-9; v += xTickStep) {
      const x = px(v);
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y0 + 4);
      ctx.stroke();
      ctx.fillText(v.toFixed(v < 1 ? 1 : 0), x, y0 + 6);
    }

    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const yTickStep = niceStep(yMax, 5);
    for (let v = 0; v <= yMax + 1e-9; v += yTickStep) {
      const y = py(v);
      ctx.beginPath();
      ctx.moveTo(x0 - 4, y);
      ctx.lineTo(x0, y);
      ctx.stroke();
      ctx.fillText(fmtIcShort(v), x0 - 6, y);
    }

    // axis labels
    ctx.fillStyle = s.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("V_CE (V)", x0 + plotW / 2, h - 8);
    ctx.save();
    ctx.translate(12, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("I_C", 0, 0);
    ctx.restore();

    // reference curves (gray)
    ctx.strokeStyle = s.rule;
    ctx.lineWidth = 1;
    const steps = 80;
    for (const ib of IB_REFS) {
      drawIcCurve(ctx, ib, px, py, xMax, steps);
    }

    // active Ib curve in cobalt
    if (op.Ib > 0) {
      ctx.strokeStyle = s.accent;
      ctx.lineWidth = 1.6;
      drawIcCurve(ctx, op.Ib, px, py, xMax, steps);

      // label the active curve at the right edge
      const yEnd = py(curveIc(xMax, op.Ib));
      ctx.fillStyle = s.accent;
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(`I_B ${fmtI(op.Ib)}`, x0 + plotW - 4, yEnd - 4);
    }

    // DC load line: from (Vcc, 0) to (0, Vcc/Rc), dashed
    ctx.strokeStyle = s.accent;
    ctx.lineWidth = 1.3;
    ctx.setLineDash([5, 4]);
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(px(Vcc), py(0));
    ctx.lineTo(px(0), py(Vcc / Rc));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // operating point
    if (op.region !== "cutoff") {
      ctx.fillStyle = s.accent;
      ctx.beginPath();
      ctx.arc(px(op.Vce), py(op.Ic), 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = styles().bg;
      ctx.beginPath();
      ctx.arc(px(op.Vce), py(op.Ic), 1.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // mark cutoff at the bottom-right of the load line (Vcc, 0)
      ctx.fillStyle = s.muted;
      ctx.beginPath();
      ctx.arc(px(Vcc), py(0), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawIcCurve(ctx, Ib, px, py, xMax, steps) {
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const Vce = (i / steps) * xMax;
      const Ic = curveIc(Vce, Ib);
      const X = px(Vce);
      const Y = py(Ic);
      if (i === 0) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    }
    ctx.stroke();
  }

  function fmtIcShort(I) {
    if (I === 0) return "0";
    if (I >= 1e-3) return `${(I * 1e3).toFixed(I >= 10e-3 ? 0 : 1)}m`;
    return `${(I * 1e6).toFixed(0)}μ`;
  }

  function niceStep(range, target) {
    const raw = range / target;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    let step;
    if (norm < 1.5) step = 1 * mag;
    else if (norm < 3) step = 2 * mag;
    else if (norm < 7) step = 5 * mag;
    else step = 10 * mag;
    return step;
  }
  function niceMax(value) {
    if (value <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(value)));
    const norm = value / mag;
    let nice;
    if (norm <= 1) nice = 1;
    else if (norm <= 2) nice = 2;
    else if (norm <= 5) nice = 5;
    else nice = 10;
    return nice * mag;
  }

  // ---------- stats ----------
  function updateStats() {
    const op = operatingPoint();
    IbEl.textContent = fmtI(op.Ib);
    IcEl.textContent = fmtI(op.Ic);
    VbeEl.textContent = fmtV(op.Vbe);
    VceEl.textContent = fmtV(op.Vce);
    powerEl.textContent = fmtP(op.Ic * op.Vce);
    regionEl.textContent = op.region;
    regionBadge.classList.remove("cutoff", "active", "saturation");
    regionBadge.classList.add(op.region);
  }

  // ---------- redraw ----------
  let redrawQueued = false;
  function queueRedraw() {
    if (redrawQueued) return;
    redrawQueued = true;
    requestAnimationFrame(() => {
      redrawQueued = false;
      drawSchematic();
      drawCurves();
      updateStats();
    });
  }

  // ---------- slider wiring ----------
  function syncLabels() {
    VbbValueEl.textContent = `${Vbb.toFixed(2)} V`;
    RbValueEl.textContent = fmtR(Rb);
    VccValueEl.textContent = `${Vcc.toFixed(1)} V`;
    RcValueEl.textContent = fmtR(Rc);
    betaValueEl.textContent = beta.toFixed(0);
  }

  VbbInput.addEventListener("input", (e) => {
    Vbb = +e.target.value;
    syncLabels();
    queueRedraw();
  });
  RbInput.addEventListener("input", (e) => {
    Rb = logFromSlider(+e.target.value, RB_MIN, RB_MAX);
    syncLabels();
    queueRedraw();
  });
  VccInput.addEventListener("input", (e) => {
    Vcc = +e.target.value;
    syncLabels();
    queueRedraw();
  });
  RcInput.addEventListener("input", (e) => {
    Rc = logFromSlider(+e.target.value, RC_MIN, RC_MAX);
    syncLabels();
    queueRedraw();
  });
  betaInput.addEventListener("input", (e) => {
    beta = +e.target.value;
    syncLabels();
    queueRedraw();
  });

  // ---------- boot ----------
  // Initialize Rb / Rc from slider defaults so the JS state matches HTML.
  Rb = logFromSlider(+RbInput.value, RB_MIN, RB_MAX);
  Rc = logFromSlider(+RcInput.value, RC_MIN, RC_MAX);
  syncLabels();

  requestAnimationFrame(() => {
    sizeAll();
    drawSchematic();
    drawCurves();
    updateStats();
  });

  let resizeQueued = false;
  window.addEventListener("resize", () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      sizeAll();
      drawSchematic();
      drawCurves();
      resizeQueued = false;
    });
  });
})();
