import { DocsLayout } from "fumadocs-ui/layout";
import type { ReactNode } from "react";
import { docsOptions } from "../layout.config";
import ArticleLayout from "@/components/side-bar";

export default function Layout({ children }: { children: ReactNode }) {
	return (
		<DocsLayout
			{...docsOptions}
			sidebar={{
				component: <ArticleLayout />,
			}}
		>
			{children}
		</DocsLayout>
	);
}
