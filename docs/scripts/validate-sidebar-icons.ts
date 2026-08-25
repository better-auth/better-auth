import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { authenticationIcons } from "../components/icons/authentication.tsx";
import { brandIcons } from "../components/icons/brands.tsx";
import type { IconKey } from "../components/icons/index.tsx";
import { Icons } from "../components/icons/index.tsx";
import { pageIcons as pageIconRegistry } from "../components/icons/pages.tsx";
import { pluginIcons } from "../components/icons/plugins.tsx";
import { sectionIcons as sectionIconRegistry } from "../components/icons/sections.tsx";

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
	return key in Icons;
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
		const meta = JSON.parse(readFileSync(file, "utf8")) as {
			title: string;
			icon?: string;
		};
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
			.split("/");
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
	const meta = JSON.parse(readFileSync(file, "utf8")) as { icon?: string };
	if (meta.icon) renderIcon(meta.icon, file);
}

const hash = createHash("sha256")
	.update(JSON.stringify({ sections: sectionIcons, pages: pageIcons }))
	.digest("hex");
const expectedHash =
	"873e195b76a3984e38731f0ee2f8c11fcebc4f0c41cdd44187cc1fa73c4c6129";

if (sectionIcons.length !== 10) {
	errors.push(`expected 10 section icons, received ${sectionIcons.length}`);
}
if (pageIcons.length !== 156) {
	errors.push(`expected 156 page icons, received ${pageIcons.length}`);
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
