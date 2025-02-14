import type { AuthContext } from "../init";

export const shimContext = <T extends Record<string, any>>(
	originalObject: T,
	newContext: Record<string, any>,
) => {
	const shimmedObj: Record<string, any> = {};
	for (const [key, value] of Object.entries(originalObject)) {
		shimmedObj[key] = (ctx: Record<string, any>) => {
			return value({
				...ctx,
				context: {
					...newContext,
					...ctx.context,
				},
			});
		};
		shimmedObj[key].path = value.path;
		shimmedObj[key].method = value.method;
		shimmedObj[key].options = value.options;
		shimmedObj[key].headers = value.headers;
	}
	return shimmedObj as T;
};

export const shimEndpoint = (ctx: AuthContext, value: any) => {
	return async (context: any) => {
		for (const plugin of ctx.options.plugins || []) {
			if (plugin.hooks?.before) {
				for (const hook of plugin.hooks.before) {
					const match = hook.matcher({
						...context,
						...value,
					});
					if (match) {
						const hookRes = await hook.handler(context);
						if (
							hookRes &&
							typeof hookRes === "object" &&
							"context" in hookRes
						) {
							context = {
								...context,
								...(hookRes.context as any),
								...value,
							};
						}
					}
				}
			}
		}
		//@ts-ignore
		const endpointRes = value({
			...context,
			context: {
				...ctx,
				...context.context,
			},
		});
		let response = endpointRes;
		for (const plugin of ctx.options.plugins || []) {
			if (plugin.hooks?.after) {
				for (const hook of plugin.hooks.after) {
					const match = hook.matcher(context);
					if (match) {
						const obj = Object.assign(context, {
							returned: endpointRes,
						});
						const hookRes = await hook.handler(obj);
						if (
							hookRes &&
							typeof hookRes === "object" &&
							"response" in hookRes
						) {
							response = hookRes.response as any;
						}
					}
				}
			}
		}
		return response;
	};
};
