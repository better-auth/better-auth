export const backgrounds = {
	blank: "",
	squaredGrid: `<div data-ba-background="squared-grid" style="background-image:linear-gradient(to right,color-mix(in srgb,currentColor 50%,transparent) 1px,transparent 1px),linear-gradient(to bottom,color-mix(in srgb,currentColor 50%,transparent) 1px,transparent 1px);background-size:3.5rem 3.5rem;mask-image:radial-gradient(circle at center,black 0%,black 42%,transparent 72%);-webkit-mask-image:radial-gradient(circle at center,black 0%,black 42%,transparent 72%);"></div>`,
	dotGrid: `<div data-ba-background="dot-grid" style="background-image:radial-gradient(circle,color-mix(in srgb,currentColor 70%,transparent) 1.35px,transparent 1.35px);background-size:1.5rem 1.5rem;mask-image:radial-gradient(circle at center,black 0%,black 45%,transparent 74%);-webkit-mask-image:radial-gradient(circle at center,black 0%,black 45%,transparent 74%);"></div>`,
} as const;
