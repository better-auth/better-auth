import { APIError } from "better-call";
import type {
	Account,
	GenericEndpointContext,
	Session,
	SocialAdditionalDataAssign,
	SocialAdditionalDataAssignmentResult,
	User,
} from "../types";

/**
 * Validate and normalize additional OAuth data according to configuration.
 *
 * This helper checks whether the `socialProvidersAdditionalData` feature is
 * enabled and, if a validation `schema` is configured, validates the provided
 * payload. When no schema is present, the raw `additionalData` is accepted as-is.
 *
 * Behavior:
 * - If the feature is disabled or `shouldAssignAdditionalData` is false, the
 *   call is treated as skipped and `{ skipped: true, value: undefined }` is
 *   returned.
 * - If enabled and no schema is configured, returns `{ skipped: false, value: additionalData }`.
 * - If a schema is configured, validates and returns the parsed value on
 *   success; throws on validation errors.
 *
 * @param params Function arguments
 * @param params.ctx Request context used to read options and log errors
 * @param params.shouldAssignAdditionalData Whether the caller intends to assign additional data
 * @param params.additionalData The raw additional data payload from the client
 *
 */
// export async function parseSocialAdditionalData({
// 	ctx: c,
// 	additionalData,
// 	shouldAssignAdditionalData,
// }: {
// 	ctx: GenericEndpointContext;
// 	shouldAssignAdditionalData: boolean;
// 	additionalData: unknown;
// }) {
// 	if (!shouldAssignAdditionalData) return { skipped: true, value: undefined };

// 		return { skipped: true, value: undefined };

// 	const schema = additionalDataOptions.schema;
// 	if (!schema) {
// 		// No schema: accept raw payload as-is
// 		return { skipped: false, value: additionalData };
// 	}

// 	let result = schema["~standard"].validate(additionalData);
// 	if (result instanceof Promise) result = await result;

// 	// if the `issues` field exists, the validation failed
// 	if (result.issues) {
// 		c.context.logger.error(
// 			"Invalid additional data provided during oauth flow",
// 			{
// 				issues: result.issues,
// 			},
// 		);
// 		throw new APIError("BAD_REQUEST", {
// 			message: "Invalid additional data",
// 			issues: result.issues,
// 		});
// 	}

// 	return { skipped: false, value: result.value };
// }

/**
 * Provides the additional data to the better-auth options, so it can be used in the `assign` function.
 * Returns either `null` or a partial object with `user`, `account`, or `session` keys to assign new data to the database.
 */
// export async function assignSocialAdditionalData({
// 	ctx,
// 	additionalData,
// 	provider,
// 	current,
// 	flow,
// }: {
// 	ctx: GenericEndpointContext;
// 	additionalData: unknown;
// 	provider: Parameters<SocialAdditionalDataAssign>[0]["provider"];
// 	current: Parameters<SocialAdditionalDataAssign>[0]["current"];
// 	flow: Parameters<SocialAdditionalDataAssign>[0]["flow"];
// }): Promise<SocialAdditionalDataAssignmentResult | null> {
// 	const { additionalData: additionalDataOptions } =
// 		ctx.context.options.socialProviders || {};
	
// 	if (
// 		!additionalDataOptions ||
// 		!additionalDataOptions.enabled ||
// 		!additionalDataOptions.assign
// 	)
// 		return null;

	

// 	const result = await additionalDataOptions.assign({
// 		data: additionalData,
// 		provider,
// 		ctx,
// 		current,
// 		flow,
// 	});
// 	if (!result) return null;
// 	return result;
// }
