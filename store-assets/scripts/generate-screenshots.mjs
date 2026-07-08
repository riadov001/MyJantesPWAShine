import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const RED = '#dc2626';
const RED_DARK = '#b91c1c';
const BG = '#0f0f0f';
const SURFACE = '#1c1c1e';
const SURFACE2 = '#2c2c2e';
const TEXT = '#f5f5f5';
const TEXT2 = '#a1a1aa';
const GREEN = '#22c55e';
const AMBER = '#f59e0b';
const BLUE = '#3b82f6';

function statusBarIOS(w) {
  return `
  <rect x="0" y="0" width="${w}" height="54" fill="${SURFACE}"/>
  <text x="${w/2}" y="22" font-family="SF Pro Display,Helvetica,Arial,sans-serif" font-size="17" fill="${TEXT}" text-anchor="middle" font-weight="600">9:41</text>
  <rect x="${w/2 - 60}" y="8" width="120" height="30" rx="15" fill="#000"/>
  <text x="${w - 24}" y="36" font-family="SF Pro Display,Helvetica,Arial,sans-serif" font-size="13" fill="${TEXT}" text-anchor="end">100%</text>
  <text x="${w - 60}" y="36" font-family="SF Pro Display,Helvetica,Arial,sans-serif" font-size="13" fill="${TEXT}" text-anchor="end">●●●</text>`;
}

function statusBarAndroid(w) {
  return `
  <rect x="0" y="0" width="${w}" height="48" fill="${SURFACE}"/>
  <text x="20" y="32" font-family="Roboto,Arial,sans-serif" font-size="18" fill="${TEXT}" font-weight="500">9:41</text>
  <text x="${w - 24}" y="32" font-family="Roboto,Arial,sans-serif" font-size="16" fill="${TEXT}" text-anchor="end">▲ ◉ 🔋</text>`;
}

function tabBarIOS(w, h, active) {
  const tabs = [
    { id: 'home', icon: '⌂', label: 'Accueil' },
    { id: 'devis', icon: '📋', label: 'Devis' },
    { id: 'reservation', icon: '📅', label: 'RDV' },
    { id: 'factures', icon: '🧾', label: 'Factures' },
    { id: 'profil', icon: '👤', label: 'Profil' },
  ];
  const tw = w / tabs.length;
  const tabH = 88;
  let svg = `<rect x="0" y="${h - tabH}" width="${w}" height="${tabH}" fill="${SURFACE}"/>
  <line x1="0" y1="${h - tabH}" x2="${w}" y2="${h - tabH}" stroke="#333" stroke-width="1"/>`;
  tabs.forEach((tab, i) => {
    const cx = tw * i + tw / 2;
    const isActive = tab.id === active;
    const col = isActive ? RED : TEXT2;
    svg += `
    <text x="${cx}" y="${h - tabH + 36}" font-family="SF Pro Display,Helvetica,Arial,sans-serif" font-size="22" fill="${col}" text-anchor="middle">${tab.icon}</text>
    <text x="${cx}" y="${h - tabH + 58}" font-family="SF Pro Display,Helvetica,Arial,sans-serif" font-size="18" fill="${col}" text-anchor="middle">${tab.label}</text>`;
  });
  return svg;
}

function navBarAndroid(w, h, active) {
  const tabs = [
    { id: 'home', icon: '⌂', label: 'Accueil' },
    { id: 'devis', icon: '📋', label: 'Devis' },
    { id: 'reservation', icon: '📅', label: 'RDV' },
    { id: 'factures', icon: '🧾', label: 'Factures' },
    { id: 'profil', icon: '👤', label: 'Profil' },
  ];
  const tw = w / tabs.length;
  const tabH = 80;
  let svg = `<rect x="0" y="${h - tabH}" width="${w}" height="${tabH}" fill="${SURFACE}"/>
  <line x1="0" y1="${h - tabH}" x2="${w}" y2="${h - tabH}" stroke="#333" stroke-width="1"/>`;
  tabs.forEach((tab, i) => {
    const cx = tw * i + tw / 2;
    const isActive = tab.id === active;
    const col = isActive ? RED : TEXT2;
    svg += `
    <text x="${cx}" y="${h - tabH + 30}" font-family="Roboto,Arial,sans-serif" font-size="20" fill="${col}" text-anchor="middle">${tab.icon}</text>
    <text x="${cx}" y="${h - tabH + 54}" font-family="Roboto,Arial,sans-serif" font-size="16" fill="${col}" text-anchor="middle">${tab.label}</text>`;
  });
  return svg;
}

function header(w, statusH, title, font = 'SF Pro Display,Helvetica,Arial,sans-serif') {
  return `
  <rect x="0" y="${statusH}" width="${w}" height="72" fill="${SURFACE}"/>
  <text x="28" y="${statusH + 48}" font-family="${font}" font-size="28" fill="${TEXT}" font-weight="700">${title}</text>
  <line x1="0" y1="${statusH + 72}" x2="${w}" y2="${statusH + 72}" stroke="#333" stroke-width="1"/>`;
}

function card(x, y, w, h, radius = 16) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${SURFACE2}"/>`;
}

function badge(x, y, label, color) {
  const badgeW = label.length * 14 + 20;
  return `
  <rect x="${x}" y="${y}" width="${badgeW}" height="32" rx="16" fill="${color}22"/>
  <text x="${x + badgeW/2}" y="${y + 21}" font-family="SF Pro Display,Helvetica,Arial,sans-serif" font-size="17" fill="${color}" text-anchor="middle" font-weight="600">${label}</text>`;
}

// ── SCREEN GENERATORS ─────────────────────────────────────────────────────────

function screenHome(w, h, isTablet, platform) {
  const statusH = platform === 'android' ? 48 : 54;
  const tabH = 88;
  const font = platform === 'android' ? 'Roboto,Arial,sans-serif' : 'SF Pro Display,Helvetica,Arial,sans-serif';
  const contentTop = statusH + 72;
  const contentBot = h - tabH;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="${BG}"/>
  ${platform === 'android' ? statusBarAndroid(w) : statusBarIOS(w)}
  ${header(w, statusH, 'MyJantes', font)}`;

  // Welcome card
  const cw = w - 48;
  svg += card(24, contentTop + 20, cw, isTablet ? 200 : 160);
  svg += `<rect x="24" y="${contentTop + 20}" width="${cw}" height="${isTablet ? 200 : 160}" rx="16" fill="${RED}22"/>
  <text x="52" y="${contentTop + 72}" font-family="${font}" font-size="20" fill="${TEXT2}">Bonjour,</text>
  <text x="52" y="${contentTop + 108}" font-family="${font}" font-size="28" fill="${TEXT}" font-weight="700">Mohamed</text>
  <text x="52" y="${contentTop + 140}" font-family="${font}" font-size="18" fill="${TEXT2}">2 devis en attente · 1 RDV prévu</text>`;

  // Quick action buttons
  const btnY = contentTop + (isTablet ? 240 : 200);
  const btnW = (cw - 16) / 2;
  svg += card(24, btnY, btnW, 90);
  svg += `<text x="${24 + btnW/2}" y="${btnY + 38}" font-family="${font}" font-size="22" fill="${RED}" text-anchor="middle">📋</text>
  <text x="${24 + btnW/2}" y="${btnY + 68}" font-family="${font}" font-size="18" fill="${TEXT}" text-anchor="middle">Demander un devis</text>`;

  svg += card(24 + btnW + 16, btnY, btnW, 90);
  svg += `<text x="${24 + btnW + 16 + btnW/2}" y="${btnY + 38}" font-family="${font}" font-size="22" fill="${RED}" text-anchor="middle">📅</text>
  <text x="${24 + btnW + 16 + btnW/2}" y="${btnY + 68}" font-family="${font}" font-size="18" fill="${TEXT}" text-anchor="middle">Mes rendez-vous</text>`;

  // Recent activity
  const actY = btnY + 110;
  svg += `<text x="28" y="${actY + 28}" font-family="${font}" font-size="20" fill="${TEXT}" font-weight="600">Activité récente</text>`;
  
  const activities = [
    { icon: '📋', label: 'Devis #2024-018', sub: 'En attente de validation', date: 'Aujourd\'hui', col: AMBER },
    { icon: '✅', label: 'Devis #2024-017', sub: 'Accepté · 320 €', date: 'Hier', col: GREEN },
    { icon: '📅', label: 'RDV confirmé', sub: 'Mardi 14 mai · 09h00', date: 'Dans 8 jours', col: BLUE },
  ];
  activities.forEach((a, i) => {
    const ay = actY + 50 + i * 90;
    if (ay + 80 < contentBot) {
      svg += card(24, ay, cw, 78);
      svg += `<text x="60" y="${ay + 32}" font-family="${font}" font-size="22" fill="${a.col}" text-anchor="middle">${a.icon}</text>
      <text x="90" y="${ay + 28}" font-family="${font}" font-size="18" fill="${TEXT}" font-weight="600">${a.label}</text>
      <text x="90" y="${ay + 52}" font-family="${font}" font-size="16" fill="${TEXT2}">${a.sub}</text>
      <text x="${cw + 8}" y="${ay + 28}" font-family="${font}" font-size="14" fill="${TEXT2}" text-anchor="end">${a.date}</text>`;
    }
  });

  svg += platform === 'android' ? navBarAndroid(w, h, 'home') : tabBarIOS(w, h, 'home');
  svg += '</svg>';
  return svg;
}

function screenDevis(w, h, isTablet, platform) {
  const statusH = platform === 'android' ? 48 : 54;
  const tabH = 88;
  const font = platform === 'android' ? 'Roboto,Arial,sans-serif' : 'SF Pro Display,Helvetica,Arial,sans-serif';
  const contentTop = statusH + 72;
  const contentBot = h - tabH;
  const cw = w - 48;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="${BG}"/>
  ${platform === 'android' ? statusBarAndroid(w) : statusBarIOS(w)}
  ${header(w, statusH, 'Mes Devis', font)}`;

  const quotes = [
    { num: '2024-018', vehicle: 'Renault Clio IV', service: 'Réparation + Peinture × 4', price: '320 €', status: 'En attente', statusCol: AMBER, date: '06/05/2026' },
    { num: '2024-017', vehicle: 'Peugeot 308 SW', service: 'Rénovation jantes × 4', price: '280 €', status: 'Accepté', statusCol: GREEN, date: '02/05/2026' },
    { num: '2024-016', vehicle: 'BMW Série 3', service: 'Débosselage + Laquage × 2', price: '195 €', status: 'Terminé', statusCol: BLUE, date: '28/04/2026' },
    { num: '2024-015', vehicle: 'Mercedes GLA', service: 'Réparation jantes × 1', price: '95 €', status: 'Refusé', statusCol: '#ef4444', date: '20/04/2026' },
  ];

  quotes.forEach((q, i) => {
    const qy = contentTop + 20 + i * 140;
    if (qy + 130 < contentBot) {
      svg += card(24, qy, cw, 120);
      svg += `<text x="52" y="${qy + 32}" font-family="${font}" font-size="17" fill="${TEXT2}">Devis n° ${q.num} · ${q.date}</text>
      <text x="52" y="${qy + 58}" font-family="${font}" font-size="20" fill="${TEXT}" font-weight="700">${q.vehicle}</text>
      <text x="52" y="${qy + 82}" font-family="${font}" font-size="17" fill="${TEXT2}">${q.service}</text>
      <text x="${cw + 8}" y="${qy + 58}" font-family="${font}" font-size="22" fill="${RED}" text-anchor="end" font-weight="700">${q.price}</text>`;
      svg += badge(52, qy + 90, q.status, q.statusCol);
    }
  });

  // FAB
  svg += `<circle cx="${w - 56}" cy="${contentBot - 56}" r="36" fill="${RED}"/>
  <text x="${w - 56}" y="${contentBot - 46}" font-family="${font}" font-size="28" fill="#fff" text-anchor="middle" font-weight="700">+</text>`;

  svg += platform === 'android' ? navBarAndroid(w, h, 'devis') : tabBarIOS(w, h, 'devis');
  svg += '</svg>';
  return svg;
}

function screenConfigurateur(w, h, isTablet, platform) {
  const statusH = platform === 'android' ? 48 : 54;
  const tabH = 88;
  const font = platform === 'android' ? 'Roboto,Arial,sans-serif' : 'SF Pro Display,Helvetica,Arial,sans-serif';
  const contentTop = statusH + 72;
  const cw = w - 48;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="${BG}"/>
  ${platform === 'android' ? statusBarAndroid(w) : statusBarIOS(w)}
  ${header(w, statusH, 'Configurateur', font)}`;

  // Wheel preview area
  const previewH = Math.min(h * 0.35, 380);
  svg += `<rect x="0" y="${contentTop}" width="${w}" height="${previewH}" fill="${SURFACE}"/>`;
  // Draw simplified wheel graphic
  const cx = w / 2, cy = contentTop + previewH / 2;
  const r = Math.min(previewH / 2 - 30, 140);
  svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${SURFACE2}" stroke="${RED}" stroke-width="6"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 0.3}" fill="${SURFACE}" stroke="${RED}" stroke-width="4"/>`;
  // Spokes
  for (let a = 0; a < 5; a++) {
    const angle = (a * 72 - 90) * Math.PI / 180;
    const x1 = cx + Math.cos(angle) * r * 0.3;
    const y1 = cy + Math.sin(angle) * r * 0.3;
    const x2 = cx + Math.cos(angle) * r * 0.92;
    const y2 = cy + Math.sin(angle) * r * 0.92;
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${RED}" stroke-width="14" stroke-linecap="round"/>`;
  }

  // Config panels
  let panelY = contentTop + previewH + 20;

  // Color selector
  svg += card(24, panelY, cw, 90);
  svg += `<text x="44" y="${panelY + 30}" font-family="${font}" font-size="18" fill="${TEXT2}">Couleur</text>`;
  const colors = ['#dc2626', '#1e3a8a', '#166534', '#1c1917', '#f5f5f5', '#d97706'];
  colors.forEach((col, i) => {
    const swx = 44 + i * 56;
    const swy = panelY + 46;
    svg += `<circle cx="${swx}" cy="${swy}" r="20" fill="${col}"/>`;
    if (i === 0) svg += `<circle cx="${swx}" cy="${swy}" r="24" fill="none" stroke="${TEXT}" stroke-width="3"/>`;
  });
  panelY += 110;

  // Finish selector
  svg += card(24, panelY, cw, 80);
  svg += `<text x="44" y="${panelY + 30}" font-family="${font}" font-size="18" fill="${TEXT2}">Finition</text>`;
  const finishes = ['Brillant', 'Mat', 'Satiné', 'Chromé'];
  finishes.forEach((f, i) => {
    const fw = 130;
    const fx = 44 + i * (fw + 10);
    if (fx + fw < w - 24) {
      const isActive = i === 0;
      svg += `<rect x="${fx}" y="${panelY + 40}" width="${fw}" height="30" rx="15" fill="${isActive ? RED : SURFACE}"/>
      <text x="${fx + fw/2}" y="${panelY + 60}" font-family="${font}" font-size="16" fill="${isActive ? '#fff' : TEXT2}" text-anchor="middle">${f}</text>`;
    }
  });
  panelY += 100;

  // Price + CTA
  if (panelY + 80 < h - tabH) {
    svg += `<text x="28" y="${panelY + 36}" font-family="${font}" font-size="20" fill="${TEXT2}">Estimation :</text>
    <text x="${w/2}" y="${panelY + 36}" font-family="${font}" font-size="28" fill="${RED}" font-weight="700">280 €</text>`;
    panelY += 60;
    svg += `<rect x="24" y="${panelY}" width="${cw}" height="64" rx="16" fill="${RED}"/>
    <text x="${24 + cw/2}" y="${panelY + 40}" font-family="${font}" font-size="20" fill="#fff" text-anchor="middle" font-weight="700">Demander un devis</text>`;
  }

  svg += platform === 'android' ? navBarAndroid(w, h, 'configurateur') : tabBarIOS(w, h, 'configurateur');
  svg += '</svg>';
  return svg;
}

function screenAR(w, h, isTablet, platform) {
  const statusH = platform === 'android' ? 48 : 54;
  const tabH = 88;
  const font = platform === 'android' ? 'Roboto,Arial,sans-serif' : 'SF Pro Display,Helvetica,Arial,sans-serif';

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="#1a1a2e"/>`;

  // AR viewfinder - car silhouette scene
  const viewH = h * 0.72;
  svg += `<rect x="0" y="0" width="${w}" height="${viewH}" fill="#0d1117"/>`;
  // Road/ground
  svg += `<ellipse cx="${w/2}" cy="${viewH * 0.85}" rx="${w * 0.7}" ry="${viewH * 0.1}" fill="#1e293b"/>`;
  // Car body silhouette
  const carY = viewH * 0.42;
  const carH = viewH * 0.32;
  const carW = w * 0.82;
  const carX = (w - carW) / 2;
  svg += `<rect x="${carX}" y="${carY + carH * 0.3}" width="${carW}" height="${carH * 0.7}" rx="20" fill="#334155"/>
  <rect x="${carX + carW * 0.15}" y="${carY}" width="${carW * 0.7}" height="${carH * 0.5}" rx="16" fill="#475569"/>`;
  // Windshields
  svg += `<rect x="${carX + carW * 0.18}" y="${carY + 8}" width="${carW * 0.28}" height="${carH * 0.4}" rx="8" fill="#0ea5e9" opacity="0.5"/>
  <rect x="${carX + carW * 0.52}" y="${carY + 8}" width="${carW * 0.28}" height="${carH * 0.4}" rx="8" fill="#0ea5e9" opacity="0.5"/>`;
  // AR wheel overlays (glowing red)
  const wheelR = Math.min(carH * 0.45, 80);
  const wheelY = carY + carH * 0.8;
  const wheel1X = carX + carW * 0.2;
  const wheel2X = carX + carW * 0.78;
  [wheel1X, wheel2X].forEach(wx => {
    svg += `<circle cx="${wx}" cy="${wheelY}" r="${wheelR + 8}" fill="${RED}33"/>
    <circle cx="${wx}" cy="${wheelY}" r="${wheelR}" fill="${SURFACE2}" stroke="${RED}" stroke-width="5"/>
    <circle cx="${wx}" cy="${wheelY}" r="${wheelR * 0.3}" fill="${BG}" stroke="${RED}" stroke-width="3"/>`;
    for (let a = 0; a < 5; a++) {
      const angle = (a * 72 - 90) * Math.PI / 180;
      const x1 = wx + Math.cos(angle) * wheelR * 0.3;
      const y1 = wheelY + Math.sin(angle) * wheelR * 0.3;
      const x2 = wx + Math.cos(angle) * wheelR * 0.9;
      const y2 = wheelY + Math.sin(angle) * wheelR * 0.9;
      svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${RED}" stroke-width="8" stroke-linecap="round"/>`;
    }
    // Glow effect label
    svg += `<rect x="${wx - 48}" y="${wheelY - wheelR - 40}" width="96" height="30" rx="15" fill="${RED}cc"/>
    <text x="${wx}" y="${wheelY - wheelR - 19}" font-family="${font}" font-size="16" fill="#fff" text-anchor="middle" font-weight="600">AR Actif</text>`;
  });

  // AR crosshair
  svg += `<circle cx="${w/2}" cy="${viewH/2}" r="40" fill="none" stroke="${RED}" stroke-width="2" stroke-dasharray="8,6"/>
  <line x1="${w/2 - 50}" y1="${viewH/2}" x2="${w/2 + 50}" y2="${viewH/2}" stroke="${RED}" stroke-width="1.5"/>
  <line x1="${w/2}" y1="${viewH/2 - 50}" x2="${w/2}" y2="${viewH/2 + 50}" stroke="${RED}" stroke-width="1.5"/>`;

  // Status bar over AR
  svg += platform === 'android' ? statusBarAndroid(w) : statusBarIOS(w);
  const statusH2 = platform === 'android' ? 48 : 54;
  svg += `<rect x="0" y="${statusH2}" width="${w}" height="60" fill="#00000088"/>
  <text x="${w/2}" y="${statusH2 + 40}" font-family="${font}" font-size="22" fill="#fff" text-anchor="middle" font-weight="700">Essai Virtuel AR</text>`;

  // Bottom controls
  const ctrlY = viewH;
  svg += `<rect x="0" y="${ctrlY}" width="${w}" height="${h - ctrlY}" fill="${SURFACE}"/>`;
  // Color swatches
  const colors = ['#dc2626', '#1e3a8a', '#166534', '#1c1917', '#f5f5f5'];
  colors.forEach((col, i) => {
    const swx = w/2 - (colors.length - 1) * 36 + i * 72;
    svg += `<circle cx="${swx}" cy="${ctrlY + 44}" r="24" fill="${col}"/>`;
    if (i === 0) svg += `<circle cx="${swx}" cy="${ctrlY + 44}" r="28" fill="none" stroke="${TEXT}" stroke-width="3"/>`;
  });
  // Capture button
  svg += `<circle cx="${w/2}" cy="${ctrlY + 110}" r="36" fill="${RED}"/>
  <circle cx="${w/2}" cy="${ctrlY + 110}" r="44" fill="none" stroke="${RED}" stroke-width="3"/>
  <text x="${w/2}" y="${ctrlY + 118}" font-family="${font}" font-size="18" fill="#fff" text-anchor="middle">📸</text>`;
  svg += `<text x="60" y="${ctrlY + 118}" font-family="${font}" font-size="16" fill="${TEXT2}" text-anchor="middle">⟵</text>
  <text x="${w-60}" y="${ctrlY + 118}" font-family="${font}" font-size="16" fill="${TEXT2}" text-anchor="middle">Partager</text>`;

  svg += '</svg>';
  return svg;
}

function screenReservation(w, h, isTablet, platform) {
  const statusH = platform === 'android' ? 48 : 54;
  const tabH = 88;
  const font = platform === 'android' ? 'Roboto,Arial,sans-serif' : 'SF Pro Display,Helvetica,Arial,sans-serif';
  const contentTop = statusH + 72;
  const cw = w - 48;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="${BG}"/>
  ${platform === 'android' ? statusBarAndroid(w) : statusBarIOS(w)}
  ${header(w, statusH, 'Prendre un RDV', font)}`;

  // Month header
  let panelY = contentTop + 16;
  svg += `<text x="${w/2}" y="${panelY + 32}" font-family="${font}" font-size="22" fill="${TEXT}" text-anchor="middle" font-weight="700">Mai 2026</text>`;
  panelY += 50;

  // Day labels
  const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const dayW = (cw) / 7;
  days.forEach((d, i) => {
    svg += `<text x="${24 + dayW * i + dayW/2}" y="${panelY + 22}" font-family="${font}" font-size="15" fill="${TEXT2}" text-anchor="middle">${d}</text>`;
  });
  panelY += 32;

  // Calendar grid (3 weeks)
  const calendarDays = [
    [null, null, null, null, 1, 2, 3],
    [4, 5, 6, 7, 8, 9, 10],
    [11, 12, 13, 14, 15, 16, 17],
  ];
  const busy = [1, 5, 9, 12, 16];
  const selected = 14;
  calendarDays.forEach((week) => {
    week.forEach((day, col) => {
      if (day) {
        const dx = 24 + col * dayW + dayW/2;
        const dy = panelY + 22;
        const isBusy = busy.includes(day);
        const isSel = day === selected;
        if (isSel) {
          svg += `<circle cx="${dx}" cy="${dy - 6}" r="22" fill="${RED}"/>`;
        }
        svg += `<text x="${dx}" y="${dy}" font-family="${font}" font-size="18" fill="${isSel ? '#fff' : isBusy ? '#ef4444' : TEXT}" text-anchor="middle" font-weight="${isSel ? '700' : '400'}">${day}</text>`;
      }
    });
    panelY += 52;
  });
  panelY += 8;

  // Time slots
  svg += `<text x="28" y="${panelY + 28}" font-family="${font}" font-size="18" fill="${TEXT}" font-weight="600">Créneaux disponibles — Mardi 14 mai</text>`;
  panelY += 44;
  const slots = ['08h00', '09h00', '10h00', '11h00', '14h00', '15h00', '16h00'];
  const busySlots = ['10h00', '11h00'];
  const selectedSlot = '09h00';
  const slotW = (cw - 16) / 4;
  slots.forEach((slot, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const sx = 24 + col * (slotW + 5);
    const sy = panelY + row * 60;
    if (sy + 52 < h - tabH - 80) {
      const isBusy = busySlots.includes(slot);
      const isSel = slot === selectedSlot;
      const bg = isSel ? RED : isBusy ? '#1f1f1f' : SURFACE2;
      const tc = isSel ? '#fff' : isBusy ? '#555' : TEXT;
      svg += `<rect x="${sx}" y="${sy}" width="${slotW}" height="50" rx="12" fill="${bg}"/>
      <text x="${sx + slotW/2}" y="${sy + 32}" font-family="${font}" font-size="17" fill="${tc}" text-anchor="middle" font-weight="${isSel ? '700' : '400'}">${isBusy ? '–' : slot}</text>`;
    }
  });

  // CTA
  const ctaY = h - tabH - 80;
  svg += `<rect x="24" y="${ctaY}" width="${cw}" height="60" rx="16" fill="${RED}"/>
  <text x="${24 + cw/2}" y="${ctaY + 38}" font-family="${font}" font-size="20" fill="#fff" text-anchor="middle" font-weight="700">Confirmer le rendez-vous</text>`;

  svg += platform === 'android' ? navBarAndroid(w, h, 'reservation') : tabBarIOS(w, h, 'reservation');
  svg += '</svg>';
  return svg;
}

function screenProfil(w, h, isTablet, platform) {
  const statusH = platform === 'android' ? 48 : 54;
  const tabH = 88;
  const font = platform === 'android' ? 'Roboto,Arial,sans-serif' : 'SF Pro Display,Helvetica,Arial,sans-serif';
  const contentTop = statusH + 72;
  const cw = w - 48;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="${BG}"/>
  ${platform === 'android' ? statusBarAndroid(w) : statusBarIOS(w)}
  ${header(w, statusH, 'Mon Profil', font)}`;

  // Avatar + name
  let panelY = contentTop + 20;
  svg += `<circle cx="${w/2}" cy="${panelY + 56}" r="56" fill="${RED}"/>
  <text x="${w/2}" y="${panelY + 68}" font-family="${font}" font-size="40" fill="#fff" text-anchor="middle" font-weight="700">MR</text>`;
  panelY += 132;
  svg += `<text x="${w/2}" y="${panelY}" font-family="${font}" font-size="24" fill="${TEXT}" text-anchor="middle" font-weight="700">Mohamed R.</text>`;
  panelY += 30;
  svg += `<text x="${w/2}" y="${panelY}" font-family="${font}" font-size="17" fill="${TEXT2}" text-anchor="middle">rbelmahi90@gmail.com</text>`;
  panelY += 20;
  svg += badge(w/2 - 60, panelY, 'Client fidèle ★', RED);
  panelY += 52;

  // Menu items
  const menuItems = [
    { icon: '🚗', label: 'Mes véhicules', sub: '2 véhicules enregistrés' },
    { icon: '🔔', label: 'Notifications', sub: 'Activées' },
    { icon: '💳', label: 'Paiements', sub: 'Carte •••• 4242' },
    { icon: '🌙', label: 'Mode sombre', sub: 'Activé', toggle: true },
    { icon: '📄', label: 'Conditions d\'utilisation', sub: '' },
    { icon: '🗑️', label: 'Supprimer mon compte', sub: '', danger: true },
  ];

  menuItems.forEach((item) => {
    if (panelY + 68 < h - tabH) {
      svg += card(24, panelY, cw, 60);
      svg += `<text x="58" y="${panelY + 26}" font-family="${font}" font-size="22" fill="${item.danger ? '#ef4444' : RED}" text-anchor="middle">${item.icon}</text>
      <text x="82" y="${panelY + 26}" font-family="${font}" font-size="18" fill="${item.danger ? '#ef4444' : TEXT}" font-weight="500">${item.label}</text>`;
      if (item.sub) {
        svg += `<text x="82" y="${panelY + 46}" font-family="${font}" font-size="15" fill="${TEXT2}">${item.sub}</text>`;
      }
      if (item.toggle) {
        svg += `<rect x="${cw - 30}" y="${panelY + 16}" width="52" height="28" rx="14" fill="${RED}"/>
        <circle cx="${cw - 6}" cy="${panelY + 30}" r="12" fill="#fff"/>`;
      } else {
        svg += `<text x="${cw + 14}" y="${panelY + 30}" font-family="${font}" font-size="18" fill="${TEXT2}" text-anchor="end">›</text>`;
      }
      panelY += 72;
    }
  });

  svg += platform === 'android' ? navBarAndroid(w, h, 'profil') : tabBarIOS(w, h, 'profil');
  svg += '</svg>';
  return svg;
}

// ── RENDER ENGINE ─────────────────────────────────────────────────────────────

const screens = {
  home: screenHome,
  devis: screenDevis,
  configurateur: screenConfigurateur,
  ar: screenAR,
  reservation: screenReservation,
  profil: screenProfil,
};

const deviceConfigs = [
  { folder: 'ios-6.7',      w: 1290, h: 2796, isTablet: false, platform: 'ios' },
  { folder: 'ios-6.5',      w: 1242, h: 2688, isTablet: false, platform: 'ios' },
  { folder: 'ios-5.5',      w: 1242, h: 2208, isTablet: false, platform: 'ios' },
  { folder: 'ipad-12.9',    w: 2048, h: 2732, isTablet: true,  platform: 'ios' },
  { folder: 'android-phone', w: 1080, h: 1920, isTablet: false, platform: 'android' },
  { folder: 'android-7',    w: 1200, h: 1920, isTablet: true,  platform: 'android' },
  { folder: 'android-10',   w: 1600, h: 2560, isTablet: true,  platform: 'android' },
];

const BASE = 'store-assets/screenshots';
let ok = 0, fail = 0;

for (const dev of deviceConfigs) {
  for (const [screenName, renderFn] of Object.entries(screens)) {
    const svgStr = renderFn(dev.w, dev.h, dev.isTablet, dev.platform);
    const outPath = join(BASE, dev.folder, `${screenName}.png`);
    try {
      await sharp(Buffer.from(svgStr))
        .resize(dev.w, dev.h)
        .png({ compressionLevel: 9 })
        .toFile(outPath);
      console.log(`✓ ${dev.folder}/${screenName}.png`);
      ok++;
    } catch (e) {
      console.error(`✗ ${dev.folder}/${screenName}.png — ${e.message}`);
      fail++;
    }
  }
}

console.log(`\nDone: ${ok} ok, ${fail} failed`);
