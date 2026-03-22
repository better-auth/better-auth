"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Github } from "lucide-react";
import Link from "next/link";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { Icons } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";
import type { ContributorInfo } from "@/lib/community-stats";
import { cn } from "@/lib/utils";
import { FeaturesSection } from "./features-section";
import {
	AiNativeSection,
	DatabaseSection,
	PluginEcosystem,
	ServerClientTabs,
	SocialProvidersSection,
} from "./framework-sections";
import { TrustedBy } from "./trusted-by";

const cliCommands = [
	{ name: "npm", command: "npx auth init" },
	{ name: "yarn", command: "yarn dlx auth init" },
	{ name: "pnpm", command: "pnpm dlx auth init" },
	{ name: "bun", command: "bunx auth init" },
];

const mcpCommands = [
	{ name: "Cursor", command: "npx auth mcp --cursor" },
	{
		name: "Claude Code",
		command:
			"claude mcp add --transport http better-auth https://mcp.inkeep.com/better-auth/mcp",
	},
	{ name: "Open Code", command: "npx auth mcp --open-code" },
	{ name: "Manual", command: "npx auth mcp --manual" },
];

const aiPromptText = `Set up authentication in my project using Better Auth (better-auth npm package).

1. Install better-auth. If I already have a database configured in this project, use that — don't set up a new one.

2. Create lib/auth.ts — call betterAuth() with:
   - My existing database connection (or a new SQLite/Postgres setup if none exists)
   - emailAndPassword enabled
   - Any social providers if I have OAuth credentials in my env

3. Create lib/auth-client.ts — use the correct framework import:
   - React/Next.js: "better-auth/react"
   - Vue: "better-auth/vue"
   - Svelte: "better-auth/svelte"
   - Vanilla: "better-auth/client"

4. Add the API route handler for my framework (e.g. app/api/auth/[...all]/route.ts for Next.js App Router).

5. Add BETTER_AUTH_SECRET to my .env if it doesn't exist (generate a 32+ char secret).

6. Run npx auth migrate to apply database migrations.

Refer to better-auth.com/docs for exact API and plugin syntax.`;

function InstallBlock() {
	const [mode, setMode] = useState<"cli" | "prompt" | "mcp" | "skills">("cli");
	const [copied, setCopied] = useState(false);
	const [pmOpen, setPmOpen] = useState(false);
	const [promptOpen, setPromptOpen] = useState(false);
	const contentRef = useRef<HTMLDivElement>(null);
	const [contentHeight, setContentHeight] = useState<number | "auto">("auto");
	const [overflow, setOverflow] = useState<"hidden" | "visible">("visible");

	useEffect(() => {
		const el = contentRef.current;
		if (!el) return;
		const ro = new ResizeObserver(() => {
			setContentHeight(el.offsetHeight);
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	useLayoutEffect(() => {
		setOverflow("hidden");
	}, [mode]);

	useLayoutEffect(() => {
		if (pmOpen) {
			setOverflow("visible");
		}
	}, [pmOpen]);

	const copy = (text: string) => {
		navigator.clipboard.writeText(text);
		setCopied(true);
		setPmOpen(false);
		setTimeout(() => setCopied(false), 1500);
	};

	return (
		<div className="mb-6 rounded-md border border-foreground/[0.1] relative">
			{/* Tabs */}
			<div className="flex items-center border-b border-foreground/[0.1]">
				<button
					onClick={() => {
						setMode("cli");
						setCopied(false);
						setPmOpen(false);
					}}
					className={cn(
						"px-4 py-2 text-[12px] transition-colors duration-150 relative",
						mode === "cli"
							? "text-neutral-800 dark:text-neutral-200"
							: "text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-400",
					)}
				>
					CLI
					{mode === "cli" && (
						<div className="absolute bottom-0 left-4 right-4 h-[1.5px] bg-neutral-600 dark:bg-neutral-400" />
					)}
				</button>
				<button
					onClick={() => {
						setMode("prompt");
						setCopied(false);
						setPmOpen(false);
					}}
					className={cn(
						"px-4 py-2 text-[12px] transition-colors duration-150 relative",
						mode === "prompt"
							? "text-neutral-800 dark:text-neutral-200"
							: "text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-400",
					)}
				>
					Prompt
					{mode === "prompt" && (
						<div className="absolute bottom-0 left-4 right-4 h-[1.5px] bg-neutral-600 dark:bg-neutral-400" />
					)}
				</button>
				<button
					onClick={() => {
						setMode("mcp");
						setCopied(false);
						setPmOpen(false);
					}}
					className={cn(
						"px-4 py-2 text-[12px] transition-colors duration-150 relative",
						mode === "mcp"
							? "text-neutral-800 dark:text-neutral-200"
							: "text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-400",
					)}
				>
					MCP
					{mode === "mcp" && (
						<div className="absolute bottom-0 left-4 right-4 h-[1.5px] bg-neutral-600 dark:bg-neutral-400" />
					)}
				</button>
				<button
					onClick={() => {
						setMode("skills");
						setCopied(false);
						setPmOpen(false);
					}}
					className={cn(
						"px-4 py-2 text-[12px] transition-colors duration-150 relative",
						mode === "skills"
							? "text-neutral-800 dark:text-neutral-200"
							: "text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-400",
					)}
				>
					Skills
					{mode === "skills" && (
						<div className="absolute bottom-0 left-4 right-4 h-[1.5px] bg-neutral-600 dark:bg-neutral-400" />
					)}
				</button>
			</div>

			{/* Content */}
			<motion.div
				animate={{ height: contentHeight }}
				initial={false}
				transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
				onAnimationComplete={() => setOverflow("visible")}
				style={{ overflow }}
			>
				<div ref={contentRef}>
					<AnimatePresence mode="wait" initial={false}>
						<div>
							{mode === "cli" || mode === "skills" ? (
								<div className="flex items-center justify-between bg-neutral-100/50 dark:bg-[#050505] px-4 py-3">
									<code
										className="text-[13px]"
										style={{ fontFamily: "var(--font-geist-pixel-square)" }}
									>
										{mode === "skills" ? (
											<>
												<span className="text-purple-600/90 dark:text-purple-400/90">
													npx
												</span>{" "}
												<span className="text-neutral-700 dark:text-neutral-300">
													skills add better-auth/skills
												</span>
											</>
										) : (
											<>
												<span className="text-purple-600/90 dark:text-purple-400/90">
													npx
												</span>{" "}
												<span className="text-neutral-700 dark:text-neutral-300">
													auth init
												</span>
											</>
										)}
									</code>
									<div className="relative">
										{mode === "skills" ? (
											<button
												onClick={() =>
													copy("npx skills add better-auth/skills")
												}
												className="text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors p-1"
												aria-label="Copy command"
											>
												{copied ? (
													<svg
														xmlns="http://www.w3.org/2000/svg"
														viewBox="0 0 24 24"
														className="h-4 w-4"
													>
														<path
															fill="currentColor"
															d="M9 16.17L4.83 12l-1.42 1.41L9 19L21 7l-1.41-1.41z"
														/>
													</svg>
												) : (
													<svg
														xmlns="http://www.w3.org/2000/svg"
														viewBox="0 0 24 24"
														className="h-4 w-4"
													>
														<path
															fill="currentColor"
															d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2m0 16H8V7h11z"
														/>
													</svg>
												)}
											</button>
										) : (
											<>
												<button
													onClick={() => {
														if (copied) return;
														setPmOpen(!pmOpen);
													}}
													className="text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors p-1"
													aria-label="Copy command"
												>
													{copied ? (
														<svg
															xmlns="http://www.w3.org/2000/svg"
															viewBox="0 0 24 24"
															className="h-4 w-4"
														>
															<path
																fill="currentColor"
																d="M9 16.17L4.83 12l-1.42 1.41L9 19L21 7l-1.41-1.41z"
															/>
														</svg>
													) : (
														<svg
															xmlns="http://www.w3.org/2000/svg"
															viewBox="0 0 24 24"
															className="h-4 w-4"
														>
															<path
																fill="currentColor"
																d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2m0 16H8V7h11z"
															/>
														</svg>
													)}
												</button>
												{pmOpen && (
													<>
														<div
															className="fixed inset-0 z-40"
															role="button"
															tabIndex={-1}
															aria-label="Close dropdown"
															onClick={() => setPmOpen(false)}
															onKeyDown={(e) => {
																if (e.key === "Escape") setPmOpen(false);
															}}
														/>
														<div className="absolute right-0 top-full mt-2 w-[138px] bg-white dark:bg-[#050505] border border-neutral-200 dark:border-white/[0.07] shadow-2xl shadow-black/10 dark:shadow-black/80 z-50 rounded-sm">
															{cliCommands.map((pm, i) => (
																<button
																	key={pm.name}
																	onClick={() => copy(pm.command)}
																	className={cn(
																		"flex items-center gap-2.5 w-full px-3 py-2 text-[12px] text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/[0.05] transition-all text-left",
																		i < cliCommands.length - 1 &&
																			"border-b border-neutral-100 dark:border-white/[0.06]",
																	)}
																>
																	{pm.name === "npm" && (
																		<svg
																			xmlns="http://www.w3.org/2000/svg"
																			width="14"
																			height="14"
																			viewBox="0 0 256 256"
																		>
																			<path
																				fill="#C12127"
																				d="M0 256V0h256v256z"
																			/>
																			<path
																				fill="#FFF"
																				d="M48 48h160v160h-32V80h-48v128H48z"
																			/>
																		</svg>
																	)}
																	{pm.name === "yarn" && (
																		<svg
																			xmlns="http://www.w3.org/2000/svg"
																			width="14"
																			height="14"
																			viewBox="0 0 256 256"
																		>
																			<path
																				fill="#368FB9"
																				d="M128 0C57.328 0 0 57.328 0 128s57.328 128 128 128s128-57.328 128-128S198.672 0 128 0"
																			/>
																			<path
																				fill="#FFF"
																				d="M203.317 174.06c-7.907 1.878-11.91 3.608-21.695 9.983c-15.271 9.884-31.976 14.48-31.976 14.48s-1.383 2.076-5.387 3.015c-6.918 1.68-32.963 3.114-35.335 3.163c-6.376.05-10.28-1.63-11.367-4.25c-3.311-7.907 4.744-11.367 4.744-11.367s-1.779-1.087-2.817-2.076c-.939-.939-1.927-2.816-2.224-2.125c-1.235 3.015-1.878 10.379-5.189 13.69c-4.547 4.596-13.146 3.064-18.236.395c-5.585-2.965.395-9.933.395-9.933s-3.015 1.779-5.436-1.878c-2.175-3.36-4.2-9.094-3.657-16.16c.593-8.056 9.587-15.865 9.587-15.865s-1.581-11.91 3.608-24.117c4.695-11.12 17.347-20.065 17.347-20.065s-10.626-11.762-6.672-22.338c2.57-6.92 3.608-6.87 4.448-7.166c2.965-1.137 5.831-2.373 7.957-4.695c10.625-11.466 24.166-9.292 24.166-9.292s6.425-19.52 12.356-15.715c1.828 1.186 8.401 15.814 8.401 15.814s7.018-4.102 7.809-2.57c4.25 8.254 4.744 24.019 2.866 33.607c-3.163 15.814-11.07 24.315-14.233 29.652c-.741 1.236 8.5 5.14 14.332 21.3c5.387 14.777.593 27.182 1.433 28.566c.148.247.198.346.198.346s6.177.494 18.582-7.166c6.622-4.102 14.48-8.698 23.425-8.797c8.65-.149 9.094 9.983 2.57 11.564"
																			/>
																		</svg>
																	)}
																	{pm.name === "pnpm" && (
																		<svg
																			xmlns="http://www.w3.org/2000/svg"
																			width="14"
																			height="14"
																			viewBox="0 0 256 256"
																		>
																			<path
																				fill="#F9AD00"
																				d="M0 0h77.37v77.37H0zm89.32 0h77.37v77.37H89.32zm89.31 0h77.37v77.37h-77.37zM89.32 89.32h77.37v77.37H89.32zm89.31 0h77.37v77.37h-77.37z"
																			/>
																			<path
																				fill="#4E4E4E"
																				d="M0 89.32h77.37v77.37H0zm0 89.31h77.37v77.37H0zm89.32 0h77.37v77.37H89.32zm89.31 0h77.37v77.37h-77.37z"
																			/>
																		</svg>
																	)}
																	{pm.name === "bun" && (
																		<svg
																			xmlns="http://www.w3.org/2000/svg"
																			width="14"
																			height="14"
																			viewBox="0 0 256 225"
																		>
																			<path
																				fill="#FBF0DF"
																				d="M234.937 114.066c0 49.288-50.779 89.243-113.418 89.243S8.101 163.354 8.101 114.066c0-30.558 19.443-57.552 49.32-73.56C87.3 24.498 105.9 8.101 121.52 8.101s28.97 13.384 64.097 32.405c29.878 16.008 49.32 43.002 49.32 73.56"
																			/>
																			<path
																				fill="#F6DECE"
																				d="M234.937 114.066a70.2 70.2 0 0 0-2.593-18.73c-8.846 107.909-140.476 113.093-192.227 80.818a129.62 129.62 0 0 0 81.402 27.155c62.542 0 113.418-40.02 113.418-89.243"
																			/>
																			<path
																				fill="#CCBEA7"
																				d="M112.186 16.3a53.18 53.18 0 0 1-18.244 40.409c-.907.81-.194 2.365.972 1.912c10.92-4.245 25.665-16.948 19.443-42.58c-.259-1.459-2.17-1.07-2.17.259m7.356 0a52.63 52.63 0 0 1 5.217 43.65c-.388 1.134 1.005 2.106 1.783 1.166c7.096-9.073 13.286-27.09-5.25-46.534c-.94-.842-2.398.454-1.75 1.588zm8.944-.551a53.2 53.2 0 0 1 22.198 38.108a1.07 1.07 0 0 0 2.106.357c2.981-11.31 1.296-30.59-23.235-40.604c-1.296-.518-2.138 1.232-1.069 2.01zM68.666 49.45a54.9 54.9 0 0 0 33.928-29.164c.584-1.167 2.43-.713 2.14.583c-5.607 25.924-24.37 31.336-36.035 30.623c-1.232.032-1.2-1.685-.033-2.042"
																			/>
																			<g transform="translate(53.792 88.4)">
																				<ellipse
																					cx="117.047"
																					cy="40.183"
																					fill="#FEBBD0"
																					rx="18.957"
																					ry="11.147"
																				/>
																				<ellipse
																					cx="18.957"
																					cy="40.183"
																					fill="#FEBBD0"
																					rx="18.957"
																					ry="11.147"
																				/>
																				<path
																					fill="#2E2218"
																					d="M27.868 35.71a17.855 17.855 0 1 0-17.822-17.854c0 9.848 7.974 17.837 17.822 17.855m80.268 0A17.855 17.855 0 1 0 90.41 17.857c-.018 9.818 7.908 17.801 17.726 17.855"
																				/>
																				<path
																					fill="#FFF"
																					d="M22.36 18.99a6.708 6.708 0 1 0 .064-13.416a6.708 6.708 0 0 0-.065 13.416m80.267 0a6.708 6.708 0 1 0-.065 0z"
																				/>
																			</g>
																			<path
																				fill="#B71422"
																				d="M144.365 137.722a28.94 28.94 0 0 1-9.463 15.263a22.07 22.07 0 0 1-12.962 6.092a22.17 22.17 0 0 1-13.383-6.092a28.94 28.94 0 0 1-9.333-15.263a2.333 2.333 0 0 1 2.593-2.625h39.988a2.333 2.333 0 0 1 2.56 2.625"
																			/>
																		</svg>
																	)}
																	<span className="font-mono text-[11px]">
																		{pm.command.split(" ")[0]}
																	</span>
																</button>
															))}
														</div>
													</>
												)}
											</>
										)}
									</div>
								</div>
							) : mode === "mcp" ? (
								<div className="flex items-center justify-between bg-neutral-100/50 dark:bg-[#050505] px-4 py-3">
									<code
										className="text-[13px] truncate"
										style={{ fontFamily: "var(--font-geist-pixel-square)" }}
									>
										<span className="text-purple-600/90 dark:text-purple-400/90">
											npx
										</span>{" "}
										<span className="text-neutral-700 dark:text-neutral-300">
											auth mcp
										</span>
									</code>
									<div className="relative">
										<button
											onClick={() => {
												if (copied) return;
												setPmOpen(!pmOpen);
											}}
											className="text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors p-1"
											aria-label="Add MCP"
										>
											{copied ? (
												<svg
													xmlns="http://www.w3.org/2000/svg"
													viewBox="0 0 24 24"
													className="h-4 w-4"
												>
													<path
														fill="currentColor"
														d="M9 16.17L4.83 12l-1.42 1.41L9 19L21 7l-1.41-1.41z"
													/>
												</svg>
											) : (
												<svg
													xmlns="http://www.w3.org/2000/svg"
													viewBox="0 0 24 24"
													className="h-4 w-4"
												>
													<path
														fill="currentColor"
														d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"
													/>
												</svg>
											)}
										</button>
										{pmOpen && (
											<>
												<div
													className="fixed inset-0 z-40"
													role="button"
													tabIndex={-1}
													aria-label="Close dropdown"
													onClick={() => setPmOpen(false)}
													onKeyDown={(e) => {
														if (e.key === "Escape") setPmOpen(false);
													}}
												/>
												<div className="absolute right-0 top-full mt-2 w-[160px] bg-white dark:bg-[#050505] border border-neutral-200 dark:border-white/[0.07] shadow-2xl shadow-black/10 dark:shadow-black/80 z-50 rounded-sm">
													{mcpCommands.map((mc, i) => (
														<button
															key={mc.name}
															onClick={() => copy(mc.command)}
															className={cn(
																"flex items-center gap-2.5 w-full px-3 py-2 text-[12px] text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/[0.05] transition-all text-left",
																i < mcpCommands.length - 1 &&
																	"border-b border-neutral-100 dark:border-white/[0.06]",
															)}
														>
															<span className="flex items-center justify-center w-3.5 h-3.5 shrink-0">
																{mc.name === "Cursor" && (
																	<svg
																		xmlns="http://www.w3.org/2000/svg"
																		className="h-3.5 w-3.5"
																		viewBox="0 0 24 24"
																	>
																		<path
																			fill="currentColor"
																			d="M11.503.131L1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23"
																		/>
																	</svg>
																)}
																{mc.name === "Claude Code" && (
																	<svg
																		xmlns="http://www.w3.org/2000/svg"
																		className="h-3.5 w-3.5"
																		viewBox="0 0 16 16"
																	>
																		<path
																			fill="currentColor"
																			d="m6.96 15.2l.224-.992l.256-1.28l.208-1.024l.192-1.264l.112-.416l-.016-.032l-.08.016l-.96 1.312l-1.456 1.968l-1.152 1.216l-.272.112l-.48-.24l.048-.448l.272-.384l1.584-2.032l.96-1.264l.624-.72l-.016-.096h-.032l-4.224 2.752L2 12.48l-.336-.304l.048-.496l.16-.16l1.264-.88l3.152-1.76l.048-.16l-.048-.08h-.16L5.6 8.608L3.808 8.56l-1.552-.064l-1.52-.08l-.384-.08L0 7.856l.032-.24l.32-.208l.464.032l1.008.08l1.52.096l1.104.064l1.632.176h.256l.032-.112l-.08-.064l-.064-.064L4.64 6.56L2.944 5.44l-.896-.656l-.48-.336l-.24-.304l-.096-.672l.432-.48l.592.048l.144.032l.592.464l1.264.976L5.92 5.744l.24.192l.112-.064v-.048l-.112-.176l-.896-1.632l-.96-1.664l-.432-.688l-.112-.416a1.7 1.7 0 0 1-.064-.48l.496-.672L4.464 0l.672.096l.272.24l.416.944l.656 1.488l1.04 2.016l.304.608l.16.544l.064.176h.112v-.096l.08-1.152l.16-1.392l.16-1.792l.048-.512l.256-.608l.496-.32l.384.176l.32.464l-.048.288L9.84 2.4l-.384 1.936l-.24 1.312h.144l.16-.176l.656-.864l1.104-1.376l.48-.544l.576-.608l.368-.288h.688l.496.752l-.224.784l-.704.896l-.592.752l-.848 1.136l-.512.912l.048.064h.112l1.904-.416l1.04-.176l1.216-.208l.56.256l.064.256l-.224.544l-1.312.32l-1.536.304l-2.288.544l-.032.016l.032.048l1.024.096l.448.032h1.088l2.016.144l.528.352l.304.416l-.048.336l-.816.4l-1.088-.256l-2.56-.608l-.864-.208h-.128v.064l.736.72l1.328 1.2l1.68 1.552l.08.384l-.208.32l-.224-.032l-1.472-1.12l-.576-.496l-1.28-1.072h-.08v.112l.288.432l1.568 2.352l.08.72l-.112.224l-.416.144l-.432-.08l-.928-1.28l-.944-1.456l-.768-1.296l-.08.064l-.464 4.832l-.208.24l-.48.192l-.4-.304z"
																		/>
																	</svg>
																)}
																{mc.name === "Open Code" && (
																	<svg
																		className="h-3.5 w-3.5"
																		viewBox="0 0 32 40"
																		fill="none"
																		xmlns="http://www.w3.org/2000/svg"
																	>
																		<g clipPath="url(#oc)">
																			<path
																				d="M24 32H8V16H24V32Z"
																				fill="currentColor"
																				opacity="0.5"
																			/>
																			<path
																				d="M24 8H8V32H24V8ZM32 40H0V0H32V40Z"
																				fill="currentColor"
																			/>
																		</g>
																		<defs>
																			<clipPath id="oc">
																				<rect
																					width="32"
																					height="40"
																					fill="white"
																				/>
																			</clipPath>
																		</defs>
																	</svg>
																)}
																{mc.name === "Manual" && (
																	<svg
																		xmlns="http://www.w3.org/2000/svg"
																		className="h-3.5 w-3.5"
																		viewBox="0 0 24 24"
																	>
																		<path
																			fill="none"
																			stroke="currentColor"
																			strokeLinecap="round"
																			strokeLinejoin="round"
																			strokeWidth="2"
																			d="M12 19h8M4 17l6-6l-6-6"
																		/>
																	</svg>
																)}
															</span>
															<span className="font-mono text-[11px]">
																{mc.name}
															</span>
														</button>
													))}
												</div>
											</>
										)}
									</div>
								</div>
							) : (
								<div className="bg-neutral-100/50 dark:bg-[#050505] px-5 py-4">
									<p className="text-[13px] font-medium text-neutral-700 dark:text-neutral-200 leading-relaxed">
										Set up authentication in my project using Better Auth.
									</p>
									<div className="relative mt-1.5">
										<p className="text-[11px] text-neutral-400 dark:text-neutral-500 leading-relaxed line-clamp-2">
											Install better-auth. If I already have a database
											configured, use that. Create lib/auth.ts with{" "}
											<code className="text-neutral-500 dark:text-neutral-400">
												betterAuth()
											</code>
											, create auth-client.ts, add the route handler, run
											migrations...
										</p>
										<div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-neutral-100/50 dark:from-[#050505] to-transparent pointer-events-none" />
									</div>
									<div className="flex items-center justify-between mt-3 pt-2 border-t border-foreground/[0.04]">
										<button
											onClick={() => setPromptOpen(true)}
											className="flex items-center gap-1 text-[11px] text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 24 24"
												className="h-3 w-3"
											>
												<path
													fill="currentColor"
													d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5M12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5s5 2.24 5 5s-2.24 5-5 5m0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3s3-1.34 3-3s-1.34-3-3-3"
												/>
											</svg>
											View full prompt
										</button>
										<button
											onClick={() => copy(aiPromptText)}
											className="flex items-center gap-1.5 text-[11px] text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
										>
											{copied ? (
												<>
													<svg
														xmlns="http://www.w3.org/2000/svg"
														viewBox="0 0 24 24"
														className="h-3.5 w-3.5"
													>
														<path
															fill="currentColor"
															d="M9 16.17L4.83 12l-1.42 1.41L9 19L21 7l-1.41-1.41z"
														/>
													</svg>
													Copied
												</>
											) : (
												<>
													<svg
														xmlns="http://www.w3.org/2000/svg"
														viewBox="0 0 24 24"
														className="h-3.5 w-3.5"
													>
														<path
															fill="currentColor"
															d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2m0 16H8V7h11z"
														/>
													</svg>
													Copy prompt
												</>
											)}
										</button>
									</div>
								</div>
							)}
						</div>
					</AnimatePresence>
				</div>
			</motion.div>

			{/* Prompt dialog */}
			<AnimatePresence>
				{promptOpen && (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.2 }}
						className="fixed inset-0 lg:left-[40%] z-50 flex items-center justify-center"
						onClick={() => setPromptOpen(false)}
					>
						{/* Backdrop - only covers right/content side */}
						<div className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm" />

						{/* Dialog */}
						<motion.div
							initial={{ opacity: 0, y: 8, scale: 0.98 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							exit={{ opacity: 0, y: 8, scale: 0.98 }}
							transition={{ duration: 0.2, ease: "easeOut" }}
							onClick={(e: React.MouseEvent<HTMLDivElement>) =>
								e.stopPropagation()
							}
							className="relative w-[calc(100%-2rem)] max-w-lg mx-4 bg-neutral-50 dark:bg-[#0a0a0a] border border-neutral-200 dark:border-white/[0.06] rounded-sm shadow-2xl"
						>
							{/* Close */}
							<button
								onClick={() => setPromptOpen(false)}
								className="absolute top-3 right-3 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors z-10"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 24 24"
									className="h-4 w-4"
								>
									<path
										fill="currentColor"
										d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12z"
									/>
								</svg>
							</button>

							{/* Content */}
							<div className="px-5 py-5 max-h-[60vh] overflow-y-auto">
								<p className="text-[12px] font-mono text-neutral-600 dark:text-neutral-400 leading-[1.9] whitespace-pre-line">
									{aiPromptText}
								</p>
							</div>

							{/* Footer */}
							<div className="flex justify-end px-5 py-3 border-t border-neutral-200 dark:border-white/[0.06]">
								<button
									onClick={() => copy(aiPromptText)}
									className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-sm border border-neutral-200 dark:border-white/[0.08] text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/[0.04] transition-colors"
								>
									{copied ? (
										<>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 24 24"
												className="h-3.5 w-3.5"
											>
												<path
													fill="currentColor"
													d="M9 16.17L4.83 12l-1.42 1.41L9 19L21 7l-1.41-1.41z"
												/>
											</svg>
											Copied
										</>
									) : (
										<>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 24 24"
												className="h-3.5 w-3.5"
											>
												<path
													fill="currentColor"
													d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2m0 16H8V7h11z"
												/>
											</svg>
											Copy prompt
										</>
									)}
								</button>
							</div>
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

const sentinelEvents = [
	{
		action: "Blocked",
		color: "bg-red-500",
		identifier: "akash.prish@dropmeon.com",
		ip: "::1",
		reason: "Disposable Email",
		location: "Unknown",
		path: "/sign-up/email",
		time: "2 min ago",
	},
	{
		action: "Blocked",
		color: "bg-red-500",
		identifier: "kamef69609@cucadas.com",
		ip: "Unknown IP",
		reason: "Disposable Email",
		location: "Unknown",
		path: "/sign-up/email",
		time: "4 min ago",
	},
	{
		action: "Challenged",
		color: "bg-yellow-500",
		identifier: "195.142.xx.xx",
		ip: "",
		reason: "Suspicious IP",
		location: "Moscow, RU",
		path: "/sign-in",
		time: "7 min ago",
	},
	{
		action: "Blocked",
		color: "bg-red-500",
		identifier: "bot-crawler-7x",
		ip: "52.14.xx.xx",
		reason: "Bot Detected",
		location: "US-East",
		path: "/api/auth",
		time: "12 min ago",
	},
	{
		action: "Blocked",
		color: "bg-red-500",
		identifier: "admin@tempmail.ninja",
		ip: "::1",
		reason: "Breached Password",
		location: "Unknown",
		path: "/sign-up/email",
		time: "18 min ago",
	},
];

function SentinelSection() {
	return (
		<div className="mt-16 mb-4">
			<div className="flex items-center mb-4">
				<span className="text-xs text-foreground/50 dark:text-foreground/50 font-mono tracking-wider uppercase shrink-0 bg-muted px-2 py-1 rounded-md border">
					Sentinel
				</span>
				<div className="flex-1 border-t border border-dashed" />
			</div>

			<div className="relative group/sentinel">
				<div
					className="absolute -top-2 sm:-top-3 -bottom-2 sm:-bottom-3 -left-2 sm:-left-3 w-px border-l border-dashed border-foreground/[0.08] pointer-events-none"
					style={{
						maskImage:
							"linear-gradient(to bottom, black 40%, transparent 100%)",
						WebkitMaskImage:
							"linear-gradient(to bottom, black 40%, transparent 100%)",
					}}
				/>
				<div
					className="absolute -top-2 sm:-top-3 -bottom-2 sm:-bottom-3 -right-2 sm:-right-3 w-px border-r border-dashed border-foreground/[0.08] pointer-events-none"
					style={{
						maskImage:
							"linear-gradient(to bottom, black 40%, transparent 100%)",
						WebkitMaskImage:
							"linear-gradient(to bottom, black 40%, transparent 100%)",
					}}
				/>
				{/* Top corner accents */}
				<span className="absolute -top-2 -left-2 sm:-top-3 sm:-left-3 text-[8px] font-mono text-foreground/20 select-none pointer-events-none -translate-x-0.5 -translate-y-0.5">
					&#x250C;
				</span>
				<span className="absolute -top-2 -right-2 sm:-top-3 sm:-right-3 text-[8px] font-mono text-foreground/20 select-none pointer-events-none translate-x-0.5 -translate-y-0.5">
					&#x2510;
				</span>

				<div
					className="relative overflow-hidden border-t border-x border-foreground/[0.1]"
					style={{
						maskImage:
							"linear-gradient(to bottom, black 60%, transparent 100%)",
						WebkitMaskImage:
							"linear-gradient(to bottom, black 60%, transparent 100%)",
					}}
				>
					{/* Header bar */}
					<div className="flex items-center justify-between px-4 py-2.5 bg-foreground/[0.02] border-b border-foreground/[0.08]">
						<div className="flex items-center gap-2">
							{/* Shield icon */}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinecap="round"
								strokeLinejoin="round"
								className="text-foreground/50 dark:text-foreground/35"
							>
								<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
							</svg>
							<span className="text-[11px] font-medium text-foreground/60 dark:text-foreground/45">
								Sentinel
							</span>
							<span className="text-[10px] font-mono text-foreground/50  ml-1">
								Monitor and analyze security events
							</span>
						</div>
						<div className="hidden sm:flex items-center gap-3">
							<span className="flex items-center gap-1.5 text-[9px] font-mono">
								<span className="size-1.5 rounded-full bg-red-500" />
								<span className="text-foreground/50 dark:text-foreground/35">
									Blocked
								</span>
								<span className="text-foreground/70 dark:text-foreground/50">
									847
								</span>
							</span>
							<span className="flex items-center gap-1.5 text-[9px] font-mono">
								<span className="size-1.5 rounded-full bg-yellow-500" />
								<span className="text-foreground/50 dark:text-foreground/35">
									Challenged
								</span>
								<span className="text-foreground/70 dark:text-foreground/50">
									124
								</span>
							</span>
							<span className="flex items-center gap-1.5 text-[9px] font-mono">
								<span className="size-1.5 rounded-full bg-green-500" />
								<span className="text-foreground/50 dark:text-foreground/35">
									Allowed
								</span>
								<span className="text-foreground/70 dark:text-foreground/50">
									12.4k
								</span>
							</span>
						</div>
					</div>

					{/* Table header */}
					<div className="grid grid-cols-[70px_1fr_100px_70px_80px] sm:grid-cols-[70px_1fr_110px_80px_70px_80px] gap-0 px-4 py-2 border-b border-foreground/[0.06] bg-foreground/[0.01]">
						<span className="text-[9px] font-mono uppercase tracking-wider text-foreground/35 dark:text-foreground/50">
							Action
						</span>
						<span className="text-[9px] font-mono uppercase tracking-wider text-foreground/35 dark:text-foreground/50">
							Identifier
						</span>
						<span className="text-[9px] font-mono uppercase tracking-wider text-foreground/35 dark:text-foreground/50">
							Reason
						</span>
						<span className="hidden sm:block text-[9px] font-mono uppercase tracking-wider text-foreground/35 dark:text-foreground/50">
							Location
						</span>
						<span className="text-[9px] font-mono uppercase tracking-wider text-foreground/35 dark:text-foreground/50">
							Path
						</span>
						<span className="text-[9px] font-mono uppercase tracking-wider text-foreground/35 dark:text-foreground/50 text-right">
							Time
						</span>
					</div>

					{/* Event rows */}
					{sentinelEvents.map((event) => (
						<div
							key={event.identifier}
							className="grid grid-cols-[70px_1fr_100px_70px_80px] sm:grid-cols-[70px_1fr_110px_80px_70px_80px] gap-0 px-4 py-2.5 border-b border-dashed border-foreground/[0.04] hover:bg-foreground/[0.02] transition-colors"
						>
							<span className="flex items-center gap-1.5">
								<span
									className={cn("size-1.5 rounded-full shrink-0", event.color)}
								/>
								<span
									className={cn(
										"text-[10px] font-mono",
										event.action === "Blocked"
											? "text-red-500/80 dark:text-red-400/70"
											: "text-yellow-500/80 dark:text-yellow-400/70",
									)}
								>
									{event.action}
								</span>
							</span>
							<div className="min-w-0 pr-2">
								<span className="text-[10px] font-mono text-foreground/60 dark:text-foreground/45 block truncate">
									{event.identifier}
								</span>
								{event.ip && (
									<span className="text-[9px] font-mono text-foreground/50  block truncate">
										{event.ip}
									</span>
								)}
							</div>
							<span className="text-[10px] font-mono text-foreground/40 dark:text-foreground/30 truncate">
								{event.reason}
							</span>
							<span className="hidden sm:block text-[10px] font-mono text-foreground/35 dark:text-foreground/50 truncate">
								{event.location}
							</span>
							<span className="text-[10px] font-mono text-foreground/35 dark:text-foreground/50 truncate">
								{event.path}
							</span>
							<span className="text-[10px] font-mono text-foreground/30 dark:text-foreground/20 text-right">
								{event.time}
							</span>
						</div>
					))}
				</div>
			</div>

			<div className="mb-5">
				<h3 className="text-base sm:text-lg  text-neutral-800 dark:text-neutral-200 leading-snug mb-2">
					Security infrastructure for your app.
				</h3>
				<p className="text-xs sm:text-[13px] text-neutral-500 dark:text-neutral-400 leading-relaxed max-w-2xl">
					Bot detection, brute force protection, disposable email blocking, geo
					restrictions, and more &mdash; all working in real time before threats
					reach your users.
				</p>
			</div>

			{/* Protection tags */}
			<div className="flex flex-wrap gap-1.5 mt-4">
				{(
					[
						{
							tag: "Bot Detection",
							icon: (
								<>
									<circle cx="12" cy="12" r="10" />
									<path d="M2 12h20" />
									<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
								</>
							),
						},
						{
							tag: "Brute Force",
							icon: (
								<>
									<rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
									<path d="M7 11V7a5 5 0 0 1 10 0v4" />
								</>
							),
						},
						{
							tag: "Breached Passwords",
							icon: (
								<>
									<path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z" />
									<circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
								</>
							),
						},
						{
							tag: "Impossible Travel",
							icon: (
								<>
									<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
								</>
							),
						},
						{
							tag: "Rate Limiting",
							icon: (
								<>
									<circle cx="12" cy="12" r="10" />
									<polyline points="12 6 12 12 16 14" />
								</>
							),
						},
						{
							tag: "Geo Blocking",
							icon: (
								<>
									<circle cx="12" cy="12" r="10" />
									<path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
									<path d="M2 12h20" />
								</>
							),
						},
						{
							tag: "Suspicious IPs",
							icon: (
								<>
									<path d="M6 18h8" />
									<path d="M3 22h18" />
									<path d="M14 22a7 7 0 1 0 0-14h-1" />
									<path d="M9 14h2" />
									<path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z" />
									<path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3" />
								</>
							),
						},
						{
							tag: "Disposable Emails",
							icon: (
								<>
									<rect width="20" height="16" x="2" y="4" rx="2" />
									<path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
								</>
							),
						},
						{
							tag: "Email Abuse",
							icon: (
								<>
									<path d="M10.3 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10l-3.1-3.1a2 2 0 0 0-2.8 0L13 14" />
									<path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
									<path d="m17 21 5-5" />
									<path d="m22 21-5-5" />
								</>
							),
						},
						{
							tag: "Free Trial Abuse",
							icon: (
								<>
									<path d="M6 3h12l4 6-10 13L2 9Z" />
									<path d="M11 3 8 9l4 13 4-13-3-6" />
									<path d="M2 9h20" />
								</>
							),
						},
						{
							tag: "Stale Users",
							icon: (
								<>
									<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
									<circle cx="9" cy="7" r="4" />
									<line x1="17" x2="22" y1="11" y2="11" />
								</>
							),
						},
					] as const
				).map(({ tag, icon }) => (
					<span
						key={tag}
						className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider text-foreground/70 dark:text-foreground/55 border border-foreground/[0.14] bg-foreground/[0.03] hover:bg-foreground/[0.06] hover:text-foreground/85 dark:hover:text-foreground/75 transition-colors"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="10"
							height="10"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							className="opacity-80 shrink-0"
						>
							{icon}
						</svg>
						{tag}
					</span>
				))}
			</div>
		</div>
	);
}

const EMPTY_CONTRIBUTORS: ContributorInfo[] = [];

type CommunityHeroStats = {
	npmDownloads: number;
	githubStars: number;
	contributors: number;
};

function ContributorsSection({
	contributors = EMPTY_CONTRIBUTORS,
	contributorCount,
}: {
	contributors: ContributorInfo[];
	contributorCount: number;
}) {
	if (contributors.length === 0) return null;

	const colCount = 18;
	const columns = Array.from({ length: colCount }, (_, i) => {
		const perCol = Math.ceil(contributors.length / colCount);
		return contributors.slice(i * perCol, (i + 1) * perCol);
	});

	const speeds = [
		160, 190, 140, 176, 150, 184, 164, 144, 180, 156, 170, 136, 186, 152, 174,
		146, 182, 158,
	];

	return (
		<div className="mt-12 pt-8">
			<div className="flex items-center gap-3 mb-5">
				<span className="text-xl lg:text-2xl font-medium text-foreground/90 dark:text-foreground/80">
					Contributors
				</span>
				<div className="h-px flex-1 bg-foreground/10" />
			</div>
			<p className="text-base text-foreground/50 dark:text-foreground/40 mb-8 leading-relaxed">
				Built by a community of{" "}
				<span className="text-foreground/70 dark:text-foreground/60 font-medium tabular-nums">
					{contributorCount}+
				</span>{" "}
				contributors.
			</p>

			{contributors.length > 0 && (
				<div
					className="relative overflow-hidden h-[220px] rounded-md"
					style={{
						perspective: "600px",
						maskImage:
							"linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)",
						WebkitMaskImage:
							"linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)",
					}}
				>
					<div
						className="absolute inset-0 pointer-events-none"
						style={{
							backgroundImage:
								"radial-gradient(circle, currentColor 0.5px, transparent 0.5px)",
							backgroundSize: "12px 12px",
							opacity: 0.04,
						}}
					/>
					<div
						className="grid h-full relative"
						style={{
							gridTemplateColumns: `repeat(${colCount}, 1fr)`,
							transform: "rotateX(18deg)",
							transformOrigin: "center center",
						}}
					>
						{columns.map((col, i) => (
							<div key={i} className="relative overflow-hidden h-full">
								<div
									className="flex flex-col gap-1 items-center"
									style={{
										animation: `vertical-marquee ${speeds[i]}s linear infinite`,
									}}
								>
									{[...col, ...col].map((c, j) => (
										<a
											key={`${c.login}-${j}`}
											href={c.html_url}
											target="_blank"
											rel="noopener noreferrer"
											title={c.login}
											className="relative group shrink-0"
										>
											<img
												src={`${c.avatar_url}&s=64`}
												alt={c.login}
												width={32}
												height={32}
												loading="lazy"
												className="rounded-sm grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-200 hover:scale-125 hover:z-10 relative"
											/>
											<div className="absolute -top-7 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-foreground text-background text-[8px] font-mono rounded-sm opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20">
												{c.login}
											</div>
										</a>
									))}
								</div>
							</div>
						))}
					</div>
					<div className="absolute inset-y-0 left-0 w-8 bg-linear-to-r from-background to-transparent pointer-events-none z-10" />
					<div className="absolute inset-y-0 right-0 w-8 bg-linear-to-l from-background to-transparent pointer-events-none z-10" />
				</div>
			)}
		</div>
	);
}

function formatCount(num: number | null | undefined): string {
	if (num == null) return "—";
	if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
	if (num >= 1_000) return `${(num / 1_000).toFixed(num >= 10_000 ? 0 : 1)}k`;
	return num.toString();
}

const footerLinks = [
	{ label: "Terms", href: "/legal/terms" },
	{ label: "Privacy", href: "/legal/privacy" },
	{ label: "Blog", href: "/blog" },
	{ label: "Community", href: "/community" },
	{ label: "Changelog", href: "/changelog" },
];

function ReadmeFooter({ stats }: { stats: CommunityHeroStats }) {
	return (
		<div className="relative mt-12 pt-10 pb-0 overflow-hidden">
			{/* Watermark logo */}
			<div
				className="absolute -right-10 top-1/2 -translate-y-1/2 pointer-events-none select-none opacity-[0.03] dark:opacity-[0.04]"
				aria-hidden="true"
			>
				<svg
					width="300"
					height="225"
					viewBox="0 0 60 45"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<path
						fillRule="evenodd"
						clipRule="evenodd"
						d="M0 0H15V15H30V30H15V45H0V30V15V0ZM45 30V15H30V0H45H60V15V30V45H45H30V30H45Z"
						className="fill-foreground"
					/>
				</svg>
			</div>

			{/* Dot grid */}
			<div
				className="absolute inset-0 pointer-events-none select-none"
				aria-hidden="true"
				style={{
					backgroundImage:
						"radial-gradient(circle, currentColor 0.5px, transparent 0.5px)",
					backgroundSize: "24px 24px",
					opacity: 0.03,
				}}
			/>

			{/* CTA */}
			<div className="relative">
				<p className="text-center text-base text-foreground/60 dark:text-foreground/50 tracking-tight">
					Roll your own auth with confidence in minutes.
				</p>

				<div className="flex items-center justify-center gap-4 mt-4">
					<a
						href="https://dash.better-auth.com/sign-in"
						className="inline-flex items-center gap-1.5 px-5 py-2 bg-foreground text-background text-xs font-mono uppercase tracking-wider hover:opacity-90 transition-opacity"
					>
						Get Started
					</a>
					<Link
						href="/docs"
						className="inline-flex items-center gap-1.5 px-4 py-2 border border-foreground/12 text-foreground/50 dark:text-foreground/40 hover:text-foreground/70 hover:border-foreground/25 text-xs font-mono uppercase tracking-wider transition-all"
					>
						Read Docs
					</Link>
				</div>

				<div className="flex items-center justify-center gap-3 mt-5">
					{stats.npmDownloads > 0 && (
						<a
							href="https://www.npmjs.com/package/better-auth"
							target="_blank"
							rel="noopener noreferrer"
						>
							<div className="flex items-center gap-1.5 px-2.5 py-1 hover:bg-foreground/4 rounded-sm transition-colors text-foreground/50 dark:text-foreground/50">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="11"
									height="11"
									viewBox="0 0 24 24"
									fill="currentColor"
								>
									<path
										d="M0 0v24h24V0H0zm6.168 20.16H3.84V7.68h2.328v12.48zm6.168 0H6.168V7.68H16.5v12.48h-2.328V9.84h-1.836v10.32zm8.16 0h-6.168V7.68H20.16v12.48h-2.16V9.84h-1.836v10.32z"
										transform="scale(0.9) translate(1.3, 1.3)"
									/>
								</svg>
								<span className="text-[9px] font-mono">
									{formatCount(stats.npmDownloads)} / year
								</span>
							</div>
						</a>
					)}
					{stats.npmDownloads > 0 && stats.githubStars > 0 && (
						<span className="text-foreground/15">·</span>
					)}
					{stats.githubStars > 0 && (
						<a
							href="https://github.com/better-auth/better-auth"
							target="_blank"
							rel="noopener noreferrer"
						>
							<div className="flex items-center gap-1.5 px-2.5 py-1 hover:bg-foreground/4 rounded-sm transition-colors text-foreground/50 dark:text-foreground/50">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="11"
									height="11"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
								</svg>
								<span className="text-[9px] font-mono">
									{formatCount(stats.githubStars)}
								</span>
							</div>
						</a>
					)}
				</div>
			</div>

			{/* Footer */}
			<div className="relative mt-10 pt-6">
				<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
					<div className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
						{footerLinks.map((link, i) => (
							<span key={link.label} className="flex items-center">
								<Link
									href={link.href}
									className="group inline-flex items-center gap-1 text-[11px] font-mono text-foreground/50 hover:text-foreground/80 transition-colors"
								>
									{link.label}
								</Link>
								{i < footerLinks.length - 1 && (
									<span className="text-foreground/10 mx-1 text-[10px] select-none">
										/
									</span>
								)}
							</span>
						))}
					</div>

					<div className="flex items-center justify-between w-full sm:w-auto sm:gap-4 shrink-0">
						<span className="text-[10px] text-foreground/50 font-mono">
							© {new Date().getFullYear()} Better Auth Inc.
						</span>
						<div className="flex items-center gap-3 sm:gap-4">
							<span className="text-foreground/10 select-none hidden sm:inline">
								·
							</span>
							<Link
								href="https://x.com/better_auth"
								aria-label="Twitter/X"
								className="text-foreground/50 hover:text-foreground/80 transition-colors"
							>
								<Icons.XIcon className="h-3 w-3" />
							</Link>
							<Link
								href="https://github.com/better-auth"
								aria-label="GitHub"
								className="text-foreground/50 hover:text-foreground/80 transition-colors"
							>
								<Github className="h-4 w-4" />
							</Link>
							<div className="h-4 w-4 flex text-foreground/15 items-center justify-center select-none">
								|
							</div>
							<div className="-ml-4 sm:-ml-5">
								<ThemeToggle />
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

export function HeroReadMe({
	contributors,
	stats,
}: {
	contributors: ContributorInfo[];
	stats: CommunityHeroStats;
}) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
			className="flex flex-col w-full"
		>
			{/* Markdown content */}
			<div className="flex-1 overflow-y-auto no-scrollbar">
				<div className="p-5 pt-8 lg:p-8 lg:pt-16">
					<motion.article
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ duration: 0.4, delay: 0.3 }}
						className="overflow-y-auto overflow-x-hidden no-scrollbar pb-0"
					>
						<h1 className="flex items-center gap-3 text-sm sm:text-[15px] font-mono text-neutral-900 dark:text-neutral-100 mb-4 sm:mb-5">
							README
							<span className="flex-1 h-px bg-foreground/15" />
						</h1>

						<p className="text-[15px] text-foreground/80 mb-6 sm:mb-8">
							Better Auth is an authentication framework. It provides a
							comprehensive set of features out of the box and includes a Plugin
							ecosystem that simplifies adding advanced functionalities and
							infrastructure to help own your auth at scale.
						</p>

						<InstallBlock />
						{/* Trusted By */}
						<div className="flex items-center gap-3 mt-8 mb-5">
							<div className="flex-1 border-t border-foreground/6"></div>
							<span className="text-xs text-foreground/50 dark:text-foreground/50 font-mono tracking-wider uppercase shrink-0">
								Trusted By
							</span>
						</div>
						<TrustedBy />

						{/* Own Your Auth */}
						<div className="pt-24">
							<div className="flex items-center gap-3 mb-5">
								<span className="text-xl lg:text-2xl font-medium text-foreground/90 dark:text-foreground/80">
									Own Your Auth
								</span>
								<div className="flex-1 border-t border-foreground/10" />
							</div>

							<div className="text-lg text-foreground/70 dark:text-foreground/55 pb-6 space-y-1 leading-relaxed">
								<p>Your auth lives in your codebase.</p>
								<p>Use your favorite framework.</p>
							</div>
							<ServerClientTabs />
							<AiNativeSection />
						</div>

						{/* Database */}
						<div className="pt-16">
							<DatabaseSection />
						</div>

						{/* Out of the Box */}
						<div className="pt-8">
							<div className="flex items-center gap-3 mb-5 pt-8">
								<span className="text-xl lg:text-2xl font-medium text-foreground/90 dark:text-foreground/80">
									Out of the Box
								</span>
								<div className="flex-1 border-t border-foreground/10" />
							</div>

							<FeaturesSection />
						</div>

						<div className="flex items-center gap-3 pt-8 mb-3">
							<span className="text-xs text-foreground/70 font-mono tracking-wider uppercase shrink-0">
								OAuth Providers
							</span>
							<div className="flex-1 border-t border-foreground/10" />
						</div>
						<SocialProvidersSection />

						<div className="mt-8">
							<PluginEcosystem />
						</div>

						{/* Infrastructure transition */}
						<div className="mt-16 mb-8">
							<div className="flex items-center gap-3 mb-5 pt-8">
								<span className="text-2xl lg:text-3xl font-medium text-foreground/90 dark:text-foreground/80">
									Infrastructure
								</span>
								<div className="flex-1 border-t border-foreground/10" />
							</div>
						</div>
						<div className="text-base sm:text-lg text-foreground/70 dark:text-foreground/55 mb-8 space-y-1 leading-relaxed">
							<p className="text-balance">
								Managed infrastructure on top of the open-source framework.
								Dashboard, security, audit logs, and more for your own auth.
							</p>
						</div>

						<div className="flex items-center pt-4 mb-4">
							<span className="text-xs text-foreground/50 dark:text-foreground/50 font-mono tracking-wider uppercase shrink-0 bg-muted px-2 py-1 rounded-md border">
								Dash
							</span>
							<div className="flex-1 border-t border border-dashed" />
						</div>
						{/* Dashboard */}
						<div className="my-4">
							<div className="relative group/dash">
								<div
									className="absolute -top-2 sm:-top-3 -bottom-2 sm:-bottom-3 -left-2 sm:-left-3 w-px border-l border-dashed border-foreground/[0.08] pointer-events-none"
									style={{
										maskImage:
											"linear-gradient(to bottom, black 40%, transparent 100%)",
										WebkitMaskImage:
											"linear-gradient(to bottom, black 40%, transparent 100%)",
									}}
								>
									<div
										className="absolute left-1/2 -translate-x-1/2 size-1.5 bg-foreground/40 dark:bg-foreground/30 blur-[1px] pointer-events-none"
										style={{
											animation: "sparkle-down 4s ease-in-out infinite",
										}}
									/>
									<div
										className="absolute left-1/2 -translate-x-1/2 size-1 bg-foreground/25 dark:bg-foreground/20 blur-[2px] pointer-events-none"
										style={{
											animation: "sparkle-down 4s ease-in-out infinite 2s",
										}}
									/>
								</div>
								<div
									className="absolute -top-2 sm:-top-3 -bottom-2 sm:-bottom-3 -right-2 sm:-right-3 w-px border-r border-dashed border-foreground/[0.08] pointer-events-none"
									style={{
										maskImage:
											"linear-gradient(to bottom, black 40%, transparent 100%)",
										WebkitMaskImage:
											"linear-gradient(to bottom, black 40%, transparent 100%)",
									}}
								>
									<div
										className="absolute left-1/2 -translate-x-1/2 size-1.5 bg-foreground/40 dark:bg-foreground/30 blur-[1px] pointer-events-none"
										style={{
											animation: "sparkle-down 4s ease-in-out infinite 1s",
										}}
									/>
									<div
										className="absolute left-1/2 -translate-x-1/2 size-1 bg-foreground/25 dark:bg-foreground/20 blur-[2px] pointer-events-none"
										style={{
											animation: "sparkle-down 4s ease-in-out infinite 3s",
										}}
									/>
								</div>
								{/* Top corner accents only */}
								<span className="absolute -top-2 -left-2 sm:-top-3 sm:-left-3 text-[8px] font-mono text-foreground/20 select-none pointer-events-none -translate-x-0.5 -translate-y-0.5">
									&#x250C;
								</span>
								<span className="absolute -top-2 -right-2 sm:-top-3 sm:-right-3 text-[8px] font-mono text-foreground/20 select-none pointer-events-none translate-x-0.5 -translate-y-0.5">
									&#x2510;
								</span>

								<div
									className="relative overflow-hidden border-t border-x border-foreground/[0.1]"
									style={{
										maskImage:
											"linear-gradient(to bottom, black 60%, transparent 100%)",
										WebkitMaskImage:
											"linear-gradient(to bottom, black 60%, transparent 100%)",
									}}
								>
									{/* Terminal-style header bar */}
									<div className="flex items-center justify-between px-4 py-2.5 bg-foreground/[0.02] border-b border-dashed border-foreground/[0.08]">
										<div className="flex items-center gap-2">
											<div className="flex items-center gap-1.5">
												<span className="size-2 rounded-full bg-foreground/10" />
												<span className="size-2 rounded-full bg-foreground/10" />
												<span className="size-2 rounded-full bg-foreground/10" />
											</div>
											<span className="text-[10px] font-mono text-foreground/30 ml-2">
												dash.better-auth.com/the-next-big-thing
											</span>
										</div>
										<div className="flex items-center gap-3">
											{["Overview", "Users", "Orgs", "Events"].map((tab, i) => (
												<span
													key={tab}
													className={cn(
														"text-[9px] font-mono uppercase tracking-wider",
														i === 0
															? "text-foreground/60 dark:text-foreground/45"
															: "text-foreground/20 dark:text-foreground/12",
													)}
												>
													{tab}
												</span>
											))}
										</div>
									</div>

									{/* Dashboard demo video — crop top border from video */}
									<div className="overflow-hidden" suppressHydrationWarning>
										<video
											src={"/demo-dark.mp4"}
											autoPlay
											loop
											muted
											playsInline
											className="w-full h-auto -mt-[2px] dark:block hidden"
											suppressHydrationWarning
										/>
										<video
											src={"/demo-light.mp4"}
											autoPlay
											loop
											muted
											playsInline
											className="w-full h-auto -mt-[2px] dark:hidden"
											suppressHydrationWarning
										/>
									</div>
								</div>
							</div>

							<div className="mb-5">
								<h3 className="text-base sm:text-lg text-neutral-800 dark:text-neutral-200 leading-snug mb-2">
									User management and monitoring
								</h3>
								<p className="text-[12px] sm:text-[13px] text-neutral-500 dark:text-neutral-400 leading-relaxed max-w-2xl">
									Monitor sign-ups, manage users, track sessions, and surface
									security insights.
								</p>
							</div>

							<div className="grid grid-cols-2 sm:grid-cols-4 mt-3">
								{[
									{ label: "User Management", desc: "CRUD, sessions, bans" },
									{ label: "Live Events", desc: "Real-time auth feed" },
									{ label: "Agent Dashboard", desc: "Cmd+K agentic UI" },
									{ label: "Security Insights", desc: "Actionable alerts" },
								].map((item, i) => (
									<div
										key={item.label}
										className={cn(
											"px-3 py-3 border border-dashed border-foreground/[0.06] bg-foreground/[0.02]",
											i > 0 && "-ml-px",
										)}
									>
										<div className="text-[11px] font-mono text-foreground/65 uppercase tracking-wider mb-0.5">
											{item.label}
										</div>
										<div className="text-[11px] font-mono text-foreground/40">
											{item.desc}
										</div>
									</div>
								))}
							</div>

							{/* Audit Logs */}
							<div className="mt-10">
								<div className="mb-4">
									<h3 className="text-base sm:text-lg text-neutral-800 dark:text-neutral-200 leading-snug mb-2">
										Audit Logs
									</h3>
									<p className="text-xs sm:text-[13px] text-neutral-500 dark:text-neutral-400 leading-relaxed max-w-2xl">
										Every auth event captured automatically. Filter, search, and
										export with configurable retention and log drain to your
										SIEM.
									</p>
								</div>
								<div className="grid grid-cols-2 sm:grid-cols-4 gap-0">
									{[
										{ label: "Auto Capture", desc: "Every auth event logged" },
										{ label: "Log Explorer", desc: "Filter & search events" },
										{ label: "Retention", desc: "1 day to custom" },
										{ label: "Log Drain", desc: "Export to your SIEM" },
									].map((item, i) => (
										<div
											key={item.label}
											className={cn(
												"px-3 py-3 border border-dashed border-foreground/[0.06] bg-foreground/[0.02]",
												i > 0 && "-ml-px",
											)}
										>
											<div className="text-[11px] font-mono text-foreground/65 dark:text-foreground/50 uppercase tracking-wider mb-0.5">
												{item.label}
											</div>
											<div className="text-[11px] font-mono text-foreground/40">
												{item.desc}
											</div>
										</div>
									))}
								</div>
							</div>

							{/* Transactional Comms */}
							<div className="mt-10">
								<div className="mb-4">
									<h3 className="text-base sm:text-lg text-neutral-800 dark:text-neutral-200 leading-snug mb-2">
										Transactional Comms
									</h3>
									<p className="text-xs sm:text-[13px] text-neutral-500 dark:text-neutral-400 leading-relaxed max-w-2xl">
										Built-in email and SMS delivery for auth flows. Customizable
										templates, abuse protection, and delivery tracking. No
										third-party setup required.
									</p>
								</div>
								<div className="grid grid-cols-2 sm:grid-cols-4 gap-0">
									{[
										{ label: "Email & SMS", desc: "Built-in delivery" },
										{ label: "Templates", desc: "Fully customizable" },
										{
											label: "Abuse Protection",
											desc: "Rate limits & blocking",
										},
										{ label: "Delivery Tracking", desc: "Status & analytics" },
									].map((item, i) => (
										<div
											key={item.label}
											className={cn(
												"px-3 py-3 border border-dashed border-foreground/[0.06] bg-foreground/[0.02]",
												i > 0 && "-ml-px",
											)}
										>
											<div className="text-[11px] font-mono text-foreground/65 uppercase tracking-wider mb-0.5">
												{item.label}
											</div>
											<div className="text-[11px] font-mono text-foreground/40">
												{item.desc}
											</div>
										</div>
									))}
								</div>
							</div>
						</div>

						{/* Sentinel */}
						<SentinelSection />

						{/* Infrastructure CTA */}
						<div className="mt-8 mb-4">
							<div className="border border-dashed p-5 flex items-center justify-between">
								<div>
									<p className="text-xs font-mono uppercase tracking-widest text-foreground/80 dark:text-foreground/80 mb-1">
										Explore plans
									</p>
									<p className="text-[12px] text-foreground/60 dark:text-foreground/40 leading-relaxed">
										Dashboard, audit logs, security detection, transactional
										comms, and more.
									</p>
								</div>
								<Link
									href="/products/infrastructure"
									className="inline-flex items-center gap-1.5 shrink-0 ml-4 px-4 py-2 border border-dashed text-foreground dark:text-foreground/80 hover:text-foreground hover:border-foreground/25 hover:bg-foreground/[0.02] transition-all"
								>
									<span className="font-mono text-xs uppercase underline underline-offset-4 tracking-widest">
										View Plans
									</span>
									<svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="none">
										<path
											d="M1 9L9 1M9 1H3M9 1V7"
											stroke="currentColor"
											strokeWidth="1.2"
										/>
									</svg>
								</Link>
							</div>
						</div>

						{/* Contributors */}
						<ContributorsSection
							contributors={contributors}
							contributorCount={stats.contributors}
						/>

						<ReadmeFooter stats={stats} />
					</motion.article>
				</div>
			</div>
		</motion.div>
	);
}
