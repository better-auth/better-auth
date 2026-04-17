import { describe, expect, it } from "vitest";
import { twoFactor } from "../plugins/two-factor";
import { getTestInstance } from "../test-utils";
import { DEFAULT_SECRET } from "../utils/constants";

describe("sign-in attempt adapter primitives", () => {
	it("consumes an attempt exactly once", async () => {
		const { auth, testUser } = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [twoFactor()],
		});
		const context = await auth.$context;
		const user = await context.internalAdapter.findUserByEmail(testUser.email);
		const attempt = await context.internalAdapter.createSignInAttempt({
			userId: user!.user.id,
			expiresAt: new Date(Date.now() + 60_000),
		});
		const consumed = await context.internalAdapter.consumeSignInAttempt(
			attempt.id,
		);
		expect(consumed?.id).toBe(attempt.id);
		const again = await context.internalAdapter.consumeSignInAttempt(
			attempt.id,
		);
		expect(again).toBeNull();
	});

	it("picks a single winner under concurrent consume", async () => {
		const { auth, testUser } = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [twoFactor()],
		});
		const context = await auth.$context;
		const user = await context.internalAdapter.findUserByEmail(testUser.email);
		const attempt = await context.internalAdapter.createSignInAttempt({
			userId: user!.user.id,
			expiresAt: new Date(Date.now() + 60_000),
		});
		const [a, b] = await Promise.all([
			context.internalAdapter.consumeSignInAttempt(attempt.id),
			context.internalAdapter.consumeSignInAttempt(attempt.id),
		]);
		const winners = [a, b].filter((r) => r !== null).length;
		expect(winners).toBe(1);
	});

	it("does not delete expired rows when creating a new attempt", async () => {
		const { auth, testUser } = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [twoFactor()],
		});
		const context = await auth.$context;
		const user = await context.internalAdapter.findUserByEmail(testUser.email);
		const expired = await context.internalAdapter.createSignInAttempt({
			userId: user!.user.id,
			expiresAt: new Date(Date.now() - 60_000),
		});
		await context.internalAdapter.createSignInAttempt({
			userId: user!.user.id,
			expiresAt: new Date(Date.now() + 60_000),
		});
		const stillThere = await context.internalAdapter.findSignInAttempt(
			expired.id,
		);
		expect(stillThere?.id).toBe(expired.id);
	});
});
