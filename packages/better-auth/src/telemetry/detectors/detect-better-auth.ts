import type { DetectionInfo } from "../types";

export async function detectBetterAuth(): Promise<DetectionInfo | undefined> {
	return {
		name: "better-auth",
		version:
			process.env.PACKAGE_VERSION ?? process.env.npm_package_version ?? null,
	};
}
