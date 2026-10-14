/**
 * ads.test.ts — regression guard for the v16 banner-size crash.
 *
 * What happened: `getBannerComponent` shipped `size: 'banner'`. In
 * `react-native-google-mobile-ads` v16+, `BannerAd` -> `BaseAd.validateSize`
 * checks a banner `size` against the keys of its `BannerAdSize` enum — and those
 * keys are UPPERCASE. `'banner'` fails that `in` check, BaseAd throws from
 * inside a `useEffect`, and the root error boundary surfaces it as a
 * full-screen "Something broke" crash on HomeScreen and PlayScreen.
 *
 * What these tests guard:
 *  - The shipped `BANNER_SIZE_KEY` is a member the *installed* SDK accepts
 *    (validated against the real enum, not a mirror that could drift).
 *  - When the SDK is present, the wrapper mounts without throwing and hands the
 *    ad a valid `size` + `unitId`, wrapped in a reserved-height View.
 *  - When the SDK is absent, `getBannerComponent()` returns `undefined`
 *    (graceful degradation — never a crash).
 *
 * The module under test caches its resolved SDK in module state, so the render
 * tests run inside `jest.isolateModules` (backed by `jest.resetModules`) to get
 * a fresh `loadSdk()` cache per test.
 */

/* eslint-disable @typescript-eslint/no-require-imports */

/** The real enum from the installed package (deep, dependency-free CommonJS path). */
const RealBannerAdSize =
  require('react-native-google-mobile-ads/lib/commonjs/BannerAdSize').BannerAdSize;

describe('BANNER_SIZE_KEY — the value that crashed the app', () => {
  const { BANNER_SIZE_KEY } = require('@services/ads') as { BANNER_SIZE_KEY: string };

  it('is a key the installed SDK accepts (uppercase enum)', () => {
    expect(BANNER_SIZE_KEY).toBe('BANNER');
    expect('BANNER' in RealBannerAdSize).toBe(true);
    expect(BANNER_SIZE_KEY in RealBannerAdSize).toBe(true);
  });

  it('rejects the lowercase spelling that shipped and crashed', () => {
    expect('banner' in RealBannerAdSize).toBe(false);
  });
});

jest.mock('react-native-google-mobile-ads', () => {
  const React = require('react');
  // Re-use the real enum so the mock validates against the true contract. The
  // `jest.mock` above targets only the package root specifier, so this deep
  // path resolves to the real, dependency-free CommonJS output.
  const { BannerAdSize } = require('react-native-google-mobile-ads/lib/commonjs/BannerAdSize');

  // A faithful-enough stand-in for v16's BaseAd: it RE-validates `size`
  // against the real enum and throws if it is not accepted — mirroring the
  // throw that crashed the app. A lowercase `'banner'` here would throw from
  // create(), failing the test just as it failed on the device.
  const MockBannerAd = (props: { size: string; unitId: string; requestOptions?: unknown }) => {
    if (!Object.prototype.hasOwnProperty.call(BannerAdSize, props.size)) {
      throw new Error(
        `BannerAd: 'size' ${JSON.stringify(props.size)} is not a valid BannerAdSize`,
      );
    }
    return React.createElement('BannerAd', props);
  };

  return {
    __esModule: true,
    BannerAd: MockBannerAd,
    BannerAdSize,
    TestIds: {
      BANNER: 'ca-app-pub-3940256099942544/6300978111',
      REWARDED: 'ca-app-pub-3940256099942544/5224354917',
      INTERSTITIAL: 'ca-app-pub-3940256099942544/1033173712',
    },
    RewardedAd: { createForAdRequest: jest.fn() },
    RewardedAdEventType: { LOADED: 'rewarded_loaded', EARNED_REWARD: 'rewarded_earned_reward' },
    AdEventType: { LOADED: 'loaded', ERROR: 'error', CLOSED: 'closed' },
    default: () => ({ initialize: jest.fn().mockResolvedValue(undefined) }),
  };
});

describe('getBannerComponent with the SDK present', () => {
  it('mounts without throwing and passes a valid size + unit id', () => {
    jest.isolateModules(() => {
      // `hasNativeAds()` falls back to `NativeModules`, so seeding it makes
      // the guarded dynamic require resolve to the mock above.
      const { NativeModules }: { NativeModules: Record<string, unknown> } =
        require('react-native');
      NativeModules.RNGoogleMobileAdsModule = { __faked: true };

      const React =
        require('react');
      const renderer =
        require('react-test-renderer');
      const ads = require('@services/ads');

      const Banner = ads.getBannerComponent();
      expect(Banner).toBeDefined();
      expect(typeof Banner).toBe('function');

      // React 19 / react-test-renderer flushes its commit phase async; without
      // `act` the renderer ends up "unmounted" and .root throws.
      const { act } = React;
      let tree: any;  // react-test-renderer, lazily required -> any
      act(() => {
        tree = renderer.create(React.createElement(Banner, { style: { height: 50 } }));
      });

      // Read the props straight off the rendered tree — no cross-instance
      // capture needed. If `size` were invalid, MockBannerAd threw above and
      // this assertion is never reached.
      const bannerNodes = tree.root.findAll(
        (n: { type?: unknown }) => n.type === 'BannerAd',
      );
      expect(bannerNodes).toHaveLength(1);
      expect(bannerNodes[0].props).toMatchObject({
        size: 'BANNER',
        unitId: 'ca-app-pub-3940256099942544/6300978111',
      });

      // The ad is not rendered bare: it is wrapped in a reserved-height View.
      const viewNodes = tree.root.findAll((n: { type?: unknown }) => n.type === 'View');
      expect(viewNodes).toHaveLength(1);

      act(() => {
        tree.unmount();
      });
    });
    jest.resetModules();
  });
});

describe('getBannerComponent with the SDK absent', () => {
  it('returns undefined instead of throwing', () => {
    jest.isolateModules(() => {
      // Explicitly clear the native-module probe so a previous test cannot
      // leak its faked module into this one.
      const { NativeModules }: { NativeModules: Record<string, unknown> } =
        require('react-native');
      NativeModules.RNGoogleMobileAdsModule = undefined;

      const ads = require('@services/ads');
      expect(ads.getBannerComponent()).toBeUndefined();
    });
    jest.resetModules();
  });
});
