import type { DBFieldAttribute } from "@better-auth/core/db";
import type { ZodTypeAny, z } from "zod";

/**
 * Maps a single Zod type (z.ZodString, etc.) to a DBFieldType string ("string", etc.)
 */
type MapZodType<T extends ZodTypeAny> = T extends z.ZodString
	? "string"
	: T extends z.ZodNumber
		? "number"
		: T extends z.ZodBoolean
			? "boolean"
			: T extends z.ZodDate
				? "date"
				: T extends z.ZodArray<infer E>
					? E extends z.ZodString
						? "string[]"
						: E extends z.ZodNumber
							? "number[]"
							: "json"
					: "json";

type GetCoreZodType<T extends ZodTypeAny> = T extends z.ZodOptional<
	infer U extends ZodTypeAny
>
	? GetCoreZodType<U>
	: T extends z.ZodNullable<infer U extends ZodTypeAny>
		? GetCoreZodType<U>
		: T extends z.ZodDefault<infer U extends ZodTypeAny>
			? GetCoreZodType<U>
			: T;

type IsZodTypeRequired<T extends ZodTypeAny> = T extends z.ZodOptional<any>
	? false
	: T extends z.ZodNullable<any>
		? false
		: T extends z.ZodDefault<any>
			? false
			: true;

export type ZodSchemaToDBFields<T extends z.ZodObject<any>> = {
	[Key in keyof T["shape"]]: DBFieldAttribute<
		MapZodType<GetCoreZodType<T["shape"][Key]>>
	> & {
		required: IsZodTypeRequired<T["shape"][Key]>;
		input: true;
		returned: true;
	};
};
