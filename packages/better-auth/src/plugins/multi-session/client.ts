import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { DBFieldAttribute } from "@better-auth/core/db";
import type { multiSession } from ".";
import { MULTI_SESSION_ERROR_CODES } from "./error-codes";

export * from "./error-codes";

export type MultiSessionClientOptions = {
	schema?:
		| {
				user?:
					| {
							additionalFields?: Record<string, DBFieldAttribute> | undefined;
					  }
					| undefined;
				session?:
					| {
							additionalFields?: Record<string, DBFieldAttribute> | undefined;
					  }
					| undefined;
		  }
		| undefined;
};

export const multiSessionClient = <O extends MultiSessionClientOptions>(
	options?: O | undefined,
) => {
	return {
		id: "multi-session",
		$InferServerPlugin: {} as ReturnType<typeof multiSession<O>>,
		atomListeners: [
			{
				matcher(path) {
					return path === "/multi-session/set-active";
				},
				signal: "$sessionSignal",
			},
		],
		$ERROR_CODES: MULTI_SESSION_ERROR_CODES,
	} satisfies BetterAuthClientPlugin;
};

export type { MultiSessionConfig } from "./index";
