// Balancing-Simulation: simuliert aktive Spieler und gibt aus, wann sie die Meilensteine erreichen.
// Aufruf:  node infinite-roll/tools/simulate.js [runs] [maxHours]
const L = require("../logic.js");

const RUNS = Number(process.argv[2]) || 10;
const MAX_HOURS = Number(process.argv[3]) || 200;
const CLICK_EFFICIENCY = 0.8; // echter Spieler klickt nicht exakt beim Cooldown-Ende
const UPGRADE_KEYS = ["luck", "multi", "speed", "auto", "autoSpeed"];

// Seed-basierter Zufallsgenerator (mulberry32), damit Ergebnisse reproduzierbar sind.
function rngFrom(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Strategie: immer das günstigste bezahlbare Upgrade kaufen, Rebirth sobald möglich.
function buyGreedy(s) {
  for (;;) {
    let best = null, bestCost = Infinity;
    for (const k of UPGRADE_KEYS) {
      const c = L.upgradeCost(k, s);
      if (c < bestCost) { bestCost = c; best = k; }
    }
    if (!best || s.currency < bestCost) return;
    L.buyUpgrade(s, best);
  }
}

function simulate(seed, maxHours = MAX_HOURS) {
  const rng = rngFrom(seed);
  const s = L.newState();
  const ev = { firstUpgrade: null, auto: null, rebirths: [] };
  let t = 0, nextManual = 0, nextAuto = Infinity;
  const end = maxHours * 3600;
  while (t < end && s.rebirths < L.maxRebirths()) {
    const manual = nextManual <= nextAuto;
    t = manual ? nextManual : nextAuto;
    L.performRoll(s, rng);
    if (manual) nextManual = t + L.cooldown(s.levels.speed) / CLICK_EFFICIENCY;
    else nextAuto = t + L.autoInterval(s.levels.autoSpeed);
    const before = s.upgradesBought, hadAuto = s.autoOwned;
    buyGreedy(s);
    if (ev.firstUpgrade === null && s.upgradesBought > before) ev.firstUpgrade = t;
    if (!hadAuto && s.autoOwned) {
      if (ev.auto === null) ev.auto = t;
      nextAuto = t + L.autoInterval(s.levels.autoSpeed);
    }
    if (L.canRebirth(s)) {
      L.doRebirth(s);
      ev.rebirths.push(t);
      nextAuto = Infinity;
    }
  }
  return ev;
}

const median = (a) => { const b = a.filter((x) => x != null).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
const fmt = (sec) => {
  if (sec == null) return "   -   ";
  if (sec < 60) return sec.toFixed(1) + " s";
  if (sec < 3600) return (sec / 60).toFixed(1) + " min";
  return (sec / 3600).toFixed(2) + " h";
};

function runAll(runs, maxHours) {
  const results = [];
  for (let i = 0; i < runs; i++) results.push(simulate(1234 + i * 7919, maxHours));
  return results;
}

function report(results, maxHours = MAX_HOURS) {
  const runs = results.length;
  console.log(`${runs} simulierte Spieler, max. ${maxHours} h aktives Spielen. Alle Werte sind Mediane.\n`);
  console.log("Erstes Upgrade:", fmt(median(results.map((r) => r.firstUpgrade))));
  console.log("Auto-Roller:   ", fmt(median(results.map((r) => r.auto))));
  console.log("\nRebirth | Meilenstein | Zeitpunkt   | Dauer dieses Runs");
  const maxR = Math.max(...results.map((r) => r.rebirths.length));
  for (let r = 0; r < maxR; r++) {
    const done = results.filter((x) => x.rebirths.length > r);
    const at = median(done.map((x) => x.rebirths[r]));
    const dur = median(done.map((x) => x.rebirths[r] - (r ? x.rebirths[r - 1] : 0)));
    if (r < 10 || r % 5 === 4 || r === maxR - 1)
      console.log(`${String(r + 1).padStart(7)} | ${L.format(L.rebirthRequirement(r)).padStart(11)} | ${fmt(at).padStart(11)} | ${fmt(dur).padStart(9)}  (${done.length}/${runs})`);
  }
}

module.exports = { simulate, runAll, report, median };
if (require.main === module) report(runAll(RUNS, MAX_HOURS));
