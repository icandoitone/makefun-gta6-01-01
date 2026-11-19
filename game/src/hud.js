// HUD: money, health, wanted stars, objective line, speed, minimap and
// toasts, plus the menu / pause / busted / wasted overlays. Styling lives
// in style.css; this file only moves data into the DOM and draws the
// 2D minimap.

import { ROAD_COORDS, CITY_HALF } from './config.js';

export class Hud {
  constructor() {
    this.el = {};
    for (const id of ['money', 'health-fill', 'health-num', 'stars', 'objective',
      'objective-dist', 'speed', 'speed-unit', 'toast', 'minimap', 'banner',
      'banner-title', 'banner-sub', 'menu', 'pause', 'busted', 'wasted',
      'complete', 'hint', 'ammo']) {
      this.el[id] = document.getElementById(id);
    }
    this.mapCtx = this.el.minimap ? this.el.minimap.getContext('2d') : null;
    this._toastTimer = null;
    this._bannerTimer = null;
  }

  setMoney(n) {
    if (this.el.money) this.el.money.textContent = '$' + n.toLocaleString();
  }

  setHealth(h) {
    const pct = Math.max(0, Math.min(100, h));
    if (this.el['health-fill']) this.el['health-fill'].style.width = pct + '%';
    if (this.el['health-num']) this.el['health-num'].textContent = Math.round(pct);
  }

  setAmmo(a) {
    if (this.el.ammo) this.el.ammo.textContent = a === null ? '' : `Ammo ${a}`;
  }

  setWanted(level) {
    if (!this.el.stars) return;
    let s = '';
    for (let i = 0; i < 5; i++) s += i < level ? '★' : '☆';
    this.el.stars.textContent = s;
    this.el.stars.classList.toggle('hot', level >= 3);
  }

  setObjective(text, distText) {
    if (this.el.objective) this.el.objective.textContent = text;
    if (this.el['objective-dist']) this.el['objective-dist'].textContent = distText || '';
  }

  setSpeed(kmh, inCar) {
    if (!this.el.speed) return;
    this.el.speed.textContent = inCar ? String(Math.round(kmh)) : '';
    if (this.el['speed-unit']) this.el['speed-unit'].textContent = inCar ? 'km/h' : '';
  }

  setHint(text) {
    if (this.el.hint) this.el.hint.textContent = text;
  }

  toast(text, ms = 4200) {
    const t = this.el.toast;
    if (!t) return;
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  banner(title, sub, ms = 3600) {
    const b = this.el.banner;
    if (!b) return;
    if (this.el['banner-title']) this.el['banner-title'].textContent = title;
    if (this.el['banner-sub']) this.el['banner-sub'].textContent = sub || '';
    b.classList.add('show');
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => b.classList.remove('show'), ms);
  }

  showOverlay(name) {
    for (const n of ['menu', 'pause', 'busted', 'wasted', 'complete']) {
      const e = this.el[n];
      if (e) e.classList.toggle('show', n === name);
    }
  }

  hideOverlays() {
    this.showOverlay(null);
  }

  // Minimap: roads, blocks, mission beacon, player arrow, police dots.
  drawMinimap(state) {
    const ctx = this.mapCtx;
    if (!ctx) return;
    const S = 180;
    const scale = S / (CITY_HALF * 2 + 40);
    const toMap = (x, z) => [S / 2 + x * scale, S / 2 + z * scale];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(12, 18, 24, 0.82)';
    ctx.fillRect(0, 0, S, S);
    // Blocks.
    ctx.fillStyle = '#4a5560';
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        const [x, z] = toMap(-222 + i * 74, -222 + j * 74);
        ctx.fillRect(x - 30 * scale, z - 30 * scale, 60 * scale, 60 * scale);
      }
    }
    // Roads.
    ctx.strokeStyle = '#c8ccd2';
    ctx.lineWidth = 2;
    for (const c of ROAD_COORDS) {
      const [x1, y1] = toMap(c, -CITY_HALF);
      const [x2, y2] = toMap(c, CITY_HALF);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      const [x3, y3] = toMap(-CITY_HALF, c);
      const [x4, y4] = toMap(CITY_HALF, c);
      ctx.beginPath(); ctx.moveTo(x3, y3); ctx.lineTo(x4, y4); ctx.stroke();
    }
    // Mission beacon.
    if (state.beacon) {
      const [bx, bz] = toMap(state.beacon.x, state.beacon.z);
      const pulse = 5 + Math.sin(performance.now() * 0.006) * 2;
      ctx.fillStyle = '#ffd23d';
      ctx.beginPath(); ctx.arc(bx, bz, pulse, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffd23d';
      ctx.beginPath(); ctx.arc(bx, bz, pulse + 4, 0, Math.PI * 2); ctx.stroke();
    }
    // Traffic.
    ctx.fillStyle = '#9aa0a6';
    for (const c of state.traffic || []) {
      const [x, z] = toMap(c.x, c.z);
      ctx.fillRect(x - 1.5, z - 1.5, 3, 3);
    }
    // Police.
    ctx.fillStyle = '#4d9fff';
    for (const p of state.police || []) {
      const [x, z] = toMap(p.x, p.z);
      ctx.beginPath(); ctx.arc(x, z, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    // Player arrow.
    const [px, pz] = toMap(state.player.x, state.player.z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(state.player.heading);
    ctx.fillStyle = state.player.inCar ? '#ff4757' : '#2ed573';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
