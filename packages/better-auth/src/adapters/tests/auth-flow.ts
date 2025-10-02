import { expect } from "vitest";
import { createTestSuite } from "../create-test-suite";

/**
 * This test suite tests basic authentication flow using the adapter.
 */
export const authFlowTestSuite = createTestSuite(
	"auth-flow",
	{
		defaultBetterAuthOptions: {
			emailAndPassword: {
				enabled: true,
				password: {
					hash: async (password) => password,
					async verify(data) {
						return data.hash === data.password;
					},
				},
			},
		},
	},
	(
		{
			generate,
			getAuth,
			modifyBetterAuthOptions,
			tryCatch,
			getBetterAuthOptions,
		},
		debug?: { showDB?: () => Promise<void> },
	) => ({
		"should successfully sign up": async () => {
			const auth = await getAuth();
			const user = await generate("user");
			const start = Date.now();
			const result = await auth.api.signUpEmail({
				body: {
					email: user.email,
					password: crypto.randomUUID(),
					name: user.name,
					image: user.image || "",
				},
			});
			const end = Date.now();
			console.log(`signUpEmail took ${end - start}ms (without hashing)`);
			expect(result.user).toBeDefined();
			expect(result.user.email).toBe(user.email);
			expect(result.user.name).toBe(user.name);
			expect(result.user.image).toBe(user.image || "");
			expect(result.user.emailVerified).toBe(false);
			expect(result.user.createdAt).toBeDefined();
			expect(result.user.updatedAt).toBeDefined();
		},
		"should successfully sign in": async () => {
			const auth = await getAuth();
			const user = await generate("user");
			const password = crypto.randomUUID();
			const signUpResult = await auth.api.signUpEmail({
				body: {
					email: user.email,
					password: password,
					name: user.name,
					image: user.image || "",
				},
			});
			const start = Date.now();
			const result = await auth.api.signInEmail({
				body: { email: user.email, password: password },
			});
			const end = Date.now();
			console.log(`signInEmail took ${end - start}ms (without hashing)`);
			expect(result.user).toBeDefined();
			expect(result.user.id).toBe(signUpResult.user.id);
		},
		"should successfully get session": async () => {
			const auth = await getAuth();
			const user = await generate("user");
			const password = crypto.randomUUID();

			const { headers, response: signUpResult } = await auth.api.signUpEmail({
				body: {
					email: user.email,
					password: password,
					name: user.name,
					image: user.image || "",
				},
				returnHeaders: true,
			});

			const modifiedHeaders = convertSetCookieToCookie(headers);

			const start = Date.now();
			const result = await auth.api.getSession({
				headers: modifiedHeaders,
			});
			const end = Date.now();
			console.log(`getSession took ${end - start}ms`);
			expect(result?.user).toBeDefined();
			expect(result?.user).toStrictEqual(signUpResult.user);
			expect(result?.session).toBeDefined();
		},
		"should not sign in with invalid email": async () => {
			const auth = await getAuth();
			const user = await generate("user");
			const { data, error } = await tryCatch(
				auth.api.signInEmail({
					body: { email: user.email, password: crypto.randomUUID() },
				}),
			);
			expect(data).toBeNull();
			expect(error).toBeDefined();
		},
		"should store and retrieve timestamps correctly across timezones":
			async () => {
				using _ = recoverProcessTZ();
				const auth = await getAuth();
				const user = await generate("user");
				const password = crypto.randomUUID();
				const userSignUp = await auth.api.signUpEmail({
					body: {
						email: user.email,
						password: password,
						name: user.name,
						image: user.image || "",
					},
				});
				process.env.TZ = "Europe/London";
				const userSignIn = await auth.api.signInEmail({
					body: { email: user.email, password: password },
				});
				process.env.TZ = "America/Los_Angeles";
				expect(userSignUp.user.createdAt.toISOString()).toStrictEqual(
					userSignIn.user.createdAt.toISOString(),
				);
			},
		"should sign up with additional fields": async () => {
			await modifyBetterAuthOptions(
				{ user: { additionalFields: { dateField: { type: "date" } } } },
				true,
			);
			const auth = await getAuth();
			const user = await generate("user");
			const dateField = new Date();
			const { headers } = await auth.api.signUpEmail({
				body: {
					email: user.email,
					name: user.name,
					password: crypto.randomUUID(),
					//@ts-expect-error - we are testing with additional fields
					dateField: dateField.toISOString(), // using iso string to simulate client to server communication (this should be converted back to Date)
				},
				returnHeaders: true,
			});
			const modifiedHeaders = convertSetCookieToCookie(headers);
			const result = await auth.api.getSession({
				headers: modifiedHeaders,
			});
			//@ts-expect-error - we are testing with additional fields
			expect(result?.user.dateField).toStrictEqual(dateField);
		},
	}),
);

function recoverProcessTZ() {
	const originalTZ = process.env.TZ;
	return {
		[Symbol.dispose]: () => {
			process.env.TZ = originalTZ;
		},
	};
}

function convertSetCookieToCookie(headers: Headers): Headers {
	const modifiedHeaders = new Headers(headers);
	if (headers.has("set-cookie")) {
		modifiedHeaders.set("cookie", headers.getSetCookie().join("; "));
		modifiedHeaders.delete("set-cookie");
	}
	return modifiedHeaders;
}
