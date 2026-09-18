import { describe, expect, it } from "vitest";
import { betterAuth } from "../../auth/full";
import { createAuthClient } from "../../client";
import { inferOrgAdditionalFields, organizationClient } from "./client";
import { organization } from "./organization";

describe("organization", () => {
	const auth = betterAuth({
		plugins: [
			organization({
				schema: {
					organization: {
						additionalFields: {
							newField: {
								type: "string",
							},
						},
					},
				},
			}),
		],
	});

	it("should infer additional fields", async () => {
		const client = createAuthClient({
			plugins: [
				organizationClient({
					schema: inferOrgAdditionalFields<typeof auth>(),
				}),
			],
			fetchOptions: {
				customFetchImpl: async () => new Response(),
			},
		});
		client.organization.create({
			name: "Test",
			slug: "test",
			newField: "123", //this should be allowed
			//@ts-expect-error - this field is not available
			unavailableField: "123", //this should be not allowed
		});
	});

	it("should infer filed when schema is provided", () => {
		const client = createAuthClient({
			plugins: [
				organizationClient({
					schema: inferOrgAdditionalFields({
						organization: {
							additionalFields: {
								newField: {
									type: "string",
								},
							},
						},
					}),
				}),
			],
			fetchOptions: {
				customFetchImpl: async () => new Response(),
			},
		});

		client.organization.create({
			name: "Test",
			slug: "test",
			newField: "123", //this should be allowed
			//@ts-expect-error - this field is not available
			unavailableField: "123", //this should be not allowed
		});
	});
});

describe("organizationClient atomListeners", () => {
	const getActiveOrgMatcher = () => {
		const plugin = organizationClient();
		const listener = plugin.atomListeners?.find(
			(l) => l.signal === "$activeOrgSignal",
		);
		if (!listener) throw new Error("$activeOrgSignal listener not found");
		return listener.matcher;
	};

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9710
	 */
	it("$activeOrgSignal matcher flips on session-changing paths", () => {
		const matcher = getActiveOrgMatcher();

		// Session-changing paths — the new session may carry a different
		// activeOrganizationId set server-side via the documented
		// `databaseHooks.session.create.before` hook, so the active-org query
		// must refetch to avoid returning a stale `null`.
		expect(matcher("/sign-in/email")).toBe(true);
		expect(matcher("/sign-up/email")).toBe(true);
		expect(matcher("/verify-email")).toBe(true);
		expect(matcher("/update-session")).toBe(true);
		expect(matcher("/delete-user")).toBe(true);

		// Existing behaviour — still flips on /sign-out and all /organization paths.
		expect(matcher("/sign-out")).toBe(true);
		expect(matcher("/organization/set-active")).toBe(true);
		expect(matcher("/organization/create")).toBe(true);
		expect(matcher("/organization/anything")).toBe(true);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9710
	 *
	 * Guard against over-triggering: non-session, non-organization paths must
	 * not flip $activeOrgSignal — otherwise unrelated calls would force the
	 * active-org query to refetch on every request.
	 */
	it("$activeOrgSignal matcher does not flip on unrelated paths", () => {
		const matcher = getActiveOrgMatcher();

		// Read-only session reads — must not trigger a refetch.
		expect(matcher("/get-session")).toBe(false);
		expect(matcher("/list-sessions")).toBe(false);

		// User updates that don't change the active session/org — must not flip.
		expect(matcher("/update-user")).toBe(false);
		expect(matcher("/change-password")).toBe(false);
		expect(matcher("/change-email")).toBe(false);

		// Arbitrary unrelated path.
		expect(matcher("/some/other/path")).toBe(false);
	});
});
