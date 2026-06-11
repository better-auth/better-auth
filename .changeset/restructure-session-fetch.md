---
"better-auth": patch
---

Session refreshes now avoid duplicate `/get-session` requests from focus and other browser session events. Client hooks keep stable data references when refetches return unchanged data, reducing unnecessary renders. Unmounting during an in-flight session request no longer leaves session state stuck in a loading state.
