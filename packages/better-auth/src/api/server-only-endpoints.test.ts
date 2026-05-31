import { describe, expect, it } from "vitest";
import { emailOTP } from "../plugins/email-otp";
import { jwt } from "../plugins/jwt";
import { organization } from "../plugins/organization";
import { twoFactor } from "../plugins/two-factor";
import { getTestInstance } from "../test-utils/test-instance";

/**
 * Server-only endpoints are callable through `auth.api.*` from trusted server
 * code but are never registered on the HTTP router. They carry no client method
 * and run no authorization of their own: their safety depends entirely on
 * staying off the HTTP surface. `createAuthEndpoint.serverOnly` enforces that by
 * setting `metadata.SERVER_ONLY`, so an accidentally-added path cannot expose
 * them (better-call's router skips an endpoint when its path is missing *or*
 * when `SERVER_ONLY` is set).
 *
 * This is the canonical registry of those endpoints. Adding a server-only
 * endpoint means adding it here; this test then guarantees it can never leak
 * onto the HTTP router. Removing an entry's `SERVER_ONLY` marker, or giving it a
 * routable path without the marker, fails the test loudly.
 */
const EXPECTED_SERVER_ONLY = [
	"setPassword",
	"addMember",
	"viewBackupCodes",
	"generateTOTP",
	"createVerificationOTP",
	"getVerificationOTP",
	"signJWT",
	"verifyJWT",
] as const;

type RegisteredEndpoint = {
	path?: string;
	options?: {
		method?: string | string[];
		metadata?: { SERVER_ONLY?: boolean };
	};
};

/** Mirrors better-call's router gate (`!endpoint.path || SERVER_ONLY` ⇒ skip). */
function isHttpReachable(endpoint: RegisteredEndpoint): boolean {
	return (
		Boolean(endpoint.path) && endpoint.options?.metadata?.SERVER_ONLY !== true
	);
}

async function getInstance() {
	return getTestInstance({
		plugins: [
			organization(),
			twoFactor(),
			emailOTP({
				async sendVerificationOTP() {},
			}),
			jwt(),
		],
	});
}

describe("server-only endpoints", () => {
	it("registers them on auth.api but keeps them off the HTTP router", async () => {
		const { auth } = await getInstance();
		const api = auth.api as unknown as Record<string, RegisteredEndpoint>;

		for (const name of EXPECTED_SERVER_ONLY) {
			const endpoint = api[name];
			expect(endpoint, `${name} should be registered on auth.api`).toBeTypeOf(
				"function",
			);
			if (!endpoint) continue;
			expect(
				endpoint.options?.metadata?.SERVER_ONLY,
				`${name} must set metadata.SERVER_ONLY (use createAuthEndpoint.serverOnly)`,
			).toBe(true);
			expect(
				isHttpReachable(endpoint),
				`${name} must not be reachable over HTTP`,
			).toBe(false);
		}
	});

	it("snapshots the HTTP-reachable surface so accidental exposure is a loud diff", async () => {
		const { auth } = await getInstance();
		const api = auth.api as unknown as Record<string, RegisteredEndpoint>;

		const routes = Object.values(api)
			.filter(isHttpReachable)
			.flatMap((endpoint) => {
				const method = endpoint.options?.method ?? "*";
				const methods = Array.isArray(method) ? method : [method];
				return methods.map((m) => `${m} ${endpoint.path}`);
			})
			.sort();

		// A diff here means the HTTP surface changed. If a server-only endpoint
		// (e.g. POST /organization/add-member) appears, it just leaked onto the
		// router; the test above names exactly which one.
		expect(routes).toMatchSnapshot();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-3vf6-4wr3-c35q
	 *
	 * `add-member` is a server-only endpoint, not an HTTP route. An
	 * unauthenticated request to its documented path must 404 (no such route),
	 * not reach the handler. The `remove-member` control is a real HTTP route and
	 * must 401, proving the harness exercises the router and that the 404 means
	 * the route is absent, not that the request was rejected.
	 */
	it("does not expose POST /organization/add-member over HTTP", async () => {
		const { auth } = await getInstance();
		const base = "http://localhost:3000/api/auth";

		const addMember = await auth.handler(
			new Request(`${base}/organization/add-member`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					userId: "attacker-user-id",
					role: "owner",
					organizationId: "victim-org-id",
				}),
			}),
		);
		expect(addMember.status).toBe(404);

		const removeMember = await auth.handler(
			new Request(`${base}/organization/remove-member`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ memberIdOrEmail: "victim-member-id" }),
			}),
		);
		expect(removeMember.status).toBe(401);
	});
});
