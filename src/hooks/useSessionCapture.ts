import { useEffect } from 'react';

const SESSION_KEY = 'strava_session';

export interface StoredSession {
  athleteId: number;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/**
 * Hook to capture session data from URL hash after OAuth callback.
 * This is needed for PWA support since standalone PWAs have isolated
 * cookie storage from the browser.
 */
export function useSessionCapture() {
  useEffect(() => {
    // Check for session in URL hash (from OAuth callback)
    const hash = window.location.hash;
    if (hash.startsWith('#session=')) {
      try {
        const sessionData = hash.replace('#session=', '');
        const decoded = JSON.parse(atob(sessionData)) as StoredSession;
        localStorage.setItem(SESSION_KEY, JSON.stringify(decoded));
        // Clean up URL - remove the hash without triggering navigation
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      } catch (e) {
        console.error('Failed to parse session from URL:', e);
      }
    }
  }, []);
}

/**
 * Get the stored session from localStorage
 */
export function getStoredSession(): StoredSession | null {
  const stored = localStorage.getItem(SESSION_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as StoredSession;
  } catch {
    return null;
  }
}

/**
 * Update the stored session (e.g., after token refresh)
 */
export function updateStoredSession(session: Partial<StoredSession>) {
  const current = getStoredSession();
  if (current) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...current, ...session }));
  }
}

/**
 * Clear the stored session (on logout)
 */
export function clearStoredSession() {
  localStorage.removeItem(SESSION_KEY);
}

/**
 * Check if the stored session has a valid (non-expired) access token
 */
export function isSessionValid(): boolean {
  const session = getStoredSession();
  if (!session) return false;

  // Check if token is expired (with 5 minute buffer)
  const now = Math.floor(Date.now() / 1000);
  return session.expiresAt > now + 300;
}
