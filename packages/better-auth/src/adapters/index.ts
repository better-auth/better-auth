import type {
	AdapterFactory,
	AdapterFactoryConfig,
	AdapterFactoryCustomizeAdapterCreator,
	AdapterFactoryOptions,
	AdapterTestDebugLogs,
	CustomAdapter,
} from "@better-auth/core/db/adapter";
import {
	anyModelUsesNumberId,
	createAdapterFactory,
	createIsNumberIdModel,
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
	createIsNumberIdModel,
	anyModelUsesNumberId,
	initGetDefaultFieldName,
	initGetDefaultModelName,
	initGetFieldName,
	initGetModelName,
	initGetFieldAttributes,
	initGetIdField,
};
