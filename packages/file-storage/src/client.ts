import type { BetterAuthClientPlugin } from "better-auth";
import type { fileStorage } from ".";

export const fileStorageClient = () => {
	return {
		id: "file-storage",
		$InferServerPlugin: {} as ReturnType<typeof fileStorage>,
	} satisfies BetterAuthClientPlugin;
};
