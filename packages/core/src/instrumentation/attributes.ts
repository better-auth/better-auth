// Keep these stable OpenTelemetry keys local to avoid installing the full
// semantic conventions registry just for four string constants.

/** Database collection accessed by the operation. */
export const ATTR_DB_COLLECTION_NAME = "db.collection.name" as const;

/** Database operation performed by the span. */
export const ATTR_DB_OPERATION_NAME = "db.operation.name" as const;

/** HTTP response status code. */
export const ATTR_HTTP_RESPONSE_STATUS_CODE =
	"http.response.status_code" as const;

/** Matched HTTP route template. */
export const ATTR_HTTP_ROUTE = "http.route" as const;

/** Operation identifier (e.g. getSession, signUpWithEmailAndPassword). Uses endpoint operationId when set, otherwise the endpoint key. */
export const ATTR_OPERATION_ID = "better_auth.operation_id" as const;

/** Hook type (e.g. before, after, create.before). */
export const ATTR_HOOK_TYPE = "better_auth.hook.type" as const;

/** Execution context (e.g. user, plugin:id). */
export const ATTR_CONTEXT = "better_auth.context" as const;
