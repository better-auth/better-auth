import type {
	Adapter,
	AdapterInstance,
	BetterAuthOptions,
	Where,
} from "../../types";

/**
 * Parameters passed to adapter router callbacks
 */
export type AdapterRouterParams = {
	modelName: string;
	fallbackAdapter: Adapter;
} & (
	| {
			operation: "create";
			data?: {
				model: string;
				data: Omit<Record<string, any>, "id">;
				select?: string[];
				forceAllowId?: boolean;
			};
	  }
	| {
			operation: "findOne";
			data?: {
				model: string;
				where: Where[];
				select?: string[];
			};
	  }
	| {
			operation: "findMany";
			data?: {
				model: string;
				where?: Where[];
				limit?: number;
				sortBy?: {
					field: string;
					direction: "asc" | "desc";
				};
				offset?: number;
			};
	  }
	| {
			operation: "update";
			data?: {
				model: string;
				where: Where[];
				update: Record<string, any>;
			};
	  }
	| {
			operation: "updateMany";
			data?: {
				model: string;
				where: Where[];
				update: Record<string, any>;
			};
	  }
	| {
			operation: "delete";
			data?: {
				model: string;
				where: Where[];
			};
	  }
	| {
			operation: "deleteMany";
			data?: {
				model: string;
				where: Where[];
			};
	  }
	| {
			operation: "count";
			data?: {
				model: string;
				where?: Where[];
			};
	  }
);

/**
 * Adapter router callback function
 * Returns an adapter instance, Promise<adapter instance>, or null/undefined to continue to next route
 */
export type AdapterRouterCallback = (
	params: AdapterRouterParams,
) =>
	| AdapterInstance
	| Promise<AdapterInstance | null | undefined>
	| null
	| undefined;

/**
 * Configuration for the simplified adapter router
 */
export interface AdapterRouterConfig {
	/**
	 * The fallback/main adapter that handles all models by default
	 */
	fallbackAdapter: AdapterInstance;

	/**
	 * Array of routing callbacks evaluated in order
	 * Each callback receives `{ modelName, data, operation, fallbackAdapter }` and can return:
	 * - An Adapter instance to use for this request
	 * - null/undefined to continue to the next route
	 *
	 * First matching route wins. If no routes match, fallbackAdapter is used.
	 *
	 * @example
	 * ```ts
	 * [
	 *   // Premium users get premium storage
	 *   ({ data }) => data?.tier === 'premium' ? premiumAdapter : null,
	 *
	 *   // Sessions go to cache
	 *   ({ modelName }) => modelName === 'session' ? cacheAdapter : null,
	 *
	 *   // Reads go to replica, writes to primary
	 *   ({ operation }) => ['findOne', 'findMany'].includes(operation) ? replicaAdapter : null,
	 * ]
	 * ```
	 */
	routes?: AdapterRouterCallback[];

	/**
	 * Optional debug logging
	 */
	debugLogs?: boolean;
}

/**
 * Creates an adapter router that routes requests to different adapters based on the model
 *
 * @param config - Router configuration
 * @returns Adapter instance function
 *
 * @example
 * ```ts
 * import { betterAuth } from "better-auth";
 * import { adapterRouter } from "better-auth/adapters/adapter-router";
 * import { prismaAdapter } from "better-auth/adapters/prisma";
 * import { redisAdapter } from "better-auth/adapters/redis";
 *
 * const prisma = prismaAdapter(prismaClient);
 * const redis = redisAdapter(redisClient);
 * const premium = premiumAdapter(premiumDb);
 *
 * export const auth = betterAuth({
 *   database: adapterRouter({
 *     fallbackAdapter: prisma,
 *     routes: [
 *       // Premium users get premium storage
 *       ({ data }) => data?.tier === 'premium' ? premium : null,
 *
 *       // Sessions go to cache
 *       ({ modelName }) => modelName === 'session' ? redis : null,
 *
 *       // Reads go to replica
 *       ({ operation }) => ['findOne', 'findMany'].includes(operation) ? readReplica : null,
 *     ]
 *   })
 * });
 *
 * ```
 */
export const adapterRouter = (config: AdapterRouterConfig) => {
	return (options: BetterAuthOptions): Adapter => {
		// Initialize the fallback adapter
		const fallbackAdapter = config.fallbackAdapter(options);

		/**
		 * Gets the appropriate adapter for a given model
		 * Iterates through routes array in order, uses first match, otherwise fallback
		 */
		const getAdapterForModel = async (
			model: string,
			operation:
				| "create"
				| "findOne"
				| "findMany"
				| "update"
				| "updateMany"
				| "delete"
				| "deleteMany"
				| "count",
			data?: any,
		): Promise<Adapter> => {
			const routes = config.routes || [];

			// Try each route in order until one returns an adapter
			for (let i = 0; i < routes.length; i++) {
				const routeCallback = routes[i];
				const adapter = await routeCallback({
					modelName: model,
					data,
					operation,
					fallbackAdapter,
				});

				if (adapter) {
					if (config.debugLogs) {
						console.log(
							`[AdapterRouter] Route ${i} matched for model "${model}": ${adapter.name}`,
						);
					}
					return adapter(options);
				}
			}

			// No routes matched, use fallback adapter
			if (config.debugLogs) {
				console.log(
					`[AdapterRouter] Using fallback adapter for model "${model}": ${fallbackAdapter.id}`,
				);
			}

			return fallbackAdapter;
		};

		return {
			id: "adapter-router",

			create: async (data) => {
				const adapter = await getAdapterForModel(
					data.model,
					"create",
					data.data,
				);
				return await adapter.create(data);
			},

			findOne: async (data) => {
				const adapter = await getAdapterForModel(
					data.model,
					"findOne",
					data.where,
				);
				return await adapter.findOne(data);
			},

			findMany: async (data) => {
				const adapter = await getAdapterForModel(
					data.model,
					"findMany",
					data.where,
				);
				return await adapter.findMany(data);
			},

			count: async (data) => {
				const adapter = await getAdapterForModel(data.model, "count");
				return await adapter.count(data);
			},

			update: async (data) => {
				const adapter = await getAdapterForModel(data.model, "update", {
					where: data.where,
					update: data.update,
				});
				return await adapter.update(data);
			},

			updateMany: async (data) => {
				const adapter = await getAdapterForModel(data.model, "updateMany", {
					where: data.where,
					update: data.update,
				});
				return await adapter.updateMany(data);
			},

			delete: async (data) => {
				const adapter = await getAdapterForModel(
					data.model,
					"delete",
					data.where,
				);
				return await adapter.delete(data);
			},

			deleteMany: async (data) => {
				const adapter = await getAdapterForModel(
					data.model,
					"deleteMany",
					data.where,
				);
				return await adapter.deleteMany(data);
			},

			createSchema: async (options, file) => {
				// Use the fallback adapter for schema creation
				if (fallbackAdapter.createSchema) {
					return await fallbackAdapter.createSchema(options, file);
				}

				throw new Error(
					"[AdapterRouter] Fallback adapter does not support schema creation",
				);
			},

			options: {
				fallbackAdapter: config.fallbackAdapter,
				routes: config.routes,
				debugLogs: config.debugLogs,
			},
		};
	};
};
