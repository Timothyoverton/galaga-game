import { Component, signal, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';

type EnemyType  = 'bee' | 'butterfly' | 'boss';
type EnemyState = 'waiting' | 'entering' | 'formation' | 'diving' | 'returning';

interface Enemy {
  id: number; type: EnemyType;
  x: number; y: number; w: number; h: number;
  health: number; maxHealth: number;
  homeX: number; homeY: number;
  state: EnemyState;
  t: number; speed: number;
  bx: [number,number,number,number];
  by: [number,number,number,number];
  waitDelay: number;
  divePoints: number;
  hitFlash: number;
  shootTimer: number;
}

interface Bullet { x: number; y: number; w: number; h: number; speed: number; color: string; }
interface EnemyBullet { x: number; y: number; dx: number; dy: number; }
interface PowerUp { x: number; y: number; w: number; h: number; speed: number; type: string; color: string; label: string; }

interface TractorBeam {
  bossId: number; x: number; topY: number;
  phase: 'warning' | 'active'; phaseTimer: number; captureTimer: number;
}

interface MegaBomb { x: number; y: number; w: number; h: number; dx: number; }

interface GameRecord { gameNumber: number; score: number; level: number; time: string; }

@Component({
  selector: 'app-root',
  imports: [CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  gameWidth  = 960;
  gameHeight = 720;

  score    = signal(0);
  lives    = signal(3);
  level    = signal(1);
  gameOver = signal(false);

  playerX = 455;
  readonly PLAYER_Y   = 648;
  readonly PLAYER_W   = 50;
  readonly PLAYER_H   = 44;
  readonly PLAYER_SPD = 7;

  enemies:      Enemy[]            = [];
  bullets:      Bullet[]           = [];
  enemyBullets: EnemyBullet[]      = [];
  tractorBeam:  TractorBeam | null = null;

  formationOffsetX = 0;
  formationDir     = 1;
  formationSpeed   = 0.7;

  diveTimer  = 0;
  nextDiveAt = 150;
  allEntered = false;
  stuckTimer = 0;

  bulletCooldown = 0;
  readonly BULLET_COOLDOWN = 14;

  powerUps: PowerUp[] = [];
  activePowerUp: string | null = null;
  powerUpTimer = 0;
  readonly powerUpDuration = 600;
  readonly POWER_UP_DEFS: Record<string, { color: string; label: string; name: string }> = {
    dual:   { color: '#ffee00', label: '⚡', name: 'DUAL CANNON' },
    triple: { color: '#ff8800', label: '3×', name: 'TRIPLE SHOT' },
    shield: { color: '#00aaff', label: '⬡',  name: 'FORCE FIELD' },
    rapid:  { color: '#ff44ff', label: '★',  name: 'RAPID FIRE'  },
  };

  megaBomb: MegaBomb | null = null;
  megaBombSpawned = false;
  initialEnemyCount = 0;
  explosionActive = false;
  explosionX = 0;
  explosionY = 0;
  explosionTimer = 0;
  readonly EXPLOSION_DURATION = 60;
  readonly EXPLOSION_RADIUS = 300;

  sessionHistory: GameRecord[] = [];
  gameCount = 0;
  gameLoop: number | null = null;
  keys: { [k: string]: boolean } = {};

  readonly DEFS: Record<EnemyType, { w: number; h: number; health: number; points: number; divePoints: number; color: string }> = {
    bee:       { w: 26, h: 24, health: 1, points: 50,  divePoints: 100, color: '#ff6622' },
    butterfly: { w: 32, h: 28, health: 1, points: 80,  divePoints: 160, color: '#44ccff' },
    boss:      { w: 38, h: 34, health: 2, points: 160, divePoints: 400, color: '#44ff44' },
  };

  // [type, count, homeY, colSpacing, startX, entryDelayBase]
  private readonly BASE_ROWS: [EnemyType, number, number, number, number, number][] = [
    ['boss',      4, 80,  220, 150, 240],
    ['butterfly', 6, 148, 160, 80,  160],
    ['butterfly', 6, 216, 160, 80,  80 ],
    ['bee',       8, 284, 108, 102, 20 ],
    ['bee',       8, 352, 108, 102, 0  ],
  ];

  ngOnInit()    { this.initGame(); }
  ngOnDestroy() { if (this.gameLoop) cancelAnimationFrame(this.gameLoop); }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent) {
    if (e.key === '`') { this.debugLog(); return; }
    this.keys[e.key.toLowerCase()] = true;
    if (e.key === ' ') e.preventDefault();
  }

  @HostListener('window:keyup', ['$event'])
  onKeyUp(e: KeyboardEvent) { this.keys[e.key.toLowerCase()] = false; }

  initGame() {
    this.score.set(0); this.lives.set(3); this.level.set(1); this.gameOver.set(false);
    this.bullets = []; this.enemyBullets = []; this.tractorBeam = null;
    this.powerUps = []; this.activePowerUp = null; this.powerUpTimer = 0;
    this.megaBomb = null; this.megaBombSpawned = false;
    this.explosionActive = false; this.explosionTimer = 0;
    this.formationOffsetX = 0; this.formationDir = 1; this.formationSpeed = 0.45;
    this.diveTimer = 0; this.nextDiveAt = 220; this.allEntered = false; this.stuckTimer = 0; this.bulletCooldown = 0;
    this.playerX = (this.gameWidth - this.PLAYER_W) / 2;
    this.buildFormation();
    this.startLoop();
  }

  buildFormation() {
    this.enemies = [];
    let id = 0;
    const lv = this.level();
    const rows: [EnemyType, number, number, number, number, number][] = [...this.BASE_ROWS];
    if (lv >= 2) rows.push(['bee',       8, 420, 108, 102, 0]);
    if (lv >= 4) rows.push(['butterfly', 6, 488, 160, 80,  0]);

    for (const [type, count, homeY, colSpacing, startX, delayBase] of rows) {
      const def = this.DEFS[type];
      for (let col = 0; col < count; col++) {
        const homeX = startX + col * colSpacing;
        this.enemies.push({
          id: id++, type,
          x: homeX, y: homeY, w: def.w, h: def.h,
          health: def.health, maxHealth: def.health,
          homeX, homeY,
          state: 'waiting', t: 0, speed: 0,
          bx: [homeX,homeX,homeX,homeX], by: [homeY,homeY,homeY,homeY],
          waitDelay: delayBase + col * 8,
          divePoints: def.divePoints, hitFlash: 0,
          shootTimer: 60 + Math.floor(Math.random() * 60),
        });
      }
    }
    this.initialEnemyCount = this.enemies.length;
    this.megaBombSpawned = false;
  }

  startLoop() {
    if (this.gameLoop) cancelAnimationFrame(this.gameLoop);
    const tick = () => { if (!this.gameOver()) this.update(); this.gameLoop = requestAnimationFrame(tick); };
    this.gameLoop = requestAnimationFrame(tick);
  }

  update() {
    this.updateEntries();
    this.updateFormation();
    this.updateDiving();
    this.updateTractorBeam();
    this.updatePlayer();
    this.updateBullets();
    this.updateEnemyBullets();
    this.updatePowerUps();
    this.updateMegaBomb();
    if (this.explosionTimer > 0 && --this.explosionTimer === 0) this.explosionActive = false;
    if (!this.megaBombSpawned && this.allEntered && this.initialEnemyCount > 0
        && this.enemies.length > 0 && this.enemies.length <= Math.floor(this.initialEnemyCount / 2)) {
      this.spawnMegaBomb();
      this.megaBombSpawned = true;
    }
    this.divingEnemyShoot();
    this.checkStuck();
    for (const e of this.enemies) { if (e.hitFlash > 0) e.hitFlash--; }
    if (this.allEntered && this.enemies.length === 0) this.nextLevel();
  }

  // ── Entry animation ────────────────────────────────────
  updateEntries() {
    let pending = false;
    for (const e of this.enemies) {
      if (e.state === 'waiting') {
        pending = true;
        if (--e.waitDelay <= 0) { e.state = 'entering'; this.setupEntryPath(e); }
      } else if (e.state === 'entering') {
        pending = true;
        e.t += e.speed;
        if (e.t >= 1) { e.x = e.homeX; e.y = e.homeY; e.state = 'formation'; }
        else           { e.x = this.bz(e.t, e.bx); e.y = this.bz(e.t, e.by); }
      }
    }
    if (!pending) this.allEntered = true;
  }

  setupEntryPath(e: Enemy) {
    let sx: number, sy: number;
    if (e.type === 'boss') {
      sx = e.homeX + (e.homeX < this.gameWidth / 2 ? -300 : 300); sy = -60;
    } else if (e.homeX < this.gameWidth / 2) {
      sx = -70; sy = 80 + Math.random() * 120;
    } else {
      sx = this.gameWidth + 70; sy = 80 + Math.random() * 120;
    }
    const cp1x = sx + (e.homeX - sx) * 0.25 + (Math.random() - 0.5) * 180;
    const cp1y = (sy + e.homeY) / 2 + 100;
    const cp2x = e.homeX + (Math.random() - 0.5) * 80;
    const cp2y = e.homeY - 80;
    e.bx = [sx, cp1x, cp2x, e.homeX]; e.by = [sy, cp1y, cp2y, e.homeY];
    e.x = sx; e.y = sy; e.t = 0; e.speed = 0.013;
  }

  // ── Formation ─────────────────────────────────────────
  updateFormation() {
    const inF = this.enemies.filter(e => e.state === 'formation');
    if (inF.length === 0) {
      this.formationOffsetX *= 0.97; // decay toward 0 so returning enemies land on-screen
      return;
    }

    this.formationOffsetX += this.formationSpeed * this.formationDir;

    // Compute the actual left/right edges of the whole formation
    let minEdge = Infinity, maxEdge = -Infinity;
    for (const e of inF) {
      minEdge = Math.min(minEdge, e.homeX + this.formationOffsetX);
      maxEdge = Math.max(maxEdge, e.homeX + e.w + this.formationOffsetX);
    }
    // Clamp offset directly so a far-drifted formation snaps back immediately
    if (minEdge <= 8) {
      this.formationOffsetX += 8 - minEdge + 1;
      this.formationDir = 1;
    } else if (maxEdge >= this.gameWidth - 8) {
      this.formationOffsetX -= maxEdge - (this.gameWidth - 8) + 1;
      this.formationDir = -1;
    }
    for (const e of this.enemies) {
      if (e.state === 'formation') {
        e.x = Math.max(8, Math.min(this.gameWidth - e.w - 8, e.homeX + this.formationOffsetX));
        e.y = e.homeY;
      }
    }

    if (!this.allEntered) return;
    if (++this.diveTimer >= this.nextDiveAt) {
      this.diveTimer = 0;
      const lv = this.level();
      this.nextDiveAt = Math.max(90, 220 - lv * 12) + Math.random() * 60;
      this.launchDive();
    }
  }

  launchDive() {
    const candidates = this.enemies.filter(e => e.state === 'formation');
    if (candidates.length < 2) return;

    const canUseBoss = candidates.some(e => e.type === 'boss');
    const isBossAttack = canUseBoss && Math.random() < 0.25;
    let group: Enemy[];

    if (isBossAttack) {
      const boss = candidates.find(e => e.type === 'boss')!;
      const escorts = candidates.filter(e => e.type === 'bee').slice(0, 2);
      group = escorts.length ? [boss, ...escorts] : [boss];
    } else {
      const pool = candidates.filter(e => e.type !== 'boss');
      if (pool.length === 0) return;
      const pivot = pool[Math.floor(Math.random() * pool.length)];
      const lv = this.level();
      const maxGroup = lv <= 1 ? 1 : lv <= 3 ? 2 : 3;
      const nearby = pool.filter(e => Math.abs(e.homeX - pivot.homeX) < 260).slice(0, Math.random() < 0.35 ? maxGroup : 1);
      group = nearby;
    }

    const tx = this.playerX + this.PLAYER_W / 2;
    for (const e of group) {
      this.setupDivePath(e, tx + (Math.random() - 0.5) * 60);
      e.state = 'diving';
      e.shootTimer = 30 + Math.floor(Math.random() * 50);
    }

    if (isBossAttack) {
      const boss = group[0];
      this.tractorBeam = { bossId: boss.id, x: boss.x + boss.w/2, topY: boss.y + boss.h, phase: 'warning', phaseTimer: 50, captureTimer: 0 };
    }
  }

  setupDivePath(e: Enemy, targetX: number) {
    const sx = e.x, sy = e.y;
    const margin = 40;

    // Classic Galaga: swing to the outer side, but CLAMP so the enemy stays on-screen.
    // Left-half enemies swing left, right-half swing right — capped at the screen edge.
    const dir = sx < this.gameWidth / 2 ? -1 : 1;
    const maxSwing = dir === -1
      ? Math.min(80, sx - margin)               // can't go past left margin
      : Math.min(80, this.gameWidth - margin - e.w - sx);  // can't go past right margin
    const cp1x = sx + dir * Math.max(0, maxSwing);
    const cp1y = sy - 30;

    // Mid-point and end are clamped to visible area
    const clampX = (x: number) => Math.max(margin, Math.min(this.gameWidth - margin, x));
    const cp2x = clampX(targetX + (Math.random() - 0.5) * 80);
    const endX  = clampX(targetX + (Math.random() - 0.5) * 40);

    e.bx = [sx, cp1x, cp2x, endX];
    e.by = [sy, cp1y, this.gameHeight * 0.48, this.gameHeight + 80];
    e.t = 0;
    e.speed = 0.005 + (this.level() - 1) * 0.0005 + (e.type === 'bee' ? 0.0015 : 0);
  }

  // ── Dive / Return movement ─────────────────────────────
  updateDiving() {
    for (const e of this.enemies) {
      if (e.state !== 'diving' && e.state !== 'returning') continue;
      e.t += e.speed;
      e.x = this.bz(e.t, e.bx); e.y = this.bz(e.t, e.by);
      if (e.state === 'diving' && (e.t >= 1 || e.y > this.gameHeight + 60)) this.setupReturnPath(e);
      else if (e.state === 'returning' && e.t >= 1) {
        const snapX = e.homeX + this.formationOffsetX;
        if (snapX < 10 || snapX + e.w > this.gameWidth - 10) {
          this.formationOffsetX = Math.max(-60, Math.min(60, this.formationOffsetX));
        }
        e.x = e.homeX + this.formationOffsetX; e.y = e.homeY; e.state = 'formation';
      }
    }
  }

  setupReturnPath(e: Enemy) {
    const startX = Math.max(40, Math.min(this.gameWidth - 40, e.x));
    e.x = startX; e.y = -60; e.t = 0;
    // Clamp destination so enemy always returns visibly on-screen
    const rawTx = e.homeX + this.formationOffsetX;
    const tx = Math.max(e.w + 10, Math.min(this.gameWidth - e.w - 10, rawTx));
    const ty = e.homeY;
    const cp1x = startX + (tx - startX) * 0.35;
    e.bx = [startX, cp1x, tx + (Math.random()-0.5)*30, tx];
    e.by = [-60, 100, ty - 80, ty];
    e.speed = 0.013; e.state = 'returning';
  }

  // ── Tractor beam ───────────────────────────────────────
  updateTractorBeam() {
    if (!this.tractorBeam) return;
    const boss = this.enemies.find(e => e.id === this.tractorBeam!.bossId);
    if (!boss || (boss.state !== 'diving' && boss.state !== 'returning')) { this.tractorBeam = null; return; }

    this.tractorBeam.x    = boss.x + boss.w / 2;
    this.tractorBeam.topY = boss.y + boss.h;

    if (--this.tractorBeam.phaseTimer <= 0) {
      if (this.tractorBeam.phase === 'warning') { this.tractorBeam.phase = 'active'; this.tractorBeam.phaseTimer = 200; }
      else { this.tractorBeam = null; return; }
    }

    if (this.tractorBeam.phase !== 'active') return;
    const bx = this.tractorBeam.x, topY = this.tractorBeam.topY;
    const pcx = this.playerX + this.PLAYER_W/2, pcy = this.PLAYER_Y + this.PLAYER_H/2;
    const depth = pcy - topY;
    if (depth > 0 && depth < 320) {
      const hw = 12 + 55 * (depth / 320);
      if (Math.abs(pcx - bx) <= hw) {
        if (++this.tractorBeam.captureTimer >= 90) { this.tractorBeam = null; this.playerHit(); }
      } else {
        this.tractorBeam.captureTimer = Math.max(0, this.tractorBeam.captureTimer - 2);
      }
    }
  }

  // ── Player ────────────────────────────────────────────
  updatePlayer() {
    if (this.keys['arrowleft'] || this.keys['a']) this.playerX = Math.max(0, this.playerX - this.PLAYER_SPD);
    if (this.keys['arrowright'] || this.keys['d']) this.playerX = Math.min(this.gameWidth - this.PLAYER_W, this.playerX + this.PLAYER_SPD);
    if (this.bulletCooldown > 0) this.bulletCooldown--;
    const cooldown = this.activePowerUp === 'rapid' ? 5 : this.BULLET_COOLDOWN;
    if (this.keys[' '] && this.bulletCooldown === 0) { this.shootPlayer(); this.bulletCooldown = cooldown; }
  }

  shootPlayer() {
    const pu = this.activePowerUp;
    const color = pu ? (this.POWER_UP_DEFS[pu]?.color ?? '#00ff00') : '#00ff00';
    const cx = this.playerX + this.PLAYER_W / 2;
    const make = (offset: number) => ({ x: cx + offset - 3, y: this.PLAYER_Y, w: 5, h: 22, speed: 14, color });
    if (pu === 'dual')        this.bullets.push(make(-16), make(16));
    else if (pu === 'triple') this.bullets.push(make(-22), make(0), make(22));
    else                      this.bullets.push(make(0));
  }

  divingEnemyShoot() {
    const shootCutoff = this.PLAYER_Y - this.PLAYER_H * 3;
    for (const e of this.enemies) {
      if (e.state !== 'diving' || --e.shootTimer > 0) continue;
      e.shootTimer = 45 + Math.floor(Math.random() * 50);
      if (e.y + e.h > shootCutoff) continue; // too close — no shooting below this line
      const cx = e.x + e.w/2, cy = e.y + e.h;
      const tx = this.playerX + this.PLAYER_W/2, ty = this.PLAYER_Y + this.PLAYER_H/2;
      const dist = Math.sqrt((tx-cx)**2 + (ty-cy)**2) || 1;
      const spd = 3.5 + this.level() * 0.25;
      this.enemyBullets.push({ x: cx-3, y: cy, dx: (tx-cx)/dist*spd, dy: (ty-cy)/dist*spd });
    }
  }

  // ── Mega bomb easter egg ───────────────────────────────
  spawnMegaBomb() {
    const formEnemies = this.enemies.filter(e => e.state === 'formation');
    const avgY = formEnemies.length > 0
      ? formEnemies.reduce((sum, e) => sum + e.homeY, 0) / formEnemies.length
      : 240;
    const goRight = Math.random() < 0.5;
    this.megaBomb = { x: goRight ? -44 : this.gameWidth + 4, y: avgY - 20, w: 40, h: 40, dx: goRight ? 3.5 : -3.5 };
  }

  updateMegaBomb() {
    if (!this.megaBomb) return;
    this.megaBomb.x += this.megaBomb.dx;
    if (this.megaBomb.x + this.megaBomb.w < -20 || this.megaBomb.x > this.gameWidth + 20) {
      this.megaBomb = null;
    }
  }

  triggerExplosion(cx: number, cy: number) {
    this.explosionActive = true;
    this.explosionX = cx;
    this.explosionY = cy;
    this.explosionTimer = this.EXPLOSION_DURATION;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const dist = Math.sqrt((e.x + e.w / 2 - cx) ** 2 + (e.y + e.h / 2 - cy) ** 2);
      if (dist <= this.EXPLOSION_RADIUS) {
        const isDiving = e.state === 'diving' || e.state === 'returning';
        this.score.update(s => s + (isDiving ? e.divePoints : this.DEFS[e.type].points));
        this.enemies.splice(i, 1);
      }
    }
    if (this.tractorBeam && !this.enemies.find(e => e.id === this.tractorBeam!.bossId)) {
      this.tractorBeam = null;
    }
  }

  // ── Power-ups ──────────────────────────────────────────
  updatePowerUps() {
    this.powerUps = this.powerUps.filter(pu => {
      pu.y += pu.speed;
      if (pu.y > this.gameHeight) return false;
      if (this.hits(pu.x, pu.y, pu.w, pu.h, this.playerX, this.PLAYER_Y, this.PLAYER_W, this.PLAYER_H)) {
        this.activePowerUp = pu.type;
        this.powerUpTimer  = this.powerUpDuration;
        return false;
      }
      return true;
    });
    if (this.powerUpTimer > 0 && --this.powerUpTimer === 0) this.activePowerUp = null;
  }

  // ── Collision & Bullets ────────────────────────────────
  updateBullets() {
    this.bullets = this.bullets.filter(b => {
      b.y -= b.speed;
      if (b.y + b.h < 0) return false;
      if (this.megaBomb && this.hits(b.x, b.y, b.w, b.h, this.megaBomb.x, this.megaBomb.y, this.megaBomb.w, this.megaBomb.h)) {
        this.triggerExplosion(this.megaBomb.x + this.megaBomb.w / 2, this.megaBomb.y + this.megaBomb.h / 2);
        this.megaBomb = null;
        return false;
      }
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        if (!this.hits(b.x, b.y, b.w, b.h, e.x, e.y, e.w, e.h)) continue;
        if (this.tractorBeam?.bossId === e.id) this.tractorBeam = null;
        e.hitFlash = 8; e.health--;
        if (e.health <= 0) {
          const isDiving = e.state === 'diving' || e.state === 'returning';
          this.score.update(s => s + (isDiving ? e.divePoints : this.DEFS[e.type].points));
          if (e.type === 'boss') {
            const keys = Object.keys(this.POWER_UP_DEFS);
            const type = keys[Math.floor(Math.random() * keys.length)];
            const def  = this.POWER_UP_DEFS[type];
            this.powerUps.push({ x: e.x + e.w/2 - 14, y: e.y, w: 28, h: 28, speed: 1.5, type, color: def.color, label: def.label });
          }
          this.enemies.splice(i, 1);
        } else {
          this.score.update(s => s + 50);
        }
        return false;
      }
      return true;
    });
  }

  updateEnemyBullets() {
    this.enemyBullets = this.enemyBullets.filter(b => {
      b.x += b.dx; b.y += b.dy;
      if (b.y > this.gameHeight || b.x < -10 || b.x > this.gameWidth + 10) return false;
      if (this.hits(b.x-3, b.y-3, 6, 6, this.playerX, this.PLAYER_Y, this.PLAYER_W, this.PLAYER_H)) {
        this.playerHit(); return false;
      }
      return true;
    });
  }

  playerHit() {
    if (this.activePowerUp === 'shield') { this.activePowerUp = null; this.powerUpTimer = 0; return; }
    if (this.lives() <= 1) { this.endGame(); return; }
    this.lives.update(l => l - 1);
    if (this.tractorBeam) this.tractorBeam.captureTimer = 0;
  }

  hits(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): boolean {
    return ax < bx+bw && ax+aw > bx && ay < by+bh && ay+ah > by;
  }

  debugLog() {
    const stateCounts = { waiting: 0, entering: 0, formation: 0, diving: 0, returning: 0 };
    for (const e of this.enemies) stateCounts[e.state]++;
    console.log('=== GALAGA DEBUG ===');
    console.log(`Level: ${this.level()}  Lives: ${this.lives()}  Score: ${this.score()}`);
    console.log(`allEntered: ${this.allEntered}  stuckTimer: ${this.stuckTimer}  diveTimer: ${this.diveTimer}  nextDiveAt: ${this.nextDiveAt}`);
    console.log(`formationOffsetX: ${this.formationOffsetX.toFixed(1)}  formationDir: ${this.formationDir}  formationSpeed: ${this.formationSpeed}`);
    console.log(`activePowerUp: ${this.activePowerUp}  powerUpTimer: ${this.powerUpTimer}`);
    console.log(`Enemy count: ${this.enemies.length}  States:`, stateCounts);
    console.log(`Bullets: ${this.bullets.length}  EnemyBullets: ${this.enemyBullets.length}  PowerUps: ${this.powerUps.length}`);
    console.log(`TractorBeam: ${this.tractorBeam ? JSON.stringify(this.tractorBeam) : 'null'}`);
    console.log('--- Enemies ---');
    for (const e of this.enemies) {
      const offscreen = e.x + e.w < 0 || e.x > this.gameWidth || e.y + e.h < 0 || e.y > this.gameHeight;
      console.log(
        `id:${e.id} ${e.type} [${e.state}] ` +
        `pos:(${e.x.toFixed(0)},${e.y.toFixed(0)}) home:(${e.homeX},${e.homeY}) ` +
        `t:${e.t.toFixed(3)} spd:${e.speed.toFixed(4)} hp:${e.health}` +
        (offscreen ? ' *** OFF-SCREEN ***' : '')
      );
    }
    console.log('===================');
  }

  checkStuck() {
    if (!this.allEntered || this.enemies.length === 0) { this.stuckTimer = 0; return; }
    const anyOnScreen = this.enemies.some(e =>
      (e.state === 'formation' || e.state === 'entering') &&
      e.x + e.w > 0 && e.x < this.gameWidth
    );
    if (anyOnScreen) { this.stuckTimer = 0; return; }
    this.stuckTimer++;
    if (this.stuckTimer === 120) this.debugLog();
    if (this.stuckTimer >= 480) {
      this.stuckTimer = 0;
      this.tractorBeam = null;
      this.formationOffsetX = 0;
      this.formationDir = 1;
      for (const e of this.enemies) {
        e.x = e.homeX; e.y = e.homeY; e.state = 'formation';
      }
    }
  }

  nextLevel() {
    this.level.update(l => l + 1);
    this.bullets = []; this.enemyBullets = []; this.tractorBeam = null; this.powerUps = [];
    this.formationOffsetX = 0; this.formationDir = 1;
    this.formationSpeed = 0.45 + (this.level() - 1) * 0.07;
    this.diveTimer = 0; this.nextDiveAt = Math.max(60, 150 - this.level() * 8);
    this.allEntered = false; this.stuckTimer = 0;
    this.megaBomb = null; this.megaBombSpawned = false;
    this.explosionActive = false; this.explosionTimer = 0;
    this.playerX = (this.gameWidth - this.PLAYER_W) / 2;
    this.buildFormation();
  }

  endGame() {
    this.gameOver.set(true);
    this.gameCount++;
    this.sessionHistory.unshift({ gameNumber: this.gameCount, score: this.score(), level: this.level(), time: new Date().toLocaleTimeString() });
  }

  restartGame() { if (this.gameLoop) cancelAnimationFrame(this.gameLoop); this.initGame(); }

  bz(t: number, p: [number,number,number,number]): number {
    const mt = 1-t;
    return mt*mt*mt*p[0] + 3*mt*mt*t*p[1] + 3*mt*t*t*p[2] + t*t*t*p[3];
  }

  // ── Template helpers ───────────────────────────────────
  enemyFill(e: Enemy): string {
    if (e.hitFlash > 0) return '#ffffff';
    if (e.type === 'boss' && e.health < e.maxHealth) return '#ff8800';
    return this.DEFS[e.type].color;
  }
  enemyShadow(e: Enemy): string { const c = this.enemyFill(e); return `0 0 10px ${c}, 0 0 20px ${c}`; }
  enemyClip(type: EnemyType): string {
    if (type === 'bee')       return 'polygon(50% 0%, 100% 40%, 80% 100%, 20% 100%, 0% 40%)';
    if (type === 'butterfly') return 'polygon(20% 0%, 80% 0%, 100% 50%, 80% 100%, 20% 100%, 0% 50%)';
    return 'polygon(50% 0%, 90% 25%, 100% 65%, 70% 100%, 30% 100%, 0% 65%, 10% 25%)';
  }
  beamActive():  boolean { return !!this.tractorBeam; }
  beamWarning(): boolean { return !!this.tractorBeam && this.tractorBeam.phase === 'warning'; }
  beamX():    number { return this.tractorBeam?.x    ?? 0; }
  beamTopY(): number { return this.tractorBeam?.topY ?? 0; }
  livesArray(): number[] { return Array(this.lives()).fill(0); }
  getBestScore(): number { return this.sessionHistory.length ? Math.max(...this.sessionHistory.map(r => r.score)) : 0; }
  shieldActive():  boolean { return this.activePowerUp === 'shield'; }
  powerUpName():   string  { return this.activePowerUp ? (this.POWER_UP_DEFS[this.activePowerUp]?.name  ?? '') : ''; }
  powerUpColor():  string  { return this.activePowerUp ? (this.POWER_UP_DEFS[this.activePowerUp]?.color ?? '#fff') : '#fff'; }
  powerUpSeconds(): number { return Math.ceil(this.powerUpTimer / 60); }
}
