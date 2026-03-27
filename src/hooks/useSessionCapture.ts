import { useEffect, useState } from 'react';

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
 * Create or replace the stored session entirely.
 * Used when recovering auth from cookies after localStorage was cleared.
 */
export function setStoredSession(session: StoredSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

/**
 * Update the stored session (e.g., after token refresh).
 * Falls back to creating a new session if one doesn't exist yet.
 */
export function updateStoredSession(session: Partial<StoredSession>) {
  const current = getStoredSession();
  if (current) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...current, ...session }));
  } else if (session.accessToken && session.refreshToken && session.expiresAt) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      athleteId: session.athleteId ?? 0,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
    }));
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

  const now = Math.floor(Date.now() / 1000);
  return session.expiresAt > now + 300;
}

const API_BASE = import.meta.env.VITE_API_URL || "/api";

/**
 * Hook that attempts to recover an authenticated session from cookies
 * when localStorage has been cleared (common in PWAs on iOS).
 *
 * Returns `recovering: true` while the attempt is in-flight so callers
 * can avoid flashing the login page.
 */
export function useAuthRecovery() {
  const [recovering, setRecovering] = useState(() => {
    // Only need recovery if there's no localStorage session
    return !getStoredSession();
  });

  useEffect(() => {
    if (getStoredSession()) {
      setRecovering(false);
      return;
    }

    let cancelled = false;

    async function attemptRecovery() {
      try {
        // Try refreshing via cookies — the server will parse the
        // strava_refresh_token cookie and return fresh tokens.
        const response = await fetch(`${API_BASE}/refresh`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });

        if (response.ok && !cancelled) {
          const data = await response.json();
          if (data.accessToken) {
            setStoredSession({
              athleteId: data.athleteId ?? 0,
              accessToken: data.accessToken,
              refreshToken: data.refreshToken ?? "",
              expiresAt: data.expiresAt,
            });
          }
        }
      } catch {
        // No recovery possible — cookies are gone too
      } finally {
        if (!cancelled) setRecovering(false);
      }
    }

    attemptRecovery();
    return () => { cancelled = true; };
  }, []);

  return { recovering };
}
