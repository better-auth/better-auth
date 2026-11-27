import { spawn } from "node:child_process";
import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as z from "zod";
import { docsVersionSources } from "../lib/docs-version-sources.ts";
import { docsVersions } from "../lib/docs-versions.ts";

const packageMetadataSchema = z.object({ version: z.string() });

const repo =
	process.env.DOCS_SYNC_REPO ??
	"https://github.com/better-auth/better-auth.git";
const docsRoot = fileURLToPath(new URL("..", import.meta.url));
const repositoryRoot = dirname(docsRoot);
const remotePath = "docs/content/docs";
const packagePath = "packages/better-auth/package.json";
const tempRoot = join(docsRoot, ".docs-sync-tmp");
const repositoryDirectory = join(tempRoot, "repository");
const releaseVersionsPath = join(
	docsRoot,
	"content",
	"_generated",
	"docs",
	"release-versions.json",
);
const localReleaseVersion = await readPackageVersion(
	join(repositoryRoot, packagePath),
);
const localVersion = docsVersions.find((version) =>
	localReleaseVersion.startsWith(`${version.releaseLine}.`),
);
if (!localVersion) {
	throw new Error(
		`No documentation version configured for ${localReleaseVersion}`,
	);
}
const versionsToSync = docsVersions.flatMap((version) => {
	const source = docsVersionSources[version.id];
	if (version.id === localVersion.id) return [];
	return [{ ...version, ...source }];
});

function git(args: string[], cwd?: string) {
	return new Promise<void>((resolve, reject) => {
		const child = spawn("git", args, {
			cwd,
			stdio: ["ignore", "inherit", "inherit"],
		});
		child.once("error", reject);
		child.once("close", (code, signal) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(
				new Error(
					`git ${args.join(" ")} failed${signal ? ` with signal ${signal}` : ` with code ${code}`}`,
				),
			);
		});
	});
}

async function readPackageVersion(path: string) {
	return packageMetadataSchema.parse(JSON.parse(await readFile(path, "utf8")))
		.version;
}

async function prepareWorktree(version: (typeof versionsToSync)[number]) {
	const revision = `refs/docs-versions/${version.id.replaceAll(".", "-")}`;
	const checkoutDirectory = resolve(
		tempRoot,
		"worktrees",
		version.id.replaceAll(".", "-"),
	);
	await git([
		"-C",
		repositoryDirectory,
		"worktree",
		"add",
		"--detach",
		"--no-checkout",
		checkoutDirectory,
		revision,
	]);
	await git(["-C", checkoutDirectory, "sparse-checkout", "init", "--cone"]);
	await git([
		"-C",
		checkoutDirectory,
		"sparse-checkout",
		"set",
		remotePath,
		"packages/better-auth",
	]);
	await git([
		"-C",
		checkoutDirectory,
		"checkout",
		"--quiet",
		"--detach",
		revision,
	]);
	return { checkoutDirectory, version };
}

async function syncVersion({
	checkoutDirectory,
	version,
}: Awaited<ReturnType<typeof prepareWorktree>>) {
	const destination = join(docsRoot, "content", version.contentDirectory);
	const sourceRevision =
		checkoutDirectory === repositoryRoot
			? "local"
			: (version.commitSha?.slice(0, 9) ?? "HEAD");
	console.log(
		`[sync-versions] ${version.editBranch}@${sourceRevision}:${remotePath} → ${destination}`,
	);
	const sourcePath = join(checkoutDirectory, remotePath);
	try {
		await access(sourcePath);
	} catch (cause) {
		throw new Error(
			`Source path not found after sparse checkout: ${sourcePath}`,
			{ cause },
		);
	}

	const releaseVersion = await readPackageVersion(
		join(checkoutDirectory, packagePath),
	);
	if (!releaseVersion.startsWith(`${version.releaseLine}.`)) {
		throw new Error(
			`Invalid release version for ${version.id}: expected ${version.releaseLine}.x, received ${releaseVersion}`,
		);
	}
	await rm(destination, { recursive: true, force: true });
	await cp(sourcePath, destination, { recursive: true });
	await writeFile(join(destination, ".gitkeep"), "");
	return [version.id, releaseVersion] as const;
}

try {
	await rm(tempRoot, { recursive: true, force: true });
	await mkdir(join(tempRoot, "worktrees"), { recursive: true });
	await git(["init", "--quiet", repositoryDirectory]);
	await git(["-C", repositoryDirectory, "remote", "add", "origin", repo]);

	await git([
		"-C",
		repositoryDirectory,
		"fetch",
		"--quiet",
		"--depth=1",
		"--filter=blob:none",
		"origin",
		...versionsToSync.map(
			(version) =>
				`+${version.commitSha ?? version.editBranch}:refs/docs-versions/${version.id.replaceAll(".", "-")}`,
		),
	]);

	const worktrees = [
		{
			checkoutDirectory: repositoryRoot,
			version: { ...localVersion, ...docsVersionSources[localVersion.id] },
		},
	];
	for (const version of versionsToSync) {
		worktrees.push(await prepareWorktree(version));
	}
	const results = await Promise.allSettled(worktrees.map(syncVersion));
	const failures = results.flatMap((result) =>
		result.status === "rejected" ? [result.reason] : [],
	);
	if (failures.length > 0) {
		throw new AggregateError(
			failures,
			"One or more documentation versions failed to sync",
		);
	}
	const releaseVersions = Object.fromEntries(
		results.flatMap((result) =>
			result.status === "fulfilled" ? [result.value] : [],
		),
	);
	await writeFile(
		releaseVersionsPath,
		`${JSON.stringify(releaseVersions, null, 2)}\n`,
	);
	console.log("[sync-versions] done");
} finally {
	await rm(tempRoot, { recursive: true, force: true });
}
