---
"better-auth": patch
---

Add an experimental `oauthPopup` plugin (with `oauthPopupClient` and `signIn.popup`) for popup-based OAuth sign-in. It lets an app sign in inside a cross-site iframe by completing OAuth in a popup and handing the session token back to the opener, where the `bearer` plugin authenticates with it. The API may change while it is experimental.
