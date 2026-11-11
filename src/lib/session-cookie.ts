// Not "cs_session" or "ct_session": cookies aren't separated by port, so a shared name
// would make the apps sign each other out when they run together on localhost.
export const SESSION_COOKIE = "ca_session";

// A token is only accepted by the app it was issued for (JWT `aud`). The apps share one SESSION_SECRET,
// so without this a token signed by one app would be a valid login in the others.
export const SESSION_AUDIENCE = "admin";

// Sessions slide: renewed on use, at most once per RENEW period.
export const SESSION_MAX_AGE_SECONDS = 43200; // 12 hours
export const SESSION_RENEW_AFTER_SECONDS = 3600; // 1 hour(s)
