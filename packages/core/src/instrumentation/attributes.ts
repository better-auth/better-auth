import {
	ATTR_DB_COLLECTION_NAME,
	ATTR_DB_OPERATION_NAME,
	ATTR_HTTP_RESPONSE_STATUS_CODE,
	ATTR_HTTP_ROUTE,
} from "@opentelemetry/semantic-conventions";

export {
	ATTR_DB_COLLECTION_NAME,
	ATTR_DB_OPERATION_NAME,
	ATTR_HTTP_RESPONSE_STATUS_CODE,
	ATTR_HTTP_ROUTE,
};

/** Operation identifier (e.g. getSession, signUpWithEmailAndPassword). Uses endpoint operationId when set, otherwise the endpoint key. */
export const ATTR_OPERATION_ID = "better_auth.operation_id" as const;

/** Hook type (e.g. before, after, create.before). */
export const ATTR_HOOK_TYPE = "better_auth.hook.type" as const;

/** Execution context (e.g. user, plugin:id). */
export const ATTR_CONTEXT = "better_auth.context" as const;
