import type { EndpointContext, InputContext } from "better-call";
import type { AuthContext } from "@better-auth/core";
import { type BetterAuthDbSchema, schema } from "@better-auth/core/db";

export type HookEndpointContext<S extends BetterAuthDbSchema<typeof schema>> =
	EndpointContext<string, any> &
		Omit<InputContext<string, any>, "method"> & {
			context: AuthContext<S> & {
				returned?: unknown;
				responseHeaders?: Headers;
			};
			headers?: Headers;
		};
