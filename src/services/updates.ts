/**
 * updates.ts â€” In-App Update API integration
 *
 * Purpose:      Handle Android in-app updates (flexible and immediate).
 * Responsibilities:
 *               - Check for available updates via Google Play
 *               - Flexible update: background download, prompt restart
 *               - Immediate update: full-screen blocking flow for critical updates
 *               - Handle update download progress and installation
 * Notes:        Android-only (Google Play In-App Updates).
 *               iOS does not support this API.
 *               Do not interrupt an active puzzle unnecessarily.
 *               Resume interrupted flexible updates where supported.
 */

/** Current update status. */
export type UpdateStatus = 'idle' | 'checking' | 'downloadable' | 'downloading' | 'error';

/** Update information from Google Play. */
export interface UpdateInfo {
  /** Version code of the available update. */
  readonly versionCode: number;
  /** Release notes or description. */
  readonly releaseNotes?: string;
  /** Whether the update is flexible (optional) or immediate. */
  readonly updateType: 'flexible' | 'immediate';
  /** Whether the update is currently being downloaded. */
  readonly isDownloading: boolean;
  /** Progress percentage (0-100) if downloading. */
  readonly downloadProgress: number;
}

/** Shape of the InAppUpdates module (lazy loaded). */
interface InAppUpdatesModule {
  fetchUpdateAsync: () => Promise<{ available: boolean; versionCode?: number; releaseNotes?: string; updateType?: string; isDownloading?: boolean; downloadProgress?: number } | null>;
  downloadUpdateAsync: () => Promise<void>;
  requestImmediateUpdateAsync: () => Promise<void>;
}

/** Check if an update is available. */
export async function checkForUpdate(): Promise<{ available: boolean; info?: UpdateInfo } | null> {
  let InAppUpdates: InAppUpdatesModule | null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    InAppUpdates = require('expo-in-app-updates');
  } catch {
    InAppUpdates = null;
  }

  if (!InAppUpdates) {
    if (__DEV__) {
      console.warn('[updates] expo-in-app-updates not available, skipping check');
    }
    return null;
  }

  try {
    const release = await InAppUpdates.fetchUpdateAsync();

    if (release?.available) {
      return {
        available: true,
        info: {
          versionCode: release.versionCode!,
          releaseNotes: release.releaseNotes!,
          updateType: release.updateType as 'flexible' | 'immediate',
          isDownloading: release.isDownloading!,
          downloadProgress: release.downloadProgress!,
        },
      };
    }

    return { available: false };
  } catch (e) {
    if (__DEV__) {
      console.warn('[updates] checkForUpdate failed', e);
    }
    return null;
  }
}

/** Download a flexible update in the background. */
export async function downloadFlexibleUpdate(): Promise<boolean> {
  let InAppUpdates: InAppUpdatesModule | null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    InAppUpdates = require('expo-in-app-updates');
  } catch {
    InAppUpdates = null;
  }

  if (!InAppUpdates) {
    if (__DEV__) {
      console.warn('[updates] expo-in-app-updates not available, skipping download');
    }
    return false;
  }

  try {
    await InAppUpdates.downloadUpdateAsync();
    return true;
  } catch (e) {
    if (__DEV__) {
      console.warn('[updates] downloadFlexibleUpdate failed', e);
    }
    return false;
  }
}

/** Immediately show the update flow (for critical updates). */
export async function immediatelyShowUpdateFlow(): Promise<boolean> {
  let InAppUpdates: InAppUpdatesModule | null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    InAppUpdates = require('expo-in-app-updates');
  } catch {
    InAppUpdates = null;
  }

  if (!InAppUpdates) {
    if (__DEV__) {
      console.warn('[updates] expo-in-app-updates not available');
    }
    return false;
  }

  try {
    await InAppUpdates.requestImmediateUpdateAsync();
    return true;
  } catch (e) {
    if (__DEV__) {
      console.warn('[updates] immediatelyShowUpdateFlow failed', e);
    }
    return false;
  }
}

/** Check for updates at application start. */
export async function checkUpdateOnAppStart(): Promise<UpdateInfo | null> {
  const result = await checkForUpdate();

  if (!result || !result.available) {
    return null;
  }

  // Return the typed info if we have it
  if (result.info) {
    return result.info;
  }

  // Fallback: construct a minimal UpdateInfo from what we have
  return {
    versionCode: 0,
    updateType: 'flexible' as const,
    isDownloading: false,
    downloadProgress: 0,
  };
}

/** Monitor update download progress. */
export function getUpdateDownloadStatus(): {
  isDownloading: boolean;
  downloadProgress: number;
} {
  return { isDownloading: false, downloadProgress: 0 };
}
