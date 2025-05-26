import type { LogLevel, Session, User } from "better-auth";
import type { FieldAttribute } from "better-auth/db";

export type StorageLogger = Record<
	LogLevel,
	(message: string, ...args: any[]) => void
>;

/**
 * Storage provider interface for file uploads, allowing you
 * to use any storage provider you want.
 */
export interface StorageProvider {
	/**
	 * Upload a file
	 */
	uploadFile: (
		params: {
			file: File;
			userId: string;
			metadata?: Record<string, string>;
		},
		logger: StorageLogger,
	) => Promise<{ url: string; key: string }>;

	/**
	 * Delete a file from storage
	 */
	deleteFile?: (
		params: {
			fileURL: string;
			userId: string;
		},
		logger: StorageLogger,
	) => Promise<void>;
}

export interface FileStorageOptions {
	/**
	 * Storage provider to use for file uploads
	 */
	storageProvider: StorageProvider;

	/**
	 * Maximum file size in bytes
	 * @default 5242880 (5MB)
	 */
	maxSize?: number;

	/**
	 * Allowed file types (image, pdf, etc.) to restrict file uploads
	 * @default ["image/jpeg", "image/png", "image/webp", "application/pdf"]
	 */
	allowedTypes?:
		| string[]
		| ((session: { user: User; session: Session }) =>
				| string[]
				| Promise<string[]>);

	/**
	 * Whether authentication is required to upload a file.
	 * @default true (only authenticated users can upload a file)
	 */
	requireAuth?: boolean;

	/**
	 * Function to authorize file uploads. If provided, this function will be called
	 * before each file upload to verify the user has permission.
	 * @default undefined (all users are always allowed to upload a file)
	 */
	canUploadFile?: (session: { user: User; session: Session }) =>
		| boolean
		| Promise<boolean>;

	/**
	 * Callback function that gets executed server-side when a file is uploaded
	 * @param params Object containing file entry and user
	 */
	onFileUploaded?: (params: {
		file: {
			url: string;
			key: string;
		};
		user: User;
	}) => void | Promise<void>;

	/**
	 * Custom schema configuration
	 */
	schema?: {
		files?: {
			modelName?: string;
			fields?: Record<string, string>;
		};
	};

	/**
	 * Additional fields to add to the files schema
	 */
	additionalFields?: Record<string, FieldAttribute>;
}
