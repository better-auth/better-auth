---
"@better-auth/core": minor
---

`KakaoProfile.kakao_account` is now optional, so profile mappings must handle its absence. Authorization requests separate consent scopes with commas as documented by Kakao.
