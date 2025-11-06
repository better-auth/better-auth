"use client";

import clsx from "clsx";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { Check, Copy } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Highlight, themes } from "prism-react-renderer";
import { useEffect, useId, useState } from "react";
import useMeasure from "react-use-measure";
import { Button } from "@/components/ui/button";
import { Builder } from "../builder";
import { GradientBG } from "./gradient-bg";
import { Spotlight } from "./spotlight";

export default function Hero() {
	return (
		<section className="relative w-full flex md:items-center md:justify-center bg-white/96 dark:bg-black/[0.96] antialiased min-h-[40rem] md:min-h-[50rem] lg:min-h-[40rem]">
			{/* Spotlight Effect */}
			<Spotlight />

			{/* Background Grid */}
			<div className="absolute inset-0 left-5 right-5 lg:left-16 lg:right-14 xl:left-16 xl:right-14">
				<div className="absolute inset-0 bg-grid text-muted/50 dark:text-white/[0.02]" />
				<div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
			</div>

			{/* Content */}
			<div className="px-4 py-8 md:w-10/12 mx-auto relative z-10">
				<div className="mx-auto grid lg:max-w-8xl xl:max-w-full grid-cols-1 items-center gap-x-8 gap-y-16 px-4 py-2 lg:grid-cols-2 lg:px-8 lg:py-4 xl:gap-x-16 xl:px-0">
					<div className="relative z-10 text-left lg:mt-0">
						<div className="relative space-y-4">
							<div className="space-y-2">
								<div className="flex flex-col gap-2">
									<div className="flex items-end gap-1 mt-2">
										<div className="flex items-center gap-1">
											<svg
												xmlns="http://www.w3.org/2000/svg"
												width="0.8em"
												height="0.8em"
												viewBox="0 0 24 24"
											>
												<path
													fill="currentColor"
													d="M13 4V2c4.66.5 8.33 4.19 8.85 8.85c.6 5.49-3.35 10.43-8.85 11.03v-2c3.64-.45 6.5-3.32 6.96-6.96A7.994 7.994 0 0 0 13 4m-7.33.2A9.8 9.8 0 0 1 11 2v2.06c-1.43.2-2.78.78-3.9 1.68zM2.05 11a9.8 9.8 0 0 1 2.21-5.33L5.69 7.1A8 8 0 0 0 4.05 11zm2.22 7.33A10.04 10.04 0 0 1 2.06 13h2c.18 1.42.75 2.77 1.63 3.9zm1.4 1.41l1.39-1.37h.04c1.13.88 2.48 1.45 3.9 1.63v2c-1.96-.21-3.82-1-5.33-2.26M12 17l1.56-3.42L17 12l-3.44-1.56L12 7l-1.57 3.44L7 12l3.43 1.58z"
												></path>
											</svg>
											<span className="text-xs text-opacity-75">
												Own Your Auth
											</span>
										</div>
									</div>
								</div>

								<p className="text-zinc-800 dark:text-zinc-300 tracking-tight text-2xl md:text-3xl text-pretty">
									The most comprehensive authentication framework for
									TypeScript.
								</p>
							</div>

							<div className="relative flex items-center gap-2 w-full sm:w-[90%] border border-white/10">
								<GradientBG className="w-full flex items-center justify-between gap-2">
									<div className="w-full flex flex-col min-[350px]:flex-row min-[350px]:items-center gap-0.5 min-[350px]:gap-2 min-w-0">
										<p className="text-xs sm:text-sm font-mono select-none tracking-tighter space-x-1 shrink-0">
											<span>
												<span className="text-sky-500">git:</span>
												<span className="text-red-400">(main)</span>
											</span>
											<span className="italic text-amber-600">x</span>
										</p>
										<p className="relative inline tracking-tight opacity-90 md:text-sm text-xs dark:text-white font-mono text-black">
											npm i{" "}
											<span className="relative dark:text-fuchsia-300 text-fuchsia-800">
												better-auth
												<span className="absolute h-2 bg-gradient-to-tr from-white via-stone-200 to-stone-300 blur-3xl w-full top-0 left-2"></span>
											</span>
										</p>
									</div>
									<div className="flex gap-2 items-center">
										<Link
											href="https://www.npmjs.com/package/better-auth"
											target="_blank"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												width="1em"
												height="1em"
												viewBox="0 0 128 128"
											>
												<path
													fill="#cb3837"
													d="M0 7.062C0 3.225 3.225 0 7.062 0h113.88c3.838 0 7.063 3.225 7.063 7.062v113.88c0 3.838-3.225 7.063-7.063 7.063H7.062c-3.837 0-7.062-3.225-7.062-7.063zm23.69 97.518h40.395l.05-58.532h19.494l-.05 58.581h19.543l.05-78.075l-78.075-.1l-.1 78.126z"
												></path>
												<path
													fill="#fff"
													d="M25.105 65.52V26.512H40.96c8.72 0 26.274.034 39.008.075l23.153.075v77.866H83.645v-58.54H64.057v58.54H25.105z"
												></path>
											</svg>
										</Link>
										<Link
											href="https://github.com/better-auth/better-auth"
											target="_blank"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												width="1em"
												height="1em"
												viewBox="0 0 256 256"
											>
												<g fill="none">
													<rect
														width="256"
														height="256"
														fill="#242938"
														rx="60"
													></rect>
													<path
														fill="#fff"
														d="M128.001 30C72.779 30 28 74.77 28 130.001c0 44.183 28.653 81.667 68.387 94.89c4.997.926 6.832-2.169 6.832-4.81c0-2.385-.093-10.262-.136-18.618c-27.82 6.049-33.69-11.799-33.69-11.799c-4.55-11.559-11.104-14.632-11.104-14.632c-9.073-6.207.684-6.079.684-6.079c10.042.705 15.33 10.305 15.33 10.305c8.919 15.288 23.394 10.868 29.1 8.313c.898-6.464 3.489-10.875 6.349-13.372c-22.211-2.529-45.56-11.104-45.56-49.421c0-10.918 3.906-19.839 10.303-26.842c-1.039-2.519-4.462-12.69.968-26.464c0 0 8.398-2.687 27.508 10.25c7.977-2.215 16.531-3.326 25.03-3.364c8.498.038 17.06 1.149 25.051 3.365c19.087-12.939 27.473-10.25 27.473-10.25c5.443 13.773 2.019 23.945.98 26.463c6.412 7.003 10.292 15.924 10.292 26.842c0 38.409-23.394 46.866-45.662 49.341c3.587 3.104 6.783 9.189 6.783 18.519c0 13.38-.116 24.149-.116 27.443c0 2.661 1.8 5.779 6.869 4.797C199.383 211.64 228 174.169 228 130.001C228 74.771 183.227 30 128.001 30M65.454 172.453c-.22.497-1.002.646-1.714.305c-.726-.326-1.133-1.004-.898-1.502c.215-.512.999-.654 1.722-.311c.727.326 1.141 1.01.89 1.508m4.919 4.389c-.477.443-1.41.237-2.042-.462c-.654-.697-.777-1.629-.293-2.078c.491-.442 1.396-.235 2.051.462c.654.706.782 1.631.284 2.078m3.374 5.616c-.613.426-1.615.027-2.234-.863c-.613-.889-.613-1.955.013-2.383c.621-.427 1.608-.043 2.236.84c.611.904.611 1.971-.015 2.406m5.707 6.504c-.548.604-1.715.442-2.57-.383c-.874-.806-1.118-1.95-.568-2.555c.555-.606 1.729-.435 2.59.383c.868.804 1.133 1.957.548 2.555m7.376 2.195c-.242.784-1.366 1.14-2.499.807c-1.13-.343-1.871-1.26-1.642-2.052c.235-.788 1.364-1.159 2.505-.803c1.13.341 1.871 1.252 1.636 2.048m8.394.932c.028.824-.932 1.508-2.121 1.523c-1.196.027-2.163-.641-2.176-1.452c0-.833.939-1.51 2.134-1.53c1.19-.023 2.163.639 2.163 1.459m8.246-.316c.143.804-.683 1.631-1.864 1.851c-1.161.212-2.236-.285-2.383-1.083c-.144-.825.697-1.651 1.856-1.865c1.183-.205 2.241.279 2.391 1.097"
													></path>
												</g>
											</svg>
										</Link>
									</div>
								</GradientBG>
							</div>

							<div className="mt-4 flex w-fit flex-col gap-4 font-sans md:flex-row md:justify-center lg:justify-start items-center">
								<Link
									href="/docs"
									className="hover:shadow-sm dark:border-stone-100 dark:hover:shadow-sm border-2 border-black bg-white px-4 py-1.5 text-sm uppercase text-black shadow-[1px_1px_rgba(0,0,0),2px_2px_rgba(0,0,0),3px_3px_rgba(0,0,0),4px_4px_rgba(0,0,0),5px_5px_0px_0px_rgba(0,0,0)] transition duration-200 md:px-8 dark:shadow-[1px_1px_rgba(255,255,255),2px_2px_rgba(255,255,255),3px_3px_rgba(255,255,255),4px_4px_rgba(255,255,255),5px_5px_0px_0px_rgba(255,255,255)]"
								>
									Get Started
								</Link>
								<Builder />
							</div>
						</div>
					</div>

					<div className="relative md:block lg:static xl:pl-10">
						<div className="relative">
							<div className="from-sky-300 via-sky-300/70 to-blue-300 absolute inset-0 rounded-none bg-gradient-to-tr opacity-5 blur-lg" />
							<div className="from-stone-300 via-stone-300/70 to-blue-300 absolute inset-0 rounded-none bg-gradient-to-tr opacity-5" />
							<CodePreview />
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}

const tabs: { name: "auth.ts" | "client.ts"; code: string }[] = [
	{
		name: "auth.ts",
		code: `export const auth = betterAuth({
	database: new Pool({
		connectionString: DATABASE_URL,
	}),
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
    plugins: [
		organizationClient(),
		twoFactorClient(),
	]
});`,
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

function CodePreview() {
	const { resolvedTheme } = useTheme();
	const [ref, { height }] = useMeasure();
	const [copyState, setCopyState] = useState(false);
	const [codeTheme, setCodeTheme] = useState(themes.synthwave84);
	const [currentTab, setCurrentTab] = useState<"auth.ts" | "client.ts">(
		"auth.ts",
	);

	useEffect(() => {
		setCodeTheme(
			resolvedTheme === "light" ? themes.oneLight : themes.synthwave84,
		);
	}, [resolvedTheme]);

	const copyToClipboard = (text: string) => {
		navigator.clipboard.writeText(text).then(() => {
			setCopyState(true);
			setTimeout(() => {
				setCopyState(false);
			}, 2000);
		});
	};

	const code = tabs.find((tab) => tab.name === currentTab)?.code ?? "";

	return (
		<AnimatePresence initial={false}>
			<MotionConfig transition={{ duration: 0.5, type: "spring", bounce: 0 }}>
				<motion.div
					animate={{ height: height > 0 ? height : undefined }}
					className="from-stone-100 to-stone-200 dark:to-black/90 dark:via-black dark:from-stone-950/90 relative overflow-hidden rounded-sm bg-gradient-to-tr ring-1 ring-white/10 backdrop-blur-lg"
				>
					<div ref={ref}>
						<div className="absolute -top-px left-0 right-0 h-px" />
						<div className="absolute -bottom-px left-11 right-20 h-px" />
						<div className="pl-4 pt-4">
							<TrafficLightsIcon className="stroke-slate-500/30 h-2.5 w-auto" />

							<div className="mt-4 flex space-x-2 text-xs">
								{tabs.map((tab) => (
									<button
										key={tab.name}
										onClick={() => setCurrentTab(tab.name)}
										className={clsx(
											"relative isolate flex h-6 cursor-pointer items-center justify-center rounded-full px-2.5",
											currentTab === tab.name
												? "text-stone-300"
												: "text-slate-500",
										)}
									>
										{tab.name}
										{tab.name === currentTab && (
											<motion.div
												layoutId="tab-code-preview"
												className="bg-stone-800 absolute inset-0 -z-10 rounded-full"
											/>
										)}
									</button>
								))}
							</div>

							<div className="flex flex-col items-start px-1 text-sm">
								<div className="absolute top-2 right-4">
									<Button
										variant="outline"
										size="icon"
										className="absolute w-5 border-none bg-transparent h-5 top-2 right-0"
										onClick={() => copyToClipboard(code)}
									>
										{copyState ? (
											<Check className="h-3 w-3" />
										) : (
											<Copy className="h-3 w-3" />
										)}
										<span className="sr-only">Copy code</span>
									</Button>
								</div>
								<div className="w-full overflow-x-auto">
									<motion.div
										initial={{ opacity: 0 }}
										animate={{ opacity: 1 }}
										transition={{ duration: 0.5 }}
										key={currentTab}
										className="relative flex items-center px-1 text-sm min-w-max"
									>
										<div
											aria-hidden="true"
											className="border-slate-300/5 text-slate-600 select-none border-r pr-4 font-mono"
										>
											{Array.from({
												length: code.split("\n").length,
											}).map((_, index) => (
												<div key={index}>
													{(index + 1).toString().padStart(2, "0")}
													<br />
												</div>
											))}
										</div>
										<Highlight
											key={resolvedTheme}
											code={code}
											language={"javascript"}
											theme={{
												...codeTheme,
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
												<pre className={clsx(className)} style={style}>
													<code className="px-4 font-mono whitespace-pre">
														{tokens.map((line, lineIndex) => (
															<div key={lineIndex} {...getLineProps({ line })}>
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
									</motion.div>
								</div>
								<motion.div layout className="self-end mt-3">
									<Link
										href="https://demo.better-auth.com"
										target="_blank"
										className="shadow-md  border shadow-primary-foreground mb-4 ml-auto mr-4 mt-auto flex cursor-pointer items-center gap-2 px-3 py-1 transition-all ease-in-out hover:opacity-70"
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
								</motion.div>
							</div>
						</div>
					</div>
				</motion.div>
			</MotionConfig>
		</AnimatePresence>
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
