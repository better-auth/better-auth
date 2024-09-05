import React from "react";
import { useId } from "react";

export function Features() {
	return (
		<div className="py-2">
			<div className="mt-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-10 md:gap-2 max-w-7xl mx-auto">
				{grid.map((feature) => (
					<div
						key={feature.title}
						className="relative bg-gradient-to-b dark:from-neutral-900 from-neutral-100 dark:to-neutral-950 to-white p-6  overflow-hidden"
					>
						<Grid size={20} />
						<p className="text-base font-bold text-neutral-800 dark:text-white relative z-20">
							{feature.title}
						</p>
						<p className="text-neutral-600 dark:text-neutral-400 mt-4 text-base font-normal relative z-20">
							{feature.description}
						</p>
					</div>
				))}
			</div>
		</div>
	);
}

const grid = [
	{
		title: "Framework Agnostic",
		description:
			"Supports your favorite frontend, backend and meta frameworks, including React, Vue, Svelte, Solid, Next.js, Nuxt.js, Hono, and more.",
	},
	{
		title: "Automatic Database Management",
		description:
			"better auth will automatically manage required tables for authentication, just configure the database and better auth will do the rest.",
	},
	{
		title: "Email & Password Authentication",
		description:
			"Builtin support for email and password authentication, with secure password hashing and account management features.",
	},
	{
		title: "Social Sign-on",
		description:
			"Allow users to sign in with their accounts, including Github, Google, Discord, Twitter, and more.",
	},
	{
		title: "Organization & Access Control",
		description:
			"Manage users and their access to resources within your application.",
	},
	{
		title: "Plugin Ecosystem",
		description:
			"Enhance your application with our official plugins and those created by the community.",
	},
];

export const Grid = ({
	pattern,
	size,
}: {
	pattern?: number[][];
	size?: number;
}) => {
	const p = pattern ?? [
		[Math.floor(Math.random() * 4) + 7, Math.floor(Math.random() * 6) + 1],
		[Math.floor(Math.random() * 4) + 7, Math.floor(Math.random() * 6) + 1],
		[Math.floor(Math.random() * 4) + 7, Math.floor(Math.random() * 6) + 1],
		[Math.floor(Math.random() * 4) + 7, Math.floor(Math.random() * 6) + 1],
		[Math.floor(Math.random() * 4) + 7, Math.floor(Math.random() * 6) + 1],
	];
	return (
		<div className="pointer-events-none absolute left-1/2 top-0  -ml-20 -mt-2 h-full w-full [mask-image:linear-gradient(white,transparent)]">
			<div className="absolute inset-0 bg-gradient-to-r  [mask-image:radial-gradient(farthest-side_at_top,white,transparent)] dark:from-zinc-900/30 from-zinc-100/30 to-zinc-300/30 dark:to-zinc-900/30 opacity-100">
				<GridPattern
					width={size ?? 20}
					height={size ?? 20}
					x="-12"
					y="4"
					squares={p}
					className="absolute inset-0 h-full w-full  mix-blend-overlay dark:fill-white/10 dark:stroke-white/10 stroke-black/10 fill-black/10"
				/>
			</div>
		</div>
	);
};

export function GridPattern({ width, height, x, y, squares, ...props }: any) {
	const patternId = useId();

	return (
		<svg aria-hidden="true" {...props}>
			<defs>
				<pattern
					id={patternId}
					width={width}
					height={height}
					patternUnits="userSpaceOnUse"
					x={x}
					y={y}
				>
					<path d={`M.5 ${height}V.5H${width}`} fill="none" />
				</pattern>
			</defs>
			<rect
				width="100%"
				height="100%"
				strokeWidth={0}
				fill={`url(#${patternId})`}
			/>
			{squares && (
				<svg x={x} y={y} className="overflow-visible">
					{squares.map(([x, y]: any) => (
						<rect
							strokeWidth="0"
							key={`${x}-${y}`}
							width={width + 1}
							height={height + 1}
							x={x * width}
							y={y * height}
						/>
					))}
				</svg>
			)}
		</svg>
	);
}
