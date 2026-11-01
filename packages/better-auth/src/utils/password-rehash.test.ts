import type { BetterAuthOptions, InternalAdapter } from "@better-auth/core";
import { describe, expect, it, vi } from "vitest";
import { phoneNumber } from "../plugins/phone-number";
import { twoFactor } from "../plugins/two-factor";
import { username } from "../plugins/username";
import { usernameClient } from "../plugins/username/client";
import { getTestInstance } from "../test-utils/test-instance";

const LEGACY_PREFIX = "legacy:";
const MODERN_PREFIX = "modern:";

/**
 * The slice of a test instance the helpers below use. Narrowing to these two
 * methods lets instances with plugin-specific option types share the helpers.
 */
type CredentialAccountAccess = {
	$context: Promise<{
		internalAdapter: Pick<
			InternalAdapter,
			"findCredentialAccount" | "updateAccount"
		>;
	}>;
};

/**
 * Deterministic hashing scheme for tests:
 * - `hash` always produces a "modern" hash.
 * - `verify` accepts modern hashes directly, and treats "legacy" hashes as
 *   valid-but-outdated by returning `"success-rehash-needed"`.
 */
function createPasswordConfig() {
	const hash = vi.fn(async (plain: string) => `${MODERN_PREFIX}${plain}`);
	const password: NonNullable<
		NonNullable<BetterAuthOptions["emailAndPassword"]>["password"]
	> = {
		hash,
		verify: async ({ hash, password }) => {
			if (hash.startsWith(MODERN_PREFIX)) {
				return hash === `${MODERN_PREFIX}${password}`;
			}
			if (hash.startsWith(LEGACY_PREFIX)) {
				return hash === `${LEGACY_PREFIX}${password}`
					? "success-rehash-needed"
					: false;
			}
			return false;
		},
	};
	return { hash, password };
}

async function getCredentialAccount(
	auth: CredentialAccountAccess,
	userId: string,
) {
	const ctx = await auth.$context;
	const account = await ctx.internalAdapter.findCredentialAccount(userId);
	if (!account) {
		throw new Error("credential account not found");
	}
	return account;
}

async function setStoredPassword(
	auth: CredentialAccountAccess,
	accountId: string,
	value: string,
) {
	const ctx = await auth.$context;
	await ctx.internalAdapter.updateAccount(accountId, { password: value });
}

/**
 * A password `verify` function may return `"success-rehash-needed"` to signal
 * that the password is valid but the stored hash is outdated and should be
 * transparently re-hashed and persisted. These tests exercise the call sites
 * that honor that sentinel.
 *
 * @see https://github.com/better-auth/better-auth/issues/10289
 */
describe("password rehash on verify", () => {
	it("should re-hash and persist an outdated hash on email sign-in", async () => {
		const { password } = createPasswordConfig();
		const { auth } = await getTestInstance({
			emailAndPassword: { enabled: true, password },
		});
		const email = "rehash-signin@test.com";
		const plain = "password123";
		const { user } = await auth.api.signUpEmail({
			body: { email, password: plain, name: "rehash" },
		});
		const account = await getCredentialAccount(auth, user.id);
		// Downgrade the stored hash to the legacy format.
		await setStoredPassword(auth, account.id, `${LEGACY_PREFIX}${plain}`);

		const res = await auth.api.signInEmail({
			body: { email, password: plain },
		});
		expect(res.token).toBeTruthy();

		const after = await getCredentialAccount(auth, user.id);
		expect(after.password).toBe(`${MODERN_PREFIX}${plain}`);

		// A subsequent sign-in verifies against the new hash and succeeds.
		const res2 = await auth.api.signInEmail({
			body: { email, password: plain },
		});
		expect(res2.token).toBeTruthy();
	});

	it("should not re-hash when the stored hash is already current", async () => {
		const { password, hash } = createPasswordConfig();
		const { auth } = await getTestInstance({
			emailAndPassword: { enabled: true, password },
		});
		const email = "no-rehash@test.com";
		const plain = "password123";
		const { user } = await auth.api.signUpEmail({
			body: { email, password: plain, name: "no rehash" },
		});
		const before = await getCredentialAccount(auth, user.id);
		const hashCallsBefore = hash.mock.calls.length;

		await auth.api.signInEmail({ body: { email, password: plain } });

		const after = await getCredentialAccount(auth, user.id);
		expect(after.password).toBe(before.password);
		// verify() returned `true`, so no additional hashing occurred.
		expect(hash).toHaveBeenCalledTimes(hashCallsBefore);
	});

	it("should not re-hash when the password is wrong", async () => {
		const { password } = createPasswordConfig();
		const { auth } = await getTestInstance({
			emailAndPassword: { enabled: true, password },
		});
		const email = "wrong-password@test.com";
		const plain = "password123";
		const { user } = await auth.api.signUpEmail({
			body: { email, password: plain, name: "wrong" },
		});
		const account = await getCredentialAccount(auth, user.id);
		await setStoredPassword(auth, account.id, `${LEGACY_PREFIX}${plain}`);

		await expect(
			auth.api.signInEmail({ body: { email, password: "not-the-password" } }),
		).rejects.toThrow();

		const after = await getCredentialAccount(auth, user.id);
		expect(after.password).toBe(`${LEGACY_PREFIX}${plain}`);
	});

	it("should not re-hash when the sign-in is rejected by email verification", async () => {
		const { password } = createPasswordConfig();
		const { auth } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				password,
				requireEmailVerification: true,
			},
			emailVerification: {
				sendVerificationEmail: async () => {},
			},
		});
		const email = "unverified-rehash@test.com";
		const plain = "password123";
		const { user } = await auth.api.signUpEmail({
			body: { email, password: plain, name: "unverified" },
		});
		const account = await getCredentialAccount(auth, user.id);
		await setStoredPassword(auth, account.id, `${LEGACY_PREFIX}${plain}`);

		// Correct password, but the sign-in is rejected because the email is
		// unverified — the hash upgrade must not be written for a request that
		// cannot produce a session.
		await expect(
			auth.api.signInEmail({ body: { email, password: plain } }),
		).rejects.toThrow();

		const after = await getCredentialAccount(auth, user.id);
		expect(after.password).toBe(`${LEGACY_PREFIX}${plain}`);
	});

	it("should not overwrite a concurrent password change while re-hashing", async () => {
		const { password } = createPasswordConfig();
		const email = "concurrent-write@test.com";
		const plain = "password123";
		const concurrentHash = `${MODERN_PREFIX}concurrent-new-password`;
		let armed = false;
		const { auth } = await getTestInstance({
			emailAndPassword: { enabled: true, password },
			databaseHooks: {
				account: {
					update: {
						// Runs after any read-back of the stored hash and immediately
						// before the re-hash write, so a guard that checks the hash in a
						// separate read cannot see this change.
						before: async (data, ctx) => {
							if (!armed || !ctx) return;
							armed = false;
							const account = await getCredentialAccount(auth, userId);
							await ctx.context.adapter.update({
								model: "account",
								where: [{ field: "id", value: account.id }],
								update: { password: concurrentHash },
							});
							return { data };
						},
					},
				},
			},
		});
		const { user } = await auth.api.signUpEmail({
			body: { email, password: plain, name: "concurrent write" },
		});
		const userId = user.id;
		const account = await getCredentialAccount(auth, userId);
		await setStoredPassword(auth, account.id, `${LEGACY_PREFIX}${plain}`);

		armed = true;
		const res = await auth.api.signInEmail({
			body: { email, password: plain },
		});
		expect(res.token).toBeTruthy();

		const after = await getCredentialAccount(auth, userId);
		expect(after.password).toBe(concurrentHash);
	});

	it("should pass the updated account to account update hooks", async () => {
		const { password } = createPasswordConfig();
		const afterUpdate = vi.fn();
		const { auth } = await getTestInstance({
			emailAndPassword: { enabled: true, password },
			databaseHooks: {
				account: {
					update: {
						after: afterUpdate,
					},
				},
			},
		});
		const email = "rehash-hooks@test.com";
		const plain = "password123";
		const { user } = await auth.api.signUpEmail({
			body: { email, password: plain, name: "hooks" },
		});
		const account = await getCredentialAccount(auth, user.id);
		await setStoredPassword(auth, account.id, `${LEGACY_PREFIX}${plain}`);
		afterUpdate.mockClear();

		await auth.api.signInEmail({ body: { email, password: plain } });

		expect(afterUpdate).toHaveBeenCalledTimes(1);
		expect(afterUpdate).toHaveBeenCalledWith(
			expect.objectContaining({ id: account.id, userId: user.id }),
			expect.anything(),
		);
	});

	it("should run the re-hash through the background task handler when one is configured", async () => {
		const { password, hash } = createPasswordConfig();
		const backgroundTasks: Promise<unknown>[] = [];
		const { auth } = await getTestInstance({
			emailAndPassword: { enabled: true, password },
			advanced: {
				backgroundTasks: {
					handler: (promise) => {
						backgroundTasks.push(promise);
					},
				},
			},
		});
		const email = "background-rehash@test.com";
		const plain = "password123";
		const { user } = await auth.api.signUpEmail({
			body: { email, password: plain, name: "background" },
		});
		const account = await getCredentialAccount(auth, user.id);
		await setStoredPassword(auth, account.id, `${LEGACY_PREFIX}${plain}`);

		// Hold the re-hash open so the response can only arrive first if the
		// re-hash is not awaited by the request.
		const gate = Promise.withResolvers<void>();
		hash.mockImplementationOnce(async (plain) => {
			await gate.promise;
			return `${MODERN_PREFIX}${plain}`;
		});

		const res = await Promise.race([
			auth.api.signInEmail({ body: { email, password: plain } }),
			new Promise<"blocked">((resolve) =>
				setTimeout(() => resolve("blocked"), 1000),
			),
		]);
		expect(res).not.toBe("blocked");
		const before = await getCredentialAccount(auth, user.id);
		expect(before.password).toBe(`${LEGACY_PREFIX}${plain}`);

		gate.resolve();
		await Promise.all(backgroundTasks);
		const after = await getCredentialAccount(auth, user.id);
		expect(after.password).toBe(`${MODERN_PREFIX}${plain}`);
	});

	it("should not fail sign-in when persisting the new hash throws", async () => {
		const { password, hash } = createPasswordConfig();
		const { auth } = await getTestInstance({
			emailAndPassword: { enabled: true, password },
		});
		const email = "rehash-failure@test.com";
		const plain = "password123";
		const { user } = await auth.api.signUpEmail({
			body: { email, password: plain, name: "rehash failure" },
		});
		const account = await getCredentialAccount(auth, user.id);
		await setStoredPassword(auth, account.id, `${LEGACY_PREFIX}${plain}`);

		// Re-hashing will throw, but the credential itself is valid.
		hash.mockRejectedValueOnce(new Error("simulated hash failure"));
		const res = await auth.api.signInEmail({
			body: { email, password: plain },
		});
		expect(res.token).toBeTruthy();

		// The outdated hash is left untouched since the re-hash could not be saved.
		const after = await getCredentialAccount(auth, user.id);
		expect(after.password).toBe(`${LEGACY_PREFIX}${plain}`);

		// Recovery: once hashing works again, the next sign-in migrates the hash.
		await auth.api.signInEmail({ body: { email, password: plain } });
		const migrated = await getCredentialAccount(auth, user.id);
		expect(migrated.password).toBe(`${MODERN_PREFIX}${plain}`);
	});

	it("should re-hash an outdated hash via validatePassword (verify-password endpoint)", async () => {
		const { password } = createPasswordConfig();
		const { auth, signInWithUser } = await getTestInstance({
			emailAndPassword: { enabled: true, password },
		});
		const email = "validate-rehash@test.com";
		const plain = "password123";
		const { user } = await auth.api.signUpEmail({
			body: { email, password: plain, name: "validate" },
		});
		const { headers } = await signInWithUser(email, plain);
		// Downgrade after signing in so the endpoint sees the legacy hash.
		const account = await getCredentialAccount(auth, user.id);
		await setStoredPassword(auth, account.id, `${LEGACY_PREFIX}${plain}`);

		const res = await auth.api.verifyPassword({
			body: { password: plain },
			headers,
		});
		expect(res.status).toBe(true);

		const after = await getCredentialAccount(auth, user.id);
		expect(after.password).toBe(`${MODERN_PREFIX}${plain}`);
	});

	it("should store the new password (not an intermediate re-hash) on change-password with an outdated hash", async () => {
		const { password } = createPasswordConfig();
		const { auth, signInWithUser } = await getTestInstance({
			emailAndPassword: { enabled: true, password },
		});
		const email = "change-password@test.com";
		const oldPlain = "password123";
		const newPlain = "new-password";
		const { user } = await auth.api.signUpEmail({
			body: { email, password: oldPlain, name: "change" },
		});
		const { headers } = await signInWithUser(email, oldPlain);
		// Downgrade after signing in so change-password verifies the legacy hash.
		const account = await getCredentialAccount(auth, user.id);
		await setStoredPassword(auth, account.id, `${LEGACY_PREFIX}${oldPlain}`);

		await auth.api.changePassword({
			body: { currentPassword: oldPlain, newPassword: newPlain },
			headers,
		});

		const after = await getCredentialAccount(auth, user.id);
		expect(after.password).toBe(`${MODERN_PREFIX}${newPlain}`);

		await expect(
			auth.api.signInEmail({ body: { email, password: oldPlain } }),
		).rejects.toThrow();
		const res = await auth.api.signInEmail({
			body: { email, password: newPlain },
		});
		expect(res.token).toBeTruthy();
	});

	it("should re-hash an outdated hash on username sign-in", async () => {
		const { password } = createPasswordConfig();
		const { auth, client } = await getTestInstance(
			{
				emailAndPassword: { enabled: true, password },
				plugins: [username()],
			},
			{
				clientOptions: {
					plugins: [usernameClient()],
				},
			},
		);
		const email = "username-rehash@test.com";
		const uname = "rehash_user";
		const plain = "password123";
		await client.signUp.email({
			email,
			username: uname,
			password: plain,
			name: "uname",
		});
		const ctx = await auth.$context;
		const found = await ctx.internalAdapter.findUserByEmail(email);
		const userId = found!.user.id;
		const account = await getCredentialAccount(auth, userId);
		await setStoredPassword(auth, account.id, `${LEGACY_PREFIX}${plain}`);

		const res = await client.signIn.username({
			username: uname,
			password: plain,
		});
		expect(res.data?.token).toBeTruthy();

		const after = await getCredentialAccount(auth, userId);
		expect(after.password).toBe(`${MODERN_PREFIX}${plain}`);
	});

	it("should re-hash an outdated hash on phone number sign-in", async () => {
		const { password } = createPasswordConfig();
		const { auth } = await getTestInstance({
			emailAndPassword: { enabled: true, password },
			plugins: [phoneNumber({ sendOTP: async () => {} })],
		});
		const email = "phone-rehash@test.com";
		const testPhoneNumber = "+251911121314";
		const plain = "password123";
		const { user } = await auth.api.signUpEmail({
			body: { email, password: plain, name: "phone" },
		});
		const ctx = await auth.$context;
		await ctx.internalAdapter.updateUser(user.id, {
			phoneNumber: testPhoneNumber,
			phoneNumberVerified: true,
		});
		const account = await getCredentialAccount(auth, user.id);
		await setStoredPassword(auth, account.id, `${LEGACY_PREFIX}${plain}`);

		const res = await auth.api.signInPhoneNumber({
			body: { phoneNumber: testPhoneNumber, password: plain },
		});
		expect(res.token).toBeTruthy();

		const after = await getCredentialAccount(auth, user.id);
		expect(after.password).toBe(`${MODERN_PREFIX}${plain}`);
	});

	it("should re-hash an outdated hash via checkPassword (two-factor TOTP URI)", async () => {
		const { password } = createPasswordConfig();
		const { auth, signInWithUser } = await getTestInstance({
			emailAndPassword: { enabled: true, password },
			plugins: [twoFactor()],
		});
		const email = "check-password-rehash@test.com";
		const plain = "password123";
		const { user } = await auth.api.signUpEmail({
			body: { email, password: plain, name: "check" },
		});
		const { headers } = await signInWithUser(email, plain);
		await auth.api.enableTwoFactor({ body: { password: plain }, headers });
		// Downgrade after enabling so the TOTP URI endpoint verifies the legacy
		// hash through `checkPassword`.
		const account = await getCredentialAccount(auth, user.id);
		await setStoredPassword(auth, account.id, `${LEGACY_PREFIX}${plain}`);

		const res = await auth.api.getTOTPURI({
			body: { password: plain },
			headers,
		});
		expect(res.totpURI).toBeTruthy();

		const after = await getCredentialAccount(auth, user.id);
		expect(after.password).toBe(`${MODERN_PREFIX}${plain}`);
	});
});
