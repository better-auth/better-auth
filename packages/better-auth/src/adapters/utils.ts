import { z } from "zod";
import type { FieldAttributes, InternalFieldAttributes } from "./types";

export function toInternalFields(fields: Record<string, any>) {
	const internalFields: Record<string, InternalFieldAttributes> = {};
	for (const field in fields) {
		const { type, required, returned, hashValue } = fields[
			field
		] as FieldAttributes;
		internalFields[field] = {
			required: required ?? false,
			returned: returned ?? true,
			hashValue: hashValue ?? false,
			validator: z[type](),
		};
	}
	return internalFields;
}

export function getSelectFields(
	fields: {
		[key: string]: FieldAttributes;
	},
	table: "session" | "user" | "account",
) {
	const select = Object.keys(fields).filter((column) => {
		return fields[column]?.returned !== false;
	});
	const defaultSelect = {
		session: ["id", "userId", "expiresAt"],
		user: ["id", "email", "emailVerified"],
		account: ["providerId", "accountId", "userId"],
	};
	return [...defaultSelect[table], ...select];
}
