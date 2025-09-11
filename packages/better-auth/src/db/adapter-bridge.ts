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
type AdapterBridgeMethods = Record<
	string,
	(
		ctx: AdapterBridgeContext,
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

export type AdapterBridgeOptions<ID extends LiteralString = LiteralString> = {
	id: ID;
	adapter: Adapter;
	staticMethods?: Record<string, (...args: any[]) => any>;
	methods: AdapterBridgeMethods;
	getTransactionContext?: GetTransactionContextHandler<ID>;
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

export type AdapterBridge<O extends AdapterBridgeOptions> =
	InferAdapterBridgeMethods<O["methods"]> & ([O["omitStaticMethods"]] extends [true] ? {} : {
		withTransaction: <R>(
			cb: (
				trx: Prettify<
					{
						adapter: TransactionAdapter;
					} & Record<O["id"], InferAdapterBridgeMethods<O["methods"]>> &
						InferAdditionalTransactionContext<O>
				>,
			) => Promise<R>,
		) => Promise<R>;
	} & O["staticMethods"]);

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
	O extends AdapterBridgeOptions<ID>
>(
	bridge: O & { id: ID },
): AdapterBridge<O> => {
	const staticMethods = {
		withTransaction: async <R>(cb: (trx: any) => Promise<R>): Promise<R> => {
			return bridge.adapter.transaction((trxAdapter) => {
				const trx: AdapterBridgeContext & Record<string, any> = {
					adapter: trxAdapter,
					[bridge.id]: shimLastParam(methods, trxAdapter, isTransactionAdapter),
				};

				return cb({
					...trx,
					...(bridge.getTransactionContext?.(trx) ?? {}),
				});
			});
		},
		...bridge.staticMethods,
	}
	const methods: any = {};

	for (const key in bridge.methods) {
		methods[key] = (...args: any[]) => {
			const maybeTrx = args[args.length - 1];
			const hasTrx = isTransactionAdapter(maybeTrx);

			const ctx: AdapterBridgeContext = {
				adapter: hasTrx ? maybeTrx : bridge.adapter,
			};
			const fn = bridge.methods[key](ctx);
			const finalArgs = hasTrx ? args.slice(0, -1) : args;

			return fn(...finalArgs);
		};
	}

	return {
		...methods,
		...(!bridge.omitStaticMethods ? staticMethods : {}),
	};
};
createAdapterBridge.create = <
	ID extends LiteralString,
	O extends Omit<AdapterBridgeOptions<ID>, "adapter">,
>(
	context: AuthContext,
	bridge: O & { id: ID },
) => {
	return createAdapterBridge({
		...bridge,
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
				...((bridge.getTransactionContext?.(ctx) ??
					{}) as InferAdditionalTransactionContext<O>),
			};
		},
	});
};

const x = createAdapterBridge.create({} as any, {
	id: "testBridge",
	methods: {
		test: () => {},
	}
})

x.withTransaction(async (trx) => {
	
})