// Not "cs_session" or "ct_session": cookies aren't separated by port, so a shared name
// would make the apps sign each other out when they run together on localhost.
export const SESSION_COOKIE = "ca_session";
