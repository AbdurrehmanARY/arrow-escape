import { trackTelemetry, getTelemetryHistory } from '../../src/services/telemetry';

describe('telemetry service', () => {
  it('tracks level_start event', () => {
    trackTelemetry({
      name: 'level_start',
      payload: { level_id: 1, tier: 'tutorial' },
    });

    const history = getTelemetryHistory();
    expect(history[0]?.name).toBe('level_start');
  });

  it('tracks level_complete event', () => {
    trackTelemetry({
      name: 'level_complete',
      payload: { level_id: 1, duration_seconds: 15, mistakes_made: 0, hints_used: 0 },
    });

    const history = getTelemetryHistory();
    expect(history[0]?.name).toBe('level_complete');
  });

  it('tracks ad_impression event', () => {
    trackTelemetry({
      name: 'ad_impression',
      payload: { format: 'interstitial', placement: 'level_complete' },
    });

    const history = getTelemetryHistory();
    expect(history[0]?.name).toBe('ad_impression');
  });
});
