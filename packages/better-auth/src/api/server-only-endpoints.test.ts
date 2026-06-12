import type { BetterAuthPlugin } from "@better-auth/core";
import { describe, expect, it } from "vitest";
import { emailOTP } from "../plugins/email-otp";
import { jwt } from "../plugins/jwt";
import { organization } from "../plugins/organization";
import { twoFactor } from "../plugins/two-factor";
import { getTestInstance } from "../test-utils/test-instance";
import { createAuthEndpoint } from "./index";

const BASE = "http://localhost:3000/api/auth";

/**
 * Endpoints callable through `auth.api.*` from trusted server code that must
 * never be reachable over HTTP. They are kept off the router by carrying no
 * routable path. This list is the source of truth: register a new server-only
 * endpoint here so the tests below fail if one ever gains an HTTP route.
 */
const SERVER_ONLY_ENDPOINTS = [
	"setPassword",
	"addMember",
	"viewBackupCodes",
	"generateTOTP",
	"createVerificationOTP",
	"getVerificationOTP",
	"signJWT",
	"verifyJWT",
] as const;

type RegisteredEndpoint = { path?: string };

describe("server-only endpoints", async () => {
	const { auth } = await getTestInstance({
		plugins: [
			organization(),
			twoFactor(),
			emailOTP({
				async sendVerificationOTP() {},
			}),
			jwt(),
		],
	});
	const api = auth.api as unknown as Record<string, RegisteredEndpoint>;

	it.each(
		SERVER_ONLY_ENDPOINTS,
	)("registers %s on auth.api with no HTTP route", (name) => {
		expect(api[name], `${name} should be registered on auth.api`).toBeTypeOf(
			"function",
		);
		expect(
			api[name]?.path,
			`${name} must not carry a routable path`,
		).toBeFalsy();
	});

	it("keeps an endpoint off the router when it is marked SERVER_ONLY despite a path", async () => {
		const probe = {
			id: "server-only-probe",
			endpoints: {
				// The case path omission alone cannot guard: a server-only endpoint
				// that also declares a routable path. The SERVER_ONLY marker must
				// still keep it off the router.
				marked: createAuthEndpoint(
					"/server-only-probe/marked",
					{
						method: "POST",
						metadata: { SERVER_ONLY: true },
					},
					async (c) => c.json({ reached: true }),
				),
				// Same plugin, no marker: proves the harness mounts path-bearing
				// endpoints, so the 404 below is the marker and not a setup quirk.
				routable: createAuthEndpoint(
					"/server-only-probe/routable",
					{ method: "POST" },
					async (c) => c.json({ reached: true }),
				),
			},
		} satisfies BetterAuthPlugin;
		const { auth: probeAuth } = await getTestInstance({ plugins: [probe] });

		const marked = await probeAuth.handler(
			new Request(`${BASE}/server-only-probe/marked`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{}",
			}),
		);
		expect(marked.status).toBe(404);

		const routable = await probeAuth.handler(
			new Request(`${BASE}/server-only-probe/routable`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{}",
			}),
		);
		expect(routable.status).not.toBe(404);
	});

	/**
	 * `addMember` is server-only. An unauthenticated request to its documented
	 * path must 404 (no such route), not reach the handler. The `removeMember`
	 * control is a real route and must 401, proving the 404 means the route is
	 * absent rather than the request being rejected.
	 */
	it("does not route POST /organization/add-member", async () => {
		const addMember = await auth.handler(
			new Request(`${BASE}/organization/add-member`, {
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
			new Request(`${BASE}/organization/remove-member`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ memberIdOrEmail: "victim-member-id" }),
			}),
		);
		expect(removeMember.status).toBe(401);
	});

	it("does not route POST /two-factor/view-backup-codes", async () => {
		const response = await auth.handler(
			new Request(`${BASE}/two-factor/view-backup-codes`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ userId: "victim-user-id" }),
			}),
		);
		expect(response.status).toBe(404);
	});
});
