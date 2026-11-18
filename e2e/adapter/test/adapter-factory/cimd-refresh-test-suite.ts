import { cimd } from "@better-auth/cimd";
import type { BetterAuthOptions } from "@better-auth/core";
import type { SchemaClient, Scope } from "@better-auth/oauth-provider";
import { oauthProvider } from "@better-auth/oauth-provider";
import { createTestSuite } from "@better-auth/test-utils/adapter";
import { jwt } from "better-auth/plugins/jwt";
import { expect } from "vitest";

const baseURL = "http://localhost:3000";

function requestUrl(input: RequestInfo | URL): string {
	return typeof input === "string"
		? input
		: input instanceof URL
			? input.href
			: input.url;
}

/**
 * A metadata refresh must store a dropped list field in a form every adapter
 * accepts and reads back the way it reads a client registered without it.
 *
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-03#section-6
 */
export function cimdRefreshTestSuite() {
	const documents = new Map<string, unknown>();
	// Each auth instance needs its own plugin instances: the provider rejects a
	// discovery extension that is registered twice.
	const createOptions = (): BetterAuthOptions => ({
		baseURL,
		emailAndPassword: { enabled: true },
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				scopes: ["openid", "profile", "email"],
			}),
			cimd({
				metadataRevalidationInterval: 0,
				metadataFetchPolicy: { minimumFetchInterval: 0 },
				async fetchClientMetadataResource(input) {
					const url = requestUrl(input);
					return documents.has(url)
						? Response.json(documents.get(url))
						: new Response(null, { status: 404 });
				},
			}),
		],
	});
	const cimdBetterAuthOptions = createOptions();

	return createTestSuite(
		"cimd-refresh",
		{},
		({ getAuth, modifyBetterAuthOptions }) => {
			async function setup() {
				await modifyBetterAuthOptions(createOptions(), false);
				const auth = await getAuth();
				const signUp = await auth.api.signUpEmail({
					body: {
						email: `cimd-refresh-${crypto.randomUUID()}@example.com`,
						password: "cimd-refresh-password",
						name: "CIMD Refresh",
					},
					returnHeaders: true,
				});
				const cookie = (signUp.headers.getSetCookie?.() ?? [])
					.map((header) => header.split(";")[0])
					.join("; ");
				const context = await auth.$context;
				// Every lookup re-fetches the document because revalidation is immediate.
				const resolvePublicClient = async (clientId: string) => {
					const url = new URL(`${baseURL}/api/auth/oauth2/public-client`);
					url.searchParams.set("client_id", clientId);
					const response = await auth.handler(
						new Request(url, { headers: { cookie } }),
					);
					expect(response.status, await response.clone().text()).toBe(200);
					return (await response.json()) as Record<string, unknown>;
				};
				const readClient = (clientId: string) =>
					context.adapter.findOne<SchemaClient<Scope[]>>({
						model: "oauthClient",
						where: [{ field: "clientId", value: clientId }],
					});
				return { resolvePublicClient, readClient };
			}

			return {
				"clears the list fields a refreshed metadata document drops": {
					migrateBetterAuth: cimdBetterAuthOptions,
					async test() {
						const { resolvePublicClient, readClient } = await setup();
						const refreshedId =
							"https://refreshed-client.example.com/client-metadata.json";
						const freshId =
							"https://fresh-client.example.com/client-metadata.json";
						const bareDocument = (clientId: string) => ({
							client_id: clientId,
							client_name: "List Client",
							redirect_uris: [`${new URL(clientId).origin}/callback`],
							token_endpoint_auth_method: "none",
						});
						documents.set(refreshedId, {
							...bareDocument(refreshedId),
							contacts: ["owner@refreshed-client.example.com"],
							post_logout_redirect_uris: [
								"https://refreshed-client.example.com/signed-out",
							],
						});
						expect(await resolvePublicClient(refreshedId)).toMatchObject({
							contacts: ["owner@refreshed-client.example.com"],
						});

						documents.set(refreshedId, bareDocument(refreshedId));
						const refreshedPublic = await resolvePublicClient(refreshedId);
						documents.set(freshId, bareDocument(freshId));
						const freshPublic = await resolvePublicClient(freshId);
						expect({ ...refreshedPublic, client_id: freshId }).toEqual(
							freshPublic,
						);

						const refreshed = await readClient(refreshedId);
						expect(refreshed?.contacts ?? []).toEqual([]);
						expect(refreshed?.postLogoutRedirectUris ?? []).toEqual([]);
					},
				},
			};
		},
	)();
}
