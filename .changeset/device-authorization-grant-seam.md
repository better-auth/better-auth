---
"better-auth": minor
---

If you wrote a custom `DeviceAuthorizationGrant`, rename `assertSessionRedemption` to `assertStandaloneUse`. It now also runs for `/device`, `/device/approve`, and `/device/deny`, and receives `use: "redeem"` or `use: "approve"`. `getVerificationContext` and `verificationOpenAPIProperties` were removed, because `/device` no longer returns grant details. Apps that use `deviceAuthorization()` or `oauthDeviceAuthorization()` without a custom grant are unaffected.
