import type { BetterAuthOptions } from "@better-auth/core";
import { describe, expect, it } from "vitest";
import { username } from "../plugins/username";
import { usernameClient } from "../plugins/username/client";
import { getTestInstance } from "../test-utils/test-instance";

/**
 * A password `verify` function may return `"success-rehash-needed"` to signal
 * that the password is valid but the stored hash is outdated and should be
 * transparently re-hashed and persisted. These tests exercise the call sites
 * that honor that sentinel.
 *
 * @see https://github.com/better-auth/better-auth/issues/10289
 */

const LEGACY_PREFIX = "legacy:";
const MODERN_PREFIX = "modern:";

/**
 * Minimal structural view of the pieces of the auth context these helpers use.
 * `Auth<Options>` is invariant in `Options`, so a concrete test instance is not
 * assignable to a base-typed parameter — this narrows to only what we need.
 */
interface AdapterHolder {
	$context: Promise<{
		internalAdapter: {
			findAccounts: (
				userId: string,
			) => Promise<
				Array<{ id: string; providerId: string; password?: string | null }>
			>;
			updateAccount: (
				accountId: string,
				data: { password: string },
			) => Promise<unknown>;
		};
	}>;
}

/**
 * Deterministic hashing scheme for tests:
 * - `hash` always produces a "modern" hash.
 * - `verify` accepts modern hashes directly, and treats "legacy" hashes as
 *   valid-but-outdated by returning `"success-rehash-needed"`.
 */
function createPasswordConfig() {
	const state = { hashCalls: 0, failNextHash: false };
	const password: NonNullable<
		NonNullable<BetterAuthOptions["emailAndPassword"]>["password"]
	> = {
		hash: async (plain) => {
			state.hashCalls++;
			if (state.failNextHash) {
				throw new Error("simulated hash failure");
			}
			return `${MODERN_PREFIX}${plain}`;
		},
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
	return { state, password };
}

async function getCredentialAccount(auth: AdapterHolder, userId: string) {
	const ctx = await auth.$context;
	const accounts = await ctx.internalAdapter.findAccounts(userId);
	const account = accounts.find((a) => a.providerId === "credential");
	if (!account) {
		throw new Error("credential account not found");
	}
	return account;
}

async function setStoredPassword(
	auth: AdapterHolder,
	accountId: string,
	value: string,
) {
	const ctx = await auth.$context;
	await ctx.internalAdapter.updateAccount(accountId, { password: value });
}

describe("password rehash on verify", () => {
	it("re-hashes and persists an outdated hash on email sign-in", async () => {
		const { password } = createPasswordConfig();
		const { auth } = await getTestInstance({
			emailAndPassword: { enabled: true, password },
		});
		const email = "rehash-signin@test.com";
		const plain = "password1234";
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

	it("does not re-hash when the stored hash is already current", async () => {
		const { password, state } = createPasswordConfig();
		const { auth } = await getTestInstance({
			emailAndPassword: { enabled: true, password },
		});
		const email = "no-rehash@test.com";
		const plain = "password1234";
		const { user } = await auth.api.signUpEmail({
			body: { email, password: plain, name: "no rehash" },
		});
		const before = await getCredentialAccount(auth, user.id);
		const hashCallsBefore = state.hashCalls;

		await auth.api.signInEmail({ body: { email, password: plain } });

		const after = await getCredentialAccount(auth, user.id);
		expect(after.password).toBe(before.password);
		// verify() returned `true`, so no additional hashing occurred.
		expect(state.hashCalls).toBe(hashCallsBefore);
	});

	it("does not re-hash when the password is wrong", async () => {
		const { password } = createPasswordConfig();
		const { auth } = await getTestInstance({
			emailAndPassword: { enabled: true, password },
		});
		const email = "wrong-password@test.com";
		const plain = "password1234";
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

	it("does not re-hash when the sign-in is rejected by email verification", async () => {
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
		const plain = "password1234";
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

	it("does not fail sign-in when persisting the new hash throws", async () => {
		const { password, state } = createPasswordConfig();
		const { auth } = await getTestInstance({
			emailAndPassword: { enabled: true, password },
		});
		const email = "rehash-failure@test.com";
		const plain = "password1234";
		const { user } = await auth.api.signUpEmail({
			body: { email, password: plain, name: "rehash failure" },
		});
		const account = await getCredentialAccount(auth, user.id);
		await setStoredPassword(auth, account.id, `${LEGACY_PREFIX}${plain}`);

		// Re-hashing will throw, but the credential itself is valid.
		state.failNextHash = true;
		const res = await auth.api.signInEmail({
			body: { email, password: plain },
		});
		expect(res.token).toBeTruthy();

		// The outdated hash is left untouched since the re-hash could not be saved.
		const after = await getCredentialAccount(auth, user.id);
		expect(after.password).toBe(`${LEGACY_PREFIX}${plain}`);

		// Recovery: once hashing works again, the next sign-in migrates the hash.
		state.failNextHash = false;
		await auth.api.signInEmail({ body: { email, password: plain } });
		const migrated = await getCredentialAccount(auth, user.id);
		expect(migrated.password).toBe(`${MODERN_PREFIX}${plain}`);
	});

	it("re-hashes an outdated hash via validatePassword (verify-password endpoint)", async () => {
		const { password } = createPasswordConfig();
		const { auth, signInWithUser } = await getTestInstance({
			emailAndPassword: { enabled: true, password },
		});
		const email = "validate-rehash@test.com";
		const plain = "password1234";
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

	it("stores the new password (not an intermediate re-hash) on change-password with an outdated hash", async () => {
		const { password } = createPasswordConfig();
		const { auth, signInWithUser } = await getTestInstance({
			emailAndPassword: { enabled: true, password },
		});
		const email = "change-password@test.com";
		const oldPlain = "password1234";
		const newPlain = "newpassword1234";
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

	it("re-hashes an outdated hash on username sign-in", async () => {
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
		const plain = "password1234";
		await client.signUp.email({
			email,
			username: uname,
			password: plain,
			name: "uname",
		});
		// `auth` carries plugin generics here, so access the adapter directly
		// rather than through the base-typed helpers.
		const ctx = await auth.$context;
		const found = await ctx.internalAdapter.findUserByEmail(email);
		const userId = found!.user.id;
		const account = (await ctx.internalAdapter.findAccounts(userId)).find(
			(a) => a.providerId === "credential",
		)!;
		await ctx.internalAdapter.updateAccount(account.id, {
			password: `${LEGACY_PREFIX}${plain}`,
		});

		const res = await client.signIn.username({
			username: uname,
			password: plain,
		});
		expect(res.data?.token).toBeTruthy();

		const after = (await ctx.internalAdapter.findAccounts(userId)).find(
			(a) => a.providerId === "credential",
		)!;
		expect(after.password).toBe(`${MODERN_PREFIX}${plain}`);
	});
});
