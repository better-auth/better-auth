import type { AuthContext } from "../init";
import type { Prettify } from "../types/helper";

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

type Last<T extends any[]> = T extends [...infer I, infer L]
	? L
	: T extends [...infer I, (infer L)?]
		? L | undefined
		: never;
type Rest<T extends any[]> = T extends [...infer I, infer L]
	? I
	: T extends [...infer I, (infer L)?]
		? I
		: never;
type LastParameter<F extends (...args: any) => any> = Last<Parameters<F>>;
type RestParameter<F extends (...args: any) => any> = Rest<Parameters<F>>;

export type InferShimLastParamResult<
	T extends Record<string, (...args: any[]) => any>,
	P extends LastParameter<T[keyof T]>,
	Omit extends boolean = false,
> = Prettify<ReturnType<typeof shimLastParam<T, P, Omit>>>;

export const shimLastParam = <
	T extends Record<string, (...args: any[]) => any>,
	P extends LastParameter<T[keyof T]>,
	Omit extends boolean = false,
>(
	obj: T,
	shim: P,
	shouldOmit: Omit = false as Omit,
) => {
	const out: Partial<Record<keyof T, any>> = {};

	for (const key in obj) {
		const fn = obj[key] as any;
		out[key] = (...args: any[]) => {
			if (args.length < fn.length) {
				return fn(...args, shim);
			}
			return fn(...args);
		};
	}

	return out as {
		[K in keyof T]: (
			...args: Omit extends true
				? RestParameter<T[K]>
				: [...RestParameter<T[K]>, LastParameter<T[K]>?]
		) => ReturnType<T[K]>;
	};
};
