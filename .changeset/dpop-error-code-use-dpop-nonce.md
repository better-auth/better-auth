---
"@better-auth/core": minor
---

The `DpopBindingErrorCode` and `DpopProofErrorCode` types exported from `@better-auth/core/oauth2` now include `use_dpop_nonce`, so exhaustive checks over either type must handle it. DPoP checks return this code only when you pass a `nonce` option, so code that does not require nonces needs the new case only to typecheck:

```ts
function describe(code: DpopBindingErrorCode): string {
	switch (code) {
		case "invalid_token":
			return "Invalid access token";
		case "invalid_dpop_proof":
			return "Invalid DPoP proof";
		case "use_dpop_nonce":
			return "Retry with the nonce from the DPoP-Nonce header";
	}
}
```
