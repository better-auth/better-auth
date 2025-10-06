import {
	createAdapterFactory,
	type AdapterFactory,
	type AdapterFactoryOptions,
	type AdapterTestDebugLogs,
	type AdapterFactoryConfig,
	type CustomAdapter,
	type AdapterFactoryCustomizeAdapterCreator,
} from "./adapter-factory";

export * from "@better-auth/core/db/adapter";

export type {
	AdapterFactoryOptions,
	AdapterFactory,
	AdapterTestDebugLogs,
	AdapterFactoryConfig,
	CustomAdapter,
	AdapterFactoryCustomizeAdapterCreator,
};

export { createAdapterFactory };

/**
 * @deprecated Use `createAdapterFactory` instead. This export will be removed in the next major version.
 */
export const createAdapter = createAdapterFactory;

/**
 * @deprecated Use `AdapterFactoryOptions` instead. This export will be removed in the next major version.
 */
export type CreateAdapterOptions = AdapterFactoryOptions;

/**
 * @deprecated Use `AdapterFactoryConfig` instead. This export will be removed in the next major version.
 */
export type AdapterConfig = AdapterFactoryConfig;

/**
 * @deprecated Use `AdapterFactoryCustomizeAdapterCreator` instead. This export will be removed in the next major version.
 */
export type CreateCustomAdapter = AdapterFactoryCustomizeAdapterCreator;
