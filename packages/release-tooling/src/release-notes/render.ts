import { readFileSync, writeFileSync } from "node:fs";
import {
	containsUnsupportedGeneratedMarkdown,
	formatUntrustedInlineMarkdown,
	inlineCodeValues,
} from "../ai/generated-copy.ts";
import { FILTERED_DOMAINS } from "../change-classifier.ts";
import type {
	GeneratedReleaseRewrites,
	ReleaseEntry,
	ReleaseManifest,
	ReleaseRewrites,
} from "./schema.ts";
import {
	parseSchema,
	releaseManifestSchema,
	releaseRewritesSchema,
} from "./schema.ts";

const CHANGE_TYPE_HEADINGS = {
	breaking: "### ❗ Breaking Changes",
	feat: "### Features",
	fix: "### Bug Fixes",
} satisfies Record<ReleaseEntry["changeType"], string>;

const CHANGE_TYPE_ORDER = ["breaking", "feat", "fix"] as const;

export function isReleaseEntryVisible(entry: ReleaseEntry): boolean {
	return !FILTERED_DOMAINS.has(entry.domain) || !!entry.changesetDescription;
}

function formatPrLink(entry: ReleaseEntry, repository: string): string {
	return entry.prNumber
		? ` ([#${entry.prNumber}](https://github.com/${repository}/pull/${entry.prNumber}))`
		: "";
}

function formatActionLines(
	entry: ReleaseEntry,
	migration: string | undefined,
	prLink: string,
): string[] {
	if (migration) return [`- ${migration}${prLink}`];
	if (entry.changeType !== "breaking") return [];
	// Without a reviewed action, name the change and let its changeset explain.
	const titleLine = `- ${formatUntrustedInlineMarkdown(entry.title)}${prLink}`;
	if (
		!entry.changesetDescription ||
		containsUnsupportedGeneratedMarkdown(
			entry.changesetDescription,
			"description",
		)
	) {
		return [titleLine];
	}
	return [
		titleLine,
		"",
		...entry.changesetDescription
			.split("\n")
			.map((line) => (line ? `  ${line}` : "")),
	];
}

export function formatReleaseBody(
	manifest: ReleaseManifest,
	rewrites: ReleaseRewrites = {},
): string {
	const { repository, version, entries, previousTag, packageMetadata } =
		manifest;
	const lines: string[] = [];

	const minorMatch = version.match(/^(\d+)\.(\d+)\.0$/);
	if (minorMatch) {
		const blogSlug = `${minorMatch[1]}-${minorMatch[2]}`;
		lines.push(
			`**Blog post:** [Better Auth ${minorMatch[1]}.${minorMatch[2]}](https://better-auth.com/blog/${blogSlug})`,
			"",
		);
	}

	// Collected above every package so a change that spans packages, or one in a
	// package users never install directly, still reaches everyone once.
	const actions = new Map<string, string[]>();
	for (const entry of entries) {
		if (!isReleaseEntryVisible(entry) || actions.has(entry.rewriteKey))
			continue;
		const actionLines = formatActionLines(
			entry,
			rewrites[entry.rewriteKey]?.migration,
			formatPrLink(entry, repository),
		);
		if (actionLines.length > 0) actions.set(entry.rewriteKey, actionLines);
	}
	if (actions.size > 0) {
		lines.push(
			"> [!IMPORTANT]",
			"> **Action required**",
			">",
			...[...actions.values()].flat().map((line) => (line ? `> ${line}` : ">")),
			"",
		);
	}

	const grouped = new Map<string, ReleaseEntry[]>();
	const contributors = new Set<string>();

	for (const entry of entries) {
		if (!isReleaseEntryVisible(entry)) continue;
		const list = grouped.get(entry.packageName) ?? [];
		list.push(entry);
		grouped.set(entry.packageName, list);
		if (entry.author !== "unknown") contributors.add(entry.author);
	}

	const packageOrder = [...grouped.keys()].sort((a, b) => {
		if (a === "better-auth") return -1;
		if (b === "better-auth") return 1;
		const aBreaking = grouped
			.get(a)!
			.filter((entry) => entry.changeType === "breaking").length;
		const bBreaking = grouped
			.get(b)!
			.filter((entry) => entry.changeType === "breaking").length;
		if (aBreaking !== bBreaking) return bBreaking - aBreaking;
		const aTotal = grouped.get(a)!.length;
		const bTotal = grouped.get(b)!.length;
		if (aTotal !== bTotal) return bTotal - aTotal;
		return a.localeCompare(b);
	});

	for (const packageName of packageOrder) {
		const packageEntries = grouped.get(packageName)!;
		const metadata = packageMetadata[packageName];
		if (!metadata) {
			throw new Error(
				`Release manifest is missing metadata for ${packageName}`,
			);
		}

		lines.push(
			metadata.newPackage
				? `## \`${packageName}\` ✨`
				: `## \`${packageName}\``,
			"",
		);

		for (const changeType of CHANGE_TYPE_ORDER) {
			const entriesForType = packageEntries.filter(
				(entry) => entry.changeType === changeType,
			);
			if (entriesForType.length === 0) continue;

			entriesForType.sort((a, b) => a.title.localeCompare(b.title));
			lines.push(CHANGE_TYPE_HEADINGS[changeType]!, "");

			for (const entry of entriesForType) {
				const rewrite = rewrites[entry.rewriteKey];
				const title =
					rewrite?.title ?? formatUntrustedInlineMarkdown(entry.title);
				lines.push(`- ${title}${formatPrLink(entry, repository)}`);
			}
			lines.push("");
		}

		lines.push(
			metadata.referenceLabel === "CHANGELOG"
				? `For detailed changes, see [\`${metadata.referenceLabel}\`](${metadata.referenceUrl})`
				: `For package details, see [\`${metadata.referenceLabel}\`](${metadata.referenceUrl})`,
			"",
		);
	}

	if (contributors.size > 0) {
		lines.push(
			"## Contributors",
			"",
			"Thanks to everyone who contributed to this release:",
			"",
		);
		const sorted = [...contributors].sort((a, b) =>
			a.toLowerCase().localeCompare(b.toLowerCase()),
		);
		lines.push(sorted.map((contributor) => `@${contributor}`).join(", "), "");
	}

	const currentTag = `v${version}`;
	lines.push(
		`**Full changelog:** [\`${previousTag}...${currentTag}\`](https://github.com/${repository}/compare/${previousTag}...${currentTag})`,
	);

	return lines.join("\n");
}

function readReleaseManifest(path: string): ReleaseManifest {
	return parseSchema(
		releaseManifestSchema,
		JSON.parse(readFileSync(path, "utf-8")),
		`Invalid release manifest ${path}`,
	);
}

function readReleaseRewrites(
	path: string,
	manifest: ReleaseManifest,
): ReleaseRewrites {
	const parsed = parseSchema(
		releaseRewritesSchema,
		JSON.parse(readFileSync(path, "utf-8")),
		"AI rewrite output must contain a valid rewrites array",
	);

	const expectedIds = [
		...new Set(manifest.entries.map((entry) => entry.rewriteKey)),
	].sort();
	const actualIds = parsed.rewrites.map((rewrite) => rewrite.id).sort();
	const expectedIdSet = new Set(expectedIds);
	const actualIdSet = new Set(actualIds);
	if (
		actualIdSet.size !== actualIds.length ||
		actualIds.some((id) => !expectedIdSet.has(id))
	) {
		throw new Error(
			`AI rewrite IDs did not match the manifest: expected ${expectedIds.join(", ")}, received ${actualIds.join(", ")}`,
		);
	}
	const generatedByKey = new Map(
		parsed.rewrites.map((rewrite) => [rewrite.id, rewrite]),
	);

	const entriesByKey = new Map(
		manifest.entries.map((entry) => [entry.rewriteKey, entry]),
	);
	const rewrites: ReleaseRewrites = {};
	for (const [key, value] of generatedByKey) {
		try {
			rewrites[key] = validateGeneratedReleaseRewrite(
				value,
				entriesByKey.get(key)!,
			);
		} catch (error) {
			console.warn(
				`Using deterministic copy for ${key}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	return rewrites;
}

export function validateGeneratedReleaseRewrite(
	value: GeneratedReleaseRewrites[number],
	{
		changeType,
		changesetDescription,
	}: Pick<ReleaseEntry, "changeType" | "changesetDescription">,
): ReleaseRewrites[string] {
	const title = validateGeneratedCopy(value.title, "title", value.id, 300);
	const migration =
		value.migration === null
			? undefined
			: validateGeneratedCopy(value.migration, "migration", value.id, 500);

	if (changeType === "breaking" && !migration) {
		throw new Error(
			`Breaking AI rewrite ${value.id} must have a single-line migration`,
		);
	}

	// Users act on this line, so it may only quote code a maintainer approved.
	const quotedCode = inlineCodeValues(migration ?? "");
	if (quotedCode.some((code) => !changesetDescription?.includes(code))) {
		throw new Error(
			`AI rewrite ${value.id} migration quotes code that is not in the changeset`,
		);
	}

	return migration ? { title, migration } : { title };
}

function validateGeneratedCopy(
	value: string,
	field: "title" | "migration",
	key: string,
	maximumLength: number,
): string {
	const copy = value.trim();
	if (!copy || copy.includes("\n") || copy.includes("\r")) {
		throw new Error(`AI rewrite ${key} must have a single-line ${field}`);
	}
	if (copy.length > maximumLength) {
		throw new Error(
			`AI rewrite ${key} ${field} exceeds ${maximumLength} characters`,
		);
	}

	if (containsUnsupportedGeneratedMarkdown(copy, "inline")) {
		throw new Error(`AI rewrite ${key} ${field} contains unsupported Markdown`);
	}
	return copy;
}

export function applyReleaseRewrites(
	manifestPath: string,
	rewritesPath: string,
	outputPath: string,
): void {
	const manifest = readReleaseManifest(manifestPath);
	const rewrites = readReleaseRewrites(rewritesPath, manifest);
	writeFileSync(outputPath, formatReleaseBody(manifest, rewrites));
	console.log(`Wrote AI-rewritten release notes to ${outputPath}`);
}
