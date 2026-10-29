import { describe, expect, it } from "vitest";
import { matchesPattern, originCheck } from "./origin-check";

const trustedOrigins = [
	"https://trusted-site.com",
	"https://trusted-with-slash.com/",
	"https://trusted-with-port.com:443",
	"http://trusted-http-port.com:80",
	"myapp://trusted",
	"better-auth://",
	"*.wildcard-site.com",
];

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

	it("allows trusted origins configured with a trailing slash", async () => {
		await expect(
			middleware(
				middlewareContext("https://trusted-with-slash.com/reset-password"),
			),
		).resolves.toBeUndefined();
	});

	it("allows trusted origins configured with a default port", async () => {
		await expect(
			middleware(
				middlewareContext("https://trusted-with-port.com/reset-password"),
			),
		).resolves.toBeUndefined();
		await expect(
			middleware(
				middlewareContext("http://trusted-http-port.com/reset-password"),
			),
		).resolves.toBeUndefined();
	});

	it("rejects custom scheme hostname prefix bypass", async () => {
		await expect(
			middleware(middlewareContext("myapp://trusted.evil.com/cb")),
		).rejects.toMatchObject({
			status: "FORBIDDEN",
			statusCode: 403,
		});

		await expect(
			middleware(middlewareContext("myapp://trustedevil/cb")),
		).rejects.toMatchObject({
			status: "FORBIDDEN",
			statusCode: 403,
		});
	});

	it("allows custom scheme matching exact host", async () => {
		await expect(
			middleware(middlewareContext("myapp://trusted/cb")),
		).resolves.toBeUndefined();
	});

	it("allows scheme-only custom scheme patterns", async () => {
		await expect(
			middleware(middlewareContext("better-auth://callback")),
		).resolves.toBeUndefined();
	});

	it("matches wildcard hosts", async () => {
		await expect(
			middleware(middlewareContext("https://sub.wildcard-site.com/cb")),
		).resolves.toBeUndefined();

		await expect(
			middleware(middlewareContext("https://evil-wildcard-site.com/cb")),
		).rejects.toMatchObject({
			status: "FORBIDDEN",
			statusCode: 403,
		});
	});
});

describe("matchesPattern unit tests", () => {
	it("handles http/https origin equivalence", () => {
		expect(
			matchesPattern("https://example.com/path", "https://example.com"),
		).toBe(true);
		expect(
			matchesPattern("https://example.com/path", "https://example.com/"),
		).toBe(true);
		expect(
			matchesPattern("https://example.com/path", "https://example.com:443"),
		).toBe(true);
		expect(
			matchesPattern("http://example.com/path", "http://example.com:80"),
		).toBe(true);
		expect(
			matchesPattern("https://example.com.evil.com/path", "https://example.com"),
		).toBe(false);
	});

	it("handles custom schemes correctly", () => {
		expect(matchesPattern("myapp://trusted/cb", "myapp://trusted")).toBe(true);
		expect(matchesPattern("myapp://trusted", "myapp://trusted")).toBe(true);
		expect(
			matchesPattern("myapp://trusted.evil.com/cb", "myapp://trusted"),
		).toBe(false);
		expect(
			matchesPattern("myapp://trustedevil/cb", "myapp://trusted"),
		).toBe(false);
		expect(
			matchesPattern("better-auth://callback", "better-auth://"),
		).toBe(true);
		expect(
			matchesPattern("other-scheme://callback", "better-auth://"),
		).toBe(false);
	});
});
