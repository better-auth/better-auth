import { logger } from "better-auth";

export * from "./file-system";

export class FileStorageProvider {
	async uploadFile(args: {
		file: File;
		signal?: AbortSignal;
	}): Promise<{ url: string; fileId: string }> {
		logger.error(`${this.constructor.name}.uploadFile is not implemented`);
		throw new Error("Not implemented");
	}

	async deleteFile(args: { fileName: string }) {
		logger.error(`${this.constructor.name}.deleteFile is not implemented`);
		throw new Error("Not implemented");
	}

	async getFile(args: {
		fileName: string;
		signal?: AbortSignal;
	}): Promise<Buffer> {
		logger.error(`${this.constructor.name}.getFile is not implemented`);
		throw new Error("Not implemented");
	}
}
