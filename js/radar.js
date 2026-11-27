// Radar sets, signal model, sweep, display composition and overlays.

const NB = 1024, NC = 320, BIN_DEG = 360 / NB, SPAN = 1.6;
const RANGES = [0.125, 0.25, 0.5, 0.75, 1.5, 3, 6, 12, 24];
const RINGS = { 0.125: 0.025, 0.25: 0.05, 0.5: 0.1, 0.75: 0.25, 1.5: 0.25, 3: 0.5, 6: 1, 12: 2, 24: 4 };
const PULSES = { S: { res: 0.0065, db: 0, label: 'Short 0.08 µs' }, M: { res: 0.024, db: 4, label: 'Medium 0.3 µs' }, L: { res: 0.065, db: 8, label: 'Long 0.8 µs' } };

const SETS = {
  classic: {
    id: 'classic', name: 'Mariner 24', family: 'Pulse magnetron', warm: 45, rpm: 24, bw: 4.9,
    tune: true, pulseCtl: true, autoModes: false, marpa: false, doppler: false, ais: false, chart: false,
    sidelobeDb: -45, interference: true, secondTrace: true, mainBang: true, levels: 0, persist: 'phosphor',
    gainBand: [56, 72],
  },
  clearview: {
    id: 'clearview', name: 'Clearview BB', family: 'FMCW broadband', warm: 3, rpm: 24, bw: 5.2, res: 0.003,
    tune: false, pulseCtl: false, autoModes: true, marpa: true, doppler: false, ais: true, chart: true,
    sidelobeDb: -50, interference: false, secondTrace: false, mainBang: false, levels: 4, persist: 'hold',
    gainBand: [54, 72],
  },
  sentinel: {
    id: 'sentinel', name: 'Sentinel DX', family: 'Solid-state Doppler', warm: 12, rpm: 30, bw: 3.2, res: 0.012,
    tune: false, pulseCtl: false, autoModes: true, marpa: true, doppler: true, ais: true, chart: true,
    sidelobeDb: -48, interference: false, secondTrace: false, mainBang: false, levels: 12, persist: 'hold',
    gainBand: [54, 72],
  },
};
const PRESETS = {
  harbour:  { label: 'Harbour',  gain: 62, sea: () => 25, rain: 0 },
  coastal:  { label: 'Coastal',  gain: 62, sea: w => clamp((w - 6) * 3, 10, 70), rain: 0 },
  offshore: { label: 'Offshore', gain: 55, sea: () => 100, rain: 0 },
  weather:  { label: 'Weather',  gain: 62, sea: w => clamp((w - 6) * 3, 10, 70), rain: 50 },
};

function makeRadar(setId = 'classic') {
  return {
    set: setId, power: 'off', warmLeft: 0, range: 3,
    gain: 50, gainAuto: false, sea: 30, seaAuto: false, rain: 0, tune: 50, tuneOpt: 52,
    pulse: 'M', ir: false, mode: 'HU', cuRef: 0, motion: 'RM', tmCenter: null, offCentre: false,
    ebl: { on: false, brg: 45 }, vrm: { on: false, r: 1 }, trails: { len: 0, true: false },
    guard: { on: false, r0: 1, r1: 2, half: 60, alarm: false }, headingError: 0, align: 0,
    doppler: false, ais: false, chart: false, preset: 'coastal', marpa: [], pi: { on: false, off: -1 },
    safetyChecked: false, antRel: 0,
  };
}
function autoPulse(range) { return range <= 0.75 ? 'S' : range <= 3 ? 'M' : 'L'; }

// Effective (after auto modes) control values.
function effControls(g) {
  const r = g.radar, S = SETS[r.set], P = PRESETS[r.preset] || PRESETS.coastal;
  const auto = S.autoModes;
  const gain = auto && r.gainAuto ? P.gain : r.gain;
  const sea = auto && r.seaAuto ? P.sea(g.world.wind.kn) : r.sea;
  const rain = auto && r.preset === 'weather' && r.rain < P.rain ? P.rain : r.rain;
  return { gain, sea, rain };
}
function tuneLossDb(r) {
  if (!SETS[r.set].tune) return 0;
  const e = (r.tune - r.tuneOpt) / 14;
  return 22 * (1 - Math.exp(-e * e));
}
function headingOffset(r) { return r.headingError + r.align; }
function displayRot(g) {
  const r = g.radar;
  return r.mode === 'HU' ? g.world.own.hdg : r.mode === 'NU' ? 0 : r.cuRef;
}

// ------------------------------------------------------------------------------------------------
class Scope {
  constructor(ppi, ovl) {
    this.ppi = ppi; this.ovl = ovl;
    this.pctx = ppi.getContext('2d'); this.octx = ovl.getContext('2d');
    this.inten = new Float32Array(NB * NC); this.tag = new Uint8Array(NB * NC);
    this.swept = new Float64Array(NB).fill(-1e9);
    this.fade = new Float32Array(NB);
    this.sum = new Float64Array(NC); this.land = new Float64Array(NC); this.dom = new Float64Array(NC);
    this.domTag = new Uint8Array(NC); this.stc = new Float64Array(NC);
    this.size = 0; this.center = [0, 0]; this.lutKey = '';
    this.pal = null; this.palSet = '';
  }
  clear() { this.inten.fill(0); this.tag.fill(0); this.swept.fill(-1e9); }

  resize(cssSize, dpr) {
    const px = Math.round(Math.min(cssSize * dpr, 760));
    if (px === this.size && this.css === cssSize) return;
    this.size = px; this.css = cssSize; this.dpr = px / cssSize;
    for (const c of [this.ppi, this.ovl]) { c.width = px; c.height = px; c.style.width = cssSize + 'px'; c.style.height = cssSize + 'px'; }
    this.img = this.pctx.createImageData(px, px);
    this.u32 = new Uint32Array(this.img.data.buffer);
    this.lutKey = '';
  }
  // Geometry in CSS pixels.
  get R() { return this.css / 2 - 18; }
  ownCenter(g) {
    const r = g.radar, w = g.world, c = this.css / 2, R = this.R, rot = displayRot(g);
    let ox = 0, oy = 0;
    if (r.motion === 'TM' && r.tmCenter) {
      const dx = w.own.x - r.tmCenter[0], dy = w.own.y - r.tmCenter[1];
      const b = Math.atan2(dx, dy) / D2R - rot, d = Math.hypot(dx, dy) / r.range * R;
      ox = d * Math.sin(b * D2R); oy = -d * Math.cos(b * D2R);
    } else if (r.offCentre) {
      const b = w.own.hdg - rot;
      ox = -0.5 * R * Math.sin(b * D2R); oy = 0.5 * R * Math.cos(b * D2R);
    }
    return [c + ox, c + oy];
  }
  buildLUT(center) {
    const N = this.size, k = this.dpr, R = this.R * k, cx = center[0] * k, cy = center[1] * k, mid = N / 2;
    const rim = (this.css / 2 - 2) * k;
    this.lutC = this.lutC && this.lutC.length === N * N ? this.lutC : new Int16Array(N * N);
    this.lutB = this.lutB && this.lutB.length === N * N ? this.lutB : new Uint16Array(N * N);
    const cellPerPx = NC / SPAN / R;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const p = y * N + x;
      if (Math.hypot(x + 0.5 - mid, y + 0.5 - mid) > rim) { this.lutC[p] = -1; continue; }
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const c = Math.floor(Math.hypot(dx, dy) * cellPerPx);
      if (c >= NC) { this.lutC[p] = -2; continue; }
      this.lutC[p] = c;
      this.lutB[p] = Math.floor(norm360(Math.atan2(dx, -dy) / D2R) / BIN_DEG) & (NB - 1);
    }
  }

  // ---------- per-frame physics context ----------
  frameCtx(g) {
    const r = g.radar, w = g.world, o = w.own, S = SETS[r.set];
    const c = effControls(g);
    const pulse = S.pulseCtl ? PULSES[r.pulse] : { res: S.res, db: 0 };
    const res = pulse.res, Rmax = r.range * SPAN, cellNm = Rmax / NC;
    const tl = tuneLossDb(r);
    const power = rr => (r.set === 'clearview' ? -4 - Math.max(0, rr - 4) * 1.0 : 0) + pulse.db - tl;
    const minR = S.mainBang ? res * 0.5 + 0.006 : r.set === 'clearview' ? 0.003 : 0.012;
    const infos = [];
    for (const t of w.targets) {
      const rt = Math.max(dist(o.x, o.y, t.x, t.y), 0.004);
      if (rt > Rmax + 1 && !t.sart) continue;
      if (rt > horizonNm(o.antH, t.h)) continue;
      if (rt < minR) continue;
      const bt = bearingTo(o.x, o.y, t.x, t.y);
      let att = power(rt);
      for (const rc of w.rain) att -= rainChord(o, t, rc) * 1.5 * (rc.db / 12);
      for (const s of w.targets) {
        if (s === t || s.len < 50) continue;
        const rs = dist(o.x, o.y, s.x, s.y);
        if (rs >= rt - 0.05) continue;
        const half = Math.atan(s.len / 1852 / 2 / rs) / D2R + 0.6;
        if (Math.abs(angDiff(bt, bearingTo(o.x, o.y, s.x, s.y))) < half) att -= 18;
      }
      // Echo strength changes from one antenna turn to the next. Small hulls swing widely, and waves
      // hide low boats in their troughs on some turns. Large steel ships stay steady.
      const turn = Math.floor(w.t * S.rpm / 60);
      if (t._turn !== turn) { t._turn = turn; t._flu = fluctuation(t, w.wind.kn); }
      const P0 = t.rcs * t._flu * Math.pow(10, att / 10) / Math.pow(rt, 4);
      const rel = angDiff(bt, o.hdg);
      const geo = relGeom(w, t);
      infos.push({
        t, rt, bt, P0, ext: res + t.len / 1852 * 0.3, closing: geo.closing,
        multi: t.rcs >= 1000 && rt < 0.6 && Math.abs(Math.abs(rel) - 90) < 35,
        raconOn: t.racon && ((w.t + (t.raconPhase ?? Math.abs(t.x * 1000 | 0) % 17)) % 40) < 22,
      });
    }
    const gainDb = -20 + 0.55 * c.gain;
    for (let i = 0; i < NC; i++) this.stc[i] = c.sea / 100 * 50 * Math.exp(-((i + 0.5) * cellNm) / 0.6);
    return { r, w, o, S, c, res, Rmax, cellNm, power, gainDb, infos, ftc: Math.min(0.97, c.rain / 100 * 1.4), minR,
      sl: Math.pow(10, S.sidelobeDb / 10), bw: S.bw, unamb: r.range <= 3 ? 54 : 108 };
  }

  computeRay(f, theta, bin) {
    const { r, w, o, S, cellNm, Rmax } = f;
    const sum = this.sum, land = this.land, dom = this.dom, domTag = this.domTag;
    sum.fill(0); land.fill(0); dom.fill(0); domTag.fill(0);
    const dopp = S.doppler && r.doppler;
    const loss = Math.pow(10, -relLoss({ radar: r, world: w }, theta) / 10);
    const addCells = (r0, r1, p, tg) => {
      let c0 = Math.floor(r0 / cellNm), c1 = Math.floor(r1 / cellNm);
      if (c0 >= NC || c1 < 0) return;
      c0 = Math.max(c0, 0); c1 = Math.min(c1, NC - 1);
      for (let c = c0; c <= c1; c++) { sum[c] += p; if (p > dom[c]) { dom[c] = p; domTag[c] = tg; } }
    };
    // Point targets.
    for (const ti of f.infos) {
      const d = angDiff(theta, ti.bt), ad = Math.abs(d);
      let gp;
      if (ad < 2.5 * f.bw) gp = Math.exp(-2.773 * (d / f.bw) * (d / f.bw)) + f.sl * 0.5;
      else if (ad < 50 && ti.P0 * f.sl > 0.02) { const cc = Math.cos(ad * 0.35); gp = f.sl * (0.3 + 0.7 * cc * cc); }
      else gp = 0;
      const tg = dopp ? (ti.closing > 2 ? 1 : ti.closing < -2 ? 2 : 0) : 0;
      if (gp > 0) {
        const p = ti.P0 * gp;
        if (p > 2e-4) {
          addCells(ti.rt, ti.rt + ti.ext, p, tg);
          if (ti.multi && ad < f.bw) { addCells(2 * ti.rt, 2 * ti.rt + ti.ext, p * 0.16, tg); addCells(3 * ti.rt, 3 * ti.rt + ti.ext, p * 0.025, tg); }
        }
      }
      if (ti.raconOn && ad < f.bw * 0.8) {
        const code = MORSE[ti.t.racon] || '-..';
        const L = 1.1, units = []; for (const ch of code) { units.push(ch === '-' ? 3 : 1, 0); }
        const tot = units.reduce((a, b) => a + (b || 1), 0), u = L / tot;
        let rr = ti.rt + 0.08;
        for (const k of units) { const len = (k || 1) * u; if (k) addCells(rr, rr + len, 2000, 0); rr += len; }
      }
      if (ti.t.sart && ti.rt < 8) {
        const spread = ti.rt > 1.2 ? f.bw * 0.7 : f.bw * 0.7 + 180 * (1.2 - ti.rt) / 1.2;
        if (ad < spread) for (let k = 0; k < 12; k++) { const rk = ti.rt + k * 0.64; addCells(rk, rk + 0.05, 700, 0); }
      }
    }
    // Land, with the beam smearing coastline edges sideways.
    const offs = [-0.35 * f.bw, 0, 0.35 * f.bw], wts = [0.55, 1, 0.55];
    const binC = bin >> 1;
    for (let k = 0; k < 3; k++) {
      const th = theta + offs[k], dx = Math.sin(th * D2R), dy = Math.cos(th * D2R);
      for (const L of w.land) {
        const hits = rayPolyHits(o.x, o.y, dx, dy, L.pts, Rmax);
        let inside = pointInPoly(o.x, o.y, L.pts);
        let segs = [];
        if (inside) { if (hits.length) segs.push([0, hits[0]]); for (let i = 1; i + 1 < hits.length; i += 2) segs.push([hits[i], hits[i + 1]]); }
        else for (let i = 0; i < hits.length; i += 2) segs.push([hits[i], i + 1 < hits.length ? hits[i + 1] : Rmax]);
        for (const [tin, tout] of segs) {
          // Skip seams where one coastline shape meets another inland: the ray is already over land there.
          if (tin > 0.01 && w.land.some(L2 => L2 !== L && pointInPoly(o.x + dx * (tin - 0.01), o.y + dy * (tin - 0.01), L2.pts))) continue;
          const end = Math.min(tout, tin + 0.7);
          const c0 = Math.max(0, Math.floor(tin / cellNm)), c1 = Math.min(NC - 1, Math.floor(end / cellNm));
          for (let c = c0; c <= c1; c++) {
            const rr = Math.max((c + 0.5) * cellNm, 0.02);
            const shore = L.edge === 'beach' && rr - tin < 0.25;
            if (rr > horizonNm(o.antH, shore ? 2 : L.h)) continue;
            // Bright leading edge, patchy texture behind it, fading with depth as the high ground shadows itself.
            const d = rr - tin, dHill = L.edge === 'beach' ? d - 0.25 : d;
            const base = L.edge === 'cliff' ? 20 : shore ? -6 : 12;
            const edge = !shore && dHill < 0.05 ? 8 : 0;
            const tex = (hash2(bin >> 3, Math.floor(rr / 0.05)) - 0.5) * 16 + (hash2(binC, Math.floor(rr / 0.01)) - 0.5) * 7;
            const db = base + edge - 30 * Math.log10(rr) - Math.max(0, dHill) * 14 + tex + f.power(rr);
            const p = Math.pow(10, db / 10) * wts[k];
            if (p > land[c]) land[c] = p;
          }
        }
      }
    }
    for (let c = 0; c < NC; c++) sum[c] += land[c];
    // Second-trace echo from distant land (classic only).
    if (S.secondTrace && w.ghost && angDiff(theta, w.ghost.b0) >= 0 && angDiff(theta, w.ghost.b1) <= 0) {
      const ra = w.ghost.trueR % f.unamb;
      if (ra < Rmax) {
        const c0 = Math.floor(ra / cellNm), c1 = Math.min(NC - 1, Math.floor((ra + 0.35) / cellNm));
        for (let c = c0; c <= c1; c++) sum[c] += Math.pow(10, 1.4 + (hash2(binC, c) - 0.5) * 0.8);
      }
    }
    // Rain cells.
    const dxm = Math.sin(theta * D2R), dym = Math.cos(theta * D2R), tslow = Math.floor(w.t / 2);
    for (const rc of w.rain) {
      const cx = rc.x - o.x, cy = rc.y - o.y, tc = cx * dxm + cy * dym, d2 = cx * cx + cy * cy - tc * tc;
      if (d2 > rc.r * rc.r) continue;
      const half = Math.sqrt(rc.r * rc.r - d2);
      const c0 = Math.max(0, Math.floor((tc - half) / cellNm)), c1 = Math.min(NC - 1, Math.floor((tc + half) / cellNm));
      for (let c = c0; c <= c1; c++) {
        const rr = (c + 0.5) * cellNm, px = rr * dxm - cx, py = rr * dym - cy;
        const q = (px * px + py * py) / (rc.r * rc.r);
        if (q >= 1) continue;
        const db = rc.db - 8 - 20 * Math.log10(Math.max(rr, 0.2)) + f.power(rr);
        sum[c] += Math.pow(10, db / 10) * Math.pow(1 - q, 0.7) * (0.3 + 1.2 * hash2(binC + tslow * 7, c + tslow)) * Math.pow(-Math.log(Math.random() + 1e-9), 1.3);
      }
    }
    // Sea clutter, worst upwind, fresh pattern every sweep.
    const wind = w.wind.kn;
    if (wind >= 4) {
      const C0 = -36 + wind * 1.25 + 3 * Math.cos(angDiff(theta, w.wind.from) * D2R), rc = 0.3 + wind * 0.02;
      for (let c = 0; c < NC; c++) {
        const rr = (c + 0.5) * cellNm;
        if (rr > 3.5) break;
        const m = C0 - 30 * Math.log10(Math.max(rr, 0.03)) - (rr > rc ? 60 * Math.log10(rr / rc) : 0);
        if (m < -45) break;
        sum[c] += Math.pow(10, m / 10) * Math.pow(-Math.log(Math.random() + 1e-9), 1.7) * 0.6;
      }
    }
    // Interference from another boat's radar (classic, IR off).
    if (S.interference && w.interference && !r.ir) {
      const ph = Math.floor(w.t * 3);
      if (((bin + ph) % 37) < 2) for (let c = 0; c < NC; c++) if (((c + bin * 3 + ph * 5) % 11) === 0) sum[c] += 40;
    }
    if (S.mainBang) { const c1 = Math.floor((f.res + 0.012) / cellNm); for (let c = 0; c <= Math.min(c1, NC - 1); c++) sum[c] += 1600; }

    // Receiver: losses, rain clutter differentiator, noise, sea clutter STC, gain, display mapping.
    const base = bin * NC, inten = this.inten, tagB = this.tag, ftc = f.ftc, W = 10;
    let run = 0;
    const raw = this.raw || (this.raw = new Float64Array(NC));
    for (let c = 0; c < NC; c++) raw[c] = sum[c] * loss;
    for (let c = 0; c < NC; c++) {
      let x = raw[c];
      if (ftc > 0) { const avg = run / W; x = Math.max(x - ftc * avg, x * 0.04); run += raw[c] - (c >= W ? raw[c - W] : 0); }
      x += 0.00316 * -Math.log(Math.random() + 1e-12);
      const db = 10 * Math.log10(x) - this.stc[c] + f.gainDb;
      let v = db / 22;
      v = v < 0 ? 0 : v > 1 ? 1 : v;
      if (S.levels) v = v < 0.1 ? 0 : Math.ceil(v * S.levels) / S.levels;
      inten[base + c] = v;
      tagB[base + c] = dopp && dom[c] > 0.5 * sum[c] ? domTag[c] : 0;
    }
  }

  sweep(g, dtSim) {
    const r = g.radar, w = g.world;
    if (r.power !== 'tx' || dtSim <= 0) return;
    const S = SETS[r.set];
    const adv = Math.min(S.rpm * 6 * dtSim, 360);
    const f = this.frameCtx(g);
    const a0 = r.antRel, a1 = a0 + adv;
    for (let k = Math.ceil(a0 / BIN_DEG); k <= Math.floor(a1 / BIN_DEG); k++) {
      const theta = norm360(w.own.hdg + k * BIN_DEG);
      const bin = Math.floor(theta / BIN_DEG) & (NB - 1);
      this.computeRay(f, theta, bin);
      this.swept[bin] = w.t;
    }
    r.antRel = a1 % 360;
  }

  // Echo strength (0..1) currently painted at a world position.
  echoAt(g, x, y) {
    const o = g.world.own, rt = dist(o.x, o.y, x, y), cellNm = g.radar.range * SPAN / NC;
    const c = Math.floor(rt / cellNm);
    if (c >= NC) return 0;
    const b = Math.floor(bearingTo(o.x, o.y, x, y) / BIN_DEG);
    let m = 0;
    for (let db = -4; db <= 4; db++) {
      const bb = (b + db + NB) & (NB - 1);
      if (g.world.t - this.swept[bb] > 60 / SETS[g.radar.set].rpm * 1.6) continue;
      for (let dc = -1; dc <= 3; dc++) { const cc = c + dc; if (cc >= 0 && cc < NC) m = Math.max(m, this.inten[bb * NC + cc]); }
    }
    return m;
  }
  targetVisible(g, t, th = 0.18) { return this.echoAt(g, t.x, t.y) > th; }

  buildPalette(setId) {
    const pal = new Uint32Array(3 * 256);
    const px = (r, g, b) => (255 << 24) | (b << 16) | (g << 8) | r;
    const ramp = (stops, v) => {
      for (let i = 1; i < stops.length; i++) if (v <= stops[i][0]) {
        const [v0, c0] = stops[i - 1], [v1, c1] = stops[i], k = (v - v0) / (v1 - v0);
        return [0, 1, 2].map(j => Math.round(c0[j] + (c1[j] - c0[j]) * k));
      }
      return stops[stops.length - 1][1];
    };
    const sets = {
      classic: { bg: [7, 5, 2], s: [[0, [7, 5, 2]], [0.12, [70, 34, 0]], [0.45, [215, 125, 10]], [0.75, [255, 180, 40]], [1, [255, 236, 170]]] },
      clearview: { bg: [4, 20, 48], s: [[0, [4, 20, 48]], [0.2, [96, 104, 58]], [0.5, [214, 190, 52]], [1, [255, 236, 90]]] },
      sentinel: { bg: [3, 8, 22], s: [[0, [3, 8, 22]], [0.15, [18, 70, 120]], [0.5, [40, 160, 200]], [0.8, [150, 225, 230]], [1, [240, 245, 225]]] },
    };
    const P = sets[setId];
    for (let i = 0; i < 256; i++) {
      const v = i / 255;
      const c = ramp(P.s, v); pal[i] = px(c[0], c[1], c[2]);
      const a = ramp([[0, P.bg], [0.12, [120, 20, 20]], [0.6, [255, 64, 56]], [1, [255, 170, 150]]], v); pal[256 + i] = px(a[0], a[1], a[2]);
      const b = ramp([[0, P.bg], [0.12, [10, 90, 50]], [0.6, [50, 215, 120]], [1, [180, 255, 200]]], v); pal[512 + i] = px(b[0], b[1], b[2]);
    }
    this.pal = pal; this.palSet = setId; this.bg = pal[0];
  }

  compose(g) {
    const r = g.radar, w = g.world, S = SETS[r.set];
    if (this.palSet !== r.set) this.buildPalette(r.set);
    const center = this.ownCenter(g);
    const key = this.size + ':' + center[0].toFixed(1) + ':' + center[1].toFixed(1);
    if (key !== this.lutKey) { this.buildLUT(center); this.lutKey = key; }
    const on = r.power === 'tx', period = 60 / S.rpm;
    for (let b = 0; b < NB; b++) {
      const age = (w.t - this.swept[b]) / period;
      this.fade[b] = !on ? 0 : S.persist === 'phosphor'
        ? (age < 1 ? 1 - 0.45 * age : Math.max(0, 0.55 - (age - 1) * 0.6))
        : (age < 1.3 ? 1 : Math.max(0, 1 - (age - 1.3)));
    }
    const lutC = this.lutC, lutB = this.lutB, u32 = this.u32, inten = this.inten, tag = this.tag, pal = this.pal, fade = this.fade;
    const bg = r.power === 'off' ? 0xff050505 : this.bg;
    const rotBins = Math.round(norm360(displayRot(g) - headingOffset(r)) / BIN_DEG) & (NB - 1);
    for (let p = 0, n = u32.length; p < n; p++) {
      const c = lutC[p];
      if (c === -1) { u32[p] = 0; continue; }
      if (c === -2 || !on) { u32[p] = bg; continue; }
      const b = (lutB[p] + rotBins) & (NB - 1), i = b * NC + c;
      const v = inten[i] * fade[b];
      u32[p] = v < 0.02 ? bg : pal[(tag[i] << 8) + ((v * 255) | 0)];
    }
    this.pctx.putImageData(this.img, 0, 0);
  }

  // ---------- coordinate helpers (CSS px) ----------
  toScreen(g, brg, rNm, radarDerived = true) {
    const [cx, cy] = this.ownCenter(g);
    const a = (brg - displayRot(g) + (radarDerived ? headingOffset(g.radar) : 0)) * D2R;
    const k = rNm / g.radar.range * this.R;
    return [cx + k * Math.sin(a), cy - k * Math.cos(a)];
  }
  worldToScreen(g, x, y, radarDerived = true) {
    const o = g.world.own;
    return this.toScreen(g, bearingTo(o.x, o.y, x, y), dist(o.x, o.y, x, y), radarDerived);
  }
  fromScreen(g, sx, sy) {
    const [cx, cy] = this.ownCenter(g), dx = sx - cx, dy = sy - cy;
    const rNm = Math.hypot(dx, dy) / this.R * g.radar.range;
    const brg = norm360(Math.atan2(dx, -dy) / D2R + displayRot(g) - headingOffset(g.radar));
    const o = g.world.own, [x, y] = polar(o.x, o.y, brg, rNm);
    return { rNm, brg, x, y };
  }
  inDisplay(sx, sy) { return Math.hypot(sx - this.css / 2, sy - this.css / 2) < this.css / 2 - 4; }

  // ---------- overlay ----------
  drawOverlay(g, ui) {
    const ctx = this.octx, k = this.dpr, css = this.css, r = g.radar, w = g.world, o = w.own, S = SETS[r.set];
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, css, css);
    const theme = OVL_THEME[r.set];
    const mid = css / 2, rim = css / 2 - 2;
    // Bezel ring with bearing scale.
    ctx.lineWidth = 1; ctx.strokeStyle = theme.scale; ctx.fillStyle = theme.scale;
    ctx.beginPath(); ctx.arc(mid, mid, rim, 0, 2 * Math.PI); ctx.stroke();
    const rot = displayRot(g), relScale = r.mode === 'HU';
    ctx.font = '600 9.5px "Chakra Petch", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let d = 0; d < 360; d += 5) {
      const a = (d - (relScale ? 0 : rot)) * D2R, len = d % 30 === 0 ? 8 : d % 10 === 0 ? 5 : 3;
      const s = Math.sin(a), c = Math.cos(a);
      ctx.beginPath(); ctx.moveTo(mid + s * rim, mid - c * rim); ctx.lineTo(mid + s * (rim - len), mid - c * (rim - len)); ctx.stroke();
      if (d % 30 === 0 && css > 300) ctx.fillText(String(d).padStart(3, '0'), mid + s * (rim - 15), mid - c * (rim - 15));
    }
    // North marker: in Head Up and Course Up the rim counts from the bow, so show where north is.
    if (r.mode !== 'NU' && r.power !== 'off') {
      const na = (0 - rot) * D2R, s = Math.sin(na), c = Math.cos(na), rr = rim - 22;
      ctx.save(); ctx.translate(mid + s * rr, mid - c * rr); ctx.rotate(na);
      ctx.fillStyle = theme.north; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 3); ctx.lineTo(-5, 3); ctx.closePath(); ctx.fill();
      ctx.font = '700 10px "Chakra Petch", monospace'; ctx.fillText('N', 0, 12);
      ctx.restore();
    }
    if (r.power !== 'tx') {
      ctx.fillStyle = theme.text; ctx.font = '600 15px "Chakra Petch", monospace';
      const msg = r.power === 'off' ? '' : r.power === 'warming' ? 'WARM-UP  ' + Math.ceil(r.warmLeft) + ' s' : 'STANDBY';
      ctx.fillText(msg, mid, mid);
      if (r.power === 'standby') { ctx.font = '500 11px "Chakra Petch", monospace'; ctx.fillText('Antenna stopped · not transmitting', mid, mid + 20); }
      this.drawMarkers(g, ui, ctx, theme);
      return;
    }
    const [cx, cy] = this.ownCenter(g), R = this.R;
    ctx.save(); ctx.beginPath(); ctx.arc(mid, mid, rim - 1, 0, 2 * Math.PI); ctx.clip();
    // Chart overlay (GPS-placed, so no heading offset).
    if (S.chart && r.chart) {
      ctx.strokeStyle = theme.chart; ctx.fillStyle = theme.chartFill; ctx.lineWidth = 1;
      for (const L of w.land) {
        ctx.beginPath();
        L.pts.forEach(([x, y], i) => { const [sx, sy] = this.worldToScreen(g, x + w.chartOffset[0], y + w.chartOffset[1], false); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      for (const t of w.targets) if (/buoy|racon/.test(t.kind)) {
        const [sx, sy] = this.worldToScreen(g, t.x + w.chartOffset[0], t.y + w.chartOffset[1], false);
        ctx.beginPath(); ctx.moveTo(sx, sy - 5); ctx.lineTo(sx + 3.5, sy + 3); ctx.lineTo(sx - 3.5, sy + 3); ctx.closePath(); ctx.stroke();
      }
    }
    // Range rings.
    const ring = RINGS[r.range];
    ctx.strokeStyle = theme.ring; ctx.lineWidth = 0.8; ctx.fillStyle = theme.ringText; ctx.font = '500 9.5px "Chakra Petch", monospace';
    for (let d = ring; d <= r.range * SPAN + 1e-9; d += ring) {
      const px = d / r.range * R;
      ctx.beginPath(); ctx.arc(cx, cy, px, 0, 2 * Math.PI); ctx.stroke();
      if (d <= r.range + 1e-9) ctx.fillText(fmtNm(d), cx + px * 0.707 + 10, cy - px * 0.707 - 4);
    }
    // Heading line.
    const ha = (o.hdg - rot) * D2R;
    ctx.strokeStyle = theme.heading; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(ha) * css, cy - Math.cos(ha) * css); ctx.stroke();
    // Waypoint.
    if (w.dest) {
      const [sx, sy] = this.worldToScreen(g, w.dest.x, w.dest.y, false);
      ctx.strokeStyle = theme.wpt; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(sx, sy, 6, 0, 2 * Math.PI); ctx.moveTo(sx - 9, sy); ctx.lineTo(sx + 9, sy); ctx.moveTo(sx, sy - 9); ctx.lineTo(sx, sy + 9); ctx.stroke();
      ctx.fillStyle = theme.wpt; ctx.fillText('WPT', sx + 18, sy - 9);
    }
    // Guard zone.
    if (r.guard.on) {
      const a0 = (o.hdg - r.guard.half - rot - 90) * D2R, a1 = (o.hdg + r.guard.half - rot - 90) * D2R;
      ctx.strokeStyle = r.guard.alarm ? theme.alarm : theme.guard; ctx.setLineDash([3, 3]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(cx, cy, r.guard.r1 / r.range * R, a0, a1); ctx.arc(cx, cy, r.guard.r0 / r.range * R, a1, a0, true); ctx.closePath(); ctx.stroke();
      ctx.setLineDash([]);
    }
    // Trails.
    if (r.trails.len > 0) {
      ctx.fillStyle = theme.trail;
      for (const t of w.targets) {
        for (const h of t.hist) {
          if (!h.vis || w.t - h.t > r.trails.len) continue;
          let sx, sy;
          if (r.trails.true) [sx, sy] = this.worldToScreen(g, h.x, h.y);
          else [sx, sy] = this.worldToScreen(g, o.x + (h.x - h.ox), o.y + (h.y - h.oy));
          const a = 1 - (w.t - h.t) / r.trails.len;
          ctx.globalAlpha = 0.15 + 0.6 * a; ctx.fillRect(sx - 1.3, sy - 1.3, 2.6, 2.6);
        }
      }
      ctx.globalAlpha = 1;
    }
    // AIS (GPS-placed).
    if (S.ais && r.ais) {
      ctx.strokeStyle = theme.ais; ctx.fillStyle = theme.ais; ctx.lineWidth = 1.2;
      for (const t of w.targets) {
        if (!t.ais) continue;
        const d = dist(o.x, o.y, t.x, t.y); if (d > r.range * SPAN) continue;
        const [sx, sy] = this.worldToScreen(g, t.x, t.y, false), a = (t.cog - rot) * D2R;
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.stroke();
        if (t.sog > 0.3) { ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, -8 - t.sog / 10 / r.range * R); ctx.stroke(); }
        ctx.restore();
        if (t.name) { ctx.font = '500 9.5px "Chakra Petch", monospace'; ctx.textAlign = 'left'; ctx.fillText(t.name, sx + 9, sy + 3); ctx.textAlign = 'center'; }
      }
    }
    // MARPA.
    for (const m of r.marpa) {
      const t = w.targets.find(q => q.id === m.id); if (!t) continue;
      const [sx, sy] = this.worldToScreen(g, t.x, t.y);
      ctx.strokeStyle = theme.marpa; ctx.lineWidth = 1.3;
      if (w.t - m.since < 30) { ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.arc(sx, sy, 9, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]); }
      else {
        ctx.beginPath(); ctx.arc(sx, sy, 7, 0, 2 * Math.PI); ctx.stroke();
        const geo = relGeom(w, t);
        let vx, vy;
        if (r.motion === 'TM') { vx = Math.sin(t.cog * D2R) * t.sog; vy = Math.cos(t.cog * D2R) * t.sog; } else { vx = geo.vx; vy = geo.vy; }
        const [ex, ey] = this.worldToScreen(g, t.x + vx / 10, t.y + vy / 10);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        // Target data box beside the echo, as real radars show it.
        const cpa = geo.cpa + m.err, tc = geo.tcpaMin;
        const lines = [m.label, `CPA ${cpa.toFixed(2)} NM`, tc > 0 ? `TCPA ${tc.toFixed(0)} MIN` : 'TCPA PAST'];
        ctx.font = '600 10px "Chakra Petch", monospace'; ctx.textAlign = 'left';
        const bx = sx + 12, by = sy + 10, bw = 92, bh = 40;
        ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = cpa < 0.5 && tc > 0 && tc < 30 ? theme.alarm : theme.marpa; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, bh);
        ctx.fillStyle = ctx.strokeStyle; lines.forEach((l, i) => ctx.fillText(l, bx + 6, by + 8 + i * 12));
        ctx.textAlign = 'center';
      }
    }
    // Parallel index line.
    if (r.pi.on) {
      const a = (o.hdg - rot) * D2R, off = r.pi.off / r.range * R;
      const nx = Math.cos(a), ny = Math.sin(a);
      const bx = cx + nx * off, by = cy + ny * off;
      ctx.strokeStyle = theme.ebl; ctx.setLineDash([8, 4]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(bx - Math.sin(a) * css, by + Math.cos(a) * css); ctx.lineTo(bx + Math.sin(a) * css, by - Math.cos(a) * css); ctx.stroke(); ctx.setLineDash([]);
    }
    // EBL and VRM.
    if (r.ebl.on) {
      const a = (r.ebl.brg - rot) * D2R;
      ctx.strokeStyle = theme.ebl; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(a) * css * 1.5, cy - Math.cos(a) * css * 1.5); ctx.stroke(); ctx.setLineDash([]);
    }
    if (r.vrm.on) {
      ctx.strokeStyle = theme.ebl; ctx.setLineDash([2, 4]); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(cx, cy, r.vrm.r / r.range * R, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
    }
    // Sweep line.
    const sa = (o.hdg + r.antRel - rot + headingOffset(r)) * D2R;
    const grad = ctx.createLinearGradient(cx, cy, cx + Math.sin(sa) * R * SPAN, cy - Math.cos(sa) * R * SPAN);
    grad.addColorStop(0, theme.sweep); grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.strokeStyle = grad; ctx.lineWidth = S.persist === 'phosphor' ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(sa) * R * SPAN, cy - Math.cos(sa) * R * SPAN); ctx.stroke();
    // Own track in true motion: your boat moves across a fixed picture and leaves a wake of dots.
    if (r.motion === 'TM' && w.ownHist) {
      ctx.fillStyle = theme.own;
      for (const p of w.ownHist) {
        if (w.t - p.t > 600) continue;
        const [sx, sy] = this.worldToScreen(g, p.x, p.y, false);
        ctx.globalAlpha = 0.2 + 0.5 * (1 - (w.t - p.t) / 600); ctx.fillRect(sx - 1, sy - 1, 2, 2);
      }
      ctx.globalAlpha = 1;
    }
    // Own boat symbol.
    ctx.strokeStyle = theme.own; ctx.lineWidth = 1.3;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ha);
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.quadraticCurveTo(4, -1, 3, 6); ctx.lineTo(-3, 6); ctx.quadraticCurveTo(-4, -1, 0, -7); ctx.stroke();
    ctx.restore();
    ctx.restore();
    this.drawMarkers(g, ui, ctx, theme);
  }

  drawMarkers(g, ui, ctx, theme) {
    // Contact brackets for recognition tasks, labels after a reveal, cursor.
    const o = g.world.own;
    ctx.font = '700 11px "Chakra Petch", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const m of ui.markers || []) {
      const p = markerPos(g, m); if (!p) continue;
      const [sx, sy] = this.worldToScreen(g, p[0], p[1]);
      const s = m.size || 12;
      ctx.strokeStyle = m.color || theme.bracket; ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(sx - s, sy - s + 5); ctx.lineTo(sx - s, sy - s); ctx.lineTo(sx - s + 5, sy - s);
      ctx.moveTo(sx + s - 5, sy - s); ctx.lineTo(sx + s, sy - s); ctx.lineTo(sx + s, sy - s + 5);
      ctx.moveTo(sx + s, sy + s - 5); ctx.lineTo(sx + s, sy + s); ctx.lineTo(sx + s - 5, sy + s);
      ctx.moveTo(sx - s + 5, sy + s); ctx.lineTo(sx - s, sy + s); ctx.lineTo(sx - s, sy + s - 5);
      ctx.stroke();
      if (m.letter) { ctx.fillStyle = m.color || theme.bracket; ctx.fillText(m.letter, sx + s + 8, sy - s + 2); }
    }
    if (ui.revealLabels) {
      ctx.font = '600 10.5px "Atkinson Hyperlegible", sans-serif';
      for (const L of ui.revealLabels) {
        const p = markerPos(g, L); if (!p) continue;
        const [sx, sy] = this.worldToScreen(g, p[0], p[1]);
        if (!this.inDisplay(sx, sy)) continue;
        const wtx = ctx.measureText(L.text).width + 10;
        ctx.fillStyle = 'rgba(8,14,18,0.82)'; ctx.fillRect(sx + 10, sy - 18, wtx, 16);
        ctx.fillStyle = '#F4E9C8'; ctx.textAlign = 'left'; ctx.fillText(L.text, sx + 15, sy - 10); ctx.textAlign = 'center';
        ctx.strokeStyle = '#F4E9C8'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx + 3, sy - 3); ctx.lineTo(sx + 10, sy - 10); ctx.stroke();
      }
    }
    if (ui.cursor && g.radar.power === 'tx') {
      const [x, y] = ui.cursor;
      ctx.strokeStyle = theme.cursor; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x - 10, y); ctx.lineTo(x - 3, y); ctx.moveTo(x + 3, y); ctx.lineTo(x + 10, y);
      ctx.moveTo(x, y - 10); ctx.lineTo(x, y - 3); ctx.moveTo(x, y + 3); ctx.lineTo(x, y + 10); ctx.stroke();
    }
  }
}

const OVL_THEME = {
  classic: { scale: 'rgba(255,176,64,0.55)', text: '#FFB547', ring: 'rgba(255,170,40,0.28)', ringText: 'rgba(255,190,90,0.6)', north: '#7FE0FF', heading: 'rgba(255,220,160,0.75)', ebl: '#FFE3A3', guard: 'rgba(255,200,120,0.6)', alarm: '#FF5A4E', trail: '#C98A2A', ais: '#9FE3FF', marpa: '#FFE3A3', sweep: 'rgba(255,214,140,0.85)', own: '#FFE3A3', bracket: '#7FE0FF', cursor: '#FFE3A3', wpt: '#9FE3FF', chart: 'rgba(160,200,255,0.5)', chartFill: 'rgba(160,200,255,0.06)' },
  clearview: { scale: 'rgba(170,200,240,0.55)', text: '#D7E6FF', ring: 'rgba(140,180,230,0.3)', ringText: 'rgba(190,215,250,0.7)', north: '#FF9F43', heading: 'rgba(230,240,255,0.8)', ebl: '#FFFFFF', guard: 'rgba(160,230,255,0.7)', alarm: '#FF5A4E', trail: '#8FA9D6', ais: '#62F0B0', marpa: '#FF9F43', sweep: 'rgba(200,220,255,0.35)', own: '#FFFFFF', bracket: '#FF9F43', cursor: '#FFFFFF', wpt: '#62F0B0', chart: 'rgba(180,170,120,0.65)', chartFill: 'rgba(150,130,70,0.18)' },
  sentinel: { scale: 'rgba(120,200,220,0.5)', text: '#CFEFF5', ring: 'rgba(90,170,200,0.28)', ringText: 'rgba(150,210,230,0.7)', north: '#F2C14E', heading: 'rgba(220,245,250,0.8)', ebl: '#F2F7C8', guard: 'rgba(150,230,240,0.7)', alarm: '#FF5A4E', trail: '#5E9DB0', ais: '#F2C14E', marpa: '#F2C14E', sweep: 'rgba(160,230,240,0.3)', own: '#F2F7C8', bracket: '#F2C14E', cursor: '#F2F7C8', wpt: '#F2C14E', chart: 'rgba(200,190,140,0.6)', chartFill: 'rgba(160,140,80,0.16)' },
};
const MORSE = { A: '.-', B: '-...', C: '-.-.', D: '-..', G: '--.', K: '-.-', M: '--', N: '-.', O: '---', T: '-', X: '-..-' };

const DROPOUT = { yacht: 0.35, kayak: 0.45, buoy: 0.12, buoy_refl: 0.05, yacht_refl: 0.05, fishing: 0.03 };
function fluctuation(t, windKn) {
  const sea = clamp(windKn / 12, 0.3, 1.5);
  if (Math.random() < (DROPOUT[t.kind] || 0) * sea) return 0.02;
  if (t.rcs < 50) return clamp(-Math.log(Math.random() + 1e-9), 0.15, 3);
  return 0.7 + 0.6 * Math.random();
}
function fmtNm(d) { return d < 1 ? String(+d.toFixed(3)).replace(/^0/, '') : String(+d.toFixed(2)); }
function relLoss(g, theta) {
  const o = g.world.own, rel = angDiff(theta, o.hdg);
  let db = 0;
  if (Math.abs(angDiff(rel, 180)) < 6) db += 20;          // mast shadow astern
  if (o.heel > 15) {
    const side = o.windSide === 'stbd' ? 90 : -90;
    if (Math.abs(angDiff(rel, side)) < 70) db += (o.heel - 15) * 1.4;
  }
  return db;
}
function rainChord(o, t, rc) {
  const dx = t.x - o.x, dy = t.y - o.y, L = Math.hypot(dx, dy);
  if (L < 1e-6) return 0;
  const ux = dx / L, uy = dy / L, cx = rc.x - o.x, cy = rc.y - o.y;
  const tc = cx * ux + cy * uy, d2 = cx * cx + cy * cy - tc * tc;
  if (d2 > rc.r * rc.r) return 0;
  const h = Math.sqrt(rc.r * rc.r - d2);
  return Math.max(0, Math.min(L, tc + h) - Math.max(0, tc - h));
}
// A marker refers to a target id, or to a fixed world point, or to a point relative to own boat.
function markerPos(g, m) {
  if (m.target) { const t = g.world.targets.find(q => q.id === m.target); return t ? [t.x, t.y] : null; }
  if (m.at) return m.at;
  if (m.rel) return polar(g.world.own.x, g.world.own.y, m.rel.trueBrg != null ? m.rel.trueBrg : g.world.own.hdg + m.rel.relBrg, m.rel.r);
  return null;
}
