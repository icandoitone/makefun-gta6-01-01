// Save system: one localStorage slot. Stores money, the highest mission
// unlocked, the player's position and health. Saving is explicit on
// mission completion and on demand; loading restores a fresh session.

const KEY = 'solmar-bay-save-v1';

export function saveGame(data) {
  try {
    const payload = {
      v: 1,
      savedAt: Date.now(),
      money: data.money,
      missionUnlocked: data.missionUnlocked,
      x: data.x,
      z: data.z,
      inCar: data.inCar,
      health: data.health,
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ }
}

export function hasSave() {
  return loadGame() !== null;
}
