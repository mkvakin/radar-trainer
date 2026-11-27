// The 22 kinds of echo the player learns to recognise, and a drill scene for each.

const CATALOG = {
  ship:        { label: 'Large ship', group: 'Vessels', looks: 'Big, bright, elongated echo, visible from 10 nm or more.', clue: 'The biggest echo on the screen, steady on every sweep, moving at 12 to 16 knots. In 3 minutes its trail grows about 0.7 nm.', confuse: ['ferry', 'anchored', 'fishing'] },
  fishing:     { label: 'Fishing boat', group: 'Vessels', looks: 'Medium echo that turns and stops.', clue: 'Erratic trail. Fishing boats usually work in groups.', confuse: ['yacht_refl', 'buoy', 'clutter'] },
  ferry:       { label: 'Ferry', group: 'Vessels', looks: 'Medium to large echo, smaller than a cargo ship, moving fast and dead straight.', clue: 'Faster than anything else out there: 20 to 25 knots, so in 3 minutes its trail grows more than 1 nm. It runs a straight line between two harbour mouths and turns back at each end. It usually shows on AIS.', confuse: ['ship', 'fishing', 'anchored'] },
  yacht_refl:  { label: 'Yacht with reflector', group: 'Vessels', looks: 'Small but steady echo.', clue: 'Slow trail at 4 to 7 knots. Paints on every sweep.', confuse: ['buoy_refl', 'fishing', 'yacht'] },
  yacht:       { label: 'Yacht without reflector', group: 'Vessels', looks: 'Weak echo that flickers and misses some sweeps.', clue: 'Watch ten sweeps: it changes brightness and misses some sweeps entirely, because a small fibreglass hull reflects little and waves hide it. In clutter inside about 1 nm it can vanish altogether.', confuse: ['clutter', 'buoy', 'kayak'] },
  kayak:       { label: 'Kayak or dinghy', group: 'Vessels', looks: 'Almost nothing. A speck on short range with careful gain.', clue: 'Only shows on the shortest ranges. Radar does not see everything.', confuse: ['clutter', 'buoy', 'yacht'] },
  buoy:        { label: 'Navigation buoy', group: 'Marks', looks: 'Small, steady echo.', clue: 'Stays put, and the chart plotter shows a buoy at that spot. No Ra mark next to it, so it is a plain buoy.', confuse: ['yacht', 'buoy_refl', 'kayak'] },
  buoy_refl:   { label: 'Buoy with radar reflector', group: 'Marks', looks: 'Small echo, brighter than its size suggests.', clue: 'Stays put and paints brightly for its size. The chart plotter shows Ra next to the buoy: charts use Ra for a radar reflector.', confuse: ['buoy', 'yacht_refl', 'fishing'] },
  racon:       { label: 'Racon', group: 'Marks', looks: 'A buoy echo with a line of dashes pointing straight away from you.', clue: 'The dashes spell a Morse letter, and the chart plotter lists the same letter in magenta next to the buoy. The racon switches on and off, so wait up to 40 seconds.', confuse: ['interference', 'sart', 'secondtrace'] },
  lighthouse:  { label: 'Lighthouse or tower', group: 'Marks', looks: 'Strong steady echo at the tip of the land.', clue: 'Brighter than the land around it, and the chart plotter shows a light star (Lt) at that spot.', confuse: ['coast', 'anchored', 'buoy_refl'] },
  coast:       { label: 'Cliffs and high coast', group: 'Land', looks: 'Bright, solid edge with texture behind it.', clue: 'The chart plotter shows land along the same line. Steep cliffs show from far away with a bright edge.', confuse: ['rain', 'beach', 'secondtrace'] },
  beach:       { label: 'Low sandy beach', group: 'Land', looks: 'Weak edge that sits in front of brighter hills.', clue: 'The real waterline is closer than the bright land you see. Keep extra distance.', confuse: ['coast', 'clutter', 'rain'] },
  bridge:      { label: 'Bridge', group: 'Land', looks: 'A straight line of echo across a channel.', clue: 'Joins two shores. It can hide a boat passing underneath.', confuse: ['coast', 'ship', 'secondtrace'] },
  anchored:    { label: 'Anchored ships', group: 'Vessels', looks: 'A group of large, steady echoes.', clue: 'Big echoes that never move, inside the anchorage the chart plotter marks with an anchor.', confuse: ['ship', 'fishing', 'coast'] },
  rain:        { label: 'Rain squall', group: 'Weather', looks: 'Large, soft-edged blob with a grainy texture.', clue: 'Drifts with the wind. Rain clutter control thins it to an outline.', confuse: ['coast', 'clutter', 'secondtrace'] },
  clutter:     { label: 'Sea clutter', group: 'Weather', looks: 'Speckle around the centre, worst upwind.', clue: 'The pattern changes on every sweep. A real target stays put.', confuse: ['rain', 'yacht', 'interference'] },
  sidelobe:    { label: 'Side-lobe echo', group: 'False echoes', looks: 'A faint arc at the same range as a strong close target.', clue: 'Shares the range of a big target nearby. Disappears when you lower the gain.', confuse: ['multiple', 'rain', 'interference'] },
  multiple:    { label: 'Multiple echo', group: 'False echoes', looks: 'Copies of a close ship at two and three times its range.', clue: 'Same bearing as a big ship abeam, at exact multiples of its range, getting fainter.', confuse: ['sidelobe', 'ship', 'secondtrace'] },
  secondtrace: { label: 'Second-trace echo', group: 'False echoes', looks: 'An odd shape where the chart plotter shows only open water.', clue: 'It jumps or vanishes when you change range. It comes from land far beyond the screen.', confuse: ['rain', 'coast', 'sidelobe'] },
  interference:{ label: 'Radar interference', group: 'False echoes', looks: 'Curved or spiral lines of dots that come and go.', clue: 'Another boat\'s radar causes it. Interference rejection removes it.', confuse: ['racon', 'sart', 'clutter'] },
  shadow:      { label: 'Shadow sector', group: 'Blind spots', looks: 'An empty wedge where you would expect echoes.', clue: 'Your mast or a big ship blocks the beam. Turn a few degrees to look into it.', confuse: ['clutter', 'rain', 'kayak'] },
  sart:        { label: 'SART (life raft)', group: 'Emergency', looks: 'A line of 12 dots leading away from one point. Close in, the dots become arcs.', clue: 'Someone is in a life raft. Treat it as a mayday.', confuse: ['racon', 'interference', 'multiple'] },
};
const CATALOG_ORDER = Object.keys(CATALOG);

function drillScene(kind, rnd) {
  const b = Math.floor(rnd() * 300) + 30;
  const at = (brg, r) => polar(0, 0, brg, r);
  const cfg = { own: { x: 0, y: 0, hdg: 0, sog: 0 }, land: [], wind: { kn: 7, from: 220 }, targets: [], rain: [], seed: 1 + Math.floor(rnd() * 1e6) };
  const radar = { range: 3, gain: 66, sea: 35, rain: 10 };
  let marker = null, q = 'What is the echo in the brackets?';
  const T = (k, brg, r, o = {}) => { const t = mkTarget(k, ...at(brg, r), o); cfg.targets.push(t); return t; };
  // A vessel that crosses the screen: it passes `cpa` nm from you on bearing `brg`, starting `lead` nm before that point.
  const cross = (k, brg, cpa, sog, lead, o = {}) => {
    const cog = norm360(brg + 90), [px, py] = at(brg, cpa), [sx, sy] = polar(px, py, cog + 180, lead);
    const t = mkTarget(k, sx, sy, Object.assign({ cog, sog }, o)); cfg.targets.push(t); return t;
  };
  switch (kind) {
    case 'ship': { const t = cross('ship', b, 2.2, 14, 2.5); radar.range = 6; marker = { target: t.id }; break; }
    case 'fishing': { const t = T('fishing', b, 1.8, { cog: rnd() * 360, sog: 2 }); T('fishing', b + 9, 2.1, { cog: rnd() * 360, sog: 3 }); T('fishing', b - 7, 2.3, { cog: rnd() * 360, sog: 1 }); marker = { target: t.id }; break; }
    case 'ferry': {
      // Two harbours facing each other across a sound; the ferry shuttles between their mouths, 2 nm east of you.
      cfg.land = [
        { name: 'North shore', h: 30, edge: 'cliff', pts: [[-7, 3.2], [1.6, 3.2], [1.7, 4.3], [2.3, 4.3], [2.4, 3.2], [7, 3.2], [7, 9], [-7, 9]] },
        { name: 'South shore', h: 30, edge: 'cliff', pts: [[-7, -3.2], [2.1, -3.2], [2.2, -4.3], [2.8, -4.3], [2.9, -3.2], [7, -3.2], [7, -9], [-7, -9]] },
      ];
      const leg = [[2, 3.0], [2.5, -3.0], [2.5, -3.9], [2.5, -3.0], [2, 3.0], [2, 3.9]];
      const t = T('ferry', 0, 0, { sog: 24, route: [...leg, ...leg, ...leg] });
      t.x = 2.1; t.y = 1.2; t.cog = 170;
      radar.range = 6; marker = { target: t.id }; break;
    }
    case 'yacht_refl': { const t = T('yacht_refl', b, 1.5, { cog: norm360(b + 120), sog: 6 }); marker = { target: t.id }; break; }
    case 'yacht': { const t = T('yacht', b, 1.0, { cog: norm360(b + 140), sog: 5 }); cfg.wind.kn = 13; radar.range = 1.5; marker = { target: t.id }; break; }
    case 'kayak': { const t = T('kayak', b, 0.22, { cog: norm360(b + 90), sog: 3 }); cfg.wind.kn = 4; radar.range = 0.5; radar.gain = 72; marker = { target: t.id }; break; }
    case 'buoy': { const t = T('buoy', b, 1.2); marker = { target: t.id }; break; }
    case 'buoy_refl': { const t = T('buoy_refl', b, 1.6); marker = { target: t.id }; break; }
    case 'racon': { const t = T('racon', b, 2.4, { raconPhase: 0 }); radar.range = 6; marker = { target: t.id }; break; }
    case 'lighthouse': {
      cfg.land = [{ name: 'Headland', h: 40, edge: 'cliff', pts: [[-6, 2.2], [-1, 1.9], [0.6, 1.3], [1.2, 1.35], [1.5, 2.0], [6, 2.6], [6, 9], [-6, 9]] }];
      const t = T('lighthouse', 0.9, 1.4); marker = { target: t.id }; break;
    }
    case 'coast': {
      cfg.land = [{ name: 'Cliffs', h: 50, edge: 'cliff', pts: [[-6, 1.8], [-2, 2.0], [0, 1.7], [2, 2.1], [6, 1.9], [6, 9], [-6, 9]] }];
      marker = { at: [0.3, 1.85], size: 16 }; break;
    }
    case 'beach': {
      cfg.land = [{ name: 'Beach', h: 30, edge: 'beach', pts: [[-6, 1.3], [0, 1.25], [6, 1.35], [6, 9], [-6, 9]] }];
      marker = { at: [0.2, 1.3], size: 16 }; radar.range = 3; break;
    }
    case 'bridge': {
      cfg.land = [
        { name: 'West bank', h: 20, edge: 'cliff', pts: [[-6, 0.8], [-0.25, 0.8], [-0.25, 6], [-6, 6]] },
        { name: 'East bank', h: 20, edge: 'cliff', pts: [[0.25, 0.8], [6, 0.8], [6, 6], [0.25, 6]] },
        { name: 'Bridge', h: 30, edge: 'cliff', pts: [[-0.3, 1.5], [0.3, 1.5], [0.3, 1.53], [-0.3, 1.53]] },
      ];
      marker = { at: [0, 1.51], size: 14 }; radar.range = 3; break;
    }
    case 'anchored': {
      const t = T('anchored', b, 3.0); T('anchored', b + 6, 3.4); T('anchored', b - 5, 3.6); T('anchored', b + 2, 4.1);
      radar.range = 6; marker = { target: t.id }; break;
    }
    case 'rain': { const [x, y] = at(b, 3.2); cfg.rain.push(Object.assign({ x, y, r: 0.9, db: 14 }, rainVel(220, 8))); radar.range = 6; radar.rain = 0; marker = { at: [x, y], size: 22 }; break; }
    case 'clutter': { cfg.wind = { kn: 24, from: b }; radar.range = 1.5; radar.sea = 8; radar.gain = 70; marker = { rel: { trueBrg: b, r: 0.28 }, size: 14 }; break; }
    case 'sidelobe': { T('anchored', b, 0.35, { rcs: 20000 }); radar.range = 0.75; radar.gain = 78; radar.sea = 10; marker = { rel: { trueBrg: b + 28, r: 0.37 }, size: 12 }; break; }
    case 'multiple': { cfg.own.hdg = norm360(b - 90); T('anchored', b, 0.28, { rcs: 20000 }); radar.range = 0.75; radar.gain = 72; radar.sea = 15; marker = { rel: { trueBrg: b, r: 0.6 }, size: 12 }; break; }
    case 'secondtrace': { cfg.ghost = { b0: b, b1: b + 18, trueR: 56.5 }; radar.range = 3; marker = { rel: { trueBrg: b + 9, r: 2.65 }, size: 18 }; break; }
    case 'interference': { cfg.interference = true; radar.range = 3; q = 'What are the curved lines of dots that come and go?'; break; }
    case 'shadow': {
      T('yacht_refl', 180, 1.2, { cog: 180, sog: 0 }); T('buoy_refl', 40, 1.4); T('buoy_refl', 300, 1.8);
      marker = { rel: { trueBrg: 180, r: 1.2 }, size: 16 }; q = 'Your friend\'s yacht is anchored 1.2 nm astern. Why is the bracket empty?'; break;
    }
    case 'sart': { const t = T('sart', b, 4.2); radar.range = 12; marker = { target: t.id }; break; }
  }
  return { cfg, radar, marker, q };
}
