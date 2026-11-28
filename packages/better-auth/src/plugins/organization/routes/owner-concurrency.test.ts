import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../../test-utils/test-instance";
import { ORGANIZATION_ERROR_CODES } from "../error-codes";
import { organization } from "../organization";

describe("concurrent owner operations", async () => {
	const { auth, signInWithUser } = await getTestInstance({
		plugins: [organization()],
	});
	const ctx = await auth.$context;

	async function setupOrgWithTwoOwners(prefix: string) {
		const userA = {
			email: `${prefix}-a@test.com`,
			password: "password1234",
			name: `${prefix} A`,
		};
		const userB = {
			email: `${prefix}-b@test.com`,
			password: "password1234",
			name: `${prefix} B`,
		};

		await auth.api.signUpEmail({ body: userA });
		await auth.api.signUpEmail({ body: userB });

		const { headers: headersA } = await signInWithUser(
			userA.email,
			userA.password,
		);
		const { headers: headersB } = await signInWithUser(
			userB.email,
			userB.password,
		);

		const org = await auth.api.createOrganization({
			body: { name: `${prefix} Org`, slug: `${prefix}-org` },
			headers: headersA,
		});

		const userBRecord = await ctx.adapter.findOne<{ id: string }>({
			model: "user",
			where: [{ field: "email", value: userB.email }],
		});

		const memberB = await auth.api.addMember({
			body: {
				organizationId: org!.id,
				userId: userBRecord!.id,
				role: "owner",
			},
			headers: headersA,
		});

		const userARecord = await ctx.adapter.findOne<{ id: string }>({
			model: "user",
			where: [{ field: "email", value: userA.email }],
		});

		const memberA = await ctx.adapter.findOne<{ id: string }>({
			model: "member",
			where: [
				{ field: "organizationId", value: org!.id },
				{ field: "userId", value: userARecord!.id },
			],
		});

		return {
			org: org!,
			headersA,
			headersB,
			memberA: memberA!,
			memberB: memberB!,
		};
	}

	it("should prevent concurrent leaveOrganization from leaving the organization without an owner", async () => {
		const { org, headersA, headersB } =
			await setupOrgWithTwoOwners("concurrent-leave");

		const [resA, resB] = await Promise.allSettled([
			auth.api.leaveOrganization({
				headers: headersA,
				body: { organizationId: org.id },
			}),
			auth.api.leaveOrganization({
				headers: headersB,
				body: { organizationId: org.id },
			}),
		]);

		const fulfilled = [resA, resB].filter((r) => r.status === "fulfilled");
		const rejected = [resA, resB].filter((r) => r.status === "rejected");

		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		expect((rejected[0] as PromiseRejectedResult).reason.message).toBe(
			ORGANIZATION_ERROR_CODES.YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER
				.message,
		);

		const members = await ctx.adapter.findMany<{ role: string }>({
			model: "member",
			where: [{ field: "organizationId", value: org.id }],
		});
		const owners = members.filter((m) => m.role.includes("owner"));
		expect(owners).toHaveLength(1);
	});

	it("should prevent concurrent removeMember from removing each other and leaving no owner", async () => {
		const { org, headersA, headersB, memberA, memberB } =
			await setupOrgWithTwoOwners("concurrent-remove");

		const [resA, resB] = await Promise.allSettled([
			auth.api.removeMember({
				headers: headersA,
				body: { organizationId: org.id, memberIdOrEmail: memberB.id },
			}),
			auth.api.removeMember({
				headers: headersB,
				body: { organizationId: org.id, memberIdOrEmail: memberA.id },
			}),
		]);

		const fulfilled = [resA, resB].filter((r) => r.status === "fulfilled");
		const rejected = [resA, resB].filter((r) => r.status === "rejected");

		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);

		const members = await ctx.adapter.findMany<{ role: string }>({
			model: "member",
			where: [{ field: "organizationId", value: org.id }],
		});
		const owners = members.filter((m) => m.role.includes("owner"));
		expect(owners).toHaveLength(1);
	});

	it("should prevent concurrent updateMemberRole from demoting both owners and leaving no owner", async () => {
		const { org, headersA, headersB, memberA, memberB } =
			await setupOrgWithTwoOwners("concurrent-demote");

		const [resA, resB] = await Promise.allSettled([
			auth.api.updateMemberRole({
				headers: headersA,
				body: { organizationId: org.id, memberId: memberA.id, role: "member" },
			}),
			auth.api.updateMemberRole({
				headers: headersB,
				body: { organizationId: org.id, memberId: memberB.id, role: "member" },
			}),
		]);

		const fulfilled = [resA, resB].filter((r) => r.status === "fulfilled");
		const rejected = [resA, resB].filter((r) => r.status === "rejected");

		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		expect((rejected[0] as PromiseRejectedResult).reason.message).toBe(
			ORGANIZATION_ERROR_CODES.YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER
				.message,
		);

		const members = await ctx.adapter.findMany<{ role: string }>({
			model: "member",
			where: [{ field: "organizationId", value: org.id }],
		});
		const owners = members.filter((m) => m.role.includes("owner"));
		expect(owners).toHaveLength(1);
	});

	it("should prevent demoting the only owner of an organization to a non-creator role", async () => {
		const userA = {
			email: "single-owner@test.com",
			password: "password1234",
			name: "Single Owner",
		};
		await auth.api.signUpEmail({ body: userA });
		const { headers: headersA } = await signInWithUser(
			userA.email,
			userA.password,
		);
		const org = await auth.api.createOrganization({
			body: { name: "Single Owner Org", slug: "single-owner-org" },
			headers: headersA,
		});

		const userARecord = await ctx.adapter.findOne<{ id: string }>({
			model: "user",
			where: [{ field: "email", value: userA.email }],
		});
		const memberA = await ctx.adapter.findOne<{ id: string }>({
			model: "member",
			where: [
				{ field: "organizationId", value: org!.id },
				{ field: "userId", value: userARecord!.id },
			],
		});

		await expect(
			auth.api.updateMemberRole({
				headers: headersA,
				body: {
					organizationId: org!.id,
					memberId: memberA!.id,
					role: "member",
				},
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES.YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER
				.message,
		);
	});
});
