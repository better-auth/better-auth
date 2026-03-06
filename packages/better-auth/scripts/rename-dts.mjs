import { readdirSync, renameSync } from "node:fs";
import { join } from "node:path";

function walk(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			walk(full);
		} else if (entry.name.endsWith(".d.ts")) {
			renameSync(full, full.replace(/\.d\.ts$/, ".d.mts"));
		}
	}
}

walk("dist");
