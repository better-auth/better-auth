---
"better-auth": patch
---

The Google One Tap prompt (`authClient.oneTap()` without `button`) no longer calls `getSkippedReason()`, which Google's FedCM migration guide says to remove. Before, it called it under any `promptOptions.fedCM` setting.

A skipped prompt now ends the flow and calls `onPromptNotification` right away instead of retrying. Google doesn't report why a prompt was skipped, and a prompt the user closed stays hidden for Google's cooldown period, so the retries could not bring it back. Dismissed prompts still retry as before.

Google Identity Services still logs its FedCM migration warning, because it does so whenever `prompt()` receives a listener. The plugin needs the listener to track dismissals and skips, so the warning is expected and safe to ignore.
