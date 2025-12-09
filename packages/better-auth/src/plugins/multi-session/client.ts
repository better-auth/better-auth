import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { DBFieldAttribute } from "@better-auth/core/db";
import type { multiSession } from ".";

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
	} satisfies BetterAuthClientPlugin;
};

export type { MultiSessionConfig } from "./index";
