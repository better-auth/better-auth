import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { docsOptions } from "../layout.config";
import ArticleLayout from "@/components/side-bar";
import { DocsNavBarMobile } from "@/components/nav-mobile";
import { cn } from "@/lib/utils";
export default function Layout({ children }: { children: ReactNode | any }) {
	return (
		<DocsLayout
			{...docsOptions}
			sidebar={{
				component: (
					<div className={cn("mr-[var(--fd-sidebar-width)]")}>
						<ArticleLayout />
					</div>
				),
			}}
		>
			<DocsNavBarMobile />
			{children}
		</DocsLayout>
	);
}
