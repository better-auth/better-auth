import { describe, expect, expectTypeOf } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { swarm } from "./swarm";
import { createAuthClient } from "../../client";
import { swarmClient } from "./client";
import { createAccessControl } from "./access";
import { SWARM_ERROR_CODES } from "./error-codes";
import { BetterAuthError } from "../../error";

describe("swarm", async (it) => {
	const { auth, signInWithTestUser, signInWithUser } = await getTestInstance({
		user: {
			modelName: "users",
		},
		plugins: [
			swarm({
				async sendInvitationEmail(data, request) {},
				schema: {
					swarm: {
						modelName: "team",
					},
					member: {
						modelName: "teamMembers",
					},
				},
			}),
		],
		logger: {
			level: "error",
		},
	});

	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [swarmClient()],
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: {
			customFetchImpl: async (url, init) => {
				return auth.handler(new Request(url, init));
			},
		},
	});

	let swarmId: string;
	it("create swarm", async () => {
		const swarm = await client.swarm.create({
			name: "test",
			slug: "test",
			metadata: {
				test: "test",
			},
			fetchOptions: {
				headers,
			},
		});
		swarmId = swarm.data?.id as string;
		expect(swarm.data?.name).toBeDefined();
		expect(swarm.data?.metadata).toBeDefined();
		expect(swarm.data?.members.length).toBe(1);
		expect(swarm.data?.members[0].role).toBe("owner");
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect((session.data?.session as any).activeSwarmId).toBe(
			swarmId,
		);
	});

	it("should create swarm directly in the server without cookie", async () => {
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});

		const swarm = await auth.api.createSwarm({
			body: {
				name: "test2",
				slug: "test2",
				userId: session.data?.session.userId,
			},
		});

		expect(swarm?.name).toBe("test2");
		expect(swarm?.members.length).toBe(1);
		expect(swarm?.members[0].role).toBe("owner");
	});

	it("should allow listing swarms", async () => {
		const swarms = await client.swarm.list({
			fetchOptions: {
				headers,
			},
		});
		expect(swarms.data?.length).toBe(2);
	});

	it("should allow updating swarm", async () => {
		const { headers } = await signInWithTestUser();
		const swarm = await client.swarm.update({
			swarmId,
			data: {
				name: "test2",
			},
			fetchOptions: {
				headers,
			},
		});
		expect(swarm.data?.name).toBe("test2");
	});

	it("should allow updating swarm metadata", async () => {
		const { headers } = await signInWithTestUser();
		const swarm = await client.swarm.update({
			swarmId,
			data: {
				metadata: {
					test: "test2",
				},
			},
			fetchOptions: {
				headers,
			},
		});
		expect(swarm.data?.metadata?.test).toBe("test2");
	});

	it("should allow activating swarm and set session", async () => {
		const swarm = await client.swarm.setActive({
			swarmId,
			fetchOptions: {
				headers,
			},
		});

		expect(swarm.data?.id).toBe(swarmId);
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect((session.data?.session as any).activeSwarmId).toBe(
			swarmId,
		);
	});

	it("should allow getting full swm on server", async () => {
		const swm = await auth.api.getFullSwarm({
			headers,
		});
		expect(swm?.members.length).toBe(1);
	});

	it("should allow getting full swm on server using slug", async () => {
		const swm = await auth.api.getFullSwarm({
			headers,
			query: {
				swarmSlug: "test",
			},
		});
		expect(swm?.members.length).toBe(1);
	});

	it.each([
		{
			role: "owner",
			newUser: {
				email: "test2@test.com",
				password: "test123456",
				name: "test2",
			},
		},
		{
			role: "admin",
			newUser: {
				email: "test3@test.com",
				password: "test123456",
				name: "test3",
			},
		},
		{
			role: "member",
			newUser: {
				email: "test4@test.com",
				password: "test123456",
				name: "test4",
			},
		},
	])(
		"invites user to swarm with $role role",
		async ({ role, newUser }) => {
			const { headers } = await signInWithTestUser();
			const invite = await client.swarm.inviteMember({
				swarmId: swarmId,
				email: newUser.email,
				role: role,
				fetchOptions: {
					headers,
				},
			});
			if (!invite.data) throw new Error("Invitation not created");
			expect(invite.data.email).toBe(newUser.email);
			expect(invite.data.role).toBe(role);
			await client.signUp.email({
				email: newUser.email,
				password: newUser.password,
				name: newUser.name,
			});
			const { headers: headers2 } = await signInWithUser(
				newUser.email,
				newUser.password,
			);

			const wrongInvitation = await client.swarm.acceptInvitation({
				invitationId: "123",
				fetchOptions: {
					headers: headers2,
				},
			});
			expect(wrongInvitation.error?.status).toBe(400);

			const wrongPerson = await client.swarm.acceptInvitation({
				invitationId: invite.data.id,
				fetchOptions: {
					headers,
				},
			});
			expect(wrongPerson.error?.status).toBe(403);

			const invitation = await client.swarm.acceptInvitation({
				invitationId: invite.data.id,
				fetchOptions: {
					headers: headers2,
				},
			});
			expect(invitation.data?.invitation.status).toBe("accepted");
			const invitedUserSession = await client.getSession({
				fetchOptions: {
					headers: headers2,
				},
			});
			expect(
				(invitedUserSession.data?.session as any).activeSwarmId,
			).toBe(swarmId);
		},
	);

	it("should allow getting a member", async () => {
		const { headers } = await signInWithTestUser();
		await client.swarm.setActive({
			swarmId,
			fetchOptions: {
				headers,
			},
		});
		const member = await client.swarm.getActiveMember({
			fetchOptions: {
				headers,
			},
		});
		expect(member.data).toMatchObject({
			role: "owner",
		});
	});

	it("should allow updating member", async () => {
		const { headers } = await signInWithTestUser();
		const swm = await client.swarm.getFullSwarm({
			query: {
				swarmId,
			},
			fetchOptions: {
				headers,
			},
		});
		if (!swm.data) throw new Error("Swarm not found");
		expect(swm.data?.members[3].role).toBe("member");
		const member = await client.swarm.updateMemberRole({
			swarmId: swm.data.id,
			memberId: swm.data.members[3].id,
			role: "admin",
			fetchOptions: {
				headers,
			},
		});
		expect(member.data?.role).toBe("admin");
	});

	const adminUser = {
		email: "test3@test.com",
		password: "test123456",
		name: "test3",
	};

	it("should not allow inviting member with a creator role unless they are creator", async () => {
		const { headers } = await signInWithUser(
			adminUser.email,
			adminUser.password,
		);
		const invite = await client.swarm.inviteMember({
			swarmId: swarmId,
			email: adminUser.email,
			role: "owner",
			fetchOptions: {
				headers,
			},
		});
		expect(invite.error?.message).toBe(
			SWARM_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE,
		);
	});

	it("should allow removing member from swarm", async () => {
		const { headers } = await signInWithTestUser();
		const swmBefore = await client.swarm.getFullSwarm({
			query: {
				swarmId,
			},
			fetchOptions: {
				headers,
			},
		});

		expect(swmBefore.data?.members.length).toBe(4);
		await client.swarm.removeMember({
			swarmId: swarmId,
			memberIdOrEmail: "test2@test.com",
			fetchOptions: {
				headers,
			},
		});

		const swm = await client.swarm.getFullSwarm({
			query: {
				swarmId,
			},
			fetchOptions: {
				headers,
			},
		});
		expect(swm.data?.members.length).toBe(3);
	});

	it("shouldn't allow removing owner from swarm", async () => {
		const { headers } = await signInWithTestUser();
		const swm = await client.swarm.getFullSwarm({
			query: {
				swarmId,
			},
			fetchOptions: {
				headers,
			},
		});
		if (!swm.data) throw new Error("Swarm not found");
		expect(swm.data.members[0].role).toBe("owner");
		const removedMember = await client.swarm.removeMember({
			swarmId: swm.data.id,
			memberIdOrEmail: swm.data.members[0].id,
			fetchOptions: {
				headers,
			},
		});
		expect(removedMember.error?.status).toBe(400);
	});

	it("should validate permissions", async () => {
		await client.swarm.setActive({
			swarmId,
			fetchOptions: {
				headers,
			},
		});
		const hasPermission = await client.swarm.hasPermission({
			permission: {
				member: ["update"],
			},
			fetchOptions: {
				headers,
			},
		});
		expect(hasPermission.data?.success).toBe(true);
	});

	it("should allow deleting swarm", async () => {
		await client.swarm.delete({
			swarmId,
			fetchOptions: {
				headers,
			},
		});
		const swm = await client.swarm.getFullSwarm({
			query: {
				swarmId,
			},
			fetchOptions: {
				headers,
			},
		});
		expect(swm.error?.status).toBe(403);
	});

	it("should have server side methods", async () => {
		expectTypeOf(auth.api.createSwarm).toBeFunction();
		expectTypeOf(auth.api.getInvitation).toBeFunction();
	});

	it("should add member on the server directly", async () => {
		const newUser = await auth.api.signUpEmail({
			body: {
				email: "new-member@email.com",
				password: "password",
				name: "new member",
			},
		});
		const session = await auth.api.getSession({
			headers: new Headers({
				Authorization: `Bearer ${newUser?.token}`,
			}),
		});
		const swm = await auth.api.createSwarm({
			body: {
				name: "test",
				slug: "test",
			},
			headers,
		});
		const member = await auth.api.addMember({
			body: {
				swarmId: swm?.id,
				userId: session?.user.id!,
				role: "admin",
			},
		});
		expect(member?.role).toBe("admin");
	});
});

describe("access control", async (it) => {
	const ac = createAccessControl({
		project: ["create", "read", "update", "delete"],
		sales: ["create", "read", "update", "delete"],
	});
	const owner = ac.newRole({
		project: ["create", "delete", "update", "read"],
		sales: ["create", "read", "update", "delete"],
	});
	const admin = ac.newRole({
		project: ["create", "read"],
		sales: ["create", "read"],
	});
	const member = ac.newRole({
		project: ["read"],
		sales: ["read"],
	});
	const { auth, customFetchImpl, sessionSetter, signInWithTestUser } =
		await getTestInstance({
			plugins: [
				swarm({
					ac,
					roles: {
						admin,
						member,
						owner,
					},
				}),
			],
		});

	const {
		swarm: { checkRolePermission, hasPermission, create },
	} = createAuthClient({
		baseURL: "http://localhost:3000",
		plugins: [
			swarmClient({
				ac,
				roles: {
					admin,
					member,
					owner,
				},
			}),
		],
		fetchOptions: {
			customFetchImpl,
		},
	});

	const { headers } = await signInWithTestUser();

	const swm = await create(
		{
			name: "test",
			slug: "test",
			metadata: {
				test: "test",
			},
		},
		{
			onSuccess: sessionSetter(headers),
			headers,
		},
	);

	it("should return success", async () => {
		const canCreateProject = checkRolePermission({
			role: "admin",
			permission: {
				project: ["create"],
			},
		});
		expect(canCreateProject).toBe(true);
		const canCreateProjectServer = await hasPermission({
			permission: {
				project: ["create"],
			},
			fetchOptions: {
				headers,
			},
		});
		expect(canCreateProjectServer.data?.success).toBe(true);
	});

	it("should return not success", async () => {
		const canCreateProject = checkRolePermission({
			role: "admin",
			permission: {
				project: ["delete"],
			},
		});
		expect(canCreateProject).toBe(false);
	});

	it("should return not success", async () => {
		let error: BetterAuthError | null = null;
		try {
			checkRolePermission({
				role: "admin",
				permission: {
					project: ["read"],
					sales: ["delete"],
				},
			});
		} catch (e) {
			if (e instanceof BetterAuthError) {
				error = e;
			}
		}
		expect(error).toBeInstanceOf(BetterAuthError);
	});
});
