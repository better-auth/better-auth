import assert from "node:assert";
import { once } from "node:events";
import { createServer } from "node:http";
import { describe, it } from "node:test";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { toNodeHandler } from "better-auth/node";

type PasskeyRegistrationOptionsPayload = {
	user?: { name?: string; displayName?: string };
	challenge?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const isPasskeyRegistrationOptionsPayload = (
	value: unknown,
): value is PasskeyRegistrationOptionsPayload => {
	if (!isRecord(value)) {
		return false;
	}
	if ("challenge" in value && typeof value.challenge !== "string") {
		return false;
	}
	if ("user" in value) {
		const user = value.user;
		if (user !== undefined) {
			if (!isRecord(user)) {
				return false;
			}
			if ("name" in user && typeof user.name !== "string") {
				return false;
			}
			if ("displayName" in user && typeof user.displayName !== "string") {
				return false;
			}
		}
	}
	return true;
};

describe("(node) passkey pre-auth", () => {
	it("generates registration options without session", async (t) => {
		const db: Record<string, any[]> = {
			passkey: [],
		};
		const auth = betterAuth({
			baseURL: "http://localhost",
			database: memoryAdapter(db),
			trustedOrigins: ["http://localhost:*"],
			plugins: [
				passkey({
					registration: {
						requireSession: false,
						resolveUser: ({ context }) => {
							const value = typeof context === "string" ? context : "unknown";
							return {
								id: `user-${value}`,
								name: value,
								displayName: `Pre-auth ${value}`,
							};
						},
					},
				}),
			],
		});
		const authHandler = toNodeHandler(auth);
		const server = createServer((req, res) => {
			res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
			res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
			res.setHeader("Access-Control-Allow-Headers", "Content-Type");
			res.setHeader("Access-Control-Allow-Credentials", "true");

			if (req.method === "OPTIONS") {
				res.statusCode = 200;
				res.end();
				return;
			}

			if (req.url?.startsWith("/api/auth")) {
				return authHandler(req, res);
			}

			res.statusCode = 404;
			res.end();
		});

		server.listen(0);
		t.after(() => {
			server.close();
		});

		await once(server, "listening");
		const address = server.address();
		if (!address || typeof address === "string") {
			throw new Error("Expected server address to be available");
		}
		const port = address.port;
		const context = "preauth@example.com";

		const response = await fetch(
			`http://localhost:${port}/api/auth/passkey/generate-register-options?context=${encodeURIComponent(context)}`,
			{
				headers: {
					origin: `http://localhost:${port}`,
				},
			},
		);

		assert.strictEqual(response.ok, true);
		const payload = await response.json();
		if (!isPasskeyRegistrationOptionsPayload(payload)) {
			throw new Error("Unexpected payload shape");
		}
		assert.equal(payload.user?.name, context);
		assert.equal(payload.user?.displayName, `Pre-auth ${context}`);
		assert.equal(typeof payload.challenge, "string");

		const setCookie = response.headers.get("set-cookie") || "";
		assert.strictEqual(setCookie.includes("better-auth-passkey"), true);
	});
});
