import { vol } from "memfs";
import { test } from "vitest";

export const testWithTmpDir = test.extend<{
	tmp: string;
}>({
	tmp: async ({}, use) => {
		const tmpDir = "/tmp";
		vol.reset();
		const tmp = vol.mkdirSync(tmpDir, { recursive: true });
		if (!tmp) {
			throw new Error("Failed to create temporary directory");
		}

		try {
			await use(tmp);
		} finally {
			vol.reset();
		}
	},
});
