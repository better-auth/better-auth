import type { DBFieldAttribute, DBFieldType } from "@better-auth/core/db";
import { z } from "zod";

export function isZodObject(value: unknown): value is z.ZodObject<any> {
	if (!!value && typeof value === "object") {
		const typeName = (value as any)?._def?.typeName;
		if (typeof typeName === "string") return typeName === "ZodObject";
	}
	try {
		return value instanceof z.ZodObject;
	} catch {
		return false;
	}
}

export function isZodType(value: unknown): value is z.ZodTypeAny {
	if (!!value && typeof value === "object") {
		const typeName = (value as any)?._def?.typeName;
		if (typeof typeName === "string") return true;
		if (typeof (value as any).parse === "function") return true;
	}
	try {
		return value instanceof z.ZodType;
	} catch {
		return false;
	}
}

export function fromZodSchema(
	schema: z.ZodObject<any>,
): Record<string, DBFieldAttribute> {
	const shape = getZodObjectShape(schema);
	const fields: Record<string, DBFieldAttribute> = {};

	for (const [key, zodType] of Object.entries(shape)) {
		fields[key] = zodTypeToDBField(zodType as z.ZodTypeAny);
	}

	return fields;
}

function getZodObjectShape(schema: z.ZodObject<any>) {
	const anySchema = schema as any;
	let maybeShape = anySchema.shape ?? anySchema._def?.shape;
	if (!maybeShape) return {};
	if (typeof maybeShape === "function") {
		try {
			return maybeShape();
		} catch {}
	}
	return maybeShape;
}

function zodTypeToDBField(zodType: z.ZodTypeAny): DBFieldAttribute {
	let isOptional = false;
	let innerType = zodType;
	let defaultValue: any = undefined;

	while (innerType && (innerType._def as any)) {
		const tn = (innerType._def as any)?.typeName;
		if (tn === "ZodOptional" || tn === "ZodNullable") {
			isOptional = true;
			innerType =
				(innerType._def as any).innerType ??
				(innerType._def as any).schema ??
				(innerType._def as any).type ??
				innerType;
			continue;
		}

		if (tn === "ZodDefault") {
			const dv = (innerType._def as any).defaultValue;
			defaultValue = typeof dv === "function" ? dv : () => dv;
			innerType =
				(innerType._def as any).innerType ??
				(innerType._def as any).schema ??
				(innerType._def as any).type ??
				innerType;
			isOptional = true;
			continue;
		}

		if (tn === "ZodEffects" || tn === "ZodPipeline") {
			innerType =
				(innerType._def as any).schema ??
				(innerType._def as any).innerType ??
				(innerType._def as any).type ??
				innerType;
			continue;
		}

		break;
	}

	let dbFieldType: DBFieldType;
	const typeName = (innerType._def as any)?.typeName;

	switch (typeName) {
		case "ZodString":
			dbFieldType = "string";
			break;
		case "ZodNumber":
			dbFieldType = "number";
			break;
		case "ZodBoolean":
			dbFieldType = "boolean";
			break;
		case "ZodDate":
			dbFieldType = "date";
			break;
		case "ZodArray":
			const element =
				(innerType._def as any).type ??
				(innerType._def as any).element ??
				(innerType._def as any).innerType;
			const elementTypeName = element?._def?.typeName;
			if (elementTypeName === "ZodString") {
				dbFieldType = "string[]";
			} else if (elementTypeName === "ZodNumber") {
				dbFieldType = "number[]";
			} else {
				dbFieldType = "json";
			}
			break;
		default:
			dbFieldType = "json";
	}

	const field: DBFieldAttribute = {
		type: dbFieldType,
		required: !isOptional && defaultValue === undefined,
		returned: true,
		input: true,
		validator: {
			input: zodType as any,
		},
	};

	if (defaultValue !== undefined) {
		field.defaultValue =
			typeof defaultValue === "function" ? defaultValue : () => defaultValue;
		field.required = false;
	}

	return field;
}
