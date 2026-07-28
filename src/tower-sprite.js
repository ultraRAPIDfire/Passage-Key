// Canvas tower structures for Tower 4v4. The tower visibly crumbles as its
// health drops, so the bar isn't the only feedback.

import { px } from './sprites.js';

const PALETTES = {
  A: { stone: '#2f6b8a', stoneDark: '#14384a', stoneLight: '#7fe8ff', flag: '#00a8c9', glow: '#7fe8ff' },
  B: { stone: '#8a2f66', stoneDark: '#4a1438', flagLight: '#ff8ad0', stoneLight: '#ff8ad0', flag: '#c9007a', glow: '#ff8ad0' },
};

// `hp01` is 1 → full, 0 → destroyed.
export function drawTower(ctx, x, groundY, hp01, team, now, hitFlash = 0) {
  const p = PALETTES[team] || PALETTES.A;
  const t = now / 1000;
  const damaged = 1 - hp01;

  ctx.save();
  ctx.translate(x, groundY);

  // shadow
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = '#04010c';
  ctx.beginPath();
  ctx.ellipse(0, 4, 54, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (hp01 <= 0) {
    // rubble pile
    ctx.fillStyle = p.stoneDark;
    for (let i = 0; i < 9; i++) {
      const rx = -44 + i * 10 + Math.sin(i * 3) * 4;
      px(rx, -10 - (i % 3) * 5, 12, 10, i % 2 ? p.stone : p.stoneDark);
    }
    ctx.restore();
    return;
  }

  const flash = hitFlash > 0;
  const stone = flash ? '#ffffff' : p.stone;
  const stoneDark = flash ? '#cccccc' : p.stoneDark;

  // Tower shrinks in visible tiers as it takes damage.
  const totalTiers = 8;
  const tiersLeft = Math.max(1, Math.ceil(hp01 * totalTiers));
  const tierH = 30;

  // wide foundation + buttresses
  px(-64, -22, 128, 22, stoneDark);
  px(-64, -22, 128, 5, p.stoneLight);
  px(-72, -14, 12, 14, stoneDark);
  px(60, -14, 12, 14, stoneDark);

  for (let i = 0; i < tiersLeft; i++) {
    const w = 104 - i * 7;
    const y = -22 - (i + 1) * tierH;
    const sway = flash ? Math.sin(now / 22) * 2 : 0;

    px(-w / 2 + sway, y, w, tierH, stone);
    px(-w / 2 + sway, y, w, 5, p.stoneLight);
    px(-w / 2 + sway, y + tierH - 5, w, 5, stoneDark);

    // stone course lines
    for (let c = 1; c < 3; c++) {
      px(-w / 2 + sway, y + c * (tierH / 3), w, 1, 'rgba(0,0,0,0.25)');
    }

    // windows glow while the tier stands
    const winY = y + 10;
    for (let k = -1; k <= 1; k++) {
      ctx.save();
      ctx.globalAlpha = 0.55 + Math.sin(t * 3 + i + k) * 0.3;
      ctx.shadowColor = p.glow;
      ctx.shadowBlur = 12;
      px(k * 28 - 5 + sway, winY, 10, 14, p.glow);
      ctx.restore();
    }
  }

  const topY = -22 - tiersLeft * tierH;

  // battlements
  const topW = 104 - (tiersLeft - 1) * 7;
  for (let i = 0; i < 6; i++) {
    px(-topW / 2 + i * (topW / 6), topY - 12, topW / 11, 12, stoneDark);
  }
  px(-topW / 2 - 4, topY, topW + 8, 6, stone);

  // banner pole + flag, tattered as damage rises
  px(-2, topY - 52, 4, 44, '#4a3520');
  const wave = Math.sin(t * 4) * 5;
  ctx.fillStyle = p.flag;
  ctx.beginPath();
  ctx.moveTo(2, topY - 50);
  ctx.lineTo(2 + 34, topY - 44 + wave);
  ctx.lineTo(2 + 30, topY - 34 + wave);
  ctx.lineTo(2, topY - 28);
  ctx.closePath();
  ctx.fill();

  // smoke and flame once badly hurt
  if (damaged > 0.5) {
    for (let i = 0; i < 3; i++) {
      const sx = -20 + i * 20;
      const rise = ((t * 30 + i * 40) % 70);
      ctx.globalAlpha = Math.max(0, 0.45 - rise / 160);
      ctx.fillStyle = '#3a2a28';
      ctx.fillRect(sx - 6 + Math.sin(t * 2 + i) * 5, topY - rise, 12, 12);
    }
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.globalAlpha = 0.6 + Math.sin(t * 9) * 0.3;
    ctx.shadowColor = '#ff8a3d';
    ctx.shadowBlur = 16;
    px(-8, topY - 6, 16, 8, '#ff8a3d');
    ctx.restore();
  }

  ctx.restore();
}
