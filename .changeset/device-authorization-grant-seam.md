---
"better-auth": minor
---

If you wrote a custom `DeviceAuthorizationGrant`, rename `assertSessionRedemption` to `assertStandaloneUse`. It now also runs for `/device`, `/device/approve`, and `/device/deny`, and receives `use: "redeem"` or `use: "approve"`. `getVerificationContext`, `verificationOpenAPIProperties`, and the interface's second type parameter were removed, because `/device` no longer returns grant details. A grant that approves codes on its own pages can use the newly exported `findDeviceCodeByUserCode`, `assertDeviceCodePending`, `decideDeviceCode`, and `buildVerificationUris`. Apps that use `deviceAuthorization()` or `oauthDeviceAuthorization()` without a custom grant are unaffected.
