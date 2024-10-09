import type { BetterAuthOptions } from "./options";

/**
 * Adapter where clause
 */
export type Where = {
	operator?: "eq" | "ne" | "lt" | "lte" | "gt" | "gte"; //eq by default
	value: string;
	field: string;
	connector?: "AND" | "OR"; //AND by default
};

/**
 * Adapter Interface
 */
export interface Adapter {
	id: string;
	create: <T, R = T>(data: {
		model: string;
		data: T;
		select?: string[];
	}) => Promise<R>;
	findOne: <T>(data: {
		model: string;
		where: Where[];
		select?: string[];
	}) => Promise<T | null>;
	findMany: <T>(data: {
		model: string;
		where?: Where[];
	}) => Promise<T[]>;
	update: <T>(data: {
		model: string;
		where: Where[];
		update: Record<string, any>;
	}) => Promise<T | null>;
	delete: <T>(data: { model: string; where: Where[] }) => Promise<void>;
	/**
	 *
	 * @param options
	 * @param file - file path if provided by the user
	 * @returns
	 */
	createSchema?: (
		options: BetterAuthOptions,
		file?: string,
	) => Promise<{
		code: string;
		fileName: string;
		append?: boolean;
		overwrite?: boolean;
	}>;
	options?: Record<string, any>;
}

export interface SecondaryStorage {
	get: (key: string) => Promise<string | null> | string | null;
	set: (
		key: string,
		value: string,
		ttl: number,
	) => Promise<void | null | string> | void;
	delete: (key: string) => Promise<void | null | string> | void;
}
