import type { Server } from "node:http";
import { createServer } from "node:http";
import { cimd } from "@better-auth/cimd";
import type { OAuthOptions, Scope } from "@better-auth/oauth-provider";
import {
	extendOAuthProvider,
	getOAuthProviderApi,
	oauthProvider,
} from "@better-auth/oauth-provider";
import { expect, test } from "@playwright/test";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { jwt } from "better-auth/plugins/jwt";
import { setupServer } from "./utils";

const FIELD = "example_delivery_mode";
const SUPPORTED_MODES = ["poll", "ping"];
const CLIENT_ID_URL = "https://agent.example.test/client-metadata.json";

/**
 * A companion plugin shaped like CIBA: it declares a registration field,
 * validates it at registration, and reads it back at request time through
 * the provider API, the way CIBA's backchannel endpoint does.
 */
const exampleExtension = {
	id: "example-extension",
	init(ctx) {
		extendOAuthProvider(ctx, {
			clientMetadata: {
				fields: [FIELD],
				validate: ({ metadata }) => {
					const mode = metadata[FIELD];
					if (mode !== undefined && !SUPPORTED_MODES.includes(String(mode))) {
						throw new APIError("BAD_REQUEST", {
							error: "invalid_client_metadata",
							error_description: `${FIELD} must be one of: poll, ping`,
						});
					}
				},
			},
		});
	},
	endpoints: {
		exampleClientMode: createAuthEndpoint(
			"/example/client-mode",
			{ method: "GET" },
			async (ctx) => {
				const clientId = (ctx.query as { client_id?: string } | undefined)
					?.client_id;
				if (!clientId) throw new APIError("BAD_REQUEST");
				const provider = ctx.context.getPlugin("oauth-provider");
				const api = getOAuthProviderApi(
					ctx,
					provider?.options as OAuthOptions<Scope[]>,
				);
				const client = await api.getClient(clientId);
				const metadata =
					typeof client?.metadata === "string"
						? JSON.parse(client.metadata)
						: client?.metadata;
				return ctx.json({ mode: metadata?.[FIELD] ?? null });
			},
		),
	},
} satisfies BetterAuthPlugin;

/** The client app: a separate HTTP server hosting its metadata document. */
async function startClientApp() {
	let document: Record<string, unknown> = {};
	const server: Server = createServer((req, res) => {
		if (req.url !== "/client-metadata.json") {
			res.statusCode = 404;
			res.end();
			return;
		}
		res.setHeader("content-type", "application/json");
		res.end(JSON.stringify(document));
	});
	const port = await new Promise<number>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (address && typeof address === "object") resolve(address.port);
			else reject(new Error("Failed to get client app port"));
		});
	});
	return {
		port,
		publish: (next: Record<string, unknown>) => {
			document = next;
		},
		stop: () =>
			new Promise<void>((resolve, reject) => {
				server.closeAllConnections();
				server.close((err) => (err ? reject(err) : resolve()));
			}),
	};
}

test.describe("extension client metadata over HTTP", () => {
	test("declared fields survive dynamic registration and metadata documents", async () => {
		const clientApp = await startClientApp();
		const { port, stop } = await setupServer(
			{
				baseURL: { allowedHosts: ["127.0.0.1:*"], protocol: "http" },
				plugins: [
					jwt(),
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						allowDynamicClientRegistration: true,
						allowUnauthenticatedClientRegistration: true,
					}),
					cimd({
						metadataRevalidationInterval: 0,
						metadataFetchPolicy: { minimumFetchInterval: 0 },
						// The client_id stays a spec-valid https URL; the operator's
						// fetcher routes it to the client app running locally.
						fetchClientMetadataResource: (input, init) =>
							fetch(
								String(input).replace(
									"https://agent.example.test",
									`http://127.0.0.1:${clientApp.port}`,
								),
								init,
							),
					}),
					exampleExtension,
				],
			},
			{ disableTestUser: true },
		).catch(async (error: unknown) => {
			// The finally below only covers a started auth server.
			await clientApp.stop();
			throw error;
		});
		const authBaseURL = `http://127.0.0.1:${port}/api/auth`;
		const readMode = async (clientId: string) => {
			const response = await fetch(
				`${authBaseURL}/example/client-mode?client_id=${encodeURIComponent(clientId)}`,
			);
			return { status: response.status, body: await response.json() };
		};
		const register = (body: Record<string, unknown>) =>
			fetch(`${authBaseURL}/oauth2/register`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					redirect_uris: ["https://agent.example.test/callback"],
					token_endpoint_auth_method: "none",
					...body,
				}),
			});

		try {
			// Dynamic registration keeps the declared field, drops the rest.
			const registered = await register({
				[FIELD]: "ping",
				metadata: { injected: true },
				unknown_field: "ignored",
			});
			expect(registered.status).toBe(201);
			const client = await registered.json();
			expect(client[FIELD]).toBe("ping");
			expect(client.injected).toBeUndefined();
			expect(client.unknown_field).toBeUndefined();
			expect(await readMode(client.client_id)).toEqual({
				status: 200,
				body: { mode: "ping" },
			});

			const rejected = await register({ [FIELD]: "push" });
			expect(rejected.status).toBe(400);
			expect(await rejected.json()).toMatchObject({
				error: "invalid_client_metadata",
			});

			// A metadata document hosted by the client app carries the field.
			const document = {
				client_id: CLIENT_ID_URL,
				client_name: "Example Agent",
				redirect_uris: ["https://agent.example.test/callback"],
				token_endpoint_auth_method: "none",
				grant_types: ["authorization_code"],
				response_types: ["code"],
			};
			clientApp.publish({ ...document, [FIELD]: "poll" });
			expect(await readMode(CLIENT_ID_URL)).toEqual({
				status: 200,
				body: { mode: "poll" },
			});

			// A refreshed document that drops the field removes it.
			clientApp.publish(document);
			expect(await readMode(CLIENT_ID_URL)).toEqual({
				status: 200,
				body: { mode: null },
			});

			// An invalid value in the document is rejected at registration.
			clientApp.publish({ ...document, [FIELD]: "push" });
			const invalid = await readMode(CLIENT_ID_URL);
			expect(invalid.status).toBe(400);
			expect(invalid.body).toMatchObject({ error: "invalid_client_metadata" });
		} finally {
			await stop();
			await clientApp.stop();
		}
	});
});
