import { describe, expect, it } from "vitest";
import { createAuthClient } from "../../client";
import { getTestInstance } from "../../test-utils/test-instance";
import { phoneNumber } from "../phone-number";
import { organizationClient } from "./client";
import { ORGANIZATION_ERROR_CODES } from "./error-codes";
import { organization } from "./organization";

/**
 * @see https://github.com/better-auth/better-auth/issues/8722
 */
describe("organization phone number invitations", async () => {
	const { auth, signInWithTestUser, signInWithUser } = await getTestInstance({
		plugins: [
			organization({
				async sendInvitationEmail() {},
			}),
			phoneNumber({
				sendOTP: async () => {},
			}),
		],
		logger: {
			level: "error",
		},
	});

	const client = createAuthClient({
		plugins: [organizationClient()],
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: {
			customFetchImpl: async (url, init) => {
				return auth.handler(new Request(url, init));
			},
		},
	});

	const { headers } = await signInWithTestUser();

	let organizationId: string;

	it("should create an organization", async () => {
		const org = await client.organization.create({
			name: "phone-test-org",
			slug: "phone-test-org",
			fetchOptions: { headers },
		});
		organizationId = org.data!.id;
		expect(org.data?.name).toBe("phone-test-org");
	});

	it("should invite a member by phone number", async () => {
		const invite = await client.organization.inviteMember({
			organizationId,
			phoneNumber: "+919876543210",
			role: "member",
			fetchOptions: { headers },
		});
		expect(invite.data?.phoneNumber).toBe("+919876543210");
		expect(invite.data?.role).toBe("member");
		expect(invite.data?.email).toBeNull();
	});

	it("should reject invitation without email or phoneNumber", async () => {
		const invite = await client.organization.inviteMember({
			organizationId,
			role: "member",
			fetchOptions: { headers },
		} as any);
		expect(invite.error?.status).toBe(400);
		expect(invite.error?.message).toContain(
			"Either email or phoneNumber must be provided",
		);
	});

	it("should not allow duplicate phone number invitations", async () => {
		const invite = await client.organization.inviteMember({
			organizationId,
			phoneNumber: "+919876543210",
			role: "member",
			fetchOptions: { headers },
		});
		expect(invite.error?.status).toBe(400);
		expect(invite.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION
				.message,
		);
	});

	it("should allow phone number user to accept invitation", async () => {
		const phoneNum = "+911234567890";

		// Create invitation by phone
		const invite = await client.organization.inviteMember({
			organizationId,
			phoneNumber: phoneNum,
			role: "member",
			fetchOptions: { headers },
		});
		expect(invite.data).toBeTruthy();

		// Sign up a user with email, then set their phone number via internal adapter
		const signUp = await client.signUp.email({
			email: "phone-user@test.com",
			password: "test123456",
			name: "Phone User",
		});
		expect(signUp.data).toBeTruthy();

		// Update phone number via internal adapter
		const ctx = await auth.$context;
		await ctx.internalAdapter.updateUser(signUp.data!.user.id, {
			phoneNumber: phoneNum,
			phoneNumberVerified: true,
		} as any);

		const { headers: phoneUserHeaders } = await signInWithUser(
			"phone-user@test.com",
			"test123456",
		);

		// Accept the invitation
		const accept = await client.organization.acceptInvitation({
			invitationId: invite.data!.id,
			fetchOptions: { headers: phoneUserHeaders },
		});
		expect(accept.data?.invitation.status).toBe("accepted");
	});

	it("should still support email invitations", async () => {
		const invite = await client.organization.inviteMember({
			organizationId,
			email: "email-invite@test.com",
			role: "admin",
			fetchOptions: { headers },
		});
		expect(invite.data?.email).toBe("email-invite@test.com");
		expect(invite.data?.phoneNumber).toBeNull();
		expect(invite.data?.role).toBe("admin");
	});
});
