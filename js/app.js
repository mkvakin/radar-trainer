// UI, tutor engine, scoring, progress and the main loop.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'cls') el.className = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
    return el;
  };
  const store = {
    get(k, d) { try { const v = localStorage.getItem('radar-trainer:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('radar-trainer:' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };
  const progress = Object.assign({ passed: {}, weak: {}, taught: {} }, store.get('progress', {}));
  const settings = Object.assign({ antH: 8, sound: true, unlockAll: false }, store.get('settings', {}));
  const saveProgress = () => store.set('progress', progress);
  const saveSettings = () => store.set('settings', settings);

  // ------------------------------------------------------------------ game state
  const G = window.G = {
    world: makeWorld({ own: { x: 0.5, y: -0.5 } }), radar: makeRadar('classic'), scope: null,
    sim: { scale: 1, paused: false, auto: false }, markers: [], revealLabels: null, flags: {}, clicks: {}, mem: {},
    mon: { minDist: {}, landMin: Infinity, pen: {} }, heelCtl: false, chapter: null, phase: 'teach', idx: 0, run: null,
    st: {}, look: null, tool: 'inspect', cursor: null, hdgCmd: null,
    t(name) { return this.world.targets.find(t => t.name === name); },
    echo(name) { const t = this.t(name); return t ? this.scope.echoAt(this, t.x, t.y) : 0; },
    echoAt(p) { const o = this.world.own; return this.scope.echoAt(this, o.x + p[0], o.y + p[1]); },
    tgtGeo(name) { const t = this.t(name); return t ? relGeom(this.world, t) : { r: 99, brg: 0 }; },
    clicked(name) { const t = this.t(name); return !!(t && this.clicks[t.id]); },
    load(name, over = {}) {
      const sc = SCENES[name]();
      const cfg = Object.assign({}, sc.world, { antH: settings.antH });
      this.world = makeWorld(cfg);
      this.hdgCmd = this.world.own.hdg;
      this.heelCtl = !!sc.heelCtl;
      const rp = Object.assign({}, sc.radar, over), r = this.radar;
      if (rp.set && rp.set !== r.set) r.set = rp.set;
      Object.assign(r, { marpa: [], tmCenter: null, motion: 'RM', mode: 'HU', offCentre: false, ir: false, doppler: false, ais: false, chart: false,
        trails: { len: 0, true: false }, antRel: 0 });
      r.ebl.on = false; r.vrm.on = false; r.pi.on = false; r.guard.on = false; r.guard.alarm = false;
      r.headingError = rp.headingError || 0; r.align = rp.align || 0;
      r.tuneOpt = 35 + Math.random() * 35;
      // Like a real tuning meter, the bar's highest point changes from scene to scene and never fills the gauge.
      r.tunePeak = 0.55 + Math.random() * 0.3;
      for (const k of ['power', 'range', 'gain', 'sea', 'rain', 'pulse', 'ir', 'mode', 'motion', 'gainAuto', 'seaAuto', 'preset', 'safetyChecked']) if (rp[k] !== undefined) r[k] = rp[k];
      if (rp.power === 'warming') r.warmLeft = SETS[r.set].warm;
      if (!rp.pulse) r.pulse = autoPulse(r.range);
      r.tune = rp.tuned ? r.tuneOpt : rp.tuneOff != null ? clamp(r.tuneOpt + rp.tuneOff * (Math.random() < 0.5 ? -1 : 1), 0, 100) : r.tune;
      if (!SETS[r.set].autoModes) { r.gainAuto = false; r.seaAuto = false; }
      this.scope.clear(); this.markers = []; this.revealLabels = null; this.flags = {}; this.clicks = {};
      this.mon = { minDist: {}, landMin: Infinity, pen: {} };
      this.sim.scale = 1; this.sim.auto = false; this.sim.paused = false;
      buildPanel();
    },
    loadDrill(d) {
      this.world = makeWorld(Object.assign({}, d.cfg, { antH: settings.antH }));
      this.hdgCmd = this.world.own.hdg; this.heelCtl = false;
      const r = this.radar;
      if (r.set !== 'classic') r.set = 'classic';
      Object.assign(r, { power: 'tx', marpa: [], motion: 'RM', mode: 'HU', offCentre: false, ir: false, trails: { len: 180, true: true }, headingError: 0, align: 0, safetyChecked: true,
        gain: d.radar.gain, sea: d.radar.sea, rain: d.radar.rain, range: d.radar.range, gainAuto: false, seaAuto: false });
      r.ebl.on = false; r.vrm.on = false; r.pi.on = false; r.guard.on = false;
      r.pulse = autoPulse(r.range); r.tune = r.tuneOpt;
      this.scope.clear(); this.revealLabels = null; this.sim.scale = 1;
      buildPanel();
    },
    // Switching sets from the top bar keeps the radar running, so you can compare sets without a restart.
    setSet(id, opts = {}) {
      const r = this.radar;
      if (r.set === id) return;
      const was = r.power;
      r.set = id; r.marpa = []; r.doppler = false; r.ais = false; r.chart = false;
      r.power = opts.keepPower && (was === 'tx' || was === 'standby') ? was : 'off';
      if (SETS[id].autoModes) { r.gainAuto = true; r.seaAuto = true; } else { r.gainAuto = false; r.seaAuto = false; }
      if (SETS[id].tune) r.tune = r.tuneOpt;
      r.pulse = autoPulse(r.range);
      this.scope.clear(); buildPanel();
      toast(r.power === 'off' ? `${SETS[id].name} selected. Power it up to use it.` : `${SETS[id].name} selected and running.`);
    },
  };

  // ------------------------------------------------------------------ sound
  let actx = null;
  function beep(freq = 880, dur = 0.12, type = 'sine', vol = 0.06) {
    if (!settings.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = freq; g.gain.value = vol;
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
      o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + dur);
    } catch (e) { /* audio unavailable */ }
  }

  // ------------------------------------------------------------------ toast
  let toastTimer;
  function toast(msg) {
    const el = $('#toast'); el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  // ------------------------------------------------------------------ radar actions
  const A = {
    power() {
      const r = G.radar;
      if (r.power === 'off') { r.power = 'warming'; r.warmLeft = SETS[r.set].warm; beep(440, 0.08); }
      else { r.power = 'off'; G.scope.clear(); r.marpa = []; }
    },
    tx() {
      const r = G.radar;
      if (r.power === 'warming') { toast('The set is still warming up. Transmit works once it reaches Standby.'); return; }
      if (r.power === 'off') { toast('The radar is off. Press Power first.'); return; }
      if (r.power === 'standby') { if (!r.safetyChecked) G.flags.unsafeTx = true; r.power = 'tx'; r.antRel = 0; beep(660, 0.06); }
      else { r.power = 'standby'; G.scope.clear(); }
    },
    clearCheck() { G.radar.safetyChecked = true; beep(990, 0.06); },
    range(d) {
      const r = G.radar, i = RANGES.indexOf(r.range), j = clamp(i + d, 0, RANGES.length - 1);
      if (i === j) return;
      r.range = RANGES[j]; r.pulse = autoPulse(r.range); G.scope.clear();
      if (r.motion === 'TM') r.tmCenter = null;
    },
    mode() {
      const r = G.radar, order = ['HU', 'NU', 'CU'];
      r.mode = order[(order.indexOf(r.mode) + 1) % 3];
      if (r.mode === 'CU') r.cuRef = G.world.own.hdg;
    },
    motion() { const r = G.radar; r.motion = r.motion === 'RM' ? 'TM' : 'RM'; r.tmCenter = null; },
    helm(d) { G.hdgCmd = norm360((G.hdgCmd ?? G.world.own.hdg) + d); if (d < 0) rule19Check(); },
    speed(d) { G.world.own.sog = clamp(Math.round(G.world.own.sog + d), 0, 8); },
    heel(d) { const o = G.world.own; o.heel = clamp(o.heel + d, 0, 30); },
  };

  // ------------------------------------------------------------------ panel
  let updaters = [];
  const upd = fn => { updaters.push(fn); return fn; };
  function btn(label, onclick, ctl, cls = '') { return h('button', { type: 'button', cls: 'btn ' + cls, 'data-ctl': ctl, onclick }, label); }
  function toggle(label, get, set, ctl) {
    const b = h('button', { type: 'button', cls: 'btn toggle', 'data-ctl': ctl, 'aria-pressed': 'false', onclick: () => { set(!get()); } }, label);
    upd(() => { const on = !!get(); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    return b;
  }
  function seg(options, get, set, ctl) {
    const wrap = h('div', { cls: 'seg', role: 'group', 'data-ctl': ctl });
    for (const [val, label] of options) {
      const b = h('button', { type: 'button', cls: 'btn', onclick: () => set(val) }, label);
      upd(() => b.setAttribute('aria-pressed', get() === val ? 'true' : 'false'));
      wrap.append(b);
    }
    return wrap;
  }
  // A rotary knob for the classic set; a slider for the modern sets.
  function dial(id, label, get, set, opts = {}) {
    const classic = SETS[G.radar.set].id === 'classic';
    const min = opts.min ?? 0, max = opts.max ?? 100, step = opts.step ?? 1;
    const fmt = opts.fmt || (v => String(Math.round(v)));
    const out = h('output', { cls: 'dial-val' });
    let ctrl;
    const setV = v => set(clamp(Math.round(v / step) * step, min, max));
    if (classic) {
      const ptr = h('span', { cls: 'ptr' });
      ctrl = h('div', { cls: 'knob', tabindex: '0', role: 'slider', 'aria-label': label, 'aria-valuemin': min, 'aria-valuemax': max }, ptr);
      // Turn the knob by dragging around it: the pointer follows the mouse angle, like a real knob.
      // Bounded knobs (gain, sea, rain, tune) sweep their whole range over 270°. Endless knobs (EBL, VRM)
      // keep turning: the EBL moves one degree per degree, the VRM one screen range per full turn.
      const perDeg = () => (opts.turn ? opts.turn() / 360 : (max - min) / 270);
      const angAt = e => { const b = ctrl.getBoundingClientRect(); return Math.atan2(e.clientX - (b.left + b.width / 2), -(e.clientY - (b.top + b.height / 2))) / D2R; };
      const paint = () => { const v = get(); ptr.style.transform = `rotate(${opts.ptr ? opts.ptr(v) : -135 + 270 * (v - min) / (max - min)}deg)`; ctrl.setAttribute('aria-valuenow', v); };
      let drag = null;
      ctrl.addEventListener('pointerdown', e => { e.preventDefault(); ctrl.focus(); drag = { a: angAt(e), acc: 0 }; ctrl.setPointerCapture(e.pointerId); });
      ctrl.addEventListener('pointermove', e => {
        if (!drag) return;
        const a = angAt(e); drag.acc += angDiff(a, drag.a) * perDeg(); drag.a = a;
        const n = Math.trunc(drag.acc / step);
        if (n) { setV(get() + n * step); drag.acc -= n * step; paint(); }
      });
      const stopDrag = () => { drag = null; };
      ctrl.addEventListener('pointerup', stopDrag); ctrl.addEventListener('pointercancel', stopDrag);
      // The wheel turns a knob only after you click it; otherwise the wheel scrolls the panel as usual.
      ctrl.addEventListener('wheel', e => { if (document.activeElement !== ctrl) return; e.preventDefault(); setV(get() + (e.deltaY < 0 ? 1 : -1) * step * (opts.wheel || 2)); }, { passive: false });
      ctrl.addEventListener('keydown', e => {
        const k = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
        if (k) { e.preventDefault(); setV(get() + k * step * (e.shiftKey ? 5 : 1)); }
      });
      upd(paint);
    } else {
      ctrl = h('input', { type: 'range', min, max, step, 'aria-label': label, cls: 'slider', oninput: e => setV(+e.target.value) });
      upd(() => { if (document.activeElement !== ctrl) ctrl.value = get(); });
    }
    const hold = d => {
      let iv;
      const b = h('button', { type: 'button', cls: 'btn mini', 'aria-label': `${label} ${d > 0 ? 'up' : 'down'}` }, d > 0 ? '+' : '−');
      const go = () => setV(get() + d * step * (opts.btn || 2));
      b.addEventListener('pointerdown', e => { e.preventDefault(); go(); iv = setInterval(go, 110); });
      const stop = () => clearInterval(iv);
      b.addEventListener('pointerup', stop); b.addEventListener('pointerleave', stop);
      b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      return b;
    };
    upd(() => { out.textContent = fmt(get()); });
    const extra = opts.extra || null;
    return h('div', { cls: 'dial' + (classic ? ' is-knob' : ' is-slider'), 'data-ctl': id },
      h('div', { cls: 'dial-top' }, h('span', { cls: 'dial-label' }, label), out),
      h('div', { cls: 'dial-body' }, hold(-1), ctrl, hold(1)), extra);
  }

  function group(title, ...kids) { return h('section', { cls: 'grp' }, h('h3', {}, title), ...kids); }
  function row(...kids) { return h('div', { cls: 'row' }, ...kids); }

  function buildPanel() {
    updaters = [];
    const r = G.radar, S = SETS[r.set], panel = $('#panel');
    panel.innerHTML = '';
    panel.dataset.set = r.set;
    // Power
    const lamp = h('span', { cls: 'lamp' });
    const pstat = h('span', { cls: 'pstat' });
    upd(() => {
      lamp.dataset.state = r.power;
      pstat.textContent = r.power === 'off' ? 'Off' : r.power === 'warming' ? `Warm-up ${Math.ceil(r.warmLeft)} s` : r.power === 'standby' ? 'Standby' : 'Transmitting';
    });
    const clearBtn = btn('Antenna clear', A.clearCheck, 'clear');
    upd(() => { clearBtn.setAttribute('aria-pressed', r.safetyChecked ? 'true' : 'false'); clearBtn.textContent = r.safetyChecked ? 'Antenna clear ✓' : 'Antenna clear'; });
    const txBtn = btn('Transmit', A.tx, 'tx', 'primary');
    upd(() => { txBtn.textContent = r.power === 'tx' ? 'Standby' : 'Transmit'; });
    panel.append(group('Power', h('div', { cls: 'status' }, lamp, pstat, h('span', { cls: 'setname' }, S.name)),
      h('div', { cls: 'legend' }, h('span', { cls: 'lamp', 'data-state': 'warming' }), 'Warming', h('span', { cls: 'lamp', 'data-state': 'standby' }), 'Standby', h('span', { cls: 'lamp', 'data-state': 'tx' }), 'Transmitting'),
      row(clearBtn, btn('Power', A.power, 'power'), txBtn)));
    // Range
    const rv = h('span', { cls: 'big' });
    upd(() => { rv.textContent = fmtNm(r.range) + ' nm'; });
    const rangeRow = h('div', { cls: 'range', 'data-ctl': 'range' },
      btn('−', () => A.range(-1), null, 'sq'), rv, btn('+', () => A.range(1), null, 'sq'));
    const rangeKids = [rangeRow];
    const ringTxt = h('div', { cls: 'note' }); upd(() => { ringTxt.textContent = `Rings every ${fmtNm(RINGS[r.range])} nm`; });
    rangeKids.push(ringTxt);
    if (S.pulseCtl) rangeKids.push(h('div', { cls: 'labelled' }, h('span', {}, 'Pulse'), seg([['S', 'Short'], ['M', 'Med'], ['L', 'Long']], () => r.pulse, v => { r.pulse = v; G.scope.clear(); }, 'pulse')));
    rangeKids.push(toggle('Off-centre', () => r.offCentre, v => { r.offCentre = v; }, 'offc'));
    panel.append(group('Range', ...rangeKids));
    // Picture
    const pic = [];
    if (S.autoModes) {
      const sel = h('select', { id: 'presetSel', 'aria-label': 'Preset', onchange: e => { r.preset = e.target.value; } },
        ...Object.entries(PRESETS).map(([k, p]) => h('option', { value: k }, p.label)));
      upd(() => { if (document.activeElement !== sel) sel.value = r.preset; });
      pic.push(h('div', { cls: 'labelled', 'data-ctl': 'preset' }, h('span', {}, 'Preset'), sel));
    }
    const autoChip = (get, set) => S.autoModes ? toggle('Auto', get, set) : null;
    pic.push(dial('gain', 'Gain', () => (S.autoModes && r.gainAuto ? effControls(G).gain : r.gain), v => { r.gain = v; r.gainAuto = false; }, { extra: autoChip(() => r.gainAuto, v => { r.gainAuto = v; if (!v) r.gain = effControls(G).gain; }) }));
    pic.push(dial('sea', 'Sea', () => (S.autoModes && r.seaAuto ? effControls(G).sea : r.sea), v => { r.sea = v; r.seaAuto = false; }, { extra: autoChip(() => r.seaAuto, v => { if (!v) r.sea = effControls(G).sea; r.seaAuto = v; }) }));
    pic.push(dial('rain', 'Rain', () => r.rain, v => { r.rain = v; }));
    if (S.tune) {
      const bar = h('div', { cls: 'tunebar' }, h('span'));
      upd(() => { bar.firstChild.style.width = (r.power === 'tx' ? 100 * (r.tunePeak || 0.7) * (1 - tuneLossDb(r) / 22) : 0) + '%'; });
      pic.push(dial('tune', 'Tune', () => r.tune, v => { r.tune = v; }, { extra: bar }));
    }
    if (S.interference) pic.push(toggle('Interference rejection (IR)', () => r.ir, v => { r.ir = v; }, 'ir'));
    panel.append(group('Picture', ...pic));
    // Display
    const modeBtn = btn('H UP', A.mode, 'mode'); upd(() => { modeBtn.textContent = { HU: 'H UP', NU: 'N UP', CU: 'C UP' }[r.mode]; });
    const motBtn = btn('RM', A.motion, 'motion'); upd(() => { motBtn.textContent = r.motion === 'RM' ? 'Relative motion' : 'True motion'; });
    const trBtn = btn('Trails off', () => { const L = [0, 30, 60, 180, 360]; r.trails.len = L[(L.indexOf(r.trails.len) + 1) % L.length]; }, 'trails');
    upd(() => { trBtn.textContent = r.trails.len ? `Trails ${r.trails.len < 60 ? r.trails.len + ' s' : r.trails.len / 60 + ' min'}` : 'Trails off'; });
    const trT = btn('R', () => { r.trails.true = !r.trails.true; }, null, 'sq'); upd(() => { trT.textContent = r.trails.true ? 'T' : 'R'; trT.title = r.trails.true ? 'True trails' : 'Relative trails'; });
    const alignV = h('span', { cls: 'mono' }); upd(() => { alignV.textContent = (r.align >= 0 ? '+' : '') + r.align.toFixed(1) + '°'; });
    panel.append(group('Display', row(modeBtn, motBtn), row(trBtn, trT),
      h('div', { cls: 'labelled', 'data-ctl': 'align' }, h('span', {}, 'Heading align'),
        h('div', { cls: 'stepper' }, btn('−1', () => { r.align -= 1; }, null, 'mini'), btn('−.5', () => { r.align -= 0.5; }, null, 'mini'), alignV, btn('+.5', () => { r.align += 0.5; }, null, 'mini'), btn('+1', () => { r.align += 1; }, null, 'mini')))));
    // Measure
    const tools = [['inspect', 'Inspect'], ['ebl', 'EBL'], ['vrm', 'VRM']];
    if (S.marpa) tools.push(['marpa', 'MARPA']);
    const meas = [h('div', { cls: 'labelled' }, h('span', {}, 'Cursor tool'), seg(tools, () => G.tool, v => { G.tool = v; if (v === 'ebl') r.ebl.on = true; if (v === 'vrm') r.vrm.on = true; }, 'tool'))];
    meas.push(h('div', { cls: 'pair', 'data-ctl': 'ebl' }, toggle('EBL', () => r.ebl.on, v => { r.ebl.on = v; }),
      dial('eblk', 'EBL bearing', () => r.ebl.brg, v => { r.ebl.brg = norm360(v); r.ebl.on = true; }, { min: -720, max: 1080, step: 0.5, btn: 1, wheel: 1, turn: () => 360, ptr: v => v, fmt: v => norm360(v).toFixed(1) + '°T' })));
    meas.push(h('div', { cls: 'pair', 'data-ctl': 'vrm' }, toggle('VRM', () => r.vrm.on, v => { r.vrm.on = v; }),
      dial('vrmk', 'VRM range', () => r.vrm.r, v => { r.vrm.r = v; r.vrm.on = true; }, { min: 0, max: 30, step: 0.005, btn: 1, wheel: 2, turn: () => r.range, ptr: v => v / r.range * 360, fmt: v => v.toFixed(v < 1 ? 3 : 2) + ' nm' })));
    const piV = h('span', { cls: 'mono' }); upd(() => { piV.textContent = Math.abs(r.pi.off).toFixed(1) + ' nm ' + (r.pi.off < 0 ? 'port' : 'stbd'); });
    meas.push(h('div', { cls: 'labelled', 'data-ctl': 'pi' }, toggle('PI line', () => r.pi.on, v => { r.pi.on = v; }),
      h('div', { cls: 'stepper' }, btn('◂', () => { r.pi.off = +(r.pi.off - 0.1).toFixed(2); }, null, 'mini'), piV, btn('▸', () => { r.pi.off = +(r.pi.off + 0.1).toFixed(2); }, null, 'mini'))));
    const gz = h('span', { cls: 'note' }); upd(() => { gz.textContent = r.guard.on ? `Guard ${r.guard.r0}–${r.guard.r1} nm, ±${r.guard.half}° ahead${r.guard.alarm ? ' · ALARM' : ''}` : ''; gz.classList.toggle('alarm', r.guard.alarm); });
    meas.push(h('div', { cls: 'labelled', 'data-ctl': 'guard' }, toggle('Guard zone', () => r.guard.on, v => { r.guard.on = v; r.guard.alarm = false; if (v) { r.guard.r0 = +(r.range * 0.35).toFixed(2); r.guard.r1 = +(r.range * 0.7).toFixed(2); } }), gz));
    panel.append(group('Measure', ...meas));
    // MARPA list
    if (S.marpa) {
      const list = h('div', { cls: 'marpa' });
      upd(() => {
        const rows = r.marpa.map(m => {
          const t = G.world.targets.find(q => q.id === m.id); if (!t) return '';
          if (G.world.t - m.since < 30) return `<div><b>${m.label}</b><span>acquiring…</span></div>`;
          const g = relGeom(G.world, t), cpa = g.cpa + m.err, tc = g.tcpaMin;
          const warn = cpa < 0.5 && tc > 0 && tc < 30;
          return `<div class="${warn ? 'warn' : ''}"><b>${m.label}</b><span>CPA ${cpa.toFixed(2)} nm</span><span>TCPA ${tc > 0 ? tc.toFixed(0) + ' min' : 'past'}</span><span>${t.sog.toFixed(0)} kn</span></div>`;
        }).join('');
        list.innerHTML = rows || '<p class="note">Pick the MARPA cursor tool and click an echo to track it.</p>';
      });
      panel.append(group('MARPA targets', list));
    }
    // Overlays
    if (S.ais || S.doppler || S.chart) {
      const ov = [];
      if (S.doppler) ov.push(toggle('Doppler', () => r.doppler, v => { r.doppler = v; }, 'doppler'));
      if (S.ais) ov.push(toggle('AIS', () => r.ais, v => { r.ais = v; }, 'ais'));
      if (S.chart) ov.push(toggle('Chart', () => r.chart, v => { r.chart = v; }, 'chart'));
      panel.append(group('Overlays', row(...ov)));
    }
    // Helm and time
    const hdgV = h('span', { cls: 'big' }), sogV = h('span', { cls: 'big' }), wptV = h('div', { cls: 'note' });
    upd(() => {
      const o = G.world.own;
      hdgV.textContent = String(Math.round(norm360(G.hdgCmd ?? o.hdg))).padStart(3, '0') + '°';
      sogV.textContent = o.sog.toFixed(0) + ' kn';
      if (G.world.dest) { const d = G.world.dest; wptV.textContent = `To ${d.name}: ${String(Math.round(bearingTo(o.x, o.y, d.x, d.y))).padStart(3, '0')}°T, ${dist(o.x, o.y, d.x, d.y).toFixed(2)} nm`; }
      else wptV.textContent = '';
    });
    const helmKids = [
      h('div', { cls: 'helm', 'data-ctl': 'helm' }, btn('−10', () => A.helm(-10), null, 'mini'), btn('−1', () => A.helm(-1), null, 'mini'), hdgV, btn('+1', () => A.helm(1), null, 'mini'), btn('+10', () => A.helm(10), null, 'mini')),
      h('div', { cls: 'helm', 'data-ctl': 'speed' }, h('span', { cls: 'note' }, 'Speed'), btn('−', () => A.speed(-1), null, 'mini'), sogV, btn('+', () => A.speed(1), null, 'mini')),
      wptV,
    ];
    if (G.heelCtl || G.world.own.heel > 0) {
      const hv = h('span', { cls: 'mono' }); upd(() => { hv.textContent = `Heel ${Math.round(G.world.own.heel)}°`; });
      helmKids.push(h('div', { cls: 'helm', 'data-ctl': 'heel' }, btn('Reef', () => A.heel(-6), null, 'mini'), hv, btn('Shake out', () => A.heel(6), null, 'mini')));
    }
    const timeSeg = seg([[1, '×1'], [4, '×4'], [8, '×8'], [16, '×16']], () => (G.sim.paused ? 0 : G.sim.scale), v => { G.sim.scale = v; G.sim.paused = false; G.sim.auto = false; }, 'time');
    const pauseB = btn('Pause', () => { G.sim.paused = !G.sim.paused; }, null, 'mini'); upd(() => { pauseB.textContent = G.sim.paused ? 'Resume' : 'Pause'; });
    helmKids.push(h('div', { cls: 'labelled' }, h('span', {}, 'Time'), timeSeg), row(pauseB, toggle('Auto time', () => G.sim.auto, v => { G.sim.auto = v; })));
    panel.append(group('Helm and time', ...helmKids));
    for (const f of updaters) f();
  }

  // ------------------------------------------------------------------ chapters list
  function chapterUnlocked(ch) {
    if (settings.unlockAll || ch.n === 0) return true;
    const prev = CHAPTERS.find(c => c.n === ch.n - 1);
    return !!progress.passed[prev.id];
  }
  function renderChapters() {
    const nav = $('#chapters'); nav.innerHTML = '';
    for (const stage of STAGES) {
      const list = h('ol', { cls: 'chlist' });
      for (const ch of CHAPTERS.filter(c => c.stage === stage)) {
        const pass = progress.passed[ch.id], open = chapterUnlocked(ch), cur = G.chapter && G.chapter.id === ch.id;
        list.append(h('li', {}, h('button', { type: 'button', cls: 'ch' + (cur ? ' cur' : '') + (pass ? ' done' : '') + (open ? '' : ' locked'),
          onclick: () => { if (!open) { toast('Pass the previous chapter first, or unlock all chapters in Settings.'); return; } startChapter(ch); closeDrawer(); } },
          h('span', { cls: 'chn' }, ch.final ? '★' : String(ch.n)), h('span', { cls: 'cht' }, ch.title, h('small', {}, pass ? (pass.sets && pass.sets.length && setAware(ch) ? `Passed on ${pass.sets.map(k => SETS[k].name).join(', ')}` : `Passed · safety ${pass.safety} · accuracy ${pass.accuracy}`) : open ? `About ${ch.mins} min` : 'Locked')))));
      }
      nav.append(h('div', { cls: 'stage' }, h('h4', {}, stage), list));
    }
    const nPass = Object.keys(progress.passed).length;
    $('#progressNote').textContent = `${nPass} of ${CHAPTERS.length} passed`;
  }

  // ------------------------------------------------------------------ tutor engine
  const tutor = { head: null, body: null, actions: null };
  // Steps marked only: ['classic'] or only: ['modern'] appear only on that family of radar sets.
  const family = () => (G.radar.set === 'classic' ? 'classic' : 'modern');
  const stepsFor = phase => (phase === 'teach' ? G.chapter.teach : G.chapter.check).filter(s => !s.only || s.only.includes(family()));
  const setAware = ch => [...ch.teach, ...ch.check].some(s => s.only || (s.contacts || []).some(c => c.only));
  const curSteps = () => G.steps;
  const curStep = () => curSteps()[G.idx];
  function newRun() { return { hints: 0, preReveals: 0, graded: 0, right: 0, idTotal: 0, idRight: 0, notes: [], penalties: [], t0: performance.now(), simT0: 0, fail: null }; }

  // Chapters whose lessons you already finished open on a choice: take the check, or repeat the lessons.
  const morseText = L => (MORSE[L] || '').split('').map(c => (c === '-' ? '—' : '·')).join(' ');
  function startChapter(ch, opts = {}) {
    G.chapter = ch; G.phase = ch.teach.length ? 'teach' : 'check'; G.idx = 0; G.run = newRun();
    applyChapterSet(ch);
    G.load(ch.scene);
    G.steps = stepsFor(G.phase);
    closeLookout();
    renderChapters();
    const seen = progress.taught[ch.id] || progress.passed[ch.id];
    if (G.phase === 'check') checkIntro();
    else if (seen && !opts.lessons) lessonsDone(true);
    else enterStep();
    store.set('last', ch.id);
  }
  function grade(ok, note) { if (G.phase !== 'check') return; G.run.graded++; if (ok) G.run.right++; else if (note) G.run.notes.push(note); }
  function useHint(kind) { if (G.phase === 'check') { G.run.hints++; } }

  function enterStep() {
    const st = curStep();
    if (!st) { phaseEnd(); return; }
    G.st = { tries: 0, done: false };
    G.markers = []; G.revealLabels = null;
    if (st.t !== 'mission') G.sim.auto = false;
    // Tasks that ask you to click an echo start with the plain Inspect cursor.
    if (st.t === 'click' || st.t === 'mission') G.tool = 'inspect';
    if (st.enter) st.enter(G);
    if (st.look) openLookout(norm360(G.world.own.hdg + (st.look.relBrg || 0)), { labels: st.look.labels });
    if (st.closeLook) closeLookout();
    if (st.t === 'id') setupDrill(st);
    if (st.mark !== undefined || st.t === 'estimate') { const t = G.t(st.target); if (t) G.markers = [{ target: t.id, letter: st.mark === '' ? '' : (st.mark || st.target) }]; }
    if (st.t === 'pickset') { G.st.sel = new Set(); G.st.contacts = st.contacts.filter(c => !c.only || c.only.includes(family())); G.markers = G.st.contacts.map(c => ({ ...(c.marker.name ? { target: G.t(c.marker.name)?.id } : c.marker), letter: c.letter })); }
    if (st.t === 'mission') {
      G.st.t0 = G.world.t; G.st.goalsDone = st.goals.map(() => false); G.st.goalEls = [];
      G.sim.auto = !!st.autoTime; G.mon = { minDist: {}, landMin: Infinity, pen: {} };
    }
    renderTutor();
  }
  function next() { G.idx++; enterStep(); }
  function phaseEnd() {
    if (G.phase === 'teach') { progress.taught[G.chapter.id] = true; saveProgress(); lessonsDone(false); }
    else finishChapter(!G.run.fail);
  }
  function lessonsDone(returning) {
    G.phase = 'teach'; G.markers = []; G.revealLabels = null;
    tutor.head.innerHTML = headHtml(returning ? 'Lessons already done' : 'Lessons done');
    tutor.body.innerHTML = returning
      ? `<p>You have already done the lessons for <b>${G.chapter.title}</b>. Go straight to the check, or run through the lessons again.</p>`
      : `<p>You finished the lessons for <b>${G.chapter.title}</b>. The check comes next. It works without a tutor, and hints cost points.</p>`;
    tutor.actions.replaceChildren(h('button', { type: 'button', cls: 'btn primary', onclick: () => checkIntro() }, 'Start the check'),
      h('button', { type: 'button', cls: 'btn', onclick: () => startChapter(G.chapter, { lessons: true }) }, 'Repeat the lessons'));
  }
  // Every chapter starts on the set you picked last. A few checks switch sets on purpose inside their mission.
  function applyChapterSet(ch) {
    const r = G.radar, want = SETS[settings.set] ? settings.set : null;
    if (!want || r.set === want) return;
    r.set = want; r.power = 'off'; r.marpa = [];
    r.gainAuto = r.seaAuto = !!SETS[want].autoModes;
  }
  function checkIntro() {
    G.phase = 'check'; G.idx = 0; G.run = newRun();
    applyChapterSet(G.chapter);
    G.load(G.chapter.scene); closeLookout();
    G.steps = stepsFor('check');
    enterStep();
  }
  function headHtml(stepLabel) {
    const ch = G.chapter;
    return `<span class="tchap">${ch.final ? 'Final exam' : 'Chapter ' + ch.n} · ${ch.title}</span><span class="tphase ${G.phase}">${stepLabel}</span>`;
  }
  function renderTutor() {
    const st = curStep(), steps = curSteps();
    const label = G.phase === 'teach' ? `Lesson ${G.idx + 1} of ${steps.length}` : `Check · ${G.idx + 1} of ${steps.length}`;
    tutor.head.innerHTML = headHtml(label);
    tutor.body.innerHTML = '';
    const acts = [];
    const p = h('p', { html: (typeof st.text === 'function' ? st.text(G) : st.text) || '' });
    tutor.body.append(p);
    const teach = G.phase === 'teach';
    const showMe = () => { if (!st.show) return; flash(st.show); };
    const hintBtns = () => {
      const out = [];
      if (teach) {
        if (st.show) out.push(h('button', { type: 'button', cls: 'btn', onclick: showMe }, 'Show me'));
        if (st.hint) out.push(h('button', { type: 'button', cls: 'btn', onclick: () => feedback(st.hint, 'hint') }, 'Hint'));
      } else {
        if (st.hint || st.t === 'mission') out.push(h('button', { type: 'button', cls: 'btn ghost', onclick: () => { useHint(); feedback(st.hint || missionNudge(st), 'hint'); } }, 'Nudge (−10)'));
        if (st.show) out.push(h('button', { type: 'button', cls: 'btn ghost', onclick: () => { useHint(); showMe(); } }, 'Point (−10)'));
      }
      return out;
    };
    switch (st.t) {
      case 'info':
        acts.push(h('button', { type: 'button', cls: 'btn primary', onclick: next }, 'Next'), ...hintBtns());
        if (st.show) setTimeout(showMe, 300);
        break;
      case 'do':
        if (st.watch) {
          // Watching steps: you only need to let time run. Show the clock, and let you move on whenever you like.
          G.st.watched = 0;
          const prog = h('div', { cls: 'watch' }, h('div', { cls: 'wbar' }, h('i')), h('span', { cls: 'sub mono' }));
          G.st.watchEl = prog; tutor.body.append(prog);
          acts.push(...hintBtns(), h('button', { type: 'button', cls: 'btn ghost', onclick: next }, 'Next'));
        } else {
          acts.push(...hintBtns());
          if (teach) acts.push(h('button', { type: 'button', cls: 'btn ghost', onclick: next }, 'Skip this task'));
        }
        break;
      case 'click':
        tutor.body.append(h('p', { cls: 'sub' }, 'Click on the radar screen.'));
        acts.push(...hintBtns());
        break;
      case 'ask': {
        const opts = h('div', { cls: 'choices' });
        st.options.forEach((o, i) => opts.append(h('button', { type: 'button', cls: 'btn choice', onclick: e => answerAsk(st, i, e.currentTarget, opts) }, o)));
        tutor.body.append(opts);
        break;
      }
      case 'measure': {
        const ro = h('p', { cls: 'sub mono' });
        G.st.readout = ro;
        tutor.body.append(ro);
        acts.push(h('button', { type: 'button', cls: 'btn primary', onclick: () => submitMeasure(st) }, 'Submit'), ...hintBtns());
        if (teach) acts.push(h('button', { type: 'button', cls: 'btn', onclick: () => flash(st.need === 'bearing' ? 'ebl' : 'vrm') }, 'Show me'));
        break;
      }
      case 'estimate': {
        const inp = h('input', { id: 'estIn', type: 'number', step: '0.05', min: '0', inputmode: 'decimal', placeholder: 'nm', cls: 'num' });
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') submitEstimate(st, inp); });
        tutor.body.append(h('div', { cls: 'inline' }, inp, h('span', {}, 'nautical miles')));
        acts.push(h('button', { type: 'button', cls: 'btn primary', onclick: () => submitEstimate(st, inp) }, 'Submit'));
        break;
      }
      case 'fix': {
        G.st.rec = [null, null];
        const list = h('div', { cls: 'fix' });
        st.marks.forEach((m, i) => {
          const v = h('span', { cls: 'mono' }, '—');
          list.append(h('div', { cls: 'fixrow' }, h('span', {}, m.label), v,
            h('button', { type: 'button', cls: 'btn mini', onclick: () => {
              if (!G.radar.vrm.on) { feedback('Turn the VRM on and set it on the echo first.', 'bad'); return; }
              G.st.rec[i] = G.radar.vrm.r; v.textContent = G.radar.vrm.r.toFixed(3) + ' nm';
              drawFixChart(st, false);
            } }, 'Record VRM')));
        });
        const chart = h('canvas', { id: 'fixChart', cls: 'fixchart', 'aria-label': 'Chart with your range circles' });
        tutor.body.append(list, h('div', { cls: 'chartbox' }, h('span', { cls: 'chartcap' }, 'Chart · your range circles'), chart));
        requestAnimationFrame(() => drawFixChart(st, false));
        acts.push(h('button', { type: 'button', cls: 'btn primary', onclick: () => submitFix(st) }, 'Submit fix'));
        break;
      }
      case 'id': {
        tutor.body.innerHTML = '';
        tutor.body.append(h('p', { html: G.st.drill.q + (G.phase === 'check' ? '' : ' <span class="sub">Watch a few sweeps before you answer.</span>') }));
        const opts = h('div', { cls: 'choices grid' });
        G.st.choices.forEach(k => opts.append(h('button', { type: 'button', cls: 'btn choice', onclick: e => answerId(k, e.currentTarget, opts) }, CATALOG[k].label)));
        const plot = h('canvas', { id: 'plotter', cls: 'plotter', 'aria-label': 'Chart plotter' });
        tutor.body.append(h('div', { cls: 'idgrid' }, opts,
          h('div', { cls: 'chartbox' }, h('span', { cls: 'chartcap' }, 'Chart plotter · north up'), plot,
            h('span', { cls: 'chartnote' }, 'Shows coast and charted marks. Vessels are not on the chart.'))));
        requestAnimationFrame(drawPlotter);
        acts.push(h('button', { type: 'button', cls: 'btn ghost', id: 'revealBtn', onclick: () => reveal(true) }, teach ? 'Reveal' : 'Reveal (counts as wrong)'));
        break;
      }
      case 'pickset': {
        const opts = h('div', { cls: 'choices row' });
        G.st.contacts.forEach(c => {
          const b = h('button', { type: 'button', cls: 'btn toggle sq', 'aria-pressed': 'false', onclick: () => {
            if (G.st.sel.has(c.letter)) G.st.sel.delete(c.letter); else G.st.sel.add(c.letter);
            b.setAttribute('aria-pressed', G.st.sel.has(c.letter) ? 'true' : 'false');
          } }, c.letter);
          opts.append(b);
        });
        tutor.body.append(opts);
        acts.push(h('button', { type: 'button', cls: 'btn primary', onclick: () => submitPickset(st) }, 'Submit'));
        break;
      }
      case 'mission': {
        const ul = h('ul', { cls: 'goals' });
        st.goals.forEach((g, i) => {
          const li = h('li', {}, h('span', { cls: 'tick' }), h('span', {}, g.text));
          if (g.pick) {
            // Each choice shows its Morse pattern, so you match the dashes on the screen without leaving the page.
            const row = h('div', { cls: 'morsepick' });
            const btns = g.pick.options.map(L => h('button', { type: 'button', cls: 'btn mini', onclick: () => {
              if (L === g.pick.answer) { G.st.goalsDone[i] = true; grade(true); beep(1100, 0.08); btns.forEach(x => { x.disabled = true; }); }
              else { grade(false, `Wrong racon letter: you picked ${L} (${morseText(L)}). The dashes spelled ${g.pick.answer} (${morseText(g.pick.answer)}).`); feedback('Not that letter. Count the long and short marks behind the buoy and match them to a pattern.', 'bad'); }
            } }, h('b', {}, L), ' ', h('span', { cls: 'mono' }, morseText(L))));
            row.append(...btns); li.append(row);
          }
          if (g.input) {
            const inp = h('input', { type: 'text', maxlength: '3', placeholder: g.input.placeholder, cls: 'num short', id: 'goalIn' + i });
            const go = () => {
              if (inp.value.trim().toUpperCase() === g.input.answer) { G.st.goalsDone[i] = true; grade(true); beep(1100, 0.08); inp.disabled = true; }
              else { grade(false, `Wrong racon letter: you entered "${inp.value}". The dashes spelled ${g.input.answer} (${MORSE[g.input.answer]}).`); feedback('Not that letter. Watch the dashes behind the buoy: long and short marks spell it in Morse.', 'bad'); }
            };
            inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
            li.append(inp, h('button', { type: 'button', cls: 'btn mini', onclick: go }, 'Report'));
          }
          ul.append(li); G.st.goalEls.push(li);
        });
        const clock = h('p', { cls: 'sub mono' }); G.st.clock = clock;
        tutor.body.append(ul, clock);
        acts.push(...hintBtns(), h('button', { type: 'button', cls: 'btn ghost', onclick: () => { G.run.fail = 'You stopped the check.'; finishChapter(false); } }, 'Give up'));
        break;
      }
    }
    tutor.body.append(h('div', { id: 'fb', cls: 'fb', hidden: true }));
    if (teach) acts.push(h('button', { type: 'button', cls: 'btn ghost skipcheck', onclick: () => { progress.taught[G.chapter.id] = true; saveProgress(); checkIntro(); } }, 'Skip to the check'));
    tutor.actions.replaceChildren(...acts);
  }
  function missionNudge(st) {
    const i = (G.st.goalsDone || []).indexOf(false), g = st.goals[i];
    if (!g) return 'Keep going.';
    const map = {
      'Click the buoy hidden in the sea clutter': 'Fix the gain first, then raise Sea until the speck that stays put shows up south-west of you.',
      'Click the ship hidden in the squall': 'Switch to 3 nm and raise Rain until the squall thins; the ship is the hard echo inside it.',
      'Click the yacht': 'Auto sea on the Offshore preset suppresses everything close in. Switch Sea to manual and lower it.',
    };
    return map[g.text] || `Next goal: ${g.text}.`;
  }
  function feedback(html, kind = 'ok') {
    const fb = $('#fb'); if (!fb) return;
    fb.hidden = false; fb.className = 'fb ' + kind; fb.innerHTML = html;
  }
  function doneThenNext(msg = 'Done.') {
    if (G.st.done) return; G.st.done = true;
    beep(1180, 0.07);
    feedback(msg, 'ok');
    tutor.actions.replaceChildren(h('button', { type: 'button', cls: 'btn primary', onclick: next }, 'Next'));
  }
  function answerAsk(st, i, el, wrap) {
    if (G.st.done) return;
    const ok = i === st.answer;
    if (G.st.tries === 0) grade(ok, `Question: ${st.text.replace(/<[^>]+>/g, '')}`);
    G.st.tries++;
    el.classList.add(ok ? 'right' : 'wrong');
    if (ok) { [...wrap.children].forEach(b => { b.disabled = true; }); doneThenNext((st.explain ? st.explain : 'Correct.')); }
    else { beep(220, 0.12, 'square', 0.03); feedback('Not quite. Try another answer.', 'bad'); }
  }
  function onScopeClick(hit) {
    const st = curStep();
    if (!st || G.st.done) return;
    if (st.t === 'click') {
      const ok = st.ok(G, hit);
      if (G.st.tries === 0) grade(ok, `Click task: ${st.text.replace(/<[^>]+>/g, '')}`);
      G.st.tries++;
      if (ok) doneThenNext('Correct.');
      else { beep(220, 0.12, 'square', 0.03); feedback(`Not quite.${st.hint && (G.phase === 'teach' && G.st.tries >= 2) ? ' ' + st.hint : ' Try again.'}`, 'bad'); }
    }
  }
  function submitMeasure(st) {
    const t = G.t(st.target), r = G.radar; if (!t) return;
    const g = relGeom(G.world, t);
    const errs = [];
    let ok = true;
    if (st.need !== 'bearing') { if (!r.vrm.on) { feedback('Turn the VRM on first.', 'bad'); return; } const e = Math.abs(r.vrm.r - g.r); if (e > st.tolR) { ok = false; errs.push(`range off by ${e.toFixed(2)} nm (true ${g.r.toFixed(2)} nm)`); } }
    if (st.need !== 'range') { if (!r.ebl.on) { feedback('Turn the EBL on first.', 'bad'); return; } const e = Math.abs(angDiff(r.ebl.brg, g.brg)); if (e > st.tolB) { ok = false; errs.push(`bearing off by ${e.toFixed(1)}° (true ${g.brg.toFixed(1)}°)`); } }
    if (G.st.tries === 0) grade(ok, `Measurement of ${st.target}: ${errs.join(', ')}`);
    G.st.tries++;
    if (ok) doneThenNext(`Good. True range ${g.r.toFixed(2)} nm, true bearing ${g.brg.toFixed(1)}°.`);
    else feedback(`Not close enough: ${errs.join('; ')}. ${G.phase === 'teach' ? 'Lay the marker on the near edge of the echo and try again.' : 'Try again.'}`, 'bad');
  }
  function submitEstimate(st, inp) {
    const v = parseFloat(inp.value); if (!isFinite(v)) { feedback('Type a number of nautical miles, such as 1.5.', 'bad'); return; }
    const g = G.tgtGeo(st.target), ok = Math.abs(v - g.r) <= st.tol * g.r;
    grade(ok, `Estimate for ${st.target}: you said ${v} nm, true ${g.r.toFixed(2)} nm.`);
    G.st.tries++;
    feedback(ok ? `Good. The true range is ${g.r.toFixed(2)} nm.` : `The true range is ${g.r.toFixed(2)} nm. Count the rings: each is ${fmtNm(RINGS[G.radar.range])} nm.`, ok ? 'ok' : 'bad');
    G.st.done = true; inp.disabled = true;
    tutor.actions.replaceChildren(h('button', { type: 'button', cls: 'btn primary', onclick: next }, 'Next'));
  }
  function submitFix(st) {
    if (G.st.rec.some(v => v == null)) { feedback('Record a VRM range for both marks first.', 'bad'); return; }
    const o = G.world.own, poly = st.marks[1].poly ? G.world.land.find(L => L.name === st.marks[1].poly).pts : null;
    const d1 = (x, y) => dist(x, y, ...st.marks[0].at), d2 = (x, y) => poly ? distToPoly(x, y, poly) : dist(x, y, ...st.marks[1].at);
    let best = null, be = Infinity;
    for (let dx = -1; dx <= 1; dx += 0.01) for (let dy = -1; dy <= 1; dy += 0.01) {
      const x = o.x + dx, y = o.y + dy, e = (d1(x, y) - G.st.rec[0]) ** 2 + (d2(x, y) - G.st.rec[1]) ** 2;
      if (e < be) { be = e; best = [x, y]; }
    }
    const err = dist(best[0], best[1], o.x, o.y), ok = err <= st.tol;
    grade(ok, `Position fix error ${Math.round(err * 1852)} m.`);
    G.st.done = true;
    G.markers = [{ at: best, letter: 'FIX', size: 8 }];
    G.st.fix = best; drawFixChart(st, true);
    feedback(ok ? `Your fix lies ${Math.round(err * 1852)} m from your true position. That is a good fix.` : `Your fix lies ${Math.round(err * 1852)} m from your true position, more than the 185 m allowed. Set the VRM on the nearest edge of each echo.`, ok ? 'ok' : 'bad');
    tutor.actions.replaceChildren(h('button', { type: 'button', cls: 'btn primary', onclick: next }, 'Next'));
  }
  // Chart plotter for recognition drills: north up, your boat at the centre, only what a chart shows.
  function drawPlotter() {
    const cv = $('#plotter'); if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2), W = cv.clientWidth, H = cv.clientHeight;
    if (!W) return;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const o = G.world.own, R = G.radar.range * 1.15, k = Math.min(W, H) / 2 / R;
    const X = x => W / 2 + (x - o.x) * k, Y = y => H / 2 - (y - o.y) * k;
    ctx.fillStyle = '#0D1B22'; ctx.fillRect(0, 0, W, H);
    for (const L of G.world.land) {
      ctx.beginPath(); L.pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)))); ctx.closePath();
      ctx.fillStyle = L.edge === 'beach' ? '#4A4530' : '#3A3628'; ctx.fill(); ctx.strokeStyle = '#8C7F55'; ctx.lineWidth = 1; ctx.stroke();
      if (L.edge === 'beach') { ctx.fillStyle = '#B9A86A'; ctx.font = '600 10px "Atkinson Hyperlegible", sans-serif'; const p = L.pts.reduce((m, q) => (Math.hypot(q[0] - o.x, q[1] - o.y) < Math.hypot(m[0] - o.x, m[1] - o.y) ? q : m)); ctx.fillText('Sand', X(p[0]) + 4, Y(p[1]) - 6); }
    }
    ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(210,168,91,0.45)';
    ctx.beginPath(); ctx.arc(W / 2, H / 2, G.radar.range * k, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '600 10.5px "Atkinson Hyperlegible", sans-serif'; ctx.textBaseline = 'middle';
    const label = (x, y, txt, col) => { ctx.fillStyle = col; ctx.fillText(txt, X(x) + 7, Y(y)); };
    const anch = G.world.targets.filter(t => t.kind === 'anchored');
    if (anch.length) {
      const cx = anch.reduce((a, t) => a + t.x, 0) / anch.length, cy = anch.reduce((a, t) => a + t.y, 0) / anch.length;
      ctx.strokeStyle = '#C77DFF'; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.arc(X(cx), Y(cy), 0.8 * k, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      label(cx, cy, '⚓ Anchorage', '#C77DFF');
    }
    for (const t of G.world.targets) {
      const x = X(t.x), y = Y(t.y);
      if (t.kind === 'buoy' || t.kind === 'buoy_refl' || t.kind === 'racon') {
        ctx.fillStyle = t.color || (t.kind === 'racon' ? '#D9B23A' : '#C23B2E');
        ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 4, y + 3); ctx.lineTo(x - 4, y + 3); ctx.closePath(); ctx.fill();
        if (t.kind === 'buoy') label(t.x, t.y, t.name || 'Buoy', '#DCE5E9');
        if (t.kind === 'buoy_refl') label(t.x, t.y, (t.name ? t.name + ' ' : 'Buoy ') + 'Ra', '#DCE5E9');
        if (t.kind === 'racon') { ctx.strokeStyle = '#E055C8'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke(); label(t.x, t.y + 0.0, `   Racon (${t.racon})`, '#E055C8'); }
      } else if (t.kind === 'lighthouse') {
        ctx.fillStyle = '#F2C14E'; ctx.beginPath();
        for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? 2.5 : 6; ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); }
        ctx.closePath(); ctx.fill(); label(t.x, t.y, 'Lt', '#F2C14E');
      }
    }
    ctx.strokeStyle = '#7FE0FF'; ctx.lineWidth = 1.5; ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(o.hdg * D2R);
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.stroke(); ctx.restore();
    ctx.fillStyle = 'rgba(220,229,233,0.6)'; ctx.fillText(`${fmtNm(G.radar.range)} nm`, W / 2 + G.radar.range * k * 0.7 + 4, H / 2 - G.radar.range * k * 0.7);
  }
  // A small chart for position fixing: land, the two charted marks, and a circle for each recorded range.
  function drawFixChart(st, reveal) {
    const cv = $('#fixChart'); if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2), W = cv.clientWidth, H = cv.clientHeight;
    if (!W) return;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const o = G.world.own, pts = st.marks.map(m => m.at).concat([[o.x, o.y]]);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), pad = 1.4;
    const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
    const k = Math.min(W / (x1 - x0), H / (y1 - y0)), ox = (W - (x1 - x0) * k) / 2, oy = (H - (y1 - y0) * k) / 2;
    const X = x => ox + (x - x0) * k, Y = y => H - oy - (y - y0) * k;
    ctx.fillStyle = '#0D1B22'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(140,170,190,0.12)'; ctx.lineWidth = 1;
    for (let gx = Math.ceil(x0); gx <= x1; gx++) { ctx.beginPath(); ctx.moveTo(X(gx), 0); ctx.lineTo(X(gx), H); ctx.stroke(); }
    for (let gy = Math.ceil(y0); gy <= y1; gy++) { ctx.beginPath(); ctx.moveTo(0, Y(gy)); ctx.lineTo(W, Y(gy)); ctx.stroke(); }
    for (const L of G.world.land) {
      ctx.beginPath(); L.pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)))); ctx.closePath();
      ctx.fillStyle = '#3A3628'; ctx.fill(); ctx.strokeStyle = '#8C7F55'; ctx.stroke();
    }
    ctx.font = '600 11px "Atkinson Hyperlegible", sans-serif'; ctx.textBaseline = 'middle';
    st.marks.forEach((m, i) => {
      const [mx, my] = m.at;
      ctx.fillStyle = '#F2E6C4'; ctx.beginPath(); ctx.arc(X(mx), Y(my), 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillText(m.label, X(mx) + 7, Y(my) - 9);
      const r = G.st.rec && G.st.rec[i];
      if (r != null) {
        ctx.strokeStyle = i ? '#7FD0E8' : '#D2A85B'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(X(mx), Y(my), r * k, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = ctx.strokeStyle; ctx.fillText(`${r.toFixed(2)} nm`, X(mx) + r * k * 0.72 + 4, Y(my) - r * k * 0.72);
      }
    });
    if (reveal && G.st.fix) {
      const [fx, fy] = G.st.fix;
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(X(fx) - 6, Y(fy) - 6); ctx.lineTo(X(fx) + 6, Y(fy) + 6); ctx.moveTo(X(fx) + 6, Y(fy) - 6); ctx.lineTo(X(fx) - 6, Y(fy) + 6); ctx.stroke();
      ctx.fillStyle = '#FFFFFF'; ctx.fillText('Your fix', X(fx) + 9, Y(fy) + 10);
      ctx.fillStyle = '#48B482'; ctx.beginPath(); ctx.arc(X(o.x), Y(o.y), 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillText('True position', X(o.x) + 9, Y(o.y) - 10);
    }
    ctx.fillStyle = 'rgba(220,229,233,0.7)'; ctx.fillRect(12, H - 14, k, 2); ctx.fillText('1 nm', 12, H - 24);
    ctx.fillText('N ↑', W - 30, 14);
  }
  function submitPickset(st) {
    const cs = G.st.contacts, want = new Set(cs.filter(c => c.isFalse).map(c => c.letter));
    let right = 0;
    for (const c of cs) { const ok = G.st.sel.has(c.letter) === c.isFalse; if (ok) right++; grade(ok, ok ? null : `Echo ${c.letter}: ${c.isFalse ? 'false, ' + c.why : 'real'}.`); }
    G.st.done = true;
    const all = right === cs.length;
    G.revealLabels = cs.map(c => ({ ...(c.marker.name ? { target: G.t(c.marker.name)?.id } : c.marker), text: `${c.letter}: ${c.isFalse ? c.why : KIND_NAMES[G.t(c.marker.name)?.kind] || 'real'}` }));
    feedback(all ? `All ${cs.length} correct.` : `${right} of ${cs.length} correct. The false echoes were ${[...want].join(', ')}. The labels on the screen show what each echo was.`, all ? 'ok' : 'bad');
    tutor.actions.replaceChildren(h('button', { type: 'button', cls: 'btn primary', onclick: next }, 'Next'));
  }

  // ---- recognition drills
  const DRILL_POOL = CHAPTERS.find(c => c.id === 'gallery').teach.filter(s => s.drill).map(s => s.drill);
  function pickWeighted() {
    const pool = DRILL_POOL.filter(k => k !== G.st.lastKind);
    const w = pool.map(k => 1 + 2 * (progress.weak[k] || 0));
    let x = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { x -= w[i]; if (x <= 0) return pool[i]; }
    return pool[0];
  }
  let lastDrillKind = null;
  function setupDrill(st) {
    G.st.lastKind = lastDrillKind;
    const kind = st.drill === 'random' ? pickWeighted() : st.drill;
    lastDrillKind = kind;
    const d = drillScene(kind, Math.random);
    G.loadDrill(d);
    G.st.kind = kind; G.st.drill = d;
    G.markers = d.marker ? [Object.assign({}, d.marker)] : [];
    const ch = [kind, ...CATALOG[kind].confuse].sort(() => Math.random() - 0.5);
    G.st.choices = ch;
    closeLookout();
  }
  function answerId(k, el, wrap) {
    if (G.st.answered) return;
    G.st.answered = true;
    const ok = k === G.st.kind && !G.st.revealed;
    if (G.phase === 'check') { G.run.idTotal++; if (ok) G.run.idRight++; grade(ok, ok ? null : k ? `Called a ${CATALOG[G.st.kind].label.toLowerCase()} a ${CATALOG[k].label.toLowerCase()}.` : `Revealed a ${CATALOG[G.st.kind].label.toLowerCase()} before answering.`); }
    progress.weak[G.st.kind] = Math.max(0, (progress.weak[G.st.kind] || 0) + (ok ? -1 : 2)); saveProgress();
    [...wrap.children].forEach(b => { b.disabled = true; if (b.textContent === CATALOG[G.st.kind].label) b.classList.add('right'); });
    if (!ok) el.classList.add('wrong');
    ok ? beep(1180, 0.07) : beep(220, 0.12, 'square', 0.03);
    const c = CATALOG[G.st.kind];
    feedback(`${ok ? 'Correct' : 'It was a <b>' + c.label.toLowerCase() + '</b>'}. ${c.clue}`, ok ? 'ok' : 'bad');
    tutor.actions.replaceChildren(h('button', { type: 'button', cls: 'btn primary', onclick: next }, 'Next'),
      h('button', { type: 'button', cls: 'btn', onclick: () => reveal(false) }, 'Reveal the scene'));
  }
  function reveal(before) {
    if (before && !G.st.answered) {
      G.st.revealed = true;
      if (G.phase === 'check') { G.run.preReveals++; }
    }
    const d = G.st.drill, o = G.world.own, kind = G.st.kind, c = CATALOG[kind];
    const mp = d.marker ? markerPos(G, d.marker) : null;
    const brg = mp ? bearingTo(o.x, o.y, mp[0], mp[1]) : o.hdg;
    openLookout(brg, { labels: true, forceDay: true, focus: d.marker && d.marker.target });
    G.revealLabels = G.world.targets.map(t => ({ target: t.id, text: KIND_NAMES[t.kind] }));
    if (d.marker && !d.marker.target) G.revealLabels.push(Object.assign({}, d.marker, { text: c.label }));
    feedback(`<b>${c.label}.</b> ${c.looks} ${c.clue}`, 'hint');
    if (before && !G.st.answered) {
      const wrap = $('.choices');
      if (wrap) answerId(null, h('span'), wrap);
    }
  }

  // ---- missions
  function missionTick(st) {
    if (G.st.over) return;
    const w = G.world;
    st.goals.forEach((g, i) => { if (!G.st.goalsDone[i] && g.done && g.done(G)) { G.st.goalsDone[i] = true; beep(1180, 0.06); } });
    G.st.goalEls.forEach((li, i) => li.classList.toggle('done', G.st.goalsDone[i]));
    const el = w.t - G.st.t0;
    if (G.st.clock) G.st.clock.textContent = `Ship's time ${fmtTime(el)} of ${fmtTime(st.limit)} · speed ×${G.sim.paused ? 0 : G.sim.scale}${G.sim.auto ? ' (auto)' : ''}`;
    const f = st.fail && st.fail(G);
    if (f) { G.st.over = true; G.run.fail = f; finishChapter(false); return; }
    if (G.st.goalsDone.every(Boolean)) { G.st.over = true; G.run.simT = el; doneMission(); return; }
    if (el > st.limit) { G.st.over = true; G.run.fail = 'Time ran out. Still open: ' + st.goals.filter((g, i) => !G.st.goalsDone[i]).map(g => g.text.toLowerCase()).join('; ') + '.'; finishChapter(false); }
  }
  function doneMission() { G.idx++; const st = curStep(); if (!st) finishChapter(true); else enterStep(); }
  function rule19Check() {
    const st = curStep();
    if (!st || st.t !== 'mission' || !st.rule19 || G.mon.pen.rule19) return;
    const w = G.world, o = w.own;
    for (const t of w.targets) {
      if (!VESSELS.test(t.kind) || t.kind === 'anchored') continue;
      const g = relGeom(w, t), rel = angDiff(g.brg, o.hdg);
      if (g.r < 4 && g.closing > 0.5 && Math.abs(rel) < 90) {
        G.mon.pen.rule19 = true;
        G.run.penalties.push({ pts: 15, text: `You turned to port for ${t.name || 'a vessel'} forward of the beam. Rule 19 says avoid that in restricted visibility.` });
        toast('Rule 19: avoid turning to port for a vessel forward of the beam.');
        return;
      }
    }
  }
  function monitor(dt) {
    const st = curStep(); if (!st || st.t !== 'mission' || G.st.over) return;
    const w = G.world, o = w.own;
    for (const t of w.targets) {
      if (!VESSELS.test(t.kind)) continue;
      const d = dist(o.x, o.y, t.x, t.y);
      G.mon.minDist[t.id] = Math.min(G.mon.minDist[t.id] ?? Infinity, d);
      if (st.penaltyRange && d < st.penaltyRange && !G.mon.pen[t.id]) {
        G.mon.pen[t.id] = true;
        G.run.penalties.push({ pts: 15, text: `${t.name || 'A vessel'} passed ${Math.round(d * 1852)} m from you. Aim for 0.5 nm (926 m) or more.` });
      }
    }
    G.mon.landAcc = (G.mon.landAcc || 0) + dt;
    if (G.mon.landAcc > 1) { G.mon.landAcc = 0; G.mon.landMin = Math.min(G.mon.landMin, distToLand(w, o.x, o.y)); }
  }

  // ---- finish and debrief
  function scores() {
    const run = G.run, st = G.chapter.check.find(s => s.t === 'mission');
    const safety = clamp(100 - run.penalties.reduce((a, p) => a + p.pts, 0) - (run.fail ? 40 : 0), 0, 100);
    const accuracy = run.graded ? Math.round(100 * run.right / run.graded) : 100;
    let fluency = 100 - run.hints * 10 - run.preReveals * 10;
    if (st && run.simT) fluency -= Math.round(30 * run.simT / st.limit);
    return { safety: Math.round(safety), accuracy, fluency: clamp(Math.round(fluency), 0, 100) };
  }
  function finishChapter(ok) {
    const ch = G.chapter, sc = scores();
    let pass = ok && !G.run.fail;
    if (pass && ch.pass) pass = ch.pass(G.run);
    if (pass && !ch.pass && sc.accuracy < 60) pass = false;
    G.sim.paused = false;
    if (pass) {
      const prev = progress.passed[ch.id];
      progress.passed[ch.id] = prev ? { safety: Math.max(prev.safety, sc.safety), accuracy: Math.max(prev.accuracy, sc.accuracy), fluency: Math.max(prev.fluency, sc.fluency), sets: prev.sets || [] } : { ...sc, sets: [] };
      const ps = progress.passed[ch.id].sets; if (!ps.includes(G.radar.set)) ps.push(G.radar.set);
      saveProgress();
    }
    renderChapters();
    showDebrief(ch, pass, sc);
    tutor.head.innerHTML = headHtml(pass ? 'Passed' : 'Not passed');
    tutor.body.innerHTML = pass ? `<p>You passed <b>${ch.title}</b>.</p>` : `<p>${G.run.fail || 'The check needs another try.'}</p>`;
    const nextCh = CHAPTERS.find(c => c.n === ch.n + 1);
    tutor.actions.replaceChildren(...[
      h('button', { type: 'button', cls: 'btn' + (pass ? '' : ' primary'), onclick: () => checkIntro() }, 'Retry the check'),
      pass && nextCh ? h('button', { type: 'button', cls: 'btn primary', onclick: () => startChapter(nextCh) }, `Next: ${nextCh.title}`) : null,
      h('button', { type: 'button', cls: 'btn ghost', onclick: () => startChapter(ch, { lessons: true }) }, 'Repeat the lessons')].filter(Boolean));
  }
  function bar(label, v) { return `<div class="score"><span>${label}</span><div class="sbar"><i style="width:${v}%"></i></div><b>${v}</b></div>`; }
  function showDebrief(ch, pass, sc) {
    const dlg = $('#debrief'), body = $('#debriefBody');
    const notes = [...(G.run.fail ? [G.run.fail] : []), ...G.run.penalties.map(p => p.text), ...G.run.notes].slice(0, 8);
    const nextCh = CHAPTERS.find(c => c.n === ch.n + 1);
    body.innerHTML = `
      <p class="eyebrow">${ch.final ? 'Final exam' : 'Chapter ' + ch.n} · ${ch.title}</p>
      <h2>${pass ? 'Passed' : 'Not passed yet'}</h2>
      ${ch.id === 'gallery' ? `<p>You named ${G.run.idRight} of ${G.run.idTotal} echoes correctly. The pass mark is 17 of 20.</p>` : ''}
      <div class="scores">${bar('Safety', sc.safety)}${bar('Accuracy', sc.accuracy)}${bar('Fluency', sc.fluency)}</div>
      ${notes.length ? `<h3>What to work on</h3><ul class="notes">${notes.map(n => `<li>${n}</li>`).join('')}</ul>` : '<p>No mistakes recorded.</p>'}
      ${ch.final && pass ? readinessHtml() : ''}`;
    const acts = $('#debriefActions'); acts.innerHTML = '';
    acts.append(h('button', { type: 'button', cls: 'btn', onclick: () => { dlg.close(); checkIntro(); } }, 'Retry the check'));
    if (pass && nextCh) acts.append(h('button', { type: 'button', cls: 'btn primary', onclick: () => { dlg.close(); startChapter(nextCh); } }, `Next: ${nextCh.title}`));
    acts.append(h('button', { type: 'button', cls: 'btn ghost', onclick: () => dlg.close() }, 'Close'));
    try { dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); }
  }
  const READY = [
    ['power', 'I can start the radar, check the heading line and get a usable picture in under 4 minutes.'],
    ['tune', 'I can tune gain, sea and rain by hand, and I know the order.'],
    ['measure', 'I can measure the range and bearing of any echo with the VRM and EBL.'],
    ['collision', 'I can tell whether a ship is on a collision course, without MARPA.'],
    ['gallery', 'I can name the common echoes.'],
    ['ghosts', 'I can spot the common false echoes, and I know the radar horizon for my antenna height.'],
    ['emergency', 'I know what my radar cannot see: low fibreglass boats, people in the water, targets in the shadow sector.'],
    ['measure', 'I can fix my position from radar ranges to the coast.'],
    ['collision', 'I keep a visual lookout and use radar as an aid, as COLREGs Rule 5 requires.'],
  ];
  function readinessHtml() {
    const horizon = horizonNm(settings.antH, 3).toFixed(1);
    return `<section class="card">
      <h3>Readiness card</h3>
      <ul class="ready">${READY.map(([id, t]) => `<li class="${progress.passed[id] ? 'ok' : ''}"><span class="tick"></span>${t}</li>`).join('')}</ul>
      <p class="sub">With your ${settings.antH} m antenna, a 3 m buoy shows from about ${horizon} nm.</p>
      <h4>First three things on your own boat</h4>
      <ol><li>Find your radar's warm-up time and where the Standby button is.</li><li>Find the blind sector astern: watch a buoy as you turn past it.</li><li>Practise in clear weather, comparing the screen with what you see, before you trust it in fog.</li></ol>
    </section>`;
  }

  // ------------------------------------------------------------------ lookout
  function openLookout(center, opts = {}) {
    G.look = { center, opts };
    $('#lookout').hidden = false;
    $('#lookCap').textContent = opts.forceDay ? `Reveal · daylight view towards ${String(Math.round(center)).padStart(3, '0')}°T` : `Lookout towards ${String(Math.round(center)).padStart(3, '0')}°T · what you would see from the cockpit`;
    requestAnimationFrame(() => { drawLookout($('#lookCanvas'), G, center, opts); fitScope(); });
  }
  function closeLookout() { G.look = null; $('#lookout').hidden = true; fitScope(); }

  // ------------------------------------------------------------------ highlight
  function flash(id) {
    const els = document.querySelectorAll(`[data-ctl="${id}"]`);
    els.forEach(el => { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
    setTimeout(() => els.forEach(el => el.classList.remove('flash')), 4200);
  }

  // ------------------------------------------------------------------ readouts
  function fmtTime(s) { s = Math.max(0, Math.floor(s)); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; }
  const pad3 = v => String(Math.round(norm360(v)) % 360).padStart(3, '0');
  function refreshCorners() {
    const r = G.radar, S = SETS[r.set], c = effControls(G), o = G.world.own;
    $('#cTL').innerHTML = `<b>${fmtNm(r.range)} nm</b><span>RINGS ${fmtNm(RINGS[r.range])}</span>${S.pulseCtl ? `<span>PULSE ${r.pulse}</span>` : ''}`;
    $('#cTR').innerHTML = `<b>${{ HU: 'H UP', NU: 'N UP', CU: 'C UP' }[r.mode]} · ${r.motion}</b><span>HDG ${pad3(o.hdg)}° · ${o.sog.toFixed(1)} KN</span><span>${S.name.toUpperCase()}</span>`;
    const A = (auto, v) => (S.autoModes && auto ? 'A' : '') + Math.round(v);
    $('#cBL').innerHTML = `<span>GAIN ${A(r.gainAuto, c.gain)}</span><span>SEA ${A(r.seaAuto, c.sea)}</span><span>RAIN ${Math.round(c.rain)}${S.interference ? ' · IR ' + (r.ir ? 'ON' : 'OFF') : ''}</span>`;
    const lines = [];
    if (r.ebl.on) lines.push(`EBL ${r.ebl.brg.toFixed(1)}°T · ${pad3(angDiff(r.ebl.brg, o.hdg))}°R`);
    if (r.vrm.on) lines.push(`VRM ${r.vrm.r.toFixed(r.vrm.r < 1 ? 3 : 2)} NM`);
    let cur;
    if (G.cursor && r.power === 'tx') { const p = G.scope.fromScreen(G, ...G.cursor); cur = `<span>CURSOR ${p.rNm.toFixed(2)} NM ${p.brg.toFixed(0).padStart(3, '0')}°T</span>`; }
    else cur = `<span class="ph">CURSOR –.–– NM –––°T</span><span class="ph sm">${r.power === 'tx' ? 'Point at the screen to read' : 'Reads once transmitting'}</span>`;
    $('#cBR').innerHTML = lines.map(l => `<span>${l}</span>`).join('') + cur;
    if (G.st && G.st.readout) G.st.readout.textContent = `${r.ebl.on ? 'EBL ' + r.ebl.brg.toFixed(1) + '°T' : 'EBL off'} · ${r.vrm.on ? 'VRM ' + r.vrm.r.toFixed(3) + ' nm' : 'VRM off'}`;
  }

  // ------------------------------------------------------------------ input on the scope
  function setupScopeInput() {
    const el = $('#ovl');
    const pos = e => { const b = el.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    let dragging = false;
    const applyTool = (p, isClick) => {
      const r = G.radar, hit = hitAt(p);
      if (G.tool === 'ebl') { r.ebl.on = true; r.ebl.brg = norm360(hit.brg + headingOffset(r)); }
      else if (G.tool === 'vrm') { r.vrm.on = true; r.vrm.r = +hit.rNm.toFixed(3); }
      else if (isClick && G.tool === 'marpa') {
        if (!hit.target) { toast('No echo there to track. Click closer to the echo.'); return; }
        G.clicks[hit.target.id] = true; // picking an echo counts as finding it, whichever tool you hold
        if (r.marpa.some(m => m.id === hit.target.id)) return;
        r.marpa.push({ id: hit.target.id, since: G.world.t, label: 'M' + (r.marpa.length + 1), err: (Math.random() - 0.5) * 0.06, lastSeen: G.world.t });
        beep(900, 0.05);
      } else if (isClick) {
        if (hit.target) G.clicks[hit.target.id] = true;
        onScopeClick(hit);
      }
    };
    el.addEventListener('pointerdown', e => { if (!G.scope.inDisplay(...pos(e))) return; dragging = true; el.setPointerCapture(e.pointerId); applyTool(pos(e), true); });
    el.addEventListener('pointermove', e => { const p = pos(e); G.cursor = G.scope.inDisplay(...p) ? p : null; if (dragging && (G.tool === 'ebl' || G.tool === 'vrm')) applyTool(p, false); });
    el.addEventListener('pointerup', () => { dragging = false; });
    el.addEventListener('pointerleave', () => { G.cursor = null; });
  }
  function hitAt(p) {
    const base = G.scope.fromScreen(G, p[0], p[1]);
    let best = null, bd = 18;
    for (const t of G.world.targets) {
      const [tx, ty] = G.scope.worldToScreen(G, t.x, t.y), d = Math.hypot(tx - p[0], ty - p[1]);
      if (d < bd && G.scope.echoAt(G, t.x, t.y) > 0.18) { bd = d; best = t; }
    }
    return Object.assign(base, { target: best });
  }

  // ------------------------------------------------------------------ layout
  function fitScope() {
    const wrap = $('#scopeWrap');
    const avail = wrap.clientWidth - 28;
    const lookH = G.look ? $('#lookout').offsetHeight + 12 : 0;
    const vh = window.innerHeight - $('#topbar').offsetHeight - $('#tutor').offsetHeight - lookH - 64;
    const size = Math.floor(clamp(Math.min(avail, Math.max(vh, 340)), 280, 760));
    G.scope.resize(size, Math.min(window.devicePixelRatio || 1, 2));
    $('#ppiBox').style.width = size + 'px'; $('#ppiBox').style.height = size + 'px';
  }

  // ------------------------------------------------------------------ main loop
  let plotAcc = 0;
  let last = performance.now(), slowAcc = 0, trailAcc = 0, guardAcc = 0, lookAcc = 0;
  function frame(now) {
    const dtReal = Math.min((now - last) / 1000, 0.1); last = now;
    const w = G.world, r = G.radar, o = w.own;
    const st = G.chapter ? curStep() : null;
    // Auto time: fast when the sea around is empty, real time near traffic.
    if (G.sim.auto) {
      let busy = false;
      for (const t of w.targets) if (VESSELS.test(t.kind) && dist(o.x, o.y, t.x, t.y) < 2) busy = true;
      for (const rc of w.rain) if (dist(o.x, o.y, rc.x, rc.y) - rc.r < 1) busy = true;
      if (w.dest && dist(o.x, o.y, w.dest.x, w.dest.y) < 1) busy = true;
      if (r.power !== 'tx') busy = true;
      G.sim.scale = busy ? 1 : 8;
    }
    const dt = G.sim.paused ? 0 : dtReal * G.sim.scale;
    // Helm: turn towards the commanded heading at 6° per second.
    if (G.hdgCmd != null && dt > 0) {
      const d = angDiff(G.hdgCmd, o.hdg), stepDeg = 6 * dt;
      o.hdg = Math.abs(d) <= stepDeg ? G.hdgCmd : norm360(o.hdg + Math.sign(d) * stepDeg);
    }
    stepWorld(w, dt);
    if (r.power === 'warming') { r.warmLeft -= dt; if (r.warmLeft <= 0) { r.power = 'standby'; beep(880, 0.15); } }
    if (r.motion === 'TM') {
      const lim = r.range * 0.75;
      if (!r.tmCenter || dist(o.x, o.y, r.tmCenter[0], r.tmCenter[1]) > lim) r.tmCenter = polar(o.x, o.y, o.hdg, r.range * 0.5);
    }
    G.scope.sweep(G, dt);
    trailAcc += dt;
    if (trailAcc >= 2) {
      trailAcc = 0;
      (w.ownHist = w.ownHist || []).push({ t: w.t, x: o.x, y: o.y }); if (w.ownHist.length > 300) w.ownHist.shift();
      for (const t of w.targets) {
        t.hist.push({ t: w.t, x: t.x, y: t.y, ox: o.x, oy: o.y, vis: r.power === 'tx' && G.scope.echoAt(G, t.x, t.y) > 0.18 });
        if (t.hist.length > 200) t.hist.shift();
      }
      for (const m of r.marpa) { const t = w.targets.find(q => q.id === m.id); if (t && G.scope.echoAt(G, t.x, t.y) > 0.15) m.lastSeen = w.t; }
      const lost = r.marpa.filter(m => w.t - m.lastSeen > 40);
      if (lost.length) { r.marpa = r.marpa.filter(m => !lost.includes(m)); toast('MARPA lost a target: its echo disappeared.'); }
    }
    guardAcc += dtReal;
    if (guardAcc > 1) {
      guardAcc = 0;
      if (r.guard.on && r.power === 'tx') {
        const was = r.guard.alarm;
        r.guard.alarm = w.targets.some(t => { const g = relGeom(w, t); return g.r >= r.guard.r0 && g.r <= r.guard.r1 && Math.abs(angDiff(g.brg, o.hdg)) <= r.guard.half && G.scope.echoAt(G, t.x, t.y) > 0.3; });
        if (r.guard.alarm) beep(was ? 1500 : 1700, 0.2, 'square', 0.05);
      }
    }
    if (st) {
      if (st.t === 'mission') { monitor(dt); missionTick(st); }
      else if (st.t === 'do' && !G.st.done) {
        if (st.watch) {
          const on = !st.when || st.when(G);
          if (on) G.st.watched += dt;
          const w = Math.min(G.st.watched, st.watch), left = st.watch - w;
          if (G.st.watchEl) {
            G.st.watchEl.firstChild.firstChild.style.width = (100 * w / st.watch) + '%';
            G.st.watchEl.lastChild.textContent = !on ? st.waitMsg || 'Waiting.'
              : `Watched ${fmtTime(w)} of ${fmtTime(st.watch)} ship's time` + (G.sim.paused ? ' · paused' : G.sim.scale < 4 ? ` · at ×${G.sim.scale} this takes ${fmtTime(left / G.sim.scale)} more; ×8 is faster` : ` · about ${Math.ceil(left / G.sim.scale)} s left at ×${G.sim.scale}`);
          }
          if (G.st.watched >= st.watch && (!st.done || st.done(G))) doneThenNext((typeof st.ok === 'function' ? st.ok(G) : st.ok) || 'Done.');
        } else if (st.done(G)) doneThenNext((typeof st.ok === 'function' ? st.ok(G) : st.ok) || 'Done.');
      }
    }
    G.scope.compose(G);
    G.scope.drawOverlay(G, G);
    slowAcc += dtReal;
    if (slowAcc > 0.1) { slowAcc = 0; for (const f of updaters) f(); refreshCorners(); }
    plotAcc += dtReal; if (plotAcc > 0.5) { plotAcc = 0; drawPlotter(); }
    if (G.look) { lookAcc += dtReal; if (lookAcc > 0.25) { lookAcc = 0; drawLookout($('#lookCanvas'), G, G.look.center, G.look.opts); } }
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------------ dialogs
  function openCatalog() {
    const body = $('#catalogBody'); body.innerHTML = '';
    const groups = {};
    for (const k of CATALOG_ORDER) (groups[CATALOG[k].group] = groups[CATALOG[k].group] || []).push(k);
    for (const [g, ks] of Object.entries(groups)) {
      body.append(h('h3', {}, g));
      body.append(h('div', { cls: 'cards' }, ...ks.map(k => h('article', { cls: 'ccard' },
        h('h4', {}, CATALOG[k].label), h('p', {}, CATALOG[k].looks), h('p', { cls: 'clue' }, h('b', {}, 'Clue: '), CATALOG[k].clue)))));
    }
    $('#catalog').showModal();
  }
  function openSettings() {
    $('#antH').value = settings.antH; $('#soundOn').checked = settings.sound; $('#unlockAll').checked = settings.unlockAll;
    $('#horizonNote').textContent = `With this antenna, a 3 m buoy shows from about ${horizonNm(settings.antH, 3).toFixed(1)} nm and a 30 m ship from about ${horizonNm(settings.antH, 30).toFixed(1)} nm.`;
    $('#settings').showModal();
  }
  function openReadiness() {
    const body = $('#debriefBody');
    body.innerHTML = `<p class="eyebrow">Your progress</p><h2>Readiness card</h2>${readinessHtml()}`;
    const acts = $('#debriefActions'); acts.replaceChildren(h('button', { type: 'button', cls: 'btn ghost', onclick: () => $('#debrief').close() }, 'Close'));
    $('#debrief').showModal();
  }
  let drawerOpen = false;
  function closeDrawer() { drawerOpen = false; document.body.classList.remove('drawer'); }

  // ------------------------------------------------------------------ boot
  function boot() {
    G.scope = new Scope($('#ppi'), $('#ovl'));
    tutor.head = $('#tHead'); tutor.body = $('#tBody'); tutor.actions = $('#tActions');
    const setSel = $('#setSel');
    for (const [id, s] of Object.entries(SETS)) setSel.append(h('button', { type: 'button', cls: 'btn', 'data-set': id, onclick: () => {
      if (G.radar.set === id) return;
      // Chapter 10 makes you try each set; those switches do not change the set you train on elsewhere.
      if (G.chapter?.id !== 'modern') { settings.set = id; saveSettings(); }
      G.setSet(id, { keepPower: true });
      // Chapters with set-specific lessons restart the current part so the steps match the new set.
      if (G.chapter && setAware(G.chapter)) { if (G.phase === 'check') checkIntro(); else startChapter(G.chapter, { lessons: true }); toast(`Lessons switched to the ${s.name}.`); }
    } }, s.name));
    setInterval(() => { setSel.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.set === G.radar.set ? 'true' : 'false')); document.body.dataset.set = G.radar.set; }, 200);
    $('#btnCatalog').onclick = openCatalog;
    $('#btnSettings').onclick = openSettings;
    $('#btnReady').onclick = openReadiness;
    $('#btnLook').onclick = () => { const st = G.chapter && curStep(); if (st && st.t === 'id' && !G.st.answered) { toast('The lookout stays closed until you answer.'); return; } G.look ? closeLookout() : openLookout(G.world.own.hdg, {}); };
    $('#lookClose').onclick = closeLookout;
    $('#btnSound').onclick = () => { settings.sound = !settings.sound; saveSettings(); $('#btnSound').setAttribute('aria-pressed', settings.sound ? 'true' : 'false'); if (settings.sound) beep(880, 0.05); };
    $('#btnSound').setAttribute('aria-pressed', settings.sound ? 'true' : 'false');
    $('#btnDrawer').onclick = () => { drawerOpen = !drawerOpen; document.body.classList.toggle('drawer', drawerOpen); };
    $('#scrim').onclick = closeDrawer;
    $('#settingsForm').addEventListener('submit', e => {
      e.preventDefault();
      settings.antH = clamp(parseFloat($('#antH').value) || 8, 2, 30); settings.sound = $('#soundOn').checked; settings.unlockAll = $('#unlockAll').checked;
      saveSettings(); G.world.own.antH = settings.antH; renderChapters(); $('#settings').close(); toast('Settings saved.');
    });
    $('#antH').addEventListener('input', () => { const v = parseFloat($('#antH').value) || 8; $('#horizonNote').textContent = `With this antenna, a 3 m buoy shows from about ${horizonNm(v, 3).toFixed(1)} nm and a 30 m ship from about ${horizonNm(v, 30).toFixed(1)} nm.`; });
    $('#resetProgress').onclick = () => {
      const b = $('#resetProgress');
      if (b.dataset.armed) { progress.passed = {}; progress.weak = {}; saveProgress(); renderChapters(); b.textContent = 'Progress reset'; delete b.dataset.armed; }
      else { b.dataset.armed = '1'; b.textContent = 'Press again to erase all progress'; }
    };
    document.querySelectorAll('dialog [data-close]').forEach(b => { b.onclick = () => b.closest('dialog').close(); });
    document.addEventListener('keydown', e => {
      if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) || document.querySelector('dialog[open]')) return;
      if (document.activeElement.classList.contains('knob')) return;
      const k = e.key;
      if (k === '+' || k === '=') A.range(1); else if (k === '-' || k === '_') A.range(-1);
      else if (k === 't' || k === 'T') A.tx(); else if (k === 'm' || k === 'M') A.mode();
      else if (k === ' ') { e.preventDefault(); G.sim.paused = !G.sim.paused; }
      else if (k === 'ArrowLeft') { e.preventDefault(); A.helm(e.shiftKey ? -10 : -1); }
      else if (k === 'ArrowRight') { e.preventDefault(); A.helm(e.shiftKey ? 10 : 1); }
      else if (k === 'ArrowUp') { e.preventDefault(); A.speed(1); } else if (k === 'ArrowDown') { e.preventDefault(); A.speed(-1); }
    });
    setupScopeInput();
    window.addEventListener('resize', fitScope);
    new ResizeObserver(fitScope).observe($('#scopeWrap'));
    // The radar set you picked last survives a reload.
    if (SETS[settings.set] && settings.set !== G.radar.set) {
      G.radar.set = settings.set;
      if (SETS[settings.set].autoModes) { G.radar.gainAuto = true; G.radar.seaAuto = true; }
    }
    const lastId = store.get('last', null);
    const firstOpen = CHAPTERS.find(c => !progress.passed[c.id] && chapterUnlocked(c)) || CHAPTERS[0];
    const ch = CHAPTERS.find(c => c.id === lastId && chapterUnlocked(c)) || firstOpen;
    fitScope();
    startChapter(ch);
    fitScope();
    requestAnimationFrame(frame);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
