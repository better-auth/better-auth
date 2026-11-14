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
					teams: { enabled: true },
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
		client,
		signInWithUser,
		owner: owner.headers,
		staff: staff.headers,
		staffUser: staff.res.user,
		org,
		ownerMember: org.members[0]!,
	};
}

const forStaff =
	(result: ReturnType<ResolveMembership>): ResolveMembership =>
	({ user, member }) =>
		user.email === STAFF_EMAIL ? result : member;

/**
 * @see https://github.com/better-auth/better-auth/issues/1595
 */
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

	it("lets a non-member act with a role", async () => {
		const resolveMembership = vi.fn(forStaff({ role: "admin" }));
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
				purpose: "caller",
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

	/**
	 * @see https://github.com/better-auth/better-auth/discussions/7381
	 */
	describe("inviter of an invitation", () => {
		async function inviteFromStaff(ctx: Awaited<ReturnType<typeof setup>>) {
			const { auth, client, signInWithUser, staff, org } = ctx;
			const invitation = await auth.api.createInvitation({
				body: { organizationId: org.id, email: "new@test.com", role: "member" },
				headers: staff,
			});
			await client.signUp.email({
				email: "new@test.com",
				password: PASSWORD,
				name: "New",
			});
			const invitee = await signInWithUser("new@test.com", PASSWORD);
			return () =>
				auth.api.getInvitation({
					query: { id: invitation.id },
					headers: invitee.headers,
				});
		}

		async function removeStaffAfterInviting(
			ctx: Awaited<ReturnType<typeof setup>>,
		) {
			await ctx.auth.api.addMember({
				body: {
					organizationId: ctx.org.id,
					userId: ctx.staffUser.id,
					role: "admin",
				},
			});
			const getInvitation = await inviteFromStaff(ctx);
			await ctx.auth.api.removeMember({
				body: { organizationId: ctx.org.id, memberIdOrEmail: STAFF_EMAIL },
				headers: ctx.owner,
			});
			return getInvitation;
		}

		it("checks a resolved inviter through the resolver, without a session", async () => {
			const resolveMembership = vi.fn(forStaff({ role: "admin" }));
			const ctx = await setup(resolveMembership);
			const getInvitation = await inviteFromStaff(ctx);
			resolveMembership.mockClear();

			const fetched = await getInvitation();
			expect(fetched.inviterEmail).toBe(STAFF_EMAIL);
			expect(resolveMembership).toHaveBeenCalledWith(
				{
					user: expect.objectContaining({ id: ctx.staffUser.id }),
					session: null,
					organizationId: ctx.org.id,
					member: null,
					purpose: "inviter",
				},
				expect.anything(),
			);
		});

		it("refuses when the resolver no longer grants the inviter a membership", async () => {
			let staffIsAdmin = true;
			const ctx = await setup(({ user, member }) =>
				user.email === STAFF_EMAIL && staffIsAdmin ? { role: "admin" } : member,
			);
			const getInvitation = await inviteFromStaff(ctx);
			staffIsAdmin = false;

			await expect(getInvitation()).rejects.toMatchObject({
				status: "BAD_REQUEST",
			});
		});

		it("refuses an invitation from a removed member the resolver doesn't grant", async () => {
			const ctx = await setup(({ member }) => member);
			const getInvitation = await removeStaffAfterInviting(ctx);

			await expect(getInvitation()).rejects.toMatchObject({
				status: "BAD_REQUEST",
			});
		});

		it("refuses an invitation from a removed member without the option", async () => {
			const getInvitation = await removeStaffAfterInviting(await setup());

			await expect(getInvitation()).rejects.toMatchObject({
				status: "BAD_REQUEST",
			});
		});
	});

	it("passes the endpoint context so the resolver can decide per request", async () => {
		const { auth, owner, staff, org } = await setup(({ user, member }, ctx) => {
			if (member) return member;
			const paths = ["/organization/update", "/organization/delete"];
			if (user.email === STAFF_EMAIL && paths.includes(ctx.path)) {
				return { role: "owner" };
			}
			return null;
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
		const resolveMembership = vi.fn<ResolveMembership>(({ member }) => member);
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

	it("always uses the caller's userId and the resolved organizationId", async () => {
		const { auth, staff, staffUser, org } = await setup(
			forStaff({
				role: "member",
				userId: "someone-else",
				organizationId: "other-org",
			}),
		);
		await auth.api.setActiveOrganization({
			body: { organizationId: org.id },
			headers: staff,
		});
		const member = await auth.api.getActiveMember({ headers: staff });
		expect(member).toMatchObject({
			userId: staffUser.id,
			organizationId: org.id,
		});
	});

	it("keeps a real member unchanged when it returns member", async () => {
		const resolveMembership = vi.fn<ResolveMembership>(({ member }) => member);
		const { auth, owner, staff, org, ownerMember } =
			await setup(resolveMembership);
		const member = await auth.api.getActiveMember({ headers: owner });
		expect(member).toMatchObject({ id: ownerMember.id, role: "owner" });
		expect(member).toEqual(resolveMembership.mock.lastCall?.[0].member);
		await expect(
			auth.api.setActiveOrganization({
				body: { organizationId: org.id },
				headers: staff,
			}),
		).rejects.toMatchObject({ status: "FORBIDDEN" });
	});

	it("downgrades a real member", async () => {
		const { auth, owner, ownerMember } = await setup(() => ({
			role: "member",
		}));
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

	it("returns the resolved role when the caller passes their own userId", async () => {
		const { auth, staff, staffUser, org } = await setup(
			forStaff({ role: "admin" }),
		);
		const role = await auth.api.getActiveMemberRole({
			query: { organizationId: org.id, userId: staffUser.id },
			headers: staff,
		});
		expect(role.role).toBe("admin");
	});

	it("hides the teams of an organization the resolver refuses", async () => {
		const { auth, owner } = await setup(() => null);
		const teams = await auth.api.listUserTeams({ headers: owner });
		expect(teams).toEqual([]);
	});

	describe("updating the caller's own stored row", () => {
		it("keeps the owner guard when the sole owner is resolved as admin", async () => {
			const { auth, owner, org, ownerMember } = await setup(() => ({
				role: "admin",
			}));
			await expect(
				auth.api.updateMemberRole({
					body: {
						organizationId: org.id,
						memberId: ownerMember.id,
						role: "member",
					},
					headers: owner,
				}),
			).rejects.toMatchObject({ status: "FORBIDDEN" });
		});

		it("keeps the last-owner guard when the resolver returns another id", async () => {
			const { auth, owner, org, ownerMember } = await setup(() => ({
				id: "resolved-owner",
				role: "owner",
			}));
			await expect(
				auth.api.updateMemberRole({
					body: {
						organizationId: org.id,
						memberId: ownerMember.id,
						role: "member",
					},
					headers: owner,
				}),
			).rejects.toMatchObject({ status: "BAD_REQUEST" });
		});
	});

	it("refuses a real member when the resolver returns null", async () => {
		const { auth, owner } = await setup(() => null);
		await expect(
			auth.api.getFullOrganization({ headers: owner }),
		).rejects.toMatchObject({ status: "FORBIDDEN" });
	});
});
