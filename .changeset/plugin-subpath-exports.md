---
"better-auth": patch
---

You can now import the Captcha and OpenAPI plugins from `better-auth/plugins/captcha` and `better-auth/plugins/open-api`, as you can for other plugins. Previously these imports failed with a "not exported" error. Imports from `better-auth/plugins` are unchanged.

If your TypeScript config uses `"moduleResolution": "node"` (or `node10`), `better-auth/plugins/multi-session` and `better-auth/test` now resolve their types. Previously TypeScript reported that it could not find their declarations. Projects using `bundler`, `node16`, or `nodenext` resolution are unaffected.
