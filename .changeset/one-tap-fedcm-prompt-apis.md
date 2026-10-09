---
"better-auth": patch
---

Fix Google One Tap FedCM prompt handling to avoid calling deprecated moment APIs (`isNotDisplayed`, `getSkippedReason`) when FedCM is enabled, matching Google's FedCM migration guide.
