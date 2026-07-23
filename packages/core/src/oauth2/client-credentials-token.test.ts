import { base64 } from "@better-auth/utils/base64";
import { describe, expect, it } from "vitest";
import { createClientCredentialsTokenRequest } from "./client-credentials-token";

describe("createClientCredentialsTokenRequest basic auth header", () => {
	it("encodes the Basic credentials with standard Base64 (RFC 7617), not Base64URL", () => {
		// "a:~" is "YTp+" in standard Base64 but "YTp-" in Base64URL. A secret whose
		// Base64 contains +, /, or = padding is mangled by Base64URL and rejected by
		// a standards-compliant token endpoint, breaking the client_credentials grant.
		const { headers } = createClientCredentialsTokenRequest({
			options: { clientId: "a", clientSecret: "~" } as any,
			authentication: "basic",
		});

		expect(headers["authorization"]).toBe(`Basic ${base64.encode("a:~")}`);
		expect(headers["authorization"]).toBe("Basic YTp+");
	});
});
