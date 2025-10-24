"use client";

import { motion } from "framer-motion";
import { useEffect, useId, useRef, useState } from "react";

const Block = ({
	x,
	y,
	...props
}: Omit<React.ComponentPropsWithoutRef<typeof motion.path>, "x" | "y"> & {
	x: number;
	y: number;
}) => {
	return (
		<motion.path
			transform={`translate(${-32 * y + 96 * x} ${160 * y})`}
			d="M45.119 4.5a11.5 11.5 0 0 0-11.277 9.245l-25.6 128C6.82 148.861 12.262 155.5 19.52 155.5h63.366a11.5 11.5 0 0 0 11.277-9.245l25.6-128c1.423-7.116-4.02-13.755-11.277-13.755H45.119Z"
			{...props}
		/>
	);
};

export const GridPattern = ({
	yOffset = 0,
	interactive = false,
	...props
}: {
	yOffset?: number;
	interactive?: boolean;
	[key: string]: any;
}) => {
	const id = useId();
	const ref = useRef<SVGSVGElement>(null);
	const currentBlock = useRef<[x: number, y: number] | undefined>(undefined);
	const counter = useRef(0);
	const [hoveredBlocks, setHoveredBlocks] = useState<
		Array<[x: number, y: number, key: number]>
	>([]);
	const staticBlocks = [
		[1, 1],
		[2, 2],
		[4, 3],
		[6, 2],
		[7, 4],
		[5, 5],
	];

	useEffect(() => {
		if (!interactive) {
			return;
		}

		function onMouseMove(event: MouseEvent) {
			if (!ref.current) {
				return;
			}

			const rect = ref.current.getBoundingClientRect();
			let x = event.clientX - rect.left;
			let y = event.clientY - rect.top;
			if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
				return;
			}

			x = x - rect.width / 2 - 32;
			y = y - yOffset;
			x += Math.tan(32 / 160) * y;
			x = Math.floor(x / 96);
			y = Math.floor(y / 160);

			if (currentBlock.current?.[0] === x && currentBlock.current?.[1] === y) {
				return;
			}

			currentBlock.current = [x, y];

			setHoveredBlocks((blocks) => {
				const key = counter.current++;
				const block = [x, y, key] as (typeof hoveredBlocks)[number];
				return [...blocks, block].filter(
					(block) => !(block[0] === x && block[1] === y && block[2] !== key),
				);
			});
		}

		window.addEventListener("mousemove", onMouseMove);

		return () => {
			window.removeEventListener("mousemove", onMouseMove);
		};
	}, [yOffset, interactive]);

	return (
		<motion.svg
			ref={ref}
			aria-hidden="true"
			{...props}
			exit={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			initial={{ opacity: 0 }}
		>
			<rect width="100%" height="100%" fill={`url(#${id})`} strokeWidth="0" />
			<svg x="50%" y={yOffset} strokeWidth="0" className="overflow-visible">
				{staticBlocks.map((block) => (
					<Block key={`${block}`} x={block[0]} y={block[1]} />
				))}
				{hoveredBlocks.map((block) => (
					<Block
						key={block[2]}
						x={block[0]}
						y={block[1]}
						animate={{ opacity: [0, 1, 0] }}
						transition={{ duration: 1, times: [0, 0, 1] }}
						onAnimationComplete={() => {
							setHoveredBlocks((blocks) =>
								blocks.filter((b) => b[2] !== block[2]),
							);
						}}
					/>
				))}
			</svg>
			<defs>
				<pattern
					id={id}
					width="96"
					height="480"
					x="50%"
					patternUnits="userSpaceOnUse"
					patternTransform={`translate(0 ${yOffset})`}
					fill="none"
				>
					<path d="M128 0 98.572 147.138A16 16 0 0 1 82.883 160H13.117a16 16 0 0 0-15.69 12.862l-26.855 134.276A16 16 0 0 1-45.117 320H-116M64-160 34.572-12.862A16 16 0 0 1 18.883 0h-69.766a16 16 0 0 0-15.69 12.862l-26.855 134.276A16 16 0 0 1-109.117 160H-180M192 160l-29.428 147.138A15.999 15.999 0 0 1 146.883 320H77.117a16 16 0 0 0-15.69 12.862L34.573 467.138A16 16 0 0 1 18.883 480H-52M-136 480h58.883a16 16 0 0 0 15.69-12.862l26.855-134.276A16 16 0 0 1-18.883 320h69.766a16 16 0 0 0 15.69-12.862l26.855-134.276A16 16 0 0 1 109.117 160H192M-72 640h58.883a16 16 0 0 0 15.69-12.862l26.855-134.276A16 16 0 0 1 45.117 480h69.766a15.999 15.999 0 0 0 15.689-12.862l26.856-134.276A15.999 15.999 0 0 1 173.117 320H256M-200 320h58.883a15.999 15.999 0 0 0 15.689-12.862l26.856-134.276A16 16 0 0 1-82.883 160h69.766a16 16 0 0 0 15.69-12.862L29.427 12.862A16 16 0 0 1 45.117 0H128" />
				</pattern>
			</defs>
		</motion.svg>
	);
};
