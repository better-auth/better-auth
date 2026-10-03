import { describe, expect, it, onTestFinished, vi } from "vitest";
import { betterAuth } from "../../auth/full";
import { createAuthClient } from "../../client";
import { getTestInstance } from "../../test-utils/test-instance";
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
 * @see https://github.com/better-auth/better-auth/issues/9710
 */
it("refreshes the active organization after sign-in sets it in a session hook", async () => {
	let initialOrganizationId: string | undefined;
	const { auth, client, runWithUser, testUser, sessionSetter } =
		await getTestInstance(
			{
				plugins: [organization()],
				databaseHooks: {
					session: {
						create: {
							before: async (session) => ({
								data: {
									...session,
									activeOrganizationId: initialOrganizationId,
								},
							}),
						},
					},
				},
			},
			{ clientOptions: { plugins: [organizationClient()] } },
		);

	await runWithUser(testUser.email, testUser.password, async (headers) => {
		const organization = await auth.api.createOrganization({
			body: { name: "Test Workspace", slug: "test-workspace" },
			headers,
		});
		if (!organization) throw new Error("Organization was not created");
		initialOrganizationId = organization.id;
		headers.delete("cookie");

		const previousWindow = global.window;
		global.window = {} as Window & typeof globalThis;
		onTestFinished(() => {
			global.window = previousWindow;
		});

		const activeOrganization = client.$store.atoms.activeOrganization;
		if (!activeOrganization)
			throw new Error("Active organization atom missing");
		const unsubscribe = activeOrganization.subscribe(() => {});
		onTestFinished(unsubscribe);
		await vi.waitFor(() => {
			expect(activeOrganization.get().isPending).toBe(false);
		});
		expect(activeOrganization.get().data).toBeNull();

		const result = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: { onSuccess: sessionSetter(headers) },
		});
		expect(result.error).toBeNull();

		const fullOrganization = await auth.api.getFullOrganization({ headers });
		expect(fullOrganization?.id).toBe(initialOrganizationId);

		await vi.waitFor(() => {
			expect(activeOrganization.get().data?.id).toBe(initialOrganizationId);
		});
	});
});
