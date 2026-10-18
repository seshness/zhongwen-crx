// Anonymous feature-usage analytics via the GA4 Measurement Protocol, following
// https://developer.chrome.com/docs/extensions/how-to/integrate/google-analytics-4
//
// Privacy rules for callers: events describe which features are used, never
// what was looked up. Do not pass highlighted text, words, page URLs or error
// messages as params.
//
// Users can turn analytics off in the side panel; doing so also deletes the
// random client ID. Nothing is sent when the build has no credentials.

import { MEASUREMENT_ID, API_SECRET } from './analytics-config.js';

const ENDPOINT = 'https://www.google-analytics.com/mp/collect';
const SESSION_EXPIRATION_MIN = 30;
const DEFAULT_ENGAGEMENT_MSEC = 100;
const ENABLED_KEY = 'analyticsEnabled'; // chrome.storage.local; absent means on

export const analyticsConfigured = Boolean(MEASUREMENT_ID && API_SECRET);

export async function isAnalyticsEnabled() {
  if (!analyticsConfigured) return false;
  const stored = await chrome.storage.local.get(ENABLED_KEY);
  return stored[ENABLED_KEY] !== false;
}

export async function setAnalyticsEnabled(enabled) {
  if (enabled) {
    await chrome.storage.local.set({ [ENABLED_KEY]: true });
  } else {
    // Record the opt-out before forgetting the user.
    await chrome.storage.local.set({ [ENABLED_KEY]: false });
    await chrome.storage.local.remove('gaClientId');
    await chrome.storage.session.remove('gaSession');
  }
}

async function getClientId() {
  const { gaClientId } = await chrome.storage.local.get('gaClientId');
  if (gaClientId) return gaClientId;
  // Random, not derived from anything about the user or device.
  const random = crypto.getRandomValues(new Uint32Array(1))[0];
  const id = `${random}.${Math.floor(Date.now() / 1000)}`;
  await chrome.storage.local.set({ gaClientId: id });
  return id;
}

async function getSessionId() {
  const now = Date.now();
  let { gaSession } = await chrome.storage.session.get('gaSession');
  if (!gaSession || (now - gaSession.timestamp) / 60000 > SESSION_EXPIRATION_MIN) {
    gaSession = { id: String(now), timestamp: now };
  } else {
    gaSession.timestamp = now;
  }
  await chrome.storage.session.set({ gaSession });
  return gaSession.id;
}

// Fire-and-forget; analytics failures never affect the extension.
export async function track(name, params = {}) {
  try {
    if (!(await isAnalyticsEnabled())) return;
    const body = {
      client_id: await getClientId(),
      events: [{
        name,
        params: {
          session_id: await getSessionId(),
          engagement_time_msec: DEFAULT_ENGAGEMENT_MSEC,
          extension_version: chrome.runtime.getManifest().version,
          ...params,
        },
      }],
    };
    await fetch(`${ENDPOINT}?measurement_id=${MEASUREMENT_ID}&api_secret=${API_SECRET}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  } catch {
    // Offline, blocked by an ad blocker, etc.
  }
}
