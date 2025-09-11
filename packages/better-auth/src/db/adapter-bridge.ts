import { shimLastParam } from "../utils/shim";
import type { LiteralString, Prettify } from "../types/helper";
import type { Adapter, AuthContext, TransactionAdapter } from "../types";
import { createInternalAdapter } from "./internal-adapter";

type AdapterBridgeContext = {
	adapter: TransactionAdapter;
};

type WithTrx<F extends (...args: any[]) => any> = F &
	((
		...args: [...Parameters<F>, trxAdapter?: TransactionAdapter]
	) => ReturnType<F>);

type InferAdapterBridgeMethods<T extends AdapterBridgeMethods> = {
	[K in keyof T]: WithTrx<ReturnType<T[K]>>;
};
type AdapterBridgeMethods<O extends Omit<AdapterBridgeOptions, "adapter"> = Omit<AdapterBridgeOptions, "adapter">> = Record<
	string,
	(
		ctx: AdapterBridgeContext & InferAdditionalBridgeContext<O["getBridgeContext"]>,
	) => any extends infer S
		? S extends (...args: any[]) => any
			? S
			: never
		: never
>;

type GetTransactionContextHandler<
	ID extends LiteralString = LiteralString,
	R extends Record<string, any> | void = Record<string, any> | void,
> = (
	ctx: AdapterBridgeContext &
		Record<ID, Record<string, (...args: any[]) => any>>,
) => R;

type GetBridgeContextHandler<R extends Record<string, any> | void = Record<string, any> | void> = (ctx: AdapterBridgeContext) => R;

export type AdapterBridgeOptions<ID extends LiteralString = LiteralString> = {
	id: ID;
	getTransactionContext?: GetTransactionContextHandler<ID>;
	getBridgeContext?: GetBridgeContextHandler;
	omitStaticMethods?: boolean;
};

type InferAdditionalTransactionContext<
	O extends {
		id: AdapterBridgeOptions["id"];
		getTransactionContext?: AdapterBridgeOptions["getTransactionContext"];
	},
> = O["getTransactionContext"] extends GetTransactionContextHandler<
	O["id"],
	infer R
>
	? R extends Record<string, any>
		? R
		: {}
	: {};

type InferAdditionalBridgeContext<T> = T extends GetBridgeContextHandler<infer R> ? R extends Record<string,any> ? R : {} : {};

export type AdapterBridge<O extends AdapterBridgeOptions, M extends {
	staticMethods?: Record<string, (...args: any[]) => any>;
	methods: AdapterBridgeMethods;
}> =
	InferAdapterBridgeMethods<M["methods"]> & ([O["omitStaticMethods"]] extends [true] ? {} : {
		withTransaction: <R>(
			cb: (
				trx: Prettify<
					{
						adapter: TransactionAdapter;
					} & Record<O["id"], InferAdapterBridgeMethods<M["methods"]>> &
						InferAdditionalTransactionContext<O>
				>,
			) => Promise<R>,
		) => Promise<R>;
	} & M["staticMethods"]);

const isTransactionAdapter = (value: any): value is TransactionAdapter => {
	return (
		!!value &&
		typeof value === "object" &&
		typeof value.id === "string" &&
		["findOne", "findMany", "update", "delete"].every(
			(key) => typeof value[key] === "function",
		)
	);
};

export const createAdapterBridge = <
	ID extends LiteralString,
	O extends AdapterBridgeOptions<ID>,
	M extends {
		staticMethods?: Record<string, (...args: any[]) => any>;
		methods: AdapterBridgeMethods<O>;
	}
>(
	options: O & { id: ID; adapter: Adapter },
	data: M,
): AdapterBridge<O, M> => {
	const staticMethods = {
		withTransaction: async <R>(cb: (trx: any) => Promise<R>): Promise<R> => {
			return options.adapter.transaction((trxAdapter) => {
				const trx: AdapterBridgeContext & Record<string, any> = {
					adapter: trxAdapter,
					[options.id]: shimLastParam(methods, trxAdapter, isTransactionAdapter),
				};

				return cb({
					...trx,
					...(options.getTransactionContext?.(trx) ?? {}),
				});
			});
		},
		...data.staticMethods,
	}
	const methods: any = {};

	for (const key in data.methods) {
		methods[key] = (...args: any[]) => {
			const maybeTrx = args[args.length - 1];
			const hasTrx = isTransactionAdapter(maybeTrx);

			let ctx: any = {
				adapter: hasTrx ? maybeTrx : options.adapter,
			};
			ctx = {
				...ctx,
				...(options.getBridgeContext?.(ctx) ?? {}),
			};
			const fn = data.methods[key](ctx);
			const finalArgs = hasTrx ? args.slice(0, -1) : args;

			return fn(...finalArgs);
		};
	}

	return {
		...methods,
		...(!options.omitStaticMethods ? staticMethods : {}),
	};
};
createAdapterBridge.create = <
	ID extends LiteralString,
	O extends AdapterBridgeOptions<ID>,
	M extends {
		staticMethods?: Record<string, (...args: any[]) => any>;
		methods: AdapterBridgeMethods<O>;
	}
>(
	context: AuthContext,
	options: O & { id: ID },
	data: M,
) => {
	const opts = {
		...options,
		adapter: context.adapter,
		getTransactionContext: (ctx) => {
			return {
				internalAdapter: createInternalAdapter(
					ctx.adapter,
					{
						options: context.options,
						generateId: context.generateId,
						hooks: context.options.databaseHooks
							? [context.options.databaseHooks]
							: [],
						logger: context.logger,
					},
					true,
				),
				...((options.getTransactionContext?.(ctx) ??
					{}) as InferAdditionalTransactionContext<O>),
			};
		},
	} satisfies AdapterBridgeOptions
	return createAdapterBridge(opts, data);
};
