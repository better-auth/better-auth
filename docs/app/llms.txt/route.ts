import { NextResponse } from "next/server";
import { source } from "@/lib/source";

export const revalidate = false;

interface PageInfo {
	title: string;
	description: string;
	url: string;
	category: string;
}

function groupPagesByCategory(pages: any[]): Map<string, PageInfo[]> {
	const grouped = new Map<string, PageInfo[]>();

	for (const page of pages) {
		// Skip openapi pages
		if (page.slugs[0] === "openapi") continue;

		const category = page.slugs[0] || "general";
		const pageInfo: PageInfo = {
			title: page.data.title,
			description: page.data.description || "",
			url: `/llms.txt${page.url}.md`,
			category: category,
		};

		if (!grouped.has(category)) {
			grouped.set(category, []);
		}
		grouped.get(category)!.push(pageInfo);
	}

	return grouped;
}

function formatCategoryName(category: string): string {
	return category
		.split("-")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

export async function GET() {
	const pages = source.getPages();
	const groupedPages = groupPagesByCategory(pages);

	let content = `# Better Auth

> The most comprehensive authentication framework for TypeScript

## Table of Contents

`;

	const sortedCategories = Array.from(groupedPages.keys()).sort();

	for (const category of sortedCategories) {
		const categoryPages = groupedPages.get(category)!;
		const formattedCategory = formatCategoryName(category);

		content += `### ${formattedCategory}\n\n`;

		for (const page of categoryPages) {
			const description = page.description ? `: ${page.description}` : "";
			content += `- [${page.title}](${page.url})${description}\n`;
		}

		content += "\n";
	}

	return new NextResponse(content, {
		headers: {
			"Content-Type": "text/markdown",
		},
	});
}
