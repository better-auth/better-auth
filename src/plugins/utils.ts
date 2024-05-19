import type { BetterAuthOptions } from "../options";
import type {
	Context,
	GenericHandler,
	HandlerHooks,
	InternalResponse,
} from "../routes/types";
import { CSRFCheckPlugin } from "./csrf-check";
import type {
	AfterHookHandler,
	BeforeHookHandler,
	BetterAuthPlugin,
} from "./types";

export const getPlugins = (options: BetterAuthOptions) => {
	const plugins: {
		post: BetterAuthPlugin[];
		pre: BetterAuthPlugin[];
		unordered: BetterAuthPlugin[];
	} = {
		post: [],
		pre: [],
		unordered: [],
	};
	for (const plugin of options.plugins || []) {
		plugins[plugin.order || "unordered"].push(plugin);
	}
	const internalPlugins = [CSRFCheckPlugin()];
	return [
		...plugins.pre,
		...plugins.unordered,
		...internalPlugins,
		...plugins.post,
	];
};

export const usePlugins = (context: Context, ignorePlugins?: string[]) => {
	const plugins = context.plugins.filter(
		(pl) => pl.hooks && !ignorePlugins?.includes(pl.id),
	);
	const hooks = plugins.map((plugin) => {
		return plugin.hooks as HandlerHooks;
	});
	const before: BeforeHookHandler[] = [];
	const after: AfterHookHandler[] = [];
	for (const hook of hooks) {
		if (hook.matcher(context)) {
			hook.before && before.push(hook.before);
			hook.after && after.push(hook.after);
		}
	}
	return {
		before: async (context: Context) => {
			let ctx: Context | undefined = context;
			let response: InternalResponse | undefined;
			for (const hook of before) {
				const res = await hook(ctx);
				if (res?.context) {
					ctx = res.context;
				}
				if (res?.response) {
					response = res.response;
					break;
				}
			}
			return {
				context: ctx,
				response,
			};
		},
		after: async (context: Context, fnResponse: InternalResponse) => {
			let ctx: Context | undefined = context;
			let response: InternalResponse | undefined;
			for (const hook of after) {
				const res = await hook(ctx, fnResponse);
				if (res?.context) {
					ctx = res.context;
				}
				if (res?.response) {
					response = res.response;
					break;
				}
			}
			return {
				context: ctx,
				response,
			};
		},
	};
};

export const withPlugins = <T extends GenericHandler<any, any, any>>(
	fn: T,
	/**
	 * A list of plugins id to ignore.
	 */
	ignorePlugins?: string[],
) => {
	return async (ctx: Parameters<T>["0"]) => {
		const { before, after } = usePlugins(ctx, ignorePlugins);
		const { context, response } = await before(ctx);
		if (response) {
			return response;
		}
		const res = await fn(context);
		const { response: afterResponse } = await after(context, res);
		if (afterResponse) {
			return afterResponse;
		}
		return res as ReturnType<T>;
	};
};
