import { base64 } from "@better-auth/utils/base64";
import { describe, expect, it } from "vitest";

import { basicToClientCredentials } from "./index";

function encodeBasic(clientId: string, clientSecret: string) {
	const raw = `${clientId}:${clientSecret}`;
	const encoded = base64.encode(new TextEncoder().encode(raw));
	return `Basic ${encoded}`;
}

/**
 * @see https://datatracker.ietf.org/doc/html/rfc7617#section-2
 */
describe("basicToClientCredentials", () => {
	it("preserves colons inside client_secret per RFC 7617", () => {
		const clientId = "cid";
		const clientSecret = "pa:ss:word";

		const result = basicToClientCredentials(
			encodeBasic(clientId, clientSecret),
		);

		expect(result).toBeDefined();
		expect(result?.client_id).toBe(clientId);
		expect(result?.client_secret).toBe(clientSecret);
	});

	it("keeps a trailing colon as part of client_secret", () => {
		const clientId = "cid";
		const clientSecret = "secret:";

		const result = basicToClientCredentials(
			encodeBasic(clientId, clientSecret),
		);

		expect(result?.client_secret).toBe(clientSecret);
	});
});
