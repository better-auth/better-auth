import { APIError, kAPIErrorHeaderSymbol } from "better-call";
import { describe, expect, it } from "vitest";
import { createAuthEndpoint } from "./index";

describe("createAuthEndpoint metadata.noStore", () => {
	it("applies the no-store headers to a successful response", async () => {
		const endpoint = createAuthEndpoint(
			"/no-store-success",
			{ method: "GET", metadata: { noStore: true } },
			async () => ({ ok: true }),
		);
		const result = (await endpoint({ returnHeaders: true })) as {
			headers: Headers;
			response: unknown;
		};
		expect(result.response).toEqual({ ok: true });
		expect(result.headers.get("Cache-Control")).toBe("no-store");
		expect(result.headers.get("Pragma")).toBe("no-cache");
	});

	it("attaches the no-store headers to a thrown error", async () => {
		const endpoint = createAuthEndpoint(
			"/no-store-error",
			{ method: "GET", metadata: { noStore: true } },
			async () => {
				throw new APIError("BAD_REQUEST", { error: "nope" });
			},
		);
		const error = (await endpoint({}).catch((e) => e)) as APIError & {
			[kAPIErrorHeaderSymbol]?: Headers;
		};
		expect(error).toBeInstanceOf(APIError);
		const headers = error[kAPIErrorHeaderSymbol];
		expect(headers?.get("Cache-Control")).toBe("no-store");
		expect(headers?.get("Pragma")).toBe("no-cache");
	});

	it("leaves responses untouched without the flag", async () => {
		const endpoint = createAuthEndpoint(
			"/plain",
			{ method: "GET" },
			async () => ({ ok: true }),
		);
		const result = (await endpoint({ returnHeaders: true })) as {
			headers: Headers;
		};
		expect(result.headers.get("Cache-Control")).toBeNull();
	});
});
