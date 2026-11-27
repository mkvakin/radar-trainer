// The lookout: what you would see from the cockpit, looking along one bearing.

const KIND_NAMES = {
  ship: 'Cargo ship', fishing: 'Fishing boat', ferry: 'Ferry', yacht_refl: 'Yacht with radar reflector', yacht: 'Yacht, no reflector',
  kayak: 'Kayak', buoy: 'Navigation buoy', buoy_refl: 'Buoy with radar reflector', racon: 'Racon buoy', lighthouse: 'Lighthouse',
  anchored: 'Anchored ship', sart: 'Life raft with SART',
};

function drawLookout(canvas, g, center, opts = {}) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (!W || !H) return;
  if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = g.world, o = w.own;
  const night = !opts.forceDay && w.light === 'night';
  const fog = !opts.forceDay && w.fogNm ? w.fogNm : null;
  const FOV = 70, dpp = FOV / W, hz = H * 0.6, VX = 4;
  const xOf = b => (angDiff(b, center) / FOV + 0.5) * W;

  // Sky and sea.
  let gr = ctx.createLinearGradient(0, 0, 0, hz);
  if (night) { gr.addColorStop(0, '#04070D'); gr.addColorStop(1, '#0C1522'); }
  else { gr.addColorStop(0, '#8FB4CF'); gr.addColorStop(1, '#DCE7EC'); }
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, hz);
  gr = ctx.createLinearGradient(0, hz, 0, H);
  if (night) { gr.addColorStop(0, '#0A1520'); gr.addColorStop(1, '#03070B'); }
  else { gr.addColorStop(0, '#5E8294'); gr.addColorStop(1, '#2A4656'); }
  ctx.fillStyle = gr; ctx.fillRect(0, hz, W, H - hz);
  if (!night) { ctx.strokeStyle = 'rgba(255,255,255,0.12)'; for (let i = 0; i < 26; i++) { const y = hz + 4 + i * i * 0.18 * (H - hz) / 120; const x = (i * 97) % W; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 18 + i, y); ctx.stroke(); } }
  if (night && !fog) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; for (let i = 0; i < 40; i++) ctx.fillRect(hash2(i, 3) * W, hash2(i, 5) * hz * 0.85, 1, 1); }

  const visNm = fog ? fog : night ? 6 : 12;
  // Land silhouette.
  if (!night || true) {
    ctx.fillStyle = night ? '#060A10' : '#5C6B5C';
    ctx.beginPath(); ctx.moveTo(0, hz);
    let any = false;
    for (let x = 0; x <= W; x += 3) {
      const b = center + (x / W - 0.5) * FOV;
      const hit = firstLand(w, o.x, o.y, b, 16);
      let y = hz;
      if (hit && hit.r < Math.max(visNm, night ? 16 : 0) && !(fog && hit.r > fog)) {
        const tex = 0.75 + 0.5 * hash2(Math.round(b * 2), 11);
        const e = Math.atan(hit.L.h * tex / (Math.max(hit.r, 0.05) * 1852)) / D2R;
        y = hz - Math.min(hz * 0.9, e / dpp * VX); any = true;
      }
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, hz); ctx.closePath(); if (any) ctx.fill();
  }
  // Rain curtains.
  for (const rc of w.rain) {
    const d = dist(o.x, o.y, rc.x, rc.y); if (d > 14) continue;
    const b = bearingTo(o.x, o.y, rc.x, rc.y), half = Math.atan2(rc.r, Math.max(d, 0.01)) / D2R;
    if (Math.abs(angDiff(b, center)) > FOV / 2 + half) continue;
    const x0 = xOf(b - half), x1 = xOf(b + half);
    ctx.fillStyle = night ? 'rgba(40,50,60,0.55)' : 'rgba(90,100,110,0.55)';
    ctx.fillRect(x0, 0, x1 - x0, hz + 6);
    ctx.strokeStyle = 'rgba(200,210,220,0.25)';
    for (let x = x0; x < x1; x += 5) { ctx.beginPath(); ctx.moveTo(x, hz * 0.2); ctx.lineTo(x - 6, hz); ctx.stroke(); }
  }
  // Objects, far to near.
  const list = w.targets.map(t => ({ t, r: dist(o.x, o.y, t.x, t.y), b: bearingTo(o.x, o.y, t.x, t.y) }))
    .filter(q => Math.abs(angDiff(q.b, center)) < FOV / 2 + 2 && q.r < 15)
    .sort((a, b) => b.r - a.r);
  for (const q of list) {
    const lightOnly = night;
    if (!lightOnly && q.r > visNm) continue;
    if (lightOnly && q.r > (fog ? fog : 7)) continue;
    const x = xOf(q.b);
    const hPx = Math.max(q.t.kind === 'kayak' ? 4 : 7, Math.min(hz * 0.8, Math.atan(q.t.h / (q.r * 1852)) / D2R / dpp * VX));
    const aspect = angDiff(bearingTo(q.t.x, q.t.y, o.x, o.y), q.t.cog);
    if (lightOnly) drawLights(ctx, q.t, x, hz, hPx, aspect, w.t);
    else drawShape(ctx, q.t, x, hz, hPx, aspect);
    if (opts.labels) {
      const name = q.t.name ? `${KIND_NAMES[q.t.kind]} · ${q.t.name}` : KIND_NAMES[q.t.kind];
      ctx.font = '600 11px "Atkinson Hyperlegible", sans-serif'; ctx.textAlign = 'center';
      const tw = ctx.measureText(name).width + 10, focus = opts.focus && opts.focus === q.t.id;
      ctx.fillStyle = focus ? 'rgba(210,168,91,0.95)' : 'rgba(10,16,20,0.72)';
      ctx.fillRect(x - tw / 2, hz + 10, tw, 17);
      ctx.fillStyle = focus ? '#14100A' : '#EEF2F3'; ctx.fillText(name, x, hz + 22);
      ctx.fillStyle = night ? '#EEF2F3' : '#14202A'; ctx.font = '500 10px "Chakra Petch", monospace';
      ctx.fillText(q.r.toFixed(2) + ' nm', x, hz + 38);
    }
  }
  if (fog) {
    ctx.fillStyle = night ? 'rgba(20,26,32,0.82)' : 'rgba(205,212,216,0.86)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = night ? '#9AA7B0' : '#55636C'; ctx.font = '600 13px "Chakra Petch", monospace'; ctx.textAlign = 'center';
    ctx.fillText(`Fog · visibility about ${Math.round(fog * 1852)} m`, W / 2, H / 2);
  }
  // Bearing scale.
  ctx.fillStyle = night ? '#9AB' : '#203040'; ctx.font = '600 10px "Chakra Petch", monospace'; ctx.textAlign = 'center';
  for (let d = Math.ceil((center - FOV / 2) / 10) * 10; d <= center + FOV / 2; d += 10) {
    const x = xOf(d); ctx.fillRect(x, 0, 1, 5); ctx.fillText(String(norm360(d)).padStart(3, '0') + '°', x, 15);
  }
  ctx.fillStyle = night ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'; ctx.fillRect(W / 2 - 0.5, 18, 1, 8);
}

function drawShape(ctx, t, x, hz, h, aspect) {
  const side = Math.abs(Math.sin(aspect * D2R)); // 1 = beam on, 0 = bow/stern on
  const k = t.kind;
  ctx.save(); ctx.translate(x, hz);
  if (k === 'ship' || k === 'anchored' || k === 'ferry') {
    const L = h * (k === 'ferry' ? 3.2 : 4.4) * (0.3 + 0.7 * side);
    ctx.fillStyle = k === 'ferry' ? '#F2F2EE' : '#2B3640';
    ctx.beginPath(); ctx.moveTo(-L / 2, -h * 0.35); ctx.lineTo(L / 2, -h * 0.35); ctx.lineTo(L / 2 - h * 0.15, 0); ctx.lineTo(-L / 2 + h * 0.1, 0); ctx.closePath(); ctx.fill();
    if (k === 'ferry') { ctx.fillStyle = '#E6E8E4'; ctx.fillRect(-L * 0.4, -h * 0.75, L * 0.8, h * 0.4); ctx.fillStyle = '#3A5160'; for (let i = -L * 0.36; i < L * 0.38; i += Math.max(3, h * 0.25)) ctx.fillRect(i, -h * 0.62, Math.max(1.5, h * 0.12), Math.max(1.5, h * 0.12)); ctx.fillStyle = '#B03A2E'; ctx.fillRect(-L * 0.06, -h, L * 0.12, h * 0.28); }
    else {
      const cols = ['#B5543C', '#2F6E8F', '#C9A13B', '#5F7E4E'];
      for (let i = 0; i < 6; i++) { ctx.fillStyle = cols[i % 4]; ctx.fillRect(-L / 2 + L * 0.12 + i * L * 0.1, -h * 0.6, L * 0.09, h * 0.25); }
      ctx.fillStyle = '#E8E6DF'; ctx.fillRect(L * 0.3, -h, L * 0.12, h * 0.65);
    }
  } else if (k === 'fishing') {
    ctx.fillStyle = '#3D5A6C'; ctx.beginPath(); ctx.moveTo(-h * 0.9, -h * 0.25); ctx.lineTo(h * 0.9, -h * 0.35); ctx.lineTo(h * 0.7, 0); ctx.lineTo(-h * 0.8, 0); ctx.fill();
    ctx.fillStyle = '#E9E4D6'; ctx.fillRect(-h * 0.1, -h * 0.65, h * 0.45, h * 0.35);
    ctx.strokeStyle = '#222'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-h * 0.5, -h * 0.25); ctx.lineTo(-h * 0.5, -h); ctx.lineTo(-h * 0.9, -h * 0.25); ctx.stroke();
  } else if (k === 'yacht' || k === 'yacht_refl') {
    ctx.fillStyle = '#EDEDE8'; ctx.beginPath(); ctx.moveTo(-h * 0.35, -h * 0.08); ctx.lineTo(h * 0.35, -h * 0.08); ctx.lineTo(h * 0.25, 0); ctx.lineTo(-h * 0.25, 0); ctx.fill();
    ctx.fillStyle = '#F7F7F2'; ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(0, -h * 0.1); ctx.lineTo(-h * 0.32, -h * 0.12); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -h * 0.92); ctx.lineTo(h * 0.3, -h * 0.12); ctx.lineTo(0, -h * 0.12); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#555'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(0, -h * 0.08); ctx.stroke();
    if (k === 'yacht_refl') { ctx.fillStyle = '#9AA'; ctx.beginPath(); ctx.moveTo(0, -h * 0.82); ctx.lineTo(2.5, -h * 0.75); ctx.lineTo(0, -h * 0.68); ctx.lineTo(-2.5, -h * 0.75); ctx.fill(); }
  } else if (k === 'kayak') {
    ctx.fillStyle = '#E4572E'; ctx.fillRect(-h * 1.2, -h * 0.2, h * 2.4, h * 0.25);
    ctx.fillStyle = '#223'; ctx.fillRect(-1, -h, 2, h * 0.8); ctx.strokeStyle = '#223'; ctx.beginPath(); ctx.moveTo(-h * 0.9, -h * 0.9); ctx.lineTo(h * 0.9, -h * 0.3); ctx.stroke();
  } else if (k === 'buoy' || k === 'buoy_refl' || k === 'racon') {
    const col = t.color || (k === 'racon' ? '#D9B23A' : '#C23B2E');
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-h * 0.3, 0); ctx.lineTo(h * 0.3, 0); ctx.lineTo(h * 0.12, -h * 0.7); ctx.lineTo(-h * 0.12, -h * 0.7); ctx.fill();
    ctx.fillStyle = '#333'; ctx.fillRect(-0.8, -h, 1.6, h * 0.3);
    if (k === 'buoy_refl' || k === 'racon') { ctx.fillStyle = '#AEB6B8'; ctx.beginPath(); ctx.moveTo(0, -h * 1.15); ctx.lineTo(h * 0.15, -h); ctx.lineTo(0, -h * 0.85); ctx.lineTo(-h * 0.15, -h); ctx.fill(); }
    if (k === 'racon') { ctx.fillStyle = '#222'; ctx.fillRect(-h * 0.08, -h * 1.35, h * 0.16, h * 0.2); }
  } else if (k === 'lighthouse') {
    ctx.fillStyle = '#F4F1E8'; ctx.beginPath(); ctx.moveTo(-h * 0.1, 0); ctx.lineTo(h * 0.1, 0); ctx.lineTo(h * 0.06, -h); ctx.lineTo(-h * 0.06, -h); ctx.fill();
    ctx.fillStyle = '#B03A2E'; ctx.fillRect(-h * 0.08, -h * 1.12, h * 0.16, h * 0.14);
  } else if (k === 'sart') {
    ctx.fillStyle = '#F26B1D'; ctx.beginPath(); ctx.ellipse(0, -h * 0.25, h * 0.9, h * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -h * 0.45, h * 0.5, Math.PI, 0); ctx.fill();
  }
  ctx.restore();
}

function drawLights(ctx, t, x, hz, h, aspect, now) {
  const dot = (dx, dy, c, r = 2) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + dx, hz + dy, r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(x + dx, hz + dy, r * 3, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; };
  const k = t.kind, a = Math.abs(aspect);
  const side = a < 6 ? 'both' : a < 112.5 ? (aspect > 0 ? 'green' : 'red') : 'stern';
  const sideLights = () => {
    if (side === 'both') { dot(-2, -h * 0.3, '#3CFF7A'); dot(2, -h * 0.3, '#FF4A3D'); }
    else if (side === 'green') dot(0, -h * 0.3, '#3CFF7A');
    else if (side === 'red') dot(0, -h * 0.3, '#FF4A3D');
    else dot(0, -h * 0.2, '#FFFFFF');
  };
  if (k === 'ship' || k === 'ferry') { if (side !== 'stern') { dot(-h * 0.6 * Math.abs(Math.sin(aspect * D2R)), -h * 0.8, '#FFF'); dot(h * 0.6 * Math.abs(Math.sin(aspect * D2R)), -h, '#FFF'); } sideLights(); }
  else if (k === 'anchored') { dot(-h, -h * 0.7, '#FFF'); dot(h, -h * 0.5, '#FFF'); }
  else if (k === 'fishing') { dot(0, -h, '#FF4A3D'); dot(0, -h * 0.75, '#FFFFFF'); sideLights(); }
  else if (k === 'yacht' || k === 'yacht_refl') { dot(0, -h, side === 'stern' ? '#FFF' : side === 'red' ? '#FF4A3D' : side === 'green' ? '#3CFF7A' : '#FFD37A', 1.6); }
  else if (k === 'buoy' || k === 'buoy_refl' || k === 'racon') { if (Math.floor(now / 2) % 2 === 0) dot(0, -h, t.color === '#2E8B57' ? '#3CFF7A' : k === 'racon' ? '#FFF' : '#FF4A3D', 1.8); }
  else if (k === 'lighthouse') { if (Math.floor(now / 5) % 2 === 0) dot(0, -h, '#FFF6D0', 3); }
  else if (k === 'sart') { if (Math.floor(now) % 2 === 0) dot(0, -h * 0.5, '#FFF', 2.2); }
}
