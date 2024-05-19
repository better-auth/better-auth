import type { BetterAuthOptions } from "../options";
import type {
	Context,
	GenericHandler,
	HandlerHooks,
	InternalResponse,
} from "../routes/types";

export interface BetterAuthPlugin {
	/**
	 * The unique identifier of the plugin.
	 * This will be used to redirect requests that starts with
	 * the plugin id.
	 */
	id: string;
	/**
	 * The name of the plugin.
	 */
	name: string;
	/**
	 * The version of the plugin.
	 */
	version: string;
	/**
	 * The handler of the plugin. This will be the main
	 * function that will be called if the request matches the
	 * plugin id.
	 */
	handler?: GenericHandler;
	/**
	 * Handler hooks
	 */
	hooks?: HandlerHooks;
	/**
	 * If the hook should be executed before or after
	 * better-auth internal plugins.
	 */
	order?: "pre" | "post" | null;
	getActions?: (options: BetterAuthOptions) => {
		[key: string]: (request: Request | Headers, input: any) => any;
	};
	getClient?: () => {
		[key: string]: (input: any) => any;
	};
	options?: any;
}

export type BeforeHookHandler<T extends Context = Context> = (
	ctx: T,
) => Promise<
	| {
			response?: InternalResponse;
			context?: Context;
	  }
	| undefined
	| null
>;
export type AfterHookHandler<T extends Context = Context> = (
	/**
	 * The context of the request.
	 */
	ctx: T,
	/**
	 * The response from the main function.
	 */
	response: InternalResponse,
) => Promise<
	| {
			response?: InternalResponse;
			context?: Context;
	  }
	| undefined
	| null
>;
