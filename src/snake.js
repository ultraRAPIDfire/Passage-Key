// Snake mini-boss: a segmented serpent that roams the field. Every segment
// carries its own word; clearing a segment severs it, and the snake speeds up
// as it shortens.

import { px } from './sprites.js';

// Distance in pixels between consecutive body segments.
const SEGMENT_GAP = 74;

export const SNAKE_INTERVAL = 3; // appears on every 3rd level (that isn't a boss level)

export function createSnake({ level, words, canvasW, canvasH }) {
  const count = Math.min(4 + Math.floor(level / 2), 9);
  const segments = [];
  const startX = canvasW * 0.5;
  const startY = canvasH * 0.28;

  for (let i = 0; i < count; i++) {
    segments.push({
      word: words[i],
      typed: 0,
      // Segments trail behind the head, so each starts offset along the path.
      x: startX - i * 46,
      y: startY,
      alive: true,
      hitFlash: 0,
    });
  }

  // Pre-seed the head path so the body starts strung out behind the head
  // instead of every segment stacking on the head for the first second.
  const trail = [];
  for (let i = 0; i < (count + 3) * SEGMENT_GAP; i++) {
    trail.push({ x: startX - i, y: startY });
  }

  return {
    kind: 'snake',
    name: 'THE WORDWYRM',
    title: 'Sever every coil',
    segments,
    maxSegments: count,
    headX: startX,
    headY: startY,
    angle: 0,
    turnTimer: 0,
    dashTimer: 4 + Math.random() * 4,
    dashing: 0,
    baseSpeed: 42 + level * 3,
    trail,
    defeated: false,
    deathTimer: 0,
  };
}

export function aliveSegments(snake) {
  return snake.segments.filter(s => s.alive);
}

function speedOf(snake, canvasH) {
  const lost = 1 - aliveSegments(snake).length / snake.maxSegments;
  // Every severed coil makes the remainder angrier.
  const rage = 1 + lost * 1.6;
  return snake.baseSpeed * rage * (snake.dashing > 0 ? 2.6 : 1);
}

export function updateSnake(snake, dt, canvasW, canvasH) {
  if (snake.defeated) { snake.deathTimer += dt; return; }

  for (const s of snake.segments) {
    if (s.hitFlash > 0) s.hitFlash = Math.max(0, s.hitFlash - dt);
  }

  // Wander: pick a new heading periodically, plus occasional dashes.
  snake.turnTimer -= dt;
  if (snake.turnTimer <= 0) {
    snake.turnTimer = 0.7 + Math.random() * 1.4;
    snake.angle += (Math.random() - 0.5) * 1.7;
  }

  snake.dashTimer -= dt;
  if (snake.dashTimer <= 0) {
    snake.dashTimer = 5 + Math.random() * 5;
    snake.dashing = 0.7;
    snake.angle += (Math.random() - 0.5) * 1.2;
  }
  if (snake.dashing > 0) snake.dashing = Math.max(0, snake.dashing - dt);

  const speed = speedOf(snake, canvasH);
  snake.headX += Math.cos(snake.angle) * speed * dt;
  snake.headY += Math.sin(snake.angle) * speed * dt;

  // Bounce off the play bounds so it never wanders off-screen.
  const marginX = 90;
  const topY = canvasH * 0.12;
  const botY = canvasH * 0.62;
  if (snake.headX < marginX) { snake.headX = marginX; snake.angle = Math.PI - snake.angle; }
  if (snake.headX > canvasW - marginX) { snake.headX = canvasW - marginX; snake.angle = Math.PI - snake.angle; }
  if (snake.headY < topY) { snake.headY = topY; snake.angle = -snake.angle; }
  if (snake.headY > botY) { snake.headY = botY; snake.angle = -snake.angle; }

  // Record the head path; segments ride it at fixed spacing.
  snake.trail.unshift({ x: snake.headX, y: snake.headY });
  if (snake.trail.length > 1200) snake.trail.length = 1200;

  // Follow the path by arc length, not by array index: trail points are spaced
  // by per-frame movement, so index-based sampling collapses the body whenever
  // the snake is moving slowly.
  const living = aliveSegments(snake);
  let segIdx = 0;
  let travelled = 0;
  let want = SEGMENT_GAP;

  for (let i = 1; i < snake.trail.length && segIdx < living.length; i++) {
    const a = snake.trail[i - 1];
    const b = snake.trail[i];
    travelled += Math.hypot(b.x - a.x, b.y - a.y);
    while (travelled >= want && segIdx < living.length) {
      living[segIdx].x = b.x;
      living[segIdx].y = b.y;
      segIdx += 1;
      want += SEGMENT_GAP;
    }
  }
  // Any segment beyond the recorded path trails off the end.
  const tail = snake.trail[snake.trail.length - 1];
  for (; segIdx < living.length; segIdx++) {
    living[segIdx].x = tail.x;
    living[segIdx].y = tail.y;
  }
}

// Returns true when the final segment falls.
export function severSegment(snake, seg) {
  seg.alive = false;
  seg.hitFlash = 0.2;
  if (aliveSegments(snake).length === 0) {
    snake.defeated = true;
    snake.deathTimer = 0;
    return true;
  }
  return false;
}

export function drawSnake(ctx, snake, now, fontFor, drawChipFn, drawTextFn) {
  const t = now / 1000;
  const living = aliveSegments(snake);
  if (snake.defeated && snake.deathTimer > 1.2) return;

  const fade = snake.defeated ? Math.max(0, 1 - snake.deathTimer / 1.2) : 1;
  ctx.save();
  ctx.globalAlpha = fade;

  // Body drawn tail-first so the head sits on top.
  for (let i = living.length - 1; i >= 0; i--) {
    const seg = living[i];
    const hue = 120 + i * 14;
    const body = seg.hitFlash > 0 ? '#ffffff' : `hsl(${hue} 70% 45%)`;
    const dark = `hsl(${hue} 70% 24%)`;
    const wob = Math.sin(t * 6 + i * 0.7) * 2;

    ctx.save();
    ctx.translate(seg.x, seg.y + wob);

    // scaly coil
    px(-15, -13, 30, 26, '#04010c');
    px(-13, -11, 26, 22, body);
    px(-13, -11, 26, 4, `hsl(${hue} 80% 65%)`);
    px(-13, 7, 26, 4, dark);
    px(-6, -4, 12, 8, dark);

    ctx.restore();
  }

  // Head on the front segment
  if (living.length) {
    const head = living[0];
    const wob = Math.sin(t * 6) * 2;
    ctx.save();
    ctx.translate(head.x, head.y + wob);
    ctx.rotate(snake.angle);
    px(-18, -15, 36, 30, '#04010c');
    px(-16, -13, 32, 26, snake.dashing > 0 ? '#ffd83d' : '#37c96a');
    px(-16, -13, 32, 5, '#9fffc0');
    // eyes + fangs
    px(2, -9, 7, 7, '#ffffff');
    px(2, 2, 7, 7, '#ffffff');
    px(5, -7, 4, 4, '#04010c');
    px(5, 4, 4, 4, '#04010c');
    px(16, -6, 6, 3, '#ffffff');
    px(16, 3, 6, 3, '#ffffff');
    ctx.restore();
  }

  ctx.restore();

  // Word chips sit above each segment, unrotated so they stay readable.
  ctx.save();
  ctx.globalAlpha = fade;
  const fontSize = 14;
  ctx.font = fontFor(fontSize);
  ctx.textBaseline = 'middle';
  living.forEach((seg, i) => {
    const w = ctx.measureText(seg.word).width;
    const padX = 8, padY = 6;
    const chipH = fontSize + padY * 2;
    // Alternate label heights so neighbouring chips never overlap.
    const lift = -44 - (i % 2) * 34;
    const started = seg.typed > 0;

    drawChipFn(seg.x - w / 2 - padX, seg.y + lift, w + padX * 2, chipH,
      started ? '#3d3d12' : '#123d1f', true, started ? '#ffd83d' : '#37ff8b');

    // tether the label to its coil
    ctx.strokeStyle = 'rgba(55,255,139,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(seg.x, seg.y + lift + chipH);
    ctx.lineTo(seg.x, seg.y - 14);
    ctx.stroke();

    const typed = seg.word.slice(0, seg.typed);
    const rest = seg.word.slice(seg.typed);
    const tw = ctx.measureText(typed).width;
    drawTextFn(typed, seg.x - w / 2, seg.y + lift + chipH / 2, '#ffd83d', '#5c2f08');
    drawTextFn(rest, seg.x - w / 2 + tw, seg.y + lift + chipH / 2, '#eafcff', '#04010c');
  });
  ctx.restore();
}
