import type { MDXComponents } from "mdx/types";
import defaultComponents from "fumadocs-ui/mdx";
import Link from "next/link";
import { cn } from "./lib/utils";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import { GenerateSecret } from "./components/generate-secret";
import { AnimatePresence } from "./components/ui/fade-in";
import { Popup, PopupContent, PopupTrigger } from "fumadocs-ui/twoslash/popup";
import { TypeTable } from "fumadocs-ui/components/type-table";
import { FeaturesSectionDemo } from "./components/blocks/features-section-demo-3";
export function useMDXComponents(components: MDXComponents): MDXComponents {
	return {
		...defaultComponents,
		...components,
		Link: ({ className, ...props }: React.ComponentProps<typeof Link>) => (
			<Link
				className={cn("font-medium underline underline-offset-4", className)}
				{...props}
			/>
		),
		Step,
		Steps,
		Tab,
		Tabs,
		GenerateSecret,
		Popup,
		PopupTrigger,
		PopupContent,
	    AnimatePresence,
		TypeTable,
		Features: FeaturesSectionDemo,
	};
}
