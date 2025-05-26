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

/**
 * Filter options for file queries
 */
export interface FileFilter {
	/**
	 * Filter by file type (MIME type)
	 */
	fileType?: string;
	
	/**
	 * Filter files created after this date (ISO string)
	 */
	fromDate?: string;
	
	/**
	 * Filter files created before this date (ISO string)
	 */
	toDate?: string;
	
	/**
	 * Filter by file name pattern (partial match)
	 */
	namePattern?: string;
}

/**
 * Options for listing files
 */
export interface ListFilesOptions extends FileFilter {
	/**
	 * Maximum number of files to return
	 * @default 20
	 * @min 1
	 * @max 100
	 */
	limit?: number;
	
	/**
	 * Number of files to skip
	 * @default 0
	 */
	offset?: number;
	
	/**
	 * Field to sort by
	 * @default "createdAt"
	 */
	sortBy?: "name" | "type" | "size" | "createdAt";
	
	/**
	 * Sort order
	 * @default "desc"
	 */
	sortOrder?: "asc" | "desc";
}

/**
 * Response for storage usage endpoint
 */
export interface StorageUsageResponse {
	/**
	 * Total size in bytes
	 */
	totalSize: number;
	
	/**
	 * Number of files
	 */
	fileCount: number;
	
	/**
	 * Human-readable formatted size
	 */
	totalSizeFormatted: string;
}

/**
 * File entry with formatted size
 */
export interface FileEntry {
	id: string;
	name: string;
	type: string;
	size: number;
	sizeFormatted: string;
	url: string;
	createdAt: Date;
	[key: string]: any; // For additional fields
}

/**
 * Response for list files endpoint
 */
export interface ListFilesResponse {
	/**
	 * Array of file entries
	 */
	files: FileEntry[];
	
	/**
	 * Pagination information
	 */
	pagination: {
		total: number;
		limit: number;
		offset: number;
		hasMore: boolean;
	};
}
