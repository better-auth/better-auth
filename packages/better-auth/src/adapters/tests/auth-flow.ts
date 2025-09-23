import { expect } from "vitest";
import { createTestSuite } from "../create-test-suite";

/**
 * This test suite tests basic authentication flow using the adapter.
 */
export const authFlowTestSuite = createTestSuite(
	"auth-flow",
	({ generate, auth, modifyBetterAuthOptions, tryCatch }) => ({
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
		"should not sign in with invalid email": async () => {
			await modifyBetterAuthOptions(
				{ emailAndPassword: { enabled: true } },
				false,
			);
			const user = generate("user");
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
				expect(userSignUp.user.createdAt).toStrictEqual(
					userSignIn.user.createdAt,
				);
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
