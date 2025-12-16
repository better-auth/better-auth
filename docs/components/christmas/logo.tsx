"use client";

import Lottie, { type LottieRefCurrentProps } from "lottie-react";
import { useTheme } from "next-themes";
import { useRef, useState } from "react";
import christmasLogoDark from "./christmas-logo-dark.json";
import christmasLogoLight from "./christmas-logo-light.json";

const ChristmasLogo = () => {
	const { resolvedTheme } = useTheme();
	const [isPlaying, setIsPlaying] = useState(false);
	const lottieRef = useRef<LottieRefCurrentProps>(null);

	const animationData =
		resolvedTheme === "dark" ? christmasLogoDark : christmasLogoLight;

	const handleMouseEnter = () => {
		if (!isPlaying) {
			setIsPlaying(true);
			lottieRef.current?.goToAndPlay(0);
		}
	};

	const handleComplete = () => {
		setIsPlaying(false);
	};

	return (
		<div onMouseEnter={handleMouseEnter} className="flex items-center">
			<Lottie
				loop={false}
				autoplay={true}
				lottieRef={lottieRef}
				animationData={animationData}
				onComplete={handleComplete}
				className="h-14 -ml-2.5"
				style={{ aspectRatio: "3 / 1" }}
			/>
		</div>
	);
};

export default ChristmasLogo;
