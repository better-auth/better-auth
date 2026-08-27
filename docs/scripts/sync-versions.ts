import { execFile, spawn } from "node:child_process";
import { access, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
// biome-ignore format: Node executes this TypeScript file directly.
import {
	docsVersions,
} from "../lib/docs-versions.ts";

const repo =
	process.env.DOCS_SYNC_REPO ??
	"https://github.com/better-auth/better-auth.git";
const remotePath = "docs/content/docs";
const tempRoot = ".docs-sync-tmp";
const repositoryDirectory = join(tempRoot, "repository");
const releaseVersionsPath = join(
	"content",
	"_generated",
	"docs",
	"release-versions.json",
);
const versionsToSync = docsVersions.filter(
	(version) => version.id !== "latest",
);

if (process.env.DOCS_SYNC_SKIP === "1") {
	console.log("[sync-versions] skipped");
	process.exit(0);
}

const execFileAsync = promisify(execFile);

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

async function gitOutput(args: string[], cwd?: string) {
	const { stdout } = await execFileAsync("git", args, {
		cwd,
		encoding: "utf8",
	});
	return stdout.trim();
}

function branchRef(branch: string) {
	return `refs/remotes/origin/${branch}`;
}

async function resolveReleaseVersion(version: (typeof docsVersions)[number]) {
	const tags = await gitOutput([
		"-C",
		repositoryDirectory,
		"tag",
		"--merged",
		branchRef(version.branch),
		"--list",
		`v${version.releaseLine}.*`,
		"--sort=-version:refname",
	]);
	const escapedReleaseLine = version.releaseLine.replaceAll(".", "\\.");
	const releaseTagPattern = new RegExp(
		version.id === "beta"
			? `^v${escapedReleaseLine}\\.\\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$`
			: `^v${escapedReleaseLine}\\.\\d+$`,
	);
	const tag = tags
		.split("\n")
		.find((candidate) => releaseTagPattern.test(candidate));
	return tag?.slice(1) ?? null;
}

async function prepareWorktree(version: (typeof versionsToSync)[number]) {
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
		branchRef(version.branch),
	]);
	await git(["-C", checkoutDirectory, "sparse-checkout", "init", "--cone"]);
	await git(["-C", checkoutDirectory, "sparse-checkout", "set", remotePath]);
	await git([
		"-C",
		checkoutDirectory,
		"checkout",
		"--quiet",
		"--detach",
		branchRef(version.branch),
	]);
	return { checkoutDirectory, version };
}

async function syncVersion({
	checkoutDirectory,
	version,
}: Awaited<ReturnType<typeof prepareWorktree>>) {
	const destination = join("content", version.contentDirectory);
	console.log(
		`[sync-versions] ${version.branch}:${remotePath} → ${destination}`,
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

	await rm(destination, { recursive: true, force: true });
	await cp(sourcePath, destination, { recursive: true });
	await writeFile(join(destination, ".gitkeep"), "");
}

try {
	await rm(tempRoot, { recursive: true, force: true });
	await mkdir(join(tempRoot, "worktrees"), { recursive: true });
	await git(["init", "--quiet", repositoryDirectory]);
	await git(["-C", repositoryDirectory, "remote", "add", "origin", repo]);

	const branches = [...new Set(docsVersions.map((version) => version.branch))];
	await git([
		"-C",
		repositoryDirectory,
		"fetch",
		"--quiet",
		"--filter=blob:none",
		"origin",
		...branches.map((branch) => `+refs/heads/${branch}:${branchRef(branch)}`),
		"+refs/tags/v*:refs/tags/v*",
	]);

	const releaseVersions = Object.fromEntries(
		await Promise.all(
			docsVersions.map(async (version) => [
				version.id,
				await resolveReleaseVersion(version),
			]),
		),
	);
	await writeFile(
		releaseVersionsPath,
		`${JSON.stringify(releaseVersions, null, 2)}\n`,
	);
	for (const [key, releaseVersion] of Object.entries(releaseVersions)) {
		console.log(`[sync-versions] ${key} → ${releaseVersion ?? "unreleased"}`);
	}

	const worktrees = [];
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
	console.log("[sync-versions] done");
} finally {
	await rm(tempRoot, { recursive: true, force: true });
}
