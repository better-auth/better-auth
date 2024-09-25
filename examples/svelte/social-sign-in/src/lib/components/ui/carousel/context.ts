import type { EmblaCarouselSvelteType } from "embla-carousel-svelte";
import type emblaCarouselSvelte from "embla-carousel-svelte";
import { getContext, hasContext, setContext } from "svelte";
import type { HTMLAttributes } from "svelte/elements";
import type { Readable, Writable } from "svelte/store";

export type CarouselAPI =
	NonNullable<NonNullable<EmblaCarouselSvelteType["$$_attributes"]>["on:emblaInit"]> extends (
		evt: CustomEvent<infer CarouselAPI>
	) => void
		? CarouselAPI
		: never;

type EmblaCarouselConfig = NonNullable<Parameters<typeof emblaCarouselSvelte>[1]>;

export type CarouselOptions = EmblaCarouselConfig["options"];
export type CarouselPlugins = EmblaCarouselConfig["plugins"];

////

export type CarouselProps = {
	opts?: CarouselOptions;
	plugins?: CarouselPlugins;
	api?: CarouselAPI;
	orientation?: "horizontal" | "vertical";
} & HTMLAttributes<HTMLDivElement>;

const EMBLA_CAROUSEL_CONTEXT = Symbol("EMBLA_CAROUSEL_CONTEXT");

type EmblaContext = {
	api: Writable<CarouselAPI | undefined>;
	orientation: Writable<"horizontal" | "vertical">;
	scrollNext: () => void;
	scrollPrev: () => void;
	canScrollNext: Readable<boolean>;
	canScrollPrev: Readable<boolean>;
	handleKeyDown: (e: KeyboardEvent) => void;
	options: Writable<CarouselOptions>;
	plugins: Writable<CarouselPlugins>;
	onInit: (e: CustomEvent<CarouselAPI>) => void;
	scrollTo: (index: number, jump?: boolean) => void;
	scrollSnaps: Readable<number[]>;
	selectedIndex: Readable<number>;
};

export function setEmblaContext(config: EmblaContext): EmblaContext {
	setContext(EMBLA_CAROUSEL_CONTEXT, config);
	return config;
}

export function getEmblaContext(name = "This component") {
	if (!hasContext(EMBLA_CAROUSEL_CONTEXT)) {
		throw new Error(`${name} must be used within a <Carousel.Root> component`);
	}
	return getContext<ReturnType<typeof setEmblaContext>>(EMBLA_CAROUSEL_CONTEXT);
}
