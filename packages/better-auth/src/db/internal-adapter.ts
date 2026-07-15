import type {
	AuthContext,
	BetterAuthOptions,
	InternalAdapter,
} from "@better-auth/core";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import type { InternalLogger } from "@better-auth/core/env";
import { createSessionAdapterModule } from "./internal-adapter/sessions";
import { createUserGraphAdapterMethods } from "./internal-adapter/user-graph";
import { createVerificationAdapterMethods } from "./internal-adapter/verification";
import type { DatabaseHooksEntry } from "./with-hooks";

interface InternalAdapterContext<Options extends BetterAuthOptions> {
	options: Omit<Options, "logger">;
	logger: InternalLogger;
	hooks: DatabaseHooksEntry[];
	generateId: AuthContext<Options>["generateId"];
}

export const createInternalAdapter = <Options extends BetterAuthOptions>(
	adapter: DBAdapter<Options>,
	ctx: InternalAdapterContext<Options>,
): InternalAdapter<Options> => {
	const sessionModule = createSessionAdapterModule(adapter, ctx);
	const userGraphMethods = createUserGraphAdapterMethods(adapter, ctx, {
		deleteCachedUserSessions: sessionModule.services.deleteCachedUserSessions,
		refreshUserSessions: sessionModule.methods.refreshUserSessions,
	});
	const verificationMethods = createVerificationAdapterMethods(adapter, ctx);

	return {
		...userGraphMethods,
		...sessionModule.methods,
		...verificationMethods,
	};
};
