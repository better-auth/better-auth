import type { ReactNode } from "react";
import { Suspense } from "react";
import { AIChat, AIChatPanel, AIChatTrigger } from "@/components/ai-chat";
import { DocsSidebar } from "@/components/docs/docs-sidebar";
import type { DocsVersion, VersionAvailability } from "@/lib/docs-versions";
import { docsVersions, stripVersionPrefix } from "@/lib/docs-versions";
import { loadDocsVersions } from "@/lib/release-versions";
import { getSourceFor } from "@/lib/source";
import type { PageTreesByVersion } from "./provider";
import { DocsProvider } from "./provider";
import { DocsShell } from "./shell";

const [latestVersion, version16] = docsVersions;

const pageTreesByVersion = {
	latest: getSourceFor(latestVersion.id).getPageTree(),
	"1.6": getSourceFor(version16.id).getPageTree(),
} satisfies PageTreesByVersion;

function getAvailablePaths(version: DocsVersion) {
	return getSourceFor(version.id)
		.getPages()
		.filter((page) => page.slugs[0] !== "examples")
		.map((page) => stripVersionPrefix(page.url, version));
}

const versionAvailability = {
	latest: getAvailablePaths(latestVersion),
	"1.6": getAvailablePaths(version16),
} satisfies VersionAvailability;
const resolvedDocsVersions = loadDocsVersions();
export default function Layout({ children }: { children: ReactNode }) {
	return (
		<DocsProvider
			pageTreesByVersion={pageTreesByVersion}
			versions={resolvedDocsVersions}
			versionAvailability={versionAvailability}
		>
			<AIChat>
				<Suspense>
					<DocsSidebar />
				</Suspense>
				<DocsShell>
					{children}
					<AIChatPanel />
					<AIChatTrigger>
						<span className="text-sm text-muted-foreground">Ask AI</span>
						<span className="h-5 w-px bg-foreground/10" />
						<kbd className="inline-flex items-center gap-0.5 text-[10px] font-mono text-muted-foreground">
							<span className="text-[11px]">&#8984;</span>I
						</kbd>
					</AIChatTrigger>
				</DocsShell>
			</AIChat>
		</DocsProvider>
	);
}
