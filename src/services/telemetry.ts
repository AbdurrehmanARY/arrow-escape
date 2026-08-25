/**
 * telemetry.ts — Growth & Retention Telemetry Service.
 *
 * Purpose:      Log core gameplay events (level start, level complete, level fail,
 *               ad impressions, hint requests) safely offline and in dev builds.
 */

export type TelemetryEvent =
  | {
      readonly name: 'level_start';
      readonly payload: { readonly level_id: number; readonly tier: string };
    }
  | {
      readonly name: 'level_complete';
      readonly payload: {
        readonly level_id: number;
        readonly duration_seconds: number;
        readonly mistakes_made: number;
        readonly hints_used: number;
      };
    }
  | {
      readonly name: 'level_fail';
      readonly payload: {
        readonly level_id: number;
        readonly remaining_arrows: number;
        readonly blocker_cause: string;
      };
    }
  | {
      readonly name: 'ad_impression';
      readonly payload: {
        readonly format: 'interstitial' | 'rewarded';
        readonly placement: string;
        readonly network?: string;
      };
    }
  | {
      readonly name: 'hint_requested';
      readonly payload: { readonly level_id: number; readonly source: 'free' | 'rewarded_ad' };
    }
  | {
      readonly name: 'streak_claimed';
      readonly payload: { readonly day: number; readonly arrows: number; readonly hints: number };
    };

/** Event log buffer in memory for debugging / dev inspection. */
const eventLogBuffer: TelemetryEvent[] = [];
const MAX_BUFFER = 50;

/**
 * Log a telemetry event.
 * Safe across all platforms (Expo Go, Web, Native Release).
 */
export function trackTelemetry(event: TelemetryEvent): void {
  try {
    eventLogBuffer.unshift(event);
    if (eventLogBuffer.length > MAX_BUFFER) {
      eventLogBuffer.pop();
    }
  } catch {
    // Telemetry errors must never crash the game
  }
}

/** Get in-memory event buffer (dev / debug tools). */
export function getTelemetryHistory(): readonly TelemetryEvent[] {
  return eventLogBuffer;
}
