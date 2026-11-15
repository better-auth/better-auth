import type { GenericEndpointContext } from "@better-auth/core";
import { createHMAC } from "@better-auth/utils/hmac";
import type { FirstPartyAuthFailureRow } from "./schema";

const MODEL = "firstPartyAuthFailure";

export interface ResolvedBudget {
	window: number;
	max: number;
}

/**
 * The counter key for an account and method, or a client. Keyed with the
 * server secret so stored keys reveal neither user IDs nor login hints.
 */
export async function budgetKey(
	ctx: GenericEndpointContext,
	subject:
		| { userId: string; method: string }
		| { identifier: string; method: string }
		| { clientId: string },
): Promise<string> {
	const data =
		"clientId" in subject
			? `client:${subject.clientId}`
			: "userId" in subject
				? `user:${subject.userId}:${subject.method}`
				: `hint:${subject.identifier}:${subject.method}`;
	return createHMAC("SHA-256", "base64urlnopad").sign(ctx.context.secret, data);
}

/** Whether the counter under `key` has spent its budget in the current window. */
export async function isBudgetSpent(
	ctx: GenericEndpointContext,
	key: string,
	budget: ResolvedBudget,
): Promise<boolean> {
	const row = await ctx.context.adapter.findOne<FirstPartyAuthFailureRow>({
		model: MODEL,
		where: [{ field: "key", value: key }],
	});
	return (
		!!row &&
		new Date(row.resetAt).getTime() > Date.now() &&
		row.count >= budget.max
	);
}

/** Counts one failure under `key`, starting a new window when the last ended. */
export async function recordFailure(
	ctx: GenericEndpointContext,
	key: string,
	budget: ResolvedBudget,
): Promise<void> {
	const adapter = ctx.context.adapter;
	const now = new Date();
	const inWindow = await adapter.incrementOne<FirstPartyAuthFailureRow>({
		model: MODEL,
		where: [
			{ field: "key", value: key },
			{ field: "resetAt", operator: "gt", value: now },
		],
		increment: { count: 1 },
	});
	if (inWindow) return;
	const resetAt = new Date(now.getTime() + budget.window * 1000);
	const restarted = await adapter.incrementOne<FirstPartyAuthFailureRow>({
		model: MODEL,
		where: [
			{ field: "key", value: key },
			{ field: "resetAt", operator: "lte", value: now },
		],
		increment: {},
		set: { count: 1, resetAt },
	});
	if (restarted) return;
	try {
		await adapter.create({
			model: MODEL,
			data: { key, count: 1, resetAt },
		});
	} catch {
		// A concurrent failure created the row first; count this one in it.
		await adapter.incrementOne({
			model: MODEL,
			where: [{ field: "key", value: key }],
			increment: { count: 1 },
		});
	}
}
