---
"@better-auth/cimd": minor
---

Metadata documents can now carry registration fields that an OAuth provider extension declares, such as CIBA's `backchannel_token_delivery_mode`. They are stored in the client's `metadata` and validated by the extension. A refresh replaces them, so a field removed from the document is removed from the client. Other unknown members are still ignored. Setups without such an extension are unaffected.
