/**
 * InterstitialAdManager.ts — manages a pool of preloaded interstitial ads.
 */
import { createInterstitialAd, loadAdsModule } from './AdMobService';
import type { InterstitialAdLike } from '../types/ad.types';

export class InterstitialAdManager {
  private ads: Array<{ ad: ReturnType<typeof createInterstitialAd> | null; loaded: boolean; loading: boolean }> = [];
  private loadingCount = 0;
  private config = { maxCacheSize: 2, unitId: 'ca-app-pub-7288667796446979/1736619388', autoReplenish: true };

  constructor() { this.preloadInitial(); }

  private preloadInitial(): void { for (let i = 0; i < 2; i++) this.preloadOne(); }

  private preloadOne(): void {
    if (this.loadingCount >= 2) return;
    if (this.ads.length >= 2) return;

    this.loadingCount++;
    const ad = this.createAd();
    if (!ad) { this.loadingCount--; return; }

    this.ads.push({ ad, loaded: false, loading: true });
    const module = this.getModule();
    if (!module) { this.handleLoadError(this.ads.length - 1); return; }

    const adIndex = this.ads.length - 1;
    const adEntry = this.ads[adIndex]!;
    const adInstance: ReturnType<typeof createInterstitialAd> | null = adEntry.ad;
    if (adInstance == null) { this.handleLoadError(adIndex); return; }
    const offLoaded = this.addAdEventListener(adInstance, module.AdEventType.LOADED, () => {
      adEntry.loaded = true;
      adEntry.loading = false;
      this.loadingCount--;
      this.checkAndReplenish();
    });
    const offError = this.addAdEventListener(adInstance, module.AdEventType.ERROR, () => this.handleLoadError(adIndex));
    adInstance.load();
  }

  private createAd() { return createInterstitialAd('ca-app-pub-7288667796446979/1736619388'); }
  private getModule() { return loadAdsModule(); }
  private addAdEventListener(ad: any, event: string, handler: (payload?: unknown) => void) { if (!ad) return () => {}; return ad.addAdEventListener(event, handler, {}); }

private addEventListener(ad: any, event: string, handler: (payload?: unknown) => void) { return this.addAdEventListener(ad, event, handler); }
  private handleLoadError(index: number): void { this.loadingCount--; this.ads = this.ads.filter((_, i) => i !== index); if (this.config.autoReplenish) this.preloadOne(); }
  private checkAndReplenish(): void { if (this.config.autoReplenish) { const readyCount = this.ads.filter(a => a.loaded).length; if (readyCount < 2) this.preloadOne(); } }
  getReadyCount(): number { return this.ads.filter(a => a.loaded).length; }
  getTotalCount(): number { return this.ads.length; }
  isReady(): boolean { return this.ads.some(a => a.loaded); }
  
  getAvailability(): 'ready' | 'loading' | 'unavailable' {
    if (this.isReady()) return 'ready';
    if (this.loadingCount > 0) return 'loading';
    return 'unavailable';
  }
  
  async show(): Promise<{ kind: 'shown' } | { kind: 'failed'; reason: string } | { kind: 'not_ready' }> {
    const readyIndex = this.ads.findIndex(a => a.loaded);
    if (readyIndex === -1) {
      this.preloadOne();
      await new Promise(r => setTimeout(r, 100));
      const readyIndex2 = this.ads.findIndex(a => a.loaded);
      if (readyIndex2 === -1) return { kind: 'not_ready' };
    }
    const adState = this.ads.splice(readyIndex, 1)[0];
    if (!adState) return { kind: 'failed', reason: 'Ad state unavailable' };
    const module = this.getModule();
    if (!module) return { kind: 'failed', reason: 'Ad module unavailable' };
    const ad = adState.ad as ReturnType<typeof createInterstitialAd>;
    if (!ad) return { kind: 'failed', reason: 'Ad instance unavailable' };
    return new Promise<{ kind: 'shown' } | { kind: 'failed'; reason: string } | { kind: 'not_ready' }>((resolve) => {
      let settled = false;
      const finish = (outcome: any) => {
        if (settled) return;
        settled = true;
        if (this.config.autoReplenish) this.preloadOne();
        resolve(outcome);
      };
      const module = this.getModule()!;
      const offLoaded = this.addAdEventListener(ad, module.AdEventType.LOADED, () => {
        try { ad.show(); } catch { finish(false); }
      });
      const offError = this.addAdEventListener(ad, module.AdEventType.ERROR, (err: unknown) => {
        finish(false);
      });
      const offClosed = this.addAdEventListener(ad, module.AdEventType.CLOSED, () => {
        offLoaded();
        offError();
        finish(true);
      });
      try { ad.show(); } catch { offLoaded(); offError(); offClosed(); finish(false); }
    });
  }
  preload(count = 1): void { for (let i = 0; i < count; i++) this.preloadOne(); }
  getStats() { return { ready: this.getReadyCount(), total: this.ads.length, loading: this.loadingCount, maxSize: 2 }; }
  clear(): void { this.ads = []; this.loadingCount = 0; }
}

export const interstitialAdManager = new InterstitialAdManager();