import { z } from "zod";
import { APIError } from "better-auth/api";
import { createRoute } from "../create-route";
import type { FileRoute } from "../types";

//? ================================================================
//? REMINDER:
//? If this configuration is updated, please make sure to update the docs too! This is important!
//? ================================================================

export const userImageRoute = (
	overwriteConfig?: Partial<
		OmitKeys<FileRoute<{ userId: string }>, "metadata" | "validateMetadata">
	>,
) => {
	return createRoute({
		mimeTypes: ["image/*"],
		maxFileSize: 1024 * 1024 * 10, // 10MB
		validEndpoints: [
			"/sign-up/email",
			"/update-user",
			"/delete-user",
			"/fs/get/:path/:fileName",
		],
		canUpload: async ({ session }) => {
			// Ensure the user is authenticated
			if (!session) return false;

			// If admin plugin is enabled, check if the user is banned:
			if ("banned" in session.user && session.user.banned) {
				throw new APIError("FORBIDDEN", {
					message: "You are banned",
				});
			}

			// Ensure user is not anonymous
			if ("is_anonymous" in session.user && session.user.is_anonymous) {
				throw new APIError("FORBIDDEN", {
					message: "You are anonymous",
				});
			}

			return true;
		},
		canDelete: async ({ session, metadata }) => {
			if (!session) return false;
			if (metadata.userId !== session.user.id) {
				throw new APIError("FORBIDDEN", {
					message: "You are not allowed to delete this file",
				});
			}
			return true;
		},
		canGet: () => true,
		metadata: z.object({
			userId: z.string(),
		}),
		validateMetadata: async (metadata, { session }) => {
			if (!session) throw new APIError("UNAUTHORIZED");
			// Forcefully override the metadata to be the user's ID.
			return { userId: session.user.id };
		},
		...overwriteConfig,
	});
};

type OmitKeys<T extends Record<string, any>, K extends keyof T> = {
	[P in Exclude<keyof T, K>]: T[P];
};
