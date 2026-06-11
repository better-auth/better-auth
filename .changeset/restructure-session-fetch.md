---
"better-auth": patch
---

fix(client): restructure session fetch to eliminate double-fetches and preserve stable references

- Unified session fetching into a single `fetchSession()` with AbortController deduplication, eliminating the double-fetch that occurred on every window focus event
- Added `withEquality()` atom gate using nanostores `onSet` to suppress re-renders when session data is structurally unchanged
- Fixed stale closure bug in the refresh manager where captured state could overwrite newer data
- Fixed destructive `.off()` cleanup in `useAuthQuery` that killed all atom subscribers instead of just the one being cleaned up
- Preserved the previous polling behavior so interval-based session refreshes only run while session data is present
- Removed dead `cachedSession` field from session refresh state
- Plugin queries (organization, passkey) also benefit from reference stability via the equality gate on `useAuthQuery`
