import type { Awaitable } from "@better-auth/core";
import {
	getCurrentAdapter,
	runWithTransaction,
} from "@better-auth/core/context";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import type { OrganizationOptions } from "./types";

export async function runMembershipMutation<T>(
	options: OrganizationOptions,
	input: {
		adapter: DBAdapter;
		organizationId: () => Awaitable<string | null | undefined>;
		operation: "mutation" | "invitation_acceptance";
		mutate: () => Promise<T>;
	},
): Promise<T> {
	const fence = options.withMembershipMutation;
	if (!fence) return input.mutate();
	const organizationId = await input.organizationId();
	if (!organizationId) return input.mutate();
	return runWithTransaction(input.adapter, async () =>
		fence({
			organizationId,
			database: await getCurrentAdapter(input.adapter),
			operation: input.operation,
			mutate: input.mutate,
		}),
	);
}
