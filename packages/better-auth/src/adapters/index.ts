import type {
	AdapterFactory,
	AdapterFactoryConfig,
	AdapterFactoryCustomizeAdapterCreator,
	AdapterFactoryOptions,
	AdapterTestDebugLogs,
	CustomAdapter,
} from "@better-auth/core/db/adapter";
import {
	createAdapterFactory,
	initGetDefaultFieldName,
	initGetDefaultModelName,
	initGetFieldAttributes,
	initGetFieldName,
	initGetIdField,
	initGetModelName,
} from "@better-auth/core/db/adapter";

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
 * @deprecated Use `createAdapterFactory` instead.
 */
export const createAdapter = createAdapterFactory;

/**
 * @deprecated Use `AdapterFactoryOptions` instead.
 */
export type CreateAdapterOptions = AdapterFactoryOptions;

/**
 * @deprecated Use `AdapterFactoryConfig` instead.
 */
export type AdapterConfig = AdapterFactoryConfig;

/**
 * @deprecated Use `AdapterFactoryCustomizeAdapterCreator` instead.
 */
export type CreateCustomAdapter = AdapterFactoryCustomizeAdapterCreator;
