import { defineRequestState } from "@better-auth/core/context";

const { get: getBearerAuthenticated, set: setBearerAuthenticated } =
	defineRequestState(() => false);

export { getBearerAuthenticated, setBearerAuthenticated };
