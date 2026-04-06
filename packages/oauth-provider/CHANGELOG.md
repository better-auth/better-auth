# @better-auth/oauth-provider

## 1.5.7

### Patch Changes

- [#8632](https://github.com/better-auth/better-auth/pull/8632) [`e5091ee`](https://github.com/better-auth/better-auth/commit/e5091ee1e64fcbe69bdeb4ed86e774e32ca85d7d) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - fix PAR scope loss, loopback redirect matching, and DCR skip_consent
  - **PAR (RFC 9126)**: resolve `request_uri` into stored params before processing; discard front-channel URL params per §4 to prevent prompt/scope injection
  - **Loopback (RFC 8252 §7.3)**: port-agnostic redirect URI matching for `127.0.0.1` and `[::1]`; scheme, host, path, and query must still match
  - **DCR**: accept `skip_consent` in schema but reject it during dynamic registration to prevent privilege escalation
  - **Serialization**: fix `oAuthState` query serialization and preserve non-string values like `max_age`

- Updated dependencies [[`dd537cb`](https://github.com/better-auth/better-auth/commit/dd537cbdeb618abe9e274129f1670d0c03e89ae5), [`bd9bd58`](https://github.com/better-auth/better-auth/commit/bd9bd58f8768b2512f211c98c227148769d533c5), [`141781d`](https://github.com/better-auth/better-auth/commit/141781d6fc98255b5db90363374add314f3095d7), [`469eee6`](https://github.com/better-auth/better-auth/commit/469eee6d846b32a43f36b418868e6a4c916382dc), [`560230f`](https://github.com/better-auth/better-auth/commit/560230f751dfc5d6efc8f7f3f12e5970c9ba09ea)]:
  - better-auth@1.5.7
  - @better-auth/core@1.5.7
