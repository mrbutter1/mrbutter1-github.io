// Alle Balancing-Konstanten an einer Stelle.
// Wird im Browser (globale Variable CONFIG) und in tools/simulate.js (require) genutzt.
const CONFIG = {
  // Harte Obergrenze für alle Zahlen im Spiel.
  maxValue: 1e200,

  roll: {
    baseCooldown: 1.0, // Sekunden zwischen manuellen Würfen (Start)
    megaThreshold: 0.01, // Wurf seltener als 1:100 -> Mega-Animation
  },

  upgrades: {
    luck: {
      name: "Luck",
      desc: "Higher numbers become more likely.",
      baseCost: 10,
      growth: 4.5, // Kosten-Faktor pro Level
      perLevel: 0.05, // Luck = 1 + perLevel * level^exponent
      exponent: 1, // < 1 -> abnehmender Ertrag beim Luck-Wert
      scaleWithRebirth: true, // Kosten: baseCost * growth^(level * Rebirth-Multiplikator)
    },
    multi: {
      name: "Multi-Roll",
      desc: "Roll several numbers at once. The highest counts.",
      baseCost: 150,
      growth: 9,
      perLevel: 1, // +1 Wurf pro Level
      scaleWithRebirth: true,
    },
    speed: {
      name: "Roll Speed",
      desc: "Shorter cooldown between manual rolls.",
      baseCost: 40,
      growth: 4.5,
      factor: 0.88, // Cooldown * 0.88 pro Level
      min: 0.2, // Sekunden
    },
    auto: {
      name: "Auto-Roller",
      desc: "Rolls automatically while the game is open.",
      cost: 3e4, // Einmal-Upgrade
      baseInterval: 5.0, // Sekunden
    },
    autoSpeed: {
      name: "Auto-Roll Speed",
      desc: "Shorter interval between auto rolls.",
      baseCost: 5e4,
      growth: 5,
      factor: 0.85,
      min: 0.5,
    },
  },

  rebirth: {
    firstRequirement: 1e6, // Meilenstein für den 1. Rebirth
    requirementFactor: 1e3, // jeder weitere Meilenstein x1000
    // permanenter Luck-Multiplikator: 1 + luckPerRebirth * rebirths^exponent
    luckPerRebirth: 0.32,
    exponent: 1,
  },
};

if (typeof module !== "undefined") module.exports = CONFIG;
