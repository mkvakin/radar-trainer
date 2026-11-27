// The curriculum. Each chapter has teaching steps and a check. Step types are run by app.js:
// info, do, ask, click, measure, estimate, fix, id (drill), pickset, mission.

const P = PLACES;
const lighthouse = () => mkTarget('lighthouse', ...P.lighthouse, { name: 'Gannet Head light' });
const buoyGannet = () => mkTarget('buoy', ...P.gannetS, { name: 'Gannet S', color: '#C23B2E' });
const TUNED = (o = {}) => Object.assign({ power: 'tx', gain: 66, sea: 30, rain: 0, tuned: true, safetyChecked: true }, o);
const VESSELS = /ship|fishing|ferry|yacht|kayak|anchored/;
const inBand = G => { const b = SETS[G.radar.set].gainBand, v = effControls(G).gain; return v >= b[0] && v <= b[1]; };
const tuneOk = G => !SETS[G.radar.set].tune || Math.abs(G.radar.tune - G.radar.tuneOpt) < 6;
const hdgOk = G => Math.abs(headingOffset(G.radar)) < 1.5;

// ---------- scenes ----------
const SCENES = {
  meet: () => ({ world: { own: { x: 0.5, y: -0.5, hdg: 0 }, wind: { kn: 6, from: 220 }, targets: [
    mkTarget('ship', -1.5, -2.2, { cog: 90, sog: 12, name: 'Nordic Star' }), buoyGannet(), lighthouse()] },
    radar: TUNED({ range: 3 }) }),
  power: () => ({ world: { own: { x: 1.5, y: -0.2, hdg: 0 }, wind: { kn: 14, from: 200 }, targets: [
    lighthouse(), mkTarget('buoy_refl', 1.78, 0.08, { name: 'Wreck buoy', color: '#2E8B57' }), buoyGannet()] },
    radar: { power: 'off', range: 6, gain: 50, sea: 0, rain: 0, tuneOff: 22, headingError: 10, align: 0, safetyChecked: false, gainAuto: false, seaAuto: false } }),
  range: () => ({ world: { own: { x: 5, y: -2, hdg: 30 }, wind: { kn: 5, from: 220 }, targets: [
    mkTarget('buoy_refl', 5.0, -1.0, { name: 'A' }), mkTarget('buoy_refl', 3.5, -2.0, { name: 'B' }), mkTarget('buoy_refl', 5.0, -4.5, { name: 'C' }),
    mkTarget('buoy_refl', 6.6, -3.2, { name: 'D' }), mkTarget('anchored', ...polar(5, -2, 307, 2.75), { name: 'E' }), mkTarget('buoy', ...P.ternS, { name: 'Tern S' })] },
    radar: TUNED({ range: 3 }) }),
  tune: () => ({ world: { own: { x: 0, y: -1, hdg: 0 }, wind: { kn: 22, from: 230 },
    rain: [Object.assign({ x: -1.88, y: -1.68, r: 0.6, db: 14 }, rainVel(230, 4))],
    targets: [mkTarget('ship', -1.78, -1.6, { cog: 50, sog: 4, rcs: 1500, len: 70, name: 'Coaster' }),
      mkTarget('buoy', -0.268, -1.225, { name: 'Hidden buoy' }),
      mkTarget('yacht_refl', ...polar(0, -1, 120, 1.2), { name: 'Raft 1' }), mkTarget('yacht_refl', ...polar(0, -1, 120, 1.2216), { name: 'Raft 2' })] },
    radar: { power: 'tx', range: 3, gain: 100, sea: 0, rain: 0, tuneOff: 25, safetyChecked: true, pulse: 'M', gainAuto: false, seaAuto: false } }),
  orient: () => ({ world: { own: { x: 0.3, y: 0.3, hdg: 60, sog: 6 }, wind: { kn: 6, from: 220 }, targets: [
    buoyGannet(), lighthouse(), mkTarget('yacht_refl', 0.5, -0.2, { cog: 200, sog: 5, name: 'Puffin' })] },
    radar: TUNED({ range: 3, mode: 'HU', motion: 'RM' }) }),
  measure: () => ({ world: { own: { x: 2.5, y: 0.2, hdg: 270 }, wind: { kn: 6, from: 220 }, targets: [
    lighthouse(), buoyGannet(), mkTarget('lighthouse', 5.3, 0.6, { name: 'Tern beacon', h: 20, rcs: 300 }), mkTarget('ship', 8, -2.5, { cog: 270, sog: 12, name: 'Arctic Dawn' })] },
    radar: TUNED({ range: 3, mode: 'HU' }) }),
  sidelobe: () => ({ world: { own: { x: 0, y: 0, hdg: 0 }, land: [], wind: { kn: 5, from: 220 }, targets: [
    mkTarget('anchored', ...polar(0, 0, 60, 0.35), { rcs: 6000, name: 'Big ship' })] }, radar: TUNED({ range: 0.75, gain: 80, sea: 5 }) }),
  multiple: () => ({ world: { own: { x: 0, y: 0, hdg: 0 }, land: [], wind: { kn: 5, from: 220 }, targets: [
    mkTarget('anchored', 0.28, 0, { rcs: 20000, name: 'Big ship' })] }, radar: TUNED({ range: 1.5, gain: 68, sea: 25 }) }),
  ghost: () => ({ world: { own: { x: 0, y: 0, hdg: 0 }, land: [], ghost: { b0: 210, b1: 228, trueR: 56.5 }, wind: { kn: 5, from: 220 }, targets: [
    mkTarget('buoy_refl', 0.8, 1.2)] }, radar: TUNED({ range: 3 }) }),
  interf: () => ({ world: { own: { x: 0, y: 0, hdg: 0 }, land: [], interference: true, wind: { kn: 5, from: 220 }, targets: [
    mkTarget('yacht_refl', 1.1, 0.9, { cog: 200, sog: 5 })] }, radar: TUNED({ range: 3, ir: false }) }),
  shadow: () => ({ world: { own: { x: 0, y: 0, hdg: 0 }, land: [], wind: { kn: 5, from: 220 }, targets: [
    mkTarget('yacht_refl', 0, -1.2, { name: 'Friend\'s yacht' }), mkTarget('buoy_refl', 0.9, 1.0)] }, radar: TUNED({ range: 3 }) }),
  heel: () => ({ world: { own: { x: 0, y: 0, hdg: 0, sog: 6, heel: 25, windSide: 'stbd' }, land: [], wind: { kn: 18, from: 80 }, targets: [
    mkTarget('yacht_refl', 1.5, 0.1, { rcs: 4, cog: 0, sog: 6, name: 'Windward yacht' })] }, radar: TUNED({ range: 3, sea: 40 }), heelCtl: true }),
  ghostCheck: () => ({ world: { own: { x: 0, y: 0, hdg: 10 }, land: [], ghost: { b0: 200, b1: 218, trueR: 56.5 }, wind: { kn: 6, from: 220 }, targets: [
    mkTarget('buoy_refl', ...polar(0, 0, 330, 1.6), { name: 'A' }),
    mkTarget('yacht_refl', ...polar(0, 0, 30, 1.9), { cog: 250, sog: 5, name: 'B' }),
    mkTarget('anchored', ...polar(0, 0, 100, 0.36), { rcs: 20000, name: 'C' }),
    mkTarget('fishing', ...polar(0, 0, 160, 2.2), { cog: 90, sog: 2, name: 'G' })] }, radar: TUNED({ range: 3, gain: 76, sea: 20 }) }),
  fog: () => ({ world: { own: { x: -2, y: -0.5, hdg: 180, sog: 6 }, fogNm: 0.15, wind: { kn: 8, from: 220 }, targets: [
    mkTarget('ship', 2.67, -2.5, { cog: 270, sog: 14, name: 'Baltic Trader' }), buoyGannet(), lighthouse()] },
    radar: TUNED({ range: 6 }) }),
  fogCheck: () => ({ world: { own: { x: -2, y: -0.5, hdg: 180, sog: 6 }, fogNm: 0.15, wind: { kn: 8, from: 220 }, targets: [
    mkTarget('ship', 2.67, -2.5, { cog: 270, sog: 14, name: 'Baltic Trader' }),
    mkTarget('ship', -10.2, -4.0, { cog: 90, sog: 14, name: 'Cape Ross' }),
    mkTarget('ship', 4, -6.5, { cog: 300, sog: 11, name: 'Morning Tide' }), lighthouse()] },
    radar: TUNED({ range: 6 }) }),
  pilot: () => ({ world: { own: { x: 0, y: 1.0, hdg: 90, sog: 6, setY: 0.5 }, wind: { kn: 8, from: 220 }, targets: [lighthouse(), buoyGannet()] },
    radar: TUNED({ range: 3 }) }),
  harbour: () => ({ world: { own: { x: -3, y: 1.5, hdg: 0, sog: 4, setX: 0.6 }, fogNm: 0.08, wind: { kn: 8, from: 250 }, dest: { x: P.marrowInner[0], y: P.marrowInner[1], name: 'Marrow Bay inner harbour' }, targets: [
    mkTarget('buoy', -3.75, 3.0, { name: 'Marrow port', color: '#C23B2E' }), mkTarget('buoy', -2.25, 3.0, { name: 'Marrow stbd', color: '#2E8B57' }),
    mkTarget('fishing', -3.0, 4.1, { cog: 180, sog: 4, wander: false, route: [[-3.1, 3.0], [-3.6, 0.5]], name: 'Kittiwake' })] },
    radar: TUNED({ range: 1.5, sea: 20 }) }),
  modern: () => ({ world: { own: { x: 0, y: -1, hdg: 45, sog: 5 }, wind: { kn: 18, from: 230 }, chartOffset: [0.07, 0.05], targets: [
    mkTarget('ship', 5, -2.5, { cog: 270, sog: 13, name: 'Arctic Dawn' }), mkTarget('ferry', -1, -3, { cog: 225, sog: 18, name: 'Selkie Spirit' }),
    mkTarget('yacht', ...polar(0, -1, 100, 1.0), { cog: 300, sog: 4, name: 'Shearwater' }), buoyGannet(), lighthouse()] },
    radar: { power: 'off', range: 3, gain: 60, sea: 30, rain: 0, safetyChecked: true } }),
  autoTrap: () => ({ world: { own: { x: 0, y: -1, hdg: 45, sog: 0 }, land: [], wind: { kn: 22, from: 230 }, targets: [
    mkTarget('yacht', ...polar(0, -1, 60, 0.6), { cog: 250, sog: 1, name: 'Shearwater' }), mkTarget('ship', 3, 1.5, { cog: 200, sog: 12, name: 'Arctic Dawn' })] },
    radar: { set: 'sentinel', power: 'tx', range: 1.5, gainAuto: true, seaAuto: true, preset: 'offshore', safetyChecked: true } }),
  sart: () => ({ world: { own: { x: 0, y: -5, hdg: 90, sog: 6 }, light: 'night', wind: { kn: 10, from: 220 }, targets: [mkTarget('sart', 5, -2, { name: 'Life raft' })] },
    radar: TUNED({ range: 6 }) }),
  exam: () => ({ world: { own: { x: -3.0, y: 4.2, hdg: 180, sog: 0 }, light: 'night', wind: { kn: 14, from: 230 },
    dest: { x: P.selkieMouth[0], y: P.selkieMouth[1], name: 'Port Selkie' },
    rain: [Object.assign({ x: -5, y: -4.5, r: 0.9, db: 14 }, rainVel(250, 9))],
    targets: [
      mkTarget('buoy', -3.75, 3.0, { name: 'Marrow port', color: '#C23B2E' }), mkTarget('buoy', -2.25, 3.0, { name: 'Marrow stbd', color: '#2E8B57' }),
      mkTarget('racon', ...P.selkieApproach, { name: 'Selkie Approach' }), lighthouse(),
      mkTarget('ship', 15, -2.5, { cog: 270, sog: 14, name: 'Baltic Trader' }), mkTarget('ship', -17.7, -4.0, { cog: 90, sog: 14, name: 'Cape Ross' }),
      mkTarget('fishing', 1.8, -5.6, { name: 'Gull' }), mkTarget('fishing', 2.3, -5.9, { name: 'Tern' }), mkTarget('fishing', 1.5, -6.2, { name: 'Skua' }),
      mkTarget('yacht', 1.0, -4.8, { cog: 330, sog: 4, name: 'Shearwater' }), mkTarget('ferry', 9, -7.0, { cog: 280, sog: 17, name: 'Selkie Spirit', route: [[4.5, -6.3], [-8, -5.5]] })] },
    radar: { power: 'off', range: 12, gain: 40, sea: 0, rain: 0, tuneOff: 20, safetyChecked: false, headingError: 0 } }),
};

const stdFail = (G) => G.flags.unsafeTx ? 'You transmitted before confirming the antenna area was clear.' : null;
const nearestVesselFail = (lim, msg) => G => {
  for (const [id, d] of Object.entries(G.mon.minDist)) if (d < lim) { const t = G.world.targets.find(q => q.id === id); return `${t && t.name ? t.name : 'A vessel'} passed ${Math.round(d * 1852)} m from you. ${msg}`; }
  return null;
};

// ---------- chapters ----------
const CHAPTERS = [
  { id: 'meet', n: 0, stage: 'Foundations', title: 'Meet the radar', mins: 5, scene: 'meet',
    teach: [
      { t: 'info', text: 'This round screen is a <b>plan position indicator</b>, or PPI. It is a map seen from above, with your boat at the centre. Every bright mark is an <b>echo</b>: radio energy that bounced back from something.' },
      { t: 'click', text: 'Click your own boat, at the centre of the screen.', hint: 'Look for the small boat outline where all the circles meet.', ok: (G, h) => h.rNm < 0.08 * G.radar.range },
      { t: 'info', text: 'The bright line turning around the screen is the <b>sweep</b>. It shows where the antenna points right now. The radar repaints each echo once per turn, about every 2.5 seconds on this set.' },
      { t: 'click', text: 'The solid line from the centre to the top is the <b>heading line</b>. It points where your bow points. Click anywhere on it.', hint: 'It runs straight up from your boat.', ok: (G, h) => Math.abs(angDiff(h.brg, G.world.own.hdg)) < 3 && h.rNm > 0.15 * G.radar.range },
      { t: 'info', text: 'The circles are <b>range rings</b>. On this 3 nm range they sit every 0.5 nm. The top-left corner always tells you the range and the ring spacing.', show: 'corner-tl' },
      { t: 'click', text: 'Click anywhere on the 1 nm ring.', hint: 'Count rings outward from the centre: 0.5, then 1.', ok: (G, h) => Math.abs(h.rNm - 1) < 0.07 },
      { t: 'click', text: 'The large echo to the south-west is a ship. Click it.', hint: 'Look below and left of the centre for the biggest, brightest echo.', ok: (G, h) => h.target && h.target.kind === 'ship' },
      { t: 'info', text: 'The four corners carry data. Top left: range and rings. Top right: orientation and motion. Bottom left: gain, sea and rain levels. Bottom right: the range and bearing of your cursor. Move the mouse over the screen and watch the bottom right.' },
    ],
    check: [
      { t: 'click', text: 'Point at your own boat.', ok: (G, h) => h.rNm < 0.08 * G.radar.range },
      { t: 'click', text: 'Point 2 nm straight ahead of your bow.', ok: (G, h) => Math.abs(angDiff(h.brg, G.world.own.hdg)) < 4 && Math.abs(h.rNm - 2) < 0.2 },
      { t: 'click', text: 'Point at the 1 nm ring.', ok: (G, h) => Math.abs(h.rNm - 1) < 0.07 },
    ] },

  { id: 'power', n: 1, stage: 'Foundations', title: 'Power up', mins: 15, scene: 'power',
    teach: [
      { t: 'info', text: 'A radar antenna sends out strong microwave pulses. Standing next to an open-array antenna while it transmits is unsafe, and a turning array can hit someone. Before you power up, make sure nobody is working near the antenna.' },
      { t: 'do', text: 'Press <b>Antenna clear</b> to confirm that nobody is near the antenna.', show: 'clear', done: G => G.radar.safetyChecked },
      { t: 'do', text: 'Press <b>Power</b>.', show: 'power', done: G => G.radar.power !== 'off' },
      { t: 'do', only: ['classic'], text: 'The display shows WARM-UP. This set uses a <b>magnetron</b>, a vacuum tube that must heat up before it can transmit. Real sets take 90 seconds to 3 minutes; this one takes 45 seconds. Wait until the screen says <b>STANDBY</b> and the status lamp above the buttons turns <b>blue</b>. Blue means warm but not transmitting; green, later, means transmitting.', done: G => G.radar.power === 'standby', ok: 'The set is warm and in Standby: blue lamp, antenna still, nothing transmitted yet.' },
      { t: 'do', only: ['modern'], text: 'This set has no magnetron, so it needs almost no warm-up: the Clearview BB is ready in about 3 seconds, the Sentinel DX in about 12. Wait until the screen says <b>STANDBY</b> and the status lamp turns <b>blue</b>. Blue means ready but not transmitting; green, later, means transmitting.', done: G => G.radar.power === 'standby', ok: 'The set is ready and in Standby: blue lamp, antenna still, nothing transmitted yet.' },
      { t: 'do', text: 'In Standby the antenna does not turn and does not transmit. Choose a starting range now: <b>3 nm</b> suits coastal sailing.', show: 'range', done: G => G.radar.range === 3 },
      { t: 'do', text: 'Press <b>Transmit</b>. The antenna starts turning and the sweep starts painting.', show: 'tx', done: G => G.radar.power === 'tx' },
      { t: 'do', only: ['classic'], text: 'Gain comes first. Turn <b>Gain</b> up until fine speckle appears across the screen, then back off until the speckle almost disappears. Do not go further: a screen with too little gain also looks clean, but weak echoes such as small yachts vanish from it.', show: 'gain', hint: 'Aim for a knob value between about 56 and 72.', done: inBand },
      { t: 'do', only: ['modern'], text: 'Gain comes first. This set offers <b>Auto</b> gain, which holds the speckle just below visible. Turn Auto on, or drag the Gain slider yourself until fine speckle appears and then back off a little. Knowing the manual way matters: auto modes get some conditions wrong.', show: 'gain', hint: 'Auto works. By hand, aim for about 54 to 72.', done: inBand },
      { t: 'do', text: 'The wind blows 14 knots, and the waves around you return echoes called <b>sea clutter</b>. A buoy sits 0.4 nm to the north-east (bracketed), hidden in it. Turn <b>Sea</b> up until the clutter breaks up while the buoy keeps painting. On a modern set, Auto sea does the same job; check that the buoy survives it.', target: 'Wreck buoy', mark: '', show: 'sea', hint: 'Somewhere between 20 and 75 on the Sea control.', done: G => effControls(G).sea >= 20 && effControls(G).sea <= 75 && G.echo('Wreck buoy') > 0.3 },
      { t: 'do', only: ['classic'], text: 'Now <b>Tune</b>. A magnetron does not transmit on exactly the same frequency every time, and its frequency drifts as it warms up. The receiver has to listen on that frequency, and the Tune knob moves the receiver onto it. Off frequency, the receiver hears only part of each echo, so weak targets fade and drop off the screen. The bar under the knob shows how much echo gets through. It is not a dial with a right value: you are looking for its highest point. Turn the knob slowly one way. If the bar grows, keep going until it starts to shrink, then come back to where it was longest. If it shrinks straight away, go the other way. The highest point is different every time and never fills the whole gauge, so do not aim for the end of the bar. Aim for the top of the hump.', show: 'tune', done: tuneOk },
      { t: 'do', text: 'Check the heading line. Gannet Head lighthouse is dead ahead of your bow, as the lookout shows. On the radar it sits about 10° to starboard of the heading line. That is an installation error. Use <b>Heading align</b> until the lighthouse sits on the heading line.', show: 'align', look: { relBrg: 0, labels: true }, done: hdgOk },
      { t: 'do', text: 'You have a working picture. At the end of a watch, press <b>Transmit</b> again to return to Standby. Standby keeps the set ready for a quick restart, and on a magnetron set it keeps the tube warm.', show: 'tx', closeLook: true, done: G => G.radar.power === 'standby' },
    ],
    check: [
      { t: 'mission', text: 'Cold start. Bring the radar from off to a tuned, verified picture in under 4 minutes.', limit: 240,
        enter: G => G.load('power', { headingError: 7 }),
        goals: [
          { text: 'Confirm the antenna area is clear', done: G => G.radar.safetyChecked },
          { text: 'Transmit on the 3 nm range', done: G => G.radar.power === 'tx' && G.radar.range === 3 },
          { text: 'Gain set so the speckle just disappears', done: G => G.radar.power === 'tx' && inBand(G) },
          { text: 'Sea clutter cut back, buoy still painting', done: G => effControls(G).sea >= 20 && effControls(G).sea <= 75 && G.echo('Wreck buoy') > 0.3 },
          { text: 'Tune peaked', done: G => G.radar.power === 'tx' && tuneOk(G) },
          { text: 'Heading line verified within 1.5°', done: hdgOk },
        ], fail: stdFail },
    ] },

  { id: 'range', n: 2, stage: 'Foundations', title: 'Range and scale', mins: 15, scene: 'range',
    teach: [
      { t: 'info', text: 'Range sets how far the screen reaches from your boat to the edge. Short ranges show close detail. Long ranges give early warning. The rings divide the range into equal steps.' },
      { t: 'do', text: 'Switch to the <b>0.75 nm</b> range. The rings now sit every 0.25 nm.', show: 'range', done: G => G.radar.range === 0.75 },
      { t: 'do', text: 'Step out to the <b>6 nm</b> range. Tern Island appears to the north-east, and the coast to the north.', show: 'range', done: G => G.radar.range === 6 },
      { t: 'info', text: 'Each range change clears the screen and repaints it. Good watchkeepers switch often: a short range for close traffic, a long range for early warning.' },
      { t: 'do', text: 'Return to <b>3 nm</b>.', show: 'range', done: G => G.radar.range === 3 },
      { t: 'info', text: 'The <b>variable range marker</b>, or VRM, is a dotted circle you resize to measure distance. Turn VRM on. Then pick the VRM cursor tool and click an echo, or turn the VRM knob.', show: 'vrm' },
      { t: 'measure', text: 'Measure the range to buoy <b>B</b> with the VRM, then press Submit.', target: 'B', need: 'range', tolR: 0.06, mark: 'B' },
      { t: 'do', text: '<b>Off-centre</b> moves your boat towards the bottom of the screen, so you see farther ahead. Press Off-centre.', show: 'offc', done: G => G.radar.offCentre },
    ],
    check: [
      { t: 'estimate', text: 'Without the VRM, estimate the range to echo <b>A</b> from the rings. Type nautical miles.', target: 'A', tol: 0.1, enter: G => { G.radar.offCentre = false; G.radar.vrm.on = false; } },
      { t: 'estimate', text: 'Estimate the range to echo <b>B</b>.', target: 'B', tol: 0.1 },
      { t: 'estimate', text: 'Estimate the range to echo <b>C</b>.', target: 'C', tol: 0.1 },
      { t: 'estimate', text: 'Estimate the range to echo <b>D</b>.', target: 'D', tol: 0.1 },
      { t: 'estimate', text: 'Estimate the range to echo <b>E</b>, the anchored ship.', target: 'E', tol: 0.1 },
      { t: 'measure', text: 'Now measure echo <b>C</b> with the VRM.', target: 'C', need: 'range', tolR: 0.075, mark: 'C' },
      { t: 'measure', text: 'Measure echo <b>E</b> with the VRM.', target: 'E', need: 'range', tolR: 0.09, mark: 'E' },
    ] },

  { id: 'tune', n: 3, stage: 'Foundations', title: 'Tune the picture', mins: 20, scene: 'tune',
    teach: [
      { t: 'info', text: 'A raw radar picture always needs adjusting. The order matters: <b>gain, then sea, then rain</b>, and on a magnetron set <b>tune</b> last. Each control changes what the next one has to work with. Auto modes on modern sets follow the same order, and you still judge the result.' },
      { t: 'do', text: 'Gain sits at maximum and the screen is full of speckle. Turn <b>Gain</b> down until the background speckle just disappears. On a modern set, Auto gain also works.', show: 'gain', done: inBand },
      { t: 'do', text: 'The bright disc around you is sea clutter in 22 knots of wind. A buoy hides in it 0.35 nm to the south-west, upwind. Turn <b>Sea</b> up until the clutter thins. Stop while the buoy still paints.', target: 'Hidden buoy', mark: '', show: 'sea', hint: 'The buoy is the one speck that stays put from sweep to sweep. Try Sea around 45 to 70. Auto sea may already sit in that range.', done: G => effControls(G).sea >= 35 && effControls(G).sea <= 80 && G.echo('Hidden buoy') > 0.25 },
      { t: 'info', text: 'Too much sea control is dangerous. It removes small boats and buoys along with the waves, and the screen looks clean and empty. Always leave a few flecks of clutter near the centre.' },
      { t: 'do', text: 'A rain squall sits 2 nm to the west-south-west, with a small ship inside it. Turn <b>Rain</b> up until the squall thins to an outline and the ship\'s hard echo stands out.', target: 'Coaster', mark: '', show: 'rain', done: G => G.radar.rain >= 40 },
      { t: 'do', only: ['classic'], text: 'Peak the <b>Tune</b> control. Turn it a little; if the bar under the knob shrinks, go the other way. The bar has one highest point, somewhere short of the end of the gauge; stop there.', show: 'tune', done: tuneOk },
      { t: 'do', only: ['modern'], text: 'Two yachts lie rafted together 1.2 nm to the south-east (bracketed), only 40 m apart. This set has no pulse control: it separates close targets by itself, with a frequency sweep (broadband) or pulse compression (solid-state). Switch to the <b>1.5 nm</b> range and look for two echoes.', target: 'Raft 1', mark: '', show: 'range', done: G => G.radar.range === 1.5 },
      { t: 'do', only: ['classic'], text: 'Two yachts lie rafted together 1.2 nm to the south-east (bracketed), only 40 m apart. On a medium pulse they merge into one echo. Switch to the <b>1.5 nm</b> range and choose the <b>Short</b> pulse. Look closely: the single arc splits into two thin arcs, one behind the other.', target: 'Raft 1', mark: '', show: 'pulse', done: G => G.radar.range === 1.5 && G.radar.pulse === 'S' },
      { t: 'info', only: ['classic'], text: 'Short pulses separate close targets but reach less far. Long pulses carry more energy and see farther, but merge nearby targets and blank the water right around you. The set picks a pulse for each range, and you can override it.' },
    ],
    check: [
      { t: 'mission', text: 'Someone left every control in the wrong place. Find the buoy hidden in the clutter and the ship hidden in the squall, and click each one.', limit: 240,
        enter: G => G.load('tune', { gain: 95, sea: 0, rain: 0, range: 6, pulse: 'L' }),
        goals: [
          { text: 'Click the buoy hidden in the sea clutter', done: G => G.clicked('Hidden buoy') },
          { text: 'Click the ship hidden in the squall', done: G => G.clicked('Coaster') },
        ] },
    ] },

  { id: 'orient', n: 4, stage: 'Reading', title: 'Which way is up', mins: 20, scene: 'orient',
    teach: [
      { t: 'info', text: 'You are in <b>Head Up</b> mode. The heading line points straight up, so the picture matches the view over the bow. When the boat turns, the whole picture rotates.' },
      { t: 'do', text: 'Use the helm buttons to turn <b>40° to port</b>. Watch every echo swing across the screen.', show: 'helm', enter: G => { G.mem.h0 = G.world.own.hdg; }, done: G => Math.abs(angDiff(G.world.own.hdg, G.mem.h0)) >= 30 },
      { t: 'do', text: 'Press the orientation button until it reads <b>N UP</b>. North points up now, like a paper chart, and the heading line swings to your heading.', show: 'mode', done: G => G.radar.mode === 'NU' },
      { t: 'ask', text: 'In North Up, where does the heading line point?', options: ['Always straight up', 'Along your compass heading, so it moves when you turn', 'Always towards north'], answer: 1, explain: 'In North Up the picture stays fixed to north. The heading line shows your heading and swings when you turn.' },
      { t: 'do', text: 'Select <b>C UP</b>. Course Up puts your current course straight up and holds the picture still while the boat yaws. Press it again after a course change to reset it.', show: 'mode', done: G => G.radar.mode === 'CU' },
      { t: 'info', text: 'Motion mode decides what moves on the screen. In <b>relative motion</b> your boat stays put and everything moves relative to you, so an anchored buoy drifts backwards at your speed. In <b>true motion</b> your boat moves across a fixed picture and stationary things stay still.' },
      { t: 'do', text: 'Switch Motion to <b>TM</b>. At 6 knots your boat moves only about 0.1 nm a minute, so set time to <b>×8</b> and watch for two minutes of ship\'s time. Your boat symbol moves up the screen and leaves a line of dots. The land and the Gannet S buoy stay still; the yacht Puffin moves on its own course.', show: 'motion', watch: 120, when: G => G.radar.motion === 'TM', waitMsg: 'Switch Motion to TM to start the clock.', ok: 'In true motion, fixed things stay fixed and only moving vessels, including yours, move across the screen.' },
      { t: 'ask', text: 'In relative motion, the Gannet S buoy moved down the screen. Why?', options: ['The buoy dragged its mooring', 'Your boat moves towards it, so relative to you it moves backwards', 'The radar has a heading error'], answer: 1, explain: 'Relative motion shows movement relative to your boat. Anything fixed to the seabed moves opposite to your own course at your own speed.' },
    ],
    check: [
      { t: 'click', text: 'Head Up, relative motion, 6 nm range. Click <b>Gannet Head lighthouse</b>: the brightest point at the tip of the headland north of you.', hint: 'Your bow points 060°, so north lies about 60° to port: up and to the left. The lighthouse is the bright spot where the coastline juts out furthest towards you.', enter: G => { G.radar.mode = 'HU'; G.radar.motion = 'RM'; G.radar.range = 6; G.scope.clear(); }, ok: (G, h) => dist(h.x, h.y, ...P.lighthouse) < 0.2 },
      { t: 'do', text: 'Switch to <b>North Up</b>.', done: G => G.radar.mode === 'NU' },
      { t: 'click', text: 'Click <b>Tern Island</b>, the small island east of Gannet Head.', hint: 'In North Up, east is to the right. Tern Island is the separate blob of land about 5 nm away, right of the coast.', ok: (G, h) => distToPoly(h.x, h.y, G.world.land.find(L => L.name === 'Tern Island').pts) < 0.25 || pointInPoly(h.x, h.y, G.world.land.find(L => L.name === 'Tern Island').pts) },
      { t: 'do', text: 'Switch to <b>true motion</b> and wait a minute.', done: G => G.radar.motion === 'TM' },
      { t: 'click', text: 'Two small echoes are near you. Click the one that is <b>stationary</b>.', ok: (G, h) => h.target && h.target.name === 'Gannet S' },
    ] },

  { id: 'measure', n: 5, stage: 'Reading', title: 'Bearing and range', mins: 20, scene: 'measure',
    teach: [
      { t: 'info', text: 'The <b>electronic bearing line</b>, or EBL, is a line from your boat that you rotate onto an echo. The readout gives the bearing in degrees true (T) and relative to your bow (R).', show: 'ebl' },
      { t: 'measure', text: 'Turn EBL on and lay it on <b>Gannet Head lighthouse</b>. Use the EBL cursor tool or the knob, then press Submit.', target: 'Gannet Head light', need: 'bearing', tolB: 2.5 },
      { t: 'do', text: 'Switch to the <b>6 nm</b> range so you can see the ship coming from the east. Your bow points west, so in Head Up the ship shows astern, at the bottom of the screen.', show: 'range', done: G => G.radar.range === 6 },
      { t: 'measure', text: 'Measure the ship\'s range with the VRM and its bearing with the EBL.', target: 'Arctic Dawn', need: 'both', tolR: 0.15, tolB: 3, mark: '' },
      { t: 'info', text: 'Remember the heading-line check in chapter 1. A heading error turns every bearing by the same amount. A 10° error at 3 nm puts a target half a mile from where it really is.' },
      { t: 'info', text: 'Radar ranges also tell you where you are. Suppose the radar shows Gannet Head lighthouse 2.5 nm away. Then you are somewhere on a circle of radius 2.5 nm drawn around the lighthouse on the chart. A range to a second charted object gives a second circle. You are where the two circles cross. Navigators call this a <b>position fix</b>.', enter: G => { G.radar.range = 3; G.radar.ebl.on = false; G.scope.clear(); } },
      { t: 'fix', text: 'Put the VRM on <b>Gannet Head lighthouse</b> and press its <b>Record</b> button. Then put the VRM on the <b>Tern beacon</b>, the bright point at the west tip of Tern Island, and press its Record button. The chart below draws a circle for each range. Then press Submit.',
        marks: [{ label: 'Gannet Head lighthouse', at: P.lighthouse }, { label: 'Tern beacon', at: [5.3, 0.6] }], tol: 0.1 },
      { t: 'info', text: 'Choose two objects that lie far apart in bearing, ideally 60° to 120° apart. Then the circles cross at a clear angle. Two objects on nearly the same bearing give circles that cross at a shallow angle, and a small range error moves the fix a long way. Ranges beat radar bearings for a fix, because the beam width blurs every bearing by several degrees.' },
    ],
    check: [
      { t: 'fix', text: 'Your boat has drifted to a new, unknown position. Fix it: record VRM ranges to Gannet Head lighthouse and the Tern beacon, then submit.', enter: G => { G.world.own.x = 3.4; G.world.own.y = -0.8; G.radar.range = 6; G.scope.clear(); },
        marks: [{ label: 'Gannet Head lighthouse', at: P.lighthouse }, { label: 'Tern beacon', at: [5.3, 0.6] }], tol: 0.1 },
    ] },

  { id: 'gallery', n: 6, stage: 'Reading', title: 'Recognition gallery', mins: 40, scene: 'meet',
    teach: [
      { t: 'info', text: 'This chapter trains your eye. Each drill shows one echo in brackets. Pick what you think it is, then press <b>Reveal</b> to see the real scene and the clue. Reveals are free in practice. Open the <b>Catalog</b> any time to read the signatures.' },
      ...['ship', 'fishing', 'ferry', 'yacht_refl', 'yacht', 'kayak', 'buoy', 'buoy_refl', 'racon', 'lighthouse', 'coast', 'beach', 'bridge', 'anchored', 'rain', 'clutter']
        .map(k => ({ t: 'id', drill: k })),
    ],
    check: Array.from({ length: 20 }, () => ({ t: 'id', drill: 'random' })),
    pass: run => run.idTotal >= 20 && run.idRight / run.idTotal >= 0.85 },

  { id: 'ghosts', n: 7, stage: 'Reading', title: 'False echoes', mins: 25, scene: 'sidelobe',
    teach: [
      { t: 'do', text: 'A big ship lies 0.35 nm away. The faint arcs at the same range on either side are <b>side-lobe echoes</b>: weak energy leaks out beside the main beam and returns from the ship. Lower <b>Gain</b> and raise <b>Sea</b> until the arcs disappear and the ship remains.', show: 'gain', hint: 'Try Gain about 50 and Sea about 60. Close to the boat, the sea control cuts weak echoes hardest.',
        done: G => G.echoAt(polar(0, 0, 90, 0.36)) < 0.12 && G.echoAt(polar(0, 0, 30, 0.36)) < 0.12 && G.echo('Big ship') > 0.5 },
      { t: 'ask', text: 'A big ship lies 0.28 nm abeam. Fainter copies sit on the same bearing at 0.56 and 0.84 nm. What causes them?', enter: G => G.load('multiple'),
        options: ['Energy bouncing back and forth between the ship and your boat', 'Three ships in a line', 'A rain shower behind the ship'], answer: 0,
        explain: 'These are <b>multiple echoes</b>. They sit at exact multiples of the real range, on the same bearing, getting fainter. They appear when a large flat-sided ship is close abeam.' },
      { t: 'do', only: ['classic'], text: 'An odd echo sits 2.5 nm to the south-west, and the chart shows open sea there. Switch to the <b>6 nm</b> range and see what happens to it.', enter: G => G.load('ghost'), show: 'range', done: G => G.radar.range === 6 },
      { t: 'ask', only: ['classic'], text: 'The echo vanished when you changed range. What was it?', options: ['A rain cell that moved away', 'A second-trace echo from land far beyond the screen', 'A ship that turned'], answer: 1,
        explain: 'A <b>second-trace echo</b> returns from a distant target after the next pulse has already gone out, so the set plots it at the wrong range. Unusual weather (ducting) carries the beam that far. Changing range changes the pulse rate, and the echo jumps or vanishes.' },
      { t: 'info', only: ['modern'], text: 'Two false echoes belong mostly to magnetron sets. A <b>second-trace echo</b> appears when a pulse returns from very distant land after the next pulse has gone out, so the set plots it at the wrong range. <b>Interference</b> from another boat\'s radar shows as curved lines of dots. Broadband and solid-state sets filter both out by themselves. Switch to the Mariner 24 to practise spotting them.' },
      { t: 'do', only: ['classic'], text: 'Curved lines of dots sweep across the screen. Another boat\'s radar causes them. Turn on <b>interference rejection</b> (IR).', enter: G => G.load('interf'), show: 'ir', done: G => G.radar.ir },
      { t: 'do', text: 'Your mast blocks the beam in a narrow sector astern. Your friend\'s yacht hides there, 1.2 nm behind you. Turn the boat <b>20°</b> either way and watch it appear.', enter: G => G.load('shadow'), show: 'helm',
        done: G => Math.abs(angDiff(G.world.own.hdg, 0)) >= 15 && G.echo('Friend\'s yacht') > 0.25 },
      { t: 'ask', text: 'Your antenna is 8 m above the water. How far away can the radar see a buoy whose top is 3 m high?', options: ['About 4 nm', 'About 10 nm', 'About 24 nm', 'As far as the range setting'], answer: 1,
        explain: 'The <b>radar horizon</b> is about 2.21 × (√8 + √3) = 10 nm. Beyond it, the curve of the earth hides the buoy, whatever range you select. A higher antenna or a taller target sees farther.' },
      { t: 'do', text: 'You are sailing hard, heeled 25° with the wind on the starboard side. The beam on the high windward side points up into the sky, and a yacht 1.5 nm to windward has vanished. <b>Reef</b> to bring the heel under 15°.', enter: G => G.load('heel'), show: 'heel',
        done: G => G.world.own.heel < 15 && G.echo('Windward yacht') > 0.25 },
    ],
    check: [
      { t: 'pickset', text: G => G.radar.set === 'classic' ? 'Seven echoes are marked A to G. Three of them do not exist. Select the three false echoes, then press Submit.' : 'Six echoes are marked. Two of them do not exist. Select the two false echoes, then press Submit.', enter: G => G.load('ghostCheck'),
        contacts: [
          { letter: 'A', marker: { name: 'A' }, isFalse: false }, { letter: 'B', marker: { name: 'B' }, isFalse: false }, { letter: 'C', marker: { name: 'C' }, isFalse: false },
          { letter: 'D', marker: { rel: { trueBrg: 100, r: 0.72 } }, isFalse: true, why: 'multiple echo of ship C' },
          { letter: 'E', marker: { rel: { trueBrg: 130, r: 0.37 } }, isFalse: true, why: 'side-lobe arc from ship C' },
          { letter: 'F', only: ['classic'], marker: { rel: { trueBrg: 209, r: 2.65 } }, isFalse: true, why: 'second-trace echo from distant land' },
          { letter: 'G', marker: { name: 'G' }, isFalse: false }] },
    ] },

  { id: 'collision', n: 8, stage: 'Using', title: 'Avoid collisions', mins: 35, scene: 'fog',
    teach: [
      { t: 'info', text: 'Fog has closed in. The lookout shows nothing. The collision regulations (COLREGs) still apply. <b>Rule 5</b>: keep a lookout by sight and hearing as well. <b>Rule 7</b>: use your radar properly, with long-range scanning and systematic observation of every contact. <b>Rule 19</b>: how to act in restricted visibility.', look: { relBrg: 0 } },
      { t: 'do', text: 'A ship approaches from the east-south-east. Your bow points south, so in Head Up it shows on your port bow, up and to the left. Turn the EBL on and lay it on the ship.', closeLook: true, show: 'ebl', done: G => G.radar.ebl.on && Math.abs(angDiff(G.radar.ebl.brg, G.tgtGeo('Baltic Trader').brg)) < 3 },
      { t: 'do', text: 'Set time to <b>×8</b> and watch for 3 minutes of ship\'s time. If the ship stays on the EBL while its range falls, you are on a collision course.', show: 'time', watch: 180, ok: 'Three minutes watched. Note where the ship sits relative to the EBL.' },
      { t: 'ask', text: 'The ship stayed on the EBL and came closer. What does that mean?', options: ['Risk of collision: steady bearing, decreasing range', 'The ship will pass ahead of you', 'The ship has stopped'], answer: 0, explain: 'A steady compass bearing with a falling range means you will collide if nothing changes. A bearing that drifts steadily means the ship will pass.', enter: G => { G.sim.scale = 1; } },
      { t: 'do', text: 'Turn on <b>trails</b> in relative mode (R). A relative trail shows how the ship moves relative to you. If the trail would run through the centre, the ship will hit you.', show: 'trails', done: G => G.radar.trails.len > 0 && !G.radar.trails.true },
      { t: 'ask', text: 'At steady bearing, the range fell from 4.0 nm to 3.0 nm in 6 minutes. When does the ship reach you if nothing changes?', options: ['In 6 minutes', 'In 18 minutes', 'In 30 minutes'], answer: 1, explain: 'The ship closes 1 nm every 6 minutes, so 3 nm takes 18 minutes. This simple sum gives you TCPA, the time to the closest point of approach, without MARPA.' },
      { t: 'ask', text: 'The ship is forward of your beam on the port side, closing, in fog. What does Rule 19 tell you?', options: ['Turn to port, towards its stern', 'Make a large, early turn to starboard, slow down, or both', 'Hold course and speed: you are the stand-on vessel'], answer: 1,
        explain: 'In restricted visibility nobody is the stand-on vessel. Rule 19 says avoid a turn to port for a vessel forward of the beam, and avoid turning towards a vessel abeam or abaft the beam. Make your action large and early, so the other ship sees it on radar.' },
      { t: 'info', text: 'Everything you just did by hand, a modern set can do for you. Its <b>MARPA</b> (mini automatic radar plotting aid) tracks an echo you pick and computes the CPA and TCPA. Chapter 10, Modern sets, teaches it. The manual method still matters: MARPA uses the same echoes you see, and it fails in the same clutter and squalls.' },
    ],
    check: [
      { t: 'mission', text: 'Three ships approach in fog, and the Mariner 24 has no MARPA. Steer your boat clear of them. Lay the EBL on each ship and watch whether its bearing stays steady. When a ship is on a collision course, change your course or speed with the <b>Helm</b> controls at the bottom of the control panel: <b>+10</b> turns 10° to starboard, <b>−10</b> turns 10° to port, and <b>Speed −</b> slows you down. The arrow keys work too. Make your turns large and early, and keep every ship more than 0.5 nm away for 40 minutes of ship\'s time. Use ×4 or ×8 to pass the quiet stretches.', show: 'helm', hint: 'Your bow points south. The first ship comes from the east, on your port bow. Rule 19: turn to starboard, which is to the west, and turn by 30° or more so the ship sees it on its radar.', helm: true, limit: 2700,
        enter: G => { G.setSet('classic'); G.load('fogCheck'); },
        goals: [
          { text: 'Keep every ship more than 0.5 nm away', done: G => G.world.t >= 2400 },
          { text: 'Stay safe for 40 minutes of ship\'s time', done: G => G.world.t >= 2400 },
        ],
        fail: nearestVesselFail(0.5, 'Keep every ship at least 0.5 nm off in fog.'), rule19: true },
    ] },

  { id: 'pilot', n: 9, stage: 'Using', title: 'Pilotage', mins: 30, scene: 'pilot',
    teach: [
      { t: 'info', text: '<b>Parallel indexing</b> keeps you a safe distance off a hazard. You draw a line parallel to your heading line, offset by the distance you want to keep. As you pass, the hazard\'s echo should slide along that line.' },
      { t: 'do', text: 'Turn on the <b>PI line</b> and set it <b>1.4 nm to port</b>. Gannet Head\'s tip should run along it as you pass.', show: 'pi', done: G => G.radar.pi.on && Math.abs(G.radar.pi.off + 1.4) < 0.06 },
      { t: 'do', text: 'Set time to <b>×8</b> and watch the headland slide down the line for 5 minutes.', show: 'time', watch: 300, ok: 'Five minutes watched. Note where the headland echo sits relative to the PI line.' },
      { t: 'ask', text: 'The headland echo crept inside the PI line, towards your heading line. What is happening?', options: ['A current sets you towards the headland. Steer away to bring the echo back onto the line', 'You are drifting away from the headland', 'The radar changed range'], answer: 0, enter: G => { G.sim.scale = 1; },
        explain: 'A tidal stream pushes you north at half a knot. The PI line shows the drift long before a chart fix would, so you can correct early.' },
      { t: 'info', text: 'A <b>clearing range</b> works the same way with the VRM. Set the VRM to the minimum safe distance from a hazard. If the hazard\'s echo touches the ring, turn away.' },
    ],
    check: [
      { t: 'mission', text: 'Enter Marrow Bay in thick fog by radar alone. A cross-current sets you east, and a fishing boat is leaving the harbour. Reach the inner harbour without touching land.', helm: true, limit: 3000,
        enter: G => G.load('harbour'),
        goals: [
          { text: 'Reach the inner harbour (waypoint)', done: G => dist(G.world.own.x, G.world.own.y, ...P.marrowInner) < 0.15 },
          { text: 'Stay more than 50 m from the shore', done: G => dist(G.world.own.x, G.world.own.y, ...P.marrowInner) < 0.15 },
        ],
        fail: G => G.mon.landMin < 0.027 ? 'You ran aground. The shore came within 50 m.' : nearestVesselFail(0.06, 'You hit or nearly hit the fishing boat.')(G) },
    ] },

  { id: 'modern', n: 10, stage: 'Beyond basics', title: 'Modern sets', mins: 25, scene: 'modern',
    teach: [
      { t: 'do', text: 'This chapter tours the modern sets, so you will switch sets a few times. When you leave the chapter, the trainer goes back to the set you normally train on. Switch to the <b>Clearview BB</b> set with the selector at the top.', show: 'set', done: G => G.radar.set === 'clearview' },
      { t: 'do', text: 'Power up and transmit. A broadband radar sends a weak, continuous sweeping signal instead of pulses. It needs almost no warm-up and is safe to stand near.', show: 'power', done: G => G.radar.power === 'tx' },
      { t: 'do', text: 'Modern sets offer automatic modes. Right now they are off, and the set runs the Harbour preset with manual gain and sea. Turn on <b>Auto</b> under Gain and <b>Auto</b> under Sea, then pick the <b>Coastal</b> preset. Watch the clutter around you change as each one switches on.', show: 'preset', enter: G => { const r = G.radar; r.gainAuto = false; r.seaAuto = false; r.preset = 'harbour'; r.gain = 45; r.sea = 10; }, done: G => G.radar.gainAuto && G.radar.seaAuto && G.radar.preset === 'coastal' },
      { t: 'info', text: 'The picture is crisp and the centre is clean. Broadband radars see very close targets well. Their weak signal reaches less far than a magnetron, and their auto modes decide for you what counts as clutter.' },
      { t: 'do', text: 'Now switch to <b>Sentinel DX</b> and transmit.', show: 'set', done: G => G.radar.set === 'sentinel' && G.radar.power === 'tx' },
      { t: 'do', text: 'Turn <b>Doppler</b> on.', show: 'doppler', done: G => G.radar.doppler },
      { t: 'ask', text: 'With Doppler on, which echoes turn red?', options: ['Echoes moving towards you', 'Large ships', 'Echoes inside the guard zone'], answer: 0, explain: 'Red echoes close on you; green echoes move away. Doppler does not give you the CPA. A red target can still pass well clear, so keep plotting.' },
      { t: 'do', text: 'Turn on the <b>AIS</b> overlay.', show: 'ais', done: G => G.radar.ais },
      { t: 'ask', text: 'A small echo 1 nm to the east, on your starboard bow, shows no AIS triangle. What does that mean?', options: ['It is not a vessel', 'It is a vessel without AIS, such as a small yacht. It is still there', 'The AIS receiver has failed'], answer: 1, explain: 'Most small yachts, fishing boats and kayaks carry no AIS transmitter. Radar sees them; AIS never will.' },
      { t: 'do', text: 'Now let the set plot a ship for you. The cargo ship <b>Arctic Dawn</b> approaches from the east; switch to the 6 nm range if it is not on the screen yet. Pick the <b>MARPA</b> cursor tool and click its echo. After about 30 seconds the MARPA panel shows its CPA (closest point of approach) and TCPA (time until then).', show: 'tool',
        done: G => G.radar.marpa.some(m => G.world.targets.find(t => t.id === m.id)?.name === 'Arctic Dawn' && G.world.t - m.since > 30), ok: G => { const g = G.tgtGeo('Arctic Dawn'); return `Tracked. The box beside the echo shows CPA ${g.cpa.toFixed(2)} nm in ${Math.max(0, g.tcpaMin).toFixed(0)} minutes: the ship will pass that close to you, that soon. The line from the echo shows where it will be in 6 minutes. The MARPA panel on the right lists the same numbers.`; } },
      { t: 'ask', text: 'MARPA shows CPA 0.9 nm for a ship crossing ahead. A minute later a rain squall covers the ship\'s echo. What should you expect?', options: ['MARPA keeps an accurate track through the rain', 'MARPA may lose the target or swap it onto another echo, so watch the screen and plot by hand', 'MARPA switches to AIS automatically'], answer: 1,
        explain: 'MARPA works only from the echoes you see. It needs several sweeps to settle, it loses targets in rain and clutter, and it can swap tracks when two echoes pass close. Treat it as a check on your own plot.' },
      { t: 'do', text: 'Turn on the <b>chart</b> overlay.', show: 'chart', done: G => G.radar.chart },
      { t: 'ask', text: 'The chart coastline sits slightly off the radar\'s coastline echo. Which one do you trust to keep clear of the rocks?', options: ['The radar: it measures where the land is relative to you', 'The chart: it is GPS-accurate', 'Neither: switch both off'], answer: 0, explain: 'Old surveys and datum errors shift charts by tens or hundreds of metres. The radar measures the land directly.' },
    ],
    check: [
      { t: 'mission', text: 'The Sentinel DX runs on the Offshore preset with auto sea. A small yacht without AIS sails 0.6 nm away. Find it and click it.', limit: 240,
        enter: G => { G.setSet('sentinel'); G.load('autoTrap'); },
        goals: [{ text: 'Click the yacht', done: G => G.clicked('Shearwater') }] },
    ] },

  { id: 'emergency', n: 11, stage: 'Beyond basics', title: 'Emergencies', mins: 25, scene: 'sart',
    teach: [
      { t: 'info', text: 'A <b>SART</b> (search and rescue transponder) sits in a life raft. When your beam hits it, it answers with a line of 12 dots that starts at the raft and points away from you. Treat it as a mayday: call on VHF channel 16 and go to help.' },
      { t: 'do', text: 'Switch to the <b>12 nm</b> range to see the whole line of dots.', show: 'range', done: G => G.radar.range === 12 },
      { t: 'click', text: 'Click the raft: the inner end of the line, nearest to you.', ok: (G, h) => dist(h.x, h.y, 5, -2) < 0.4 },
      { t: 'info', text: 'As you close within about 1 nm, the dots widen into arcs and then into full circles. The raft sits at the centre of the circles.' },
      { t: 'ask', text: 'A crew member falls overboard at night. Can the radar find them?', options: ['Yes, on the shortest range', 'No. A person in the water returns almost no echo. Press MOB on the GPS, throw a dan buoy and keep someone pointing', 'Only with Doppler on'], answer: 1 },
      { t: 'ask', text: 'Imagine this on your screen (it is not in the current scene): a line of rain echoes sits 3 nm upwind. Over a few minutes you measure it with the VRM and find it closing at 15 knots. What should you expect?', options: ['A sudden wind shift and strong gusts in about 12 minutes. Reef now', 'Nothing. Rain is only clutter', 'Fog'], answer: 0, explain: 'The radar sounds no alarm for rain. The warning is what you read off the screen yourself: the squall is 3 nm away and closing at 15 knots, so it arrives in 3 ÷ 15 × 60 = 12 minutes. Squalls bring their own wind, so use those 12 minutes to reef. If you want an alarm, set a guard zone: the radar then beeps when an echo enters it.' },
    ],
    check: [
      { t: 'mission', text: 'Find the life raft from its SART and approach it. Arrive slowly: 3 knots or less within 0.2 nm.', helm: true, limit: 5400,
        enter: G => G.load('sart'),
        goals: [
          { text: 'Reach the raft (within 0.2 nm)', done: G => G.tgtGeo('Life raft').r < 0.2 },
          { text: 'Arrive at 3 knots or less', done: G => G.tgtGeo('Life raft').r < 0.2 && G.world.own.sog <= 3 },
        ],
        fail: G => G.tgtGeo('Life raft').r < 0.03 && G.world.own.sog > 3 ? 'You ran over the raft at speed.' : null },
    ] },

  { id: 'exam', n: 12, stage: 'Final', title: 'Night passage', mins: 40, scene: 'exam', final: true,
    teach: [],
    check: [
      { t: 'mission', text: 'Night passage, 12 nm from Marrow Bay across the shipping lanes to Port Selkie, on a radar set picked at random. Start from a cold radar.', helm: true, autoTime: true, limit: 4 * 3600,
        enter: G => { G.setSet(['classic', 'clearview', 'sentinel'][Math.floor(Math.random() * 3)]); G.load('exam'); },
        goals: [
          { text: 'Confirm the antenna is clear, then transmit', done: G => G.radar.power === 'tx' && G.radar.safetyChecked },
          { text: 'Set gain: turn it up until speckle fills the screen, then back off until the speckle just fades (Auto also counts)', done: G => G.radar.power === 'tx' && inBand(G) },
          { text: 'Peak the tune: turn the Tune knob to where its bar is longest; the peak never fills the gauge (sets without a Tune knob tune themselves)', done: G => G.radar.power === 'tx' && tuneOk(G) },
          { text: 'Report the Morse letter of the Selkie Approach racon: match the dashes behind its echo to one of these', pick: { options: ['B', 'D', 'G', 'K', 'N', 'M'], answer: 'D' } },
          { text: 'Keep every vessel more than 0.5 nm away', done: G => dist(G.world.own.x, G.world.own.y, ...P.selkieMouth) < 0.4 },
          { text: 'Arrive at the Port Selkie entrance', done: G => dist(G.world.own.x, G.world.own.y, ...P.selkieMouth) < 0.4 },
        ],
        fail: G => stdFail(G) || nearestVesselFail(0.25, 'The exam fails on any CPA under 0.25 nm.')(G) || (G.mon.landMin < 0.03 ? 'You ran aground.' : null),
        penaltyRange: 0.5, rule19: true },
    ] },
];
const STAGES = ['Foundations', 'Reading', 'Using', 'Beyond basics', 'Final'];
