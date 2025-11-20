"use client";

import clsx from "clsx";
import type { Segment } from "motion/react";
import { animate } from "motion/react";
import { useEffect, useId, useRef } from "react";

type Star = [x: number, y: number, dim?: boolean, blur?: boolean];

const stars: Array<Star> = [
	[4, 4, true, true],
	[4, 44, true],
	[36, 22],
	[50, 146, true, true],
	[64, 43, true, true],
	[76, 30, true],
	[101, 116],
	[140, 36, true],
	[149, 134],
	[162, 74, true],
	[171, 96, true, true],
	[210, 56, true, true],
	[235, 90],
	[275, 82, true, true],
	[306, 6],
	[307, 64, true, true],
	[380, 68, true],
	[380, 108, true, true],
	[391, 148, true, true],
	[405, 18, true],
	[412, 86, true, true],
	[426, 210, true, true],
	[427, 56, true, true],
	[538, 138],
	[563, 88, true, true],
	[611, 154, true, true],
	[637, 150],
	[651, 146, true],
	[682, 70, true, true],
	[683, 128],
	[781, 82, true, true],
	[785, 158, true],
	[832, 146, true, true],
	[852, 89],
];

const constellations: Array<Array<Star>> = [
	[
		[247, 103],
		[261, 86],
		[307, 104],
		[357, 36],
	],
	[
		[586, 120],
		[516, 100],
		[491, 62],
		[440, 107],
		[477, 180],
		[516, 100],
	],
	[
		[733, 100],
		[803, 120],
		[879, 113],
		[823, 164],
		[803, 120],
	],
];

function Star({
	blurId,
	point: [cx, cy, dim, blur],
}: {
	blurId: string;
	point: Star;
}) {
	let groupRef = useRef<React.ElementRef<"g">>(null);
	let ref = useRef<React.ElementRef<"circle">>(null);

	useEffect(() => {
		if (!groupRef.current || !ref.current) {
			return;
		}

		let delay = Math.random() * 2;

		let animations = [
			animate(groupRef.current, { opacity: 1 }, { duration: 4, delay }),
			animate(
				ref.current,
				{
					opacity: dim ? [0.2, 0.5] : [1, 0.6],
					scale: dim ? [1, 1.2] : [1.2, 1],
				},
				{
					duration: 10,
					delay,
				},
			),
		];

		return () => {
			for (let animation of animations) {
				animation.cancel();
			}
		};
	}, [dim]);

	return (
		<g ref={groupRef} className="opacity-0">
			<circle
				ref={ref}
				cx={cx}
				cy={cy}
				r={1}
				style={{
					transformOrigin: `${cx / 16}rem ${cy / 16}rem`,
					opacity: dim ? 0.2 : 1,
					transform: `scale(${dim ? 1 : 1.2})`,
				}}
				filter={blur ? `url(#${blurId})` : undefined}
			/>
		</g>
	);
}

function Constellation({
	points,
	blurId,
}: {
	points: Array<Star>;
	blurId: string;
}) {
	let ref = useRef<React.ElementRef<"path">>(null);
	let uniquePoints = points.filter(
		(point, pointIndex) =>
			points.findIndex((p) => String(p) === String(point)) === pointIndex,
	);
	let isFilled = uniquePoints.length !== points.length;

	useEffect(() => {
		if (!ref.current) {
			return;
		}

		let sequence: Array<Segment> = [
			[
				ref.current,
				{ strokeDashoffset: 0, opacity: 1 },
				{ duration: 5, delay: Math.random() * 3 + 2 },
			],
		];

		if (isFilled) {
			sequence.push([
				ref.current,
				{ fill: "rgb(255 255 255 / 0.02)" },
				{ duration: 1 },
			]);
		}

		let animation = animate(sequence);

		return () => {
			animation.cancel();
		};
	}, [isFilled]);

	return (
		<>
			<path
				ref={ref}
				stroke="white"
				strokeOpacity="0.2"
				strokeDasharray={1}
				strokeDashoffset={1}
				pathLength={1}
				fill="transparent"
				d={`M ${points.join("L")}`}
				style={{ opacity: 0 }}
			/>
			{uniquePoints.map((point, pointIndex) => (
				<Star key={pointIndex} point={point} blurId={blurId} />
			))}
		</>
	);
}

export function StarField({ className }: { className?: string }) {
	let blurId = useId();

	return (
		<svg
			viewBox="0 0 881 211"
			fill="white"
			aria-hidden="true"
			className={clsx(
				"pointer-events-none absolute w-[55.0625rem] max-w-[100vw] origin-top-right rotate-[30deg] overflow-visible opacity-70",
				className,
			)}
		>
			<defs>
				<filter id={blurId}>
					<feGaussianBlur in="SourceGraphic" stdDeviation=".5" />
				</filter>
			</defs>
			{constellations.map((points, constellationIndex) => (
				<Constellation
					key={constellationIndex}
					points={points}
					blurId={blurId}
				/>
			))}
			{stars.map((point, pointIndex) => (
				<Star key={pointIndex} point={point} blurId={blurId} />
			))}
		</svg>
	);
}
