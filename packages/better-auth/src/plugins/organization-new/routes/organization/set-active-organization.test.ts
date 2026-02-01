import { describe, expect } from "vitest";
import { organization } from "../../organization";
import { defineInstance, getOrganizationData } from "../../test/utils";

describe("set active organization", async (it) => {
	const plugin = organization();
	const { auth, client, signInWithTestUser, cookieSetter } =
		await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	let organizationId: string;
	let organization2Id: string;

	it("setup: create organizations", async () => {
		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});
		organizationId = org.id;

		const orgData2 = getOrganizationData();
		const org2 = await auth.api.createOrganization({
			headers,
			body: {
				name: orgData2.name,
				slug: orgData2.slug,
			},
		});
		organization2Id = org2.id;
	});

	it("should allow activating organization and set session", async () => {
		const organization = await client.organization.setActive({
			organizationId,
			fetchOptions: {
				headers,
			},
		});

		expect(organization.data?.id).toBe(organizationId);
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data?.session.activeOrganizationId).toBe(organizationId);
	});

	it("should allow switching active organization", async () => {
		// First set to org1
		await client.organization.setActive({
			organizationId,
			fetchOptions: {
				headers,
			},
		});

		let session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data?.session.activeOrganizationId).toBe(organizationId);

		// Then switch to org2
		await client.organization.setActive({
			organizationId: organization2Id,
			fetchOptions: {
				headers,
			},
		});

		session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data?.session.activeOrganizationId).toBe(organization2Id);
	});

	it("should allow unsetting active organization by passing null", async () => {
		// First set an active organization
		await client.organization.setActive({
			organizationId,
			fetchOptions: {
				headers,
			},
		});

		let session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data?.session.activeOrganizationId).toBe(organizationId);

		// Then unset it
		const result = await client.organization.setActive({
			organizationId: null,
			fetchOptions: {
				headers,
			},
		});

		expect(result.data).toBeNull();

		session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data?.session.activeOrganizationId).toBeNull();
	});

	it("should return null when unsetting with no active organization", async () => {
		// First unset to ensure no active organization
		await client.organization.setActive({
			organizationId: null,
			fetchOptions: {
				headers,
			},
		});

		// Then try to unset again
		const result = await client.organization.setActive({
			organizationId: null,
			fetchOptions: {
				headers,
			},
		});

		expect(result.data).toBeNull();
		expect(result.error).toBeNull();
	});

	it("should return FORBIDDEN when user is not a member of the organization", async () => {
		// Create a new user who is not a member
		const newHeaders = new Headers();
		await client.signUp.email(
			{
				email: "non-member@test.com",
				password: "password123",
				name: "non-member",
			},
			{
				onSuccess: cookieSetter(newHeaders),
			},
		);

		const result = await client.organization.setActive({
			organizationId,
			fetchOptions: {
				headers: newHeaders,
			},
		});

		expect(result.error?.status).toBe(403);
	});

	it("should return FORBIDDEN when organization does not exist (membership check fails first)", async () => {
		const result = await client.organization.setActive({
			organizationId: "non-existent-org-id",
			fetchOptions: {
				headers,
			},
		});

		// Returns 403 because membership check fails before the organization existence check
		expect(result.error?.status).toBe(403);
	});

	it("should set active organization directly on server", async () => {
		const res = await auth.api.setActiveOrganization({
			body: {
				organizationId,
			},
			headers,
		});

		expect(res?.id).toBe(organizationId);

		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data?.session.activeOrganizationId).toBe(organizationId);
	});

	it("should unset active organization directly on server", async () => {
		// First set an active organization
		await auth.api.setActiveOrganization({
			body: {
				organizationId,
			},
			headers,
		});

		// Then unset it
		const res = await auth.api.setActiveOrganization({
			body: {
				organizationId: null,
			},
			headers,
		});

		expect(res).toBeNull();

		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data?.session).toHaveProperty("activeOrganizationId", null);
		expect(session.data?.session.activeOrganizationId).toBeNull();
	});
});
