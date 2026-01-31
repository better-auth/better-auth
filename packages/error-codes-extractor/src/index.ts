import type { Stats } from "node:fs";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import type { Plugin } from "rolldown";
import ts from "typescript";

export interface ErrorCodeEntry {
	code: string;
	message: string;
	file: string;
	category: string;
	description?: string;
	markdownContent?: string;
}

export interface ErrorCodesExtractorOptions {
	/**
	 * Source directory to scan for error codes
	 * @default "src"
	 */
	srcDir?: string;

	/**
	 * Output file path for the generated markdown
	 * @default "ERROR_CODES.md"
	 */
	outputFile?: string;

	/**
	 * Output format for documentation
	 * - "single": Generate a single markdown file with all error codes
	 * - "docs": Generate individual MDX files for each error code (for documentation sites)
	 * @default "single"
	 */
	outputFormat?: "single" | "docs";

	/**
	 * Output directory for docs format (when outputFormat is "docs")
	 * @default "docs/content/docs/reference/errors"
	 */
	docsOutputDir?: string;

	/**
	 * Custom category resolver function
	 */
	getCategoryFromPath?: (filePath: string, constantName: string) => string;
}

/**
 * Rolldown plugin to extract and document error codes from TypeScript files
 * that use `defineErrorCodes` from Better Auth.
 *
 * @example
 * ```typescript
 * import { defineConfig } from "tsdown";
 * import { errorCodesExtractor } from "@better-auth/error-codes-extractor";
 *
 * export default defineConfig({
 *   plugins: [errorCodesExtractor()],
 * });
 * ```
 */
export function errorCodesExtractor(
	options: ErrorCodesExtractorOptions = {},
): Plugin {
	const {
		srcDir = "src",
		outputFile = "ERROR_CODES.md",
		outputFormat = "single",
		docsOutputDir = "docs/content/docs/reference/errors",
		getCategoryFromPath = defaultGetCategoryFromPath,
	} = options;

	return {
		name: "error-codes-extractor",
		buildEnd() {
			const errorCodes: ErrorCodeEntry[] = [];
			const srcDirPath = join(process.cwd(), srcDir);

			function extractJSDoc(
				node: ts.Node,
				sourceFile: ts.SourceFile,
			): {
				description?: string;
				markdownContent?: string;
			} {
				// Extract the full JSDoc comment content
				const jsDoc = ts.getJSDocCommentsAndTags(node);
				let description: string | undefined;
				let markdownContent: string | undefined;

				if (jsDoc.length > 0) {
					const firstDoc = jsDoc[0]!;
					if (ts.isJSDoc(firstDoc)) {
						// Get the raw comment text
						const fullText = sourceFile.getFullText();
						const start = firstDoc.getStart(sourceFile);
						const end = firstDoc.getEnd();
						const commentText = fullText.substring(start, end);

						// Parse the comment to extract @description and markdown content
						const lines = commentText.split("\n");
						let inDescription = false;
						const descriptionLines: string[] = [];
						const markdownLines: string[] = [];
						let afterDescription = false;

						for (const line of lines) {
							// Skip /** and */ lines before processing
							const rawTrimmed = line.trim();
							if (
								rawTrimmed === "/**" ||
								rawTrimmed === "*/" ||
								rawTrimmed.startsWith("/**") ||
								rawTrimmed === "*"
							) {
								continue;
							}

							// Remove leading whitespace and asterisk, preserve indentation after
							const processed = line.replace(/^\s*\*\s?/, "");
							const trimmed = processed.trim();

							// Skip empty lines
							if (trimmed === "") {
								continue;
							}

							// Check for @description tag
							if (trimmed.startsWith("@description")) {
								inDescription = true;
								// Get the description text on the same line
								const descText = trimmed
									.substring("@description".length)
									.trim();
								if (descText) {
									descriptionLines.push(descText);
								}
								continue;
							}

							// If we're in description and hit another @tag, stop
							if (
								inDescription &&
								trimmed.startsWith("@") &&
								!trimmed.startsWith("@description")
							) {
								inDescription = false;
								afterDescription = true;
							}

							// Collect description lines
							if (inDescription && !trimmed.startsWith("@")) {
								// If this is a markdown header or other markdown, switch to afterDescription mode
								if (trimmed.startsWith("#")) {
									inDescription = false;
									afterDescription = true;
									markdownLines.push(processed);
								} else {
									descriptionLines.push(trimmed);
								}
							}
							// Collect markdown lines after description (preserve indentation)
							else if (afterDescription && !trimmed.startsWith("@")) {
								markdownLines.push(processed);
							}
							// If no @description tag found, treat everything as markdown
							else if (
								!inDescription &&
								!afterDescription &&
								!trimmed.startsWith("@")
							) {
								markdownLines.push(processed);
							}
						}

						description = descriptionLines.join(" ").trim() || undefined;
						markdownContent = markdownLines.join("\n").trim() || undefined;
					}
				}

				return { description, markdownContent };
			}

			function extractFromFile(filePath: string, content: string) {
				const sourceFile = ts.createSourceFile(
					filePath,
					content,
					ts.ScriptTarget.Latest,
					true,
				);

				const relativePath = relative(srcDirPath, filePath);

				function visit(node: ts.Node) {
					// Look for variable declarations with defineErrorCodes
					if (ts.isVariableStatement(node)) {
						for (const declaration of node.declarationList.declarations) {
							if (
								ts.isVariableDeclaration(declaration) &&
								declaration.initializer &&
								ts.isCallExpression(declaration.initializer)
							) {
								const callExpr = declaration.initializer;
								const calleeName = callExpr.expression.getText(sourceFile);

								if (calleeName === "defineErrorCodes") {
									const constantName = declaration.name.getText(sourceFile);
									const category = getCategoryFromPath(
										relativePath,
										constantName,
									);

									// Extract JSDoc from the variable statement
									const jsDocInfo = extractJSDoc(node, sourceFile);

									// Get the object literal argument
									const objectLiteral = callExpr.arguments[0];
									if (
										objectLiteral &&
										ts.isObjectLiteralExpression(objectLiteral)
									) {
										for (const property of objectLiteral.properties) {
											if (ts.isPropertyAssignment(property)) {
												const code = property.name.getText(sourceFile);
												const initializer = property.initializer;

												let message = "";
												if (ts.isStringLiteral(initializer)) {
													message = initializer.text;
												}

												// Extract JSDoc for individual property
												const propJSDoc = extractJSDoc(property, sourceFile);

												errorCodes.push({
													code,
													message,
													file: relativePath,
													category,
													description:
														propJSDoc.description || jsDocInfo.description,
													markdownContent:
														propJSDoc.markdownContent ||
														jsDocInfo.markdownContent,
												});
											}
										}
									}
								}
							}
						}
					}

					ts.forEachChild(node, visit);
				}

				visit(sourceFile);
			}

			// Recursively find all files that might contain error codes
			function scanDirectory(dir: string) {
				try {
					const files = readdirSync(dir);
					for (const file of files) {
						const fullPath = join(dir, file);
						let stat: Stats | undefined;
						try {
							stat = statSync(fullPath);
						} catch (_error) {
							continue;
						}

						if (stat.isDirectory()) {
							scanDirectory(fullPath);
						} else if (
							file.endsWith(".ts") &&
							!file.endsWith(".test.ts") &&
							!file.endsWith(".spec.ts")
						) {
							try {
								const content = readFileSync(fullPath, "utf-8");

								// Check if file contains defineErrorCodes
								if (content.includes("defineErrorCodes")) {
									extractFromFile(fullPath, content);
								}
							} catch (error) {
								console.warn(`Failed to read ${fullPath}:`, error);
							}
						}
					}
				} catch (error) {
					console.warn(`Failed to scan directory ${dir}:`, error);
				}
			}

			// Scan directory
			scanDirectory(srcDirPath);

			// Group error codes by category
			const categorized = new Map<string, ErrorCodeEntry[]>();
			for (const entry of errorCodes) {
				if (!categorized.has(entry.category)) {
					categorized.set(entry.category, []);
				}
				categorized.get(entry.category)!.push(entry);
			}

			// Generate markdown content
			let markdown = "# Better Auth Error Codes\n\n";
			markdown +=
				"This document lists all error codes defined in Better Auth.\n\n";
			markdown += `> **Last Updated:** ${new Date().toISOString().split("T")[0]}\n\n`;
			markdown += "---\n\n";

			// Sort categories alphabetically, but put "Core" first
			const sortedCategories = Array.from(categorized.keys()).sort((a, b) => {
				if (a === "Core") return -1;
				if (b === "Core") return 1;
				return a.localeCompare(b);
			});

			for (const category of sortedCategories) {
				const codes = categorized.get(category)!;
				markdown += `## ${category}\n\n`;
				markdown += `**Source:** \`${codes[0]!.file}\`\n\n`;

				// Check if any codes have additional documentation
				const hasExtendedDocs = codes.some(
					(c) => c.description || c.markdownContent,
				);

				if (hasExtendedDocs) {
					// Use detailed format with sections for each error code
					for (const { code, message, description, markdownContent } of codes) {
						markdown += `### \`${code}\`\n\n`;
						markdown += `**Message:** ${message.replace(/\|/g, "\\|")}\n\n`;

						if (description) {
							markdown += `**Description:** ${description.replace(/\|/g, "\\|")}\n\n`;
						}

						if (markdownContent) {
							markdown += `${markdownContent}\n\n`;
						}
					}
				} else {
					// Use compact table format
					markdown += "| Error Code | Message |\n";
					markdown += "|------------|----------|\n";

					for (const { code, message } of codes) {
						// Escape pipe characters in messages for markdown tables
						const escapedMessage = message.replace(/\|/g, "\\|");
						markdown += `| \`${code}\` | ${escapedMessage} |\n`;
					}

					markdown += "\n";
				}

				markdown += "\n";
			}

			// Add summary at the end
			markdown += "---\n\n";
			markdown += `**Total Error Codes:** ${errorCodes.length}\n\n`;
			markdown += `**Categories:** ${sortedCategories.join(", ")}\n`;

			// Write output based on format
			if (outputFormat === "single") {
				// Write single markdown file
				const outputPath = join(process.cwd(), outputFile);
				writeFileSync(outputPath, markdown, "utf-8");
				console.log(
					`\n✓ Extracted ${errorCodes.length} error codes to ${outputFile}`,
				);
			} else if (outputFormat === "docs") {
				// Generate individual MDX files for documentation
				const docsDir = join(process.cwd(), docsOutputDir);

				// Ensure output directory exists
				if (!existsSync(docsDir)) {
					mkdirSync(docsDir, { recursive: true });
				}

				// Generate index file with list of all errors
				generateDocsIndex(errorCodes, docsDir, sortedCategories, categorized);

				// Generate individual MDX files for each error
				let generatedCount = 0;
				for (const entry of errorCodes) {
					generateErrorMdxFile(entry, docsDir);
					generatedCount++;
				}

				console.log(
					`\n✓ Generated ${generatedCount} code documentation files in ${docsOutputDir}`,
				);
			}
		},
	};
}

function generateDocsIndex(
	errorCodes: ErrorCodeEntry[],
	docsDir: string,
	sortedCategories: string[],
	categorized: Map<string, ErrorCodeEntry[]>,
) {
	const indexPath = join(docsDir, "index.mdx");
	const existingCategories = new Map<string, ErrorCodeEntry[]>();

	// Read existing index if it exists to merge categories
	if (existsSync(indexPath)) {
		try {
			const existingContent = readFileSync(indexPath, "utf-8");
			// Parse existing categories and error codes
			const categoryRegex = /## (.+)\n\n([\s\S]*?)(?=\n## |$)/g;
			let match: RegExpExecArray | null;

			while ((match = categoryRegex.exec(existingContent)) !== null) {
				const categoryName = match[1]!.trim();
				const categoryContent = match[2]!;

				// Skip if this category is already in our current batch
				if (categorized.has(categoryName)) {
					continue;
				}

				// Parse error codes from existing category
				const errorRegex = /- \[`([^`]+)`\]\([^)]+\) - (.+)/g;
				const errors: ErrorCodeEntry[] = [];
				let errorMatch: RegExpExecArray | null;

				while ((errorMatch = errorRegex.exec(categoryContent)) !== null) {
					errors.push({
						code: errorMatch[1]!,
						message: errorMatch[2]!,
						file: "",
						category: categoryName,
					});
				}

				if (errors.length > 0) {
					existingCategories.set(categoryName, errors);
				}
			}
		} catch (error) {
			console.warn("Warning: Could not parse existing index.mdx:", error);
		}
	}

	// Merge existing categories with new ones
	for (const [category, codes] of existingCategories) {
		if (!categorized.has(category)) {
			categorized.set(category, codes);
		}
	}

	// Re-sort all categories
	const allCategories = Array.from(categorized.keys()).sort((a, b) => {
		if (a === "Core") return -1;
		if (b === "Core") return 1;
		return a.localeCompare(b);
	});

	let indexContent = `---
title: Error Codes
description: Complete reference of all Better Auth error codes.
---

This section contains all error codes that can occur in Better Auth.

`;

	// Group by category
	for (const category of allCategories) {
		const codes = categorized.get(category)!;
		indexContent += `## ${category}\n\n`;

		for (const { code, message } of codes) {
			const slug = code.toLowerCase();
			indexContent += `- [\`${code}\`](/docs/reference/errors/${slug}) - ${message}\n`;
		}

		indexContent += "\n";
	}

	writeFileSync(indexPath, indexContent, "utf-8");
}

function escapeMdxContent(text: string): string {
	// Escape curly braces outside of code blocks
	// Split by code blocks (triple backticks)
	const parts = text.split(/(```[\s\S]*?```)/);

	return parts
		.map((part, index) => {
			// Don't escape content inside code blocks (odd indices after split)
			if (part.startsWith("```")) {
				return part;
			}
			// Also don't escape inline code
			const inlineParts = part.split(/(`[^`]+`)/);
			return inlineParts
				.map((inlinePart, i) => {
					if (inlinePart.startsWith("`") && inlinePart.endsWith("`")) {
						return inlinePart;
					}
					// Escape curly braces in regular text
					return inlinePart.replace(/\{/g, "\\{").replace(/\}/g, "\\}");
				})
				.join("");
		})
		.join("");
}

function generateErrorMdxFile(entry: ErrorCodeEntry, docsDir: string) {
	const { code, message, description, markdownContent, category } = entry;
	const slug = code.toLowerCase();

	let content = `---
title: ${code}
description: ${message}
---

## What is it?

`;

	// Add description if available
	if (description) {
		content += `${escapeMdxContent(description)}\n\n`;
	} else {
		content += `This error occurs when: ${message.toLowerCase()}\n\n`;
	}

	// Parse sections if we have markdown content
	const sections = markdownContent
		? parseMarkdownSections(markdownContent)
		: {};

	// Add common causes section
	if (sections.commonCauses) {
		content += `## Common Causes\n\n${escapeMdxContent(sections.commonCauses)}\n\n`;
	} else {
		content += `## Common Causes\n\n`;
		content += `* Check the error message details for specific information about what went wrong\n`;
		content += `* Review the context in which this error occurred\n`;
		content += `* Ensure all required parameters and configurations are properly set\n\n`;
	}

	// Add how to resolve section
	if (sections.howToResolve) {
		content += `## How to resolve\n\n${escapeMdxContent(sections.howToResolve)}\n\n`;
	} else {
		content += `## How to resolve\n\n`;
		content += `* Verify the conditions that triggered this error\n`;
		content += `* Check your authentication configuration\n`;
		content += `* Review the Better Auth documentation for more details\n`;
		content += `* If the issue persists, check the Better Auth GitHub issues or Discord community\n\n`;
	}

	// Add example section if available
	if (sections.example) {
		// Don't escape example section as it's typically code
		content += `## Example\n\n${sections.example}\n\n`;
	}

	// Add debug section
	if (sections.debug) {
		content += `## Debug\n\n${escapeMdxContent(sections.debug)}\n`;
	} else {
		content += `## Debug\n\n`;
		content += `* Enable debug logging in Better Auth to get more detailed information\n`;
		content += `* Check the network tab in your browser's DevTools to inspect the request/response\n`;
		content += `* Review server logs for stack traces or additional error context\n`;
		content += `* Verify environment variables and configuration are correctly set\n`;
	}

	writeFileSync(join(docsDir, `${slug}.mdx`), content, "utf-8");
}

function parseMarkdownSections(markdown: string): {
	commonCauses?: string;
	howToResolve?: string;
	example?: string;
	debug?: string;
	additional?: string;
} {
	const sections: {
		commonCauses?: string;
		howToResolve?: string;
		example?: string;
		debug?: string;
		additional?: string;
	} = {};

	// Split by markdown headers
	const lines = markdown.split("\n");
	let currentSection: string | null = null;
	let currentContent: string[] = [];

	for (const line of lines) {
		const headerMatch = line.match(/^##\s+(.+)$/);

		if (headerMatch) {
			// Save previous section
			if (currentSection && currentContent.length > 0) {
				const content = currentContent.join("\n").trim();
				if (currentSection === "common causes") {
					sections.commonCauses = content;
				} else if (
					currentSection === "how to resolve" ||
					currentSection === "resolution"
				) {
					sections.howToResolve = content;
				} else if (currentSection === "example") {
					sections.example = content;
				} else if (currentSection === "debug") {
					sections.debug = content;
				} else {
					sections.additional =
						(sections.additional || "") +
						`## ${currentSection}\n\n${content}\n\n`;
				}
			}

			// Start new section
			currentSection = headerMatch[1]!.toLowerCase().trim();
			currentContent = [];
		} else if (currentSection) {
			currentContent.push(line);
		}
	}

	// Save last section
	if (currentSection && currentContent.length > 0) {
		const content = currentContent.join("\n").trim();
		if (currentSection === "common causes") {
			sections.commonCauses = content;
		} else if (
			currentSection === "how to resolve" ||
			currentSection === "resolution"
		) {
			sections.howToResolve = content;
		} else if (currentSection === "example") {
			sections.example = content;
		} else if (currentSection === "debug") {
			sections.debug = content;
		} else {
			sections.additional =
				(sections.additional || "") + `## ${currentSection}\n\n${content}\n\n`;
		}
	}

	return sections;
}

function defaultGetCategoryFromPath(
	filePath: string,
	constantName: string,
): string {
	// Extract category from constant name (e.g., ADMIN_ERROR_CODES -> Admin)
	const categoryMatch = constantName.match(/^(\w+)_ERROR_CODES?$/);
	if (categoryMatch) {
		const category = categoryMatch[1]!;
		if (category === "BASE") {
			return "Core";
		}
		return category
			.split("_")
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
			.join(" ");
	}

	// Fall back to directory-based category
	const parts = filePath.split("/");
	if (parts.includes("plugins") && parts.length > 2) {
		const pluginName = parts[parts.indexOf("plugins") + 1]!;
		return (
			pluginName.charAt(0).toUpperCase() +
			pluginName.slice(1).replace(/-/g, " ")
		);
	}

	return "Core";
}
