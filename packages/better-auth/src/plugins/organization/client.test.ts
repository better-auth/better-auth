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

/**
 * @see https://github.com/better-auth/better-auth/issues/11530
 */
describe("organization client delete signals", () => {
	const { atomListeners } = organizationClient();
	const matchesFor = (signal: string) => {
		const matchers = (atomListeners ?? [])
			.filter((listener) => listener.signal === signal)
			.map((listener) => listener.matcher);
		expect(matchers.length).toBeGreaterThan(0);
		return (path: string) => matchers.some((matcher) => matcher(path));
	};

	it.each([
		"$listOrg",
		"$activeOrgSignal",
		"$sessionSignal",
	])("refreshes %s after a deletion is applied", (signal) => {
		const matches = matchesFor(signal);
		expect(matches("/organization/delete")).toBe(true);
		expect(matches("/organization/delete/callback")).toBe(true);
		expect(matches("/organization/delete/confirm")).toBe(true);
	});

	// `$activeOrgSignal` deliberately follows every organization path, so a
	// preview is only expected to leave the other two alone.
	it.each([
		"$listOrg",
		"$sessionSignal",
	])("leaves %s alone after a preview", (signal) => {
		expect(matchesFor(signal)("/organization/delete/preview")).toBe(false);
	});
});
