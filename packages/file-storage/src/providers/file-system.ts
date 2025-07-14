import { APIError } from "better-auth/api";
import { FileStorageProvider } from ".";
import { readFile, unlink, writeFile, access } from "fs/promises";
import { join } from "path";
import { tryCatch } from "../utils";
import { logger } from "better-auth";

export class FileSystemProvider extends FileStorageProvider {
	private directory: string;

	constructor({ directory }: { directory: string }) {
		super();
		this.directory = directory;
	}

	override async uploadFile({
		file,
		signal,
	}: { file: File; signal?: AbortSignal }) {
		const fileId = crypto.randomUUID();
		const filePath = this.getFilePath(file.name);

		const { error: fileNotTaken } = await tryCatch(access(filePath));
		if (!fileNotTaken) {
			throw new APIError("CONFLICT", {
				message: `File already exists`,
			});
		}
		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		await writeFile(filePath, buffer, { signal: signal });
		return { url: filePath, fileId };
	}

	override async deleteFile({ fileName }: { fileName: string }) {
		const filePath = this.getFilePath(fileName);
		await unlink(filePath);
	}

	override async getFile({
		fileName,
		signal,
	}: {
		fileName: string;
		signal?: AbortSignal;
	}) {
		const filePath = this.getFilePath(fileName);

		const { data, error } = await tryCatch(
			readFile(filePath, { signal: signal }),
		);
		if (error) {
			if ("code" in error && error.code === "ENOENT") {
				throw new APIError("NOT_FOUND");
			}
			logger.error(`Error getting file:`, error);
			throw new APIError("INTERNAL_SERVER_ERROR");
		}
		return data;
	}

	private getFilePath(fileId: string) {
		return join(this.directory, fileId);
	}
}
