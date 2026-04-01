import type { ReactNode } from "react";
import { LegalSidebar } from "./sidebar";

export default function LegalLayout({ children }: { children: ReactNode }) {
	return (
		<div className="flex flex-col md:flex-row justify-center min-h-dvh pt-14 md:pt-0 mx-auto max-w-6xl">
			<LegalSidebar />
			<main className="flex-1 px-5 md:px-16 py-15 md:py-40 max-w-3xl">
				<article className="prose dark:prose-invert prose-headings:font-semibold prose-headings:tracking-tight">
					{children}
				</article>
			</main>
		</div>
	);
}
