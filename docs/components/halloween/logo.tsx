"use client";

import { useTheme } from "next-themes";
import halloweenLogoDark from "./halloween-logo-dark.json";
import halloweenLogoLight from "./halloween-logo-light.json";
import Lottie, { type LottieRefCurrentProps } from "lottie-react";
import { useRef, useState } from "react";

const HalloweenLogo = () => {
	const { resolvedTheme } = useTheme();
	const [isPlaying, setIsPlaying] = useState(false);
	const lottieRef = useRef<LottieRefCurrentProps>(null);

	const animationData =
		resolvedTheme === "dark" ? halloweenLogoDark : halloweenLogoLight;

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
		<div onMouseEnter={handleMouseEnter}>
			<Lottie
				loop={1}
				autoplay={true}
				lottieRef={lottieRef}
				animationData={animationData}
				onComplete={handleComplete}
				className="size-36 h-6 -ml-2"
			/>
		</div>
	);
};

export default HalloweenLogo;
