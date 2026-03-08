import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { AIChat, AIChatPanel, AIChatTrigger } from "@/components/ai-chat";
import { DocsSidebar } from "@/components/docs/docs-sidebar";
import { source } from "@/lib/source";
import type { PageEntry } from "./provider";
import { DocsProvider } from "./provider";

const allPages: PageEntry[] = source.getPages().map((page) => ({
	name: page.data.title,
	url: page.url,
}));

export default function Layout({ children }: { children: ReactNode }) {
	return (
		<DocsProvider pages={allPages}>
			<Suspense>
				<DocsSidebar />
			</Suspense>
			<DocsLayout
				tree={source.pageTree}
				nav={{ enabled: false }}
				searchToggle={{ enabled: false }}
				themeSwitch={{ enabled: false }}
				sidebar={{ enabled: false }}
				containerProps={{
					className: "docs-layout",
				}}
			>
				{children}
				<AIChat>
					<AIChatPanel />
					<AIChatTrigger>
						<span className="text-sm text-muted-foreground">Ask AI</span>
						<span className="h-5 w-px bg-foreground/10" />
						<kbd className="inline-flex items-center gap-0.5 text-[10px] font-mono text-muted-foreground">
							<span className="text-[11px]">&#8984;</span>I
						</kbd>
					</AIChatTrigger>
				</AIChat>
			</DocsLayout>
		</DocsProvider>
	);
}
