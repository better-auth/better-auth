import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import * as z from "zod";

const metaSchema = z.object({
	pages: z.array(z.string()),
	pagesIndex: z.string().optional(),
});

const contentDirectories = process.argv.slice(2);
if (contentDirectories.length === 0) contentDirectories.push("content/docs");

const errors: string[] = [];

function isNavigationSyntax(entry: string) {
	return (
		entry.startsWith("---") ||
		entry.startsWith("[") ||
		entry.startsWith("external:[") ||
		entry === "..." ||
		entry === "z...a"
	);
}

function getEntryPath(entry: string) {
	return entry.replace(/^!/, "").replace(/^\.\.\./, "");
}

function entryExists(directory: string, entry: string) {
	const entryPath = getEntryPath(entry);
	return [
		join(directory, entryPath),
		join(directory, `${entryPath}.mdx`),
		join(directory, entryPath, "index.mdx"),
	].some(existsSync);
}

function validateDirectory(directory: string) {
	const metaPath = join(directory, "meta.json");
	if (!existsSync(metaPath)) {
		errors.push(`${directory}: missing meta.json`);
		return;
	}

	const meta = metaSchema.parse(JSON.parse(readFileSync(metaPath, "utf8")));
	const pages = meta.pages;
	const paths = pages.filter((entry) => !isNavigationSyntax(entry));
	const mentioned = new Set(paths.map(getEntryPath));
	const excluded = new Set(
		paths.filter((entry) => entry.startsWith("!")).map(getEntryPath),
	);
	const hasRest = pages.includes("...") || pages.includes("z...a");

	for (const entry of paths) {
		if (!entryExists(directory, entry)) {
			errors.push(`${metaPath}: unresolved entry ${entry}`);
		}
	}
	if (meta.pagesIndex && !entryExists(directory, meta.pagesIndex)) {
		errors.push(`${metaPath}: unresolved pagesIndex ${meta.pagesIndex}`);
	}

	for (const item of readdirSync(directory, { withFileTypes: true })) {
		if (item.name === "meta.json" || item.name === ".gitkeep") continue;
		const name = item.isDirectory()
			? item.name
			: item.name.replace(/\.mdx$/, "");
		if (!hasRest && !mentioned.has(name) && meta.pagesIndex !== name) {
			errors.push(`${metaPath}: ${item.name} is not represented in pages`);
		}
		if (item.isDirectory() && !excluded.has(name)) {
			validateDirectory(join(directory, item.name));
		}
	}
}

for (const contentDirectory of contentDirectories) {
	if (!existsSync(contentDirectory)) {
		errors.push(`${contentDirectory}: directory does not exist`);
		continue;
	}
	validateDirectory(contentDirectory);
}

if (errors.length > 0) {
	throw new Error(`Invalid documentation metadata:\n${errors.join("\n")}`);
}

console.log(
	`[validate-meta] ${contentDirectories.map((path) => basename(path)).join(", ")} passed`,
);
