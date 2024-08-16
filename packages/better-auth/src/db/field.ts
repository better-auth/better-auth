export const createFieldAttribute = <
	T extends ValueType,
	C extends FieldAttribute<T>["config"],
>(
	type: T,
	config?: C,
) => {
	return {
		type,
		...config,
	};
};

export interface FieldAttribute<T extends ValueType = any> {
	type: T;
	config?: {
		defaultValue?: InferValueType<T>;
		transform?: (value: InferValueType<T>) => InferValueType<T>;
	};
}

export type ValueType = "string" | "number" | "boolean" | "date" | "json";

export type InferValueType<T extends ValueType> = T extends "string"
	? string
	: T extends "number"
		? number
		: T extends "boolean"
			? boolean
			: T extends "date"
				? Date
				: T extends "json"
					? Record<string, any>
					: never;
