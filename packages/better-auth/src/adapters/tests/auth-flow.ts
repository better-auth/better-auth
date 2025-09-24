import { expect, vi } from "vitest";
import { createTestSuite } from "../create-test-suite";

/**
 * This test suite tests basic authentication flow using the adapter.
 */
export const authFlowTestSuite = createTestSuite(
	"auth-flow",
	(
		{ generate, auth, modifyBetterAuthOptions, tryCatch },
		debug?: { showDB?: () => Promise<void> },
	) => ({
		"should successfully sign up": async () => {
			await modifyBetterAuthOptions(
				{ emailAndPassword: { enabled: true } },
				false,
			);
			const user = generate("user");
			const result = await auth.api.signUpEmail({
				body: {
					email: user.email,
					password: crypto.randomUUID(),
					name: user.name,
					image: user.image || "",
				},
			});
			expect(result.user).toBeDefined();
			expect(result.user.email).toBe(user.email);
			expect(result.user.name).toBe(user.name);
			expect(result.user.image).toBe(user.image || "");
			expect(result.user.emailVerified).toBe(false);
			expect(result.user.createdAt).toBeDefined();
			expect(result.user.updatedAt).toBeDefined();
		},
		"should successfully sign in": async () => {
			await modifyBetterAuthOptions(
				{ emailAndPassword: { enabled: true } },
				false,
			);
			const user = generate("user");
			const password = crypto.randomUUID();
			const signUpResult = await auth.api.signUpEmail({
				body: {
					email: user.email,
					password: password,
					name: user.name,
					image: user.image || "",
				},
			});

			const result = await auth.api.signInEmail({
				body: { email: user.email, password: password },
			});
			expect(result.user).toBeDefined();
			expect(result.user.id).toBe(signUpResult.user.id);
		},
		"should successfully get session": async () => {
			await modifyBetterAuthOptions(
				{
					emailAndPassword: {
						enabled: true,
					},
				},
				false,
			);
			const user = generate("user");
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

			// Convert set-cookie header to cookie header for getSession call
			const modifiedHeaders = new Headers(headers);
			if (headers.has("set-cookie")) {
				modifiedHeaders.set("cookie", headers.getSetCookie().join("; "));
				modifiedHeaders.delete("set-cookie");
			}

			const result = await auth.api.getSession({
				headers: modifiedHeaders,
			});
			expect(result?.user).toBeDefined();
			expect(result?.user).toStrictEqual(signUpResult.user);
			expect(result?.session).toBeDefined();
		},
		"should not sign in with invalid email": async () => {
			await modifyBetterAuthOptions(
				{ emailAndPassword: { enabled: true } },
				false,
			);
			const user = generate("user");
			console.time("signInEmail");
			const { data, error } = await tryCatch(
				auth.api.signInEmail({
					body: { email: user.email, password: crypto.randomUUID() },
				}),
			);
			console.timeEnd("signInEmail");
			expect(data).toBeNull();
			expect(error).toBeDefined();
		},
		"should store and retrieve timestamps correctly across timezones":
			async () => {
				using _ = recoverProcessTZ();
				await modifyBetterAuthOptions(
					{ emailAndPassword: { enabled: true } },
					false,
				);
				const user = generate("user");
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
		// "test timestamps in different timezones": async () => {
		// 	using _ = recoverProcessTZ();
		// 	process.env.TZ = "Europe/London";
		// 	const date1 = new Date();
		// 	console.log(date1.toISOString());
		// 	process.env.TZ = "America/Los_Angeles";
		// 	const date2 = new Date();
		// 	console.log(date2.toISOString());
		// 	expect(date1).toStrictEqual(date2);
		// },
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
