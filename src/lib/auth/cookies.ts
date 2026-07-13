/**
 * Auth cookie names + session policy, shared by the proxy, the auth forms, and
 * the signout route so the strings and the 24h cap live in exactly one place.
 */

/** Stamped when a session starts; the proxy enforces the 24h cap against it. */
export const SESSION_START_COOKIE = "turkcure_session_start";

/** Marks the daily brand splash as seen; cleared on signout so it replays. */
export const INTRO_COOKIE = "turkcure_intro";

/** Sessions are capped at 24h: after that, users must sign in again. */
export const MAX_SESSION_MS = 24 * 60 * 60 * 1000;
