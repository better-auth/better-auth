import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import {
	oauthProvider,
	oauthProviderAuthServerMetadata,
} from "@better-auth/oauth-provider";
import type { BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { toNodeHandler } from "better-auth/node";
import { jwt } from "better-auth/plugins";

type Extras = {
	/** Register `@better-auth/oauth-provider` + `jwt` and expose the well-known metadata route. */
	oauthProvider?: boolean;
	/** Skip `signUpEmail` during setup (required for dynamic configs without a usable fallback). */
	disableTestUser?: boolean;
};

function nodeRequestToFetchRequest(req: IncomingMessage): Request {
	const host = req.headers.host ?? "localhost";
	const url = `http://${host}${req.url ?? "/"}`;
	const headers = new Headers();
	for (const [k, v] of Object.entries(req.headers)) {
		if (typeof v === "string") headers.set(k, v);
		else if (Array.isArray(v)) headers.set(k, v.join(","));
	}
	return new Request(url, { method: req.method ?? "GET", headers });
}

async function writeFetchResponse(
	res: ServerResponse,
	response: Response,
): Promise<void> {
	res.statusCode = response.status;
	response.headers.forEach((value, key) => res.setHeader(key, value));
	res.end(await response.text());
}

export async function createAuthServer(
	baseURL: string = "http://localhost:3000",
	overrides?: Partial<BetterAuthOptions>,
	extras?: Extras,
) {
	const database = new DatabaseSync(":memory:");

	const plugins: NonNullable<BetterAuthOptions["plugins"]> =
		extras?.oauthProvider
			? [
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						silenceWarnings: {
							oauthAuthServerConfig: true,
							openidConfig: true,
						},
					}),
					jwt(),
				]
			: [];

	const auth = betterAuth({
		database,
		baseURL,
		emailAndPassword: {
			enabled: true,
		},
		trustedOrigins: [
			baseURL,
			"http://localhost:*", // Dynamic frontend port
			"http://test.com:*", // Cross-domain test
		],
		...overrides,
		plugins: [...plugins, ...(overrides?.plugins ?? [])],
	});

	const { runMigrations } = await getMigrations(auth.options);
	await runMigrations();

	if (!extras?.disableTestUser) {
		await auth.api.signUpEmail({
			body: {
				name: "Test User",
				email: "test@test.com",
				password: "password123",
			},
		});
	}

	const authHandler = toNodeHandler(auth);
	const authServerMetadataHandler = extras?.oauthProvider
		? // @ts-expect-error: plugin-endpoint typing isn't preserved through
			// the conditional `plugins` array here; the wrapper's structural
			// constraint only needs `api.getOAuthServerConfig` which exists
			// when `oauthProvider` is registered.
			oauthProviderAuthServerMetadata(auth)
		: null;

	return createServer(async (req, res) => {
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

		if (
			authServerMetadataHandler &&
			req.url === "/.well-known/oauth-authorization-server"
		) {
			const response = await authServerMetadataHandler(
				nodeRequestToFetchRequest(req),
			);
			await writeFetchResponse(res, response);
			return;
		}

		// Server-side direct `auth.api` call. Forwards request headers on
		// `/whoami`; deliberately omits them on `/whoami-no-source` so the
		// error path can be tested end-to-end.
		if (req.url === "/whoami" || req.url === "/whoami-no-source") {
			const headers = new Headers();
			if (req.url === "/whoami") {
				for (const [k, v] of Object.entries(req.headers)) {
					if (typeof v === "string") headers.set(k, v);
				}
			}
			try {
				const session =
					req.url === "/whoami"
						? await auth.api.getSession({ headers })
						: await auth.api.getSession();
				res.statusCode = 200;
				res.setHeader("Content-Type", "application/json");
				res.end(JSON.stringify({ session }));
			} catch (err) {
				res.statusCode = 500;
				res.setHeader("Content-Type", "application/json");
				res.end(
					JSON.stringify({
						error: err instanceof Error ? err.message : String(err),
					}),
				);
			}
			return;
		}

		if (req.url?.startsWith("/debug/sso-provider/verify-domain")) {
			const requestURL = new URL(
				req.url,
				`http://${req.headers.host ?? "localhost"}`,
			);
			const providerId = requestURL.searchParams.get("providerId");
			if (!providerId) {
				res.statusCode = 400;
				res.setHeader("Content-Type", "application/json");
				res.end(JSON.stringify({ error: "providerId is required" }));
				return;
			}
			const context = await auth.$context;
			await context.adapter.update({
				model: "ssoProvider",
				update: {
					domainVerified: true,
				},
				where: [{ field: "providerId", value: providerId }],
			});
			res.statusCode = 204;
			res.end();
			return;
		}

		if (req.url?.startsWith("/debug/member-count")) {
			const requestURL = new URL(
				req.url,
				`http://${req.headers.host ?? "localhost"}`,
			);
			const email = requestURL.searchParams.get("email");
			if (!email) {
				res.statusCode = 400;
				res.setHeader("Content-Type", "application/json");
				res.end(JSON.stringify({ error: "email is required" }));
				return;
			}
			const context = await auth.$context;
			const user = await context.internalAdapter.findUserByEmail(email, {
				includeAccounts: false,
			});
			const members = user
				? await context.adapter.findMany({
						model: "member",
						where: [{ field: "userId", value: user.user.id }],
					})
				: [];
			res.statusCode = 200;
			res.setHeader("Content-Type", "application/json");
			res.end(JSON.stringify({ count: members.length }));
			return;
		}

		res.statusCode = 404;
		res.end(JSON.stringify({ error: "Not found" }));
	});
}
