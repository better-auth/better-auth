import { APIError } from "better-call";
import { describe, expect, it } from "vitest";
import { createAuthEndpoint, kReturnAPIError } from "./index";

describe("createAuthEndpoint error dispatch", () => {
	it("returns a caught APIError to a marked internal dispatch", async () => {
		const endpoint = createAuthEndpoint(
			"/marked-error",
			{ method: "POST" },
			async (context) => {
				context.setCookie("session", "", { maxAge: 0 });
				throw new APIError("UNAUTHORIZED", { message: "unauthorized" });
			},
		);

		const dispatchContext = {
			[kReturnAPIError]: true as const,
			returnHeaders: true as const,
		} as Parameters<typeof endpoint>[0] & {
			[kReturnAPIError]: true;
			returnHeaders: true;
		};
		const result = (await endpoint(dispatchContext)) as {
			headers: Headers;
			response: APIError;
		};

		expect(result.response).toBeInstanceOf(APIError);
		expect(result.response.statusCode).toBe(401);
		expect(result.headers.get("set-cookie")).toContain("session=");
	});

	it("lets nested endpoint errors propagate to the marked dispatch", async () => {
		const nestedEndpoint = createAuthEndpoint(
			"/nested-error",
			{ method: "POST" },
			async () => {
				throw new APIError("NOT_FOUND", { message: "not found" });
			},
		);
		const endpoint = createAuthEndpoint(
			"/calls-nested-error",
			{ method: "POST" },
			async (context) => {
				await nestedEndpoint({ ...context });
				return { success: true };
			},
		);

		const dispatchContext = {
			[kReturnAPIError]: true as const,
			returnHeaders: true as const,
		} as Parameters<typeof endpoint>[0] & {
			[kReturnAPIError]: true;
			returnHeaders: true;
		};
		const result = (await endpoint(dispatchContext)) as {
			headers: Headers;
			response: APIError | { success: true };
		};

		expect(result.response).toBeInstanceOf(APIError);
		if (result.response instanceof APIError) {
			expect(result.response.statusCode).toBe(404);
		}
	});
});
