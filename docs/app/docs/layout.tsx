import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { docsOptions } from "../layout.config";
import ArticleLayout from "@/components/side-bar";
import { DocsNavBarMobile } from "@/components/nav-mobile";

export default function Layout({ children }: { children: ReactNode }) {
	return (
		<DocsLayout
			{...docsOptions}
			sidebar={{
				component: <ArticleLayout />,
			}}
		>
			<DocsNavBarMobile />
			{children}
		</DocsLayout>
	);
}
