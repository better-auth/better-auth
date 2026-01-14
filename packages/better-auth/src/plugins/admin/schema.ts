import type { InferAdditionalFieldsFromPluginOptions } from "../../db";
import { toZodSchema } from "../../db";
import type { AdminOptions } from "./types";

export type AdminUserFields = {
	role?: string | undefined;
	banned: boolean | null;
	banReason?: (string | null) | undefined;
	banExpires?: (Date | null) | undefined;
};

export type AdminSessionFields = {
	impersonatedBy?: string | undefined;
};

export type UserRole = {
	id: string;
	role: string;
	permission: { [x: string]: string[] };
	createdAt: Date;
	updatedAt?: Date | undefined;
};

export type InferUserRole<
	O extends AdminOptions,
	isClientSide extends boolean = true,
> = UserRole & InferAdditionalFieldsFromPluginOptions<"role", O, isClientSide>;

export const getAdditionalFields = <
	O extends AdminOptions,
	AllPartial extends boolean = false,
>(
	options: O,
	shouldBePartial: AllPartial = false as AllPartial,
) => {
	let additionalFields = {
	  ...(options?.schema?.role?.additionalFields || {}),
	};
	if (shouldBePartial) {
		for (const key in additionalFields) {
			additionalFields[key]!.required = false;
		}
	}
	const additionalFieldsSchema = toZodSchema({
		fields: additionalFields,
		isClientSide: true,
	});
	type AdditionalFields = AllPartial extends true
		? Partial<InferAdditionalFieldsFromPluginOptions<"role", O>>
		: InferAdditionalFieldsFromPluginOptions<"role", O>;
	type ReturnAdditionalFields = InferAdditionalFieldsFromPluginOptions<
		"role",
		O,
		false
	>;

	return {
		additionalFieldsSchema,
		$AdditionalFields: {} as AdditionalFields,
		$ReturnAdditionalFields: {} as ReturnAdditionalFields,
	};
};
