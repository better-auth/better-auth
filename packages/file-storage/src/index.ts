import type {
	BetterAuthPlugin,
	GenericEndpointContext,
	Session,
	User,
} from "better-auth";
import type {
	FileRoute,
	FileStorageConfig,
	FileStorageSchema,
	GetFileStorageReturnType,
} from "./types";
import { createAuthEndpoint } from "better-auth/plugins";
import { APIError, getSessionFromCtx } from "better-auth/api";
import { z } from "zod";
import { fileTypeFromBuffer } from "file-type";

export * from "./create-route";
export * from "./types";
export * from "./providers";

const defaultMaximumFileSize = 1024 * 1024 * 10; // 10MB
const defaultValidEndpoints = [
	"/fs/upload/:path",
	"/fs/delete/:path/:fileName",
	"/fs/get/:path/:fileName",
];

export const fileStorage = <FileRouter extends Record<any, FileRoute<any>>>(
	options: FileStorageConfig<FileRouter>,
) => {
	const opts = {
		...options,
	} satisfies FileStorageConfig<FileRouter>;

	const uploadFile = async (
		blob: Blob,
		args: {
			ctx: GenericEndpointContext;
			path: string;
			metadata?: Record<string, any>;
			session: { user: User; session: Session } | null;
		},
	) => {
		const { path, metadata: uncheckedMetadata, ctx, session } = args;

		// Check if the path is valid
		const router = opts.fileRouter?.[path];
		if (!router) {
			throw new APIError("NOT_FOUND", {
				code: "ROUTE_NOT_FOUND",
				message: `Route path not found: ${path}`,
			});
		}

		const validEndpoints = router.validEndpoints ?? defaultValidEndpoints;
		if (!validEndpoints.includes(ctx.path)) {
			throw new APIError("FORBIDDEN", {
				code: "INVALID_ENDPOINT",
				message: `Invalid endpoint: ${ctx.path}`,
			});
		}

		// Validate the metadata
		const schema = "metadata" in router ? router.metadata : false;
		let metadata: Record<string, any> = {};
		if (schema) {
			if (!uncheckedMetadata || typeof uncheckedMetadata !== "object") {
				throw new APIError("BAD_REQUEST", {
					message:
						"A metadata object is required to be provided in the query parameters",
					code: "METADATA_REQUIRED",
				});
			}
			let result = await schema["~standard"].validate(uncheckedMetadata);

			if (result.issues) {
				ctx.context.logger.error("The metadata object is invalid", {
					issues: result.issues,
				});
				throw new APIError("BAD_REQUEST", {
					code: "METADATA_INVALID",
					message: "The metadata object is invalid",
					issues: result.issues,
				});
			}
			metadata = result.value;
		}

		// Run the validateMetadata hook
		if (router.validateMetadata) {
			const result: boolean | Record<string, any> =
				await router.validateMetadata(metadata, { ctx, session });
			if (result === false) {
				throw new APIError("BAD_REQUEST", {
					code: "METADATA_INVALID",
					message: "The metadata object is invalid",
				});
			} else if (typeof result === "object") {
				metadata = result;
			}
		}

		// Check if the file is supported
		const buffer = Buffer.from(await blob.arrayBuffer());
		const fileType = await fileTypeFromBuffer(buffer);
		if (!fileType?.mime) {
			ctx.context.logger.error("Uploaded file MIME type is not supported", {
				path,
				session,
			});
			throw new APIError("UNSUPPORTED_MEDIA_TYPE", {
				code: "MIME_TYPE_NOT_SUPPORTED",
				message: "File MIME type not supported",
			});
		}

		// Check if the MIME type is allowed
		const allowedMimeTypes: string[] = router.mimeTypes ?? [];
		if (allowedMimeTypes.includes("*")) {
		} else if (allowedMimeTypes.includes(`${fileType.mime.split("/")[0]}/*`)) {
		} else if (!allowedMimeTypes.includes(fileType.mime)) {
			throw new APIError("UNSUPPORTED_MEDIA_TYPE", {
				code: "MIME_TYPE_NOT_ALLOWED",
				message: `File MIME type not allowed: ${fileType.mime}`,
			});
		}

		// Check if the file size is allowed
		const fileSize = blob.size;
		const maxSize = router.maximumFileSize ?? defaultMaximumFileSize;
		if (fileSize > maxSize) {
			throw new APIError("PAYLOAD_TOO_LARGE", {
				code: "FILE_SIZE_TOO_LARGE",
				message: "File size too large",
			});
		}

		// Generate a file name
		const fileName =
			router.generateFileName?.({
				extension: fileType.ext,
				mimeType: fileType.mime,
				metadata,
				session,
			}) || `${crypto.randomUUID()}.${fileType.ext}`;

		// Create a file instance
		const file = new File([buffer], fileName, {
			type: fileType.mime,
		});

		// Check if the request is allowed
		const canUpload = router.canUpload || (() => false);
		const allowed = await canUpload({ file, session, ctx, metadata });
		if (!allowed) {
			throw new APIError("FORBIDDEN", {
				code: "NOT_ALLOWED",
				message: "Not allowed",
			});
		}

		// Run the before hook
		opts.hooks?.upload?.before?.({
			ctx,
			file,
			metadata: metadata as any,
			path: path as any,
			session,
		});

		// Upload the file
		const { url: providerURL, fileId } = await opts.provider.uploadFile({
			file,
		});
		const url = `${ctx.context.baseURL}/fs/get/${path}/${fileName}`;

		await ctx.context.adapter.create<FileStorageSchema>({
			model: "fileStorage",
			data: {
				url,
				path,
				fileId,
				fileName,
				metadata,
				providerURL,
				updatedAt: new Date(),
				createdAt: new Date(),
			},
		});

		router.onUpload?.({
			session,
			file,
			ctx,
			url,
			fileId,
			metadata,
			providerURL,
		});

		// Run the after hook
		opts.hooks?.upload?.after?.({
			ctx,
			file,
			metadata: metadata as any,
			path: path as any,
			session,
			fileId,
			fileURL: url,
			providerURL,
		});

		return {
			url,
			providerURL,
			fileId,
		};
	};
	const getFile = async (args: {
		ctx: GenericEndpointContext;
		path: string;
		fileName: string;
		session: { user: User; session: Session } | null;
	}) => {
		const { path, fileName, ctx, session } = args;

		// Check if the path is valid
		const router = opts.fileRouter?.[path];
		if (!router) {
			throw new APIError("NOT_FOUND", {
				code: "ROUTE_NOT_FOUND",
				message: "Route path not found",
			});
		}

		// Check if the endpoint is valid
		const validEndpoints = router.validEndpoints ?? defaultValidEndpoints;
		if (!validEndpoints.includes(ctx.path)) {
			throw new APIError("FORBIDDEN", {
				code: "INVALID_ENDPOINT",
				message: `Invalid endpoint: ${ctx.path}`,
			});
		}

		// Check if the file exists
		const result = await ctx.context.adapter.findOne<FileStorageSchema>({
			model: "fileStorage",
			where: [{ field: "fileName", value: fileName }],
		});
		if (!result) {
			throw new APIError("NOT_FOUND", {
				code: "FILE_NOT_FOUND",
				message: "File not found",
			});
		}

		// Check if the file path is valid
		if (result.path !== path) {
			throw new APIError("NOT_FOUND", {
				code: "FILE_NOT_FOUND",
				message: "File not found",
			});
		}

		// Check if the request is allowed
		const canGet = router.canGet || (() => false);
		const allowed = await canGet({
			session,
			ctx,
			metadata: result.metadata ?? {},
		});
		if (!allowed) {
			throw new APIError("FORBIDDEN", {
				code: "NOT_ALLOWED",
				message: "Not allowed",
			});
		}

		// Run the before hook
		opts.hooks?.get?.before?.({
			ctx,
			session,
			metadata: result.metadata as any,
			path: path as any,
		});

		// Get the file
		const fileBuffer = await opts.provider.getFile({ fileName });
		if (!fileBuffer) {
			throw new APIError("NOT_FOUND", {
				code: "FILE_NOT_FOUND",
				message: "File not found",
			});
		}

		// Check if the file MIME type is supported
		const fileType = await fileTypeFromBuffer(fileBuffer);
		if (!fileType?.mime) {
			ctx.context.logger.error("File MIME type not supported", {
				fileName,
				path,
			});
			throw new APIError("UNSUPPORTED_MEDIA_TYPE", {
				code: "MIME_TYPE_NOT_SUPPORTED",
				message: "File MIME type not supported",
			});
		}

		// Call the onGet hook
		router.onGet?.({ session, ctx });

		// Run the after hook
		opts.hooks?.get?.after?.({
			ctx,
			session,
			metadata: result.metadata as any,
			path: path as any,
			fileId: result.fileId,
			fileURL: result.url,
			providerURL: result.providerURL,
			fileBuffer,
		});

		// Convert the file buffer to a uint8 array and return it as a response
		const uint8 = new Uint8Array(fileBuffer);
		return new Response(uint8, {
			status: 200,
			headers: {
				"Content-Type": fileType.mime,
				"Content-Length": fileBuffer.length.toString(),
			},
		});
	};

	const deleteFile = async ({
		ctx,
		fileName,
		path,
		session,
	}: {
		ctx: GenericEndpointContext;
		path: string;
		fileName: string;
		session: { user: User; session: Session } | null;
	}) => {
		if (!session) {
			throw new APIError("UNAUTHORIZED", {
				code: "UNAUTHORIZED",
				message: "Unauthorized",
			});
		}

		// Check if the path is valid
		const router = opts.fileRouter?.[path];
		if (!router) {
			throw new APIError("NOT_FOUND", {
				code: "ROUTE_NOT_FOUND",
				message: "Route path not found",
			});
		}

		// Check if the endpoint is valid
		const validEndpoints = router.validEndpoints ?? defaultValidEndpoints;
		if (!validEndpoints.includes(ctx.path)) {
			throw new APIError("FORBIDDEN", {
				code: "INVALID_ENDPOINT",
				message: `Invalid endpoint: ${ctx.path}`,
			});
		}

		const result = await ctx.context.adapter.findOne<FileStorageSchema>({
			model: "fileStorage",
			where: [
				{
					field: "fileName",
					value: fileName,
				},
			],
		});

		// Check if the file exists
		if (!result) {
			throw new APIError("NOT_FOUND", {
				code: "FILE_NOT_FOUND",
				message: "File not found",
			});
		}

		// Check if the file path is valid
		if (result.path !== path) {
			throw new APIError("NOT_FOUND", {
				code: "FILE_NOT_FOUND",
				message: "File not found",
			});
		}

		// Check if the request is allowed
		const canDelete = router.canDelete || (() => false);
		const allowed = await canDelete({
			session,
			ctx,
			metadata: result.metadata ?? { userId: session.user.id },
		});
		if (!allowed) {
			throw new APIError("FORBIDDEN", {
				code: "NOT_ALLOWED",
				message: "Not allowed",
			});
		}

		// Run the before hook
		opts.hooks?.delete?.before?.({
			ctx,
			session,
			metadata: result.metadata as any,
			path: path as any,
			fileId: result.fileId,
			fileURL: result.url,
			providerURL: result.providerURL,
		});

		// Delete the file
		await opts.provider.deleteFile({ fileName });
		router.onDelete?.({ session, ctx });

		// Run the after hook
		opts.hooks?.delete?.after?.({
			ctx,
			session,
			metadata: result.metadata as any,
			path: path as any,
			fileId: result.fileId,
			fileURL: result.url,
			providerURL: result.providerURL,
		});
	};

	return {
		id: "file-storage",

		endpoints: {
			uploadFile: createAuthEndpoint(
				"/fs/upload/:path",
				{
					method: "POST",
					body: z.instanceof(Blob),
					query: z.record(z.any()).optional(),
				},
				async (ctx) => {
					const blob = ctx.body;
					const path = ctx.params.path;
					const session = await getSessionFromCtx(ctx);
					const result = await uploadFile(blob, {
						path,
						session,
						ctx,
						metadata: ctx.query,
					});
					return ctx.json(result);
				},
			),
			getFile: createAuthEndpoint(
				"/fs/get/:path/:fileName",
				{ method: "GET" },
				async (ctx) => {
					const { path, fileName } = ctx.params;
					const session = await getSessionFromCtx(ctx);
					const result = await getFile({
						path,
						fileName,
						session,
						ctx,
					});
					return result;
				},
			),
			deleteFile: createAuthEndpoint(
				"/fs/delete/:path/:fileName",
				{ method: "POST" }, // TODO: Change to DELETE once it's fully supported. Don't forget to change the client pathMethods.
				async (ctx) => {
					const { path, fileName } = ctx.params;
					const session = await getSessionFromCtx(ctx);
					await deleteFile({ ctx, fileName, path, session });
					return ctx.json({ success: true });
				},
			),
		},
		options: { ...opts, _functions: { uploadFile, getFile, deleteFile } },
		$Infer: {
			FileRouter: {} as FileRouter,
		},
		schema: {
			fileStorage: {
				fields: {
					path: {
						type: "string",
						required: true,
					},
					fileId: {
						type: "string",
						required: true,
					},
					fileName: {
						type: "string",
						required: true,
					},
					metadata: {
						type: "string",
						required: false,
						transform: {
							input(value) {
								if (!value) return null;
								return JSON.stringify(value);
							},
							output(value) {
								if (!value) return null;
								return JSON.parse(value as string);
							},
						},
					},
					providerURL: {
						type: "string",
						required: true,
					},
					url: {
						type: "string",
						required: true,
					},
					createdAt: {
						type: "date",
						required: true,
					},
					updatedAt: {
						type: "date",
						required: true,
					},
				},
			},
		},
	} satisfies BetterAuthPlugin;
};

export const getFileStorage = (
	ctx: GenericEndpointContext,
): GetFileStorageReturnType => {
	const plugin = ctx.context.options.plugins?.find(
		(x) => x.id === "file-storage",
	) as ReturnType<typeof fileStorage> | undefined;

	if (!plugin) return { enabled: false };

	const { uploadFile, getFile, deleteFile } = plugin.options._functions;

	return {
		enabled: true,
		uploadFile,
		getFile,
		deleteFile,
	};
};
