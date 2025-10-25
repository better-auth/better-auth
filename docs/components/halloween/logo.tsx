"use client";

import { useTheme } from "next-themes";
import halloweenLogoDark from "./halloween-logo-dark.json";
import halloweenLogoLight from "./halloween-logo-light.json";
import Lottie from "lottie-react";

const HalloweenLogo = () => {
	const { resolvedTheme } = useTheme();

	const animationData =
		resolvedTheme === "dark" ? halloweenLogoDark : halloweenLogoLight;

	return (
		<Lottie
			loop={false}
			autoplay={true}
			animationData={animationData}
			className="size-36 h-6 -ml-2"
		/>
	);
};

export default HalloweenLogo;
