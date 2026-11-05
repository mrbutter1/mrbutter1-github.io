// Reine Spiellogik ohne DOM: Formeln, Würfeln, Seltenheit, Zahlenformat, Spielstand.
// Läuft im Browser (window.Logic) und in Node (tools/simulate.js).
(function (root, factory) {
  if (typeof module !== "undefined") module.exports = factory(require("./config.js"));
  else root.Logic = factory(CONFIG); // CONFIG ist eine globale Konstante aus config.js
})(this, function (C) {
  const MAX = C.maxValue;
  const MAX_LOG = Math.log10(MAX);
  const SAVE_VERSION = 1;
  const U = C.upgrades;

  // ---------- Spielstand ----------
  function newState() {
    return {
      version: SAVE_VERSION,
      currency: 0,
      runEarned: 0, // seit dem letzten Rebirth verdient (für den Meilenstein)
      totalEarned: 0, // insgesamt verdient
      bestRoll: 0,
      lastRoll: 0,
      lastRarity: 1,
      rarest: 1, // kleinste Wahrscheinlichkeit, die je gewürfelt wurde
      rolls: 0,
      megaRolls: 0,
      rebirths: 0,
      playTime: 0, // Sekunden
      levels: { luck: 0, multi: 0, speed: 0, autoSpeed: 0 },
      autoOwned: false,
      upgradesBought: 0,
      achievements: {}, // id -> Zeitstempel
      settings: { vibration: true, autoEnabled: true },
    };
  }

  // Endliche Zahl im erlaubten Bereich erzwingen (schützt vor NaN/Infinity in Saves).
  function num(v, def, min = 0, max = MAX) {
    v = Number(v);
    if (!Number.isFinite(v)) return def;
    return Math.min(max, Math.max(min, v));
  }
  function int(v, def, max = 1e6) {
    return Math.floor(num(v, def, 0, max));
  }

  // Geladenen (evtl. alten oder kaputten) Spielstand reparieren und migrieren.
  function sanitize(raw) {
    const s = newState();
    if (!raw || typeof raw !== "object") return s;
    // Hier kämen Migrationen hin, z. B. if (raw.version === 1) {...}
    s.currency = num(raw.currency, 0);
    s.runEarned = num(raw.runEarned, 0);
    s.totalEarned = num(raw.totalEarned, 0);
    s.bestRoll = num(raw.bestRoll, 0);
    s.lastRoll = num(raw.lastRoll, 0);
    s.lastRarity = num(raw.lastRarity, 1, 0, 1);
    s.rarest = num(raw.rarest, 1, 0, 1);
    s.rolls = int(raw.rolls, 0, 1e15);
    s.megaRolls = int(raw.megaRolls, 0, 1e15);
    s.rebirths = int(raw.rebirths, 0, maxRebirths());
    s.playTime = num(raw.playTime, 0, 0, 1e12);
    s.upgradesBought = int(raw.upgradesBought, 0, 1e9);
    const lv = raw.levels || {};
    for (const k of Object.keys(s.levels)) s.levels[k] = int(lv[k], 0, 10000);
    s.autoOwned = !!raw.autoOwned;
    if (raw.achievements && typeof raw.achievements === "object") {
      for (const [k, v] of Object.entries(raw.achievements)) s.achievements[k] = num(v, Date.now(), 0, 1e15);
    }
    const st = raw.settings || {};
    s.settings.vibration = st.vibration !== false;
    s.settings.autoEnabled = st.autoEnabled !== false;
    return s;
  }

  // ---------- Abgeleitete Werte ----------
  const luckAtLevel = (lvl) => 1 + U.luck.perLevel * Math.pow(lvl, U.luck.exponent);
  const upgradeLuck = (s) => luckAtLevel(s.levels.luck);
  const rebirthMult = (r) => 1 + C.rebirth.luckPerRebirth * Math.pow(r, C.rebirth.exponent);
  const effectiveLuck = (s) => upgradeLuck(s) * rebirthMult(s.rebirths);
  const rollCount = (s) => 1 + U.multi.perLevel * s.levels.multi;
  const cooldown = (lvl) => Math.max(U.speed.min, C.roll.baseCooldown * Math.pow(U.speed.factor, lvl));
  const autoInterval = (lvl) => Math.max(U.autoSpeed.min, U.auto.baseInterval * Math.pow(U.autoSpeed.factor, lvl));

  // Wert eines Upgrades bei einem bestimmten Level (für "aktuell -> nächstes").
  function upgradeValue(key, s, lvl) {
    switch (key) {
      case "luck": return luckAtLevel(lvl) * rebirthMult(s.rebirths);
      case "multi": return 1 + U.multi.perLevel * lvl;
      case "speed": return cooldown(lvl);
      case "autoSpeed": return autoInterval(lvl);
    }
  }

  // Kosten des nächsten Levels; Infinity = MAX (nicht mehr kaufbar).
  function upgradeCost(key, s) {
    if (key === "auto") return s.autoOwned ? Infinity : U.auto.cost;
    if (key === "speed" && cooldown(s.levels.speed) <= U.speed.min) return Infinity;
    if (key === "autoSpeed") {
      if (!s.autoOwned) return Infinity;
      if (autoInterval(s.levels.autoSpeed) <= U.autoSpeed.min) return Infinity;
    }
    const u = U[key];
    // Bei Luck und Multi-Roll steigt der Kostenfaktor mit dem Rebirth-Multiplikator.
    // Sonst würde der Multiplikator Luck doppelt verbilligen (mehr Währung UND günstigere Upgrades)
    // und spätere Runs wären nach Sekunden vorbei.
    const exp = s.levels[key] * (u.scaleWithRebirth ? rebirthMult(s.rebirths) : 1);
    const logC = Math.log10(u.baseCost) + exp * Math.log10(u.growth);
    return logC > MAX_LOG ? Infinity : Math.ceil(Math.pow(10, logC));
  }

  function buyUpgrade(s, key) {
    const cost = upgradeCost(key, s);
    if (!Number.isFinite(cost) || s.currency < cost) return false;
    s.currency -= cost;
    if (key === "auto") s.autoOwned = true;
    else s.levels[key]++;
    s.upgradesBought++;
    return true;
  }

  // ---------- Würfeln ----------
  // Pareto: P(X >= x) = x^(-a) mit a = 1 / Luck.
  // Inverse Transformation: x = U^(-1/a)  ->  log10(x) = -log10(U) * Luck.
  function rollOnce(luck, rng) {
    return rollBest(luck, 1, rng);
  }

  // Bester von n Würfen mit nur EINER Zufallszahl:
  // Der höchste Wurf gehört zum kleinsten U. Das Minimum von n Gleichverteilungen ist
  // u_min = 1 - (1 - V)^(1/n)  (V gleichverteilt). Exakt dieselbe Verteilung wie n einzelne Würfe.
  function rollBest(luck, count, rng) {
    const v = 1 - rng(); // (0, 1]
    const u = -Math.expm1(Math.log1p(-v) / count); // (0, 1]
    if (u <= 0) return MAX;
    const lx = -Math.log10(u) * luck;
    if (lx >= MAX_LOG) return MAX;
    return Math.max(1, Math.floor(Math.pow(10, lx)));
  }

  // Wahrscheinlichkeit, dass der beste von n Würfen >= x ist.
  // Über log1p/expm1 berechnet, damit sehr kleine Wahrscheinlichkeiten nicht auf 0 runden.
  function rarity(x, luck, n) {
    if (x <= 1) return 1;
    const p1 = Math.pow(10, -Math.log10(x) / luck);
    if (p1 >= 1) return 1;
    return -Math.expm1(n * Math.log1p(-p1));
  }

  // Führt einen Wurf aus und bucht ihn. Gibt Ergebnis + Seltenheit zurück.
  function performRoll(s, rng) {
    const luck = effectiveLuck(s);
    const n = rollCount(s);
    const value = rollBest(luck, n, rng);
    const p = rarity(value, luck, n);
    s.currency = Math.min(MAX, s.currency + value);
    s.runEarned = Math.min(MAX, s.runEarned + value);
    s.totalEarned = Math.min(MAX, s.totalEarned + value);
    s.rolls++;
    s.lastRoll = value;
    s.lastRarity = p;
    if (value > s.bestRoll) s.bestRoll = value;
    if (p < s.rarest) s.rarest = p;
    const mega = p < C.roll.megaThreshold;
    if (mega) s.megaRolls++;
    return { value, p, mega };
  }

  // ---------- Rebirth ----------
  // Über den Zehnerlogarithmus berechnet, damit z. B. 1e48 exakt 1e48 ist (keine Rundungsfehler).
  const rebirthRequirement = (r) =>
    Number("1e" + Math.round(Math.log10(C.rebirth.firstRequirement) + r * Math.log10(C.rebirth.requirementFactor)));
  function maxRebirths() {
    // Letzter Meilenstein, der noch <= Obergrenze liegt.
    const steps = Math.log10(MAX / C.rebirth.firstRequirement) / Math.log10(C.rebirth.requirementFactor);
    return Math.floor(steps + 1e-9) + 1;
  }
  const canRebirth = (s) => s.rebirths < maxRebirths() && s.runEarned >= rebirthRequirement(s.rebirths) * (1 - 1e-12);

  function doRebirth(s) {
    if (!canRebirth(s)) return false;
    s.rebirths++;
    s.currency = 0;
    s.runEarned = 0;
    s.levels = { luck: 0, multi: 0, speed: 0, autoSpeed: 0 };
    s.autoOwned = false;
    s.lastRoll = 0;
    s.lastRarity = 1;
    return true;
  }

  // ---------- Zahlenformat ----------
  // 999 | 1.5k | 23.4m | 1.5b | 7t | danach aa, ab, ac ...
  const BASE_SUFFIX = ["", "k", "m", "b", "t"];
  function suffix(i) {
    if (i < BASE_SUFFIX.length) return BASE_SUFFIX[i];
    const n = i - BASE_SUFFIX.length; // 0 -> aa
    let s = String.fromCharCode(97 + (n % 26));
    let rest = Math.floor(n / 26);
    s = String.fromCharCode(97 + (rest % 26)) + s;
    rest = Math.floor(rest / 26);
    while (rest > 0) { // nur theoretisch nötig, falls die Obergrenze erhöht wird
      s = String.fromCharCode(96 + (rest % 26 || 26)) + s;
      rest = Math.floor((rest - 1) / 26);
    }
    return s;
  }

  // Abgeschnitten statt gerundet, damit nie mehr angezeigt wird als tatsächlich vorhanden ist.
  function format(x) {
    if (!Number.isFinite(x)) return "MAX";
    if (x < 1000) return String(Math.floor(Math.max(0, x)));
    let i = Math.floor(Math.log10(x) / 3);
    let m = x / Math.pow(10, i * 3);
    if (m < 1) { i--; m *= 1000; } // Rundungsfehler von log10 abfangen
    if (m >= 1000) { i++; m /= 1000; }
    const decimals = m >= 100 ? 0 : m >= 10 ? 1 : 2;
    const f = Math.pow(10, decimals);
    let t = Math.floor(m * f + 1e-9) / f;
    if (t >= 1000) { i++; t = 1; }
    return String(parseFloat(t.toFixed(decimals))) + suffix(i);
  }

  // "1 in 4.2k"
  function formatOdds(p) {
    if (p <= 0) return "1 in MAX";
    const odds = 1 / p;
    if (odds < 10) return "1 in " + parseFloat(odds.toFixed(1));
    return "1 in " + (odds < 1000 ? Math.round(odds) : format(odds));
  }

  return {
    CONFIG: C, MAX, SAVE_VERSION,
    newState, sanitize,
    upgradeLuck, rebirthMult, effectiveLuck, rollCount, cooldown, autoInterval,
    upgradeValue, upgradeCost, buyUpgrade,
    rollOnce, rollBest, rarity, performRoll,
    rebirthRequirement, maxRebirths, canRebirth, doRebirth,
    format, formatOdds,
  };
});
