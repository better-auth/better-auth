// Builds the browser UI runtime (src/ui/runtime/**) into a single IIFE via
// tsdown.runtime.config.ts, then inlines the emitted bundle into
// src/ui/runtime.generated.ts as the `uiRuntime` string consumed by
// src/ui/router.ts.
//
// Run with: pnpm --filter better-auth build:ui-runtime

import { execFileSync } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(pkgRoot, "dist-runtime");
const generatedFile = join(pkgRoot, "src", "ui", "runtime.generated.ts");

execFileSync(
	"pnpm",
	["exec", "tsdown", "--config", "tsdown.runtime.config.ts"],
	{
		stdio: "inherit",
		cwd: pkgRoot,
	},
);

const emitted = (await readdir(outDir)).find((file) => file.endsWith(".js"));
if (!emitted) {
	throw new Error(
		`build-runtime: no .js output found in ${outDir}. Did tsdown fail?`,
	);
}

const code = await readFile(join(outDir, emitted), "utf8");
await writeFile(
	generatedFile,
	`export const uiRuntime = ${JSON.stringify(code)};\n`,
);

console.log(
	`build-runtime: wrote ${generatedFile} from dist-runtime/${emitted} (${code.length} bytes)`,
);
