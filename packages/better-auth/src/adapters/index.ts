import {
	type AdapterFactory,
	type AdapterFactoryConfig,
	type AdapterFactoryCustomizeAdapterCreator,
	type AdapterFactoryOptions,
	type AdapterTestDebugLogs,
	type CustomAdapter,
	createAdapterFactory,
	initGetDefaultFieldName,
	initGetDefaultModelName,
	initGetFieldAttributes,
	initGetFieldName,
	initGetIdField,
	initGetModelName,
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
export {
	createAdapterFactory,
	initGetDefaultFieldName,
	initGetDefaultModelName,
	initGetFieldName,
	initGetModelName,
	initGetFieldAttributes,
	initGetIdField,
};

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
