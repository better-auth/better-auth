"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useTheme } from "next-themes";
import type { ComponentProps } from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const themeMap = {
	light: "light",
	dark: "dark",
} as const;

function renderThemeIcon(theme: string | undefined) {
	switch (theme) {
		case themeMap.light:
			return <LightThemeIcon />;
		case themeMap.dark:
			return <DarkThemeIcon />;
		default:
			return null;
	}
}

export function ThemeToggle(props: ComponentProps<typeof Button>) {
	const { setTheme, resolvedTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	function injectPolygonBlurAnimation() {
		const styleId = "polygon-theme-transition";

		let style = document.getElementById(styleId);

		if (!style) {
			style = document.createElement("style");
			style.id = styleId;
			document.head.appendChild(style);
		}

		style.textContent = `
			::view-transition-group(root){
				animation-duration:1.2s;
				animation-timing-function:cubic-bezier(0.19,1,0.22,1);
			}

			::view-transition-new(root){
				animation-name:polygon-light;
				filter:blur(2px);
			}

			.dark::view-transition-new(root){
				animation-name:polygon-dark;
				filter:blur(2px);
			}

			::view-transition-old(root){
				animation:none;
				z-index:-1;
			}

			@keyframes polygon-dark{
				from{
					clip-path:polygon(50% -71%,-50% 71%,-50% 71%,50% -71%);
					filter:blur(8px);
				}
				50%{filter:blur(4px);}
				to{
					clip-path:polygon(50% -71%,-50% 71%,50% 171%,171% 50%);
					filter:blur(0);
				}
			}

			@keyframes polygon-light{
				from{
					clip-path:polygon(171% 50%,50% 171%,50% 171%,171% 50%);
					filter:blur(8px);
				}
				50%{filter:blur(4px);}
				to{
					clip-path:polygon(171% 50%,50% 171%,-50% 71%,50% -71%);
					filter:blur(0);
				}
			}
		`;
	}
	return (
		<Button
			variant="ghost"
			size="icon"
			aria-label="Toggle theme"
			onClick={() => {
				const next =
					resolvedTheme === themeMap.dark ? themeMap.light : themeMap.dark;

				injectPolygonBlurAnimation();

				const apply = () => setTheme(next);

				if (!document.startViewTransition) {
					apply();
					return;
				}

				document.startViewTransition(apply);
			}}
			{...props}
			className={cn(
				"flex shrink-0 navbar:w-[3.56rem] navbar:h-14 navbar:border-l navbar:text-muted-foreground max-navbar:hover:bg-transparent",
				props.className,
			)}
		>
			<AnimatePresence mode="wait">
				{mounted && renderThemeIcon(resolvedTheme)}
			</AnimatePresence>
		</Button>
	);
}

const LightThemeIcon = () => {
	return (
		<motion.svg
			key="light"
			initial={{ opacity: 0, scale: 0.8 }}
			animate={{ opacity: 1, scale: 1 }}
			exit={{ opacity: 0, scale: 0.8 }}
			transition={{ duration: 0.3, ease: "easeOut" }}
			xmlns="http://www.w3.org/2000/svg"
			width="1em"
			height="1em"
			viewBox="0 0 24 24"
			className="size-5"
			aria-hidden="true"
		>
			<g
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="2"
			>
				<path
					strokeDasharray="2"
					strokeDashoffset="2"
					d="M12 19v1M19 12h1M12 5v-1M5 12h-1"
				>
					<animate
						fill="freeze"
						attributeName="d"
						begin="0.6s"
						dur="0.2s"
						values="M12 19v1M19 12h1M12 5v-1M5 12h-1;M12 21v1M21 12h1M12 3v-1M3 12h-1"
					></animate>
					<animate
						fill="freeze"
						attributeName="stroke-dashoffset"
						begin="0.6s"
						dur="0.2s"
						values="2;0"
					></animate>
				</path>
				<path
					strokeDasharray="2"
					strokeDashoffset="2"
					d="M17 17l0.5 0.5M17 7l0.5 -0.5M7 7l-0.5 -0.5M7 17l-0.5 0.5"
				>
					<animate
						fill="freeze"
						attributeName="d"
						begin="0.8s"
						dur="0.2s"
						values="M17 17l0.5 0.5M17 7l0.5 -0.5M7 7l-0.5 -0.5M7 17l-0.5 0.5;M18.5 18.5l0.5 0.5M18.5 5.5l0.5 -0.5M5.5 5.5l-0.5 -0.5M5.5 18.5l-0.5 0.5"
					></animate>
					<animate
						fill="freeze"
						attributeName="stroke-dashoffset"
						begin="0.8s"
						dur="0.2s"
						values="2;0"
					></animate>
				</path>
				<animateTransform
					attributeName="transform"
					dur="30s"
					repeatCount="indefinite"
					type="rotate"
					values="0 12 12;360 12 12"
				></animateTransform>
			</g>
			<mask id="lineMdMoonFilledAltToSunnyFilledLoopTransition0">
				<circle cx="12" cy="12" r="12" fill="#fff"></circle>
				<circle cx="18" cy="6" r="12" fill="#fff">
					<animate
						fill="freeze"
						attributeName="cx"
						dur="0.4s"
						values="18;22"
					></animate>
					<animate
						fill="freeze"
						attributeName="cy"
						dur="0.4s"
						values="6;2"
					></animate>
					<animate
						fill="freeze"
						attributeName="r"
						dur="0.4s"
						values="12;3"
					></animate>
				</circle>
				<circle cx="18" cy="6" r="10">
					<animate
						fill="freeze"
						attributeName="cx"
						dur="0.4s"
						values="18;22"
					></animate>
					<animate
						fill="freeze"
						attributeName="cy"
						dur="0.4s"
						values="6;2"
					></animate>
					<animate
						fill="freeze"
						attributeName="r"
						dur="0.4s"
						values="10;1"
					></animate>
				</circle>
			</mask>
			<circle
				cx="12"
				cy="12"
				r="10"
				mask="url(#lineMdMoonFilledAltToSunnyFilledLoopTransition0)"
				fill="currentColor"
			>
				<animate
					fill="freeze"
					attributeName="r"
					dur="0.4s"
					values="10;6"
				></animate>
			</circle>
		</motion.svg>
	);
};

const DarkThemeIcon = () => {
	return (
		<motion.svg
			key="dark"
			initial={{ opacity: 0, scale: 0.8 }}
			animate={{ opacity: 1, scale: 1 }}
			exit={{ opacity: 0, scale: 0.8 }}
			transition={{ duration: 0.3, ease: "easeOut" }}
			xmlns="http://www.w3.org/2000/svg"
			width="1em"
			height="1em"
			viewBox="0 0 24 24"
			className="size-5"
			aria-hidden="true"
		>
			<path
				fill="currentColor"
				d="M11.38 2.019a7.5 7.5 0 1 0 10.6 10.6C21.662 17.854 17.316 22 12.001 22C6.477 22 2 17.523 2 12c0-5.315 4.146-9.661 9.38-9.981"
			/>
		</motion.svg>
	);
};
