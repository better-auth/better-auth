# auth

## 1.6.22

### Patch Changes

- Updated dependencies [[`c06a56d`](https://github.com/better-auth/better-auth/commit/c06a56d83a40bbaeac12d3a8b8b67e59f92a9110), [`8bd43d9`](https://github.com/better-auth/better-auth/commit/8bd43d9d8312fd9ddbfb8fb5c827cf0a0e55132d), [`3a035e9`](https://github.com/better-auth/better-auth/commit/3a035e968e27bfdee1e53ad857e5569090d9f2d1)]:
  - better-auth@1.6.22
  - @better-auth/core@1.6.22
  - @better-auth/telemetry@1.6.22

## 1.6.21

### Patch Changes

- [#10198](https://github.com/better-auth/better-auth/pull/10198) [`570267c`](https://github.com/better-auth/better-auth/commit/570267cd5e782f018933ce3af4f51dbd250bf7de) Thanks [@rachit367](https://github.com/rachit367)! - Honor `disableMigration` on plugin schema tables. Tables flagged with `disableMigration: true` are now skipped by `better-auth generate` (Drizzle and Prisma output) and by the runtime migrator, instead of being emitted and created anyway. The flag was previously dropped while assembling the table list, so it had no effect.

- Updated dependencies [[`e0762a1`](https://github.com/better-auth/better-auth/commit/e0762a127ce351a96614e60866b3455e6eddffa1), [`882cf9e`](https://github.com/better-auth/better-auth/commit/882cf9e592d1d305b5b78cadbb10aaeee7acd6dc), [`f52e1ab`](https://github.com/better-auth/better-auth/commit/f52e1ab50b60d289b64d6b06f1bff5a4358cdfd0), [`90d509e`](https://github.com/better-auth/better-auth/commit/90d509e0b9f72614170ad7124ae9d3a7a97d7d3a), [`b5bec19`](https://github.com/better-auth/better-auth/commit/b5bec193a56cec2f7b71c84d71dacb632f0b96a0), [`816d7f9`](https://github.com/better-auth/better-auth/commit/816d7f92522518e90d437c2a366d75db56690f86), [`239bcc8`](https://github.com/better-auth/better-auth/commit/239bcc836cf39c4fb409a15333be45134f9e9e65), [`1bc370a`](https://github.com/better-auth/better-auth/commit/1bc370aef5c249e82127cb9d35972101087ecde6), [`570267c`](https://github.com/better-auth/better-auth/commit/570267cd5e782f018933ce3af4f51dbd250bf7de), [`461ca6f`](https://github.com/better-auth/better-auth/commit/461ca6fd2453a2e145fa18a1df543e435e884701), [`88409b0`](https://github.com/better-auth/better-auth/commit/88409b0078c2bfddcc6503031fff333bfa045cd2), [`5953157`](https://github.com/better-auth/better-auth/commit/5953157acf619bcb8233c91952b1e4072202f055), [`b046f9e`](https://github.com/better-auth/better-auth/commit/b046f9ec112b2cf547efea8dc870a4895602c53b), [`ae647b4`](https://github.com/better-auth/better-auth/commit/ae647b4abe5a4d606c326f1ce0ffa2500b5424d1)]:
  - better-auth@1.6.21
  - @better-auth/core@1.6.21
  - @better-auth/telemetry@1.6.21

## 1.6.20

### Patch Changes

- Updated dependencies [[`21448b1`](https://github.com/better-auth/better-auth/commit/21448b1b77681e71e80ae0728d8658c936c18eb8), [`8ecf238`](https://github.com/better-auth/better-auth/commit/8ecf23817f5e501bdd8ab63ad5fdf2554ff1dff5), [`930f534`](https://github.com/better-auth/better-auth/commit/930f5341d956bf3075f43758392a5c7f50947104)]:
  - better-auth@1.6.20
  - @better-auth/core@1.6.20
  - @better-auth/telemetry@1.6.20

## 1.6.19

### Patch Changes

- [#9564](https://github.com/better-auth/better-auth/pull/9564) [`cfbb9a0`](https://github.com/better-auth/better-auth/commit/cfbb9a05243da942d4c5f9fae80077bbccd17f5c) Thanks [@brone1323](https://github.com/brone1323)! - fix(cli): handle directory path passed to --output in generate command

- [#10048](https://github.com/better-auth/better-auth/pull/10048) [`d6aec12`](https://github.com/better-auth/better-auth/commit/d6aec123d8cf9f50e357e67c2916010f9f09b561) Thanks [@tsushanth](https://github.com/tsushanth)! - fix(cli): serialize array additionalField defaultValue in drizzle generator

- Updated dependencies [[`de4aa52`](https://github.com/better-auth/better-auth/commit/de4aa52e991f0a56786300af3e0d9ac8331f1996), [`b4b0266`](https://github.com/better-auth/better-auth/commit/b4b02660c760fe4c8889d1311a3dbf3165f88d0b), [`5bd5e1c`](https://github.com/better-auth/better-auth/commit/5bd5e1cc73d2c9c38e69011f03038b61a4312a63), [`581f827`](https://github.com/better-auth/better-auth/commit/581f8271fb911cea2ce74810e086709909457cd3), [`8407885`](https://github.com/better-auth/better-auth/commit/840788502a13d6fa4aa4540b930ddb4a99dc1ed6), [`c1a8a64`](https://github.com/better-auth/better-auth/commit/c1a8a64c146fab20c7ad0076ffdf12eff9adc17a), [`635f190`](https://github.com/better-auth/better-auth/commit/635f1908702d0c63cf66b4e5f054e9d527a3c8f7), [`a787e0b`](https://github.com/better-auth/better-auth/commit/a787e0b66b368a1af0b4ba17c9750c2839668246), [`c2f718f`](https://github.com/better-auth/better-auth/commit/c2f718fcdeec0c1767bb8acd5fefdd3810863b0a), [`7d18175`](https://github.com/better-auth/better-auth/commit/7d18175637a0b95a501fde0cf3db080879367a9d)]:
  - better-auth@1.6.19
  - @better-auth/core@1.6.19
  - @better-auth/telemetry@1.6.19

## 1.6.18

### Patch Changes

- Updated dependencies [[`9ef7240`](https://github.com/better-auth/better-auth/commit/9ef7240fec4a9d8469dd5ed24249949d3400e732), [`b21a5f7`](https://github.com/better-auth/better-auth/commit/b21a5f7f6ca1f63c6b69666a498b4227b15e316c)]:
  - better-auth@1.6.18
  - @better-auth/core@1.6.18
  - @better-auth/telemetry@1.6.18

## 1.6.17

### Patch Changes

- [#9834](https://github.com/better-auth/better-auth/pull/9834) [`6987c62`](https://github.com/better-auth/better-auth/commit/6987c628f16b7c4bd855d73b16304b04a1fe766d) Thanks [@bytaesu](https://github.com/bytaesu)! - Resolve framework virtual-module imports when loading the auth config so the
  CLI no longer crashes on them: SvelteKit (`$app/*`, `$env/*`,
  `$service-worker`), Vite asset and query imports (`?raw`, `?url`, `?inline`,
  `?worker`, `.css`, `.svg`, and other known asset extensions), and Cloudflare
  Workers (`cloudflare:workers`). tsconfig `paths` aliases (including SvelteKit's
  `$lib` and any `kit.alias`) continue to resolve through the project's tsconfig.

- [#9729](https://github.com/better-auth/better-auth/pull/9729) [`108aadd`](https://github.com/better-auth/better-auth/commit/108aadd25171ffd20ee3a79a2650243a796067aa) Thanks [@GautamBytes](https://github.com/GautamBytes)! - Prisma schema generation now updates existing numeric fields when `bigint` changes, so regenerating after switching between `bigint: true` and `bigint: false` emits the correct `BigInt` or `Int` type.

- Updated dependencies [[`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`3e99e6c`](https://github.com/better-auth/better-auth/commit/3e99e6c77ef788377a3ddb7abe790c7dc3df1493), [`96c78c3`](https://github.com/better-auth/better-auth/commit/96c78c3e983ab3a2d914780fcc5d66d90537f9ac), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`0c3856f`](https://github.com/better-auth/better-auth/commit/0c3856f098f4a130abc49e9003ebc285824b0ba7), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`ed7b6c9`](https://github.com/better-auth/better-auth/commit/ed7b6c9ac0fa2bb7f246f552b41046302ef8138c), [`e0a768c`](https://github.com/better-auth/better-auth/commit/e0a768c973f9d9ccd4aee959efcbe1fbcc2e608d), [`7343284`](https://github.com/better-auth/better-auth/commit/73432841493a2d99144786c986ee57c071d816d8), [`0c3856f`](https://github.com/better-auth/better-auth/commit/0c3856f098f4a130abc49e9003ebc285824b0ba7), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`7343284`](https://github.com/better-auth/better-auth/commit/73432841493a2d99144786c986ee57c071d816d8), [`7343284`](https://github.com/better-auth/better-auth/commit/73432841493a2d99144786c986ee57c071d816d8), [`0c3856f`](https://github.com/better-auth/better-auth/commit/0c3856f098f4a130abc49e9003ebc285824b0ba7), [`fdef997`](https://github.com/better-auth/better-auth/commit/fdef997eb944d85254816f7a4b2d76c06e9b8ec7), [`0c3856f`](https://github.com/better-auth/better-auth/commit/0c3856f098f4a130abc49e9003ebc285824b0ba7), [`d9c526b`](https://github.com/better-auth/better-auth/commit/d9c526b2a57afe9e01ff25da400f1d634b4c1ac7), [`0c3856f`](https://github.com/better-auth/better-auth/commit/0c3856f098f4a130abc49e9003ebc285824b0ba7), [`fdef997`](https://github.com/better-auth/better-auth/commit/fdef997eb944d85254816f7a4b2d76c06e9b8ec7), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`fdef997`](https://github.com/better-auth/better-auth/commit/fdef997eb944d85254816f7a4b2d76c06e9b8ec7), [`7343284`](https://github.com/better-auth/better-auth/commit/73432841493a2d99144786c986ee57c071d816d8), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`8960f5f`](https://github.com/better-auth/better-auth/commit/8960f5f3bd2f0dccbfb768d69737d8a24d793a9e), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`5c289b5`](https://github.com/better-auth/better-auth/commit/5c289b52bc166be3a36ec3c112b04195dc7621d8), [`1dbf5bb`](https://github.com/better-auth/better-auth/commit/1dbf5bb59de5d628f0d07d5e846eba8287b831d7), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`59e0ccb`](https://github.com/better-auth/better-auth/commit/59e0ccbedc6c336b1e77f71c62484d654fd2fca3), [`b803c61`](https://github.com/better-auth/better-auth/commit/b803c61fdcfc64be4e26bf6fa10953621f0070cc), [`fdef997`](https://github.com/better-auth/better-auth/commit/fdef997eb944d85254816f7a4b2d76c06e9b8ec7)]:
  - better-auth@1.6.17
  - @better-auth/core@1.6.17
  - @better-auth/telemetry@1.6.17

## 1.6.16

### Patch Changes

- Updated dependencies [[`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`87e7aa5`](https://github.com/better-auth/better-auth/commit/87e7aa5e0fd8f19b326beb5bec409a9ed1f245ca), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`893cf6c`](https://github.com/better-auth/better-auth/commit/893cf6cb3f1f2669b39f6ac8d3d49cf830e5732e), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`5e49c56`](https://github.com/better-auth/better-auth/commit/5e49c56a9e12a9b6b3fd1202bbc7a2fc97aeeafd), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15)]:
  - better-auth@1.6.16
  - @better-auth/core@1.6.16
  - @better-auth/telemetry@1.6.16

## 1.6.15

### Patch Changes

- Updated dependencies [[`1012b69`](https://github.com/better-auth/better-auth/commit/1012b690466ccd7078441dbfb406eef166fca805), [`ad60333`](https://github.com/better-auth/better-auth/commit/ad60333d1517142d688c61b6ccee14b4c30864ae), [`0933c05`](https://github.com/better-auth/better-auth/commit/0933c050ff8735466a273347c9aab0fdd8cd38ff), [`b0ddfd3`](https://github.com/better-auth/better-auth/commit/b0ddfd3433cafac312ee99ec5fb7dbb9a240da35)]:
  - better-auth@1.6.15
  - @better-auth/core@1.6.15
  - @better-auth/telemetry@1.6.15

## 1.6.14

### Patch Changes

- Updated dependencies [[`2d9781a`](https://github.com/better-auth/better-auth/commit/2d9781a83ddc7b51ecffbd7d24c28e4b917e2323), [`5a2d642`](https://github.com/better-auth/better-auth/commit/5a2d642bc7d940f4242df9b304818a8653ea2a10), [`13abc79`](https://github.com/better-auth/better-auth/commit/13abc7922b47f800da59ca212d364a64feeec91f), [`9d3450a`](https://github.com/better-auth/better-auth/commit/9d3450ae23e8387d24adfb7bb1cb24cc6965b6e3)]:
  - better-auth@1.6.14
  - @better-auth/core@1.6.14
  - @better-auth/telemetry@1.6.14

## 1.6.13

### Patch Changes

- Updated dependencies [[`d3919dc`](https://github.com/better-auth/better-auth/commit/d3919dc1a560625d8f09161d64701e257452940f), [`5f282bd`](https://github.com/better-auth/better-auth/commit/5f282bd382d694f6834b1d0f8f694f737f223811), [`43c08a2`](https://github.com/better-auth/better-auth/commit/43c08a2bc77eb01d59ecac28379d5971af6beddc), [`43c08a2`](https://github.com/better-auth/better-auth/commit/43c08a2bc77eb01d59ecac28379d5971af6beddc), [`be32012`](https://github.com/better-auth/better-auth/commit/be32012ca3507a62371d1baa09cdacd5123a99bf), [`87c1a0c`](https://github.com/better-auth/better-auth/commit/87c1a0cab274b574592922ccc2454b0bd510a81f), [`5c3e248`](https://github.com/better-auth/better-auth/commit/5c3e248cbf4f81c2cb540b545baa4a5e69d3b066), [`9c8ded6`](https://github.com/better-auth/better-auth/commit/9c8ded67b192997b6c02150c3423bbc99d9bdb6b), [`23d7cbf`](https://github.com/better-auth/better-auth/commit/23d7cbfa793ca69b733f98334bd12962cad61646)]:
  - better-auth@1.6.13
  - @better-auth/core@1.6.13
  - @better-auth/telemetry@1.6.13

## 1.6.12

### Patch Changes

- Updated dependencies [[`9bd53e1`](https://github.com/better-auth/better-auth/commit/9bd53e191cda174c202a07b6d27af73300e6b175), [`23dbe1a`](https://github.com/better-auth/better-auth/commit/23dbe1ad0eb79372a674bc0771990c6cc3272a92), [`7a12072`](https://github.com/better-auth/better-auth/commit/7a120724c5c3fdd9d60d59169b32d693e9497fec), [`09a1d50`](https://github.com/better-auth/better-auth/commit/09a1d50a806f1599707ef4e7c47f8a4b8eb20f96), [`a6f144a`](https://github.com/better-auth/better-auth/commit/a6f144ad0a8ef702969cf49c999ccd073eb1ffa6), [`f77060a`](https://github.com/better-auth/better-auth/commit/f77060af3a9d1f19f05a26ccf6e56d79bb9db69d), [`dcb2e6d`](https://github.com/better-auth/better-auth/commit/dcb2e6d29cf4c986ff8980dab50bcfcb8110a749), [`c92cd74`](https://github.com/better-auth/better-auth/commit/c92cd74162cd1750404ab1da10d3fc20ed7d5e04), [`f5fcc9d`](https://github.com/better-auth/better-auth/commit/f5fcc9d37f2c46d3719a70c18857d9913ce172cf), [`9d91eb7`](https://github.com/better-auth/better-auth/commit/9d91eb77f5c10779b287f9c8de0495fcb75a425a), [`a3b0c63`](https://github.com/better-auth/better-auth/commit/a3b0c63de908b9f85d6c1d6c06f89bab16a72ba3), [`1b40dac`](https://github.com/better-auth/better-auth/commit/1b40dac22e0cfddbbb27136fe8067aba154ca91a), [`5626e1b`](https://github.com/better-auth/better-auth/commit/5626e1b4375aef7735e4f1103035377cbfad755c), [`ad9ad82`](https://github.com/better-auth/better-auth/commit/ad9ad824965cb8385f6f2a921576f2cc58ac2b47), [`62dabf6`](https://github.com/better-auth/better-auth/commit/62dabf66780a3dc7270e419886a15c43f3c8d879), [`276d67f`](https://github.com/better-auth/better-auth/commit/276d67fad597ca415a023c10fb5e1165093eebd1), [`2d73fff`](https://github.com/better-auth/better-auth/commit/2d73ffff4470664147e7207336442029c35f12d9), [`c5b9f93`](https://github.com/better-auth/better-auth/commit/c5b9f93498489888f543e1aa1fc07aae26f73a7f), [`ac96316`](https://github.com/better-auth/better-auth/commit/ac96316af3070ba52c9492464305d3206aadc602), [`0a7cb70`](https://github.com/better-auth/better-auth/commit/0a7cb7064723d2096e36f44b86c59f7181a8e0c5), [`015f96b`](https://github.com/better-auth/better-auth/commit/015f96bc63a90c06a67fbaf80e286b6f6fe1967d), [`43cc49c`](https://github.com/better-auth/better-auth/commit/43cc49c640c0d2c27572807a291d318bbcadfd04), [`f5e29ea`](https://github.com/better-auth/better-auth/commit/f5e29eaf1e57d73a024d12b1bedf4162e5f4a863), [`1d372bb`](https://github.com/better-auth/better-auth/commit/1d372bbab9117f5a574ecb608b7a5108f1ccbc66), [`3f8f310`](https://github.com/better-auth/better-auth/commit/3f8f310a0f2737f65bb4393eefd6b9372b2cb00e), [`83fa369`](https://github.com/better-auth/better-auth/commit/83fa3695e7cc0083ff8531f3a2b4101a2e56deff), [`17cd433`](https://github.com/better-auth/better-auth/commit/17cd433c66a6ed323b9fda7d4e7db5ad98d8099b), [`c01b2f1`](https://github.com/better-auth/better-auth/commit/c01b2f13216463fc0fc0054b5acdb9559d29d825), [`6b44606`](https://github.com/better-auth/better-auth/commit/6b44606b7d596527b59176b7a0cd06ea66df9031), [`04303a9`](https://github.com/better-auth/better-auth/commit/04303a92acd6fd3cf9d5f5ab5901255e67526ad3), [`7bf5449`](https://github.com/better-auth/better-auth/commit/7bf5449b11866bd82deafee910619660c153d799), [`2b7937f`](https://github.com/better-auth/better-auth/commit/2b7937fc2febd048bfc14b8226287b55b7d48e52)]:
  - better-auth@1.6.12
  - @better-auth/core@1.6.12
  - @better-auth/telemetry@1.6.12

## 1.6.11

### Patch Changes

- Updated dependencies [[`0cbddb8`](https://github.com/better-auth/better-auth/commit/0cbddb8fa4eb19fbca75e9822134f89b3604286a), [`a26333b`](https://github.com/better-auth/better-auth/commit/a26333b5fb1a044e76c18385441d3ecc2240ab70), [`99a254a`](https://github.com/better-auth/better-auth/commit/99a254a79b59d5a3f5ca2123260118cddb5beed7), [`ee93485`](https://github.com/better-auth/better-auth/commit/ee934854999390ee5ca73592fe205a470a810b83), [`5f09d56`](https://github.com/better-auth/better-auth/commit/5f09d566a64ac9a0499d9664ce700edbf0630cea), [`b4bc65a`](https://github.com/better-auth/better-auth/commit/b4bc65a007784b2eb0efb459e5fa6fd8055d3ec9), [`da7e50b`](https://github.com/better-auth/better-auth/commit/da7e50beee849c59a2ed1ec6b3a38cc6ab9fb563), [`a1c9f3c`](https://github.com/better-auth/better-auth/commit/a1c9f3c08e7398e900e099839aa6dcc8d1d0b816), [`23094a6`](https://github.com/better-auth/better-auth/commit/23094a628f007f801be6d26e5b15dc5fc6fc4eb8), [`142b86c`](https://github.com/better-auth/better-auth/commit/142b86c43d2e6b258236a298a31237e97f87d64d), [`1f2ff42`](https://github.com/better-auth/better-auth/commit/1f2ff4215c4affff0b140b0c0a712c0dde35659c), [`b0ef96f`](https://github.com/better-auth/better-auth/commit/b0ef96fd8ec08ebb4d6ad0c0557d4b7855703f10), [`699b09a`](https://github.com/better-auth/better-auth/commit/699b09a2064dcb7d37046b5a90626c0b6f57af90), [`e21d744`](https://github.com/better-auth/better-auth/commit/e21d744987476c20a934c79ef226fe6a5f468e22)]:
  - @better-auth/core@1.6.11
  - better-auth@1.6.11
  - @better-auth/telemetry@1.6.11

## 1.6.10

### Patch Changes

- [#9455](https://github.com/better-auth/better-auth/pull/9455) [`e44427b`](https://github.com/better-auth/better-auth/commit/e44427b37331c6bcf29d553ed2f135a512bcd750) Thanks [@GautamBytes](https://github.com/GautamBytes)! - Fix `auth init` to generate working MySQL and PostgreSQL Kysely database configs by passing the database driver directly.

- Updated dependencies [[`1e0f26d`](https://github.com/better-auth/better-auth/commit/1e0f26d4c83608d14a533f33458ade0f8504fd16), [`8c1e917`](https://github.com/better-auth/better-auth/commit/8c1e91757d91d103c332e90201c39ce5892c37e8), [`b2d655c`](https://github.com/better-auth/better-auth/commit/b2d655c77c7c627ada17456d1de106fdce6fa18e), [`09f1327`](https://github.com/better-auth/better-auth/commit/09f1327acb9c6bbfeb272dc62c7013172cf33153), [`906b7b3`](https://github.com/better-auth/better-auth/commit/906b7b34a710d49798e166395da2bcd2be13ef46), [`e9c978e`](https://github.com/better-auth/better-auth/commit/e9c978e2af9e61d35f50fd040305cbb8fdda32ba), [`e71aad3`](https://github.com/better-auth/better-auth/commit/e71aad3b6d67502cfb770fa8890f3ab58c537114), [`80a655d`](https://github.com/better-auth/better-auth/commit/80a655d271dcae5f785a70f13be60f80fb828cf1), [`15ff28a`](https://github.com/better-auth/better-auth/commit/15ff28a957a18df8ecd2aa08d66b94c91ae9a6a4), [`88a7c67`](https://github.com/better-auth/better-auth/commit/88a7c678f4db3f7da580d53071b2595b92354a45), [`9a7b51d`](https://github.com/better-auth/better-auth/commit/9a7b51d0d3dfbc6b2697fe5f9edd0bb480bdf89b), [`1b25902`](https://github.com/better-auth/better-auth/commit/1b259024dcd1bbbc08559ee057f22c01929a72a7), [`cf59136`](https://github.com/better-auth/better-auth/commit/cf591360e72a8d01741618cd61cdeea84cf8398a), [`a597ee0`](https://github.com/better-auth/better-auth/commit/a597ee01ed4e6d85aba5ee9f15100acc578390d9), [`fc02ced`](https://github.com/better-auth/better-auth/commit/fc02cedb708e2b5987a177539a903cc35155a426), [`9f1ef1f`](https://github.com/better-auth/better-auth/commit/9f1ef1f7e5500e0b3dbe2a18e25e3519847cd7a9), [`36ef808`](https://github.com/better-auth/better-auth/commit/36ef808c6cedec6eeb9a3a4e6790e0ab46d96ff3), [`c1336c5`](https://github.com/better-auth/better-auth/commit/c1336c563d45f93ca3fd4da4e6c767fc267d86d0), [`3a9a2c3`](https://github.com/better-auth/better-auth/commit/3a9a2c37eeab1d0c98845a47642d4dc27fe54ceb), [`fde0432`](https://github.com/better-auth/better-auth/commit/fde043207ef3d5a5e1f74aa5ddabf77d523d52d4), [`2220a6d`](https://github.com/better-auth/better-auth/commit/2220a6d6c25ebd24c8568131636389dc0c12f82b)]:
  - better-auth@1.6.10
  - @better-auth/core@1.6.10
  - @better-auth/telemetry@1.6.10

## 1.6.9

### Patch Changes

- Updated dependencies [[`815ecf6`](https://github.com/better-auth/better-auth/commit/815ecf62b6f6c5bf656ab55da393ce63d7eed0a6)]:
  - @better-auth/core@1.6.9
  - better-auth@1.6.9
  - @better-auth/telemetry@1.6.9

## 1.6.8

### Patch Changes

- Updated dependencies [[`856ab24`](https://github.com/better-auth/better-auth/commit/856ab2426c0dce7377ee1ca26dbb7d9e52fb6429), [`9aa8e63`](https://github.com/better-auth/better-auth/commit/9aa8e63de84549634216e13e407cf6d8aa61acc3)]:
  - better-auth@1.6.8
  - @better-auth/core@1.6.8
  - @better-auth/telemetry@1.6.8

## 1.6.7

### Patch Changes

- Updated dependencies [[`307196a`](https://github.com/better-auth/better-auth/commit/307196a405e067f4a863de2ed68528e8d4bdc162), [`4a180f0`](https://github.com/better-auth/better-auth/commit/4a180f0b0c084c59e7b006058d3fdbd8542face5), [`4f373ee`](https://github.com/better-auth/better-auth/commit/4f373eed8a42e02460dbd2ee9973b9493cea04eb), [`e1b1cfc`](https://github.com/better-auth/better-auth/commit/e1b1cfc7a262c8bf0c383a7b2b1d140472d33e56), [`d053a45`](https://github.com/better-auth/better-auth/commit/d053a4583e0db9132e52a100ae33e13d040a6bae)]:
  - better-auth@1.6.7
  - @better-auth/core@1.6.7
  - @better-auth/telemetry@1.6.7

## 1.6.6

### Patch Changes

- Updated dependencies [[`b5742f9`](https://github.com/better-auth/better-auth/commit/b5742f9d08d7c6ae0848279b79c8bcc0a09082d7), [`4debfb6`](https://github.com/better-auth/better-auth/commit/4debfb600ff448f3e63ed242a2fb5a2c41654be1), [`9ea7eb1`](https://github.com/better-auth/better-auth/commit/9ea7eb1eab28d50d40836ab4e2cbe5a81c4da1aa), [`a844c7d`](https://github.com/better-auth/better-auth/commit/a844c7dd087715678787cb10bf9670fad46e535b), [`ab4c10f`](https://github.com/better-auth/better-auth/commit/ab4c10fbc09defcd851d614acecc111cc114b543), [`a61083e`](https://github.com/better-auth/better-auth/commit/a61083e023163d0a14d9e886ce556ba459677428), [`e64ff72`](https://github.com/better-auth/better-auth/commit/e64ff720fb8514cb78aedd1660223d8b948284da)]:
  - @better-auth/core@1.6.6
  - better-auth@1.6.6
  - @better-auth/telemetry@1.6.6

## 1.6.5

### Patch Changes

- Updated dependencies [[`938dd80`](https://github.com/better-auth/better-auth/commit/938dd80e2debfab7f7ef480792a5e63876e779d9), [`0538627`](https://github.com/better-auth/better-auth/commit/05386271ca143d07416297611d3b31e6c20e2f2a)]:
  - better-auth@1.6.5
  - @better-auth/core@1.6.5
  - @better-auth/telemetry@1.6.5

## 1.6.4

### Patch Changes

- Updated dependencies [[`9aed910`](https://github.com/better-auth/better-auth/commit/9aed910499eb4cbc3dd0c395ff5534893daab7a4), [`acbd6ef`](https://github.com/better-auth/better-auth/commit/acbd6ef69f88ea54174446ac0465a426bad7ca09), [`39d6af2`](https://github.com/better-auth/better-auth/commit/39d6af2a392dc41018a036d1d909dc48c09749c9)]:
  - better-auth@1.6.4
  - @better-auth/core@1.6.4
  - @better-auth/telemetry@1.6.4

## 1.6.3

### Patch Changes

- [#9032](https://github.com/better-auth/better-auth/pull/9032) [`4673c6d`](https://github.com/better-auth/better-auth/commit/4673c6d83ce0710e8875e81539b376ee408e28b3) Thanks [@bytaesu](https://github.com/bytaesu)! - fix tsconfig path alias resolution for extended configs and mid-path wildcards

- Updated dependencies [[`5142e9c`](https://github.com/better-auth/better-auth/commit/5142e9cec55825eb14da0f14022ae02d3c9dfd45), [`484ce6a`](https://github.com/better-auth/better-auth/commit/484ce6a262c39b9c1be91d37774a2a13de3a5a1f), [`f875897`](https://github.com/better-auth/better-auth/commit/f8758975ae475429d56b34aa6067e304ee973c8f), [`6ce30cf`](https://github.com/better-auth/better-auth/commit/6ce30cf13853619b9022e93bd6ecb956bc32482d), [`f6428d0`](https://github.com/better-auth/better-auth/commit/f6428d02fcabc2e628f39b0e402f1a6eb0602649), [`9a6d475`](https://github.com/better-auth/better-auth/commit/9a6d4759cd4451f0535d53f171bcfc8891c41db7), [`513dabb`](https://github.com/better-auth/better-auth/commit/513dabb132e2c08a5b6d3b7e88dd397fcd66c1af), [`c5066fe`](https://github.com/better-auth/better-auth/commit/c5066fe5d68babf2376cfc63d813de5542eca463), [`5f84335`](https://github.com/better-auth/better-auth/commit/5f84335815d75410320bdfa665a6712d3416b04f)]:
  - better-auth@1.6.3
  - @better-auth/core@1.6.3
  - @better-auth/telemetry@1.6.3

## 1.6.2

### Patch Changes

- Updated dependencies [[`9deb793`](https://github.com/better-auth/better-auth/commit/9deb7936aba7931f2db4b460141f476508f11bfd), [`2cbcb9b`](https://github.com/better-auth/better-auth/commit/2cbcb9baacdd8e6fa1ed605e9b788f8922f0a8c2), [`b20fa42`](https://github.com/better-auth/better-auth/commit/b20fa424c379396f0b86f94fbac1604e4a17fe19), [`608d8c3`](https://github.com/better-auth/better-auth/commit/608d8c3082c2d6e52c6ca6a8f38348619869b1ae), [`8409843`](https://github.com/better-auth/better-auth/commit/84098432ad8432fe33b3134d933e574259f3430a), [`e78a7b1`](https://github.com/better-auth/better-auth/commit/e78a7b120d56b7320cc8d818270e20057963a7b2)]:
  - better-auth@1.6.2
  - @better-auth/core@1.6.2
  - @better-auth/telemetry@1.6.2

## 1.6.1

### Patch Changes

- Updated dependencies [[`2e537df`](https://github.com/better-auth/better-auth/commit/2e537df5f7f2a4263f52cce74d7a64a0a947792b), [`f61ad1c`](https://github.com/better-auth/better-auth/commit/f61ad1cab7360e4460e6450904e97498298a79d5), [`7495830`](https://github.com/better-auth/better-auth/commit/749583065958e8a310badaa5ea3acc8382dc0ca2)]:
  - better-auth@1.6.1
  - @better-auth/core@1.6.1
  - @better-auth/telemetry@1.6.1

## 1.6.0

### Minor Changes

- [#8836](https://github.com/better-auth/better-auth/pull/8836) [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Migrate MCP server URL to mcp.better-auth.com

### Patch Changes

- Updated dependencies [[`dd537cb`](https://github.com/better-auth/better-auth/commit/dd537cbdeb618abe9e274129f1670d0c03e89ae5), [`bd9bd58`](https://github.com/better-auth/better-auth/commit/bd9bd58f8768b2512f211c98c227148769d533c5), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`469eee6`](https://github.com/better-auth/better-auth/commit/469eee6d846b32a43f36b418868e6a4c916382dc), [`560230f`](https://github.com/better-auth/better-auth/commit/560230f751dfc5d6efc8f7f3f12e5970c9ba09ea)]:
  - better-auth@1.6.0
  - @better-auth/core@1.6.0
  - @better-auth/telemetry@1.6.0

## 1.6.0-beta.0

### Minor Changes

- [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Migrate MCP server URL to mcp.better-auth.com

### Patch Changes

- Updated dependencies [[`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b)]:
  - better-auth@1.6.0-beta.0
  - @better-auth/core@1.6.0-beta.0
  - @better-auth/telemetry@1.6.0-beta.0
