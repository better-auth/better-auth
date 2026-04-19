import { describe, it } from "vitest";
import { betterAuth } from "../../auth/full";
import { createAuthClient } from "../../client";
import { createAccessControl } from "../access";
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

	it("should accept custom access control without type errors", () => {
		const customStatements = {
			organization: ["read", "update", "delete"],
			member: ["create", "read", "update", "delete"],
			project: ["create", "read", "update", "delete"],
		} as const;

		const ac = createAccessControl(customStatements);
		const roles = {
			admin: ac.newRole({
				organization: ["read", "update"],
				member: ["create", "read", "update", "delete"],
				project: ["create", "read", "update", "delete"],
			}),
			viewer: ac.newRole({
				organization: ["read"],
				project: ["read"],
			}),
		} as const;

		const client = createAuthClient({
			plugins: [
				organizationClient({
					ac,
					roles,
				}),
			],
			fetchOptions: {
				customFetchImpl: async () => new Response(),
			},
		});

		client.organization.create({
			name: "Test",
			slug: "test",
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
