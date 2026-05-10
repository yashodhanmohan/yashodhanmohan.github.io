// BJT explorer.
//
// Common-emitter NPN with simplified Ebers-Moll (constant V_BE,on,
// V_CE,sat knee, mild Early effect). Two canvases:
//   - schematic (left): textbook symbols, animated current dots whose
//     speed encodes the actual current magnitude (so β · I_B vs I_C is
//     visible at a glance); hover any component for its current value
//   - curves (right): I_C-vs-V_CE family with DC load line and a live
//     operating-point dot at the intersection

(() => {
  // ---------- physics constants ----------
  const VBE_ON = 0.7;
  const VCE_SAT = 0.2;
  const VA = 80;

  const IB_REFS = [
    5e-6, 15e-6, 30e-6, 50e-6, 80e-6, 120e-6, 180e-6, 260e-6,
  ];

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

  let animTime = 0;
  let lastFrame = 0;
  let curvesDirty = true;

  let mouseX = -9999;
  let mouseY = -9999;
  let hoverRegion = null;

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
    curvesDirty = true;
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
  function curveIc(Vce, Ib) {
    if (Ib <= 0 || Vce <= 0) return 0;
    const knee = 1 - Math.exp(-Vce / VCE_SAT);
    const early = 1 + Math.max(0, Vce - VCE_SAT) / VA;
    return beta * Ib * knee * early;
  }

  function operatingPoint() {
    if (Vbb < VBE_ON) {
      return {
        Ib: 0, Ic: 0, Vbe: Vbb, Vce: Vcc, region: "cutoff",
      };
    }
    const Ib = (Vbb - VBE_ON) / Rb;
    const IcActive =
      (beta * Ib * (1 + Vcc / VA)) / (1 + (beta * Ib * Rc) / VA);
    const VceActive = Vcc - IcActive * Rc;
    if (VceActive >= VCE_SAT) {
      return { Ib, Ic: IcActive, Vbe: VBE_ON, Vce: VceActive, region: "active" };
    }
    const IcSat = (Vcc - VCE_SAT) / Rc;
    return { Ib, Ic: IcSat, Vbe: VBE_ON, Vce: VCE_SAT, region: "saturation" };
  }

  // ---------- schematic geometry ----------

  function geometry() {
    const w = schematicCanvas._w || 320;
    const h = schematicCanvas._h || 540;
    const cx = w * 0.56;
    const baseCol = w * 0.18;
    const trCenter_y = h * 0.5;
    const trRadius = Math.min(w * 0.16, h * 0.092, 48);
    return {
      w,
      h,
      cx,
      baseCol,
      trCenter_y,
      trRadius,
      Vcc_label_y: 22,
      Vcc_wire_top: 38,
      Rc_y0: 60,
      Rc_y1: 168,
      outNode_y: 210,
      em_top: trCenter_y + trRadius,
      em_bottom: trCenter_y + trRadius + 100,
      gnd_y: trCenter_y + trRadius + 108,
      base_y: trCenter_y,
      baseLead_left_x: cx - trRadius,
      Rb_top: trCenter_y + 56,
      Rb_bottom: trCenter_y + 156,
      battery_top: trCenter_y + 168,
      battery_bottom: trCenter_y + 200,
      baseGnd_y: trCenter_y + 220,
    };
  }

  // ---------- polyline helpers ----------
  function polylineLength(path) {
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const [x1, y1] = path[i];
      const [x2, y2] = path[i + 1];
      total += Math.hypot(x2 - x1, y2 - y1);
    }
    return total;
  }
  function walkPolyline(path, phase) {
    let remaining = phase;
    for (let i = 0; i < path.length - 1; i++) {
      const [x1, y1] = path[i];
      const [x2, y2] = path[i + 1];
      const dx = x2 - x1;
      const dy = y2 - y1;
      const segLen = Math.hypot(dx, dy);
      if (remaining <= segLen) {
        const t = segLen > 0 ? remaining / segLen : 0;
        return [x1 + t * dx, y1 + t * dy];
      }
      remaining -= segLen;
    }
    return path[path.length - 1];
  }

  // ---------- animated current dots ----------
  function drawCurrentDots(ctx, path, current, color) {
    if (current <= 1e-9) return;
    const len = polylineLength(path);
    if (len <= 0) return;
    const spacing = 17;
    let speed = current * 6e4; // px / s
    if (speed > 320) speed = 320;
    if (speed < 6) speed = 6; // crawl, but visible
    const totalDots = Math.max(2, Math.floor(len / spacing) + 1);

    ctx.fillStyle = color;
    for (let i = 0; i < totalDots; i++) {
      const phase = (((animTime * speed + i * spacing) % len) + len) % len;
      const [x, y] = walkPolyline(path, phase);
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------- primitive drawing ----------
  function line(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  function junction(ctx, x, y) {
    ctx.beginPath();
    ctx.arc(x, y, 2.8, 0, Math.PI * 2);
    ctx.fill();
  }
  function drawResistorVertical(ctx, x, yTop, yBottom) {
    const length = yBottom - yTop;
    const segments = 7;
    const segLen = length / segments;
    const swing = 7;
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
    const mid = (yTop + yBottom) / 2;
    ctx.beginPath();
    ctx.moveTo(x, yTop);
    ctx.lineTo(x, mid - 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 10, mid - 5);
    ctx.lineTo(x + 10, mid - 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 5, mid + 3);
    ctx.lineTo(x + 5, mid + 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, mid + 3);
    ctx.lineTo(x, yBottom);
    ctx.stroke();
  }
  function drawGround(ctx, x, y) {
    ctx.beginPath();
    ctx.moveTo(x - 12, y);
    ctx.lineTo(x + 12, y);
    ctx.moveTo(x - 8, y + 4);
    ctx.lineTo(x + 8, y + 4);
    ctx.moveTo(x - 4, y + 8);
    ctx.lineTo(x + 4, y + 8);
    ctx.stroke();
  }
  function drawNPN(ctx, cx, cy, r, s) {
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    const bX = cx - r * 0.3;
    const bTopY = cy - r * 0.6;
    const bBotY = cy + r * 0.6;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(bX, bTopY);
    ctx.lineTo(bX, bBotY);
    ctx.stroke();
    ctx.lineWidth = 1.4;

    const collectorTipX = cx + r * 0.05;
    const collectorTipY = cy - r;
    ctx.beginPath();
    ctx.moveTo(bX, bTopY + r * 0.18);
    ctx.lineTo(collectorTipX, collectorTipY);
    ctx.stroke();

    const emitterTipX = cx + r * 0.05;
    const emitterTipY = cy + r;
    ctx.beginPath();
    ctx.moveTo(bX, bBotY - r * 0.18);
    ctx.lineTo(emitterTipX, emitterTipY);
    ctx.stroke();
    drawArrowHead(
      ctx,
      bX,
      bBotY - r * 0.18,
      emitterTipX,
      emitterTipY,
      0.68,
      8
    );

    line(ctx, bX, cy, cx - r * 1.05, cy);

    ctx.font =
      '10px ui-monospace, "JetBrains Mono", SFMono-Regular, monospace';
    ctx.fillStyle = s.muted;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText("C", cx + r * 0.18, cy - r * 0.55);
    ctx.fillText("E", cx + r * 0.18, cy + r * 0.55);
    ctx.textAlign = "right";
    ctx.fillText("B", cx - r * 0.42, cy - r * 0.04);
    ctx.fillStyle = s.ink;
    ctx.textAlign = "left";
  }
  function drawArrowHead(ctx, x1, y1, x2, y2, t, size) {
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
  function drawText(ctx, x, y, text, align, color) {
    ctx.font =
      '11px ui-monospace, "JetBrains Mono", SFMono-Regular, monospace';
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
    ctx.fillStyle = styles().ink;
    ctx.textAlign = "left";
  }

  // ---------- hover hit regions ----------
  function hitRegions() {
    const g = geometry();
    const op = operatingPoint();
    const Ie = op.Ic + op.Ib;
    return [
      {
        id: "Vcc",
        rect: [g.cx - 60, 6, 120, 28],
        label: () => `V_CC = ${fmtV(Vcc)}`,
      },
      {
        id: "collectorWire",
        rect: [
          g.cx - 8,
          g.Vcc_wire_top,
          16,
          g.Rc_y0 - g.Vcc_wire_top + 4,
        ],
        label: () => `I_C = ${fmtI(op.Ic)}`,
      },
      {
        id: "Rc",
        rect: [g.cx - 14, g.Rc_y0, 28, g.Rc_y1 - g.Rc_y0],
        label: () => `R_C = ${fmtR(Rc)}`,
      },
      {
        id: "outNode",
        rect: [g.cx - 10, g.outNode_y - 10, 20, 20],
        label: () => `V_C = ${fmtV(Vcc - op.Ic * Rc)}`,
      },
      {
        id: "collectorWire2",
        rect: [
          g.cx - 8,
          g.Rc_y1,
          16,
          g.trCenter_y - g.trRadius - g.Rc_y1,
        ],
        label: () => `I_C = ${fmtI(op.Ic)}`,
      },
      {
        id: "transistor",
        rect: [
          g.cx - g.trRadius,
          g.trCenter_y - g.trRadius,
          2 * g.trRadius,
          2 * g.trRadius,
        ],
        label: () =>
          `V_BE ${fmtV(op.Vbe)} · V_CE ${fmtV(op.Vce)} · β = ${beta.toFixed(0)}`,
      },
      {
        id: "emitterWire",
        rect: [g.cx - 8, g.em_top, 16, g.gnd_y - g.em_top],
        label: () => `I_E = ${fmtI(Ie)}`,
      },
      {
        id: "baseWire",
        rect: [
          g.baseLead_left_x - 4,
          g.base_y - 8,
          g.baseCol - g.baseLead_left_x + 8,
          16,
        ],
        label: () => `I_B = ${fmtI(op.Ib)}`,
      },
      {
        id: "baseWire2",
        rect: [g.baseCol - 8, g.base_y, 16, g.Rb_top - g.base_y],
        label: () => `I_B = ${fmtI(op.Ib)}`,
      },
      {
        id: "Rb",
        rect: [g.baseCol - 14, g.Rb_top, 28, g.Rb_bottom - g.Rb_top],
        label: () => `R_B = ${fmtR(Rb)}`,
      },
      {
        id: "Vbb",
        rect: [
          g.baseCol - 14,
          g.battery_top - 4,
          28,
          g.battery_bottom - g.battery_top + 8,
        ],
        label: () => `V_BB = ${fmtV(Vbb)}`,
      },
    ];
  }
  function hitTest(mx, my) {
    for (const r of hitRegions()) {
      const [x, y, w, h] = r.rect;
      if (mx >= x && mx <= x + w && my >= y && my <= y + h) return r;
    }
    return null;
  }

  function drawHoverChip(ctx, text, mx, my, s) {
    ctx.font =
      '11.5px ui-monospace, "JetBrains Mono", SFMono-Regular, monospace';
    const m = ctx.measureText(text);
    const padX = 9;
    const W = m.width + 2 * padX;
    const H = 22;
    let x = mx + 14;
    let y = my - H - 6;
    const cw = schematicCanvas._w;
    const ch = schematicCanvas._h;
    if (x + W > cw - 6) x = mx - W - 14;
    if (x < 6) x = 6;
    if (y < 6) y = my + 14;
    if (y + H > ch - 6) y = ch - H - 6;

    ctx.fillStyle = s.bg;
    ctx.fillRect(x, y, W, H);
    ctx.strokeStyle = s.accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, W - 1, H - 1);
    ctx.fillStyle = s.ink;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + padX, y + H / 2);
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
    const Ie = op.Ic + op.Ib;
    const g = geometry();

    ctx.strokeStyle = s.ink;
    ctx.fillStyle = s.ink;
    ctx.lineWidth = 1.4;

    // Top rail (V_CC)
    drawText(ctx, g.cx, g.Vcc_label_y, "+V_CC", "center", s.muted);
    line(ctx, g.cx, g.Vcc_wire_top, g.cx, g.Rc_y0);

    // R_C
    drawResistorVertical(ctx, g.cx, g.Rc_y0, g.Rc_y1);
    drawText(
      ctx,
      g.cx + 24,
      (g.Rc_y0 + g.Rc_y1) / 2,
      "R_C",
      "left",
      s.muted
    );

    // Wire to output node and transistor C
    line(ctx, g.cx, g.Rc_y1, g.cx, g.trCenter_y - g.trRadius);
    junction(ctx, g.cx, g.outNode_y);

    // Transistor
    drawNPN(ctx, g.cx, g.trCenter_y, g.trRadius, s);

    // Emitter wire
    line(ctx, g.cx, g.em_top, g.cx, g.gnd_y);
    drawGround(ctx, g.cx, g.gnd_y);

    // Base wire (horizontal)
    line(ctx, g.baseLead_left_x, g.base_y, g.baseCol, g.base_y);
    // Base vertical down to R_B
    line(ctx, g.baseCol, g.base_y, g.baseCol, g.Rb_top);
    drawResistorVertical(ctx, g.baseCol, g.Rb_top, g.Rb_bottom);
    drawText(
      ctx,
      g.baseCol - 20,
      (g.Rb_top + g.Rb_bottom) / 2,
      "R_B",
      "right",
      s.muted
    );
    // Wire to battery
    line(ctx, g.baseCol, g.Rb_bottom, g.baseCol, g.battery_top);
    drawBatteryVertical(ctx, g.baseCol, g.battery_top, g.battery_bottom);
    drawText(
      ctx,
      g.baseCol + 18,
      (g.battery_top + g.battery_bottom) / 2,
      "V_BB",
      "left",
      s.muted
    );
    // Wire to ground
    line(ctx, g.baseCol, g.battery_bottom, g.baseCol, g.baseGnd_y);
    drawGround(ctx, g.baseCol, g.baseGnd_y);

    // ----- animated current dots -----
    drawCurrentDots(
      ctx,
      [[g.cx, g.Vcc_wire_top], [g.cx, g.Rc_y0]],
      op.Ic,
      s.accent
    );
    drawCurrentDots(
      ctx,
      [
        [g.cx, g.Rc_y1],
        [g.cx, g.outNode_y],
        [g.cx, g.trCenter_y - g.trRadius],
      ],
      op.Ic,
      s.accent
    );
    drawCurrentDots(
      ctx,
      [[g.cx, g.em_top], [g.cx, g.gnd_y]],
      Ie,
      s.accent
    );
    // Base path: from battery + (top) up through wires to base pin
    drawCurrentDots(
      ctx,
      [[g.baseCol, g.battery_top], [g.baseCol, g.Rb_bottom]],
      op.Ib,
      s.accent
    );
    drawCurrentDots(
      ctx,
      [
        [g.baseCol, g.Rb_top],
        [g.baseCol, g.base_y],
        [g.baseLead_left_x, g.base_y],
      ],
      op.Ib,
      s.accent
    );

    // ----- hover chip -----
    if (hoverRegion) {
      drawHoverChip(ctx, hoverRegion.label(), mouseX, mouseY, s);
    }
  }

  // ---------- curves rendering (unchanged from earlier) ----------
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

    const xMax = Math.max(Vcc * 1.05, 1);
    const Ic_load_max = (Vcc - VCE_SAT) / Rc;
    let yMax = Math.max(Ic_load_max * 1.2, op.Ic * 1.3, 1e-5);
    yMax = niceMax(yMax);

    const px = (Vce) => x0 + (Vce / xMax) * plotW;
    const py = (Ic) => y0 - (Ic / yMax) * plotH;

    ctx.strokeStyle = s.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + plotW, y0);
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0, y0 - plotH);
    ctx.stroke();

    ctx.font =
      '10px ui-monospace, "JetBrains Mono", SFMono-Regular, monospace';
    ctx.fillStyle = s.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const xStep = niceStep(xMax, 5);
    for (let v = 0; v <= xMax + 1e-9; v += xStep) {
      const x = px(v);
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y0 + 4);
      ctx.stroke();
      ctx.fillText(v.toFixed(v < 1 ? 1 : 0), x, y0 + 6);
    }
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const yStep = niceStep(yMax, 5);
    for (let v = 0; v <= yMax + 1e-9; v += yStep) {
      const y = py(v);
      ctx.beginPath();
      ctx.moveTo(x0 - 4, y);
      ctx.lineTo(x0, y);
      ctx.stroke();
      ctx.fillText(fmtIcShort(v), x0 - 6, y);
    }

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

    ctx.strokeStyle = s.rule;
    ctx.lineWidth = 1;
    const steps = 80;
    for (const ib of IB_REFS) drawIcCurve(ctx, ib, px, py, xMax, steps);

    if (op.Ib > 0) {
      ctx.strokeStyle = s.accent;
      ctx.lineWidth = 1.6;
      drawIcCurve(ctx, op.Ib, px, py, xMax, steps);

      const yEnd = py(curveIc(xMax, op.Ib));
      ctx.fillStyle = s.accent;
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(`I_B ${fmtI(op.Ib)}`, x0 + plotW - 4, yEnd - 4);
    }

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

    if (op.region !== "cutoff") {
      ctx.fillStyle = s.accent;
      ctx.beginPath();
      ctx.arc(px(op.Vce), py(op.Ic), 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = s.bg;
      ctx.beginPath();
      ctx.arc(px(op.Vce), py(op.Ic), 1.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
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

  // ---------- main animation loop ----------
  function frame(now) {
    if (!lastFrame) lastFrame = now;
    const dt = Math.min((now - lastFrame) / 1000, 1 / 30);
    lastFrame = now;
    animTime += dt;

    drawSchematic();
    if (curvesDirty) {
      drawCurves();
      curvesDirty = false;
    }
    requestAnimationFrame(frame);
  }

  // ---------- slider wiring ----------
  function syncLabels() {
    VbbValueEl.textContent = `${Vbb.toFixed(2)} V`;
    RbValueEl.textContent = fmtR(Rb);
    VccValueEl.textContent = `${Vcc.toFixed(1)} V`;
    RcValueEl.textContent = fmtR(Rc);
    betaValueEl.textContent = beta.toFixed(0);
  }
  function onChange() {
    syncLabels();
    updateStats();
    curvesDirty = true;
  }

  VbbInput.addEventListener("input", (e) => {
    Vbb = +e.target.value;
    onChange();
  });
  RbInput.addEventListener("input", (e) => {
    Rb = logFromSlider(+e.target.value, RB_MIN, RB_MAX);
    onChange();
  });
  VccInput.addEventListener("input", (e) => {
    Vcc = +e.target.value;
    onChange();
  });
  RcInput.addEventListener("input", (e) => {
    Rc = logFromSlider(+e.target.value, RC_MIN, RC_MAX);
    onChange();
  });
  betaInput.addEventListener("input", (e) => {
    beta = +e.target.value;
    onChange();
  });

  // ---------- mouse handling ----------
  schematicCanvas.addEventListener("mousemove", (e) => {
    const rect = schematicCanvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
    hoverRegion = hitTest(mouseX, mouseY);
  });
  schematicCanvas.addEventListener("mouseleave", () => {
    hoverRegion = null;
    mouseX = -9999;
    mouseY = -9999;
  });

  // ---------- boot ----------
  Rb = logFromSlider(+RbInput.value, RB_MIN, RB_MAX);
  Rc = logFromSlider(+RcInput.value, RC_MIN, RC_MAX);
  syncLabels();
  updateStats();

  requestAnimationFrame(() => {
    sizeAll();
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
