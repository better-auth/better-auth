"use client";
import type {
	HighlightOptions,
	HighlightOptionsCommon,
	HighlightOptionsThemes,
} from "fumadocs-core/highlight";
import { useShiki } from "fumadocs-core/highlight/client";
import type { ComponentProps, FC } from "react";
import { createContext, Suspense, use } from "react";
import type { CodeBlockProps } from "@/components/ui/code-block";
import { CodeBlock, Pre } from "@/components/ui/code-block";
import { cn } from "@/lib/utils";

export interface DynamicCodeblockProps {
	lang: string;
	code: string;
	/**
	 * Extra props for the underlying `<CodeBlock />` component.
	 *
	 * Ignored if you defined your own `pre` component in `options.components`.
	 */
	codeblock?: CodeBlockProps;
	/**
	 * Wrap in React `<Suspense />` and provide a fallback.
	 *
	 * @defaultValue true
	 */
	wrapInSuspense?: boolean;
	/**
	 * Allow to copy code with copy button
	 *
	 * @defaultValue true
	 */
	allowCopy?: boolean;
	options?: Omit<HighlightOptionsCommon, "lang"> & HighlightOptionsThemes;
}

const PropsContext = createContext<CodeBlockProps | undefined>(undefined);

function DefaultPre(props: ComponentProps<"pre">) {
	const extraProps = use(PropsContext);

	return (
		<CodeBlock
			{...props}
			{...extraProps}
			className={cn(
				"my-0 border-t-0 rounded-none",
				props.className,
				extraProps?.className,
			)}
		>
			<Pre className="py-2">{props.children}</Pre>
		</CodeBlock>
	);
}

export function DynamicCodeBlock({
	lang,
	code,
	codeblock,
	options,
	wrapInSuspense = true,
	allowCopy = true,
}: DynamicCodeblockProps) {
	const shikiOptions = {
		lang,
		...options,
		components: {
			pre: DefaultPre,
			...options?.components,
		},
	} satisfies HighlightOptions;
	let children = <Internal code={code} options={shikiOptions} />;

	if (wrapInSuspense)
		children = (
			<Suspense
				fallback={
					<Placeholder code={code} components={shikiOptions.components} />
				}
			>
				{children}
			</Suspense>
		);

	return (
		<PropsContext value={{ ...codeblock, allowCopy }}>{children}</PropsContext>
	);
}

function Placeholder({
	code,
	components = {},
}: {
	code: string;
	components: HighlightOptions["components"];
}) {
	const { pre: Pre = "pre", code: Code = "code" } = components as Record<
		string,
		FC
	>;

	return (
		<Pre>
			<Code>
				{code.split("\n").map((line, i) => (
					<span key={i} className="line">
						{line}
					</span>
				))}
			</Code>
		</Pre>
	);
}

function Internal({
	code,
	options,
}: {
	code: string;
	options: HighlightOptions;
}) {
	return useShiki(code, options);
}
