import { z } from "zod";
import type { Context } from "../routes/types";
import type { FieldAttributes, InternalFieldAttributes } from "./types";

export function toInternalFields(fields: Record<string, any>) {
	const internalFields: Record<string, InternalFieldAttributes> = {};
	for (const field in fields) {
		const { type, required, returned, hashValue, transform } = fields[
			field
		] as FieldAttributes;
		internalFields[field] = {
			required: required ?? false,
			returned: returned ?? true,
			hashValue: hashValue ?? false,
			validator: z[type]().transform(transform || ((x) => x)),
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

export const parseUser = (data: Record<string, any>, context: Context) => {
	const user = Object.keys(data)
		.map((key) => {
			const parsed = context.user.fields[key]?.validator.safeParse(data?.[key]);
			return { key, value: parsed?.success ? parsed.data : data?.[key] };
		})
		.reduce(
			(acc, { key, value }) => {
				acc[key] = value;
				return acc;
			},
			{} as Record<string, any>,
		);
	return user;
};
