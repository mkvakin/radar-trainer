// World model: geometry, objects, coastline, weather, motion.
// Coordinates are nautical miles: x grows east, y grows north. Bearings are degrees true, clockwise from north.

const D2R = Math.PI / 180;
function norm360(a) { a %= 360; return a < 0 ? a + 360 : a; }
function angDiff(a, b) { let d = norm360(a - b); return d > 180 ? d - 360 : d; }
function bearingTo(x0, y0, x1, y1) { return norm360(Math.atan2(x1 - x0, y1 - y0) / D2R); }
function dist(x0, y0, x1, y1) { return Math.hypot(x1 - x0, y1 - y0); }
function horizonNm(ha, ht) { return 2.21 * (Math.sqrt(Math.max(ha, 0)) + Math.sqrt(Math.max(ht, 0))); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function hash2(a, b) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function polar(x, y, brg, r) { return [x + r * Math.sin(brg * D2R), y + r * Math.cos(brg * D2R)]; }

// Physical defaults per object kind. rcs = radar cross-section in square metres, h = height above water in metres,
// len = length in metres.
const KIND_PHYS = {
  ship:       { rcs: 8000, h: 30, len: 200, ais: true },
  fishing:    { rcs: 120,  h: 8,  len: 20,  ais: true },
  ferry:      { rcs: 2500, h: 20, len: 90,  ais: true },
  yacht_refl: { rcs: 12,   h: 12, len: 12,  ais: false },
  yacht:      { rcs: 1.5,  h: 10, len: 11,  ais: false },
  kayak:      { rcs: 0.04, h: 0.8, len: 5,  ais: false },
  buoy:       { rcs: 3,    h: 3,  len: 3,   ais: false },
  buoy_refl:  { rcs: 25,   h: 3.5, len: 3,  ais: false },
  racon:      { rcs: 10,   h: 4,  len: 3,   ais: false },
  lighthouse: { rcs: 600,  h: 50, len: 15,  ais: false },
  anchored:   { rcs: 6000, h: 25, len: 180, ais: true },
  sart:       { rcs: 0.3,  h: 1,  len: 2,   ais: false },
};

let _tid = 1;
function mkTarget(kind, x, y, o = {}) {
  const p = KIND_PHYS[kind];
  return Object.assign({
    id: 't' + (_tid++), kind, x, y, cog: 0, sog: 0,
    rcs: p.rcs, h: p.h, len: p.len, ais: p.ais, name: o.name || null,
    racon: kind === 'racon' ? 'D' : null, sart: kind === 'sart',
    wander: kind === 'fishing', hist: [],
  }, o);
}

// --- Coastline of the invented Kestrel Sound -------------------------------------------------------
function kestrelLand() {
  return [
    { name: 'Gannet Head coast', h: 45, edge: 'cliff', pts: [
      [-14, 4.6], [-8, 4.4], [-5.5, 4.0], [-4.2, 3.5], [-3.6, 3.3], [-3.45, 4.7], [-2.55, 4.7], [-2.4, 3.3],
      [-1.2, 3.5], [0.2, 3.2], [0.9, 2.7], [1.3, 2.45], [1.8, 2.5], [2.3, 2.9], [2.8, 3.4], [2.8, 12], [-14, 12]] },
    { name: 'Long Strand', h: 25, edge: 'beach', pts: [
      [2.8, 3.4], [4.5, 3.7], [7, 3.9], [10, 4.1], [14, 4.3], [14, 12], [2.8, 12]] },
    { name: 'Tern Island', h: 30, edge: 'cliff', pts: [
      [5.3, 0.6], [5.5, 1.1], [6.1, 1.25], [6.7, 0.9], [6.8, 0.3], [6.4, -0.1], [5.8, -0.15], [5.4, 0.15]] },
    { name: 'Selkie shore', h: 35, edge: 'cliff', pts: [
      [-14, -8.9], [-6, -8.7], [-2, -8.6], [1, -8.9], [2.6, -8.5], [2.75, -9.8], [3.45, -9.8], [3.6, -8.4],
      [6, -8.2], [10, -7.7], [14, -7.9], [14, -16], [-14, -16]] },
  ];
}
const PLACES = {
  lighthouse: [1.5, 2.52], gannetS: [1.5, 1.6], ternS: [6, -0.8], selkieApproach: [3.1, -6.9],
  marrowInner: [-3.0, 4.3], marrowMouth: [-3.0, 3.2], selkieMouth: [3.1, -8.1],
};

function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function distToPoly(x, y, pts) {
  let best = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, ay] = pts[j], [bx, by] = pts[i];
    const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey;
    const t = l2 ? clamp(((x - ax) * ex + (y - ay) * ey) / l2, 0, 1) : 0;
    best = Math.min(best, Math.hypot(x - ax - t * ex, y - ay - t * ey));
  }
  return best;
}
function distToLand(world, x, y) {
  let best = Infinity;
  for (const L of world.land) {
    if (pointInPoly(x, y, L.pts)) return 0;
    best = Math.min(best, distToPoly(x, y, L.pts));
  }
  return best;
}
// All crossings of a ray with one polygon, sorted by distance.
function rayPolyHits(x0, y0, dx, dy, pts, maxR) {
  const hits = [];
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const px = pts[j][0], py = pts[j][1], ex = pts[i][0] - px, ey = pts[i][1] - py;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const qx = px - x0, qy = py - y0;
    const t = (qx * ey - qy * ex) / den, s = (qx * dy - qy * dx) / den;
    if (t > 0 && t < maxR && s >= 0 && s <= 1) hits.push(t);
  }
  return hits.sort((a, b) => a - b);
}
// Nearest land along a bearing: {r, L} or null.
function firstLand(world, x0, y0, brg, maxR) {
  const dx = Math.sin(brg * D2R), dy = Math.cos(brg * D2R);
  let best = null;
  for (const L of world.land) {
    const hits = rayPolyHits(x0, y0, dx, dy, L.pts, maxR);
    if (!hits.length) continue;
    const inside = pointInPoly(x0, y0, L.pts);
    const r = inside ? 0 : hits[0];
    if (!best || r < best.r) best = { r, L };
  }
  return best;
}

// --- World ------------------------------------------------------------------------------------------
function makeWorld(cfg = {}) {
  const w = {
    t: 0,
    own: Object.assign({ x: 0, y: 0, hdg: 0, sog: 0, antH: 8, heel: 0, windSide: 'stbd', setX: 0, setY: 0 }, cfg.own || {}),
    targets: cfg.targets || [],
    land: cfg.land === undefined ? kestrelLand() : cfg.land,
    rain: (cfg.rain || []).map(r => Object.assign({ vx: 0, vy: 0, db: 12 }, r)),
    wind: Object.assign({ kn: 8, from: 220 }, cfg.wind || {}),
    ghost: cfg.ghost || null,
    interference: !!cfg.interference,
    light: cfg.light || 'day',      // day | night
    fogNm: cfg.fogNm || null,       // visibility in nm when foggy
    chartOffset: cfg.chartOffset || [0, 0],
    dest: cfg.dest || null,         // {x,y,name}
    extras: cfg.extras || [],       // region contacts for recognition, see catalog.js
    seed: cfg.seed || 7,
  };
  w.rand = makeRng(w.seed);
  if (cfg.antH) w.own.antH = cfg.antH;
  return w;
}

function stepWorld(w, dt) {
  w.t += dt;
  const o = w.own;
  o.x += (Math.sin(o.hdg * D2R) * o.sog + o.setX) * dt / 3600;
  o.y += (Math.cos(o.hdg * D2R) * o.sog + o.setY) * dt / 3600;
  for (const t of w.targets) {
    if (t.wander) {
      t._next = t._next ?? w.t + 30 + w.rand() * 60;
      if (w.t > t._next) {
        t.cog = norm360(t.cog + (w.rand() - 0.5) * 140);
        t.sog = w.rand() < 0.3 ? 0.5 : 2 + w.rand() * 3;
        t._next = w.t + 40 + w.rand() * 80;
      }
    }
    if (t.route && t.route.length) {
      const [wx, wy] = t.route[0];
      if (dist(t.x, t.y, wx, wy) < 0.05) t.route.shift();
      else t.cog = bearingTo(t.x, t.y, wx, wy);
    }
    t.x += Math.sin(t.cog * D2R) * t.sog * dt / 3600;
    t.y += Math.cos(t.cog * D2R) * t.sog * dt / 3600;
  }
  for (const r of w.rain) { r.x += r.vx * dt / 3600; r.y += r.vy * dt / 3600; }
}

// Relative geometry between own boat and a target.
function relGeom(w, t) {
  const o = w.own;
  const px = t.x - o.x, py = t.y - o.y;
  const vox = Math.sin(o.hdg * D2R) * o.sog + o.setX, voy = Math.cos(o.hdg * D2R) * o.sog + o.setY;
  const vtx = Math.sin(t.cog * D2R) * t.sog, vty = Math.cos(t.cog * D2R) * t.sog;
  const vx = vtx - vox, vy = vty - voy;
  const r = Math.hypot(px, py), v2 = vx * vx + vy * vy;
  const tcpaH = v2 > 1e-9 ? -(px * vx + py * vy) / v2 : 0;
  const tc = Math.max(0, tcpaH);
  const cpa = Math.hypot(px + vx * tc, py + vy * tc);
  const closing = r > 1e-6 ? -(px * vx + py * vy) / r : 0;
  return { r, brg: bearingTo(o.x, o.y, t.x, t.y), cpa, tcpaMin: tcpaH * 60, closing, vx, vy };
}
function rainVel(fromDeg, kn) { // rain cells drift downwind
  const to = norm360(fromDeg + 180);
  return { vx: Math.sin(to * D2R) * kn, vy: Math.cos(to * D2R) * kn };
}
