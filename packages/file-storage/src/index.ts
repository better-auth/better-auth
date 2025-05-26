import type { BetterAuthPlugin, ZodRawShape, ZodTypeAny } from "better-auth";
import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import {
	mergeSchema,
	type FieldAttribute,
	type InferFieldsInput,
} from "better-auth/db";
import { z } from "zod";
import { schema, type FileStorageEntry } from "./schema";
import type { FileStorageOptions } from "./types";

export * from "./client";
export * from "./storage-providers/uploadthing";
export * from "./types";
export * from "./utils";

export const ERROR_CODES = {
	FILE_TOO_LARGE: "File is too large",
	INVALID_FILE_TYPE: "Invalid file type",
	USER_NOT_LOGGED_IN: "User must be logged in to upload a file",
	USER_NOT_FOUND: "User not found",
	USER_NOT_ALLOWED: "You are not allowed to upload a file",
	MISSING_OR_INVALID_FILE: "Missing or invalid file",
	FILE_NOT_FOUND: "File not found",
	MISSING_REQUEST_BODY:
		"Missing request body. This is likely caused by the endpoint being called from auth.api.",
	USER_DOES_NOT_OWN_FILE: "You are not allowed to delete this file",
	FAILED_TO_UPLOAD_FILE: "Failed to upload file",
} as const;

export const fileStorage = (options: FileStorageOptions) => {
	const opts = {
		storageProvider: options?.storageProvider,
		maxSize: options?.maxSize ?? 5 * 1024 * 1024, // 5MB default
		allowedTypes: options?.allowedTypes,
		requireAuth: options?.requireAuth ?? true,
		canUploadFile: options?.canUploadFile,
		onFileUploaded: options?.onFileUploaded,
		schema: options?.schema,
		additionalFields: options?.additionalFields ?? {},
	} satisfies FileStorageOptions;

	// Start with a deep copy of the schema
	// Use manual deep copy to handle functions that structuredClone can't handle
	const baseSchema = {
		files: {
			...schema.files,
			fields: {
				...schema.files.fields,
			},
		},
	};

	// If authentication is not required, mark the userId field as not required
	if (!opts.requireAuth && baseSchema.files.fields.userId) {
		baseSchema.files.fields.userId = {
			...baseSchema.files.fields.userId,
			required: false,
		};
	}

	// Now merge with user-provided schema
	const merged_schema = mergeSchema(baseSchema, opts.schema);
	merged_schema.files.fields = {
		...merged_schema.files.fields,
		...opts.additionalFields,
	};

	type FileStorageEntryModified = FileStorageEntry &
		InferFieldsInput<typeof opts.additionalFields>;

	const modelName = Object.keys(merged_schema)[0]!;

	return {
		id: "file-storage",
		schema: merged_schema,
		$ERROR_CODES: ERROR_CODES,
		endpoints: {
			uploadFile: createAuthEndpoint(
				"/files/upload",
				{
					method: "POST",
					body: z.object({
						file: convertAdditionalFieldsToZodSchema({
							...opts.additionalFields,
							name: { type: "string", required: true },
							type: { type: "string", required: true },
							base64: { type: "string", required: true },
						}) as never as z.ZodType<
							Omit<FileStorageEntryModified, "id" | "createdAt" | "userId">
						>,
					}),
					use: [sessionMiddleware],
				},
				async (ctx) => {
					const { name, type, base64, ...everythingElse } = ctx.body.file as {
						name: string;
						type: string;
						base64: string;
					} & Record<string, any>;

					const user = ctx.context.session.user;

					// Check if user is allowed to upload a file
					if (opts.canUploadFile) {
						const isAllowed = await Promise.resolve(
							opts.canUploadFile(ctx.context.session),
						);
						if (!isAllowed) {
							throw ctx.error("FORBIDDEN", {
								message: ERROR_CODES.USER_NOT_ALLOWED,
							});
						}
					}

					// Decode base64 string to file
					const fileBuffer = Buffer.from(base64, "base64");
					const file = new File([fileBuffer], name, {
						type,
					});
					if (!file || !(file instanceof File)) {
						throw ctx.error("BAD_REQUEST", {
							message: ERROR_CODES.MISSING_OR_INVALID_FILE,
						});
					}

					// Validate file size
					if (file.size > opts.maxSize) {
						throw ctx.error("BAD_REQUEST", {
							message: ERROR_CODES.FILE_TOO_LARGE,
						});
					}

					const allowedTypes =
						typeof opts.allowedTypes === "function"
							? await opts.allowedTypes(ctx.context.session)
							: opts.allowedTypes;

					// Validate file type
					if (allowedTypes && !allowedTypes.includes(file.type)) {
						throw ctx.error("BAD_REQUEST", {
							message: ERROR_CODES.INVALID_FILE_TYPE,
						});
					}

					const userId = user.id;

					// Upload file using storage provider
					let url: string;
					let key: string;
					try {
						const res = await opts.storageProvider.uploadFile(
							{
								file,
								userId,
								metadata: everythingElse,
							},
							ctx.context.logger,
						);
						url = res.url;
						key = res.key;
					} catch (error) {
						ctx.context.logger.error(
							`[BETTER-AUTH: file-storage]: User "${userId}" failed to upload file with Storage Provider:`,
							error,
						);
						throw ctx.error("INTERNAL_SERVER_ERROR", {
							message: ERROR_CODES.FAILED_TO_UPLOAD_FILE,
						});
					}

					// Store record of the file in the database
					await ctx.context.adapter.create({
						model: modelName,
						data: {
							userId,
							name: file.name,
							type: file.type,
							size: file.size,
							url,
							...everythingElse,
						},
					});

					// Call onFileUploaded handler if provided
					if (opts.onFileUploaded && user) {
						await Promise.resolve(
							opts.onFileUploaded({
								file: {
									url,
									key,
								},
								user,
							}),
						);
					}

					return ctx.json({
						success: true,
						file: {
							url,
							key,
						},
					});
				},
			),

			deleteFile: createAuthEndpoint(
				"/files/delete",
				{
					method: "POST",
					body: z.object({
						fileKey: z.string(),
					}),
					use: [sessionMiddleware],
				},
				async (ctx) => {
					const user = ctx.context.session.user;

					// Ensure this user owns the file
					if (user.file !== ctx.body.fileKey) {
						throw ctx.error("FORBIDDEN", {
							message: ERROR_CODES.USER_DOES_NOT_OWN_FILE,
						});
					}

					// Delete from storage provider if possible
					if (opts.storageProvider.deleteFile) {
						await opts.storageProvider.deleteFile(
							{
								fileURL: user.file,
								userId: user.id,
							},
							ctx.context.logger,
						);
					}

					return ctx.json({ success: true });
				},
			),
		},
	} satisfies BetterAuthPlugin;
};

function convertAdditionalFieldsToZodSchema(
	additionalFields: Record<string, FieldAttribute>,
) {
	const additionalFieldsZodSchema: ZodRawShape = {};
	for (const [key, value] of Object.entries(additionalFields)) {
		let res: ZodTypeAny;

		if (value.type === "string") {
			res = z.string();
		} else if (value.type === "number") {
			res = z.number();
		} else if (value.type === "boolean") {
			res = z.boolean();
		} else if (value.type === "date") {
			res = z.date();
		} else if (value.type === "string[]") {
			res = z.array(z.string());
		} else {
			res = z.array(z.number());
		}

		if (!value.required) {
			res = res.optional();
		}

		additionalFieldsZodSchema[key] = res;
	}
	return z.object(additionalFieldsZodSchema);
}
