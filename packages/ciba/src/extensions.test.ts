import type { OAuthClient } from "@better-auth/oauth-provider";
import { oauthProvider } from "@better-auth/oauth-provider";
import { APIError } from "better-auth/api";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { decodeJwt } from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { CibaRequest, SendNotificationData } from "./index";
import { CIBA_GRANT_TYPE, ciba } from "./index";

const baseURL = "http://localhost:3000";
const notificationEndpoint = "https://client.example.com/ciba";
const resource = "https://api.example.com";
const payment = {
	type: "payment_initiation",
	instructedAmount: { currency: "EUR", amount: "12.00" },
};

let lastNotification: SendNotificationData | undefined;
let issuanceSeen: CibaRequest | undefined;
let refuseIssuance = false;

const { auth, signInWithTestUser, customFetchImpl, testUser } =
	await getTestInstance({
		baseURL,
		plugins: [
			jwt({ jwt: { issuer: baseURL } }),
			oauthProvider({
				loginPage: "/login",
				allowDynamicClientRegistration: true,
				allowUnauthenticatedClientRegistration: true,
				consentPage: "/consent",
				// A resource makes the access token a JWT, which carries per-issuance claims.
				resources: [resource],
				enforcePerClientResources: false,
			}),
			ciba({
				approvalPage: "/approve",
				deliveryModes: ["poll", "ping"],
				interval: 1,
				allowPublicClients: true,
				authorizationDetailsTypes: ["payment_initiation"],
				schema: {
					cibaRequest: {
						additionalFields: {
							riskLevel: { type: "string", required: false },
							approvalMethod: { type: "string", required: false },
						},
					},
				},
				sendNotification: (data) => {
					lastNotification = data;
				},
				validateRequest: ({ request }) => {
					if (request.acrValues === "unsupported") {
						throw new APIError("BAD_REQUEST", {
							error: "invalid_request",
							error_description: "Unsupported acr_values",
						});
					}
					return { additionalFields: { riskLevel: "low" } };
				},
				beforeTokenIssuance: ({ request }) => {
					issuanceSeen = request;
					if (refuseIssuance) {
						throw new APIError("FORBIDDEN", {
							error: "insufficient_authorization",
							error_description: "Step-up required",
						});
					}
					return { accessTokenClaims: { risk: request.riskLevel } };
				},
			}),
		],
	});

const { headers } = await signInWithTestUser();
let confidential: OAuthClient;
let publicClient: OAuthClient;
let pingClient: OAuthClient;

function form(params: Record<string, string>) {
	return new URLSearchParams(params).toString();
}

function authorization(client: OAuthClient): Record<string, string> {
	return client.client_secret
		? {
				authorization: `Basic ${btoa(`${client.client_id}:${client.client_secret}`)}`,
			}
		: {};
}

function withClientId(client: OAuthClient, params: Record<string, string>) {
	return client.client_secret
		? params
		: { ...params, client_id: client.client_id };
}

async function bcAuthorize(
	client: OAuthClient,
	params: Record<string, string>,
) {
	const res = await customFetchImpl(`${baseURL}/api/auth/oauth2/bc-authorize`, {
		method: "POST",
		headers: {
			"content-type": "application/x-www-form-urlencoded",
			...authorization(client),
		},
		body: form(
			withClientId(client, {
				scope: "openid",
				login_hint: testUser.email,
				...params,
			}),
		),
	});
	return { status: res.status, body: await res.json() };
}

async function poll(client: OAuthClient, authReqId: string) {
	const res = await customFetchImpl(`${baseURL}/api/auth/oauth2/token`, {
		method: "POST",
		headers: {
			"content-type": "application/x-www-form-urlencoded",
			...authorization(client),
		},
		body: form(
			withClientId(client, {
				grant_type: CIBA_GRANT_TYPE,
				auth_req_id: authReqId,
			}),
		),
	});
	return { status: res.status, body: await res.json() };
}

beforeAll(async () => {
	const create = (body: Record<string, unknown>) =>
		auth.api.adminCreateOAuthClient({
			headers,
			body: { grant_types: [CIBA_GRANT_TYPE], ...body },
		});
	confidential = await create({
		metadata: { backchannel_token_delivery_mode: "poll" },
	});
	publicClient = await create({
		token_endpoint_auth_method: "none",
		metadata: { backchannel_token_delivery_mode: "poll" },
	});
	pingClient = await create({
		metadata: {
			backchannel_token_delivery_mode: "ping",
			backchannel_client_notification_endpoint: notificationEndpoint,
		},
	});
});

afterEach(() => {
	refuseIssuance = false;
	vi.restoreAllMocks();
});

describe("ciba extension options", () => {
	it("lets a public client complete the flow when allowed", async () => {
		const started = await bcAuthorize(publicClient, {});
		expect(started.status).toBe(200);
		await auth.api.cibaApprove({
			headers,
			body: { auth_req_id: started.body.auth_req_id },
		});
		expect((await poll(publicClient, started.body.auth_req_id)).status).toBe(
			200,
		);
	});

	it("stores acr_values and lets validateRequest reject them", async () => {
		const rejected = await bcAuthorize(confidential, {
			acr_values: "unsupported",
		});
		expect(rejected.body.error).toBe("invalid_request");

		const accepted = await bcAuthorize(confidential, { acr_values: "mfa" });
		expect(lastNotification?.acrValues).toBe("mfa");
		const details = await auth.api.cibaRequest({
			headers,
			query: { auth_req_id: accepted.body.auth_req_id },
		});
		expect(details.acr_values).toBe("mfa");
	});

	it("gives beforeTokenIssuance the full row and adds its claims", async () => {
		const { body } = await bcAuthorize(confidential, {
			acr_values: "mfa",
			resource,
		});
		await auth.api.cibaApprove({
			headers,
			body: { auth_req_id: body.auth_req_id },
		});
		const issued = await poll(confidential, body.auth_req_id);
		expect(issuanceSeen).toMatchObject({
			acrValues: "mfa",
			riskLevel: "low",
			status: "approved",
		});
		expect(issuanceSeen).not.toHaveProperty("clientNotificationToken");
		expect(decodeJwt(issued.body.access_token).risk).toBe("low");
	});

	it("keeps the approved request when beforeTokenIssuance refuses", async () => {
		const { body } = await bcAuthorize(confidential, {});
		await auth.api.cibaApprove({
			headers,
			body: { auth_req_id: body.auth_req_id },
		});
		refuseIssuance = true;
		const refused = await poll(confidential, body.auth_req_id);
		expect(refused.body.error).toBe("insufficient_authorization");
		refuseIssuance = false;
		await new Promise((resolve) => setTimeout(resolve, 1100));
		expect((await poll(confidential, body.auth_req_id)).status).toBe(200);
	});

	it("carries configured authorization_details through to the tokens", async () => {
		const { body } = await bcAuthorize(confidential, {
			authorization_details: JSON.stringify([payment]),
			resource,
		});
		expect(lastNotification?.authorizationDetails).toEqual([payment]);
		await auth.api.cibaApprove({
			headers,
			body: { auth_req_id: body.auth_req_id },
		});
		const issued = await poll(confidential, body.auth_req_id);
		expect(issued.body.authorization_details).toEqual([payment]);
		expect(decodeJwt(issued.body.access_token).authorization_details).toEqual([
			payment,
		]);
	});

	it.each([
		["an unconfigured type", [{ type: "account_information" }]],
		["a non-array value", payment],
		["an empty array", []],
	])("rejects authorization_details with %s", async (_, value) => {
		const res = await bcAuthorize(confidential, {
			authorization_details: JSON.stringify(value),
		});
		expect(res.body.error).toBe("invalid_authorization_details");
	});

	it("advertises the accepted authorization_details types", async () => {
		const metadata = (await auth.api.getOpenIdConfig()) as Record<
			string,
			unknown
		>;
		expect(metadata.authorization_details_types_supported).toEqual([
			"payment_initiation",
		]);
	});
});

describe("ciba dynamic client registration", () => {
	async function register(body: Record<string, unknown>) {
		const res = await customFetchImpl(`${baseURL}/api/auth/oauth2/register`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				client_name: "Registered Agent",
				grant_types: [CIBA_GRANT_TYPE],
				token_endpoint_auth_method: "client_secret_basic",
				...body,
			}),
		});
		return { status: res.status, body: await res.json() };
	}

	it("accepts CIBA registration metadata as top-level fields (CIBA §4)", async () => {
		const registered = await register({
			backchannel_token_delivery_mode: "ping",
			backchannel_client_notification_endpoint: notificationEndpoint,
		});
		expect(registered.status).toBe(201);
		const started = await bcAuthorize(registered.body as OAuthClient, {
			client_notification_token: "client-token",
		});
		expect(started.status).toBe(200);
	});

	it("rejects an unsupported delivery mode at registration", async () => {
		const registered = await register({
			backchannel_token_delivery_mode: "push",
		});
		expect(registered.status).toBe(400);
		expect(registered.body.error).toBe("invalid_client_metadata");
	});
});

describe("ciba server-side completion", () => {
	it("completes by request_id, stores additionalFields, and pings", async () => {
		const realFetch = globalThis.fetch;
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockImplementation((input, init) =>
				String(input) === notificationEndpoint
					? Promise.resolve(new Response(null, { status: 204 }))
					: realFetch(input, init),
			);
		const { body } = await bcAuthorize(pingClient, {
			client_notification_token: "client-token",
		});
		const authTime = new Date(Date.now() - 60_000);
		const result = await auth.api.completeCibaRequest({
			body: {
				request_id: lastNotification?.requestId,
				decision: "approved",
				authTime,
				additionalFields: { approvalMethod: "policy" },
			},
		});
		expect(result).toEqual({ status: "approved" });

		const ping = fetchSpy.mock.calls.find(
			([input]) => String(input) === notificationEndpoint,
		);
		expect(ping?.[1]?.body).toBe(
			JSON.stringify({ auth_req_id: body.auth_req_id }),
		);
		const issued = await poll(pingClient, body.auth_req_id);
		expect(issuanceSeen?.approvalMethod).toBe("policy");
		expect(decodeJwt(issued.body.id_token).auth_time).toBe(
			Math.floor(authTime.getTime() / 1000),
		);
	});

	it("rejects additionalFields the schema does not declare", async () => {
		await bcAuthorize(confidential, {});
		await expect(
			auth.api.completeCibaRequest({
				body: {
					request_id: lastNotification?.requestId,
					decision: "approved",
					additionalFields: { status: "approved" },
				},
			}),
		).rejects.toMatchObject({ statusCode: 400 });
	});
});
