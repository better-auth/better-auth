import { createPool } from "mysql2/promise";
import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "./test-instance";

let isMysqlAvailable = false;
try {
	const probe = createPool({
		uri: "mysql://root:root_password@127.0.0.1:3306",
		connectTimeout: 2000,
	});
	await probe.query("SELECT 1");
	await probe.end();
	isMysqlAvailable = true;
} catch {
	isMysqlAvailable = false;
}

describe("getTestInstance password hasher", () => {
	it("should normalize passwords with NFKC", async () => {
		const email = "unicode-password@test.com";
		const password = "비밀번호１２３４５６";
		const { auth } = await getTestInstance(undefined, {
			disableTestUser: true,
		});

		await auth.api.signUpEmail({
			body: {
				email,
				name: "Unicode Password",
				password,
			},
		});

		const result = await auth.api.signInEmail({
			body: {
				email,
				password: password.normalize("NFKC"),
			},
		});

		expect(result.user.email).toBe(email);
	});

	it("should preserve a caller-provided password implementation", async () => {
		const email = "custom-password@test.com";
		const password = "test123456";
		const hash = vi.fn(async (value: string) => `custom:${value}`);
		const verify = vi.fn(
			async ({ hash, password }: { hash: string; password: string }) =>
				hash === `custom:${password}`,
		);
		const { auth } = await getTestInstance(
			{
				emailAndPassword: {
					enabled: true,
					password: { hash, verify },
				},
			},
			{ disableTestUser: true },
		);

		await auth.api.signUpEmail({
			body: {
				email,
				name: "Custom Password",
				password,
			},
		});

		expect(hash).toHaveBeenCalledWith(password);

		await auth.api.signInEmail({
			body: { email, password },
		});

		expect(verify).toHaveBeenCalledWith({
			hash: `custom:${password}`,
			password,
		});
	});
});

/**
 * Kysely's `MysqlDialect` expects a callback-style mysql2 pool. CI starts
 * MySQL, so the suite runs there even when the probe fails.
 * @see https://kysely-org.github.io/kysely-apidoc/interfaces/MysqlDialectConfig.html
 */
describe.runIf(isMysqlAvailable || Boolean(process.env.CI))(
	"getTestInstance with MySQL",
	() => {
		it("should migrate and sign in the test user", async () => {
			const { client, signInWithTestUser, testUser } = await getTestInstance(
				undefined,
				{ testWith: "mysql" },
			);

			const { user, headers } = await signInWithTestUser();
			expect(user.email).toBe(testUser.email);

			const session = await client.getSession({ fetchOptions: { headers } });
			expect(session.data?.user.id).toBe(user.id);
		});

		it("should give each instance its own database", async () => {
			const first = await getTestInstance(undefined, { testWith: "mysql" });
			const second = await getTestInstance(undefined, { testWith: "mysql" });

			const { user: firstUser } = await first.signInWithTestUser();
			const { user: secondUser } = await second.signInWithTestUser();

			expect(secondUser.email).toBe(firstUser.email);
			expect(secondUser.id).not.toBe(firstUser.id);
		});
	},
);
