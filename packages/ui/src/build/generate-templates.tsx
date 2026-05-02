/**
 * Build script to generate HTML templates from React components.
 * Run this at build time to create static HTML strings for each page.
 */

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
	SignInTemplate,
	SignUpTemplate,
	ForgotPasswordTemplate,
	ResetPasswordTemplate,
	VerifyEmailTemplate,
	ProfileTemplate,
	PageWrapper,
	EmbedWrapper,
	type PageName,
} from "../templates";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface TemplateConfig {
	name: PageName;
	component: () => ReactElement;
	isProfilePage?: boolean;
}

const templates: TemplateConfig[] = [
	{ name: "sign-in", component: SignInTemplate },
	{ name: "sign-up", component: SignUpTemplate },
	{ name: "forgot-password", component: ForgotPasswordTemplate },
	{ name: "reset-password", component: ResetPasswordTemplate },
	{ name: "verify-email", component: VerifyEmailTemplate },
	{ name: "profile", component: ProfileTemplate, isProfilePage: true },
];

function generateTemplates() {
	const distPath = resolve(__dirname, "../../dist");
	const templatesPath = resolve(distPath, "templates");

	// Ensure directories exist
	if (!existsSync(distPath)) {
		mkdirSync(distPath, { recursive: true });
	}
	if (!existsSync(templatesPath)) {
		mkdirSync(templatesPath, { recursive: true });
	}

	const result: Record<PageName, { page: string; embed: string }> = {} as Record<PageName, { page: string; embed: string }>;

	for (const template of templates) {
		const Component = template.component;

		// Generate full page template (with wrapper)
		const pageHtml = renderToStaticMarkup(
			<PageWrapper isProfilePage={template.isProfilePage}>
				<Component />
			</PageWrapper>,
		);

		// Generate embed template (without wrapper)
		const embedHtml = renderToStaticMarkup(
			<EmbedWrapper>
				<Component />
			</EmbedWrapper>,
		);

		result[template.name] = {
			page: pageHtml,
			embed: embedHtml,
		};

		// Write individual template files
		writeFileSync(
			resolve(templatesPath, `${template.name}.html`),
			pageHtml,
			"utf-8",
		);
		writeFileSync(
			resolve(templatesPath, `${template.name}.embed.html`),
			embedHtml,
			"utf-8",
		);

		console.log(`Generated: ${template.name}`);
	}

	// Write combined templates.json
	writeFileSync(
		resolve(distPath, "templates.json"),
		JSON.stringify(result, null, 2),
		"utf-8",
	);

	console.log("\nTemplate generation complete!");
	console.log(`Output: ${templatesPath}`);
}

// Run if called directly
generateTemplates();
