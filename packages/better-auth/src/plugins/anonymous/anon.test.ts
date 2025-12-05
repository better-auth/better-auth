import type { GoogleProfile } from "@better-auth/core/social-providers";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { signJWT } from "../../crypto";
import { getTestInstance } from "../../test-utils/test-instance";
import { DEFAULT_SECRET } from "../../utils/constants";
import { anonymous } from ".";
import { anonymousClient } from "./client";

let testIdToken: string;
let handlers: ReturnType<typeof http.post>[];

const server = setupServer();

beforeAll(async () => {
	const data: GoogleProfile = {
		email: "user@email.com",
		email_verified: true,
		name: "First Last",
		picture: "https://lh3.googleusercontent.com/a-/AOh14GjQ4Z7Vw",
		exp: 1234567890,
		sub: "1234567890",
		iat: 1234567890,
		aud: "test",
		azp: "test",
		nbf: 1234567890,
		iss: "test",
		locale: "en",
		jti: "test",
		given_name: "First",
		family_name: "Last",
	};
	testIdToken = await signJWT(data, DEFAULT_SECRET);

	handlers = [
		http.post("https://oauth2.googleapis.com/token", () => {
			return HttpResponse.json({
				access_token: "test",
				refresh_token: "test",
				id_token: testIdToken,
			});
		}),
	];

	server.listen({ onUnhandledRequest: "bypass" });
	server.use(...handlers);
});

afterEach(() => {
	server.resetHandlers();
	server.use(...handlers);
});

afterAll(() => server.close());

describe("anonymous", async () => {
	const linkAccountFn = vi.fn();
	const { client, sessionSetter, testUser, cookieSetter } =
		await getTestInstance(
			{
				plugins: [
					anonymous({
						async onLinkAccount(data) {
							linkAccountFn(data);
						},
						schema: {
							user: {
								fields: {
									isAnonymous: "is_anon",
								},
							},
						},
					}),
				],
				socialProviders: {
					google: {
						clientId: "test",
						clientSecret: "test",
					},
				},
			},
			{
				clientOptions: {
					plugins: [anonymousClient()],
				},
			},
		);
	const headers = new Headers();

	it("should sign in anonymously", async () => {
		await client.signIn.anonymous({
			fetchOptions: {
				onSuccess: sessionSetter(headers),
			},
		});
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data?.session).toBeDefined();
		expect(session.data?.user.isAnonymous).toBe(true);
	});

	it("link anonymous user account", async () => {
		expect(linkAccountFn).toHaveBeenCalledTimes(0);
		const res = await client.signIn.email(testUser, {
			headers,
		});
		expect(linkAccountFn).toHaveBeenCalledWith(expect.any(Object));
		linkAccountFn.mockClear();
	});

	it("should link in social sign on", async () => {
		const headers = new Headers();
		await client.signIn.anonymous({
			fetchOptions: {
				onSuccess: sessionSetter(headers),
			},
		});

		await client.getSession({
			fetchOptions: {
				headers,
			},
		});

		const singInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/dashboard",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});
		const state = new URL(singInRes.data?.url || "").searchParams.get("state");
		await client.$fetch("/callback/google", {
			query: {
				state,
				code: "test",
			},
			headers,
		});
		expect(linkAccountFn).toHaveBeenCalledWith(expect.any(Object));
	});

	it("should work with generateName", async () => {
		const { client, sessionSetter } = await getTestInstance(
			{
				plugins: [
					anonymous({
						generateName() {
							return "i-am-anonymous";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [anonymousClient()],
				},
			},
		);
		const res = await client.signIn.anonymous({
			fetchOptions: {
				onSuccess: sessionSetter(headers),
			},
		});
		expect(res.data?.user.name).toBe("i-am-anonymous");
	});

	it("should work with generateRandomEmail", async () => {
		const testHeaders = new Headers();
		const { client, sessionSetter } = await getTestInstance(
			{
				plugins: [
					anonymous({
						generateRandomEmail() {
							const id = crypto.randomUUID();
							return `custom-${id}@example.com`;
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [anonymousClient()],
				},
			},
		);
		const res = await client.signIn.anonymous({
			fetchOptions: {
				onSuccess: sessionSetter(testHeaders),
			},
		});
		expect(res.data?.user.email).toMatch(/^custom-[a-f0-9-]+@example\.com$/);
	});

	it("should work with async generateRandomEmail", async () => {
		const testHeaders = new Headers();
		const { client, sessionSetter } = await getTestInstance(
			{
				plugins: [
					anonymous({
						async generateRandomEmail() {
							const id = crypto.randomUUID();
							return `async-${id}@example.com`;
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [anonymousClient()],
				},
			},
		);
		const res = await client.signIn.anonymous({
			fetchOptions: {
				onSuccess: sessionSetter(testHeaders),
			},
		});
		expect(res.data?.user.email).toMatch(/^async-[a-f0-9-]+@example\.com$/);
	});

	it("should throw error if generateRandomEmail returns invalid email", async () => {
		const testHeaders = new Headers();
		const { client, sessionSetter } = await getTestInstance(
			{
				plugins: [
					anonymous({
						generateRandomEmail() {
							return "not-an-email";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [anonymousClient()],
				},
			},
		);

		const res = await client.signIn.anonymous({
			fetchOptions: {
				onSuccess: sessionSetter(testHeaders),
			},
		});

		expect(res.error).toBeDefined();
		expect(res.data).toBeNull();
		expect(res.error?.message).toBe(
			"Email was not generated in a valid format",
		);
	});

	it("should throw error if async generateRandomEmail returns invalid email", async () => {
		const testHeaders = new Headers();
		const { client, sessionSetter } = await getTestInstance(
			{
				plugins: [
					anonymous({
						async generateRandomEmail() {
							return "still-not-an-email";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [anonymousClient()],
				},
			},
		);

		const res = await client.signIn.anonymous({
			fetchOptions: {
				onSuccess: sessionSetter(testHeaders),
			},
		});

		expect(res.error).toBeDefined();
		expect(res.data).toBeNull();
		expect(res.error?.message).toBe(
			"Email was not generated in a valid format",
		);
	});

	it("should not reject first-time anonymous sign-in", async () => {
		const { client, sessionSetter } = await getTestInstance(
			{
				plugins: [anonymous()],
			},
			{
				clientOptions: {
					plugins: [anonymousClient()],
				},
			},
		);
		const freshHeaders = new Headers();

		// First-time anonymous sign-in should succeed without 400 error
		const res = await client.signIn.anonymous({
			fetchOptions: {
				onSuccess: sessionSetter(freshHeaders),
			},
		});

		expect(res.data?.user).toBeDefined();
		expect(res.error).toBeNull();

		// Verify session is actually created and contains isAnonymous
		const session = await client.getSession({
			fetchOptions: {
				headers: freshHeaders,
			},
		});
		expect(session.data?.session).toBeDefined();
		expect(session.data?.user.isAnonymous).toBe(true);
	});

	it("should reject subsequent anonymous sign-in attempts once signed in", async () => {
		const { client, sessionSetter } = await getTestInstance(
			{
				plugins: [anonymous()],
			},
			{
				clientOptions: {
					plugins: [anonymousClient()],
				},
			},
		);
		const persistentHeaders = new Headers();

		// First sign-in should succeed
		await client.signIn.anonymous({
			fetchOptions: {
				headers: persistentHeaders,
				onSuccess: sessionSetter(persistentHeaders),
			},
		});

		// Verify session is established before testing rejection
		const session = await client.getSession({
			fetchOptions: {
				headers: persistentHeaders,
			},
		});
		expect(session.data?.session).toBeDefined();
		expect(session.data?.user.isAnonymous).toBe(true);

		// Second attempt should be rejected at the endpoint level
		const secondAttempt = await client.signIn.anonymous({
			fetchOptions: {
				headers: persistentHeaders,
			},
		});

		expect(secondAttempt.data).toBeNull();
		expect(secondAttempt.error).toBeDefined();
		expect(secondAttempt.error?.message).toBe(
			"Anonymous users cannot sign in again anonymously",
		);
	});
});
