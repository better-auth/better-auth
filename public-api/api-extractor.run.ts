import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	isMainThread,
	parentPort,
	Worker,
	workerData,
} from "node:worker_threads";
import type { IConfigFile } from "@microsoft/api-extractor";
import { Extractor, ExtractorConfig } from "@microsoft/api-extractor";

const REPORT_DIR = import.meta.dirname;
const ROOT_DIR = path.resolve(REPORT_DIR, "..");
const PACKAGES_DIR = path.join(ROOT_DIR, "packages");
const TEMP_DIR = path.join(REPORT_DIR, ".temp");

// ─── Types ───

interface EntryPoint {
	pkgName: string;
	exportKey: string;
	typesPath: string;
	pkgDir: string;
	label: string;
	reportFolder: string;
	reportFileName: string;
}

interface EntryResult {
	label: string;
	status: "ok" | "updated" | "changed" | "new";
	goldenPath: string;
	tempPath: string;
}

// ─── Shared ───

function resolveReportPath(
	pkgName: string,
	exportKey: string,
): { dir: string; fileName: string } {
	if (exportKey === ".") {
		return { dir: path.join(REPORT_DIR, pkgName), fileName: "index" };
	}
	const stripped = exportKey.replace(/^\.\//, "");
	const parts = stripped.split("/");
	const fileName = parts.pop()!;
	const subDir = parts.length > 0 ? path.join(pkgName, ...parts) : pkgName;
	return { dir: path.join(REPORT_DIR, subDir), fileName };
}

function processEntry(
	entry: EntryPoint,
	isUpdate: boolean,
	baseConfig: IConfigFile,
): EntryResult {
	const goldenPath = path.join(
		entry.reportFolder,
		`${entry.reportFileName}.api.md`,
	);
	const tempFolder = path.join(
		TEMP_DIR,
		path.relative(REPORT_DIR, entry.reportFolder),
	);
	const tempPath = path.join(tempFolder, `${entry.reportFileName}.api.md`);

	fs.mkdirSync(entry.reportFolder, { recursive: true });
	fs.mkdirSync(tempFolder, { recursive: true });

	const isNew = !fs.existsSync(goldenPath);

	const configObject: IConfigFile = {
		...baseConfig,
		compiler: {
			...baseConfig.compiler,
			overrideTsconfig: {
				compilerOptions: {
					target: "ESNext",
					module: "ESNext",
					moduleResolution: "bundler",
					skipLibCheck: true,
					types: [],
					lib: ["ESNext", "DOM"],
				},
				files: [entry.typesPath],
			},
		},
		projectFolder: entry.pkgDir,
		mainEntryPointFilePath: entry.typesPath,
		apiReport: {
			enabled: true,
			reportFolder: entry.reportFolder,
			reportTempFolder: tempFolder,
			reportFileName: entry.reportFileName,
		},
		newlineKind: "lf",
	};

	const extractorConfig = ExtractorConfig.prepare({
		configObject,
		configObjectFullPath: path.join(REPORT_DIR, "api-extractor.json"),
		packageJsonFullPath: path.join(entry.pkgDir, "package.json"),
	});

	const result = Extractor.invoke(extractorConfig, {
		localBuild: isUpdate,
		messageCallback: (msg) => {
			msg.handled = true;
		},
	});

	if (!result.apiReportChanged) {
		return { label: entry.label, status: "ok", goldenPath, tempPath };
	}

	return {
		label: entry.label,
		status: isUpdate ? "updated" : isNew ? "new" : "changed",
		goldenPath,
		tempPath,
	};
}

// ─── Worker ───

if (!isMainThread) {
	const { entries, isUpdate } = workerData as {
		entries: EntryPoint[];
		isUpdate: boolean;
	};
	const baseConfig: IConfigFile = JSON.parse(
		fs.readFileSync(path.join(REPORT_DIR, "api-extractor.json"), "utf-8"),
	);
	const results = entries.map((e) => processEntry(e, isUpdate, baseConfig));
	parentPort!.postMessage(results);
}

// ─── Main ───
else {
	const args = process.argv.slice(2);
	const isUpdate = args.includes("--local");
	const pkgIdx = args.indexOf("--pkg");
	const filterPkg = pkgIdx !== -1 ? args[pkgIdx + 1] : undefined;

	// Discover packages
	let packages = fs
		.readdirSync(PACKAGES_DIR, { withFileTypes: true })
		.filter((d) => {
			if (!d.isDirectory()) return false;
			const p = path.join(PACKAGES_DIR, d.name, "package.json");
			if (!fs.existsSync(p)) return false;
			const pkg = JSON.parse(fs.readFileSync(p, "utf-8"));
			return !pkg.private && pkg.exports;
		})
		.map((d) => d.name)
		.sort();

	if (filterPkg) {
		packages = packages.filter((p) => p === filterPkg);
		if (packages.length === 0) {
			console.error(`Package "${filterPkg}" not found.`);
			process.exit(1);
		}
	}

	// Collect entry points
	const allEntries: EntryPoint[] = [];
	for (const pkgName of packages) {
		const pkgDir = path.join(PACKAGES_DIR, pkgName);
		const pkgJson = JSON.parse(
			fs.readFileSync(path.join(pkgDir, "package.json"), "utf-8"),
		);
		for (const [key, val] of Object.entries(pkgJson.exports || {})) {
			if (key.includes("*")) continue;

			let typesPath: string | undefined;
			if (typeof val === "object" && val !== null && "types" in val) {
				typesPath = (val as Record<string, string>).types;
			} else if (
				typeof val === "string" &&
				(val.endsWith(".d.mts") || val.endsWith(".d.ts"))
			) {
				typesPath = val;
			}
			if (!typesPath) continue;

			const resolved = path.resolve(pkgDir, typesPath);
			if (!fs.existsSync(resolved)) continue;

			const { dir, fileName } = resolveReportPath(pkgName, key);
			allEntries.push({
				pkgName,
				exportKey: key,
				typesPath: resolved,
				pkgDir,
				label: key === "." ? pkgName : `${pkgName}/${key.replace(/^\.\//, "")}`,
				reportFolder: dir,
				reportFileName: fileName,
			});
		}
	}

	allEntries.sort((a, b) => a.label.localeCompare(b.label));

	if (allEntries.length === 0) {
		console.log("No entry points found.");
		process.exit(0);
	}

	// Prepare temp dir
	fs.mkdirSync(TEMP_DIR, { recursive: true });

	// Distribute to workers
	const workerCount = Math.max(
		1,
		Math.min(
			(os.availableParallelism?.() ?? os.cpus().length) - 1,
			allEntries.length,
			6,
		),
	);
	const chunkSize = Math.ceil(allEntries.length / workerCount);
	const chunks: EntryPoint[][] = [];
	for (let i = 0; i < allEntries.length; i += chunkSize) {
		chunks.push(allEntries.slice(i, i + chunkSize));
	}

	const startTime = performance.now();

	const workerPromises = chunks.map(
		(chunk) =>
			new Promise<EntryResult[]>((resolve, reject) => {
				const w = new Worker(new URL(import.meta.url), {
					workerData: { entries: chunk, isUpdate },
				});
				w.on("message", resolve);
				w.on("error", reject);
			}),
	);

	const results = (await Promise.all(workerPromises)).flat();
	results.sort((a, b) => a.label.localeCompare(b.label));

	const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

	// Show diffs for changed entries
	let hasChanges = false;

	for (const r of results) {
		if (r.status === "changed") {
			hasChanges = true;
			console.log(`\n\x1b[31m── ${r.label} ──\x1b[0m`);
			try {
				execFileSync("diff", ["-u", r.goldenPath, r.tempPath], {
					encoding: "utf-8",
				});
			} catch (e: unknown) {
				const diff = ((e as { stdout?: string }).stdout as string) || "";
				const lines = diff.split("\n");
				const maxDiffLines = 30;
				for (let i = 0; i < Math.min(lines.length, maxDiffLines); i++) {
					const line = lines[i];
					if (line.startsWith("+")) {
						console.log(`\x1b[32m${line}\x1b[0m`);
					} else if (line.startsWith("-")) {
						console.log(`\x1b[31m${line}\x1b[0m`);
					} else {
						console.log(line);
					}
				}
				if (lines.length > maxDiffLines) {
					console.log(
						`\x1b[90m  ... ${lines.length - maxDiffLines} more lines\x1b[0m`,
					);
				}
			}
		} else if (r.status === "new") {
			hasChanges = true;
			console.log(
				`\n\x1b[33m── ${r.label} (new package, no golden file yet) ──\x1b[0m`,
			);
			console.log(
				"  Run `pnpm public-api:update` to generate the initial golden file.",
			);
		}
	}

	// Summary
	console.log("");
	for (const { label, status } of results) {
		const icon =
			status === "ok"
				? "\x1b[32m✓\x1b[0m"
				: status === "updated"
					? "\x1b[33m↻\x1b[0m"
					: status === "new"
						? "\x1b[33m+\x1b[0m"
						: "\x1b[31m✗\x1b[0m";
		console.log(`  ${icon} ${label} (${status})`);
	}

	console.log(
		`\n  ${results.length} entry points checked in ${elapsed}s (${workerCount} workers)`,
	);

	if (hasChanges && !isUpdate) {
		console.error(
			"\nPublic API surface has changed. Run `pnpm public-api:update` and commit the updated files.",
		);
		process.exit(1);
	}

	// Cleanup temp
	fs.rmSync(TEMP_DIR, { recursive: true, force: true });
}
