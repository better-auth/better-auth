# @better-auth/mcp

## 1.8.0-beta.12

### Patch Changes

- Updated dependencies [[`19e30f1`](https://github.com/better-auth/better-auth/commit/19e30f1a7ca042737b4d82fb95b08afda8417d15)]:
  - @better-auth/oauth-provider@1.8.0-beta.12

## 1.8.0-beta.11

### Minor Changes

- [#12714](https://github.com/better-auth/better-auth/pull/12714) [`59ac3db`](https://github.com/better-auth/better-auth/commit/59ac3db5a4d4c9061a1a71f225dd56e1a47dfcd5) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - `requireMcpAuth` without an `issuer` option now expects the OAuth provider's issuer, which follows a custom `jwt.issuer`. Before, it expected the base URL, so with a custom `jwt.issuer` it rejected every token unless you passed `issuer`. When it reads this server's records or keys in-process, the default also accepts the issuer as configured, which tokens issued by earlier versions carry. When it checks a signature against keys fetched from a URL (`jwksUrl`, or the JWT plugin's `jwks.remoteUrl` with no OAuth provider in the same process), it expects the discovery issuer alone, as RFC 9068 requires an exact match. An `issuer` you pass is still the only value accepted.

- [#12672](https://github.com/better-auth/better-auth/pull/12672) [`fd9c4e3`](https://github.com/better-auth/better-auth/commit/fd9c4e33c932d96090f8e203cb6eb45246e7f2f6) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - `requireMcpAuth` passes the handler the `sub` the access token carries, as in 1.7, instead of the internal user ID that 1.8.0-beta.10 passed. For a client with `subject_type: "pairwise"`, an opaque token's `sub` is now its pairwise subject, as at `/oauth2/introspect`, and a JWT's `sub` is the pairwise subject when the provider sets `accessTokenSubject: "pairwise"`. Other tokens keep the user ID.

  **Breaking for 1.8.0-beta.10 users:** beta.10 passed the user ID even for pairwise tokens. An MCP handler that looks users up by `sub` for pairwise clients must now map the pairwise subject itself, or keep those clients on `subject_type: "public"`.

### Patch Changes

- Updated dependencies [[`e8bec54`](https://github.com/better-auth/better-auth/commit/e8bec545ba5c45ed7954299c0eec22f1dd9bb291), [`ef8cf42`](https://github.com/better-auth/better-auth/commit/ef8cf42641499e7524e01f1a129970b4bcfd7744), [`77d3d68`](https://github.com/better-auth/better-auth/commit/77d3d681f09249909dc6f81c6a0d168529af0921), [`5c0d511`](https://github.com/better-auth/better-auth/commit/5c0d511d3894b584ea46dc52dfe002f7b51023d5), [`08dba6c`](https://github.com/better-auth/better-auth/commit/08dba6c5eed1118a0aa6770c3aab1f3df5e27704), [`3474817`](https://github.com/better-auth/better-auth/commit/347481710d191ee0633efd481cdf42f54d5d6dd5), [`5a70b57`](https://github.com/better-auth/better-auth/commit/5a70b5750e25aa7a08eb89b0b8d34797c3ab4446), [`7db5d57`](https://github.com/better-auth/better-auth/commit/7db5d578a983982f6b9e4a3d6d95841d959e3f08), [`d400387`](https://github.com/better-auth/better-auth/commit/d40038721d385b5245e9d3964c44ea387f472145), [`8c353a9`](https://github.com/better-auth/better-auth/commit/8c353a91c84d7dc878d537c3d72679fe636f0e23), [`728ca38`](https://github.com/better-auth/better-auth/commit/728ca386e05bcf1542e38f99d80e6567b38316a5), [`f1f3756`](https://github.com/better-auth/better-auth/commit/f1f3756f20f69c7420c68600fa581a2b4698a1dd), [`0ec5476`](https://github.com/better-auth/better-auth/commit/0ec5476221cdbd43e6c895734097cf766cb5d2de), [`4dcff54`](https://github.com/better-auth/better-auth/commit/4dcff5447c470b7531310b41326295da6b4e9aae), [`597cb4e`](https://github.com/better-auth/better-auth/commit/597cb4e455225a3d102887298639d8c5eb2ea89b), [`78a6840`](https://github.com/better-auth/better-auth/commit/78a6840b73524292fdfc2400c4c9f1d64b8ee6ce), [`2b50aa7`](https://github.com/better-auth/better-auth/commit/2b50aa7100aeaee8a4d2e0f686e36953ff893cd4), [`558f5b4`](https://github.com/better-auth/better-auth/commit/558f5b48895136025a177d07459e2128ea1d7324), [`21a4a27`](https://github.com/better-auth/better-auth/commit/21a4a27138464d83c10456dc33c6f71ed0e9be34), [`9bf21d1`](https://github.com/better-auth/better-auth/commit/9bf21d13347b3c20606a6a8284d51ab868847671), [`59ac3db`](https://github.com/better-auth/better-auth/commit/59ac3db5a4d4c9061a1a71f225dd56e1a47dfcd5), [`638524c`](https://github.com/better-auth/better-auth/commit/638524ceb1b1558f686b7ebce6b5f24c584f6463), [`2b50aa7`](https://github.com/better-auth/better-auth/commit/2b50aa7100aeaee8a4d2e0f686e36953ff893cd4), [`dcc9d6f`](https://github.com/better-auth/better-auth/commit/dcc9d6fd9aa0d73e9723e3732aa0ad1eb37e95c6), [`4b52db2`](https://github.com/better-auth/better-auth/commit/4b52db215295247803cda8da693c77acfc3b2dd3), [`d2ce298`](https://github.com/better-auth/better-auth/commit/d2ce298ab36ea1136e510329202bd0834e097683), [`08dba6c`](https://github.com/better-auth/better-auth/commit/08dba6c5eed1118a0aa6770c3aab1f3df5e27704), [`f9339b6`](https://github.com/better-auth/better-auth/commit/f9339b63099de2d10a3ee4ee47083141ee1a554c), [`4df74f1`](https://github.com/better-auth/better-auth/commit/4df74f13b9d1e84fb6b46df69179ca79c7a132ac)]:
  - @better-auth/oauth-provider@1.8.0-beta.11

## 1.8.0-beta.10

### Minor Changes

- [#12597](https://github.com/better-auth/better-auth/pull/12597) [`249a88d`](https://github.com/better-auth/better-auth/commit/249a88d41ca80f3a0c767ffcfc53ca39ba046999) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - When the OAuth provider runs in the same process, `requireMcpAuth` now checks access tokens against its records instead of verifying JWT signatures alone. It accepts opaque access tokens, and it rejects a token that was revoked, whose session ended, or whose client is disabled on the next request.

  The claims passed to the handler carry the user ID in `sub`, even when the token's own `sub` is pairwise. An unrecognized token's challenge now says `error_description="token inactive"`. To keep verifying JWT signatures alone, set `jwksUrl`.

### Patch Changes

- Updated dependencies [[`20176ed`](https://github.com/better-auth/better-auth/commit/20176ed728daca51a15c7a44dff3c4a4d32f5220), [`4913d04`](https://github.com/better-auth/better-auth/commit/4913d04fda4fa5ee08fb55a6bb4029cda910490f), [`f3e2877`](https://github.com/better-auth/better-auth/commit/f3e28778c84151015e33ecae6695b87a3cf2651e), [`f3e2877`](https://github.com/better-auth/better-auth/commit/f3e28778c84151015e33ecae6695b87a3cf2651e), [`be51a39`](https://github.com/better-auth/better-auth/commit/be51a3916f9bd8f646d44954a310ec09176a3358), [`7219b6b`](https://github.com/better-auth/better-auth/commit/7219b6bf45414f01fc2b15f19737ec5554b7ea1c), [`2124c93`](https://github.com/better-auth/better-auth/commit/2124c93bef985136654d869cfecce47c5ea4882a), [`1bdad2f`](https://github.com/better-auth/better-auth/commit/1bdad2f5ed8b064f82aaf803bc105ddd0e827fee), [`20176ed`](https://github.com/better-auth/better-auth/commit/20176ed728daca51a15c7a44dff3c4a4d32f5220), [`5833a83`](https://github.com/better-auth/better-auth/commit/5833a83c54f7d0f995595720f4b56f9714a70152), [`53d1bce`](https://github.com/better-auth/better-auth/commit/53d1bce0d4decf4a579ce0329c1b38cfbde79207), [`0a0101b`](https://github.com/better-auth/better-auth/commit/0a0101b8f149603dba2755e7d16e78877f59b028), [`9cb5cd0`](https://github.com/better-auth/better-auth/commit/9cb5cd0e38ace8c1652bc91f0b3c6e01c21787ec), [`c0be1c1`](https://github.com/better-auth/better-auth/commit/c0be1c1b7c816209cb05f398114c3f1fa84e534c), [`c0be1c1`](https://github.com/better-auth/better-auth/commit/c0be1c1b7c816209cb05f398114c3f1fa84e534c), [`dd55cd5`](https://github.com/better-auth/better-auth/commit/dd55cd57f48e6cebaa750bc6b7ae562daeded1e3), [`e65ee9e`](https://github.com/better-auth/better-auth/commit/e65ee9ed7e41e3f37ba8eb413560f6c4a63e8f70), [`e1aa7a4`](https://github.com/better-auth/better-auth/commit/e1aa7a40c36e09f4188b9b1bdfa4f8347474bb56), [`bf97152`](https://github.com/better-auth/better-auth/commit/bf971528dcd353f9942db2877b05e8242964f23c), [`b6e1383`](https://github.com/better-auth/better-auth/commit/b6e1383afa020911a7d75dfa6ab000402e5018ad), [`9cb5cd0`](https://github.com/better-auth/better-auth/commit/9cb5cd0e38ace8c1652bc91f0b3c6e01c21787ec), [`aa33128`](https://github.com/better-auth/better-auth/commit/aa331287973a0c18e1c8ad64b3aff27f3387ef95), [`d268e42`](https://github.com/better-auth/better-auth/commit/d268e42683214f1655c051236cb4d6f11ee5489e), [`d703d4f`](https://github.com/better-auth/better-auth/commit/d703d4fa4b27e27b5ffd1b49081c527fc4866da5), [`0a0101b`](https://github.com/better-auth/better-auth/commit/0a0101b8f149603dba2755e7d16e78877f59b028), [`23ad504`](https://github.com/better-auth/better-auth/commit/23ad50454291209898a56c9b7671afd1a21fbcba), [`d703d4f`](https://github.com/better-auth/better-auth/commit/d703d4fa4b27e27b5ffd1b49081c527fc4866da5), [`d3a3624`](https://github.com/better-auth/better-auth/commit/d3a362468f8ccaf9ef86ace4a7946f62e08b5812), [`20176ed`](https://github.com/better-auth/better-auth/commit/20176ed728daca51a15c7a44dff3c4a4d32f5220), [`2e65ae2`](https://github.com/better-auth/better-auth/commit/2e65ae2541be7d1554605113983d4870561b255e), [`670b682`](https://github.com/better-auth/better-auth/commit/670b682f4280cd9364143121dceb53f85c6165df), [`4cf8fa4`](https://github.com/better-auth/better-auth/commit/4cf8fa4206ba74bce4a0642f1f4a68983ef11028), [`4b21a39`](https://github.com/better-auth/better-auth/commit/4b21a39e200fb9b06623b8bc183a57a26583bf7b), [`10243fd`](https://github.com/better-auth/better-auth/commit/10243fd48d2bf085c4e297870731b3d20b75e8be), [`9c5d7c2`](https://github.com/better-auth/better-auth/commit/9c5d7c21d696bcb0780e5306f30c080c5d9f706b), [`9c5d7c2`](https://github.com/better-auth/better-auth/commit/9c5d7c21d696bcb0780e5306f30c080c5d9f706b), [`a503a34`](https://github.com/better-auth/better-auth/commit/a503a34ea466fb0c01ae3089c9c7c5ab71c5bfe3), [`4913d04`](https://github.com/better-auth/better-auth/commit/4913d04fda4fa5ee08fb55a6bb4029cda910490f), [`e1fb9ff`](https://github.com/better-auth/better-auth/commit/e1fb9ff2f924fe315718bc458ffbfc99063a6aeb)]:
  - @better-auth/oauth-provider@1.8.0-beta.10

## 1.8.0-beta.9

### Patch Changes

- Updated dependencies [[`d55aaa4`](https://github.com/better-auth/better-auth/commit/d55aaa46a92225356eb610a887e665209c2eff4c), [`f85e180`](https://github.com/better-auth/better-auth/commit/f85e18016c6a7007cd3698850fad78fa63fa0a71), [`3d9db7a`](https://github.com/better-auth/better-auth/commit/3d9db7a78960f33f56e80a17c7f988e2fe57b097), [`c1c19fe`](https://github.com/better-auth/better-auth/commit/c1c19fe4047f28984219dd6e60d579dc0f517166), [`868ba35`](https://github.com/better-auth/better-auth/commit/868ba355e38b18e825fe39d9766d788c923d3b4a), [`fc81d8e`](https://github.com/better-auth/better-auth/commit/fc81d8ec1c96b4718b1673c0d2147872d29a722e)]:
  - @better-auth/oauth-provider@1.8.0-beta.9

## 1.8.0-beta.8

### Minor Changes

- [#12376](https://github.com/better-auth/better-auth/pull/12376) [`b91d155`](https://github.com/better-auth/better-auth/commit/b91d155bf775b43186bd2c817446c367bdfab657) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - The OAuth provider can require server-provided DPoP nonces (RFC 9449 §8 and §9). A nonce stops a client from using DPoP proofs it signed ahead of time. Set `dpop: { nonce: { required: true } }` on `oauthProvider()` or `mcp()`. The token and UserInfo endpoints then answer a proof without a current nonce with `use_dpop_nonce` and a fresh nonce in the `DPoP-Nonce` header. Successful DPoP responses carry the next nonce. The token endpoint checks the nonce before it redeems an authorization code, device code, or refresh token, so the client's retry still succeeds. Nonces are derived from the auth secret and are not stored, so any instance that shares the secret accepts them.

  Resource servers can require nonces too. Pass `dpop: { nonce: { required: true, secret } }` to `verifyAccessTokenRequest`, answer failures with `createResourceServerChallenge`, and send the next nonce with `createDpopNonce({ secret })` from `better-auth/oauth2`. Responses the library builds with a nonce are marked `Cache-Control: no-store`; mark your own nonce-bearing responses the same way. `requireMcpAuth` and the resource client created with your auth instance default to the auth secret and the provider's nonce lifetime.

### Patch Changes

- Updated dependencies [[`b91d155`](https://github.com/better-auth/better-auth/commit/b91d155bf775b43186bd2c817446c367bdfab657), [`bca6570`](https://github.com/better-auth/better-auth/commit/bca65701bfcf9e416d1850506adbac542eaabde4)]:
  - @better-auth/oauth-provider@1.8.0-beta.8

## 1.8.0-beta.7

### Patch Changes

- Updated dependencies []:
  - @better-auth/oauth-provider@1.8.0-beta.7

## 1.8.0-beta.6

### Patch Changes

- Updated dependencies [[`82b3c47`](https://github.com/better-auth/better-auth/commit/82b3c47121cfd16de7ca7606f898e657a55ebe01), [`ba21f31`](https://github.com/better-auth/better-auth/commit/ba21f310679512006f95d5629956889660f7263b)]:
  - @better-auth/oauth-provider@1.8.0-beta.6

## 1.8.0-beta.5

### Patch Changes

- Updated dependencies [[`de9fb2b`](https://github.com/better-auth/better-auth/commit/de9fb2b91d3248f844729477b050f9bd8e8dbfda)]:
  - @better-auth/oauth-provider@1.8.0-beta.5

## 1.8.0-beta.4

### Patch Changes

- Updated dependencies []:
  - @better-auth/oauth-provider@1.8.0-beta.4

## 1.8.0-beta.3

### Patch Changes

- Updated dependencies []:
  - @better-auth/oauth-provider@1.8.0-beta.3

## 1.8.0-beta.2

### Patch Changes

- Updated dependencies [[`39235e1`](https://github.com/better-auth/better-auth/commit/39235e1433118ca3359bc7b7cc22979f47f05b12)]:
  - @better-auth/oauth-provider@1.8.0-beta.2

## 1.8.0-beta.1

### Patch Changes

- Updated dependencies [[`92ec221`](https://github.com/better-auth/better-auth/commit/92ec221d66693e518635c6f3052a29fa7d403183)]:
  - @better-auth/oauth-provider@1.8.0-beta.1

## 1.8.0-beta.0

### Patch Changes

- Updated dependencies [[`5fd850f`](https://github.com/better-auth/better-auth/commit/5fd850f926a9500219d14d13adc5cbd2436d105e), [`94907fd`](https://github.com/better-auth/better-auth/commit/94907fd5ffc10ad8263b77b49dd7539f5fa72651), [`034da07`](https://github.com/better-auth/better-auth/commit/034da07dbe92a0ce0ef735f2f31baff756cc25d1), [`ec0afde`](https://github.com/better-auth/better-auth/commit/ec0afdef5aa6d0dfb93b14357ae470977e28ecdf), [`ec0afde`](https://github.com/better-auth/better-auth/commit/ec0afdef5aa6d0dfb93b14357ae470977e28ecdf), [`034da07`](https://github.com/better-auth/better-auth/commit/034da07dbe92a0ce0ef735f2f31baff756cc25d1), [`296133c`](https://github.com/better-auth/better-auth/commit/296133cc414ac24283ed8e33501e2e4e501ab5e0), [`cd404a0`](https://github.com/better-auth/better-auth/commit/cd404a0b46abb929ccaea0129ecdff23fb074a8f), [`ed71a21`](https://github.com/better-auth/better-auth/commit/ed71a211e803f9f336ebfa83c4ef96610e621fd1), [`c750fc5`](https://github.com/better-auth/better-auth/commit/c750fc5ad2cccf42d3bc6de9820c510a8cdb2cd4), [`2417879`](https://github.com/better-auth/better-auth/commit/2417879cf6b2cb5c97ab679b83df0038760e045d), [`034da07`](https://github.com/better-auth/better-auth/commit/034da07dbe92a0ce0ef735f2f31baff756cc25d1), [`c750fc5`](https://github.com/better-auth/better-auth/commit/c750fc5ad2cccf42d3bc6de9820c510a8cdb2cd4), [`034da07`](https://github.com/better-auth/better-auth/commit/034da07dbe92a0ce0ef735f2f31baff756cc25d1), [`9f53222`](https://github.com/better-auth/better-auth/commit/9f532221bee7cd99a5c4e6593313dead87bf8f0d), [`c7c8331`](https://github.com/better-auth/better-auth/commit/c7c83314009540df912fb608b746fad3c02214ee), [`0d4609f`](https://github.com/better-auth/better-auth/commit/0d4609f4a904d919353acae7ef04d2e68ff1be15), [`6e5a88e`](https://github.com/better-auth/better-auth/commit/6e5a88e57b0b5253bc49797cede415ff27a82931)]:
  - better-auth@1.8.0-beta.0
  - @better-auth/oauth-provider@1.8.0-beta.0
  - @better-auth/core@1.8.0-beta.0

## 1.7.27

### Patch Changes

- Updated dependencies [[`89e01c8`](https://github.com/better-auth/better-auth/commit/89e01c84249dcb920464b51d4aaff6a8386c8ef1), [`2a11b26`](https://github.com/better-auth/better-auth/commit/2a11b2687640211b38ba999fdf791e24af5775a0), [`0706b66`](https://github.com/better-auth/better-auth/commit/0706b6660308e2313d1b6dd37acdaa75ad5b5ef0), [`9f4dece`](https://github.com/better-auth/better-auth/commit/9f4dece3684f4a4a16cdd7720f705ab5cae2e15c), [`260b869`](https://github.com/better-auth/better-auth/commit/260b86979594b89a983c24daf90e9ff4efb290b6), [`ca5f6b4`](https://github.com/better-auth/better-auth/commit/ca5f6b4376c08272206f64e3cb8c380cfa749964), [`ca5f6b4`](https://github.com/better-auth/better-auth/commit/ca5f6b4376c08272206f64e3cb8c380cfa749964), [`b89c0d2`](https://github.com/better-auth/better-auth/commit/b89c0d26e777470d0b1f9a0baecbec8cf1842768), [`0c6305e`](https://github.com/better-auth/better-auth/commit/0c6305e21225d58e7e42c71469a6c366fa02e69f), [`7db8d0b`](https://github.com/better-auth/better-auth/commit/7db8d0b563f09b0742d26f9b5aa7cb12d4152708), [`7db8d0b`](https://github.com/better-auth/better-auth/commit/7db8d0b563f09b0742d26f9b5aa7cb12d4152708), [`32b8b6e`](https://github.com/better-auth/better-auth/commit/32b8b6e7448a5715a3588e23c3c62fc5eadeade1), [`3a7e13c`](https://github.com/better-auth/better-auth/commit/3a7e13c5ed47e224d29ce2b64495f95e4b1212c9), [`70a7143`](https://github.com/better-auth/better-auth/commit/70a7143729b3852b656fa1c36c9e2c8cb91797da), [`929e29f`](https://github.com/better-auth/better-auth/commit/929e29f8987cd37287136201e8ad4d2a7b4ca174), [`2a11b26`](https://github.com/better-auth/better-auth/commit/2a11b2687640211b38ba999fdf791e24af5775a0), [`dd04a88`](https://github.com/better-auth/better-auth/commit/dd04a88384d8ac8f935c47872318a3dac000f43b), [`297ef88`](https://github.com/better-auth/better-auth/commit/297ef887c91c3d19876019db7e63f51bb81b2a78), [`297ef88`](https://github.com/better-auth/better-auth/commit/297ef887c91c3d19876019db7e63f51bb81b2a78), [`50f7240`](https://github.com/better-auth/better-auth/commit/50f72404050f327715b0089491118d2c62875b7e)]:
  - @better-auth/oauth-provider@1.7.27

## 1.7.26

### Patch Changes

- [#12624](https://github.com/better-auth/better-auth/pull/12624) [`7604fd4`](https://github.com/better-auth/better-auth/commit/7604fd45d8587699bdba74705a93e66a01ac4c6b) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - The OAuth provider and `requireMcpAuth` no longer cache keys returned by a custom JWT plugin `adapter.getJwks`, so keys it returns for one tenant or request can no longer verify a token presented in another. They now call it on every verification; cache inside the store if reads are expensive. The built-in database store is still cached.

- [#12624](https://github.com/better-auth/better-auth/pull/12624) [`7604fd4`](https://github.com/better-auth/better-auth/commit/7604fd45d8587699bdba74705a93e66a01ac4c6b) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - A custom JWT plugin `adapter.getJwks` again receives the request being verified when the OAuth provider reads signing keys for introspection, revocation, or end-session, and when `requireMcpAuth` verifies a token. Since 1.7.25 it received only the auth context, without `request` or `headers`, so a key store that picks keys by the request's host or headers found none.

- Updated dependencies [[`f242834`](https://github.com/better-auth/better-auth/commit/f2428340b9b58609401d3c4a06b0779684687248), [`d04ea26`](https://github.com/better-auth/better-auth/commit/d04ea262d2c39df5ef76d433dca6a44dfa84ed1e), [`7604fd4`](https://github.com/better-auth/better-auth/commit/7604fd45d8587699bdba74705a93e66a01ac4c6b), [`7604fd4`](https://github.com/better-auth/better-auth/commit/7604fd45d8587699bdba74705a93e66a01ac4c6b), [`eca5b9c`](https://github.com/better-auth/better-auth/commit/eca5b9cc02fe97d32de3130e31fec2bc17269335), [`1904081`](https://github.com/better-auth/better-auth/commit/1904081ba517707eeaa6a0a44c483102ca82c884), [`b9369e5`](https://github.com/better-auth/better-auth/commit/b9369e5c4756d3def4d0796d537b56c6975e4f1a), [`b0cda69`](https://github.com/better-auth/better-auth/commit/b0cda692bc85ce5425c2cbdb43fe26aeef307844)]:
  - @better-auth/oauth-provider@1.7.26

## 1.7.25

### Patch Changes

- [#12587](https://github.com/better-auth/better-auth/pull/12587) [`75c0821`](https://github.com/better-auth/better-auth/commit/75c0821fa61c8ed0ea20f1027d5ad42d16e0daae) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - DPoP now works on deployments that keep verification values only in secondary storage. Before, every request with a DPoP proof to the OAuth provider, UserInfo, or `requireMcpAuth` failed with a 500 error unless `verification.storeInDatabase: true` was set. Used proofs are now recorded in secondary storage, so a replayed proof is still rejected across instances. `createDpopReplayStore` now also accepts the auth context, as `createDpopReplayStore(await auth.$context)`, and picks the same storage.

- Updated dependencies [[`75c0821`](https://github.com/better-auth/better-auth/commit/75c0821fa61c8ed0ea20f1027d5ad42d16e0daae), [`ad07edd`](https://github.com/better-auth/better-auth/commit/ad07edda1bcb4b5e40368989aa70801839a5926b), [`7fab39e`](https://github.com/better-auth/better-auth/commit/7fab39e988eb0e57378f6138875c1ddc82e44697), [`7fab39e`](https://github.com/better-auth/better-auth/commit/7fab39e988eb0e57378f6138875c1ddc82e44697), [`7fab39e`](https://github.com/better-auth/better-auth/commit/7fab39e988eb0e57378f6138875c1ddc82e44697)]:
  - @better-auth/oauth-provider@1.7.25

## 1.7.24

### Patch Changes

- [#12502](https://github.com/better-auth/better-auth/pull/12502) [`0597f4c`](https://github.com/better-auth/better-auth/commit/0597f4c2f3e576c90e22866bfcf81384c7af308f) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Official packages now accept any `better-call` 1.4 patch release from 1.4.5 as a peer.

- Updated dependencies [[`0597f4c`](https://github.com/better-auth/better-auth/commit/0597f4c2f3e576c90e22866bfcf81384c7af308f), [`d7f831c`](https://github.com/better-auth/better-auth/commit/d7f831cdd4ae3a5ebf591641d34a0b2561316aa8), [`87ede79`](https://github.com/better-auth/better-auth/commit/87ede7984d4df152ae3c0f5a58a2d08299b24281), [`3dcbc10`](https://github.com/better-auth/better-auth/commit/3dcbc1044cf8bf2d51bd73273581a980c5400591)]:
  - @better-auth/oauth-provider@1.7.24

## 1.7.23

### Patch Changes

- [#12525](https://github.com/better-auth/better-auth/pull/12525) [`06925b3`](https://github.com/better-auth/better-auth/commit/06925b35dd14ca39e2080fb2b8e85c14f5c2931b) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Answer a DPoP request whose token lacks a required scope with a `DPoP` challenge. Before, the `insufficient_scope` 403 always carried a `Bearer` challenge, even when the client sent a valid DPoP-bound token and proof. The `DPoP` challenge keeps `error="insufficient_scope"` and the missing scopes in `scope`, so the client can still authorize again for them. Like other `DPoP` challenges, it lists the accepted proof algorithms in `algs` and has no `resource_metadata`. A `Bearer` request still gets the `Bearer` challenge with `resource_metadata`. This applies when `createResourceServerChallenge` receives the failed `request`, which the resource client's `verifyAccessTokenRequest`, `requireMcpAuth`, and `createMcpProtectedRequestHandler` pass automatically, including for an `insufficient_scope` error thrown by an MCP tool handler.

- [#12521](https://github.com/better-auth/better-auth/pull/12521) [`7c61c40`](https://github.com/better-auth/better-auth/commit/7c61c40534b878f6e53d50daf03fba5db6fbdd59) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Browser clients on another origin can now read resource-server and MCP `WWW-Authenticate` challenges. `createResourceServerChallenge`, and the resource client and MCP helpers built on it, now send `Access-Control-Expose-Headers: WWW-Authenticate` with every Bearer, `insufficient_scope`, and `DPoP` challenge. If your CORS layer sets its own `Access-Control-Expose-Headers`, include `WWW-Authenticate` in it.

- [#12504](https://github.com/better-auth/better-auth/pull/12504) [`35135c6`](https://github.com/better-auth/better-auth/commit/35135c64d2f9bb8c4bf7c464cc9f66d0bf1c1a7a) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - The `dpop.replayStore` JSDoc on `createMcpProtectedRequestHandler` now says the default store is in memory and safe only for a single long-lived instance, and that multi-instance or serverless deployments should pass a shared store such as `createDpopReplayStore(internalAdapter)`.

- [#12501](https://github.com/better-auth/better-auth/pull/12501) [`cfa73e9`](https://github.com/better-auth/better-auth/commit/cfa73e90fae636f22179b933c29171bada503515) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - `requireMcpAuth` now accepts tokens when the JWT plugin publishes its keys at `jwks.remoteUrl`. It fetches the keys from that URL instead of the auth server's own `/jwks` endpoint, which the JWT plugin disables in that setup.

- [#12501](https://github.com/better-auth/better-auth/pull/12501) [`cfa73e9`](https://github.com/better-auth/better-auth/commit/cfa73e90fae636f22179b933c29171bada503515) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - `requireMcpAuth` now reads the signing keys from the auth instance instead of requesting its own `/jwks` endpoint, so MCP routes served from the same app as the auth server no longer fail with a 500 on runtimes that block requests to their own hostname, such as a single Cloudflare Worker.

  Set `jwksUrl` to keep fetching the keys over HTTP.

- Updated dependencies [[`b9c259b`](https://github.com/better-auth/better-auth/commit/b9c259b61d453a2ca604b2f054e05e0d0a653625), [`06925b3`](https://github.com/better-auth/better-auth/commit/06925b35dd14ca39e2080fb2b8e85c14f5c2931b), [`7c61c40`](https://github.com/better-auth/better-auth/commit/7c61c40534b878f6e53d50daf03fba5db6fbdd59), [`be0d01c`](https://github.com/better-auth/better-auth/commit/be0d01c8c254dbde2ec35975cd72ac437245b256), [`2959544`](https://github.com/better-auth/better-auth/commit/295954490665cdef7f25f0ec0f7fa671b368bc45)]:
  - @better-auth/oauth-provider@1.7.23

## 1.7.22

### Patch Changes

- [#12447](https://github.com/better-auth/better-auth/pull/12447) [`5976842`](https://github.com/better-auth/better-auth/commit/59768427a963413f1a7a4eb7595b00b395713770) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Answer a failed request that used the `DPoP` authorization scheme with a `DPoP` challenge. Before, an expired, revoked, or otherwise invalid DPoP-bound token got a `Bearer` challenge, which a client that supports only DPoP might not act on. `createResourceServerChallenge` accepts a new `request` option, either the failed `Request` or `{ authorizationHeader }`, and reads the scheme from it. The resource client's `verifyAccessTokenRequest`, `requireMcpAuth`, and `createMcpProtectedRequestHandler` pass it automatically.

- Updated dependencies [[`5976842`](https://github.com/better-auth/better-auth/commit/59768427a963413f1a7a4eb7595b00b395713770), [`e9d8e59`](https://github.com/better-auth/better-auth/commit/e9d8e5977cb37ab1aa3824f1bb67b5c99a444e9b), [`1393028`](https://github.com/better-auth/better-auth/commit/139302823057cdf9693bca48735fca99faf3ccfd)]:
  - @better-auth/oauth-provider@1.7.22

## 1.7.21

### Patch Changes

- Updated dependencies [[`4739122`](https://github.com/better-auth/better-auth/commit/4739122fa67c77cde71c4d1b60d84483fc1bf11b), [`fd66861`](https://github.com/better-auth/better-auth/commit/fd66861c353574418a7bf48e0b79c0ebe4251c1c), [`db930d9`](https://github.com/better-auth/better-auth/commit/db930d90115a1d6182bac83a3f010205d86baa3b), [`900195d`](https://github.com/better-auth/better-auth/commit/900195df3f1313d84301f7b7dc4997845e568a8e), [`9362c0d`](https://github.com/better-auth/better-auth/commit/9362c0d42e7f65a1dbfd6318360cd97ea9dd9d5b), [`b0ced9d`](https://github.com/better-auth/better-auth/commit/b0ced9d2576db02f5c41b493e07e847d5a260e4d), [`79d61b0`](https://github.com/better-auth/better-auth/commit/79d61b0fb0ff3750ec42aa1ef5cd136f573c996b)]:
  - @better-auth/oauth-provider@1.7.21

## 1.7.20

### Patch Changes

- Updated dependencies [[`a3f50d0`](https://github.com/better-auth/better-auth/commit/a3f50d064dd3bd1ee8a83a687ea54428aaec8997), [`dc07ae4`](https://github.com/better-auth/better-auth/commit/dc07ae4565205d27589cb285052455ede56ce3f7), [`1a368a1`](https://github.com/better-auth/better-auth/commit/1a368a15350814822126ca5e4db05772784c9ed8)]:
  - @better-auth/oauth-provider@1.7.20

## 1.7.19

### Patch Changes

- [#12322](https://github.com/better-auth/better-auth/pull/12322) [`76e6a20`](https://github.com/better-auth/better-auth/commit/76e6a207e912a7719067eed81ad71b8ea26af79e) Thanks [@bytaesu](https://github.com/bytaesu)! - Fixed MCP rejecting plain-HTTP `resource` URLs on `.localhost` subdomains as non-HTTPS.

- Updated dependencies [[`76f9d55`](https://github.com/better-auth/better-auth/commit/76f9d554b371c3c7874ccfa54af97a4d4f3db82b), [`b0f795a`](https://github.com/better-auth/better-auth/commit/b0f795a0bbb934b35a7f2601a8853f5a48fbe7ca), [`6080a5e`](https://github.com/better-auth/better-auth/commit/6080a5e542db35016bf8309bc89b033db823f0b3)]:
  - @better-auth/oauth-provider@1.7.19

## 1.7.18

### Patch Changes

- Updated dependencies []:
  - @better-auth/oauth-provider@1.7.18

## 1.7.17

### Patch Changes

- Updated dependencies []:
  - @better-auth/oauth-provider@1.7.17

## 1.7.16

### Patch Changes

- Updated dependencies []:
  - @better-auth/oauth-provider@1.7.16

## 1.7.15

### Patch Changes

- Updated dependencies []:
  - @better-auth/oauth-provider@1.7.15

## 1.7.14

### Patch Changes

- Updated dependencies []:
  - @better-auth/oauth-provider@1.7.14

## 1.7.13

### Patch Changes

- Updated dependencies []:
  - @better-auth/oauth-provider@1.7.13

## 1.7.12

### Patch Changes

- [#11934](https://github.com/better-auth/better-auth/pull/11934) [`2a576f3`](https://github.com/better-auth/better-auth/commit/2a576f39dc6a3c278e28b6ee004c40396b4bab7c) Thanks [@bytaesu](https://github.com/bytaesu)! - `requireMcpAuth` now accepts only OAuth access tokens and rejects session JWTs from the JWT plugin, even when they share the issuer and audience.

- Updated dependencies []:
  - @better-auth/oauth-provider@1.7.12

## 1.7.11

### Patch Changes

- Updated dependencies [[`a1f6f0b`](https://github.com/better-auth/better-auth/commit/a1f6f0bf19ba1be85e977d891d0f0ca43723c0a3), [`37debaa`](https://github.com/better-auth/better-auth/commit/37debaa8a17d11d05f8eeabdb94877a4b1575a1d)]:
  - @better-auth/oauth-provider@1.7.11

## 1.7.10

### Patch Changes

- Updated dependencies [[`cdd491b`](https://github.com/better-auth/better-auth/commit/cdd491b9d023f57f511d2905e0dcf55f565666d6), [`44f14bb`](https://github.com/better-auth/better-auth/commit/44f14bbf82be7352bdafbd78ebdcfa90850eaab0), [`fe550a9`](https://github.com/better-auth/better-auth/commit/fe550a9c57fa0454c6234cd9e46af4ed9eef9201), [`99cdfe7`](https://github.com/better-auth/better-auth/commit/99cdfe7c2e6bb3b8556b1ea8c3a336369cba6976), [`906c32f`](https://github.com/better-auth/better-auth/commit/906c32f4b595c01f14917f753a79b77a068f36f0), [`2fa7e2f`](https://github.com/better-auth/better-auth/commit/2fa7e2f8bb603c1013855d43888ec54f6a442ba4), [`8f3da46`](https://github.com/better-auth/better-auth/commit/8f3da46ae5b1fe577b38bd7952af1116af3087ff), [`963b7f9`](https://github.com/better-auth/better-auth/commit/963b7f9417d676725215ce97e9910370f18d5477), [`e34b828`](https://github.com/better-auth/better-auth/commit/e34b8282747b3b0148b011be4c2f8b07364788a7), [`f42c0c2`](https://github.com/better-auth/better-auth/commit/f42c0c220d42fbfcb672c492e5ef1d2b29da3d2f), [`4d7da0b`](https://github.com/better-auth/better-auth/commit/4d7da0bef84d78e39e855efabbe913067225ce8f)]:
  - @better-auth/oauth-provider@1.7.10

## 1.7.9

### Patch Changes

- Updated dependencies [[`54a0994`](https://github.com/better-auth/better-auth/commit/54a09948e8a98f9166b650f791b083818c3dab27), [`0a1a87e`](https://github.com/better-auth/better-auth/commit/0a1a87e388c0b50c8d18f3c411c6963c205b11f1)]:
  - @better-auth/oauth-provider@1.7.9

## 1.7.8

### Patch Changes

- [#11635](https://github.com/better-auth/better-auth/pull/11635) [`a5d582a`](https://github.com/better-auth/better-auth/commit/a5d582aaffce1a7457e3da0835a046ba6738c442) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Projects that enable `exactOptionalPropertyTypes` with `skipLibCheck: false` no longer get a TS2430 error from the `@better-auth/mcp` type declarations.

- [#10266](https://github.com/better-auth/better-auth/pull/10266) [`c68b2cd`](https://github.com/better-auth/better-auth/commit/c68b2cd8a5a03012ea77071ce74a7708210ea5a9) Thanks [@shiminshen](https://github.com/shiminshen)! - Projects that enable `exactOptionalPropertyTypes` can use the `oauthProvider()` and `mcp()` plugins again. Since 1.7.0, adding either plugin to `betterAuth()` failed to type-check with a TS2322 error.

- Updated dependencies [[`4175b34`](https://github.com/better-auth/better-auth/commit/4175b34a8f70d5abb542ac7fc205dc42f564c03a), [`369176e`](https://github.com/better-auth/better-auth/commit/369176e7f6201b4170269991bd3a14d3722eda41), [`6214610`](https://github.com/better-auth/better-auth/commit/62146108c70bbba57aab034bc79f98f016147e78), [`847acd0`](https://github.com/better-auth/better-auth/commit/847acd02bb2d6d17e757ab2b44a837fa0c3ba669), [`c68b2cd`](https://github.com/better-auth/better-auth/commit/c68b2cd8a5a03012ea77071ce74a7708210ea5a9), [`1a9be41`](https://github.com/better-auth/better-auth/commit/1a9be41d184ee2fcbc7f39b1ef1ab5cb492f7147), [`38f3bb3`](https://github.com/better-auth/better-auth/commit/38f3bb34af7de8b17078a5d4e26bf2f430337b58), [`38f3bb3`](https://github.com/better-auth/better-auth/commit/38f3bb34af7de8b17078a5d4e26bf2f430337b58), [`aaf0d7d`](https://github.com/better-auth/better-auth/commit/aaf0d7da3e854ab6e19c184b682308d4f024e4f0)]:
  - @better-auth/oauth-provider@1.7.8

## 1.7.7

### Patch Changes

- Updated dependencies [[`683ac1d`](https://github.com/better-auth/better-auth/commit/683ac1ddc31f1007171b045230827edb08b99f91), [`b26057e`](https://github.com/better-auth/better-auth/commit/b26057e23a3c4fc8c97c346857751564d57324c6)]:
  - @better-auth/oauth-provider@1.7.7

## 1.7.6

### Patch Changes

- Updated dependencies []:
  - @better-auth/oauth-provider@1.7.6

## 1.7.5

### Patch Changes

- Updated dependencies []:
  - @better-auth/oauth-provider@1.7.5

## 1.7.4

### Patch Changes

- Updated dependencies []:
  - @better-auth/oauth-provider@1.7.4

## 1.7.3

### Patch Changes

- Updated dependencies [[`4d09d50`](https://github.com/better-auth/better-auth/commit/4d09d502254f1bfe65dafc8d813d803225429c4a)]:
  - @better-auth/oauth-provider@1.7.3

## 1.7.2

### Patch Changes

- Updated dependencies [[`bb8d7c4`](https://github.com/better-auth/better-auth/commit/bb8d7c4541992baedd53325761e19a919a805fc7), [`fced1a5`](https://github.com/better-auth/better-auth/commit/fced1a5d360c14e6358f88dedc9014ff862873f1)]:
  - @better-auth/oauth-provider@1.7.2

## 1.7.1

### Patch Changes

- Updated dependencies []:
  - @better-auth/oauth-provider@1.7.1

## 1.7.0

### Minor Changes

- [#10577](https://github.com/better-auth/better-auth/pull/10577) [`5c45abc`](https://github.com/better-auth/better-auth/commit/5c45abcd2094d4a430cc84af6f9719fa0515ad71) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - OAuth clients now store `applicationType` and expose it as `application_type` in OAuth metadata. `tokenEndpointAuthMethod` alone determines authentication: `"none"` is public, and every other method is confidential. The legacy `type` and `public` fields are removed.

  `OAuthClient` no longer has a catch-all string index. Model custom wire extensions explicitly with a named intersection such as `OAuthClient & YourExtensionMetadata`; legacy `type` and `public` fields no longer type-check as unknown baggage.
  - Dynamic, administrative, and user-managed registrations default an omitted `application_type` to `web`. Client ID Metadata Documents preserve an omitted value as `null`.
  - Web redirects require HTTPS on a non-loopback host. Native redirects accept claimed HTTPS URLs, exact HTTP loopback hosts, or reverse-domain private-use schemes.
  - Registration resource options control resource links. `mcp()` contributes its protected resource by default, so standards-based clients no longer need a `resources` extension.
  - `mcp()` no longer enables unauthenticated Dynamic Client Registration. Compose `mcp()` with `cimd()` for Client ID Metadata Documents, or enable both DCR flags explicitly.

  This release requires a database migration. Add `applicationType` and nullable `clientDiscoveryId`; map old `web` and `native` values directly, map `user-agent-based` to `NULL` for manual reclassification, and never derive it from `public`. Set `clientDiscoveryId` only from known discovery provenance, never by inspecting an HTTPS client ID. Deduplicate existing `(clientId, resourceId)` links before adding the new compound unique index, then drop the legacy columns. Deployments with custom schema mappings must apply this backfill manually.

  Machine-to-machine scope authority is now stored separately in nullable `oauthClient.clientCredentialsScopes`. Missing, `NULL`, and empty values deny `client_credentials` token issuance. Only the administrative create and update endpoints expose `client_credentials_scopes`, and assigning a non-empty value requires `clientPrivileges` to approve the new `configure-client-credentials-scopes` action. DCR, CIMD, and user-managed registration cannot assign this field; CIMD refresh preserves an existing administrator-owned value. Remove `clientCredentialGrantDefaultScopes`, backfill every existing client to `[]`, configure `[]` as the default for new rows, then explicitly assign every approved machine scope after auditing the client.

- [#10577](https://github.com/better-auth/better-auth/pull/10577) [`5c45abc`](https://github.com/better-auth/better-auth/commit/5c45abcd2094d4a430cc84af6f9719fa0515ad71) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - MCP clients that hit a scope wall now learn exactly which scopes to ask for. Missing protected scopes produce a `403` with an RFC 6750 `insufficient_scope` `WWW-Authenticate` challenge that names every missing scope. Clients can union those scopes into one authorization request instead of opening one browser redirect per scope.
  - Configure protected scopes with `requiredScopes` through `RequireMcpAuthOptions` or the matching `createMcpProtectedRequestHandler` verifier option. Exact membership remains the default; `isScopeSatisfied` can define hierarchical policies.
  - Use `createInsufficientScopeError` when an operation determines its required scopes dynamically. `createResourceServerChallenge` converts that signal and recognized token failures into safe RFC 6750 challenges.
  - Use `challengeScopes` only as the unauthenticated challenge hint.

  Handler-produced responses, ordinary permission denials, configuration failures, and unrelated thrown values keep their original status and identity.

- [#9992](https://github.com/better-auth/better-auth/pull/9992) [`e53582c`](https://github.com/better-auth/better-auth/commit/e53582ce55a0ddbca62f52efeb3459523816f222) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - The MCP plugin moves out of `better-auth` into its own package, `@better-auth/mcp`, built on `@better-auth/oauth-provider`. Import the authorization plugin and protected-request helpers from the package root. The in-core MCP client (`createMcpAuthClient` and its adapters) is removed; MCP protocol and transport clients come from the official version 2 `@modelcontextprotocol/client` and `@modelcontextprotocol/server` packages. The OAuth endpoints move from `/mcp/*` to `/oauth2/*`, with discovery at `/.well-known/oauth-authorization-server` and protected resource metadata at `/.well-known/oauth-protected-resource`. Discovery-based MCP clients pick up the new locations on their own.

  The shared-auth route helper is renamed from `withMcpAuth` to `requireMcpAuth`. The standalone protected-resource factory is renamed from `mcpHandler` to `createMcpProtectedRequestHandler`; pass one flat `McpProtectedRequestHandlerOptions` object with `issuer`, a single `audience`, optional `jwtVerifyOptions`, token-verification fields, and challenge fields. Its callback receives `accessTokenClaims`. `requireMcpAuth` verifies the access token against the published JWKS, validates DPoP proofs for DPoP-bound tokens, and passes the verified access-token claims to your handler.

  `createInsufficientScopeError` now validates a custom description against the RFC 6750 `error_description` character set when the error is constructed. Invalid descriptions throw `TypeError("invalid error_description")` before an error can reach resource-challenge serialization.

  MCP 2026-07-28 uses a stateless request and response transport. Serve MCP routes with version 2 of `@modelcontextprotocol/server`, configure `createMcpHandler` with `legacy: "reject"`, wrap it with `requireMcpAuth`, and export only `POST`. Remove MCP-route `GET` and `DELETE` exports and session-store options such as `redisUrl`. OAuth clients, consent, authorization codes, refresh tokens, and security records remain durable authorization state.

  To migrate, install `@better-auth/mcp`, `@better-auth/cimd`, and the official version 2 MCP client or server package needed by your application; add the `jwt()` plugin, which is now required for token signing; and move options that were nested under `oidcConfig` to flat options on `mcp({ ... })`. The database models change: `oauthApplication` becomes `oauthClient`, with new `oauthRefreshToken` and `oauthClientAssertion` tables. Regenerate or migrate your schema with `npx auth migrate` or `npx auth generate`.

- [#10039](https://github.com/better-auth/better-auth/pull/10039) [`aedcb97`](https://github.com/better-auth/better-auth/commit/aedcb974f055c3514fe0464dc53d71d45a8a1725) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - feat(oauth-provider)!: DPoP-bound access tokens (RFC 9449)

  OAuth provider integrations can issue and verify DPoP sender-constrained tokens. Clients request them with `dpop_bound_access_tokens` at registration, `dpop_jkt` on the authorization request, or by targeting a resource configured with `dpopBoundAccessTokensRequired`. Issued tokens carry `cnf.jkt`, return `token_type: "DPoP"`, and stay bound through refresh-token rotation, introspection, and userinfo.

  Resource servers verify DPoP requests with `verifyAccessTokenRequest`, which checks the `Authorization: DPoP` scheme, the proof, the request target, the access-token hash, and proof replay. The MCP package advertises DPoP in protected resource metadata and verifies DPoP-bound requests. Proof replay is rejected through the database-backed verification store, so anti-replay holds across instances. `verifyAccessTokenRequest` and `requireMcpAuth` use that store by default; build one with `createDpopReplayStore(internalAdapter)` or pass a custom `dpop.replayStore`. This needs database-backed verification storage: a secondary-storage-only deployment rejects DPoP requests rather than skipping replay protection.

  Breaking: the raw-token verifier `verifyAccessToken` is renamed to `verifyBearerToken`, both in `better-auth/oauth2` and as the `oauthProviderResourceClient` action, and it rejects DPoP-bound tokens. Use `verifyAccessTokenRequest` on any endpoint that may receive them. The resource-request input type is renamed from `AccessTokenRequestInput` to `ResourceRequestInput`, and the DPoP algorithm option is `signingAlgorithms` everywhere.

  Run a schema migration for the DPoP token-binding fields: the `confirmation` column on the access-token and refresh-token tables. DPoP-bound clients also gain `dpopBoundAccessTokens` and resources `dpopBoundAccessTokensRequired`. No dedicated replay table is added; proof replay reuses the verification store.

- [#9648](https://github.com/better-auth/better-auth/pull/9648) [`d2a79ba`](https://github.com/better-auth/better-auth/commit/d2a79bae79b88e2b28cb678f5eefd9759239b627) Thanks [@brentmitchell25](https://github.com/brentmitchell25)! - OAuth provider now models protected resources explicitly. Configure them with `resources` or create them through the `oauthResource` admin API. Each resource can define token TTLs, allowed scopes, custom JWT claims, and JWT signing pins.

  `validAudiences` is removed. Move each existing resource identifier into `resources`; link clients that should be limited to specific resources through `oauthClientResource` or Dynamic Client Registration `resources`.

  Access-token issuance now applies resource policy to the requested RFC 8707 `resource` values. The OAuth provider narrows scopes to resource allowlists, uses the shortest configured TTL, strips reserved RFC 9068 claim names from custom claims, emits `jti`, and keeps repeated `resource` form parameters.

  Refresh-token TTLs now use the shortest applicable lifetime. Deployments with a per-resource `refreshTokenTtl` longer than `refreshTokenExpiresIn` will see refresh tokens expire at the provider default instead of the longer resource value.

  JWT signing can now honor per-resource pins. `signJWT()` accepts `signingKeyId` and `signingAlgorithm`; JWKS adapters expose `getKeyById()` and `getLatestKeyByAlg()`. The `jwks` table adds nullable `alg` and `crv` columns, and `keyPairConfigs` can provision multiple algorithms in one keyring.

  After upgrading, run `npx auth generate` and apply the migration before deploying. The migration adds `oauthResource`, `oauthClientResource`, and the new `jwks` columns. Without it, resources using `signingAlgorithm` cannot find matching keys.

  Resource servers should publish RFC 9728 protected-resource metadata at their own origin. The OAuth provider exposes challenge helpers that point clients at that metadata.

  `@better-auth/mcp` now requires an explicit `resource` option. The plugin stores that identifier as an OAuth resource, publishes RFC 9728 protected-resource metadata for it, and binds issued access tokens to that resource. Existing `mcp({ loginPage, consentPage })` setups should add a protected MCP resource identifier, for example `resource: "https://api.example.com/mcp"`.

- [#10145](https://github.com/better-auth/better-auth/pull/10145) [`5838df2`](https://github.com/better-auth/better-auth/commit/5838df2f4146433164ca16ffdba2d196a4f8ff51) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - OAuth Provider can now replay the same refresh-token response for duplicate refresh requests during a configured `refreshTokenReuseInterval`. OAuth Provider keeps strict replay handling by default; set this option to opt into the overlap window.

  The MCP plugin defaults that interval to 30 seconds for every configured client. A retried refresh can recover the response produced when another request rotated the token. OAuth Provider remains strict by default; set `refreshTokenReuseInterval: 0` on `mcp()` to disable the overlap window.

### Patch Changes

- [#9131](https://github.com/better-auth/better-auth/pull/9131) [`5142e9c`](https://github.com/better-auth/better-auth/commit/5142e9cec55825eb14da0f14022ae02d3c9dfd45) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Dynamic `baseURL` configurations now resolve consistently for direct server API calls and OAuth or MCP discovery:
  - Fail with a clear `APIError` when no base URL can be resolved or the request host violates `allowedHosts`.
  - Apply `advanced.trustedProxyHeaders` before trusting forwarded host and protocol values, and refresh request-dependent trusted origins, trusted providers, and cookies for each direct call.
  - Infer HTTP for loopback development hosts when only headers are available, while rejecting request-like objects without usable URL and header data.
  - Generate OAuth issuer, discovery, protected-resource, and JWKS URLs from the current request host.
  - Make `requireMcpAuth` use the resolved Better Auth URL for its default issuer, resource, and JWKS URL. Resource servers with fully dynamic hosts can use `createMcpProtectedRequestHandler` with explicit verification options.
  - Preserve metadata response headers supplied as `Headers`, tuple arrays, or records.

- Updated dependencies [[`0cbaf81`](https://github.com/better-auth/better-auth/commit/0cbaf81bed9dec4c56880ee78a532262386e1ec5), [`132e293`](https://github.com/better-auth/better-auth/commit/132e293d7a82db30d7d1a63fb32c28df863204ae), [`267229b`](https://github.com/better-auth/better-auth/commit/267229bd24d5f918ac4c9c7eca7507e8c603e310), [`5c45abc`](https://github.com/better-auth/better-auth/commit/5c45abcd2094d4a430cc84af6f9719fa0515ad71), [`cd8313b`](https://github.com/better-auth/better-auth/commit/cd8313ba003a8b3c46b11fefeae9a53305908cc3), [`4fe730a`](https://github.com/better-auth/better-auth/commit/4fe730a9c12f2ff68ca84523817b550adc7b2982), [`6782647`](https://github.com/better-auth/better-auth/commit/6782647d7c2d248246f9ef3980e656725c29ce64), [`e3125e8`](https://github.com/better-auth/better-auth/commit/e3125e872d40cdd6588cbcb65d8ca0d640bae15b), [`508d8d6`](https://github.com/better-auth/better-auth/commit/508d8d6f06488d33a44d11059c873fcb8721d7a1), [`a8200b2`](https://github.com/better-auth/better-auth/commit/a8200b297c4092cb51397a9285ef4d1f024dea75), [`5c6de4e`](https://github.com/better-auth/better-auth/commit/5c6de4ed265e7aa30e7e42a0e493386cf3ad6c96), [`b4b0867`](https://github.com/better-auth/better-auth/commit/b4b086722c2da179f885ad2680e10ed3410ad849), [`c7d2253`](https://github.com/better-auth/better-auth/commit/c7d22539ec4f7322d9625ae2953d397c3863d097), [`335cda7`](https://github.com/better-auth/better-auth/commit/335cda702ef8e2aecad4b26a427f16953e3aabd2), [`e53582c`](https://github.com/better-auth/better-auth/commit/e53582ce55a0ddbca62f52efeb3459523816f222), [`2fd3d58`](https://github.com/better-auth/better-auth/commit/2fd3d5850006d164317d4f53a81ac95f2d1f549a), [`aedcb97`](https://github.com/better-auth/better-auth/commit/aedcb974f055c3514fe0464dc53d71d45a8a1725), [`2196ea6`](https://github.com/better-auth/better-auth/commit/2196ea65e724830d9f1066c6593210579de586b9), [`6f2948e`](https://github.com/better-auth/better-auth/commit/6f2948e87bb5fa14bd2174a91f7143e1eced1b87), [`e0d2b9e`](https://github.com/better-auth/better-auth/commit/e0d2b9eb9b4a515e1b73be71e1e3681faaa9b55f), [`7d1288e`](https://github.com/better-auth/better-auth/commit/7d1288e7c56a2385713cbcc232a376a7fe228be4), [`f68044d`](https://github.com/better-auth/better-auth/commit/f68044dcfbd9fb83763249ed9509cfacbcce47be), [`050ef2d`](https://github.com/better-auth/better-auth/commit/050ef2dfcf22429135b49804de195f945f59f3c1), [`0e1770a`](https://github.com/better-auth/better-auth/commit/0e1770ac7563a27b1daab96d5d571657b3a45f75), [`a796214`](https://github.com/better-auth/better-auth/commit/a7962147b3a759ce6da542300e31f3b5705a63fa), [`d2a79ba`](https://github.com/better-auth/better-auth/commit/d2a79bae79b88e2b28cb678f5eefd9759239b627), [`3e852a2`](https://github.com/better-auth/better-auth/commit/3e852a26500446b2c4ad608933c71b616ceddba5), [`d368217`](https://github.com/better-auth/better-auth/commit/d368217efc1265996460d96c539b2ca669e33d49), [`dd42701`](https://github.com/better-auth/better-auth/commit/dd42701af4b8aa56287c6890a8217a270249571f), [`1e5b808`](https://github.com/better-auth/better-auth/commit/1e5b80847208cf839c9d45363ca19b8eab41c68a), [`801968e`](https://github.com/better-auth/better-auth/commit/801968e354067869318718f4766d7011c0218a86), [`93d3871`](https://github.com/better-auth/better-auth/commit/93d3871bd2f7c2fdd423c4c88a22a50b6333e656), [`0143d69`](https://github.com/better-auth/better-auth/commit/0143d69195870ea6550a40add8618361dbbc3b8f), [`5838df2`](https://github.com/better-auth/better-auth/commit/5838df2f4146433164ca16ffdba2d196a4f8ff51), [`6f9a188`](https://github.com/better-auth/better-auth/commit/6f9a188bbb2665e56be1f1fb566eb1f5f919e1c8), [`f451d1c`](https://github.com/better-auth/better-auth/commit/f451d1c7589ddb4d2995fa54aee9375472ebea33), [`69acb7a`](https://github.com/better-auth/better-auth/commit/69acb7a3db3cd148a9cd1db5063dbdc69909165a), [`5ac6249`](https://github.com/better-auth/better-auth/commit/5ac62493ef7296b4ac89359d257a0a99305ac189), [`6d97c47`](https://github.com/better-auth/better-auth/commit/6d97c4754c80010524b922c39b28a7afd4012457)]:
  - @better-auth/oauth-provider@1.7.0

## 1.7.0-rc.6

### Patch Changes

- Updated dependencies [[`801968e`](https://github.com/better-auth/better-auth/commit/801968e354067869318718f4766d7011c0218a86), [`f451d1c`](https://github.com/better-auth/better-auth/commit/f451d1c7589ddb4d2995fa54aee9375472ebea33)]:
  - @better-auth/oauth-provider@1.7.0-rc.6

## 1.7.0-rc.5

### Patch Changes

- Updated dependencies [[`6782647`](https://github.com/better-auth/better-auth/commit/6782647d7c2d248246f9ef3980e656725c29ce64), [`a796214`](https://github.com/better-auth/better-auth/commit/a7962147b3a759ce6da542300e31f3b5705a63fa)]:
  - @better-auth/oauth-provider@1.7.0-rc.5

## 1.7.0-rc.4

### Patch Changes

- Updated dependencies []:
  - @better-auth/oauth-provider@1.7.0-rc.4

## 1.7.0-rc.3

### Minor Changes

- [#10577](https://github.com/better-auth/better-auth/pull/10577) [`5c45abc`](https://github.com/better-auth/better-auth/commit/5c45abcd2094d4a430cc84af6f9719fa0515ad71) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - OAuth clients now store `applicationType` and expose it as `application_type` in OAuth metadata. `tokenEndpointAuthMethod` alone determines authentication: `"none"` is public, and every other method is confidential. The legacy `type` and `public` fields are removed.

  `OAuthClient` no longer has a catch-all string index. Model custom wire extensions explicitly with a named intersection such as `OAuthClient & YourExtensionMetadata`; legacy `type` and `public` fields no longer type-check as unknown baggage.
  - Dynamic, administrative, and user-managed registrations default an omitted `application_type` to `web`. Client ID Metadata Documents preserve an omitted value as `null`.
  - Web redirects require HTTPS on a non-loopback host. Native redirects accept claimed HTTPS URLs, exact HTTP loopback hosts, or reverse-domain private-use schemes.
  - Registration resource options control resource links. `mcp()` contributes its protected resource by default, so standards-based clients no longer need a `resources` extension.
  - `mcp()` no longer enables unauthenticated Dynamic Client Registration. Compose `mcp()` with `cimd()` for Client ID Metadata Documents, or enable both DCR flags explicitly.

  This release requires a database migration. Add `applicationType` and nullable `clientDiscoveryId`; map old `web` and `native` values directly, map `user-agent-based` to `NULL` for manual reclassification, and never derive it from `public`. Set `clientDiscoveryId` only from known discovery provenance, never by inspecting an HTTPS client ID. Deduplicate existing `(clientId, resourceId)` links before adding the new compound unique index, then drop the legacy columns. Deployments with custom schema mappings must apply this backfill manually.

  Machine-to-machine scope authority is now stored separately in nullable `oauthClient.clientCredentialsScopes`. Missing, `NULL`, and empty values deny `client_credentials` token issuance. Only the administrative create and update endpoints expose `client_credentials_scopes`, and assigning a non-empty value requires `clientPrivileges` to approve the new `configure-client-credentials-scopes` action. DCR, CIMD, and user-managed registration cannot assign this field; CIMD refresh preserves an existing administrator-owned value. Remove `clientCredentialGrantDefaultScopes`, backfill every existing client to `[]`, configure `[]` as the default for new rows, then explicitly assign every approved machine scope after auditing the client.

- [#10577](https://github.com/better-auth/better-auth/pull/10577) [`5c45abc`](https://github.com/better-auth/better-auth/commit/5c45abcd2094d4a430cc84af6f9719fa0515ad71) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - MCP clients that hit a scope wall now learn exactly which scopes to ask for. Missing protected scopes produce a `403` with an RFC 6750 `insufficient_scope` `WWW-Authenticate` challenge that names every missing scope. Clients can union those scopes into one authorization request instead of opening one browser redirect per scope.
  - Configure protected scopes with `requiredScopes` through `RequireMcpAuthOptions` or the matching `createMcpProtectedRequestHandler` verifier option. Exact membership remains the default; `isScopeSatisfied` can define hierarchical policies.
  - Use `createInsufficientScopeError` when an operation determines its required scopes dynamically. `createResourceServerChallenge` converts that signal and recognized token failures into safe RFC 6750 challenges.
  - Use `challengeScopes` only as the unauthenticated challenge hint.

  Handler-produced responses, ordinary permission denials, configuration failures, and unrelated thrown values keep their original status and identity.

### Patch Changes

- Updated dependencies [[`5c45abc`](https://github.com/better-auth/better-auth/commit/5c45abcd2094d4a430cc84af6f9719fa0515ad71), [`5c45abc`](https://github.com/better-auth/better-auth/commit/5c45abcd2094d4a430cc84af6f9719fa0515ad71), [`5c45abc`](https://github.com/better-auth/better-auth/commit/5c45abcd2094d4a430cc84af6f9719fa0515ad71), [`f68044d`](https://github.com/better-auth/better-auth/commit/f68044dcfbd9fb83763249ed9509cfacbcce47be)]:
  - @better-auth/oauth-provider@1.7.0-rc.3

## 1.7.0-rc.2

### Patch Changes

- Updated dependencies [[`69acb7a`](https://github.com/better-auth/better-auth/commit/69acb7a3db3cd148a9cd1db5063dbdc69909165a)]:
  - @better-auth/oauth-provider@1.7.0-rc.2

## 1.7.0-rc.1

### Patch Changes

- Updated dependencies []:
  - @better-auth/oauth-provider@1.7.0-rc.1

## 1.7.0-rc.0

### Patch Changes

- Updated dependencies []:
  - @better-auth/oauth-provider@1.7.0-rc.0

## 1.7.0-beta.7

### Minor Changes

- [#10145](https://github.com/better-auth/better-auth/pull/10145) [`5838df2`](https://github.com/better-auth/better-auth/commit/5838df2f4146433164ca16ffdba2d196a4f8ff51) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - OAuth Provider can now replay the same refresh-token response for duplicate refresh requests during a configured `refreshTokenReuseInterval`. OAuth Provider keeps strict replay handling by default; set this option to opt into the overlap window.

  The MCP plugin defaults that interval to 30 seconds for every configured client. A retried refresh can recover the response produced when another request rotated the token. OAuth Provider remains strict by default; set `refreshTokenReuseInterval: 0` on `mcp()` to disable the overlap window.

### Patch Changes

- Updated dependencies [[`5838df2`](https://github.com/better-auth/better-auth/commit/5838df2f4146433164ca16ffdba2d196a4f8ff51)]:
  - @better-auth/oauth-provider@1.7.0-beta.10

## 1.7.0-beta.6

### Minor Changes

- [#9992](https://github.com/better-auth/better-auth/pull/9992) [`e53582c`](https://github.com/better-auth/better-auth/commit/e53582ce55a0ddbca62f52efeb3459523816f222) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - The MCP plugin moves out of `better-auth` into its own package, `@better-auth/mcp`, built on `@better-auth/oauth-provider`. Import the server plugin and its helpers from `@better-auth/mcp`, and the remote client and adapters from `@better-auth/mcp/client` and `@better-auth/mcp/client/adapters` (previously imported from `better-auth/plugins` and `better-auth/plugins/mcp/client`). The OAuth endpoints move from `/mcp/*` to `/oauth2/*`, with discovery at `/.well-known/oauth-authorization-server` and protected resource metadata at `/.well-known/oauth-protected-resource`. Discovery-based MCP clients pick up the new locations on their own.

  The route helper is renamed `requireMcpAuth` (was `withMcpAuth`), and the remote client is `createMcpResourceClient` (was `createMcpAuthClient`). `requireMcpAuth` verifies the bearer token against the published JWKS and passes the verified JWT claims to your handler.

  To migrate, install `@better-auth/mcp`, add the `jwt()` plugin (now required for token signing), and move options that were nested under `oidcConfig` to flat options on `mcp({ ... })`. The database models change: `oauthApplication` becomes `oauthClient`, with new `oauthRefreshToken` and `oauthClientAssertion` tables. Regenerate or migrate your schema with `npx auth migrate` or `npx auth generate`.

- [#10039](https://github.com/better-auth/better-auth/pull/10039) [`aedcb97`](https://github.com/better-auth/better-auth/commit/aedcb974f055c3514fe0464dc53d71d45a8a1725) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - feat(oauth-provider)!: DPoP-bound access tokens (RFC 9449)

  OAuth provider integrations can issue and verify DPoP sender-constrained tokens. Clients request them with `dpop_bound_access_tokens` at registration, `dpop_jkt` on the authorization request, or by targeting a resource configured with `dpopBoundAccessTokensRequired`. Issued tokens carry `cnf.jkt`, return `token_type: "DPoP"`, and stay bound through refresh-token rotation, introspection, and userinfo.

  Resource servers verify DPoP requests with `verifyAccessTokenRequest`, which checks the `Authorization: DPoP` scheme, the proof, the request target, the access-token hash, and proof replay. The MCP package advertises DPoP in protected resource metadata and verifies DPoP-bound requests. Proof replay is rejected through the database-backed verification store, so anti-replay holds across instances. `verifyAccessTokenRequest` and `requireMcpAuth` use that store by default; build one with `createDpopReplayStore(internalAdapter)` or pass a custom `dpop.replayStore`. This needs database-backed verification storage: a secondary-storage-only deployment rejects DPoP requests rather than skipping replay protection.

  Breaking: the raw-token verifier `verifyAccessToken` is renamed to `verifyBearerToken`, both in `better-auth/oauth2` and as the `oauthProviderResourceClient` action, and it rejects DPoP-bound tokens. Use `verifyAccessTokenRequest` on any endpoint that may receive them. The resource-request input type is renamed from `AccessTokenRequestInput` to `ResourceRequestInput`, and the DPoP algorithm option is `signingAlgorithms` everywhere.

  Run a schema migration for the DPoP token-binding fields: the `confirmation` column on the access-token and refresh-token tables. DPoP-bound clients also gain `dpopBoundAccessTokens` and resources `dpopBoundAccessTokensRequired`. No dedicated replay table is added; proof replay reuses the verification store.

- [#9648](https://github.com/better-auth/better-auth/pull/9648) [`d2a79ba`](https://github.com/better-auth/better-auth/commit/d2a79bae79b88e2b28cb678f5eefd9759239b627) Thanks [@brentmitchell25](https://github.com/brentmitchell25)! - OAuth provider now models protected resources explicitly. Configure them with `resources` or create them through the `oauthResource` admin API. Each resource can define token TTLs, allowed scopes, custom JWT claims, and JWT signing pins.

  `validAudiences` is removed. Move each existing resource identifier into `resources`; link clients that should be limited to specific resources through `oauthClientResource` or Dynamic Client Registration `resources`.

  Access-token issuance now applies resource policy to the requested RFC 8707 `resource` values. The OAuth provider narrows scopes to resource allowlists, uses the shortest configured TTL, strips reserved RFC 9068 claim names from custom claims, emits `jti`, and keeps repeated `resource` form parameters.

  Refresh-token TTLs now use the shortest applicable lifetime. Deployments with a per-resource `refreshTokenTtl` longer than `refreshTokenExpiresIn` will see refresh tokens expire at the provider default instead of the longer resource value.

  JWT signing can now honor per-resource pins. `signJWT()` accepts `signingKeyId` and `signingAlgorithm`; JWKS adapters expose `getKeyById()` and `getLatestKeyByAlg()`. The `jwks` table adds nullable `alg` and `crv` columns, and `keyPairConfigs` can provision multiple algorithms in one keyring.

  After upgrading, run `npx @better-auth/cli generate` and apply the migration before deploying. The migration adds `oauthResource`, `oauthClientResource`, and the new `jwks` columns. Without it, resources using `signingAlgorithm` cannot find matching keys.

  Resource servers should publish RFC 9728 protected-resource metadata at their own origin. The OAuth provider exposes challenge helpers that point clients at that metadata.

  `@better-auth/mcp` now requires an explicit `resource` option. The plugin stores that identifier as an OAuth resource, publishes RFC 9728 protected-resource metadata for it, and binds issued access tokens to that resource. Existing `mcp({ loginPage, consentPage })` setups should add a protected MCP resource identifier, for example `resource: "https://api.example.com/mcp"`.

### Patch Changes

- Updated dependencies [[`b36c38f`](https://github.com/better-auth/better-auth/commit/b36c38f9842d3416689340552989449a32007819), [`73541c1`](https://github.com/better-auth/better-auth/commit/73541c119041113b1909fe244ff4b8210618b5b5), [`bf39cbf`](https://github.com/better-auth/better-auth/commit/bf39cbf13f3b934f728cde72b1e7ebdc4c85f641), [`e53582c`](https://github.com/better-auth/better-auth/commit/e53582ce55a0ddbca62f52efeb3459523816f222), [`2fd3d58`](https://github.com/better-auth/better-auth/commit/2fd3d5850006d164317d4f53a81ac95f2d1f549a), [`aedcb97`](https://github.com/better-auth/better-auth/commit/aedcb974f055c3514fe0464dc53d71d45a8a1725), [`2196ea6`](https://github.com/better-auth/better-auth/commit/2196ea65e724830d9f1066c6593210579de586b9), [`050ef2d`](https://github.com/better-auth/better-auth/commit/050ef2dfcf22429135b49804de195f945f59f3c1), [`d2a79ba`](https://github.com/better-auth/better-auth/commit/d2a79bae79b88e2b28cb678f5eefd9759239b627), [`34558bc`](https://github.com/better-auth/better-auth/commit/34558bc52b0e043021a1072f78de5f5439ae1734), [`0143d69`](https://github.com/better-auth/better-auth/commit/0143d69195870ea6550a40add8618361dbbc3b8f), [`652fa53`](https://github.com/better-auth/better-auth/commit/652fa53e4912837fe234651e7c7705fb35abe188), [`6fe9faa`](https://github.com/better-auth/better-auth/commit/6fe9faab65eb640dbe9bb762954a068586e8661c), [`ad35ead`](https://github.com/better-auth/better-auth/commit/ad35eadd130162565a1b93c27f3a66910dca0b0e), [`6d97c47`](https://github.com/better-auth/better-auth/commit/6d97c4754c80010524b922c39b28a7afd4012457)]:
  - better-auth@1.7.0-beta.6
  - @better-auth/oauth-provider@1.7.0-beta.6
  - @better-auth/core@1.7.0-beta.6
