import { APIError } from "better-auth/api";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { organization } from "./organization";
import type { Invitation, Member } from "./schema";
import type { OrganizationOptions } from "./types";

async function fixture(options: OrganizationOptions = {}) {
	const f = await getTestInstance(
		{ plugins: [organization(options)] },
		{ transaction: true },
	);
	const owner = await f.signInWithTestUser();
	const person = await f.auth.api.signUpEmail({
		body: {
			email: "invitee@example.com",
			name: "Invitee",
			password: "password123",
		},
	});
	const invitee = await f.signInWithUser("invitee@example.com", "password123");
	const org = await f.auth.api.createOrganization({
		headers: owner.headers,
		body: { name: "Policy Org", slug: "policy-org" },
	});
	if (!org) throw new Error("Organization was not created");
	const request = (path: string, body: unknown, headers = owner.headers) => {
		const requestHeaders = new Headers(headers);
		requestHeaders.set("content-type", "application/json");
		return f.auth.handler(
			new Request(`http://localhost:3000/api/auth/organization/${path}`, {
				method: "POST",
				headers: requestHeaders,
				body: JSON.stringify(body),
			}),
		);
	};
	const database = (await f.auth.$context).adapter;
	const add = () =>
		f.auth.api.addMember({
			body: { organizationId: org.id, userId: person.user.id, role: "member" },
		});
	const invitation = () =>
		f.auth.api.createInvitation({
			headers: owner.headers,
			body: {
				organizationId: org.id,
				email: person.user.email,
				role: "member",
			},
		});
	const member = () =>
		database.findOne<Member>({
			model: "member",
			where: [
				{ field: "organizationId", value: org.id },
				{ field: "userId", value: person.user.id },
			],
		});
	return {
		...f,
		owner,
		person,
		invitee,
		org,
		request,
		database,
		add,
		invitation,
		member,
	};
}

/** @see https://github.com/better-auth/better-auth/issues/11568 */
describe("native membership policy at the public HTTP boundary", () => {
	it("rejects a role mutation before the native write", async () => {
		const calls: string[] = [];
		const f = await fixture({
			withMembershipMutation: async (input) => {
				calls.push(input.organizationId);
				throw new APIError("FORBIDDEN", {
					code: "POLICY_DENIED",
					message: "Policy denied",
				});
			},
		});
		const member = await f.add();
		const response = await f.request("update-member-role", {
			organizationId: f.org.id,
			memberId: member!.id,
			role: "admin",
		});
		expect(response.status).toBe(403);
		expect(calls).toEqual([f.org.id]);
		expect((await f.member())?.role).toBe("member");
	});

	it("rolls back a removal when the fence rejects after the native mutation", async () => {
		const f = await fixture({
			withMembershipMutation: async ({ mutate }) => {
				await mutate();
				throw new APIError("CONFLICT", {
					code: "POLICY_CHANGED",
					message: "Policy changed",
				});
			},
		});
		const member = await f.add();
		const response = await f.request("remove-member", {
			organizationId: f.org.id,
			memberIdOrEmail: member!.id,
		});
		expect(response.status).toBe(409);
		expect((await f.member())?.id).toBe(member!.id);
	});

	it("uses the explicitly targeted organization when leaving", async () => {
		const calls: { organizationId: string; operation: string }[] = [];
		const f = await fixture({
			withMembershipMutation: async (input) => {
				calls.push({
					organizationId: input.organizationId,
					operation: input.operation,
				});
				return input.mutate();
			},
		});
		await f.add();
		const response = await f.request(
			"leave",
			{ organizationId: f.org.id },
			f.invitee.headers,
		);
		expect(response.status).toBe(200);
		expect(calls).toEqual([
			{ organizationId: f.org.id, operation: "mutation" },
		]);
		expect(await f.member()).toBeNull();
	});

	it("vetoes invitation acceptance without consuming the invitation", async () => {
		const f = await fixture({
			authorizeInvitationAcceptance: async () => ({
				allowed: false,
				code: "POLICY_DENIED",
				message: "Policy denied",
			}),
		});
		const invite = await f.invitation();
		const response = await f.request(
			"accept-invitation",
			{ invitationId: invite.id },
			f.invitee.headers,
		);
		expect(response.status).toBe(403);
		expect(await f.member()).toBeNull();
		expect(
			(
				await f.database.findOne<Invitation>({
					model: "invitation",
					where: [{ field: "id", value: invite.id }],
				})
			)?.status,
		).toBe("pending");
	});

	it("shares the fence transaction with authorization and rolls back an accepted invite", async () => {
		let fenceDatabase: unknown;
		let authorizationDatabase: unknown;
		const calls: string[] = [];
		const f = await fixture({
			withMembershipMutation: async (input) => {
				fenceDatabase = input.database;
				calls.push(input.operation);
				await input.mutate();
				throw new APIError("CONFLICT", {
					code: "POLICY_CHANGED",
					message: "Policy changed",
				});
			},
			authorizeInvitationAcceptance: async ({ database }) => {
				authorizationDatabase = database;
				return { allowed: true };
			},
		});
		const invite = await f.invitation();
		const response = await f.request(
			"accept-invitation",
			{ invitationId: invite.id },
			f.invitee.headers,
		);
		expect(response.status).toBe(409);
		expect(calls).toEqual(["invitation_acceptance"]);
		expect(authorizationDatabase).toBe(fenceDatabase);
		expect(fenceDatabase).toBeDefined();
		expect(await f.member()).toBeNull();
		expect(
			(
				await f.database.findOne<Invitation>({
					model: "invitation",
					where: [{ field: "id", value: invite.id }],
				})
			)?.status,
		).toBe("pending");
	});

	it("preserves native recipient checks before policy authorization", async () => {
		let authorized = false;
		const f = await fixture({
			authorizeInvitationAcceptance: async () => {
				authorized = true;
				return { allowed: true };
			},
		});
		const invite = await f.invitation();
		const response = await f.request("accept-invitation", {
			invitationId: invite.id,
		});
		expect(response.status).toBe(403);
		expect(authorized).toBe(false);
		expect(await f.member()).toBeNull();
	});
});
