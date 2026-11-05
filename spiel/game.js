"use strict";

// ---------- Setup ----------
const cvs = document.getElementById("c");
const ctx = cvs.getContext("2d");
const $ = (id) => document.getElementById(id);

let W = 0, H = 0;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  cvs.width = Math.round(W * dpr);
  cvs.height = Math.round(H * dpr);
  cvs.style.width = W + "px";
  cvs.style.height = H + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

// localStorage kann in privaten Tabs fehlen -> immer absichern
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
  catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* egal */ }
}

// ---------- Sound (Web Audio, keine Dateien nötig) ----------
let audio = null;
let soundOn = load("pr_sound", true);

function beep(freq, dur, type = "sine", vol = 0.15) {
  if (!soundOn || !audio) return;
  const t = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain).connect(audio.destination);
  osc.start(t);
  osc.stop(t + dur);
}
function vibrate(ms) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

// ---------- Spielzustand ----------
const HUD_SAFE = 80;     // oben Platz für die Anzeige lassen
let state = "menu";      // "menu" | "play" | "over"
let gameTime = 0;        // eigene Uhr in Sekunden, läuft nur im Spiel
let nextSpawn = 0;
let pads = [];
let particles = [];
let texts = [];
let score, lives, combo, maxCombo, hits, shake;
let best = load("pr_best", 0);

// Schwierigkeit steigt mit der Spielzeit t (Sekunden)
const spawnInterval = (t) => Math.max(0.34, 1.0 - t * 0.012);
const padLifetime  = (t) => Math.max(0.75, 1.8 - t * 0.014);
const trapChance   = (t) => Math.min(0.3, 0.06 + t * 0.004);
const maxPads      = (t) => Math.min(6, 2 + Math.floor(t / 12));

function multiplier() {
  return Math.min(5, 1 + Math.floor(combo / 5));
}

function resetGame() {
  score = 0; lives = 3; combo = 0; maxCombo = 0; hits = 0; shake = 0;
  gameTime = 0; nextSpawn = 0.4;
  pads = []; particles = []; texts = [];
  updateHud();
}

function spawnPad() {
  const r = Math.max(30, Math.min(W, H) * 0.09);
  const rnd = Math.random();
  const trap = trapChance(gameTime);
  const type = rnd < trap ? "trap" : rnd < trap + 0.07 ? "gold" : "hit";

  // Bis zu 15 Versuche, eine freie Stelle zu finden
  for (let i = 0; i < 15; i++) {
    const x = r + 10 + Math.random() * (W - 2 * r - 20);
    const y = HUD_SAFE + r + Math.random() * (H - HUD_SAFE - 2 * r - 20);
    const free = pads.every((p) => Math.hypot(p.x - x, p.y - y) > p.r + r + 12);
    if (free) {
      const life = type === "gold" ? padLifetime(gameTime) * 0.75 : padLifetime(gameTime);
      pads.push({ x, y, r, type, born: gameTime, life, pop: 0 });
      return;
    }
  }
}

// ---------- Eingabe ----------
cvs.addEventListener("pointerdown", (e) => {
  if (state !== "play") return;
  e.preventDefault();
  const x = e.clientX, y = e.clientY;

  // Von oben nach unten suchen (zuletzt gezeichnet = oben), etwas Toleranz für Finger
  for (let i = pads.length - 1; i >= 0; i--) {
    const p = pads[i];
    if (Math.hypot(p.x - x, p.y - y) <= p.r * 1.2) {
      pads.splice(i, 1);
      hitPad(p);
      return;
    }
  }
  // Ins Leere geschlagen
  if (combo > 0) floatText(x, y, "Combo weg", "#9aa0ab");
  combo = 0;
  beep(140, 0.08, "triangle", 0.08);
  updateHud();
});

function hitPad(p) {
  if (p.type === "trap") {
    damage(p.x, p.y, "Konter!");
    return;
  }
  const progress = (gameTime - p.born) / p.life;      // 0 = frisch, 1 = abgelaufen
  const speedBonus = 1 + (1 - progress);              // schneller treffen = mehr Punkte
  const base = p.type === "gold" ? 50 : 10;
  combo++;
  hits++;
  maxCombo = Math.max(maxCombo, combo);
  const pts = Math.round(base * speedBonus * multiplier());
  score += pts;

  const color = p.type === "gold" ? "#f5b70a" : "#3b82f6";
  burst(p.x, p.y, color, p.type === "gold" ? 26 : 14);
  floatText(p.x, p.y, "+" + pts, color);
  beep(p.type === "gold" ? 880 : 520 + Math.min(combo, 20) * 15, 0.09, "square", 0.08);
  vibrate(12);
  updateHud();
}

function damage(x, y, label) {
  lives--;
  combo = 0;
  shake = 0.35;
  burst(x, y, "#ef4444", 20);
  floatText(x, y, label, "#ef4444");
  beep(90, 0.3, "sawtooth", 0.18);
  vibrate([60, 40, 60]);
  updateHud();
  if (lives <= 0) endGame();
}

// ---------- Effekte ----------
function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 120 + Math.random() * 260;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5, t: 0, color });
  }
}
function floatText(x, y, txt, color) {
  texts.push({ x, y, txt, color, t: 0 });
}

// ---------- HUD & Screens ----------
function updateHud() {
  $("score").textContent = score;
  const m = multiplier();
  $("combo").textContent = "x" + m + (combo ? " (" + combo + ")" : "");
  $("combo").classList.toggle("hot", m > 1);
  $("lives").textContent = "❤".repeat(Math.max(0, lives)) + "♡".repeat(Math.max(0, 3 - lives));
}

function show(id) {
  ["start", "over"].forEach((s) => $(s).classList.toggle("hidden", s !== id));
  $("hud").classList.toggle("hidden", id !== null);
}

function startGame() {
  if (!audio) {
    // AudioContext darf erst nach einer Nutzeraktion erstellt werden
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { audio = null; }
  }
  if (audio && audio.state === "suspended") audio.resume();
  resetGame();
  state = "play";
  show(null);
}

function endGame() {
  state = "over";
  const isBest = score > best;
  if (isBest) { best = score; save("pr_best", best); }
  $("finalScore").textContent = score;
  $("bestOver").textContent = best;
  $("newBest").classList.toggle("hidden", !isBest);
  $("stats").textContent =
    "Treffer: " + hits + " · Beste Combo: " + maxCombo + " · Zeit: " + Math.floor(gameTime) + " s";
  // kurz warten, damit man nicht aus Versehen sofort "Nochmal" tippt
  setTimeout(() => show("over"), 600);
}

function updateSoundBtn() {
  $("btnSound").textContent = soundOn ? "🔊 Ton an" : "🔇 Ton aus";
}

$("btnStart").addEventListener("click", startGame);
$("btnAgain").addEventListener("click", startGame);
$("btnSound").addEventListener("click", () => {
  soundOn = !soundOn;
  save("pr_sound", soundOn);
  updateSoundBtn();
});
$("bestStart").textContent = best;
updateSoundBtn();

// ---------- Game Loop ----------
let last = performance.now();

function update(dt) {
  if (state === "play") {
    gameTime += dt;

    if (gameTime >= nextSpawn) {
      if (pads.length < maxPads(gameTime)) spawnPad();
      nextSpawn = gameTime + spawnInterval(gameTime) * (0.7 + Math.random() * 0.6);
    }

    // Abgelaufene Pratzen prüfen
    for (let i = pads.length - 1; i >= 0; i--) {
      const p = pads[i];
      p.pop = Math.min(1, p.pop + dt * 8);
      if (gameTime - p.born >= p.life) {
        pads.splice(i, 1);
        if (p.type === "hit") {
          damage(p.x, p.y, "Zu langsam");
          if (state !== "play") break;
        } else if (p.type === "trap") {
          score += 5;
          floatText(p.x, p.y, "Ausgewichen +5", "#9aa0ab");
          updateHud();
        }
        // goldene Pratzen verschwinden ohne Strafe
      }
    }
  }

  particles.forEach((q) => {
    q.t += dt;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    q.vx *= 0.92;
    q.vy *= 0.92;
  });
  particles = particles.filter((q) => q.t < q.life);

  texts.forEach((t) => { t.t += dt; t.y -= 50 * dt; });
  texts = texts.filter((t) => t.t < 0.8);

  shake = Math.max(0, shake - dt);
}

function drawPad(p) {
  const progress = Math.min(1, (gameTime - p.born) / p.life);
  const r = p.r * (0.6 + 0.4 * easeOutBack(p.pop));
  const colors = { hit: "#3b82f6", gold: "#f5b70a", trap: "#ef4444" };
  const c = colors[p.type];

  // Timer-Ring
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.arc(p.x, p.y, r + 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = c;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - progress));
  ctx.stroke();

  // Pratze
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
  // Glanzlicht oben links (auf die volle Farbe gelegt)
  const g = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.35, 0, p.x - r * 0.35, p.y - r * 0.35, r);
  g.addColorStop(0, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fill();

  // Innenmarkierung
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  if (p.type === "trap") {
    const s = r * 0.38;
    ctx.beginPath();
    ctx.moveTo(p.x - s, p.y - s); ctx.lineTo(p.x + s, p.y + s);
    ctx.moveTo(p.x + s, p.y - s); ctx.lineTo(p.x - s, p.y + s);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 0.45, 0, Math.PI * 2);
    ctx.stroke();
    if (p.type === "gold") {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function easeOutBack(x) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function draw() {
  ctx.save();
  ctx.fillStyle = "#14161c";
  ctx.fillRect(0, 0, W, H);

  if (shake > 0) {
    const s = shake * 30;
    ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
  }

  // Ring-Boden als Hintergrund
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 2;
  for (let i = 1; i <= 4; i++) {
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, Math.min(W, H) * 0.12 * i, 0, Math.PI * 2);
    ctx.stroke();
  }

  pads.forEach(drawPad);

  particles.forEach((q) => {
    ctx.globalAlpha = 1 - q.t / q.life;
    ctx.fillStyle = q.color;
    ctx.beginPath();
    ctx.arc(q.x, q.y, 4, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  ctx.textAlign = "center";
  ctx.font = "700 20px system-ui, sans-serif";
  texts.forEach((t) => {
    ctx.globalAlpha = 1 - t.t / 0.8;
    ctx.fillStyle = t.color;
    // Text nicht über den Bildschirmrand hinaus zeichnen
    const half = ctx.measureText(t.txt).width / 2 + 8;
    ctx.fillText(t.txt, Math.min(W - half, Math.max(half, t.x)), t.y - 10);
  });
  ctx.globalAlpha = 1;

  // roter Rand bei Treffer
  if (shake > 0) {
    ctx.strokeStyle = "rgba(239,68,68," + shake * 2 + ")";
    ctx.lineWidth = 16;
    ctx.strokeRect(-20, -20, W + 40, H + 40);
  }
  ctx.restore();
}

function loop(now) {
  // dt begrenzen: nach Tab-Wechsel springt das Spiel sonst nach vorn
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---------- Offline-Unterstützung ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
