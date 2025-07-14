import type {
	BetterAuthClientPlugin,
	LiteralString,
	StandardSchemaV1,
} from "better-auth";
import type { FileRoute, FileStorageFunctions } from ".";
import type { BetterFetchOption } from "@better-fetch/fetch";

export const fileStorageClient = <
	FileRouter extends Record<any, FileRoute<any>>,
>() => {
	return {
		id: "file-storage",
		// $InferServerPlugin: {} as ReturnType<typeof fileStorage>,
		fetchPlugins: [],
		pathMethods: {
			"/fs/upload/:path": "POST",
			"/fs/get/:path/:fileName": "GET",
			"/fs/delete/:path/:fileName": "POST",
		},
		getActions($fetch, $store, clientOptions) {
			return {
				uploadFile: (
					file: File,
					options: {
						signal?: AbortSignal;
						fetchOptions?: BetterFetchOption;
					} & {
						[K in keyof FileRouter]: {
							path: K extends keyof FileRouter ? K : LiteralString;
						} & (FileRouter[K] extends { metadata: infer M }
							? { metadata: M extends StandardSchemaV1<infer S> ? S : M }
							: { metadata: { userId: string } });
					}[keyof FileRouter],
				) => {
					// TODO: Should probably hit an endpoint first to ensure the mime type is allowed,
					// before sending an entire file over just to get rejected.
					return $fetch<
						Awaited<ReturnType<FileStorageFunctions["uploadFile"]>>
					>(`/fs/upload/${encodeURIComponent(options.path as string)}`, {
						...options.fetchOptions,
						method: "POST",
						body: file,
						headers: {
							"Content-Type": file.type,
							...(options.fetchOptions?.headers ?? {}),
						},
						query: {
							...("metadata" in options ? (options.metadata as object) : {}),
							...(options.fetchOptions?.query ?? {}),
						},
						signal: options.signal,
					});
				},
				getFile: (
					fileName: string,
					options: {
						path: string;
						signal?: AbortSignal;
						fetchOptions?: BetterFetchOption;
					},
				) => {
					return $fetch<
						Awaited<ReturnType<FileStorageFunctions["getFile"]>>,
						{
							query: {
								metadata: Record<string, any>;
							};
						}
					>(
						`/fs/get/${encodeURIComponent(
							options.path as string,
						)}/${encodeURIComponent(fileName)}`,
						{
							...options.fetchOptions,
							method: "GET",
							signal: options.signal,
						},
					);
				},
				deleteFile: (
					fileName: string,
					options: {
						path: string;
						signal?: AbortSignal;
						fetchOptions?: BetterFetchOption;
					},
				) => {
					return $fetch<
						Awaited<ReturnType<FileStorageFunctions["deleteFile"]>>
					>(
						`/fs/delete/${encodeURIComponent(
							options.path as string,
						)}/${encodeURIComponent(fileName)}`,
						{
							...options.fetchOptions,
							method: "POST",
							signal: options.signal,
						},
					);
				},
			};
		},
	} satisfies BetterAuthClientPlugin;
};
