import type { ZodSchema } from "zod";

export type InternalFieldAttributes = {
	/**
	 * if the field should be required when there is a request to create a new
	 * record
	 * @default false
	 */
	required?: boolean;
	/**
	 * If the value should be returned on a response body.
	 * @default true
	 */
	returned?: boolean;
	/**
	 * If the value should be hashed when it's stored.
	 * @default false
	 */
	hashValue?: boolean;
	/**
	 * a zod schema for validating the inputs
	 */
	validator: ZodSchema;
};

export type FieldType = "string" | "number" | "boolean" | "date";

export type FieldAttributes = {
	/**
	 * the type of the field
	 */
	type: FieldType;
	/**
	 * if the field should be required on a new record.
	 * @default false
	 */
	required?: boolean;
	/**
	 * If the value should be returned on a response body.
	 * @default true
	 */
	returned?: boolean;
	/**
	 * If the value should be hashed when it's stored.
	 * @default false
	 */
	hashValue?: boolean;
	/**
	 * transform the value before storing it.
	 */
	transform?: (value: any) => any;
};

export type BaseModel = {
	id: string;
};

export interface User extends BaseModel {
	[key: string]: any;
}

export type UserInput = Omit<User, "id">;

export interface Session extends BaseModel {
	userId: string;
	expiresAt: Date;
}

export interface Account extends BaseModel {
	userId: string;
	providerId: string;
	accountId: string;
}

export interface AccountInput extends Omit<Account, "id"> {}

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
	create: <
		T extends Record<string, any>,
		R extends Record<string, any> = T,
	>(data: {
		model: string;
		data: Record<string, any>;
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
	}) => Promise<T[] | null>;
	update: <T>(data: {
		model: string;
		where: Where[];
		update: Record<string, any>;
	}) => Promise<T>;
	delete: <T>(data: { model: string; where: Where[] }) => Promise<T>;
	/**
	 * adapter specific configuration
	 */
	config?: {
		/**
		 * the format of the date fields
		 */
		dateFormat?: "number" | "date";
		/**
		 * if the adapter will throw an error when a
		 * record already exists. If this is set to
		 * false, there will be a check if the record
		 * exists or not before creating a new one.
		 */
		failsOnRecordExist?: boolean;
	};
}

export interface SessionAdapter {
	create: (data: {
		userId: string;
		expiresAt: Date;
	}) => Promise<Session>;
	findOne: (data: { userId: string }) => Promise<Session | null>;
	update: (data: Session) => Promise<Session>;
	delete: (data: { sessionId: string }) => Promise<void>;
}
