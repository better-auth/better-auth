import { createOTP } from "@better-auth/utils/otp";
import { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { symmetricDecrypt } from "../../crypto";
import { getTestInstance } from "../../test-utils/test-instance";
import { twoFactor, twoFactorClient } from ".";

/** @see https://github.com/better-auth/better-auth/pull/8915#discussion_r3968096864 */
it.runIf(process.env.BETTER_AUTH_TEST_POSTGRES_URL)(
	"serializes concurrent activations with a real PostgreSQL row lock",
	async () => {
		const postgresURL = process.env.BETTER_AUTH_TEST_POSTGRES_URL;
		if (!postgresURL)
			throw new Error(
				"Set BETTER_AUTH_TEST_POSTGRES_URL to an isolated PostgreSQL test server",
			);
		const enabled = vi.fn();
		const { auth, db, client, testUser, signInWithTestUser } =
			await getTestInstance(
				{ plugins: [twoFactor({ onTotpEnabled: enabled })] },
				{
					testWith: "postgres",
					postgresURL,
					transaction: true,
					clientOptions: { plugins: [twoFactorClient()] },
				},
			);
		const { headers, user } = await signInWithTestUser();
		expect(
			(
				await client.twoFactor.enable(
					{ password: testUser.password },
					{ headers },
				)
			).error,
		).toBeNull();
		const context = await auth.$context;
		const factor = await db.findOne<{ secret: string }>({
			model: "twoFactor",
			where: [{ field: "userId", value: user.id }],
		});
		const code = await createOTP(
			await symmetricDecrypt({
				key: context.secretConfig,
				data: factor!.secret,
			}),
		).totp();
		let release!: () => void;
		let acquired!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const locked = new Promise<void>((resolve) => {
			acquired = resolve;
		});
		const transaction = context.adapter.transaction.bind(context.adapter);
		let held = false;
		vi.spyOn(context.adapter, "transaction").mockImplementation((operation) =>
			transaction(async (adapter) => {
				const incrementOne = adapter.incrementOne.bind(adapter);
				adapter.incrementOne = async <T>(
					input: Parameters<typeof incrementOne>[0],
				) => {
					const result = await incrementOne<T>(input);
					if (
						input.model === "user" &&
						input.increment.twoFactorVersion &&
						!held
					) {
						held = true;
						acquired();
						await gate;
					}
					return result;
				};
				return operation(adapter);
			}),
		);
		const inspector = new Pool({ connectionString: postgresURL });
		const first = client.twoFactor.verifyTotp({ code }, { headers });
		let second: ReturnType<typeof client.twoFactor.verifyTotp> | undefined;
		try {
			await locked;
			second = client.twoFactor.verifyTotp({ code }, { headers });
			await expect
				.poll(async () =>
					Number(
						(
							await inspector.query(
								"SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%twoFactorVersion%' ",
							)
						).rows[0].count,
					),
				)
				.toBeGreaterThan(0);
		} finally {
			release();
			await inspector.end();
		}
		const results = await Promise.all([first, second!]);
		expect(results.filter((result) => !result.error)).toHaveLength(1);
		expect(results.find((result) => result.error)?.error?.code).toBe(
			"SESSION_EXPIRED",
		);
		expect(enabled).toHaveBeenCalledOnce();
		expect(
			await db.findOne({
				model: "user",
				where: [{ field: "id", value: user.id }],
			}),
		).toMatchObject({ twoFactorEnabled: true });
		expect(
			await db.findOne({
				model: "twoFactor",
				where: [{ field: "userId", value: user.id }],
			}),
		).toMatchObject({ verified: true });
	},
);
