import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { DocsSidebar } from "@/components/docs/docs-sidebar";
import { FloatingToolbar } from "@/components/floating-toolbar";
import { source } from "@/lib/source";

export default function Layout({ children }: { children: ReactNode }) {
	return (
		<RootProvider
			search={{
				enabled: false,
			}}
		>
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
			</DocsLayout>
			<FloatingToolbar />
		</RootProvider>
	);
}
