---
"better-auth": patch
---

Fixed a crash on client teardown when the DOM globals are no longer defined. The broadcast, focus, and online managers now guard `window` / `document` before removing their event listeners, so the delayed nanostores cleanup no longer throws `ReferenceError: window is not defined` in environments such as happy-dom that remove the globals before teardown.
