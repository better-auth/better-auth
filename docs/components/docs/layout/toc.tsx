"use client";
import type {
	PopoverContentProps,
	PopoverTriggerProps,
} from "@radix-ui/react-popover";
import type { TOCItemType } from "fumadocs-core/server";
import * as Primitive from "fumadocs-core/toc";
import { useI18n, usePageStyles } from "fumadocs-ui/provider";
import { ChevronRight, Text } from "lucide-react";
import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
import {
	createContext,
	use,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { cn } from "@/lib/utils";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "../ui/collapsible";
import { ScrollArea, ScrollViewport } from "../ui/scroll-area";
import { TocThumb } from "./toc-thumb";

export interface TOCProps {
	/**
	 * Custom content in TOC container, before the main TOC
	 */
	header?: ReactNode;

	/**
	 * Custom content in TOC container, after the main TOC
	 */
	footer?: ReactNode;

	children: ReactNode;
}

export function Toc(props: HTMLAttributes<HTMLDivElement>) {
	const { toc } = usePageStyles();

	return (
		<div
			id="nd-toc"
			{...props}
			className={cn(
				"sticky top-[calc(var(--fd-banner-height)+var(--fd-nav-height))] h-(--fd-toc-height) pb-2 pt-12",
				toc,
				props.className,
			)}
			style={
				{
					...props.style,
					"--fd-toc-height":
						"calc(100dvh - var(--fd-banner-height) - var(--fd-nav-height) - 4rem)",
				} as object
			}
		>
			<div className="flex h-full w-(--fd-toc-width) max-w-full flex-col gap-3 pe-4">
				{props.children}
			</div>
		</div>
	);
}

export function TocItemsEmpty() {
	const { text } = useI18n();

	return (
		<div className="rounded-lg border bg-fd-card p-3 text-xs text-fd-muted-foreground">
			{text.tocNoHeadings}
		</div>
	);
}

export function TOCScrollArea({
	isMenu,
	...props
}: ComponentProps<typeof ScrollArea> & { isMenu?: boolean }) {
	const viewRef = useRef<HTMLDivElement>(null);

	return (
		<ScrollArea
			{...props}
			className={cn("flex flex-col ps-px", props.className)}
		>
			<Primitive.ScrollProvider containerRef={viewRef}>
				<ScrollViewport
					className={cn(
						"relative min-h-0 text-sm",
						isMenu && "mt-2 mb-4 mx-4 md:mx-6",
					)}
					ref={viewRef}
				>
					{props.children}
				</ScrollViewport>
			</Primitive.ScrollProvider>
		</ScrollArea>
	);
}

export function TOCItems({ items }: { items: TOCItemType[] }) {
	const containerRef = useRef<HTMLDivElement>(null);

	const [svg, setSvg] = useState<{
		path: string;
		width: number;
		height: number;
	}>();

	useEffect(() => {
		if (!containerRef.current) return;
		const container = containerRef.current;

		function onResize(): void {
			if (container.clientHeight === 0) return;
			let w = 0,
				h = 0;
			const d: string[] = [];
			for (let i = 0; i < items.length; i++) {
				const element: HTMLElement | null = container.querySelector(
					`a[href="#${items[i].url.slice(1)}"]`,
				);
				if (!element) continue;

				const styles = getComputedStyle(element);
				const offset = getLineOffset(items[i].depth) + 1,
					top = element.offsetTop + parseFloat(styles.paddingTop),
					bottom =
						element.offsetTop +
						element.clientHeight -
						parseFloat(styles.paddingBottom);

				w = Math.max(offset, w);
				h = Math.max(h, bottom);

				d.push(`${i === 0 ? "M" : "L"}${offset} ${top}`);
				d.push(`L${offset} ${bottom}`);
			}

			setSvg({
				path: d.join(" "),
				width: w + 1,
				height: h,
			});
		}

		const observer = new ResizeObserver(onResize);
		onResize();

		observer.observe(container);
		return () => {
			observer.disconnect();
		};
	}, [items]);

	if (items.length === 0) return <TocItemsEmpty />;

	return (
		<>
			{svg ? (
				<div
					className="absolute start-0 top-0 rtl:-scale-x-100"
					style={{
						width: svg.width,
						height: svg.height,
						maskImage: `url("data:image/svg+xml,${
							// Inline SVG
							encodeURIComponent(
								`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svg.width} ${svg.height}"><path d="${svg.path}" stroke="black" stroke-width="1" fill="none" /></svg>`,
							)
						}")`,
					}}
				>
					<TocThumb
						containerRef={containerRef}
						className="mt-(--fd-top) h-(--fd-height) bg-fd-primary transition-all"
						style={{ willChange: "height, marginTop" }}
					/>
				</div>
			) : null}
			<div className="flex flex-col" ref={containerRef}>
				{items.map((item, i) => (
					<TOCItem
						key={item.url}
						item={item}
						upper={items[i - 1]?.depth}
						lower={items[i + 1]?.depth}
					/>
				))}
			</div>
		</>
	);
}

function getItemOffset(depth: number): number {
	if (depth <= 2) return 14;
	if (depth === 3) return 26;
	return 36;
}

function getLineOffset(depth: number): number {
	return depth >= 3 ? 10 : 0;
}

function TOCItem({
	item,
	upper = item.depth,
	lower = item.depth,
}: {
	item: TOCItemType;
	upper?: number;
	lower?: number;
}) {
	const offset = getLineOffset(item.depth),
		upperOffset = getLineOffset(upper),
		lowerOffset = getLineOffset(lower);

	return (
		<Primitive.TOCItem
			href={item.url}
			style={{
				paddingInlineStart: getItemOffset(item.depth),
			}}
			className="prose relative py-1.5 text-sm text-fd-muted-foreground transition-colors [overflow-wrap:anywhere] first:pt-0 last:pb-0 data-[active=true]:text-fd-primary"
		>
			{offset !== upperOffset ? (
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					className="absolute -top-1.5 start-0 size-4 rtl:-scale-x-100"
				>
					<line
						x1={upperOffset}
						y1="0"
						x2={offset}
						y2="12"
						className="stroke-fd-foreground/10"
						strokeWidth="1"
					/>
				</svg>
			) : null}
			<div
				className={cn(
					"absolute inset-y-0 w-px bg-fd-foreground/10",
					offset !== upperOffset && "top-1.5",
					offset !== lowerOffset && "bottom-1.5",
				)}
				style={{
					insetInlineStart: offset,
				}}
			/>
			{item.title}
		</Primitive.TOCItem>
	);
}

type MakeRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };

const Context = createContext<{
	open: boolean;
	setOpen: (open: boolean) => void;
} | null>(null);

const TocProvider = Context.Provider || Context;

export function TocPopover({
	open,
	onOpenChange,
	ref: _ref,
	...props
}: MakeRequired<ComponentProps<typeof Collapsible>, "open" | "onOpenChange">) {
	return (
		<Collapsible open={open} onOpenChange={onOpenChange} {...props}>
			<TocProvider
				value={useMemo(
					() => ({
						open,
						setOpen: onOpenChange,
					}),
					[onOpenChange, open],
				)}
			>
				{props.children}
			</TocProvider>
		</Collapsible>
	);
}

export function TocPopoverTrigger({
	items,
	...props
}: PopoverTriggerProps & { items: TOCItemType[] }) {
	const { text } = useI18n();
	const { open } = use(Context)!;
	const active = Primitive.useActiveAnchor();
	const current = useMemo(() => {
		return items.find((item) => active === item.url.slice(1))?.title;
	}, [items, active]);

	return (
		<CollapsibleTrigger
			{...props}
			className={cn(
				"inline-flex items-center text-sm gap-2 text-nowrap px-4 py-2.5 text-start md:px-6 focus-visible:outline-none",
				props.className,
			)}
		>
			<Text className="size-4 shrink-0" />
			{text.toc}
			<ChevronRight
				className={cn(
					"size-4 shrink-0 text-fd-muted-foreground transition-all",
					!current && "opacity-0",
					open ? "rotate-90" : "-ms-1.5",
				)}
			/>
			<span
				className={cn(
					"truncate text-fd-muted-foreground transition-opacity -ms-1.5",
					(!current || open) && "opacity-0",
				)}
			>
				{current}
			</span>
		</CollapsibleTrigger>
	);
}

export function TocPopoverContent(props: PopoverContentProps) {
	return (
		<CollapsibleContent
			data-toc-popover=""
			className="flex flex-col max-h-[50vh]"
			{...props}
		>
			{props.children}
		</CollapsibleContent>
	);
}
