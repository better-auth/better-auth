import {
	createAdapterFactory,
	type AdapterFactory,
	type AdapterFactoryOptions,
	type AdapterDebugLogs,
	type AdapterTestDebugLogs,
	type AdapterFactoryConfig,
	type CustomAdapter,
	type AdapterFactoryCustomizeAdapterCreator,
} from "./adapter-factory";

export type {
	AdapterFactoryOptions,
	AdapterFactory,
	AdapterDebugLogs,
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
