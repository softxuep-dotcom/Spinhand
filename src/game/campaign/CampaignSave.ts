import type { LevelResult } from "./types";

export interface CampaignSettings {
  sound: boolean;
  haptics: boolean;
  reducedMotion: boolean;
}

export interface CampaignSaveData {
  version: 1;
  highestUnlocked: number;
  results: Record<string, { complete: boolean; noRestart: boolean; hiddenBolt: boolean }>;
  workshopUnlocked: boolean;
  settings: CampaignSettings;
}

const STORAGE_KEY = "spinhand-campaign-v1";
const defaults = (): CampaignSaveData => ({
  version: 1,
  highestUnlocked: 1,
  results: {},
  workshopUnlocked: false,
  settings: {
    sound: true,
    haptics: true,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  },
});

export class CampaignSave {
  data: CampaignSaveData = defaults();

  constructor() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<CampaignSaveData>;
      if (parsed.version !== 1) return;
      this.data = {
        ...defaults(),
        ...parsed,
        results: parsed.results ?? {},
        settings: { ...defaults().settings, ...(parsed.settings ?? {}) },
      };
    } catch {
      this.data = defaults();
    }
  }

  complete(result: LevelResult): void {
    const key = String(result.level);
    const previous = this.data.results[key];
    this.data.results[key] = {
      complete: true,
      noRestart: Boolean(previous?.noRestart || result.noRestart),
      hiddenBolt: Boolean(previous?.hiddenBolt || result.hiddenBolt),
    };
    this.data.highestUnlocked = Math.max(this.data.highestUnlocked, Math.min(5, result.level + 1));
    if (result.level >= 5) this.data.workshopUnlocked = true;
    this.persist();
  }

  setSetting<K extends keyof CampaignSettings>(key: K, value: CampaignSettings[K]): void {
    this.data.settings[key] = value;
    this.persist();
  }

  boltsFor(level: number): number {
    const result = this.data.results[String(level)];
    if (!result?.complete) return 0;
    return 1 + Number(result.noRestart) + Number(result.hiddenBolt);
  }

  totalBolts(): number {
    return Array.from({ length: 5 }, (_, index) => this.boltsFor(index + 1)).reduce((sum, value) => sum + value, 0);
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Storage failure must never block level flow.
    }
  }
}
