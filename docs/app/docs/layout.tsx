import { DocsLayout } from "@/components/docs/docs";
import type { ReactNode } from "react";
import { docsOptions } from "../layout.config";
import { AISearchTrigger } from "@/components/floating-ai-search";
export default function Layout({ children }: { children: ReactNode }) {
	return (
		<DocsLayout {...docsOptions}>
			{children}
			<AISearchTrigger />
		</DocsLayout>
	);
}
