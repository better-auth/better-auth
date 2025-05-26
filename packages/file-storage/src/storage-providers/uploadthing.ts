import type { UTApi } from "uploadthing/server";
import type { StorageLogger, StorageProvider } from "../types";

export class UploadThingProvider implements StorageProvider {
	utapi: UTApi;
	constructor(UTAPI: UTApi) {
		this.utapi = UTAPI;
	}

	async uploadFile(
		params: { file: File; userId: string; metadata?: Record<string, string> },
		logger: StorageLogger,
	): Promise<{
		url: string;
		key: string;
		size: number;
	}> {
		const { file, userId, metadata } = params;
		try {
			const ext = file.name.split(".").pop();
			const newFile = new File([file], `${userId}.${ext}`, {
				type: file.type,
			});
			logger.info(`[BETTER-AUTH file-storage]: Uploading file:`, newFile.name);

			// Upload the file using UploadThing
			const response = await this.utapi.uploadFiles([newFile], {
				metadata: { userId, ...metadata },
			});

			const fileData = response[0];
			if (!fileData || fileData.error) {
				throw new Error("Failed to upload file");
			}

			return {
				url: fileData.data.url,
				key: fileData.data.key,
				size: fileData.data.size,
			};
		} catch (error) {
			logger.error("Error uploading file:", error);
			throw new Error("Failed to upload file");
		}
	}

	async deleteFile(
		params: {
			fileURL: string;
			userId: string;
		},
		logger: StorageLogger,
	): Promise<void> {
		const { fileURL } = params;

		try {
			// Delete the file using UploadThing
			await this.utapi.deleteFiles([fileURL]);
		} catch (error) {
			logger.error("Error deleting file:", error);
			throw new Error("Failed to delete file");
		}
	}
}
