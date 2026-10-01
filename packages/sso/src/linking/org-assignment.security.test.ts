import type { User } from "better-auth";
import { organization } from "better-auth/plugins";
import { getTestInstance } from "better-auth/test";
import { SignJWT } from "jose";
import { describe, expect, it, vi } from "vitest";
import { sso } from "..";

const TEST_DOMAIN = "verified-corp.test";
const TEST_EMAIL = `employee@${TEST_DOMAIN}`;

function createInstance(domainVerification?: { enabled: true }) {
	return getTestInstance({
		plugins: [
			sso(domainVerification ? { domainVerification } : {}),
			organization(),
		],
	});
}

type Instance = Awaited<ReturnType<typeof createInstance>>;

async function createGoogleIdToken(emailVerified: boolean, subject: string) {
	return new SignJWT({
		aud: "test",
		azp: "test",
		email: TEST_EMAIL,
		email_verified: emailVerified,
		iss: "https://accounts.google.com",
		name: "Verified Employee",
		sub: subject,
	})
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime("1h")
		.sign(new TextEncoder().encode("private-test-only"));
}

function mockGoogleToken(idToken: string) {
	const originalFetch = globalThis.fetch;
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
		const url =
			typeof input === "string"
				? input
				: input instanceof URL
					? input.href
					: input.url;
		if (url === "https://oauth2.googleapis.com/token") {
			return Response.json({
				access_token: "test-access-token",
				expires_in: 3600,
				id_token: idToken,
				token_type: "Bearer",
			});
		}
		return originalFetch(input, init);
	});
}

/**
 * Creates an organization owned by the test user and an SSO provider that claims
 * `TEST_DOMAIN` for it.
 */
async function registerOrganizationProvider(
	instance: Instance,
	options: { domainVerified: boolean },
) {
	const { headers } = await instance.signInWithTestUser();
	const targetOrganization = await instance.auth.api.createOrganization({
		body: { name: "Target Organization", slug: "target-organization" },
		headers,
	});
	if (!targetOrganization) {
		throw new Error("Target organization was not created");
	}

	await instance.auth.api.registerSSOProvider({
		body: {
			domain: TEST_DOMAIN,
			issuer: "https://idp.example.test",
			organizationId: targetOrganization.id,
			providerId: "target-provider",
			samlConfig: {
				audience: "target-provider",
				callbackUrl: "http://localhost:3000/api/auth/sso/callback",
				cert: "test-certificate",
				entryPoint: "https://idp.example.test/sso",
				idpMetadata: { entityID: "https://idp.example.test" },
				spMetadata: {},
				wantAssertionsSigned: true,
			},
		},
		headers,
	});

	if (options.domainVerified) {
		await instance.db.update({
			model: "ssoProvider",
			where: [{ field: "providerId", value: "target-provider" }],
			update: { domainVerified: true },
		});
	}

	return targetOrganization;
}

/** Drives a full Google sign-in and returns the resulting user row. */
async function signInWithGoogle(instance: Instance) {
	const headers = new Headers();
	const signInResponse = await instance.client.signIn.social({
		callbackURL: "/signed-in",
		fetchOptions: { onSuccess: instance.cookieSetter(headers) },
		provider: "google",
	});
	const authorizationURL = signInResponse.data?.url;
	if (!authorizationURL) {
		throw new Error("Google authorization URL was not created");
	}
	const state = new URL(authorizationURL).searchParams.get("state");
	if (!state) {
		throw new Error("OAuth state was not created");
	}

	let callbackStatus: number | undefined;
	await instance.client.$fetch("/callback/google", {
		headers,
		method: "GET",
		onError(context) {
			callbackStatus = context.response.status;
		},
		query: { code: "test-authorization-code", state },
	});
	expect(callbackStatus).toBe(302);

	const user = await instance.db.findOne<User>({
		model: "user",
		where: [{ field: "email", value: TEST_EMAIL }],
	});
	if (!user) {
		throw new Error(`Google sign-in did not produce a user for ${TEST_EMAIL}`);
	}
	return user;
}

/** Signs up a verified email-password user and links Google to it. */
async function linkGoogleToExistingUser(instance: Instance) {
	const sessionHeaders = new Headers();
	const signUpResponse = await instance.client.signUp.email(
		{ email: TEST_EMAIL, name: "Existing User", password: "test-password" },
		{ onSuccess: instance.cookieSetter(sessionHeaders) },
	);
	const userId = signUpResponse.data?.user.id;
	if (!userId) {
		throw new Error("Existing user was not created");
	}
	await instance.db.update({
		model: "user",
		where: [{ field: "id", value: userId }],
		update: { emailVerified: true },
	});

	const linkResponse = await instance.client.linkSocial(
		{ callbackURL: "/settings", provider: "google" },
		{
			headers: sessionHeaders,
			onSuccess: instance.cookieSetter(sessionHeaders),
		},
	);
	const authorizationURL = linkResponse.data?.url;
	if (!authorizationURL) {
		throw new Error("Google account-link URL was not created");
	}
	const state = new URL(authorizationURL).searchParams.get("state");
	if (!state) {
		throw new Error("OAuth state was not created");
	}
	await instance.client.$fetch("/callback/google", {
		headers: sessionHeaders,
		method: "GET",
		query: { code: "test-link-code", state },
	});

	return { sessionHeaders, userId };
}

function findMembership(
	instance: Instance,
	organizationId: string,
	userId: string,
) {
	return instance.db.findOne({
		model: "member",
		where: [
			{ field: "organizationId", value: organizationId },
			{ field: "userId", value: userId },
		],
	});
}

/**
 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-phx7-w8x2-3xgf
 */
describe("SSO verified-domain organization assignment", () => {
	it("does not auto-join a social-login user through an unverified SSO domain claim", async () => {
		mockGoogleToken(await createGoogleIdToken(true, "unverified-domain"));
		const instance = await createInstance({ enabled: true });
		const target = await registerOrganizationProvider(instance, {
			domainVerified: false,
		});

		const user = await signInWithGoogle(instance);

		await expect(
			findMembership(instance, target.id, user.id),
		).resolves.toBeNull();
	});

	it("auto-joins a verified social-login user through a verified SSO domain", async () => {
		mockGoogleToken(await createGoogleIdToken(true, "verified-social"));
		const instance = await createInstance({ enabled: true });
		const target = await registerOrganizationProvider(instance, {
			domainVerified: true,
		});

		const user = await signInWithGoogle(instance);

		await expect(
			findMembership(instance, target.id, user.id),
		).resolves.not.toBeNull();
	});

	it("does not auto-join when the social provider does not verify the email", async () => {
		mockGoogleToken(await createGoogleIdToken(false, "unverified-social"));
		const instance = await createInstance({ enabled: true });
		const target = await registerOrganizationProvider(instance, {
			domainVerified: true,
		});

		const user = await signInWithGoogle(instance);

		expect(user.emailVerified).toBe(false);
		await expect(
			findMembership(instance, target.id, user.id),
		).resolves.toBeNull();
	});

	it("does not auto-join while a social account is linked to an existing user", async () => {
		mockGoogleToken(await createGoogleIdToken(true, "linked-social"));
		const instance = await createInstance({ enabled: true });
		const target = await registerOrganizationProvider(instance, {
			domainVerified: true,
		});

		const { userId } = await linkGoogleToExistingUser(instance);

		await expect(
			instance.db.findOne({
				model: "account",
				where: [
					{ field: "providerId", value: "google" },
					{ field: "userId", value: userId },
				],
			}),
		).resolves.not.toBeNull();
		await expect(
			findMembership(instance, target.id, userId),
		).resolves.toBeNull();
	});

	it("auto-joins the linked user on their next social sign-in", async () => {
		mockGoogleToken(await createGoogleIdToken(true, "linked-social"));
		const instance = await createInstance({ enabled: true });
		const target = await registerOrganizationProvider(instance, {
			domainVerified: true,
		});
		const { sessionHeaders, userId } = await linkGoogleToExistingUser(instance);
		await instance.client.signOut({
			fetchOptions: { headers: sessionHeaders },
		});

		await signInWithGoogle(instance);

		await expect(
			findMembership(instance, target.id, userId),
		).resolves.not.toBeNull();
	});
});
