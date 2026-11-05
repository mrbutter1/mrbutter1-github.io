// Achievements: rein kosmetisch, geben keine Boni.
// check(s, ev) bekommt den Spielstand und optional das letzte Wurf-Ereignis { value, p, mega }.
const ACHIEVEMENTS = (function () {
  const rollAtLeast = (id, icon, name, x) => ({
    id, icon, name, desc: `Roll ${Logic.format(x)} or higher`, check: (s) => s.bestRoll >= x,
  });
  const rolls = (id, icon, name, n) => ({
    id, icon, name, desc: `Roll ${Logic.format(n)} times`, check: (s) => s.rolls >= n,
  });
  const rarer = (id, icon, name, odds) => ({
    id, icon, name, desc: `Roll something rarer than 1 in ${Logic.format(odds)}`, check: (s) => s.rarest < 1 / odds,
  });
  const rebirths = (id, icon, name, n, desc) => ({
    id, icon, name, desc: desc || `Rebirth ${n} times`, check: (s) => s.rebirths >= n,
  });
  const levelKeys = ["luck", "multi", "speed", "autoSpeed"];

  return [
    { id: "first", icon: "🎲", name: "First Roll", desc: "Roll for the first time", check: (s) => s.rolls >= 1 },
    rollAtLeast("r100", "💯", "Hundred Club", 100),
    rollAtLeast("r1k", "✨", "Four Digits", 1e3),
    rollAtLeast("r1m", "💰", "Millionaire Roll", 1e6),
    rollAtLeast("r1b", "💎", "Billion Roll", 1e9),
    rollAtLeast("r1t", "👑", "Trillion Roll", 1e12),
    rollAtLeast("r1aa", "🌙", "Beyond Words", 1e15),
    rollAtLeast("r1e30", "🪐", "Astronomical", 1e30),
    rollAtLeast("r1e60", "🌌", "Cosmic", 1e60),
    rollAtLeast("r1e100", "🕳️", "Absurd", 1e100),
    { id: "max", icon: "♾️", name: "Max Roll", desc: "Roll the maximum number", check: (s) => s.bestRoll >= Logic.MAX },
    rolls("n100", "👆", "Getting Started", 100),
    rolls("n1k", "✋", "Dedicated", 1000),
    rolls("n10k", "🦾", "Obsessed", 1e4),
    rolls("n100k", "🤖", "Roll Machine", 1e5),
    { id: "mega", icon: "🎆", name: "Mega!", desc: "Get your first mega roll", check: (s) => s.megaRolls >= 1 },
    { id: "mega100", icon: "🎇", name: "Mega Collector", desc: "Get 100 mega rolls", check: (s) => s.megaRolls >= 100 },
    rarer("odds10k", "🍀", "Lucky Streak", 1e4),
    rarer("odds1m", "🌈", "Blessed", 1e6),
    rarer("odds1b", "☄️", "Chosen One", 1e9),
    { id: "auto", icon: "⚙️", name: "Hands Free", desc: "Buy the Auto-Roller", check: (s) => s.autoOwned },
    { id: "speedmax", icon: "⚡", name: "Speed Demon", desc: "Max out Roll Speed", check: (s) => !Number.isFinite(Logic.upgradeCost("speed", s)) },
    { id: "lvl10", icon: "📈", name: "Investor", desc: "Get any upgrade to level 10", check: (s) => levelKeys.some((k) => s.levels[k] >= 10) },
    { id: "allLvl10", icon: "🏗️", name: "Well Rounded", desc: "Get Luck, Multi-Roll, Roll Speed and Auto-Roll Speed to level 10",
      check: (s) => levelKeys.every((k) => s.levels[k] >= 10) },
    rebirths("reb1", "🔄", "Reborn", 1, "Rebirth for the first time"),
    rebirths("reb5", "🌀", "Cycle of Luck", 5),
    rebirths("reb25", "🔱", "Eternal Roller", 25),
    { id: "rebMax", icon: "🏁", name: "Final Form", desc: "Reach the last rebirth", check: (s) => s.rebirths >= Logic.maxRebirths() },
    { id: "earn1e50", icon: "🏦", name: "Big Spender", desc: `Earn ${Logic.format(1e50)} in total`, check: (s) => s.totalEarned >= 1e50 },
    { id: "hour", icon: "⏳", name: "Patient", desc: "Play for 1 hour", check: (s) => s.playTime >= 3600 },
  ];
})();
