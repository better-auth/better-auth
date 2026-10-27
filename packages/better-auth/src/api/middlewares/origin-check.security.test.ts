import { describe, expect, it } from "vitest";
import { originCheck } from "./origin-check";

const trustedOrigins = ["https://trusted-site.com"];
const logger = {
	error: () => {},
	info: () => {},
};

function middlewareContext(callbackURL: string) {
	return {
		query: { callbackURL },
		request: new Request("https://auth.example.test/api/auth/callback"),
		context: {
			options: { trustedOrigins },
			trustedOrigins,
			logger,
		},
	} as any;
}

describe("origin check security", () => {
	const middleware = originCheck((ctx) => ctx.query.callbackURL);

	it("rejects a hostname that only starts with a trusted origin", async () => {
		await expect(
			middleware(
				middlewareContext(
					"https://trusted-site.com.malicious-site.com/reset-password",
				),
			),
		).rejects.toMatchObject({
			status: "FORBIDDEN",
			statusCode: 403,
		});
	});

	it("allows a path on the exact trusted origin", async () => {
		await expect(
			middleware(middlewareContext("https://trusted-site.com/reset-password")),
		).resolves.toBeUndefined();
	});
});
