import { getTestInstance } from "better-auth/test";
import { describe, expect, it, vi } from "vitest";
import { withDsqlRetry } from "./retry";

/** @see https://github.com/better-auth/better-auth/issues/12088 */
describe("sign-up with serialization retries", () => {
	const body = {
		name: "Retry",
		email: "retry@example.test",
		password: "test-password-123",
	};
	const conflict = () =>
		Object.assign(new Error("serialization abort"), { code: "40001" });
	it.each([1, 4])(
		"uses shared after-commit email hooks with DSQL retries (%s aborts)",
		async (failures) => {
			const sendVerificationEmail = vi.fn(async () => {});
			const { auth, db } = await getTestInstance(
				{ emailVerification: { sendOnSignUp: true, sendVerificationEmail } },
				{ disableTestUser: true },
			);
			const ctx = await auth.$context;
			const transaction = ctx.adapter.transaction;
			let attempts = 0;
			vi.spyOn(ctx.adapter, "transaction").mockImplementation((cb) =>
				withDsqlRetry(() =>
					transaction(async (trx) => {
						attempts++;
						const result = await cb(trx);
						expect(sendVerificationEmail).not.toHaveBeenCalled();
						if (attempts <= failures) throw conflict();
						return result;
					}),
				),
			);
			if (failures === 1) {
				const result = await auth.api.signUpEmail({ body });
				expect(result.user.email).toBe(body.email);
				expect(attempts).toBe(2);
				expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
			} else {
				await expect(auth.api.signUpEmail({ body })).rejects.toThrow(
					"serialization abort",
				);
				expect(attempts).toBe(4);
				expect(sendVerificationEmail).not.toHaveBeenCalled();
				expect(await db.findMany({ model: "user" })).toHaveLength(0);
			}
		},
	);
});
