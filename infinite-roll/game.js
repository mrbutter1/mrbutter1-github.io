// UI, Spielschleife, Animationen, Speichern.
(function () {
  "use strict";
  const L = Logic;
  const SAVE_KEY = "infinite-roll-save";
  const $ = (id) => document.getElementById(id);

  let s = load();
  let lastManual = -Infinity; // Zeitpunkt des letzten manuellen Wurfs (Sekunden)
  let autoTimer = 0;
  let activeTab = "upgrades";

  // ---------- Seltenheitsstufen (nur Optik) ----------
  const TIERS = [
    { min: 0.1, name: "Common", color: "--r-common" },
    { min: 0.01, name: "Uncommon", color: "--r-uncommon" },
    { min: 1e-3, name: "Rare", color: "--r-rare" },
    { min: 1e-4, name: "Epic", color: "--r-epic" },
    { min: 1e-6, name: "Legendary", color: "--r-legendary" },
    { min: 0, name: "Mythic", color: "--r-mythic" },
  ];
  const tierOf = (p) => TIERS.find((t) => p >= t.min) || TIERS[TIERS.length - 1];
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // ---------- Speichern / Laden ----------
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return L.sanitize(raw ? JSON.parse(raw) : null);
    } catch (e) {
      return L.newState();
    }
  }
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) { /* Speicher voll/gesperrt */ }
  }

  // ---------- Würfeln ----------
  function now() { return performance.now() / 1000; }

  function manualRoll() {
    if (!$("modal").classList.contains("hidden")) return;
    const t = now();
    if (t - lastManual < L.cooldown(s.levels.speed)) return;
    lastManual = t;
    doRoll(false);
  }

  function doRoll(isAuto) {
    const firstMax = !s.achievements.max;
    const ev = L.performRoll(s, Math.random);
    showResult(ev, isAuto);
    if (ev.value >= L.MAX && firstMax) showMega(ev, true);
    else if (ev.mega) showMega(ev, false);
    checkAchievements();
    bumpBalance();
  }

  // Ergebnis anzeigen. Manuelle Würfe: kurze "Durchlauf"-Animation; Auto-Würfe: nur kleiner Pop.
  let scrambleTimer = null;
  function showResult(ev, isAuto) {
    const el = $("result");
    const tier = tierOf(ev.p);
    $("resultCard").style.setProperty("--tier", `var(${tier.color})`);
    clearInterval(scrambleTimer);
    const finish = () => {
      el.textContent = L.format(ev.value);
      $("odds").innerHTML = `<b>${tier.name}</b> · ${L.formatOdds(ev.p)}`;
      restartAnim(el, "pop");
    };
    if (isAuto) return finish();
    // Durchlauf: ein paar zufällige Zahlen in der Größenordnung des Ergebnisses
    const mag = Math.max(1, Math.log10(Math.max(ev.value, 10)));
    let n = 0;
    restartAnim(el, "spin");
    scrambleTimer = setInterval(() => {
      if (++n >= 5) { clearInterval(scrambleTimer); return finish(); }
      el.textContent = L.format(Math.pow(10, Math.random() * mag));
    }, 50);
    burstAt($("result"), cssVar(tier.color), 10, 0.6);
  }

  function restartAnim(el, cls) {
    el.classList.remove("spin", "pop");
    void el.offsetWidth; // Reflow erzwingen, damit die Animation neu startet
    el.classList.add(cls);
  }

  function bumpBalance() {
    const el = $("currency");
    el.classList.add("bump");
    clearTimeout(bumpBalance.t);
    bumpBalance.t = setTimeout(() => el.classList.remove("bump"), 120);
  }

  // ---------- Mega-Animation ----------
  let megaTimer = null;
  function showMega(ev, isMax) {
    const tier = tierOf(ev.p);
    const color = isMax ? "--r-mythic" : tier.color;
    const m = $("mega");
    m.style.setProperty("--tier", `var(${color})`);
    m.classList.toggle("max", isMax);
    $("megaTitle").textContent = isMax ? "MAX ROLL" : "MEGA ROLL!";
    $("megaValue").textContent = L.format(ev.value);
    $("megaOdds").textContent = isMax
      ? "You reached the limit of Infinite Roll!"
      : `${tier.name} · ${L.formatOdds(ev.p)}`;
    // Neu einblenden, damit die Animation auch bei zwei Megas hintereinander neu startet
    m.classList.add("hidden");
    void m.offsetWidth;
    m.classList.remove("hidden");
    const col = cssVar(color);
    burst(window.innerWidth / 2, window.innerHeight * 0.45, col, isMax ? 260 : 140, isMax ? 1.6 : 1.1);
    if (s.settings.vibration && navigator.vibrate) {
      try { navigator.vibrate(isMax ? [80, 60, 80, 60, 300] : [60, 40, 120]); } catch (e) {}
    }
    clearTimeout(megaTimer);
    if (!isMax) megaTimer = setTimeout(hideMega, 2600);
  }
  function hideMega() {
    clearTimeout(megaTimer);
    $("mega").classList.add("hidden");
  }

  // ---------- Partikel ----------
  const canvas = $("fx");
  const ctx = canvas.getContext("2d");
  let particles = [];
  function resizeCanvas() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function burst(x, y, color, count, power) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (120 + Math.random() * 380) * power;
      particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120 * power,
        life: 0, max: 0.7 + Math.random() * 0.8, size: 2 + Math.random() * 3.5,
        color: Math.random() < 0.25 ? "#ffffff" : color,
      });
    }
    if (particles.length > 600) particles = particles.slice(-600);
  }
  function burstAt(el, color, count, power) {
    const r = el.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, color, count, power);
  }
  function stepParticles(dt) {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    if (!particles.length) return;
    particles = particles.filter((p) => (p.life += dt) < p.max);
    for (const p of particles) {
      p.vy += 600 * dt; // Schwerkraft
      p.vx *= 1 - 1.5 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      ctx.globalAlpha = 1 - p.life / p.max;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------- Upgrades ----------
  const fmtLuck = (x) => "x" + (x < 1000 ? x.toFixed(2) : L.format(x));
  const fmtSec = (x) => x.toFixed(2) + "s";
  const UPGRADES = [
    { key: "luck", icon: "🍀",
      cur: () => fmtLuck(L.effectiveLuck(s)),
      next: () => fmtLuck(L.upgradeValue("luck", s, s.levels.luck + 1)) },
    { key: "multi", icon: "🎲",
      cur: () => `${L.rollCount(s)} ${L.rollCount(s) === 1 ? "roll" : "rolls"}`,
      next: () => `${L.upgradeValue("multi", s, s.levels.multi + 1)} rolls` },
    { key: "speed", icon: "⚡",
      cur: () => fmtSec(L.cooldown(s.levels.speed)),
      next: () => fmtSec(L.cooldown(s.levels.speed + 1)) },
    { key: "auto", icon: "🤖", once: true,
      cur: () => (s.autoOwned ? "Active" : "Off"),
      next: () => `every ${fmtSec(CONFIG.upgrades.auto.baseInterval)}` },
    { key: "autoSpeed", icon: "⏱️", locked: () => !s.autoOwned, lockText: "Requires Auto-Roller",
      cur: () => fmtSec(L.autoInterval(s.levels.autoSpeed)),
      next: () => fmtSec(L.autoInterval(s.levels.autoSpeed + 1)) },
  ];

  const upgRefs = {};
  function buildUpgrades() {
    const list = $("upgradeList");
    list.innerHTML = "";
    for (const u of UPGRADES) {
      const cfg = CONFIG.upgrades[u.key];
      const card = document.createElement("div");
      card.className = "card upg";
      card.innerHTML = `
        <div class="upg-icon">${u.icon}</div>
        <div class="upg-body">
          <div class="upg-title">${cfg.name}<span class="upg-lvl"></span></div>
          <div class="upg-desc">${cfg.desc}</div>
          <div class="upg-val"></div>
        </div>
        <button class="buy" type="button"></button>`;
      const btn = card.querySelector(".buy");
      btn.addEventListener("click", () => {
        if (L.buyUpgrade(s, u.key)) {
          if (u.key === "auto") autoTimer = 0;
          burstAt(btn, cssVar("--accent-2"), 14, 0.5);
          checkAchievements();
          updateUI(true);
          save();
        }
      });
      list.appendChild(card);
      upgRefs[u.key] = { card, btn, lvl: card.querySelector(".upg-lvl"), val: card.querySelector(".upg-val") };
    }
  }

  function updateUpgrades() {
    for (const u of UPGRADES) {
      const r = upgRefs[u.key];
      const locked = u.locked && u.locked();
      const cost = L.upgradeCost(u.key, s);
      const maxed = !locked && !Number.isFinite(cost);
      r.card.classList.toggle("locked", !!locked);
      r.lvl.textContent = u.once ? "" : `Lv ${s.levels[u.key]}`;
      let val;
      if (locked) val = `<span class="muted">${u.lockText}</span>`;
      else if (maxed) val = `<span class="next">${u.cur()}</span>`;
      else val = `${u.cur()}<span class="arrow">→</span><span class="next">${u.next()}</span>`;
      if (r.val.innerHTML !== val) r.val.innerHTML = val;
      let label, cls = "buy";
      if (locked) label = "🔒";
      else if (maxed) { label = u.once ? "OWNED" : "MAX"; cls += " max"; }
      else label = `${L.format(cost)}<small>BUY</small>`;
      if (r.btn.innerHTML !== label) r.btn.innerHTML = label;
      r.btn.className = cls;
      r.btn.disabled = locked || maxed || s.currency < cost;
    }
  }

  // ---------- Rebirth ----------
  const rb = {};
  function buildRebirth() {
    $("rebirthPane").innerHTML = `
      <div class="card reb-hero">
        <div class="muted small">Permanent Luck multiplier</div>
        <div class="reb-mult" id="rbMult"></div>
        <div class="muted small" id="rbCount"></div>
      </div>
      <div class="card" id="rbProgressCard">
        <b id="rbGoal"></b>
        <div class="progress"><div id="rbBar"></div></div>
        <div class="muted small" id="rbProgressText"></div>
        <button class="btn primary reb-btn" id="rbBtn" type="button">Rebirth</button>
      </div>
      <div class="card small muted">
        Rebirth resets your balance and all upgrades. In return your Luck multiplier rises permanently.
        Achievements and statistics are kept.
      </div>`;
    for (const id of ["rbMult", "rbCount", "rbGoal", "rbBar", "rbProgressText", "rbBtn"]) rb[id] = $(id);
    rb.rbBtn.addEventListener("click", askRebirth);
  }

  function updateRebirth() {
    const r = s.rebirths;
    rb.rbMult.textContent = fmtLuck(L.rebirthMult(r));
    rb.rbCount.textContent = `${r} / ${L.maxRebirths()} rebirths`;
    if (r >= L.maxRebirths()) {
      rb.rbGoal.textContent = "All rebirths completed 🏁";
      rb.rbBar.style.width = "100%";
      rb.rbProgressText.textContent = "Keep rolling for the Max Roll!";
      rb.rbBtn.disabled = true;
      return;
    }
    const req = L.rebirthRequirement(r);
    // Logarithmischer Fortschritt, sonst sieht man lange gar nichts
    const prog = Math.min(1, Math.log10(1 + s.runEarned) / Math.log10(req));
    rb.rbGoal.textContent = `Next milestone: earn ${L.format(req)}`;
    rb.rbBar.style.width = (prog * 100).toFixed(1) + "%";
    rb.rbProgressText.textContent =
      `Earned this run: ${L.format(s.runEarned)} · Next: ${fmtLuck(L.rebirthMult(r))} → ${fmtLuck(L.rebirthMult(r + 1))}`;
    rb.rbBtn.disabled = !L.canRebirth(s);
  }

  function askRebirth() {
    if (!L.canRebirth(s)) return;
    const r = s.rebirths;
    confirmModal(
      "Rebirth?",
      `<p>Balance and upgrades will be reset.</p>
       <p>Luck multiplier: <b>${fmtLuck(L.rebirthMult(r))}</b> → <b>${fmtLuck(L.rebirthMult(r + 1))}</b></p>`,
      "Rebirth",
      () => {
        if (!L.doRebirth(s)) return;
        autoTimer = 0;
        $("result").textContent = "–";
        $("odds").textContent = "Tap ROLL to start";
        $("resultCard").style.setProperty("--tier", "var(--r-common)");
        burst(window.innerWidth / 2, window.innerHeight / 2, cssVar("--accent-2"), 160, 1.2);
        checkAchievements();
        save();
        updateUI(true);
      }
    );
  }

  // ---------- Achievements ----------
  function checkAchievements() {
    for (const a of ACHIEVEMENTS) {
      if (s.achievements[a.id]) continue;
      if (a.check(s)) {
        s.achievements[a.id] = Date.now();
        toast(a);
        if (activeTab === "achievements") renderAchievements();
      }
    }
  }

  function renderAchievements() {
    const done = ACHIEVEMENTS.filter((a) => s.achievements[a.id]).length;
    $("achCount").textContent = `${done} / ${ACHIEVEMENTS.length}`;
    $("achList").innerHTML = ACHIEVEMENTS.map((a) => {
      const ok = !!s.achievements[a.id];
      return `<div class="ach ${ok ? "done" : "locked"}"><div class="ic">${a.icon}</div>
        <div><b>${a.name}</b><span>${a.desc}</span></div></div>`;
    }).join("");
  }

  // Warteschlange: höchstens 2 Toasts gleichzeitig, damit viele Achievements auf einmal nicht den Bildschirm füllen.
  const toastQueue = [];
  let toastsVisible = 0;
  function toast(a) {
    toastQueue.push(a);
    pumpToasts();
  }
  function pumpToasts() {
    while (toastsVisible < 2 && toastQueue.length) {
      const a = toastQueue.shift();
      const el = document.createElement("div");
      el.className = "toast";
      el.innerHTML = `<div class="ic">${a.icon}</div><div><small>Achievement unlocked</small><b>${a.name}</b></div>`;
      $("toasts").appendChild(el);
      toastsVisible++;
      setTimeout(() => { el.remove(); toastsVisible--; pumpToasts(); }, 3100);
    }
  }

  // ---------- Statistik ----------
  function fmtTime(sec) {
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60;
    return h ? `${h}h ${m}m` : m ? `${m}m ${x}s` : `${x}s`;
  }
  function renderStats() {
    const rows = [
      ["Best roll", L.format(s.bestRoll)],
      ["Rarest roll", s.rarest < 1 ? L.formatOdds(s.rarest) : "–"],
      ["Total rolls", L.format(s.rolls)],
      ["Mega rolls", L.format(s.megaRolls)],
      ["Total earned", L.format(s.totalEarned)],
      ["Earned this run", L.format(s.runEarned)],
      ["Rebirths", String(s.rebirths)],
      ["Effective Luck", fmtLuck(L.effectiveLuck(s))],
      ["Play time", fmtTime(s.playTime)],
    ];
    const html = rows.map(([k, v]) => `<div class="stat"><span class="muted">${k}</span><b>${v}</b></div>`).join("");
    if ($("statList").innerHTML !== html) $("statList").innerHTML = html;
  }

  // ---------- Modal ----------
  let modalCb = null;
  function confirmModal(title, html, okLabel, cb, cancelLabel = "Cancel") {
    $("modalTitle").textContent = title;
    $("modalText").innerHTML = html;
    $("modalOk").textContent = okLabel;
    $("modalCancel").textContent = cancelLabel;
    $("modalCancel").classList.toggle("hidden", cancelLabel === null);
    modalCb = cb;
    $("modal").classList.remove("hidden");
  }
  const closeModal = () => { $("modal").classList.add("hidden"); modalCb = null; };
  const info = (title, text) => confirmModal(title, `<p>${text}</p>`, "OK", null, null);

  // ---------- Settings ----------
  function setupSettings() {
    $("optVibration").addEventListener("change", (e) => { s.settings.vibration = e.target.checked; save(); });
    $("optAuto").addEventListener("change", (e) => { s.settings.autoEnabled = e.target.checked; autoTimer = 0; save(); });
    $("btnExport").addEventListener("click", () => {
      save();
      const code = btoa(JSON.stringify(s));
      const ta = $("saveText");
      ta.value = code;
      ta.select();
      if (navigator.clipboard) navigator.clipboard.writeText(code).then(() => info("Exported", "Save code copied to clipboard."), () => {});
    });
    $("btnImport").addEventListener("click", () => {
      const code = $("saveText").value.trim();
      if (!code) return info("Import", "Paste a save code into the text field first.");
      let data;
      try { data = JSON.parse(atob(code)); } catch (e) { return info("Import failed", "This save code is not valid."); }
      confirmModal("Import save?", "<p>Your current progress will be replaced.</p>", "Import", () => {
        s = L.sanitize(data);
        afterStateReplaced();
        info("Imported", "Save loaded successfully.");
      });
    });
    $("btnReset").addEventListener("click", () => {
      confirmModal("Reset game?", "<p>This deletes <b>all</b> progress, including achievements and rebirths. This cannot be undone.</p>",
        "Delete everything", () => {
          try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
          s = L.newState();
          afterStateReplaced();
        });
    });
  }

  function afterStateReplaced() {
    lastManual = -Infinity;
    autoTimer = 0;
    save();
    restoreLastRoll();
    renderAchievements();
    updateUI(true);
  }

  function restoreLastRoll() {
    if (s.lastRoll > 0) {
      const tier = tierOf(s.lastRarity);
      $("resultCard").style.setProperty("--tier", `var(${tier.color})`);
      $("result").textContent = L.format(s.lastRoll);
      $("odds").innerHTML = `<b>${tier.name}</b> · ${L.formatOdds(s.lastRarity)}`;
    } else {
      $("resultCard").style.setProperty("--tier", "var(--r-common)");
      $("result").textContent = "–";
      $("odds").textContent = "Tap ROLL to start";
    }
  }

  // ---------- Tabs ----------
  function setTab(name) {
    activeTab = name;
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    document.querySelectorAll(".pane").forEach((p) => p.classList.toggle("active", p.dataset.pane === name));
    $("panel").scrollTop = 0;
    if (name === "achievements") renderAchievements();
    updateUI(true);
  }

  // ---------- UI-Update (ca. 10x pro Sekunde) ----------
  function updateUI() {
    $("currency").textContent = L.format(s.currency);
    $("chipLuck").textContent = fmtLuck(L.effectiveLuck(s));
    $("chipMulti").textContent = String(L.rollCount(s));
    $("chipRebirth").textContent = String(s.rebirths);
    $("rebirthDot").classList.toggle("on", L.canRebirth(s));

    const auto = $("autoStatus");
    let autoHtml = "";
    if (s.autoOwned) {
      autoHtml = s.settings.autoEnabled
        ? `<span class="pulse"></span>Auto-Roller · every ${fmtSec(L.autoInterval(s.levels.autoSpeed))}`
        : "Auto-Roller paused";
    }
    if (auto.innerHTML !== autoHtml) auto.innerHTML = autoHtml;

    $("optVibration").checked = s.settings.vibration;
    $("optAuto").checked = s.settings.autoEnabled;
    $("optAuto").disabled = !s.autoOwned;

    if (activeTab === "upgrades") updateUpgrades();
    else if (activeTab === "rebirth") updateRebirth();
    else if (activeTab === "stats") renderStats();
  }

  // ---------- Spielschleife ----------
  let lastFrame = performance.now();
  let uiAcc = 0, saveAcc = 0, achAcc = 0;
  function frame(t) {
    let dt = (t - lastFrame) / 1000;
    lastFrame = t;
    // War der Tab im Hintergrund, keine Zeit nachholen (kein Offline-Fortschritt).
    if (dt > 1 || dt < 0) dt = 0;

    s.playTime += dt;

    // Auto-Roller
    if (s.autoOwned && s.settings.autoEnabled) {
      autoTimer += dt;
      const iv = L.autoInterval(s.levels.autoSpeed);
      if (autoTimer >= iv) {
        autoTimer = Math.min(autoTimer - iv, iv);
        doRoll(true);
      }
    }

    // Cooldown-Anzeige auf dem Button
    const cd = L.cooldown(s.levels.speed);
    const frac = Math.min(1, (now() - lastManual) / cd);
    $("rollFill").style.transform = `scaleX(${frac})`;
    $("rollBtn").classList.toggle("cooling", frac < 1);

    stepParticles(dt);

    if ((uiAcc += dt) >= 0.1) { uiAcc = 0; updateUI(); }
    if ((achAcc += dt) >= 2) { achAcc = 0; checkAchievements(); }
    if ((saveAcc += dt) >= 5) { saveAcc = 0; save(); }

    requestAnimationFrame(frame);
  }

  // ---------- Start ----------
  function init() {
    buildUpgrades();
    buildRebirth();
    setupSettings();
    restoreLastRoll();
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // pointerdown statt click: reagiert auf dem Handy sofort
    $("rollBtn").addEventListener("pointerdown", (e) => { e.preventDefault(); manualRoll(); });
    document.addEventListener("keydown", (e) => {
      if ((e.code === "Space" || e.code === "Enter") && !e.repeat && document.activeElement.tagName !== "TEXTAREA") {
        e.preventDefault();
        if (!$("mega").classList.contains("hidden")) hideMega();
        else manualRoll();
      }
    });
    $("mega").addEventListener("pointerdown", hideMega);
    document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
    $("modalCancel").addEventListener("click", closeModal);
    $("modalOk").addEventListener("click", () => { const cb = modalCb; closeModal(); if (cb) cb(); });

    document.addEventListener("visibilitychange", () => { if (document.hidden) save(); });
    window.addEventListener("pagehide", save);

    checkAchievements();
    updateUI(true);
    requestAnimationFrame(frame);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  init();
})();
