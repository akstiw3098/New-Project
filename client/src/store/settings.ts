import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Quality = 'auto' | 'high' | 'light';
export type CardSkin = 'classic' | 'minimal' | 'royal';

interface SettingsState {
  name: string;
  quality: Quality;
  cardSkin: CardSkin;
  soundOn: boolean;
  setName: (v: string) => void;
  setQuality: (v: Quality) => void;
  setCardSkin: (v: CardSkin) => void;
  setSoundOn: (v: boolean) => void;
}

function detectAutoQuality(): 'high' | 'light' {
  if (typeof window === 'undefined') return 'high';
  const dm = (navigator as any).deviceMemory as number | undefined;
  const cores = navigator.hardwareConcurrency ?? 4;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const smallScreen = window.innerWidth < 480;
  if (reducedMotion) return 'light';
  if (dm !== undefined && dm <= 2) return 'light';
  if (cores <= 2) return 'light';
  if (smallScreen) return 'light';
  return 'high';
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      name: '',
      quality: 'auto',
      cardSkin: 'classic',
      soundOn: true,
      setName: (v) => set({ name: v }),
      setQuality: (v) => set({ quality: v }),
      setCardSkin: (v) => set({ cardSkin: v }),
      setSoundOn: (v) => set({ soundOn: v }),
    }),
    { name: 'seepify-settings' }
  )
);

export function effectiveQuality(quality: Quality): 'high' | 'light' {
  return quality === 'auto' ? detectAutoQuality() : quality;
}
