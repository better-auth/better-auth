import type { ReactNode } from "react";
import { DocsLayout } from "@/components/docs/docs";
import { AISearchTrigger } from "@/components/floating-ai-search";
import { docsOptions } from "../layout.config";
import { SidebarProvider } from "fumadocs-ui/components/sidebar/base";
export default function Layout({ children }: { children: ReactNode }) {
	return (
		<DocsLayout {...docsOptions}>
			<SidebarProvider>
				{children}
				<AISearchTrigger />
			</SidebarProvider>
		</DocsLayout>
	);
}
