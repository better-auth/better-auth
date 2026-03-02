import { organization } from "@better-auth/organization";
import {
	adminAc,
	defaultStatements,
	memberAc,
	ownerAc,
} from "@better-auth/organization/access";
import { createAccessControl } from "better-auth/plugins/access";
import { getTestInstance } from "better-auth/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiKey, API_KEY_ERROR_CODES as ERROR_CODES } from ".";
import { apiKeyClient } from "./client";

describe("organization API keys", async () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	describe("basic organization ownership", async () => {
		const { auth, client, signInWithTestUser, signInWithUser } =
			await getTestInstance(
				{
					plugins: [
						organization({
							async sendInvitationEmail() {},
						}),
						apiKey([
							{
								configId: "user-keys",
								defaultPrefix: "usr_",
								references: "user",
							},
							{
								configId: "org-keys",
								defaultPrefix: "org_",
								references: "organization",
							},
						]),
					],
				},
				{
					clientOptions: {
						plugins: [apiKeyClient()],
					},
				},
			);

		it("organization owner should have full CRUD access to API keys", async () => {
			const { headers } = await signInWithTestUser();

			const org = await auth.api.createOrganization({
				body: { name: "Owner CRUD Org", slug: `owner-crud-${Date.now()}` },
				headers,
			});

			// Create
			const createResult = await client.apiKey.create(
				{ configId: "org-keys", organizationId: org.id },
				{ headers },
			);
			expect(createResult.error).toBeFalsy();
			expect(createResult.data?.referenceId).toBe(org.id);
			expect(createResult.data?.configId).toBe("org-keys");

			// List
			const listResult = await client.apiKey.list(
				{ query: { organizationId: org.id } },
				{ headers },
			);
			expect(listResult.error).toBeFalsy();
			expect(listResult.data?.apiKeys.length).toBeGreaterThan(0);

			// Get
			const getResult = await client.apiKey.get(
				{ query: { id: createResult.data!.id, configId: "org-keys" } },
				{ headers },
			);
			expect(getResult.error).toBeFalsy();
			expect(getResult.data?.id).toBe(createResult.data!.id);

			// Update
			const updateResult = await client.apiKey.update(
				{
					keyId: createResult.data!.id,
					configId: "org-keys",
					name: "Updated Key",
				},
				{ headers },
			);
			expect(updateResult.error).toBeFalsy();
			expect(updateResult.data?.name).toBe("Updated Key");

			// Delete
			const deleteResult = await client.apiKey.delete(
				{ keyId: createResult.data!.id, configId: "org-keys" },
				{ headers },
			);
			expect(deleteResult.error).toBeFalsy();
		});

		it("non-member should be denied access to organization API keys", async () => {
			const { headers: ownerHeaders } = await signInWithTestUser();

			const org = await auth.api.createOrganization({
				body: { name: "Non Member Org", slug: `non-member-${Date.now()}` },
				headers: ownerHeaders,
			});

			// Create a key as owner
			const orgKey = await auth.api.createApiKey({
				body: { configId: "org-keys", organizationId: org.id },
				headers: ownerHeaders,
			});

			// Create a non-member user
			const nonMemberEmail = `non-member-${Date.now()}@test.com`;
			await auth.api.signUpEmail({
				body: {
					email: nonMemberEmail,
					password: "password123",
					name: "Non Member",
				},
			});
			const { headers: nonMemberHeaders } = await signInWithUser(
				nonMemberEmail,
				"password123",
			);

			// List - should fail
			const listResult = await client.apiKey.list(
				{ query: { organizationId: org.id } },
				{ headers: nonMemberHeaders },
			);
			expect(listResult.error).toBeDefined();
			expect(listResult.error?.status).toBe(403);
			expect(listResult.error?.code).toBe(
				ERROR_CODES.USER_NOT_MEMBER_OF_ORGANIZATION.code,
			);

			// Create - should fail
			const createResult = await client.apiKey.create(
				{ configId: "org-keys", organizationId: org.id },
				{ headers: nonMemberHeaders },
			);
			expect(createResult.error).toBeDefined();
			expect(createResult.error?.status).toBe(403);

			// Get - should fail
			const getResult = await client.apiKey.get(
				{ query: { id: orgKey.id, configId: "org-keys" } },
				{ headers: nonMemberHeaders },
			);
			expect(getResult.error).toBeDefined();
			expect(getResult.error?.status).toBe(403);

			// Update - should fail
			const updateResult = await client.apiKey.update(
				{ keyId: orgKey.id, configId: "org-keys", name: "Hacked" },
				{ headers: nonMemberHeaders },
			);
			expect(updateResult.error).toBeDefined();
			expect(updateResult.error?.status).toBe(403);

			// Delete - should fail
			const deleteResult = await client.apiKey.delete(
				{ keyId: orgKey.id, configId: "org-keys" },
				{ headers: nonMemberHeaders },
			);
			expect(deleteResult.error).toBeDefined();
			expect(deleteResult.error?.status).toBe(403);
		});

		it("member without apiKey permissions should be denied (default roles)", async () => {
			const { headers: ownerHeaders } = await signInWithTestUser();

			const org = await auth.api.createOrganization({
				body: {
					name: "Default Roles Org",
					slug: `default-roles-${Date.now()}`,
				},
				headers: ownerHeaders,
			});

			// Create a member user
			const memberEmail = `member-${Date.now()}@test.com`;
			await auth.api.signUpEmail({
				body: {
					email: memberEmail,
					password: "password123",
					name: "Member User",
				},
			});

			// Invite the member
			const invitationResult = await auth.api.createInvitation({
				body: { organizationId: org.id, email: memberEmail, role: "member" },
				headers: ownerHeaders,
			});

			const { headers: memberHeaders } = await signInWithUser(
				memberEmail,
				"password123",
			);

			// Accept the invitation directly using the returned invitation ID
			await auth.api.acceptInvitation({
				body: { invitationId: invitationResult.invitation.id },
				headers: memberHeaders,
			});

			// Member with default role has no apiKey permissions
			const listResult = await client.apiKey.list(
				{ query: { organizationId: org.id } },
				{ headers: memberHeaders },
			);
			expect(listResult.error).toBeDefined();
			expect(listResult.error?.status).toBe(403);
			expect(listResult.error?.code).toBe(
				ERROR_CODES.INSUFFICIENT_API_KEY_PERMISSIONS.code,
			);
		});

		it("should correctly separate user and org keys when listing", async () => {
			const { headers, user } = await signInWithTestUser();

			const org = await auth.api.createOrganization({
				body: { name: "Separate Keys Org", slug: `separate-${Date.now()}` },
				headers,
			});

			// Create user-owned key
			const userKey = await auth.api.createApiKey({
				body: { configId: "user-keys", userId: user.id },
			});

			// Create org-owned key
			const orgKey = await auth.api.createApiKey({
				body: { configId: "org-keys", organizationId: org.id },
				headers,
			});

			// List without organizationId should return only user keys
			const userKeysResult = await client.apiKey.list({}, { headers });
			expect(userKeysResult.error).toBeFalsy();
			const userKeyIds = userKeysResult.data?.apiKeys.map((k) => k.id) || [];
			expect(userKeyIds).toContain(userKey.id);
			expect(userKeyIds).not.toContain(orgKey.id);

			// List with organizationId should return only org keys
			const orgKeysResult = await client.apiKey.list(
				{ query: { organizationId: org.id } },
				{ headers },
			);
			expect(orgKeysResult.error).toBeFalsy();
			const orgKeyIds = orgKeysResult.data?.apiKeys.map((k) => k.id) || [];
			expect(orgKeyIds).toContain(orgKey.id);
			expect(orgKeyIds).not.toContain(userKey.id);
		});

		it("verify API key should work for organization-owned keys", async () => {
			const { headers } = await signInWithTestUser();

			const org = await auth.api.createOrganization({
				body: { name: "Verify Org", slug: `verify-${Date.now()}` },
				headers,
			});

			const orgKey = await auth.api.createApiKey({
				body: { configId: "org-keys", organizationId: org.id },
				headers,
			});

			const verifyResult = await auth.api.verifyApiKey({
				body: { key: orgKey.key, configId: "org-keys" },
			});

			expect(verifyResult.valid).toBe(true);
			expect(verifyResult.key?.configId).toBe("org-keys");
			expect(verifyResult.key?.referenceId).toBe(org.id);
		});
	});

	describe("custom apiKey permissions in roles", async () => {
		// Create access control with apiKey resource
		const ac = createAccessControl({
			...defaultStatements,
			apiKey: ["create", "read", "update", "delete"],
		});

		// Define roles with different apiKey permissions
		const ownerRole = ac.newRole({
			...ownerAc.statements,
			apiKey: ["create", "read", "update", "delete"],
		});

		const adminRole = ac.newRole({
			...adminAc.statements,
			apiKey: ["create", "read", "update", "delete"],
		});

		const memberRole = ac.newRole({
			...memberAc.statements,
			apiKey: ["read"], // Members can only read
		});

		const restrictedRole = ac.newRole({
			...memberAc.statements,
			// No apiKey permissions
		});

		const { auth, client, signInWithTestUser, signInWithUser } =
			await getTestInstance(
				{
					plugins: [
						organization({
							ac,
							roles: {
								owner: ownerRole,
								admin: adminRole,
								member: memberRole,
								restricted: restrictedRole,
							},
							async sendInvitationEmail() {},
						}),
						apiKey([
							{
								configId: "org-keys",
								defaultPrefix: "org_",
								references: "organization",
							},
						]),
					],
				},
				{
					clientOptions: {
						plugins: [apiKeyClient()],
					},
				},
			);

		async function createUserAndInvite(
			ownerHeaders: Headers,
			orgId: string,
			role: "admin" | "member" | "owner" | "restricted",
		): Promise<Headers> {
			const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
			await auth.api.signUpEmail({
				body: { email, password: "password123", name: `${role} User` },
			});

			const invitationResult = await auth.api.createInvitation({
				body: { organizationId: orgId, email, role },
				headers: ownerHeaders,
			});

			const { headers } = await signInWithUser(email, "password123");

			await auth.api.acceptInvitation({
				body: { invitationId: invitationResult.invitation.id },
				headers,
			});

			return headers;
		}

		it("admin role should have full apiKey CRUD permissions", async () => {
			const { headers: ownerHeaders } = await signInWithTestUser();

			const org = await auth.api.createOrganization({
				body: { name: "Admin Test Org", slug: `admin-test-${Date.now()}` },
				headers: ownerHeaders,
			});

			const adminHeaders = await createUserAndInvite(
				ownerHeaders,
				org.id,
				"admin",
			);

			// Create
			const createResult = await client.apiKey.create(
				{ configId: "org-keys", organizationId: org.id },
				{ headers: adminHeaders },
			);
			expect(createResult.error).toBeFalsy();
			expect(createResult.data?.id).toBeDefined();

			// Read
			const listResult = await client.apiKey.list(
				{ query: { organizationId: org.id } },
				{ headers: adminHeaders },
			);
			expect(listResult.error).toBeFalsy();
			expect(listResult.data?.apiKeys.length).toBeGreaterThan(0);

			// Update
			const updateResult = await client.apiKey.update(
				{
					keyId: createResult.data!.id,
					configId: "org-keys",
					name: "Admin Updated",
				},
				{ headers: adminHeaders },
			);
			expect(updateResult.error).toBeFalsy();
			expect(updateResult.data?.name).toBe("Admin Updated");

			// Delete
			const deleteResult = await client.apiKey.delete(
				{ keyId: createResult.data!.id, configId: "org-keys" },
				{ headers: adminHeaders },
			);
			expect(deleteResult.error).toBeFalsy();
		});

		it("member role with read-only permission should be limited", async () => {
			const { headers: ownerHeaders } = await signInWithTestUser();

			const org = await auth.api.createOrganization({
				body: { name: "Member Read Org", slug: `member-read-${Date.now()}` },
				headers: ownerHeaders,
			});

			// Create a key as owner
			const orgKey = await auth.api.createApiKey({
				body: { configId: "org-keys", organizationId: org.id },
				headers: ownerHeaders,
			});

			const memberHeaders = await createUserAndInvite(
				ownerHeaders,
				org.id,
				"member",
			);

			// Read should work
			const listResult = await client.apiKey.list(
				{ query: { organizationId: org.id } },
				{ headers: memberHeaders },
			);
			expect(listResult.error).toBeFalsy();
			expect(listResult.data?.apiKeys.length).toBeGreaterThan(0);

			const getResult = await client.apiKey.get(
				{ query: { id: orgKey.id, configId: "org-keys" } },
				{ headers: memberHeaders },
			);
			expect(getResult.error).toBeFalsy();

			// Create should fail
			const createResult = await client.apiKey.create(
				{ configId: "org-keys", organizationId: org.id },
				{ headers: memberHeaders },
			);
			expect(createResult.error).toBeDefined();
			expect(createResult.error?.status).toBe(403);
			expect(createResult.error?.code).toBe(
				ERROR_CODES.INSUFFICIENT_API_KEY_PERMISSIONS.code,
			);

			// Update should fail
			const updateResult = await client.apiKey.update(
				{ keyId: orgKey.id, configId: "org-keys", name: "Hacked" },
				{ headers: memberHeaders },
			);
			expect(updateResult.error).toBeDefined();
			expect(updateResult.error?.status).toBe(403);

			// Delete should fail
			const deleteResult = await client.apiKey.delete(
				{ keyId: orgKey.id, configId: "org-keys" },
				{ headers: memberHeaders },
			);
			expect(deleteResult.error).toBeDefined();
			expect(deleteResult.error?.status).toBe(403);
		});

		it("restricted role with no apiKey permissions should be fully denied", async () => {
			const { headers: ownerHeaders } = await signInWithTestUser();

			const org = await auth.api.createOrganization({
				body: { name: "Restricted Org", slug: `restricted-${Date.now()}` },
				headers: ownerHeaders,
			});

			// Create a key as owner
			const orgKey = await auth.api.createApiKey({
				body: { configId: "org-keys", organizationId: org.id },
				headers: ownerHeaders,
			});

			const restrictedHeaders = await createUserAndInvite(
				ownerHeaders,
				org.id,
				"restricted",
			);

			// All operations should fail
			const listResult = await client.apiKey.list(
				{ query: { organizationId: org.id } },
				{ headers: restrictedHeaders },
			);
			expect(listResult.error).toBeDefined();
			expect(listResult.error?.status).toBe(403);

			const getResult = await client.apiKey.get(
				{ query: { id: orgKey.id, configId: "org-keys" } },
				{ headers: restrictedHeaders },
			);
			expect(getResult.error).toBeDefined();
			expect(getResult.error?.status).toBe(403);

			const createResult = await client.apiKey.create(
				{ configId: "org-keys", organizationId: org.id },
				{ headers: restrictedHeaders },
			);
			expect(createResult.error).toBeDefined();
			expect(createResult.error?.status).toBe(403);

			const updateResult = await client.apiKey.update(
				{ keyId: orgKey.id, configId: "org-keys", name: "Hacked" },
				{ headers: restrictedHeaders },
			);
			expect(updateResult.error).toBeDefined();
			expect(updateResult.error?.status).toBe(403);

			const deleteResult = await client.apiKey.delete(
				{ keyId: orgKey.id, configId: "org-keys" },
				{ headers: restrictedHeaders },
			);
			expect(deleteResult.error).toBeDefined();
			expect(deleteResult.error?.status).toBe(403);
		});
	});

	describe("edge cases", async () => {
		it("should return error when organization plugin is not installed", async () => {
			const { client, signInWithTestUser } = await getTestInstance(
				{
					plugins: [
						// Note: organization plugin is NOT installed
						apiKey([
							{
								configId: "org-keys",
								defaultPrefix: "org_",
								references: "organization",
							},
						]),
					],
				},
				{
					clientOptions: {
						plugins: [apiKeyClient()],
					},
				},
			);

			const { headers } = await signInWithTestUser();

			const createResult = await client.apiKey.create(
				{ configId: "org-keys", organizationId: "fake-org-id" },
				{ headers },
			);

			expect(createResult.error).toBeDefined();
			expect(createResult.error?.status).toBe(500);
		});

		it("should not allow accessing org key with wrong configId", async () => {
			const { auth, client, signInWithTestUser } = await getTestInstance(
				{
					plugins: [
						organization({
							async sendInvitationEmail() {},
						}),
						apiKey([
							{
								configId: "user-keys",
								defaultPrefix: "usr_",
								references: "user",
							},
							{
								configId: "org-keys",
								defaultPrefix: "org_",
								references: "organization",
							},
						]),
					],
				},
				{
					clientOptions: {
						plugins: [apiKeyClient()],
					},
				},
			);

			const { headers } = await signInWithTestUser();

			const org = await auth.api.createOrganization({
				body: { name: "Wrong Config Org", slug: `wrong-config-${Date.now()}` },
				headers,
			});

			const orgKey = await auth.api.createApiKey({
				body: { configId: "org-keys", organizationId: org.id },
				headers,
			});

			// Try to get org key with user-keys config
			const getResult = await client.apiKey.get(
				{ query: { id: orgKey.id, configId: "user-keys" } },
				{ headers },
			);
			expect(getResult.error).toBeDefined();
			expect(getResult.error?.status).toBe(404);
		});
	});
});
