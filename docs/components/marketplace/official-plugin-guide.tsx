import { ArrowUpRight, BookOpen } from "lucide-react";
import Link from "next/link";
import { InstallCommand } from "@/components/marketplace/install-command";
import { DynamicCodeBlock } from "@/components/ui/dynamic-code-block";
import type { MarketplacePluginDetail } from "@/lib/marketplace/types";

function buildQuickStart(plugin: MarketplacePluginDetail): string {
	const setup = plugin.setup;
	if (!setup) {
		return `import { betterAuth } from "better-auth"

export const auth = betterAuth({
  // see docs for ${plugin.name}
})`;
	}

	const lines = [
		`import { betterAuth } from "better-auth"`,
		`import { ${setup.exportName} } from "${setup.from}"`,
		``,
		`export const auth = betterAuth({`,
		`  plugins: [`,
		`    ${setup.exportName}(),`,
		`  ],`,
		`})`,
	];

	if (setup.clientExportName && setup.clientFrom) {
		lines.push(
			``,
			`// Client`,
			`import { createAuthClient } from "better-auth/client"`,
			`import { ${setup.clientExportName} } from "${setup.clientFrom}"`,
			``,
			`export const authClient = createAuthClient({`,
			`  plugins: [`,
			`    ${setup.clientExportName}(),`,
			`  ],`,
			`})`,
		);
	}

	return lines.join("\n");
}

export function OfficialPluginGuide({
	plugin,
}: {
	plugin: MarketplacePluginDetail;
}) {
	const docsHref = plugin.docsHref ?? `/docs/plugins/${plugin.slug}`;
	const includedInCore = !plugin.npmPackage;
	const examples = plugin.examples ?? [];

	return (
		<div className="max-w-3xl space-y-8">
			<section className="space-y-3">
				<h2 className="font-mono text-xs uppercase tracking-widest text-foreground/45">
					Overview
				</h2>
				<p className="text-sm leading-relaxed text-foreground/75">
					{plugin.description}
				</p>
				<p className="text-sm leading-relaxed text-foreground/55">
					Quick start and a few common calls. Full options and APIs live in the
					docs.
				</p>
			</section>

			<section className="space-y-3">
				<h2 className="font-mono text-xs uppercase tracking-widest text-foreground/45">
					Install
				</h2>
				{includedInCore ? (
					<div className="border border-foreground/10 px-4 py-3 text-sm text-foreground/70">
						Included with{" "}
						<code className="font-mono text-foreground/85">better-auth</code>.
						No extra package install.
					</div>
				) : (
					plugin.npmPackage && (
						<InstallCommand
							npmPackage={plugin.npmPackage}
							className="w-full justify-between"
						/>
					)
				)}
			</section>

			<section className="space-y-3">
				<h2 className="font-mono text-xs uppercase tracking-widest text-foreground/45">
					Quick start
				</h2>
				<DynamicCodeBlock
					lang="ts"
					code={buildQuickStart(plugin)}
					codeblock={{ className: "border-t" }}
				/>
			</section>

			{examples.length > 0 ? (
				<section className="space-y-3">
					<h2 className="font-mono text-xs uppercase tracking-widest text-foreground/45">
						Example usage
					</h2>
					<div className="space-y-5">
						{examples.map((example) => (
							<div key={example.title} className="space-y-2">
								<h3 className="text-sm font-medium text-foreground/80">
									{example.title}
								</h3>
								<DynamicCodeBlock
									lang={example.lang ?? "ts"}
									code={example.code}
									codeblock={{ className: "border-t" }}
								/>
							</div>
						))}
					</div>
				</section>
			) : null}

			<section className="border border-foreground/10 bg-foreground/[0.02] px-5 py-5">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="space-y-1">
						<p className="inline-flex items-center gap-2 text-sm font-medium text-foreground/85">
							<BookOpen className="size-4 text-foreground/50" />
							Full documentation
						</p>
						<p className="text-xs text-foreground/50">
							Configuration, examples, and API reference.
						</p>
					</div>
					<Link
						href={docsHref}
						className="inline-flex items-center justify-center gap-1.5 border border-foreground/15 bg-foreground px-3.5 py-2 text-xs font-medium text-background transition-opacity hover:opacity-90"
					>
						Open docs
						<ArrowUpRight className="size-3.5" />
					</Link>
				</div>
			</section>
		</div>
	);
}
