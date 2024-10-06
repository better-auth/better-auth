"use client";
import { GridPattern } from "./grid-pattern";
import { Button } from "@/components/ui/button";
import clsx from "clsx";
import { Github, Icon } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { Highlight, themes } from "prism-react-renderer";
import { Fragment, useEffect, useId, useState } from "react";
import { LayoutGroup, motion } from "framer-motion";
import { Icons } from "../icons";
import { Cover } from "../ui/cover";
import { PulicBetaBadge } from "../beta/badge";

function Glow() {
	const id = useId();

	return (
		<div className="absolute  inset-0 -z-10 overflow-hidden bg-gradient-to-tr from-transparent via-stone-800/5 to-transparent/1  lg:right-[calc(max(2rem,50%-38rem)+40rem)] lg:min-w-[1rem]">
			<svg
				className="absolute -bottom-48 left-[-40%] h-[2rem] w-[10%] lg:-right-40 lg:bottom-auto lg:left-auto lg:top-[-40%] lg:h-[180%] lg:w-[80rem]"
				aria-hidden="true"
			>
				<defs>
					<radialGradient id={`${id}-desktop`} cx="100%">
						<stop offset="0%" stopColor="rgba(214, 211, 209, 0.05)" />
						<stop offset="53.95%" stopColor="rgba(214, 200, 209, 0.02)" />
						<stop offset="100%" stopColor="rgba(10, 14, 23, 0)" />
					</radialGradient>
					<radialGradient id={`${id}-mobile`} cy="100%">
						<stop offset="0%" stopColor="rgba(56, 189, 248, 0.05)" />
						<stop offset="53.95%" stopColor="rgba(0, 71, 255, 0.02)" />
						<stop offset="100%" stopColor="rgba(10, 14, 23, 0)" />
					</radialGradient>
				</defs>
				<rect
					width="40%"
					height="40%"
					fill={`url(#${id}-desktop)`}
					className="hidden lg:block"
				/>
				<rect
					width="100%"
					height="100%"
					fill={`url(#${id}-mobile)`}
					className="lg:hidden"
				/>
			</svg>
			<div className="absolute inset-x-0 bottom-0 right-0 h-px bg-white/5 mix-blend-overlay lg:left-auto lg:top-0 lg:h-auto lg:w-px" />
		</div>
	);
}

const tabs = [
	{
		name: "auth.ts",
		code: `export const auth = betterAuth({
	database: {
        provider: "postgresql",
        url: process.env.DATABASE_URL,
    },
    emailAndPassword: {
        enabled: true,
    },
	plugins: [
	  organization(),
      twoFactor(),
	]
})`,
	},
	{
		name: "client.ts",
		code: `const client = createAuthClient({
    plugins: [passkeyClient()]
});
        `,
	},
];

function TrafficLightsIcon(props: React.ComponentPropsWithoutRef<"svg">) {
	return (
		<svg aria-hidden="true" viewBox="0 0 42 10" fill="none" {...props}>
			<circle cx="5" cy="5" r="4.5" />
			<circle cx="21" cy="5" r="4.5" />
			<circle cx="37" cy="5" r="4.5" />
		</svg>
	);
}

export default function Hero() {
	const theme = useTheme();
	const [activeTab, setActiveTab] = useState("auth.ts");
	const code = tabs.find((tab) => tab.name === activeTab)?.code ?? "";
	return (
		<section className="w-full mx-auto px-10 flex min-h-[85vh] py-16 items-center justify-center gap-20">
			<div className="overflow-hidden bg-transparent dark:-mb-32 dark:mt-[-4.75rem] dark:pb-32 dark:pt-[4.75rem] md:px-10">
				<div className="grid max-w-full mx-auto grid-cols-1 items-center gap-x-8 gap-y-16 px-4 lg:max-w-8xl lg:grid-cols-2 lg:px-8 xl:gap-x-16 xl:px-12 py-2 lg:py-4">
					<div className="relative z-10 md:text-center lg:text-left">
						<div className="relative">
							<div className="flex flex-col items-start gap-2">
								<PulicBetaBadge text="Public Beta" />
								<div className="flex mt-2 items-center gap-2 relative">
									<Cover>
										<p className="inline  dark:text-white opacity-90 2xl md:text-3xl lg:text-5xl tracking-tight  relative">
											Better Auth.
										</p>
									</Cover>
								</div>
							</div>

							<p className="mt-3 md:text-2xl tracking-tight dark:text-zinc-300 text-zinc-800">
								The most comprehensive authentication library for TypeScript.
							</p>
							{
								<>
									<div className="mt-8 flex w-fit gap-4 font-sans md:justify-center lg:justify-start flex-col md:flex-row">
										<Link
											href="/docs"
											className="px-4 md:px-8 py-1.5  border-2 border-black dark:border-stone-100 uppercase bg-white text-black transition duration-200 text-sm shadow-[1px_1px_rgba(0,0,0),2px_2px_rgba(0,0,0),3px_3px_rgba(0,0,0),4px_4px_rgba(0,0,0),5px_5px_0px_0px_rgba(0,0,0)] dark:shadow-[1px_1px_rgba(255,255,255),2px_2px_rgba(255,255,255),3px_3px_rgba(255,255,255),4px_4px_rgba(255,255,255),5px_5px_0px_0px_rgba(255,255,255)] dark:hover:shadow-sm hover:shadow-sm"
										>
											Get Started
										</Link>

										<Link href="https://github.com/better-auth/better-auth">
											<Button
												variant="outline"
												size="lg"
												className="flex rounded-none items-center gap-2"
											>
												<Github size={16} />
												View on GitHub
											</Button>
										</Link>
									</div>
								</>
							}
						</div>
					</div>

					<div className="relative lg:static xl:pl-10 hidden md:block">
						<div className="relative">
							<div className="absolute inset-0 rounded-none bg-gradient-to-tr from-sky-300 via-sky-300/70 to-blue-300 opacity-5 blur-lg" />
							<div className="absolute inset-0 rounded-none bg-gradient-to-tr from-stone-300 via-stone-300/70 to-blue-300 opacity-5" />
							<LayoutGroup>
								<motion.div
									layoutId="hero"
									className="relative rounded-sm bg-gradient-to-tr from-stone-100 to-stone-200 dark:from-stone-950/70 dark:to-stone-950/90  ring-1 ring-white/10 backdrop-blur-lg"
								>
									<div className="absolute -top-px left-0 right-0 h-px " />
									<div className="absolute -bottom-px left-11 right-20 h-px" />
									<div className="pl-4 pt-4">
										<TrafficLightsIcon className="h-2.5 w-auto stroke-slate-500/30" />

										<div className="mt-4 flex space-x-2 text-xs">
											{tabs.map((tab) => (
												<motion.div
													key={tab.name}
													onClick={() => setActiveTab(tab.name)}
													className={clsx(
														"flex h-6 rounded-full cursor-pointer",
														activeTab === tab.name
															? "bg-gradient-to-r from-stone-400/90 via-stone-400 to-orange-400/20 p-px font-medium text-stone-300"
															: "text-slate-500",
													)}
												>
													<div
														className={clsx(
															"flex items-center rounded-full px-2.5",
															tab.name === activeTab && "bg-stone-800",
														)}
													>
														{tab.name}
													</div>
												</motion.div>
											))}
										</div>

										<div className="mt-6 flex items-start px-1 text-sm">
											<div
												aria-hidden="true"
												className="select-none border-r border-slate-300/5 pr-4 font-mono text-slate-600"
											>
												{Array.from({
													length: code.split("\n").length,
												}).map((_, index) => (
													<Fragment key={index}>
														{(index + 1).toString().padStart(2, "0")}
														<br />
													</Fragment>
												))}
											</div>
											<Highlight
												key={theme.resolvedTheme}
												code={code}
												language={"javascript"}
												theme={{
													...(theme.resolvedTheme === "light"
														? themes.oneLight
														: themes.synthwave84),

													plain: {
														backgroundColor: "transparent",
													},
												}}
											>
												{({
													className,
													style,
													tokens,
													getLineProps,
													getTokenProps,
												}) => (
													<pre
														className={clsx(
															className,
															"flex overflow-x-auto pb-6",
														)}
														style={style}
													>
														<code className="px-4">
															{tokens.map((line, lineIndex) => (
																<div
																	key={lineIndex}
																	{...getLineProps({ line })}
																>
																	{line.map((token, tokenIndex) => (
																		<span
																			key={tokenIndex}
																			{...getTokenProps({ token })}
																		/>
																	))}
																</div>
															))}
														</code>
													</pre>
												)}
											</Highlight>
											<Link
												href="https://demo.better-auth.com"
												target="_blank"
												className="ml-auto mr-4 flex items-center gap-2 mt-auto mb-4 cursor-pointer px-3 py-1 shadow-md shadow-primary-foreground hover:opacity-70 transition-all ease-in-out"
											>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													width="1em"
													height="1em"
													viewBox="0 0 24 24"
												>
													<path
														fill="currentColor"
														d="M10 20H8V4h2v2h2v3h2v2h2v2h-2v2h-2v3h-2z"
													></path>
												</svg>
												<p className="text-sm">Demo</p>
											</Link>
										</div>
									</div>
								</motion.div>
							</LayoutGroup>
						</div>
					</div>
				</div>
			</div>
			<GridPattern
				className="absolute inset-x-0 -top-14 -z-10 h-full w-full dark:fill-secondary/30 fill-neutral-100 dark:stroke-secondary/30 stroke-neutral-700/5 [mask-image:linear-gradient(to_bottom_left,white_40%,transparent_50%)]"
				yOffset={-96}
				interactive
			/>
		</section>
	);
}

export function HeroBackground(props: React.ComponentPropsWithoutRef<"svg">) {
	const id = useId();
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 668 1069"
			width={668}
			height={1069}
			fill="none"
			{...props}
		>
			<defs>
				<clipPath id={`${id}-clip-path`}>
					<path
						fill="#fff"
						transform="rotate(-180 334 534.4)"
						d="M0 0h668v1068.8H0z"
					/>
				</clipPath>
			</defs>
			<g opacity=".4" clipPath={`url(#${id}-clip-path)`} strokeWidth={4}>
				<path
					opacity=".3"
					d="M584.5 770.4v-474M484.5 770.4v-474M384.5 770.4v-474M283.5 769.4v-474M183.5 768.4v-474M83.5 767.4v-474"
					stroke="#334155"
				/>
				<path
					d="M83.5 221.275v6.587a50.1 50.1 0 0 0 22.309 41.686l55.581 37.054a50.102 50.102 0 0 1 22.309 41.686v6.587M83.5 716.012v6.588a50.099 50.099 0 0 0 22.309 41.685l55.581 37.054a50.102 50.102 0 0 1 22.309 41.686v6.587M183.7 584.5v6.587a50.1 50.1 0 0 0 22.31 41.686l55.581 37.054a50.097 50.097 0 0 1 22.309 41.685v6.588M384.101 277.637v6.588a50.1 50.1 0 0 0 22.309 41.685l55.581 37.054a50.1 50.1 0 0 1 22.31 41.686v6.587M384.1 770.288v6.587a50.1 50.1 0 0 1-22.309 41.686l-55.581 37.054A50.099 50.099 0 0 0 283.9 897.3v6.588"
					stroke="#334155"
				/>
				<path
					d="M384.1 770.288v6.587a50.1 50.1 0 0 1-22.309 41.686l-55.581 37.054A50.099 50.099 0 0 0 283.9 897.3v6.588M484.3 594.937v6.587a50.1 50.1 0 0 1-22.31 41.686l-55.581 37.054A50.1 50.1 0 0 0 384.1 721.95v6.587M484.3 872.575v6.587a50.1 50.1 0 0 1-22.31 41.686l-55.581 37.054a50.098 50.098 0 0 0-22.309 41.686v6.582M584.501 663.824v39.988a50.099 50.099 0 0 1-22.31 41.685l-55.581 37.054a50.102 50.102 0 0 0-22.309 41.686v6.587M283.899 945.637v6.588a50.1 50.1 0 0 1-22.309 41.685l-55.581 37.05a50.12 50.12 0 0 0-22.31 41.69v6.59M384.1 277.637c0 19.946 12.763 37.655 31.686 43.962l137.028 45.676c18.923 6.308 31.686 24.016 31.686 43.962M183.7 463.425v30.69c0 21.564 13.799 40.709 34.257 47.529l134.457 44.819c18.922 6.307 31.686 24.016 31.686 43.962M83.5 102.288c0 19.515 13.554 36.412 32.604 40.645l235.391 52.309c19.05 4.234 32.605 21.13 32.605 40.646M83.5 463.425v-58.45M183.699 542.75V396.625M283.9 1068.8V945.637M83.5 363.225v-141.95M83.5 179.524v-77.237M83.5 60.537V0M384.1 630.425V277.637M484.301 830.824V594.937M584.5 1068.8V663.825M484.301 555.275V452.988M584.5 622.075V452.988M384.1 728.537v-56.362M384.1 1068.8v-20.88M384.1 1006.17V770.287M283.9 903.888V759.85M183.699 1066.71V891.362M83.5 1068.8V716.012M83.5 674.263V505.175"
					stroke="#334155"
				/>
				<circle
					cx="83.5"
					cy="384.1"
					r="10.438"
					transform="rotate(-180 83.5 384.1)"
					fill="#1E293B"
					stroke="#334155"
				/>
				<circle
					cx="83.5"
					cy="200.399"
					r="10.438"
					transform="rotate(-180 83.5 200.399)"
					stroke="#334155"
				/>
				<circle
					cx="83.5"
					cy="81.412"
					r="10.438"
					transform="rotate(-180 83.5 81.412)"
					stroke="#334155"
				/>
				<circle
					cx="183.699"
					cy="375.75"
					r="10.438"
					transform="rotate(-180 183.699 375.75)"
					fill="#1E293B"
					stroke="#334155"
				/>
				<circle
					cx="183.699"
					cy="563.625"
					r="10.438"
					transform="rotate(-180 183.699 563.625)"
					fill="#1E293B"
					stroke="#334155"
				/>
				<circle
					cx="384.1"
					cy="651.3"
					r="10.438"
					transform="rotate(-180 384.1 651.3)"
					fill="#1E293B"
					stroke="#334155"
				/>
				<circle
					cx="484.301"
					cy="574.062"
					r="10.438"
					transform="rotate(-180 484.301 574.062)"
					fill="#0EA5E9"
					fillOpacity=".42"
					stroke="#0EA5E9"
				/>
				<circle
					cx="384.1"
					cy="749.412"
					r="10.438"
					transform="rotate(-180 384.1 749.412)"
					fill="#1E293B"
					stroke="#334155"
				/>
				<circle
					cx="384.1"
					cy="1027.05"
					r="10.438"
					transform="rotate(-180 384.1 1027.05)"
					stroke="#334155"
				/>
				<circle
					cx="283.9"
					cy="924.763"
					r="10.438"
					transform="rotate(-180 283.9 924.763)"
					stroke="#334155"
				/>
				<circle
					cx="183.699"
					cy="870.487"
					r="10.438"
					transform="rotate(-180 183.699 870.487)"
					stroke="#334155"
				/>
				<circle
					cx="283.9"
					cy="738.975"
					r="10.438"
					transform="rotate(-180 283.9 738.975)"
					fill="#1E293B"
					stroke="#334155"
				/>
				<circle
					cx="83.5"
					cy="695.138"
					r="10.438"
					transform="rotate(-180 83.5 695.138)"
					fill="#1E293B"
					stroke="#334155"
				/>
				<circle
					cx="83.5"
					cy="484.3"
					r="10.438"
					transform="rotate(-180 83.5 484.3)"
					fill="#0EA5E9"
					fillOpacity=".42"
					stroke="#0EA5E9"
				/>
				<circle
					cx="484.301"
					cy="432.112"
					r="10.438"
					transform="rotate(-180 484.301 432.112)"
					fill="#1E293B"
					stroke="#334155"
				/>
				<circle
					cx="584.5"
					cy="432.112"
					r="10.438"
					transform="rotate(-180 584.5 432.112)"
					fill="#1E293B"
					stroke="#334155"
				/>
				<circle
					cx="584.5"
					cy="642.95"
					r="10.438"
					transform="rotate(-180 584.5 642.95)"
					fill="#1E293B"
					stroke="#334155"
				/>
				<circle
					cx="484.301"
					cy="851.699"
					r="10.438"
					transform="rotate(-180 484.301 851.699)"
					stroke="#334155"
				/>
				<circle
					cx="384.1"
					cy="256.763"
					r="10.438"
					transform="rotate(-180 384.1 256.763)"
					stroke="#334155"
				/>
			</g>
		</svg>
	);
}
