/**
 * RewardedAdManager.ts — manages a pool of preloaded rewarded ads.
 */
import { createRewardedAd, loadAdsModule } from './AdMobService';
import type { RewardedAdLike } from '../types/ad.types';

interface RewardedAdState {
  ad: ReturnType<typeof createRewardedAd> | null;
  loaded: boolean;
  loading: boolean;
}

export class RewardedAdManager {
  private ads: Array<{ ad: ReturnType<typeof createRewardedAd> | null; loaded: boolean; loading: boolean }> = [];
  private loadingCount = 0;
  private config = { maxCacheSize: 3, unitId: 'ca-app-pub-7288667796446979/9116203924', autoReplenish: true };

  constructor() { this.preloadInitial(); }

  private preloadInitial(): void { for (let i = 0; i < 3; i++) this.preloadOne(); }

  private preloadOne(): void {
    if (this.loadingCount >= 3) return;
    if (this.ads.length >= 3) return;

    this.loadingCount++;
    const ad = this.createAd();
    if (!ad) { this.loadingCount--; return; }

    this.ads.push({ ad, loaded: false, loading: true });
    const module = this.getModule();
    if (!module) { this.handleLoadError(this.ads.length - 1); return; }

    const adIndex = this.ads.length - 1;
    const adEntry = this.ads[adIndex]!;
    const adInstance: ReturnType<typeof createRewardedAd> | null = adEntry.ad;
    if (adInstance == null) { this.handleLoadError(adIndex); return; }
    const offLoaded = this.addAdEventListener(adInstance, module.RewardedAdEventType.LOADED, () => {
      adEntry.loaded = true;
      adEntry.loading = false;
      this.loadingCount--;
      this.checkAndReplenish();
    });
    const offError = this.addAdEventListener(adInstance, module.AdEventType.ERROR, () => this.handleLoadError(adIndex));
    adInstance.load();
  }

  private createAd() { return createRewardedAd('ca-app-pub-7288667796446979/9116203924'); }
  private getModule() { return loadAdsModule(); }
  private addAdEventListener(ad: any, event: string, handler: (payload?: unknown) => void) { if (!ad) return () => {}; return ad.addAdEventListener(event, handler, {}); }

private addEventListener(ad: any, event: string, handler: (payload?: unknown) => void) { return this.addAdEventListener(ad, event, handler); }
  private handleLoadError(index: number): void { this.loadingCount--; this.ads = this.ads.filter((_, i) => i !== index); if (this.config.autoReplenish) this.preloadOne(); }
  private checkAndReplenish(): void { if (this.config.autoReplenish) { const readyCount = this.ads.filter(a => a.loaded).length; if (readyCount < 3) this.preloadOne(); } }
  getReadyCount(): number { return this.ads.filter(a => a.loaded).length; }
  getTotalCount(): number { return this.ads.length; }
  isReady(): boolean { return this.ads.some(a => a.loaded); }
  
  getAvailability(): 'ready' | 'loading' | 'unavailable' {
    if (this.getReadyCount() > 0) return 'ready';
    if (this.loadingCount > 0) return 'loading';
    return 'unavailable';
  }
  
  async show(): Promise<{ kind: 'earned' } | { kind: 'dismissed' } | { kind: 'failed'; reason: string }> {
    const readyIndex = this.ads.findIndex(a => a.loaded);
    if (readyIndex === -1) {
      this.preloadOne();
      await new Promise(r => setTimeout(r, 100));
      const readyIndex2 = this.ads.findIndex(a => a.loaded);
      if (readyIndex2 === -1) return { kind: 'failed', reason: 'No rewarded ad available' };
    }
    const adState = this.ads.splice(readyIndex, 1)[0];
    if (!adState) return { kind: 'failed', reason: 'Ad state unavailable' };
    const module = this.getModule();
    if (!module) return { kind: 'failed', reason: 'Ad module unavailable' };
    const ad = adState.ad as ReturnType<typeof createRewardedAd>;
    if (!ad) return { kind: 'failed', reason: 'Ad instance unavailable' };
    return new Promise<{ kind: 'earned' } | { kind: 'dismissed' } | { kind: 'failed'; reason: string }>(resolve => {
      let settled = false;
      const finish = (outcome: any) => { if (settled) return; settled = true; if (this.config.autoReplenish) this.preloadOne(); resolve(outcome); };
      let earned = false;
      const module = this.getModule()!;
      const offReward = this.addAdEventListener(ad, module.RewardedAdEventType.EARNED_REWARD, () => { earned = true; });
      const offClosed = this.addAdEventListener(ad, module.AdEventType.CLOSED, () => { offReward(); offError(); offClosed(); finish(earned ? { kind: 'earned' } : { kind: 'dismissed' }); });
      const offError = this.addAdEventListener(ad, module.AdEventType.ERROR, (err: unknown) => { offReward(); offClosed(); offError(); finish({ kind: 'failed', reason: String(err) }); });
      const offLoaded = this.addAdEventListener(ad, module.RewardedAdEventType.LOADED, () => {});
      try { ad.show(); } catch (e) { offReward(); offClosed(); offError(); offLoaded(); finish({ kind: 'failed', reason: String(e) }); }
    });
  }
  preload(count = 1): void { for (let i = 0; i < count; i++) this.preloadOne(); }
  getStats() { return { ready: this.getReadyCount(), total: this.ads.length, loading: this.loadingCount, maxSize: 3 }; }
  clear(): void { this.ads = []; this.loadingCount = 0; }
}

export const rewardedAdManager = new RewardedAdManager();