export type SaveData = { best: number; totalGems: number; runs: number; bestDistance: number; unlocked: string[] };
const defaultSave: SaveData = { best: 0, totalGems: 0, runs: 0, bestDistance: 0, unlocked: ['nova', 'dash', 'pixel'] };
export function readSave(): SaveData {
  try {
    const saved = JSON.parse(localStorage.getItem('rooftop-rush-v1') || '{}');
    return { ...defaultSave, best: Number(saved.best) || 0, totalGems: Number(saved.totalGems) || 0,
      runs: Number(saved.runs) || 0, bestDistance: Number(saved.bestDistance) || 0 };
  } catch { return { ...defaultSave }; }
}
export function saveProgress(save: SaveData) { try { localStorage.setItem('rooftop-rush-v1', JSON.stringify(save)); } catch { /* Private browsing can disable storage. */ } }
