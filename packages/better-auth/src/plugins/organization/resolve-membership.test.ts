import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { organization } from ".";
import type { ResolveMembership } from "./types";

const STAFF_EMAIL = "staff@test.com";
const PASSWORD = "password123";

async function setup(resolveMembership?: ResolveMembership) {
	const { auth, client, signInWithTestUser, signInWithUser } =
		await getTestInstance({
			plugins: [
				organization({
					schema: {
						member: {
							additionalFields: {
								department: { type: "string", required: false },
							},
						},
					},
					resolveMembership,
				}),
			],
		});
	const owner = await signInWithTestUser();
	const org = await auth.api.createOrganization({
		body: { name: "Acme", slug: "acme" },
		headers: owner.headers,
	});
	await client.signUp.email({
		email: STAFF_EMAIL,
		password: PASSWORD,
		name: "Staff",
	});
	const staff = await signInWithUser(STAFF_EMAIL, PASSWORD);
	return {
		auth,
		owner: owner.headers,
		staff: staff.headers,
		staffUser: staff.res.user,
		org,
		ownerMember: org.members[0]!,
	};
}

const forStaff =
	(result: ReturnType<ResolveMembership>): ResolveMembership =>
	({ user }) =>
		user.email === STAFF_EMAIL ? result : undefined;

describe("resolveMembership", () => {
	it("changes nothing when the option is not set", async () => {
		const { auth, owner, staff, org } = await setup();
		await expect(
			auth.api.setActiveOrganization({
				body: { organizationId: org.id },
				headers: staff,
			}),
		).rejects.toMatchObject({ status: "FORBIDDEN" });
		const member = await auth.api.getActiveMember({ headers: owner });
		expect(member.role).toBe("owner");
	});

	it("lets a non-member act with a role string", async () => {
		const resolveMembership = vi.fn(forStaff("admin"));
		const { auth, staff, staffUser, org } = await setup(resolveMembership);

		const active = await auth.api.setActiveOrganization({
			body: { organizationId: org.id },
			headers: staff,
		});
		expect(active?.id).toBe(org.id);
		expect(resolveMembership).toHaveBeenCalledWith(
			{
				user: expect.objectContaining({ id: staffUser.id }),
				session: expect.objectContaining({ userId: staffUser.id }),
				organizationId: org.id,
				member: null,
			},
			expect.anything(),
		);

		const full = await auth.api.getFullOrganization({ headers: staff });
		expect(full?.id).toBe(org.id);

		const invitation = await auth.api.createInvitation({
			body: { email: "new@test.com", role: "member" },
			headers: staff,
		});
		expect(invitation.organizationId).toBe(org.id);
	});

	it("passes the endpoint context so the resolver can decide per request", async () => {
		const { auth, owner, staff, org } = await setup(({ user, member }, ctx) => {
			if (member || user.email !== STAFF_EMAIL) return;
			if (["/organization/update", "/organization/delete"].includes(ctx.path))
				return "owner";
		});

		const updated = await auth.api.updateOrganization({
			body: { organizationId: org.id, data: { name: "Renamed" } },
			headers: staff,
		});
		expect(updated?.name).toBe("Renamed");

		await expect(
			auth.api.createInvitation({
				body: { organizationId: org.id, email: "new@test.com", role: "member" },
				headers: staff,
			}),
		).rejects.toMatchObject({ status: "BAD_REQUEST" });
		await expect(
			auth.api.setActiveOrganization({
				body: { organizationId: org.id },
				headers: staff,
			}),
		).rejects.toMatchObject({ status: "FORBIDDEN" });

		await auth.api.deleteOrganization({
			body: { organizationId: org.id },
			headers: staff,
		});
		await expect(
			auth.api.getFullOrganization({
				query: { organizationId: org.id },
				headers: owner,
			}),
		).rejects.toMatchObject({ status: "BAD_REQUEST" });
	});

	it("receives the context of the endpoint being called", async () => {
		const resolveMembership = vi.fn<ResolveMembership>(() => undefined);
		const { auth, owner, org } = await setup(resolveMembership);
		await auth.api.setActiveOrganization({
			body: { organizationId: org.id },
			headers: owner,
		});
		const ctx = resolveMembership.mock.lastCall?.[1];
		expect(ctx?.path).toBe("/organization/set-active");
		expect(ctx?.body).toEqual({ organizationId: org.id });
		expect(ctx?.headers?.get("cookie")).toBe(owner.get("cookie"));
	});

	it("uses the id and additional fields of a returned membership", async () => {
		const { auth, staff, staffUser, org } = await setup(
			forStaff({ id: "staff-membership", role: "member", department: "Ops" }),
		);
		await auth.api.setActiveOrganization({
			body: { organizationId: org.id },
			headers: staff,
		});
		const member = await auth.api.getActiveMember({ headers: staff });
		expect(member).toMatchObject({
			id: "staff-membership",
			role: "member",
			department: "Ops",
			userId: staffUser.id,
			organizationId: org.id,
			user: { email: STAFF_EMAIL },
		});
	});

	it("fills a stable placeholder id when none is returned", async () => {
		const { auth, staff, staffUser, org } = await setup(
			forStaff({ role: "member" }),
		);
		await auth.api.setActiveOrganization({
			body: { organizationId: org.id },
			headers: staff,
		});
		const member = await auth.api.getActiveMember({ headers: staff });
		expect(member.id).toBe(`resolved:${staffUser.id}:${org.id}`);
	});

	it.each([null, false] as const)(
		"refuses when the resolver returns %s",
		async (result) => {
			const { auth, staff, org } = await setup(forStaff(result));
			await expect(
				auth.api.setActiveOrganization({
					body: { organizationId: org.id },
					headers: staff,
				}),
			).rejects.toMatchObject({ status: "FORBIDDEN" });
		},
	);

	it("keeps the default for members and non-members when it returns undefined", async () => {
		const resolveMembership = vi.fn<ResolveMembership>(() => undefined);
		const { auth, owner, staff, org, ownerMember } =
			await setup(resolveMembership);
		const member = await auth.api.getActiveMember({ headers: owner });
		expect(member).toMatchObject({ id: ownerMember.id, role: "owner" });
		expect(resolveMembership).toHaveBeenCalledWith(
			expect.objectContaining({
				member: expect.objectContaining({ id: ownerMember.id, role: "owner" }),
			}),
			expect.anything(),
		);
		await expect(
			auth.api.setActiveOrganization({
				body: { organizationId: org.id },
				headers: staff,
			}),
		).rejects.toMatchObject({ status: "FORBIDDEN" });
	});

	it("downgrades a real member with a role string", async () => {
		const { auth, owner, ownerMember } = await setup(() => "member");
		const member = await auth.api.getActiveMember({ headers: owner });
		expect(member).toMatchObject({ id: ownerMember.id, role: "member" });
		await expect(
			auth.api.updateOrganization({
				body: { data: { name: "Renamed" } },
				headers: owner,
			}),
		).rejects.toMatchObject({ status: "FORBIDDEN" });
	});

	it("merges a returned membership over the real row", async () => {
		const { auth, owner, ownerMember } = await setup(() => ({
			role: "owner",
			department: "Ops",
		}));
		const member = await auth.api.getActiveMember({ headers: owner });
		expect(member).toMatchObject({
			id: ownerMember.id,
			role: "owner",
			department: "Ops",
		});
	});

	it("refuses a real member when the resolver returns false", async () => {
		const { auth, owner } = await setup(() => false);
		await expect(
			auth.api.getFullOrganization({ headers: owner }),
		).rejects.toMatchObject({ status: "FORBIDDEN" });
	});
});
