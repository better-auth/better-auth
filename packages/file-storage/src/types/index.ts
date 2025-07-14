import type {
	GenericEndpointContext,
	LiteralString,
	Session,
	StandardSchemaV1,
	User,
} from "better-auth";
import { supportedMimeTypes } from "./mime-types";
import { FileStorageProvider } from "../providers";
import { fileStorage } from "..";

export * from "./mime-types";
export * from "./schema";

export type FileStorageConfig<FileRouter extends Record<any, FileRoute<any>>> =
	{
		/**
		 * The file storage provider to use.
		 */
		provider: FileStorageProvider;
		/**
		 * Custom endpoints which allow file uploads.
		 */
		fileRouter?: FileRouter;
		/**
		 * Hooks to run before and after file operations.
		 *
		 * Operations include:
		 * - upload
		 * - get
		 * - delete
		 *
		 * In each, provides a `before` and `after` hook.
		 *
		 * The before hook is useful for things like IP filtering, blocking banned users and overall rejecting bad requests.
		 *
		 * The after hook is useful for analytics and logging where the `fileId` and `fileURL` are available.
		 */
		hooks?: {
			upload?: {
				before?: (
					props: {
						ctx: GenericEndpointContext;
						file: File;
						session: { user: User; session: Session } | null;
					} & GetMetadataAndPath<FileRouter>,
				) => void;
				after?: (
					props: {
						ctx: GenericEndpointContext;
						file: File;
						session: { user: User; session: Session } | null;
						fileId: string;
						fileURL: string;
						providerURL: string;
					} & GetMetadataAndPath<FileRouter>,
				) => void;
			};
			get?: {
				before?: (
					props: {
						ctx: GenericEndpointContext;
						session: { user: User; session: Session } | null;
					} & GetMetadataAndPath<FileRouter>,
				) => void;
				after?: (
					props: {
						ctx: GenericEndpointContext;
						session: { user: User; session: Session } | null;
						fileId: string;
						fileURL: string;
						providerURL: string;
						fileBuffer: Buffer<ArrayBufferLike>;
					} & GetMetadataAndPath<FileRouter>,
				) => void;
			};
			delete?: {
				before?: (
					props: {
						ctx: GenericEndpointContext;
						session: { user: User; session: Session } | null;
						fileId: string;
						fileURL: string;
						providerURL: string;
					} & GetMetadataAndPath<FileRouter>,
				) => void;
				after?: (
					props: {
						ctx: GenericEndpointContext;
						session: { user: User; session: Session } | null;
						fileId: string;
						fileURL: string;
						providerURL: string;
					} & GetMetadataAndPath<FileRouter>,
				) => void;
			};
		};
	};

type GetMetadataAndPath<FileRouter extends Record<any, FileRoute<any>>> =
	keyof FileRouter extends never
		? { path: LiteralString; metadata: Record<string, any> }
		: {
				[K in keyof FileRouter]: {
					path: K extends keyof FileRouter ? K : LiteralString;
					metadata: FileRouter[K] extends { metadata: infer M }
						? M extends StandardSchemaV1<infer S>
							? S
							: {}
						: {};
				};
			}[keyof FileRouter];

export type FileRoute<Metadata extends Record<string, any> | false = false> = {
	/**
	 * Accepted file mime types.
	 *
	 * @default [] // none
	 */
	mimeTypes?: (typeof supportedMimeTypes)[number][];
	/**
	 * Endpoint paths which are allowed to run file operations on this route.
	 *
	 * Note: By providing a list of endpoints, you overwrite the default ones.
	 * This means that the returned URL from the upload endpoint would be invalid since the
	 * /fs/get/:path path is not included in the list.
	 *
	 * @default ["/fs/upload/:path", "/fs/delete/:path/:fileName", "/fs/get/:path/:fileName"]
	 */
	validEndpoints?: (
		| LiteralString
		| "/fs/upload/:path"
		| "/fs/delete/:path/:fileName"
		| "/fs/get/:path/:fileName"
	)[];
	/**
	 * Maximum file size in bytes.
	 *
	 * @default 1024 * 1024 * 10 // 10MB
	 */
	maxFileSize?: number;
	/**
	 * A function that is called to generate a file name.
	 *
	 * @default `${crypto.randomUUID()}.${extension}`
	 */
	generateFileName?: ({
		extension,
		mimeType,
		metadata,
		session,
	}: {
		extension: string;
		mimeType: string;
		metadata: Metadata;
		session: { user: User; session: Session } | null;
	}) => string;
	/**
	 * Whether the file can be uploaded by a given request.
	 *
	 * @default false
	 */
	canUpload?: CanUpload<Metadata>;
	/**
	 * Whether the file can be deleted by a given request.
	 *
	 * @default false
	 */
	canDelete?: CanDelete<Metadata>;
	/**
	 * Whether the file can be retrieved by a given request.
	 *
	 * @default false
	 */
	canGet?: CanGet<Metadata>;
	/**
	 * A function that is called when a file is uploaded.
	 */
	onUpload?: OnUpload<Metadata>;
	/**
	 * A function that is called when a file is deleted.
	 */
	onDelete?: OnDelete;
	/**
	 * A function that is called when a file is retrieved.
	 */
	onGet?: OnGet;
	/**
	 * Metdata can be provided by the client, and while there is schema validation,
	 * sometimes you may require more fine-grain control over the metadata validation.
	 */
	validateMetadata?: (
		metadata: Metadata,
		props: {
			ctx: GenericEndpointContext;
			session: { user: User; session: Session } | null;
		},
	) => Promise<boolean | Metadata> | boolean | Metadata;
} & (Metadata extends false
	? {}
	: {
			/**
			 * The schema of the metadata to pass during file upload.
			 * If false, no metadata will be required to be passed.
			 */
			metadata: StandardSchemaV1<Metadata>;
		});

type CanUpload<Metadata extends Record<string, any> | false = false> = ({
	session,
}: {
	file: File;
	session: { user: User; session: Session } | null;
	ctx: GenericEndpointContext;
	metadata: Metadata extends false
		? {}
		: // This checks if metadata is `any` which is the default value
			Metadata extends 1 & Metadata
			? {}
			: Metadata;
}) => Promise<boolean> | boolean;

type CanDelete<Metadata extends Record<string, any> | false = false> = ({
	session,
}: {
	session: { user: User; session: Session } | null;
	ctx: GenericEndpointContext;
	metadata: Metadata extends false
		? {}
		: // This checks if metadata is `any` which is the default value
			Metadata extends 1 & Metadata
			? {}
			: Metadata;
}) => Promise<boolean> | boolean;

type CanGet<Metadata extends Record<string, any> | false = false> = ({
	session,
}: {
	session: { user: User; session: Session } | null;
	ctx: GenericEndpointContext;
	metadata: Metadata extends false
		? {}
		: // This checks if metadata is `any` which is the default value
			Metadata extends 1 & Metadata
			? {}
			: Metadata;
}) => Promise<boolean> | boolean;

type OnUpload<Metadata extends Record<string, any> | false = false> = ({
	session,
	file,
	url,
	providerURL,
}: {
	file: File;
	session: { user: User; session: Session } | null;
	ctx: GenericEndpointContext;
	url: string;
	fileId: string;
	metadata: Metadata extends false ? {} : Metadata;
	providerURL: string;
}) => void;

type OnDelete = ({
	session,
}: {
	session: { user: User; session: Session } | null;
	ctx: GenericEndpointContext;
}) => void;

type OnGet = ({
	session,
}: {
	session: { user: User; session: Session } | null;
	ctx: GenericEndpointContext;
}) => void;

export type FileStorageFunctions = ReturnType<
	typeof fileStorage
>["options"]["_functions"];

export type GetFileStorageReturnType =
	| {
			enabled: false;
	  }
	| {
			enabled: true;
			uploadFile: FileStorageFunctions["uploadFile"];
			getFile: FileStorageFunctions["getFile"];
			deleteFile: FileStorageFunctions["deleteFile"];
	  };
