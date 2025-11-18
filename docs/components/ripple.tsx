import type { CSSProperties } from "react";
import React from "react";

interface RippleProps {
	mainCircleSize?: number;
	mainCircleOpacity?: number;
	numCircles?: number;
}

export const Ripple = React.memo(function Ripple({
	mainCircleSize = 180,
	mainCircleOpacity = 0.2,
	numCircles = 10,
}: RippleProps) {
	return (
		<div className="absolute opacity-65 w-full inset-0 flex items-center justify-center bg-white/5 [mask-image:linear-gradient(to_bottom,white,transparent)] dark:[box-shadow:0_-20px_80px_-20px_#8686f01f_inset]">
			{Array.from({ length: numCircles }, (_, i) => {
				const size = mainCircleSize + i * 70;
				const opacity = mainCircleOpacity - i * 0.03;
				const animationDelay = `${i * 0.06}s`;
				const borderStyle = i === numCircles - 1 ? "dashed" : "solid";
				const borderOpacity = 5 + i * 5;

				return (
					<div
						key={i}
						className={`absolute animate-ripple rounded-full bg-foreground/25 shadow-xl border [--i:${i}]`}
						style={
							{
								width: `${size}px`,
								height: `${size}px`,
								opacity,
								animationDelay,
								borderStyle,
								borderWidth: "1px",
								borderColor: `hsl(var(--foreground), ${borderOpacity / 100})`,
								top: "50%",
								left: "50%",
								transform: "translate(-50%, -50%) scale(1)",
							} as CSSProperties
						}
					/>
				);
			})}
		</div>
	);
});
