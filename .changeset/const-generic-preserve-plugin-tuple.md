---
"better-auth": patch
---

fix(types): use `const` type parameter on `betterAuth` to preserve plugin tuple inference

`betterAuth<Options>(options)` previously inferred `Options["plugins"]` as `BetterAuthPlugin[]` (and `any[]` whenever an untyped plugin was in the list), which collapsed per-element type information before the tuple-walk utilities introduced in #8981 could run. Each typed plugin's `$Infer` and `$ERROR_CODES` contributions were therefore silently dropped whenever an `any`-typed plugin was present alongside typed ones.

Adding the `const` modifier to the generic on `betterAuth` (full and minimal entry points) and on `getTestInstance` preserves the literal tuple shape at the call site, so `InferPluginFieldFromTuple` walks each element through the existing `IsAny` guard — `any` elements contribute `{}`, typed elements preserve their contributions. No public API signatures change.
