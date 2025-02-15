import { describe, expect, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { appInvite } from ".";
import { appInviteClient } from "./client";
import { createAuthClient } from "../../client";
import { inferAdditionalFields } from "../additional-fields/client";
import { APP_INVITE_ERROR_CODES } from "./error-codes";

describe("App Invite", async (it) => {
	const mockFn = vi.fn();
	const {
		auth,
		db,
		signInWithTestUser,
		signInWithUser,
		sessionSetter,
		customFetchImpl,
	} = await getTestInstance({
		account: {
			fields: {
				providerId: "provider_id",
				accountId: "account_id",
			},
		},
		user: {
			additionalFields: {
				newField: {
					type: "string",
					defaultValue: "default-value",
				},
				nonRequiredField: {
					type: "string",
					required: false,
				},
			},
		},
		emailAndPassword: {
			enabled: true,
			autoSignIn: true,
		},
		plugins: [
			appInvite({
				autoSignIn: true,
				allowUserToCreateInvitation: (user) => {
					return user.email !== "test7@test.com";
				},
				sendInvitationEmail: async (data, request) => {
					mockFn(data);
				},
				$Infer: {
					AdditionalFields: {} as {
						newField?: string;
						nonRequiredField?: string;
					},
				},
			}),
		],
	});

	const user = await signInWithTestUser();

	describe("Sign up with invitation", (it) => {
		it("should work with additional fields on the user table", async () => {
			const client = createAuthClient({
				baseURL: "http://localhost:3000",
				plugins: [
					appInviteClient({
						$Infer: {
							AdditionalFields: {} as {
								newField?: string;
								nonRequiredField?: string;
							},
						},
					}),
					inferAdditionalFields({
						user: {
							newField: {
								type: "string",
							},
							nonRequiredField: {
								type: "string",
								required: false,
							},
						},
					}),
				],
				fetchOptions: {
					customFetchImpl,
				},
			});

			const invitation = await auth.api.createAppInvitation({
				headers: user.headers,
				body: {
					email: "email1@test.com",
				},
			});
			const headers = new Headers();
			const res = await client.acceptInvitation(
				{
					invitationId: invitation.id,
					name: "Test Name",
					password: "password",
					newField: "new-field",
				},
				{
					onSuccess: sessionSetter(headers),
				},
			);

			expect(res.data?.token).toBeDefined();
			expect(res.data?.user.id).toBeDefined();
			const accounts = await db.findMany({
				model: "account",
				where: [
					{
						field: "userId",
						value: res.data!.user.id,
					},
				],
			});
			expect(accounts).toHaveLength(1);

			const session = await client.getSession({
				fetchOptions: {
					headers,
					throw: true,
				},
			});
			expect(session?.user.newField).toBe("new-field");
		});
		it("should work with custom fields on account table", async () => {
			const invitation = await auth.api.createAppInvitation({
				headers: user.headers,
				body: {
					email: "email2@test.com",
				},
			});
			const res = await auth.api.acceptAppInvitation({
				body: {
					invitationId: invitation.id,
					name: "Test Name",
					password: "password",
				},
			});
			expect(res.token).toBeDefined();
			const accounts = await db.findMany({
				model: "account",
				where: [
					{
						field: "userId",
						value: res.user?.id,
					},
				],
			});
			expect(accounts).toHaveLength(1);
		});
		it("should not work with invalid invitation", async () => {
			const res = await auth.api
				.acceptAppInvitation({
					body: {
						invitationId: "not a valid id",
						name: "Test Name",
						password: "password",
					},
				})
				.catch((e) => {});
			expect(res).toBeUndefined();
		});
	});

	const client = createAuthClient({
		baseURL: "http://localhost:3000",
		plugins: [appInviteClient()],
		fetchOptions: {
			customFetchImpl,
		},
	});

	it("should allow inviting users to the application", async () => {
		const newUser = {
			email: "test3@test.com",
		};
		const invite = await client.inviteUser({
			email: newUser.email,
			fetchOptions: {
				headers: user.headers,
			},
		});
		if (!invite.data) throw new Error("Invitation not created");
		expect(invite.data.email).toBe(newUser.email);
	});

	describe("should allow inviting multiple users with a single link", async (it) => {
		const invitation = await auth.api.createAppInvitation({
			body: {},
			headers: user.headers,
		});
		if (!invitation) {
			throw new Error("Couldn't create invitation");
		}
		expect(invitation?.status).toBe("pending");

		it.each(
			[
				{
					invitee: {
						name: "Test User #1",
						email: "test-user-1@test.de",
						password: "password123456",
					},
					action: "accept-invitation",
					message: "$name should be able to accept the invitation",
				},
				{
					invitee: {
						name: "Test User #2",
						email: "test-user-2@test.de",
						password: "password123456",
					},
					action: "accept-invitation",
					message: "$name should be able to accept the invitation",
				},
				{
					action: "reject-invitation",
					message: "should not allow to reject the invitation",
				},
			].map(({ action, message, ...data }) => [
				`${
					message?.replaceAll(/\$name/g, () => `'${data.invitee?.name}'`) ||
					action
				}`,
				action,
				data,
			]),
		)("%s", async (_, action, { invitee }) => {
			switch (action) {
				case "accept-invitation": {
					if (!invitee) {
						throw new Error("No invitee defined");
					}
					const res = await client.acceptInvitation({
						invitationId: invitation.id,
						name: invitee.name,
						email: invitee.email,
						password: invitee.password,
					});
					expect(res.data?.user.email).toBe(invitee.email);
					break;
				}
				case "reject-invitation": {
					const res = await client.rejectInvitation({
						invitationId: invitation.id,
					});
					expect(res.error?.message).not.toBe(
						APP_INVITE_ERROR_CODES.THIS_APP_INVITATION_CANT_BE_REJECTED,
					);
					break;
				}
			}
		});
	});

	it("should allow canceling an invitation issued by the user", async () => {
		const newUser = {
			email: "test4@test.com",
		};
		const invite = await client.inviteUser({
			email: newUser.email,
			fetchOptions: {
				headers: user.headers,
			},
		});
		if (!invite.data) {
			throw new Error("Invitation not created");
		}
		expect(invite.data.email).toBe(newUser.email);

		const res = await client.cancelInvitation({
			invitationId: invite.data.id,
			fetchOptions: {
				headers: user.headers,
			},
		});
		if (!res.data) {
			throw new Error("Invitation not canceled");
		}
		expect(res.data.status).toBe("canceled");
	});

	it("should not allow canceling an invitation issued by another user", async () => {
		const isUserSignedUp = await client.signUp.email({
			email: "test5@test.com",
			name: "Test Name",
			password: "password123456",
		});
		if (isUserSignedUp.error) {
			throw new Error("Could't create test user");
		}
		const anotherUser = await signInWithUser(
			"test5@test.com",
			"password123456",
		);

		const newUser = {
			email: "test6@test.com",
		};
		const invite = await client.inviteUser({
			email: newUser.email,
			fetchOptions: {
				headers: user.headers,
			},
		});
		if (!invite.data) {
			throw new Error("Invitation not created");
		}
		expect(invite.data.email).toBe(newUser.email);

		const res = await client.cancelInvitation({
			invitationId: invite.data.id,
			fetchOptions: {
				headers: anotherUser.headers,
			},
		});
		expect(res.error?.status).toBe(403);
	});

	it("should allow disabling sending invitations based on the issuer", async () => {
		const isUserSignedUp = await client.signUp.email({
			email: "test7@test.com",
			name: "Test Name",
			password: "password123456",
		});
		if (isUserSignedUp.error) {
			throw new Error("Could't create test user");
		}
		const anotherUser = await signInWithUser(
			"test7@test.com",
			"password123456",
		);
		const res = await client.inviteUser({
			email: "test8@test.com",
			fetchOptions: {
				headers: anotherUser.headers,
			},
		});
		expect(res.error?.status).toBe(403);
	});
});
