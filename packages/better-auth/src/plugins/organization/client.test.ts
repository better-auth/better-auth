import { describe, expect, it } from "vitest";
import { betterAuth } from "../../auth/full";
import { getClientConfig } from "../../client/config";
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

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9710
	 */
	it("should revalidate active organization on session-changing auth paths", () => {
		const { atomListeners } = getClientConfig({
			plugins: [organizationClient()],
		});

		const activeOrgListener = atomListeners.find(
			(listener) => listener.signal === "$activeOrgSignal",
		);

		expect(activeOrgListener).toBeDefined();
		const matcher = activeOrgListener!.matcher;
		expect(matcher).toBeDefined();

		// email flows
		expect(matcher("/sign-in/email")).toBe(true);
		expect(matcher("/sign-up/email")).toBe(true);
		expect(matcher("/verify-email")).toBe(true);
		expect(matcher("/sign-out")).toBe(true);
		expect(matcher("/update-session")).toBe(true);
		expect(matcher("/delete-user")).toBe(true);
		// username / phone-number plugins
		expect(matcher("/sign-in/username")).toBe(true);
		expect(matcher("/sign-in/phone-number")).toBe(true);
		expect(matcher("/phone-number/verify")).toBe(true);
		// email-otp plugin
		expect(matcher("/sign-in/email-otp")).toBe(true);
		expect(matcher("/email-otp/verify-email")).toBe(true);
		// two-factor plugin (verify paths complete authentication)
		expect(matcher("/two-factor/verify-totp")).toBe(true);
		expect(matcher("/two-factor/verify-otp")).toBe(true);
		expect(matcher("/two-factor/verify-backup-code")).toBe(true);
		// admin plugin (identity swap)
		expect(matcher("/admin/impersonate-user")).toBe(true);
		expect(matcher("/admin/stop-impersonating")).toBe(true);
		// multi-session plugin (session switch)
		expect(matcher("/multi-session/set-active")).toBe(true);

		expect(matcher("/organization/get-full-organization")).toBe(true);
		expect(matcher("/get-session")).toBe(false);
	});
});
