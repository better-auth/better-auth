import type { InferOptionSchema } from "../../types";
import type { schema } from "./schema";

export interface LoginHistoryOptions {
	/**
	 * Custom schema for the login history plugin
	 */
	schema?: InferOptionSchema<typeof schema>;
	/**
	 * The header to use for the IP address.
	 * If not provided, it will be automatically detected from common headers.
	 */
	ipHeader?: string;
}

export interface LoginHistory {
	id: string;
	userAgent: string;
	ipAddress: string;
	createdAt: Date;
}

export interface LoginHistoryModel {
	id: string;
	userId: string;
	userAgent: string;
	ipAddress: string;
	createdAt: Date;
}
