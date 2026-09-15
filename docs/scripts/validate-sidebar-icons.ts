import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as z from "zod";
import { authenticationIcons } from "../components/icons/authentication.tsx";
import { brandIcons } from "../components/icons/brands.tsx";
import type { IconKey } from "../components/icons/index.tsx";
import { Icons } from "../components/icons/index.tsx";
import { pageIcons as pageIconRegistry } from "../components/icons/pages.tsx";
import { pluginIcons } from "../components/icons/plugins.tsx";
import { sectionIcons as sectionIconRegistry } from "../components/icons/sections.tsx";
import { docsVersionSources } from "../lib/docs-version-sources.ts";
import { docsVersions } from "../lib/docs-versions.ts";

const sectionMetaSchema = z.object({
	title: z.string(),
	icon: z.string().optional(),
});
const iconMetaSchema = z.object({ icon: z.string().optional() });

const contentDirectory = "content/docs";
const errors: string[] = [];
const iconGroups = [
	brandIcons,
	sectionIconRegistry,
	authenticationIcons,
	pluginIcons,
	pageIconRegistry,
];
const iconKeyCounts = new Map<string, number>();

for (const iconGroup of iconGroups) {
	for (const key of Object.keys(iconGroup)) {
		iconKeyCounts.set(key, (iconKeyCounts.get(key) ?? 0) + 1);
	}
}

const duplicateIconKeys = [...iconKeyCounts]
	.filter(([, count]) => count > 1)
	.map(([key]) => key);

if (duplicateIconKeys.length > 0) {
	errors.push(`duplicate icon keys: ${duplicateIconKeys.join(", ")}`);
}

function hasIcon(key: string): key is IconKey {
	return Object.hasOwn(Icons, key);
}

function renderIcon(key: string, source: string) {
	if (!hasIcon(key)) {
		errors.push(`${source}: unknown icon ${key}`);
		return "";
	}
	return renderToStaticMarkup(createElement(Icons[key]));
}

function getFiles(directory: string, fileName: string): string[] {
	const files: string[] = [];
	for (const item of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, item.name);
		if (item.isDirectory()) files.push(...getFiles(path, fileName));
		else if (item.name === fileName || item.name.endsWith(fileName)) {
			files.push(path);
		}
	}
	return files;
}

const sectionMetaFiles = [
	"content/docs/meta.json",
	"content/docs/concepts/meta.json",
	"content/docs/authentication/meta.json",
	"content/docs/adapters/meta.json",
	"content/docs/integrations/meta.json",
	"content/docs/infrastructure/meta.json",
	"content/docs/plugins/meta.json",
	"content/docs/guides/meta.json",
	"content/docs/ai-resources/meta.json",
	"content/docs/reference/meta.json",
];
const sectionIcons = sectionMetaFiles
	.map((file) => {
		const meta = sectionMetaSchema.parse(
			JSON.parse(readFileSync(file, "utf8")),
		);
		if (!meta.icon) errors.push(`${file}: missing icon`);
		return [meta.title, renderIcon(meta.icon ?? "", file)];
	})
	.toSorted(([left], [right]) => left.localeCompare(right));

const pageIcons = getFiles(contentDirectory, ".mdx")
	.flatMap((file) => {
		const content = readFileSync(file, "utf8");
		const key = content.match(/^icon:\s*(\S+)$/m)?.[1];
		if (!key) return [];
		const segments = relative(contentDirectory, file)
			.replace(/\.mdx$/, "")
			.split(/[\\/]/);
		if (segments.at(-1) === "index") segments.pop();
		const href = `/docs/${segments.join("/")}`.replace(/\/$/, "");
		return [[href, renderIcon(key, file)]];
	})
	.toSorted(([left], [right]) => left.localeCompare(right));

const aiMeta = readFileSync("content/docs/ai-resources/meta.json", "utf8");
const llmsIcon = aiMeta.match(
	/"\[([^\]"]+)\]\[LLMs\.txt\]\(\/llms\.txt\)"/,
)?.[1];
if (!llmsIcon)
	errors.push("content/docs/ai-resources/meta.json: missing LLMs.txt icon");
pageIcons.push([
	"/llms.txt",
	renderIcon(llmsIcon ?? "", "content/docs/ai-resources/meta.json"),
]);
pageIcons.sort(([left], [right]) => left.localeCompare(right));

for (const file of getFiles(contentDirectory, "meta.json")) {
	const meta = iconMetaSchema.parse(JSON.parse(readFileSync(file, "utf8")));
	if (meta.icon) renderIcon(meta.icon, file);
}

for (const version of docsVersions) {
	if (version.id === "latest") continue;
	const versionContentDirectory = join(
		"content",
		docsVersionSources[version.id].contentDirectory,
	);
	if (!existsSync(versionContentDirectory)) {
		errors.push(
			`${versionContentDirectory}: no MDX files found. Run sync-versions first.`,
		);
		continue;
	}
	const mdxFiles = getFiles(versionContentDirectory, ".mdx");
	if (mdxFiles.length === 0) {
		errors.push(
			`${versionContentDirectory}: no MDX files found. Run sync-versions first.`,
		);
		continue;
	}
	for (const file of mdxFiles) {
		const content = readFileSync(file, "utf8");
		const icon = content.match(/^icon:\s*(\S+)$/m)?.[1];
		if (icon) renderIcon(icon, file);
	}
	for (const file of getFiles(versionContentDirectory, "meta.json")) {
		const meta = iconMetaSchema.parse(JSON.parse(readFileSync(file, "utf8")));
		if (meta.icon) renderIcon(meta.icon, file);
	}
}

const hash = createHash("sha256")
	.update(JSON.stringify({ sections: sectionIcons, pages: pageIcons }))
	.digest("hex");
const expectedHash =
	"b33770f8b787a3cbaf19ac9f6c2f2a91edb027a78da818c8fdaaf84667ef5bd4";

if (sectionIcons.length !== 10) {
	errors.push(`expected 10 section icons, received ${sectionIcons.length}`);
}
if (pageIcons.length !== 157) {
	errors.push(`expected 157 page icons, received ${pageIcons.length}`);
}
if (hash !== expectedHash) {
	errors.push(
		`registry hash differs from origin/main: expected ${expectedHash}, received ${hash}`,
	);
}
if (errors.length > 0) {
	throw new Error(`Sidebar icon validation failed:\n${errors.join("\n")}`);
}

console.log(
	`[validate-sidebar-icons] ${sectionIcons.length} sections and ${pageIcons.length} page icons matched origin/main`,
);
