import type { ReactNode } from "react";
import { Suspense } from "react";
import { AIChat, AIChatPanel, AIChatTrigger } from "@/components/ai-chat";
import { DocsSidebar } from "@/components/docs/docs-sidebar";
import { VersionedDocsLayout } from "@/components/docs/versioned-docs-layout";
import { getDocsReleaseVersions } from "@/lib/docs-release-versions";
import type { VersionAvailability } from "@/lib/docs-versions";
import { docsVersions, stripVersionPrefix } from "@/lib/docs-versions";
import { getSourceFor } from "@/lib/source";
import type { PageTreesByVersion } from "./provider";
import { DocsProvider } from "./provider";

const pageTreesByVersion: PageTreesByVersion = Object.fromEntries(
	docsVersions.map((version) => [
		version.id,
		getSourceFor(version.id).getPageTree(),
	]),
);

const versionAvailability: VersionAvailability = Object.fromEntries(
	docsVersions.map((version) => [
		version.id,
		getSourceFor(version.id)
			.getPages()
			.filter((page) => page.slugs[0] !== "examples")
			.map((page) => stripVersionPrefix(page.url, version)),
	]),
);
const releaseVersions = getDocsReleaseVersions();
export default function Layout({ children }: { children: ReactNode }) {
	return (
		<DocsProvider
			pageTreesByVersion={pageTreesByVersion}
			releaseVersions={releaseVersions}
			versionAvailability={versionAvailability}
		>
			<AIChat>
				<Suspense>
					<DocsSidebar />
				</Suspense>
				<VersionedDocsLayout>
					{children}
					<AIChatPanel />
					<AIChatTrigger>
						<span className="text-sm text-muted-foreground">Ask AI</span>
						<span className="h-5 w-px bg-foreground/10" />
						<kbd className="inline-flex items-center gap-0.5 text-[10px] font-mono text-muted-foreground">
							<span className="text-[11px]">&#8984;</span>I
						</kbd>
					</AIChatTrigger>
				</VersionedDocsLayout>
			</AIChat>
		</DocsProvider>
	);
}
