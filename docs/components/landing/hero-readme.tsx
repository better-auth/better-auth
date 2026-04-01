"use client";

import { AnimatePresence, motion } from "framer-motion";
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
	{ name: "Claude Code", command: "npx auth mcp --claude-code" },
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

function CredentialFields() {
	const emailText = "user@email.com";
	const passwordDots = "••••••••";
	const [emailDisplay, setEmailDisplay] = useState(emailText);
	const [passwordDisplay, setPasswordDisplay] = useState(passwordDots);
	const [isTyping, setIsTyping] = useState(false);
	const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
	const isTypingRef = useRef(false);

	const startTyping = useCallback(() => {
		if (isTypingRef.current) return;
		isTypingRef.current = true;
		setIsTyping(true);

		// Clear previous timeouts
		for (const t of timeoutsRef.current) clearTimeout(t);
		timeoutsRef.current = [];

		// Reset to empty
		setEmailDisplay("");
		setPasswordDisplay("");

		// Type email character by character
		for (let i = 0; i <= emailText.length; i++) {
			const t = setTimeout(() => {
				setEmailDisplay(emailText.slice(0, i));
			}, i * 60);
			timeoutsRef.current.push(t);
		}

		// Type password dots after email finishes
		const passwordStart = (emailText.length + 2) * 60;
		for (let i = 0; i <= passwordDots.length; i++) {
			const t = setTimeout(
				() => {
					setPasswordDisplay(passwordDots.slice(0, i));
					if (i === passwordDots.length) {
						isTypingRef.current = false;
						setIsTyping(false);
					}
				},
				passwordStart + i * 50,
			);
			timeoutsRef.current.push(t);
		}
	}, []);

	useEffect(() => {
		return () => {
			for (const t of timeoutsRef.current) clearTimeout(t);
		};
	}, []);

	return (
		<div className="mt-3 flex items-center gap-1.5" onMouseEnter={startTyping}>
			<div className="flex items-center h-5 px-2 border border-foreground/[0.08] bg-foreground/[0.02] flex-1 min-w-0">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="8"
					height="8"
					viewBox="0 0 24 24"
					className="text-foreground/45 dark:text-foreground/30 shrink-0 mr-1.5"
				>
					<path
						fill="currentColor"
						d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2m0 4-8 5-8-5V6l8 5 8-5z"
					/>
				</svg>
				<span className="text-[9px] font-mono text-foreground/50 dark:text-foreground/35 truncate">
					{emailDisplay}
					{isTyping && emailDisplay.length < emailText.length && (
						<span className="inline-block w-px h-2.5 bg-foreground/50 ml-px animate-[blink_0.8s_step-end_infinite] align-middle" />
					)}
				</span>
			</div>
			<div className="flex items-center h-5 px-2 border border-foreground/[0.08] bg-foreground/[0.02] flex-1 min-w-0">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="8"
					height="8"
					viewBox="0 0 24 24"
					className="text-foreground/45 dark:text-foreground/30 shrink-0 mr-1.5"
				>
					<path
						fill="currentColor"
						d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2m-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2M9 8V6c0-1.66 1.34-3 3-3s3 1.34 3 3v2z"
					/>
				</svg>
				<span className="text-[9px] font-mono text-foreground/50 dark:text-foreground/35 tracking-[0.1em]">
					{passwordDisplay}
					{isTyping &&
						emailDisplay.length >= emailText.length &&
						passwordDisplay.length < passwordDots.length && (
							<span className="inline-block w-px h-2.5 bg-foreground/50 ml-px animate-[blink_0.8s_step-end_infinite] align-middle" />
						)}
				</span>
			</div>
		</div>
	);
}

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
							onClick={(e) => e.stopPropagation()}
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
		<div className="mt-10 mb-4">
			<div className="flex items-center gap-3 mb-6">
				<span className="text-[10px] text-foreground/60 dark:text-foreground/40 font-mono tracking-wider uppercase shrink-0">
					Sentinel
				</span>
				<div className="flex-1 border-t border-foreground/[0.06]" />
			</div>

			<div className="mb-5">
				<h3 className="text-base sm:text-lg  text-neutral-800 dark:text-neutral-200 leading-snug mb-2">
					Security infrastructure for your app.
				</h3>
				<p className="text-[14px] text-foreground/70 dark:text-foreground/55 leading-relaxed max-w-2xl">
					Bot detection, brute force protection, disposable email blocking, geo
					restrictions, and more &mdash; all working in real time before threats
					reach your users.
				</p>
			</div>

			<div className="relative group/sentinel">
				{/* Outer dashed border — top and sides only, sides fade out toward bottom */}
				<div className="absolute -inset-2 sm:-inset-3 border-t border-dashed border-foreground/[0.08] pointer-events-none" />
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
		<div className="mt-10 pt-8">
			<div className="flex items-center gap-3 mb-2">
				<span className="text-base text-foreground/85 dark:text-foreground/75">
					Contributors
				</span>
				<div className="h-px flex-1 bg-foreground/[0.08]" />
			</div>
			<p className="text-[13px] text-foreground/50 dark:text-foreground/40 mb-5 leading-relaxed">
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
		<div className="relative mt-10 pt-8 pb-0 overflow-hidden">
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
				<p className="text-center text-[15px] text-foreground/60 dark:text-foreground/50 tracking-tight">
					Roll your own auth with confidence in minutes.
				</p>

				<div className="flex items-center justify-center gap-4 mt-4">
					<a
						href="https://dash.better-auth.com/sign-in"
						className="inline-flex items-center gap-1.5 px-5 py-2 bg-foreground text-background text-[11px] font-mono uppercase tracking-wider hover:opacity-90 transition-opacity"
					>
						Get Started
					</a>
					<Link
						href="/docs"
						className="inline-flex items-center gap-1.5 px-4 py-2 border border-foreground/12 text-foreground/50 dark:text-foreground/40 hover:text-foreground/70 hover:border-foreground/25 text-[11px] font-mono uppercase tracking-wider transition-all"
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
								<Icons.XIcon className="h-3.5 w-3.5" />
							</Link>
							<Link
								href="https://github.com/better-auth"
								aria-label="GitHub"
								className="text-foreground/50 hover:text-foreground/80 transition-colors"
							>
								<Icons.gitHub className="h-3.5 w-3.5" />
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
	const [socialHovered, setSocialHovered] = useState(false);

	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
			className="flex flex-col w-full"
		>
			{/* Markdown content */}
			<div className="flex-1 overflow-x-hidden no-scrollbar">
				<div className="p-5 lg:px-8 lg:pt-20">
					<motion.article
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ duration: 0.4, delay: 0.3 }}
						className="overflow-x-hidden no-scrollbar pb-0"
					>
						<h1 className="flex items-center gap-3 text-sm sm:text-[15px] font-mono text-neutral-900 dark:text-neutral-100 mb-4 sm:mb-5">
							README
							<span className="flex-1 h-px bg-foreground/15" />
						</h1>

						<p className="text-sm sm:text-[15px] text-foreground/80 mb-6 sm:mb-8 leading-relaxed">
							Better Auth is an authentication framework. It provides a
							comprehensive set of features out of the box and includes a Plugin
							ecosystem that simplifies adding advanced functionalities and
							infrastructure to help own your auth at scale.
						</p>

						<InstallBlock />

						<div className="flex items-center gap-3 my-4">
							<div className="flex-1 border-t border-foreground/6"></div>
							<span className="text-[10px] text-foreground/50 dark:text-foreground/50 font-mono tracking-wider uppercase shrink-0">
								Trusted By
							</span>
						</div>

						<TrustedBy />

						<div className="flex items-center gap-3 my-4">
							<span className="text-[10px] text-foreground/50 dark:text-foreground/50 font-mono tracking-wider uppercase shrink-0">
								Features
							</span>
							<div className="flex-1 border-t border-foreground/10"></div>
						</div>

						<div className="relative grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 mb-2 border border-foreground/[0.08] overflow-hidden">
							{[
								{
									label: "Framework Agnostic",
									headline: "Works with your stack.",
									desc: "First-class support for Next.js, Nuxt, SvelteKit, Astro, Hono, Express, and 20+ more.",
									logos: true,
									href: "/docs",
								},
								{
									label: "Email & Password",
									headline: "Built-in credential auth.",
									desc: "Session management, email verification, and password reset out of the box.",
									credential: true,
									href: "/docs",
								},
								{
									label: "Social Sign-on",
									headline: "40+ social providers.",
									desc: "Google, GitHub, Apple, Discord, Microsoft, and more — each a few lines of config.",
									social: true,
									href: "/docs",
								},
								{
									label: "Organizations",
									headline: "Multi-tenancy built in.",
									desc: "Teams, roles, invitations, and member management with fine-grained access control.",
									org: true,
									href: "/docs",
								},
								{
									label: "Enterprise",
									headline: "SSO, SAML & SCIM.",
									desc: "Enterprise SSO, SAML 2.0, SCIM provisioning, and directory sync for B2B products.",
									enterprise: true,
									href: "/docs",
								},
								{
									label: "Plugins",
									headline: "50+ and growing.",
									desc: "Passkeys, magic links, anonymous auth, API keys, JWTs, and a community ecosystem.",
									plugins: true,
									href: "/docs",
								},
								{
									label: "Agent Auth",
									headline: "Auth for AI agents.",
									desc: "MCP server auth, async auth flows, token exchange, and agent-to-agent delegation.",
									agent: true,
									href: "/docs",
								},
								{
									label: "Infrastructure",
									headline: "Security & observability.",
									desc: "Bot detection, real-time behavior analysis, IP blocking, email validation, and more.",
									security: true,
									href: "/products/infrastructure",
									managed: true,
								},
								{
									label: "Dashboard",
									headline: "User management.",
									desc: "Manage users, sessions, and organizations. Track sign-ups, active users, and growth.",
									dashboard: true,
									href: "/products/infrastructure",
									managed: true,
								},
							].map((feature, i) => (
								<Link
									key={feature.label}
									href={"href" in feature ? feature.href : "#"}
									className="contents"
								>
									<motion.div
										whileHover={{
											y: -2,
											transition: { duration: 0.2, ease: "easeOut" },
										}}
										onMouseEnter={() => {
											if ("social" in feature && feature.social) {
												setSocialHovered(true);
											}
										}}
										onMouseLeave={() => {
											if ("social" in feature && feature.social) {
												setSocialHovered(false);
											}
										}}
										className={cn(
											"group/card relative p-4 lg:p-5 border-foreground/[0.08] min-h-[180px] transition-all duration-200 hover:bg-foreground/[0.02] hover:shadow-[inset_0_1px_0_0_rgba(128,128,128,0.1)] hover:z-10",
											// Bottom border: all except last; 3-col last row starts at 6
											i < 8 && "border-b",
											i >= 6 && "md:border-b-0",
											// Right border: none on mobile
											// 2-col: left column (even indices) gets right border
											i % 2 === 0 && i < 8 && "sm:border-r",
											// 3-col: remove right border on 3rd column, add on odd indices that need it
											i % 3 === 2 && "md:border-r-0",
											i % 2 !== 0 && i % 3 !== 2 && "md:border-r",
										)}
									>
										{/* Arrow icon — top right, visible on hover */}
										<span className="absolute top-3 right-3 lg:top-4 lg:right-4 opacity-0 -translate-y-0.5 group-hover/card:opacity-100 group-hover/card:translate-y-0 transition-all duration-200">
											<svg
												xmlns="http://www.w3.org/2000/svg"
												width="16"
												height="16"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												strokeWidth="2"
												strokeLinecap="round"
												strokeLinejoin="round"
												className="text-foreground/40 dark:text-foreground/50"
											>
												<line x1="7" y1="17" x2="17" y2="7" />
												<polyline points="7 7 17 7 17 17" />
											</svg>
										</span>
										<div className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400 mb-2 uppercase tracking-wider transition-colors duration-200 group-hover/card:text-neutral-400 dark:group-hover/card:text-neutral-300">
											<span className="text-foreground/45 dark:text-foreground/30 mr-1.5 transition-colors duration-200 group-hover/card:text-foreground/60 dark:group-hover/card:text-foreground/40">
												{String(i + 1).padStart(2, "0")}
											</span>
											{feature.label}
											{"managed" in feature && feature.managed && (
												<span className="ml-1.5 text-[8px] normal-case tracking-widest text-foreground/40 dark:text-foreground/30 border border-dashed border-foreground/10 px-1 py-px">
													managed
												</span>
											)}
										</div>
										<div className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100 leading-snug mb-1.5 transition-colors duration-200 group-hover/card:text-neutral-950 dark:group-hover/card:text-white">
											{feature.headline}
										</div>
										<div className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed transition-colors duration-200 group-hover/card:text-neutral-400 dark:group-hover/card:text-neutral-300">
											{feature.desc}
										</div>
										{"logos" in feature && feature.logos && (
											<div className="flex items-center gap-3.5 mt-3">
												{/* Next.js */}
												<svg
													xmlns="http://www.w3.org/2000/svg"
													width="15"
													height="15"
													viewBox="0 0 24 24"
													className="text-neutral-800 dark:text-neutral-200 opacity-60 transition-all duration-300 group-hover/card:opacity-100 group-hover/card:animate-[icon-bounce_0.4s_ease-out_0s]"
												>
													<path
														fill="currentColor"
														d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10s-4.477 10-10 10m4-14h-1.35v4H16zM9.346 9.71l6.059 7.828l1.054-.809L9.683 8H8v7.997h1.346z"
													/>
												</svg>
												{/* Nuxt */}
												<svg
													xmlns="http://www.w3.org/2000/svg"
													width="15"
													height="15"
													viewBox="0 0 24 24"
													className="text-[#00DC82] opacity-60 transition-all duration-300 group-hover/card:opacity-100 group-hover/card:animate-[icon-bounce_0.4s_ease-out_0.05s]"
												>
													<path
														fill="currentColor"
														d="M13.2 18.666h7.4c.236 0 .462-.083.667-.2c.204-.117.415-.264.533-.466c.118-.203.2-.433.2-.667s-.082-.464-.2-.667l-5-8.6a1.2 1.2 0 0 0-.467-.466a1.6 1.6 0 0 0-.733-.2c-.236 0-.462.083-.667.2a1.2 1.2 0 0 0-.466.466l-1.267 2.2L10.667 6c-.118-.203-.262-.417-.467-.534s-.43-.133-.667-.133c-.236 0-.462.016-.666.133s-.416.33-.534.534l-6.2 10.666c-.118.203-.133.433-.133.667s.015.464.133.667c.118.202.33.35.534.466s.43.2.666.2H8c1.85 0 3.195-.83 4.133-2.4l2.267-3.933l1.2-2.067l3.667 6.267H14.4zm-5.267-2.133H4.667l4.866-8.4l2.467 4.2l-1.634 2.848c-.623 1.02-1.333 1.352-2.433 1.352"
													/>
												</svg>
												{/* SvelteKit */}
												<svg
													xmlns="http://www.w3.org/2000/svg"
													width="13"
													height="15"
													viewBox="0 0 426 512"
													className="text-[#FF3E00] opacity-60 transition-all duration-300 group-hover/card:opacity-100 group-hover/card:animate-[icon-bounce_0.4s_ease-out_0.1s]"
												>
													<path
														fill="currentColor"
														d="M403.508 229.23C491.235 87.7 315.378-58.105 190.392 23.555L71.528 99.337c-57.559 37.487-82.55 109.513-47.45 183.53c-87.761 133.132 83.005 289.03 213.116 205.762l118.864-75.782c64.673-42.583 79.512-116.018 47.45-183.616m-297.592-80.886l118.69-75.739c77.973-46.679 167.756 34.942 135.388 110.992c-19.225-15.274-40.65-24.665-56.923-28.894c6.186-24.57-22.335-42.796-42.174-30.106l-118.95 75.48c-29.411 20.328 1.946 62.138 31.014 44.596l45.33-28.895c101.725-57.403 198 80.425 103.38 147.975l-118.692 75.739C131.455 485.225 34.11 411.96 67.592 328.5c17.786 13.463 36.677 23.363 56.923 28.894c-4.47 28.222 24.006 41.943 42.476 30.365L285.64 312.02c29.28-21.955-2.149-61.692-30.97-44.595l-45.504 28.894c-100.56 58.77-199.076-80.42-103.25-147.975"
													/>
												</svg>
												{/* TanStack Start */}
												<svg
													height="13"
													viewBox="0 0 663 660"
													width="13"
													className="text-neutral-800 dark:text-neutral-200 opacity-60 transition-all duration-300 group-hover/card:opacity-100 group-hover/card:animate-[icon-bounce_0.4s_ease-out_0.15s]"
													xmlns="http://www.w3.org/2000/svg"
												>
													<path
														d="m305.114318.62443771c8.717817-1.14462121 17.926803-.36545135 26.712694-.36545135 32.548987 0 64.505987 5.05339923 95.64868 14.63098274 39.74418 12.2236582 76.762804 31.7666864 109.435876 57.477568 40.046637 31.5132839 73.228974 72.8472109 94.520714 119.2362609 39.836383 86.790386 39.544267 191.973146-1.268422 278.398081-26.388695 55.880442-68.724007 102.650458-119.964986 136.75724-41.808813 27.828603-90.706831 44.862601-140.45707 50.89341-63.325458 7.677926-131.784923-3.541603-188.712259-32.729444-106.868873-54.795293-179.52309291-165.076271-180.9604082-285.932068-.27660564-23.300971.08616998-46.74071 4.69884909-69.814998 7.51316071-37.57857 20.61272131-73.903917 40.28618971-106.877282 21.2814003-35.670293 48.7704861-67.1473767 81.6882804-92.5255597 38.602429-29.7610135 83.467691-51.1674988 130.978372-62.05777669 11.473831-2.62966514 22.9946-4.0869914 34.57273-5.4964306l3.658171-.44480576c3.050084-.37153079 6.104217-.74794222 9.162589-1.14972654zm-110.555861 549.44131429c-14.716752 1.577863-30.238964 4.25635-42.869928 12.522173 2.84343.683658 6.102369.004954 9.068638 0 7.124652-.011559 14.317732-.279903 21.434964.032202 17.817402.781913 36.381729 3.63214 53.58741 8.350042 22.029372 6.040631 41.432961 17.928687 62.656049 25.945156 22.389644 8.456554 44.67706 11.084675 68.427 11.084675 11.96813 0 23.845573-.035504 35.450133-3.302696-6.056202-3.225083-14.72582-2.619864-21.434964-3.963236-14.556814-2.915455-28.868774-6.474936-42.869928-11.470264-10.304996-3.676672-20.230803-8.214291-30.11097-12.848661l-6.348531-2.985046c-9.1705-4.309263-18.363277-8.560752-27.845391-12.142608-24.932161-9.418465-52.560181-14.071964-79.144482-11.221737zm22.259385-62.614168c-29.163917 0-58.660076 5.137344-84.915434 18.369597-6.361238 3.206092-12.407546 7.02566-18.137277 11.258891-1.746125 1.290529-4.841829 2.948483-5.487351 5.191839-.654591 2.275558 1.685942 4.182039 3.014086 5.637703 6.562396-3.497556 12.797498-7.199878 19.78612-9.855246 45.19892-17.169893 99.992458-13.570779 145.098218 2.172348 22.494346 7.851335 43.219483 19.592421 65.129314 28.800338 24.503461 10.297807 49.53043 16.975034 75.846795 20.399104 31.04195 4.037546 66.433549.7654 94.808495-13.242161 9.970556-4.921843 23.814245-12.422267 28.030337-23.320339-5.207047.454947-9.892236 2.685918-14.83959 4.224149-7.866632 2.445646-15.827248 4.51974-23.908229 6.138887-27.388113 5.486604-56.512458 6.619429-84.091013 1.639788-25.991939-4.693152-50.142596-14.119246-74.179513-24.03502l-3.068058-1.268177c-2.045137-.846788-4.089983-1.695816-6.135603-2.544467l-3.069142-1.272366c-12.279956-5.085721-24.606928-10.110797-37.210937-14.51024-24.485325-8.546552-50.726667-13.784628-76.671218-13.784628zm51.114145-447.9909432c-34.959602 7.7225298-66.276908 22.7605319-96.457338 41.7180089-17.521434 11.0054099-34.281927 22.2799893-49.465301 36.4444283-22.5792616 21.065423-39.8360564 46.668751-54.8866988 73.411509-15.507372 27.55357-25.4498976 59.665686-30.2554517 90.824149-4.7140432 30.568106-5.4906485 62.70747-.0906864 93.301172 6.7503648 38.248526 19.5989769 74.140579 39.8896436 107.337631 6.8187918-3.184625 11.659796-10.445603 17.3128555-15.336896 11.4149428-9.875888 23.3995608-19.029311 36.2745548-26.928535 4.765981-2.923712 9.662222-5.194315 14.83959-7.275014 1.953055-.785216 5.14604-1.502727 6.06527-3.647828 1.460876-3.406732-1.240754-9.335897-1.704904-12.865654-1.324845-10.095517-2.124534-20.362774-1.874735-30.549941.725492-29.668947 6.269727-59.751557 16.825623-87.521453 7.954845-20.924233 20.10682-39.922168 34.502872-56.971512 4.884699-5.785498 10.077731-11.170545 15.437296-16.512656 3.167428-3.157378 7.098271-5.858983 9.068639-9.908915-10.336599.006606-20.674847 2.987289-30.503603 6.013385-21.174447 6.519522-41.801477 16.19312-59.358362 29.841512-8.008432 6.226409-13.873368 14.387371-21.44733 20.939921-2.32322 2.010516-6.484901 4.704691-9.695199 3.187928-4.8500728-2.29042-4.1014979-11.835213-4.6571581-16.222019-2.1369011-16.873476 4.2548401-38.216325 12.3778671-52.843142 13.039878-23.479694 37.150915-43.528712 65.467327-42.82854 12.228647.302197 22.934587 4.551115 34.625711 7.324555-2.964621-4.211764-6.939158-7.28162-10.717482-10.733763-9.257431-8.459031-19.382979-16.184864-30.503603-22.028985-4.474136-2.350694-9.291232-3.77911-14.015169-5.506421-2.375159-.867783-5.36616-2.062533-6.259834-4.702213-1.654614-4.888817 7.148561-9.416813 10.381943-11.478522 12.499882-7.969406 27.826705-14.525258 42.869928-14.894334 23.509209-.577147 46.479246 12.467678 56.162903 34.665926 3.404469 7.803171 4.411273 16.054969 5.079109 24.382907l.121749 1.56229.174325 2.345587c.01913.260708.038244.521433.057403.782164l.11601 1.56437.120128 1.563971c7.38352-6.019164 12.576553-14.876995 19.78612-21.323859 16.861073-15.07846 39.936636-21.7722 61.831627-14.984333 19.786945 6.133107 36.984382 19.788105 47.105807 37.959541 2.648042 4.754231 10.035685 16.373942 4.698379 21.109183-4.177345 3.707277-9.475079.818243-13.880788-.719162-3.33605-1.16376-6.782939-1.90214-10.241828-2.585698l-1.887262-.369639c-.629089-.122886-1.257979-.246187-1.886079-.372129-11.980496-2.401886-25.91652-2.152533-37.923398-.041284-7.762754 1.364839-15.349083 4.127545-23.083807 5.271929v1.651348c21.149714.175043 41.608563 12.240618 52.043268 30.549941 4.323267 7.585468 6.482428 16.267431 8.138691 24.770223 2.047864 10.50918.608423 21.958802-2.263037 32.201289-.962925 3.433979-2.710699 9.255807-6.817143 10.046802-2.902789.558982-5.36781-2.330878-7.024898-4.279468-4.343878-5.10762-8.475879-9.96341-13.573278-14.374161-12.895604-11.157333-26.530715-21.449361-40.396663-31.373138-7.362086-5.269452-15.425755-12.12007-23.908229-15.340199 2.385052 5.745041 4.721463 11.086326 5.532694 17.339156 2.385876 18.392716-5.314223 35.704625-16.87179 49.540445-3.526876 4.222498-7.29943 8.475545-11.744712 11.755948-1.843407 1.360711-4.156734 3.137561-6.595373 2.752797-7.645687-1.207961-8.555849-12.73272-9.728176-18.637115-3.970415-19.998652-2.375984-39.861068 3.132802-59.448534-4.901187 2.485279-8.443727 7.923994-11.521293 12.385111-6.770975 9.816439-12.645804 20.199291-16.858599 31.375615-16.777806 44.519521-16.616219 96.664142 5.118834 139.523233 2.427098 4.786433 6.110614 4.144058 10.894733 4.144058.720854 0 1.44257-.004515 2.164851-.010924l2.168232-.022283c4.338648-.045438 8.686803-.064635 12.979772.508795 2.227588.297243 5.320818.032202 7.084256 1.673642 2.111344 1.966755.986008 5.338808.4996 7.758859-1.358647 6.765574-1.812904 12.914369-1.812904 19.816178 9.02412-1.398692 11.525415-15.866153 14.724172-23.118874 3.624982-8.216283 7.313444-16.440823 10.667192-24.770223 1.648843-4.093692 3.854171-8.671229 3.275427-13.210785-.649644-5.10184-4.335633-10.510831-6.904531-14.862134-4.86244-8.234447-10.389363-16.70834-13.969002-25.595896-2.861567-7.104926-.197036-15.983399 7.871579-18.521521 4.450228-1.400344 9.198073 1.345848 12.094266 4.562675 6.07269 6.74328 9.992815 16.777697 14.401823 24.692609l34.394873 61.925556c2.920926 5.243856 5.848447 10.481933 8.836976 15.687808 1.165732 2.031158 2.352075 5.167068 4.740424 6.0332 2.127008.77118 5.033095-.325315 7.148561-.748886 5.492297-1.099798 10.97635-2.287117 16.488434-3.28288 6.605266-1.193099 16.673928-.969342 21.434964-6.129805-6.963066-2.205375-15.011895-2.074919-22.259386-1.577863-4.352947.298894-9.178287 1.856116-13.178381-.686135-5.953149-3.783239-9.910373-12.522173-13.552668-18.377854-8.980425-14.439388-17.441465-29.095929-26.041008-43.760726l-1.376261-2.335014-2.765943-4.665258c-1.380597-2.334387-2.750786-4.67476-4.079753-7.036188-1.02723-1.826391-2.549937-4.233231-1.078344-6.24705 1.545791-2.114476 4.91472-2.239146 7.956473-2.243117l.603351.000261c1.195428.001526 2.315572.002427 3.222811-.11692 12.27399-1.615019 24.718635-2.952611 37.098976-2.952611-.963749-3.352237-3.719791-7.141255-2.838484-10.73046 1.972017-8.030506 13.526287-10.543033 18.899867-4.780653 3.60767 3.868283 5.704174 9.192229 8.051303 13.859765 3.097352 6.162006 6.624228 12.118418 9.940876 18.16483 5.805578 10.585967 12.146205 20.881297 18.116667 31.375615.49237.865561.999687 1.726685 1.512269 2.587098l.771613 1.290552c2.577138 4.303168 5.164895 8.635123 6.553094 13.461506-20.735854-.9487-36.30176-25.018751-45.343193-41.283704-.721369 2.604176.450959 4.928448 1.388326 7.431066 1.948109 5.197619 4.276275 10.147535 7.20627 14.862134 4.184765 6.732546 8.982075 13.665732 15.313633 18.553722 11.236043 8.673707 26.05255 8.721596 39.572241 7.794364 8.669619-.595311 19.50252-4.542034 28.030338-1.864372 8.513803 2.673532 11.940924 12.063098 6.884745 19.276187-3.787393 5.403211-8.842747 7.443452-15.128962 8.257566 4.445282 9.53571 10.268996 18.385285 14.490036 28.072919 1.758491 4.035895 3.59118 10.22102 7.8048 12.350433 2.805507 1.416857 6.824562.09743 9.85761.034678-3.043765-8.053625-8.742992-14.887729-11.541904-23.118874 8.533589.390544 16.786875 4.843404 24.732651 7.685374 15.630376 5.590144 31.063836 11.701854 46.475333 17.86913l7.112077 2.848685c6.338978 2.538947 12.71588 5.052299 18.961699 7.812528 2.285297 1.009799 5.449427 3.370401 7.975455 1.917215 2.061054-1.186494 3.394144-4.015253 4.665403-5.931643 3.55573-5.361927 6.775921-10.928622 9.965609-16.513481 12.774414-22.36586 22.143967-46.872692 28.402976-71.833646 20.645168-82.323009 2.934117-173.156241-46.677107-241.922507-19.061454-26.420745-43.033164-49.262193-69.46165-68.1783861-66.13923-47.336721-152.911262-66.294198-232.486917-48.7172481zm135.205158 410.5292842c-17.532977 4.570931-35.601827 8.714164-53.58741 11.040088 2.365265 8.052799 8.145286 15.885969 12.376218 23.118874 1.635653 2.796558 3.3859 6.541816 6.618457 7.755557 3.651364 1.370619 8.063669-.853747 11.508927-1.975838-1.595256-4.364513-4.279573-8.292245-6.476657-12.385112-.905215-1.687677-2.305907-3.685809-1.559805-5.68972 1.410585-3.786541 7.266452-3.563609 10.509727-4.221671 8.54678-1.733916 17.004522-3.898008 25.557073-5.611281 3.150939-.631641 7.538512-2.342438 10.705115-1.285575 2.371037.791232 3.800147 2.744743 5.152304 4.781948l.606196.918752c.80912 1.222827 1.637246 2.41754 2.671212 3.351165 3.457625 3.121874 8.628398 3.60159 13.017619 4.453686-2.678546-6.027421-7.130424-11.301001-9.984571-17.339156-1.659561-3.511592-3.023155-8.677834-6.656381-10.707341-5.005064-2.795733-15.341663 2.461334-20.458024 3.795624zm-110.472507-40.151706c-.825246 10.467897-4.036369 18.984725-9.068639 28.072919 5.76683.729896 11.649079.989984 17.312856 2.39363 4.244947 1.051908 8.156828 3.058296 12.366325 4.211763-2.250671-6.157877-6.426367-11.651913-9.661398-17.339156-3.266358-5.740912-6.189758-12.717032-10.949144-17.339156z"
														fill="currentColor"
														transform="translate(.9778)"
													/>
												</svg>
												{/* Solid Start */}
												<svg
													xmlns="http://www.w3.org/2000/svg"
													width="15"
													height="15"
													viewBox="0 0 128 128"
													className="text-[#4F88C6] opacity-60 transition-all duration-300 group-hover/card:opacity-100 group-hover/card:animate-[icon-bounce_0.4s_ease-out_0.2s]"
												>
													<path
														fill="currentColor"
														d="M61.832 4.744c-3.205.058-6.37.395-9.45 1.07l-2.402.803c-4.806 1.603-8.813 4.005-11.216 7.21l-1.602 2.404l-12.017 20.828l.166.031c-4.785 5.823-5.007 14.07-.166 21.6c1.804 2.345 4.073 4.431 6.634 6.234l-15.445 4.982L.311 97.946s42.46 32.044 75.306 24.033l2.403-.801c5.322-1.565 9.292-4.48 11.683-8.068l.334.056l16.022-28.84c3.204-5.608 2.404-12.016-1.602-18.425a36 36 0 0 0-7.059-6.643l15.872-5.375l14.42-24.033S92.817 4.19 61.831 4.744z"
													/>
												</svg>
												{/* Expo */}
												<svg
													xmlns="http://www.w3.org/2000/svg"
													width="15"
													height="15"
													viewBox="0 0 32 32"
													className="text-[#000020] dark:text-[#FAFAFA] opacity-60 transition-all duration-300 group-hover/card:opacity-100 group-hover/card:animate-[icon-bounce_0.4s_ease-out_0.25s]"
												>
													<path
														fill="currentColor"
														d="M24.292 15.547a3.93 3.93 0 0 0 4.115-3.145a2.57 2.57 0 0 0-2.161-1.177c-2.272-.052-3.491 2.651-1.953 4.323zm-9.177-10.85l5.359-3.104L18.766.63l-7.391 4.281l.589.328l1.119.629l2.032-1.176zm6.046-3.39c.089.027.161.1.188.188l2.484 7.593a.285.285 0 0 1-.125.344a5.06 5.06 0 0 0-2.317 5.693a5.066 5.066 0 0 0 5.401 3.703a.3.3 0 0 1 .307.203l2.563 7.803a.3.3 0 0 1-.125.344l-7.859 4.771a.3.3 0 0 1-.131.036a.26.26 0 0 1-.203-.041l-2.765-1.797a.3.3 0 0 1-.109-.129l-5.396-12.896l-8.219 4.875c-.016.011-.037.021-.052.032a.3.3 0 0 1-.261-.021l-1.859-1.093a.283.283 0 0 1-.115-.381l7.953-15.749a.27.27 0 0 1 .135-.131L18.615.045a.29.29 0 0 1 .292-.005zm-8.322 5.1l-1.932-1.089l-7.693 15.229l1.396.823l6.631-9.015a.28.28 0 0 1 .271-.12a.29.29 0 0 1 .235.177l7.228 17.296l1.933 1.251l-8.063-24.552zm13.406 10.557c-2.256 0-3.787-2.292-2.923-4.376c.86-2.083 3.563-2.619 5.156-1.025c.595.593.928 1.396.928 2.235a3.16 3.16 0 0 1-3.161 3.167z"
													/>
												</svg>
												{/* +14 more */}
												<div className="flex items-center justify-center size-[20px] border border-dashed border-foreground/[0.1] text-foreground/35 dark:text-foreground/20 transition-all duration-300 group-hover/card:text-foreground/60 dark:group-hover/card:text-foreground/40 group-hover/card:border-foreground/20 group-hover/card:animate-[icon-bounce_0.4s_ease-out_0.3s]">
													<span className="text-[7px] font-mono leading-none">
														+14
													</span>
												</div>
											</div>
										)}
										{"social" in feature && feature.social && (
											<div className="mt-3 relative overflow-hidden">
												<div className="flex items-center gap-2.5">
													<div className="relative flex items-center gap-2.5">
														<div className="absolute left-3 right-3 top-1/2 h-px -translate-y-1/2 bg-foreground/[0.08]" />
														{/* Google — stretches to "Sign in with Google" on hover */}
														<motion.div
															animate={{ width: socialHovered ? 120 : 24 }}
															transition={{
																duration: 0.3,
																ease: [0.4, 0, 0.2, 1],
															}}
															className="relative flex items-center h-6 border border-foreground/8 bg-background shrink-0 overflow-hidden opacity-60 transition-opacity duration-300 group-hover/card:opacity-100"
														>
															<div className="flex items-center gap-1.5 px-[7px]">
																<svg
																	xmlns="http://www.w3.org/2000/svg"
																	width="10"
																	height="10"
																	viewBox="0 0 48 48"
																	className="shrink-0"
																>
																	<path
																		fill="#FFC107"
																		d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917"
																	/>
																	<path
																		fill="#FF3D00"
																		d="m6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691"
																	/>
																	<path
																		fill="#4CAF50"
																		d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.9 11.9 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44"
																	/>
																	<path
																		fill="#1976D2"
																		d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917"
																	/>
																</svg>
																<motion.span
																	animate={{ opacity: socialHovered ? 1 : 0 }}
																	transition={{
																		duration: 0.2,
																		delay: socialHovered ? 0.1 : 0,
																	}}
																	className="text-[8px] font-mono text-foreground/60 dark:text-foreground/40 whitespace-nowrap"
																>
																	Sign in with Google
																</motion.span>
															</div>
														</motion.div>
														{/* GitHub */}
														<div className="relative flex items-center justify-center size-6 border border-foreground/[0.08] bg-background text-neutral-800 dark:text-neutral-200 shrink-0 opacity-60 transition-opacity duration-300 group-hover/card:opacity-100">
															<svg
																xmlns="http://www.w3.org/2000/svg"
																width="10"
																height="10"
																viewBox="0 0 24 24"
															>
																<path
																	fill="currentColor"
																	d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
																/>
															</svg>
														</div>
														{/* Apple */}
														<div className="relative flex items-center justify-center size-6 border border-foreground/[0.08] bg-background text-neutral-800 dark:text-neutral-200 shrink-0 opacity-60 transition-opacity duration-300 group-hover/card:opacity-100">
															<svg
																xmlns="http://www.w3.org/2000/svg"
																width="10"
																height="10"
																viewBox="0 0 24 24"
															>
																<path
																	fill="currentColor"
																	d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
																/>
															</svg>
														</div>
														{/* Discord */}
														<div className="relative flex items-center justify-center size-6 border border-foreground/[0.08] bg-background text-[#5865F2] shrink-0 opacity-60 transition-opacity duration-300 group-hover/card:opacity-100">
															<svg
																xmlns="http://www.w3.org/2000/svg"
																width="10"
																height="10"
																viewBox="0 0 24 24"
															>
																<path
																	fill="currentColor"
																	d="M20.317 4.37a19.8 19.8 0 0 0-4.885-1.515.07.07 0 0 0-.073.036c-.21.375-.444.864-.608 1.25a18.3 18.3 0 0 0-5.487 0 13 13 0 0 0-.617-1.25.07.07 0 0 0-.073-.036A19.7 19.7 0 0 0 3.69 4.37a.06.06 0 0 0-.032.025C.533 9.046-.32 13.58.099 18.057a.08.08 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.08.08 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.08.08 0 0 0-.041-.106 13 13 0 0 1-1.872-.892.08.08 0 0 1-.008-.128q.188-.141.372-.287a.08.08 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.08.08 0 0 1 .079.01q.183.149.372.288a.08.08 0 0 1-.006.127c-.598.35-1.22.645-1.873.892a.08.08 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.08.08 0 0 0 .084.029 19.8 19.8 0 0 0 6.002-3.03.08.08 0 0 0 .032-.056c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.026M8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419s.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418m7.975 0c-1.183 0-2.157-1.085-2.157-2.419s.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418"
																/>
															</svg>
														</div>
														{/* Microsoft */}
														<div className="relative flex items-center justify-center size-6 border border-foreground/[0.08] bg-background shrink-0 opacity-60 transition-opacity duration-300 group-hover/card:opacity-100">
															<svg
																xmlns="http://www.w3.org/2000/svg"
																width="9"
																height="9"
																viewBox="0 0 256 256"
															>
																<path
																	fill="#F1511B"
																	d="M121.666 121.666H0V0h121.666z"
																/>
																<path
																	fill="#80CC28"
																	d="M256 121.666H134.335V0H256z"
																/>
																<path
																	fill="#00ADEF"
																	d="M121.663 256.002H0V134.336h121.663z"
																/>
																<path
																	fill="#FBBC09"
																	d="M256 256.002H134.335V134.336H256z"
																/>
															</svg>
														</div>
														{/* X/Twitter */}
														<div className="relative flex items-center justify-center size-6 border border-foreground/[0.08] bg-background text-neutral-800 dark:text-neutral-200 shrink-0 opacity-60 transition-opacity duration-300 group-hover/card:opacity-100">
															<svg
																xmlns="http://www.w3.org/2000/svg"
																width="9"
																height="9"
																viewBox="0 0 24 24"
															>
																<path
																	fill="currentColor"
																	d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
																/>
															</svg>
														</div>
													</div>
													{/* +34 */}
													<div className="flex items-center justify-center size-6 border border-dashed border-foreground/[0.1] text-foreground/35 dark:text-foreground/20 shrink-0">
														<span className="text-[8px] font-mono leading-none">
															+34
														</span>
													</div>
												</div>
												<div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent pointer-events-none" />
											</div>
										)}
										{"credential" in feature && feature.credential && (
											<CredentialFields />
										)}
										{"org" in feature && feature.org && (
											<div className="mt-3 flex items-center gap-2.5">
												{/* Overlapping member avatars */}
												<div className="flex -space-x-1.5">
													<div className="relative size-5 rounded-full border border-foreground/[0.08] bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center z-[3]">
														<span className="text-[8px] font-mono text-foreground/55 dark:text-foreground/35 leading-none">
															A
														</span>
													</div>
													<div className="relative size-5 rounded-full border border-foreground/[0.08] bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center z-[2]">
														<span className="text-[8px] font-mono text-foreground/50 dark:text-foreground/30 leading-none">
															B
														</span>
													</div>
													<div className="relative size-5 rounded-full border border-foreground/[0.08] bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center z-[1]">
														<span className="text-[8px] font-mono text-foreground/40 dark:text-foreground/50 leading-none">
															C
														</span>
													</div>
													<div className="relative size-5 rounded-full border border-dashed border-foreground/[0.1] bg-background flex items-center justify-center z-[0]">
														<span className="text-[8px] font-mono text-foreground/35 dark:text-foreground/20 leading-none">
															+
														</span>
													</div>
												</div>
												{/* Role badges */}
												<div className="flex items-center gap-1">
													<span className="text-[8px] font-mono text-foreground/50 dark:text-foreground/30 px-1.5 py-0.5 border border-foreground/[0.08] bg-foreground/[0.015]">
														owner
													</span>
													<span className="text-[8px] font-mono text-foreground/35 dark:text-foreground/20 px-1.5 py-0.5 border border-foreground/[0.06] bg-foreground/[0.015]">
														admin
													</span>
													<span className="text-[8px] font-mono text-foreground/30  px-1.5 py-0.5 border border-dashed border-foreground/[0.08]">
														member
													</span>
												</div>
											</div>
										)}
										{"plugins" in feature && feature.plugins && (
											<div className="mt-3 relative overflow-hidden">
												<div className="flex items-center gap-1 overflow-hidden">
													{[
														"passkeys",
														"2fa",
														"magic-link",
														"jwt",
														"api-keys",
														"anonymous",
														"oidc",
														"otp",
														"bearer",
														"multi-session",
													].map((plugin, i) => (
														<span
															key={plugin}
															className={`text-[8px] font-mono whitespace-nowrap px-1.5 py-0.5 border shrink-0 ${i < 2 ? "text-foreground/50 dark:text-foreground/30 border-foreground/[0.08] bg-foreground/[0.02]" : i < 4 ? "text-foreground/40 dark:text-foreground/22 border-foreground/[0.06] bg-foreground/[0.015]" : "text-foreground/30  border-foreground/[0.05]"}`}
														>
															{plugin}
														</span>
													))}
												</div>
												{/* Fade-out gradient on the right to imply "there's more" */}
												<div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent pointer-events-none" />
											</div>
										)}
										{"enterprise" in feature && feature.enterprise && (
											<div className="mt-3 flex items-center gap-2.5">
												<div className="relative flex items-center gap-2.5">
													<div className="absolute left-3 right-3 top-1/2 h-px -translate-y-1/2 bg-foreground/[0.08]" />
													{/* Okta */}
													<div className="relative flex items-center justify-center size-6 border border-foreground/[0.08] bg-background text-neutral-800 dark:text-neutral-200 opacity-60 transition-opacity duration-300 group-hover/card:opacity-100">
														<svg
															xmlns="http://www.w3.org/2000/svg"
															width="10"
															height="10"
															viewBox="0 0 256 256"
														>
															<path
																fill="currentColor"
																d="m140.844 1.778l-5.266 64.853a66 66 0 0 0-7.542-.427c-3.203 0-6.334.214-9.393.712l-2.99-31.432a1.72 1.72 0 0 1 1.709-1.848h5.337l-2.562-31.787C120.066.853 120.848 0 121.774 0h17.434c.996 0 1.779.853 1.636 1.849zm-43.976 3.2c-.285-.925-1.281-1.494-2.206-1.138L78.295 9.813c-.925.356-1.352 1.423-.925 2.276l13.307 29.013l-5.052 1.85c-.926.355-1.352 1.421-.926 2.275l13.592 28.515a61 61 0 0 1 15.868-6.044L96.94 4.978zM56.734 23.04l37.643 53.049c-4.768 3.129-9.108 6.827-12.809 11.093L59.011 64.996a1.72 1.72 0 0 1 .071-2.49l4.127-3.413L40.794 36.41c-.711-.711-.64-1.849.142-2.489l13.307-11.164c.783-.64 1.85-.498 2.42.284zM25.139 53.76c-.783-.569-1.921-.284-2.42.569l-8.68 15.075c-.499.854-.143 1.92.71 2.347L43.64 85.404l-2.704 4.623c-.498.853-.142 1.99.783 2.346l28.749 13.156a60.2 60.2 0 0 1 8.254-14.791zM3.862 94.72c.143-.996 1.139-1.564 2.064-1.351l62.976 16.427a62.3 62.3 0 0 0-2.704 16.782l-31.524-2.56a1.642 1.642 0 0 1-1.494-1.991l.925-5.263l-31.808-2.986c-.996-.071-1.637-.996-1.495-1.991l2.99-17.138zm-2.348 42.524c-.996.072-1.637.996-1.494 1.992l3.06 17.137c.142.996 1.138 1.565 2.063 1.351l30.883-8.035l.925 5.262c.143.996 1.139 1.565 2.064 1.351l30.456-8.39c-1.779-5.263-2.917-10.88-3.202-16.64l-64.826 5.972zM11.62 182.33c-.498-.853-.143-1.92.711-2.347l58.778-27.875c2.206 5.262 5.195 10.169 8.753 14.577L54.1 185.031c-.783.569-1.921.356-2.42-.498l-2.704-4.693l-26.257 18.133c-.783.57-1.922.285-2.42-.569l-8.752-15.075zm71.23-12.231L37.094 216.39c-.712.711-.64 1.849.142 2.489l13.378 11.164c.783.64 1.85.498 2.42-.284l18.501-26.027l4.127 3.485c.783.64 1.922.498 2.49-.356l17.933-26.026c-4.839-2.987-9.322-6.614-13.165-10.738zm-9.037 74.31c-.925-.355-1.352-1.421-.925-2.275L100 182.97c4.98 2.56 10.389 4.48 16.01 5.547l-7.97 30.577c-.213.925-1.28 1.494-2.205 1.138l-5.052-1.849l-8.468 30.791c-.285.925-1.281 1.494-2.206 1.138l-16.367-5.973zm46.68-55.11l-5.265 64.853c-.071.996.711 1.849 1.637 1.849h17.434c.996 0 1.779-.853 1.636-1.849l-2.561-31.787h5.336a1.72 1.72 0 0 0 1.708-1.848l-2.988-31.432c-3.06.498-6.191.712-9.393.712c-2.562 0-5.053-.143-7.543-.498m62.763-175.574c.427-.924 0-1.92-.925-2.275l-16.366-5.973c-.926-.356-1.922.213-2.206 1.137l-8.468 30.791l-5.053-1.848c-.925-.356-1.921.213-2.206 1.137l-7.97 30.578c5.693 1.138 11.03 3.058 16.011 5.547zm35.722 25.814L173.222 85.83a62 62 0 0 0-13.165-10.738l17.933-26.026c.569-.783 1.707-.996 2.49-.356l4.127 3.485l18.502-26.027c.57-.782 1.708-.925 2.42-.285l13.377 11.165c.783.64.783 1.778.143 2.489zm24.764 36.409c.925-.427 1.21-1.494.711-2.347L235.7 58.524c-.498-.853-1.637-1.066-2.42-.568l-26.257 18.133l-2.704-4.622c-.499-.854-1.637-1.138-2.42-.498l-25.76 18.347c3.558 4.408 6.476 9.315 8.753 14.577l58.778-27.875zm9.25 23.609l2.99 17.137c.142.996-.499 1.85-1.495 1.991l-64.826 6.045c-.285-5.831-1.424-11.378-3.203-16.64l30.457-8.391c.925-.285 1.921.355 2.063 1.35l.925 5.263l30.884-8.035c.925-.214 1.92.355 2.063 1.35zm-2.917 62.933c.925.213 1.921-.356 2.064-1.351L255.126 144c.143-.996-.498-1.849-1.494-1.991l-31.808-2.987l.925-5.262c.142-.996-.498-1.849-1.495-1.991l-31.523-2.56a62.3 62.3 0 0 1-2.704 16.782l62.976 16.427zM233.28 201.6c-.498.853-1.636 1.067-2.419.569l-53.583-36.978a60.2 60.2 0 0 0 8.254-14.791l28.749 13.156c.925.426 1.28 1.493.783 2.346l-2.704 4.622l28.89 13.654c.854.426 1.21 1.493.712 2.346zm-71.657-21.831l37.643 53.049c.57.782 1.708.924 2.42.284l13.306-11.164c.783-.64.783-1.778.143-2.49l-22.415-22.684l4.127-3.413c.783-.64.783-1.778.07-2.489l-22.557-22.186c-3.771 4.266-8.04 8.035-12.808 11.093zm-.356 72.249c-.925.355-1.921-.214-2.206-1.138l-17.22-62.72a61 61 0 0 0 15.868-6.044l13.592 28.515c.426.925 0 1.991-.926 2.276l-5.052 1.849l13.307 29.013c.427.924 0 1.92-.925 2.275l-16.367 5.974z"
															/>
														</svg>
													</div>
													{/* Microsoft Entra / Azure AD */}
													<div className="relative flex items-center justify-center size-6 border border-foreground/[0.08] bg-background shrink-0 opacity-60 transition-opacity duration-300 group-hover/card:opacity-100">
														<svg
															xmlns="http://www.w3.org/2000/svg"
															width="10"
															height="10"
															viewBox="0 0 24 24"
														>
															<path
																fill="#0078D4"
																d="M13.05 4.24L6.56 18.05L2 18l5.09-8.76zm.7 1.09L22 19.76H6.74l9.3-1.66l-4.87-5.79z"
															/>
														</svg>
													</div>
													{/* SCIM / Directory Sync */}
													<div className="relative flex items-center justify-center size-6 border border-foreground/[0.08] bg-background text-[#10B981] shrink-0 opacity-60 transition-opacity duration-300 group-hover/card:opacity-100">
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
														>
															<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
															<circle cx="9" cy="7" r="4" />
															<polyline points="16 11 18 13 22 9" />
														</svg>
													</div>
													{/* Generic IdP / Building */}
													<div className="relative flex items-center justify-center size-6 border border-foreground/[0.08] bg-background text-neutral-800 dark:text-neutral-200 opacity-60 transition-opacity duration-300 group-hover/card:opacity-100">
														<svg
															xmlns="http://www.w3.org/2000/svg"
															width="10"
															height="10"
															viewBox="0 0 24 24"
														>
															<path
																fill="currentColor"
																d="M12 7V3H2v18h20V7zM6 19H4v-2h2zm0-4H4v-2h2zm0-4H4V9h2zm0-4H4V5h2zm4 12H8v-2h2zm0-4H8v-2h2zm0-4H8V9h2zm0-4H8V5h2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8zm-2-8h-2v2h2zm0 4h-2v2h2z"
															/>
														</svg>
													</div>
												</div>
												{/* +more */}
												<div className="flex items-center justify-center size-6 border border-dashed border-foreground/[0.1] text-foreground/35 dark:text-foreground/20">
													<span className="text-[8px] font-mono leading-none">
														+
													</span>
												</div>
											</div>
										)}
										{"agent" in feature && feature.agent && (
											<div className="mt-3 flex items-center h-5 px-2.5 border border-foreground/[0.06] bg-foreground/[0.015] font-mono text-[8px] gap-1">
												<span className="text-foreground/30 ">$</span>
												<span className="text-foreground/50 dark:text-foreground/30">
													agent
													<span className="text-foreground/30 ">.</span>
													auth
													<span className="text-foreground/30 ">()</span>
												</span>
												<span className="text-foreground/50 dark:text-foreground/10 mx-0.5">
													→
												</span>
												<span className="text-foreground/35 dark:text-foreground/20">
													sk-<span className="tracking-[0.08em]">••••</span>
												</span>
												<span className="text-foreground/40 dark:text-foreground/50">
													✓
												</span>
												<span className="inline-block w-px h-2.5 bg-foreground/30 animate-[blink_1s_steps(2)_infinite]" />
											</div>
										)}
										{"security" in feature && feature.security && (
											<div className="mt-3 relative overflow-hidden">
												<div className="flex items-center gap-1.5 font-mono text-[8px]">
													{/* Shield icon */}
													<div className="flex items-center justify-center size-5 border border-foreground/[0.08] bg-foreground/[0.02] shrink-0">
														<svg
															xmlns="http://www.w3.org/2000/svg"
															width="10"
															height="10"
															viewBox="0 0 24 24"
															className="text-foreground/50 dark:text-foreground/30"
														>
															<path
																fill="currentColor"
																d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12c5.16-1.26 9-6.45 9-12V5zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11z"
															/>
														</svg>
													</div>
													{/* Blocked */}
													<div className="flex items-center gap-1 px-1.5 py-0.5 border border-red-500/15 bg-red-500/[0.03] shrink-0">
														<span className="inline-block size-1 rounded-full bg-red-500/40" />
														<span className="text-red-500/40">blocked</span>
													</div>
													{/* Challenged */}
													<div className="flex items-center gap-1 px-1.5 py-0.5 border border-yellow-600/15 bg-yellow-600/[0.03] shrink-0">
														<span className="inline-block size-1 rounded-full bg-yellow-600/40" />
														<span className="text-yellow-600/40">
															challenged
														</span>
													</div>
													{/* Allowed */}
													<div className="flex items-center gap-1 px-1.5 py-0.5 border border-green-500/15 bg-green-500/[0.03] shrink-0">
														<span className="inline-block size-1 rounded-full bg-green-500/50" />
														<span className="text-green-500/50">allowed</span>
													</div>
												</div>
												<div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent pointer-events-none" />
											</div>
										)}
										{"dashboard" in feature && feature.dashboard && (
											<div className="mt-3 relative overflow-hidden h-5">
												<div className="flex animate-[marquee_20s_linear_infinite] gap-4">
													{[...Array(2)].map((_, setIdx) => (
														<div key={setIdx} className="flex gap-4 shrink-0">
															{[
																{
																	time: "10:50 AM",
																	user: "John",
																	action: "created a session",
																},
																{
																	time: "10:48 AM",
																	user: "Sarah",
																	action: "updated profile",
																},
																{
																	time: "10:45 AM",
																	user: "Alex",
																	action: "joined organization",
																},
																{
																	time: "10:42 AM",
																	user: "Emma",
																	action: "revoked token",
																},
																{
																	time: "10:38 AM",
																	user: "Mike",
																	action: "enabled 2FA",
																},
															].map((event) => (
																<div
																	key={`${setIdx}-${event.time}-${event.user}`}
																	className="flex items-center gap-1.5 shrink-0 h-5 whitespace-nowrap"
																>
																	<span className="text-[8px] font-mono text-foreground/30 ">
																		{event.time}
																	</span>
																	<span className="text-[8px] font-mono text-foreground/50 dark:text-foreground/30 border-b border-dashed border-foreground/20">
																		{event.user}
																	</span>
																	<span className="text-[8px] font-mono text-foreground/35 dark:text-foreground/20">
																		{event.action}
																	</span>
																</div>
															))}
														</div>
													))}
												</div>
												<div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none" />
											</div>
										)}
									</motion.div>
								</Link>
							))}
							{/* + marks at grid intersections */}
							<span className="hidden md:block absolute top-1/3 left-1/3 -translate-x-1/2 -translate-y-1/2 font-mono  -mt-[1px] -ml-[.5px] text-[10px] text-foreground/35 dark:text-foreground/20 select-none z-10">
								+
							</span>
							<span className="hidden md:block absolute top-1/3 left-2/3 -translate-x-1/2 -translate-y-1/2 font-mono -mt-[1px] -ml-[.5px] text-[10px] text-foreground/35 dark:text-foreground/20 select-none z-10">
								+
							</span>
							<span className="hidden md:block absolute top-2/3 left-1/3 -translate-x-1/2 -translate-y-1/2 font-mono  -mt-[1px] -ml-[.5px] text-[10px] text-foreground/35 dark:text-foreground/20 select-none z-10">
								+
							</span>
							<span className="hidden md:block absolute top-2/3 left-2/3 -translate-x-1/2 -translate-y-1/2 font-mono  -mt-[1px] -ml-[.5px] text-[10px] text-foreground/35 dark:text-foreground/20 select-none z-10">
								+
							</span>
						</div>

						<div className="my-6">
							<div className="flex items-center gap-3 mb-5">
								<span className="text-[10px] text-foreground/50 dark:text-foreground/50 font-mono tracking-wider uppercase shrink-0">
									Declarative Config
								</span>
								<div className="flex-1 border-t border-foreground/10" />
							</div>
							<ServerClientTabs />
						</div>

						{/* Database */}
						<div className="my-8">
							<DatabaseSection />
						</div>

						<AiNativeSection />

						<div className="flex items-center gap-3 mt-8 mb-5">
							<span className="text-base text-foreground/85 dark:text-foreground/75">
								OAuth Providers
							</span>
							<div className="h-px flex-1 bg-foreground/[0.08]" />
						</div>

						<SocialProvidersSection />

						<div className="mt-8">
							<PluginEcosystem />
						</div>

						{/* Infrastructure transition */}
						<div className="mt-16 mb-8">
							<div className="flex items-center gap-4">
								<span className="text-lg sm:text-xl font-medium text-foreground/90 dark:text-foreground/80 tracking-tight shrink-0">
									Infrastructure
								</span>
								<div className="flex-1 border-t border-foreground/10" />
							</div>
							<p className="text-[12px] sm:text-[13px] text-neutral-500 dark:text-neutral-400 leading-relaxed mt-2 max-w-xl">
								Managed infrastructure on top of the open-source framework.
							</p>
						</div>

						{/* Dashboard */}
						<div className="mt-10 mb-4">
							<div className="mb-5">
								<h3 className="text-base sm:text-lg text-neutral-800 dark:text-neutral-200 leading-snug mb-2">
									User management and monitoring platform.
								</h3>
								<p className="text-[12px] sm:text-[13px] text-neutral-500 dark:text-neutral-400 leading-relaxed max-w-2xl">
									Monitor sign-ups, manage users, track sessions, and surface
									security insights — with an agentic Cmd+K to do it all in
									natural language.
								</p>
							</div>

							<div className="relative group/dash">
								{/* Outer dashed border — top and sides only, sides fade out toward bottom */}
								<div className="absolute -inset-2 sm:-inset-3 border-t border-dashed border-foreground/[0.08] pointer-events-none" />
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

							{/* Feature callouts */}
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
										<div className="text-[11px] font-mono text-foreground/65 dark:text-foreground/50 uppercase tracking-wider mb-0.5">
											{item.label}
										</div>
										<div className="text-[11px] font-mono text-foreground/40 dark:text-foreground/28">
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
									<p className="text-[12px] sm:text-[13px] text-neutral-500 dark:text-neutral-400 leading-relaxed max-w-2xl">
										Every auth event captured automatically — sign-ins, password
										resets, MFA challenges, session changes, and more. Filter,
										search, and export with configurable retention and log drain
										to your SIEM.
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
											<div className="text-[11px] font-mono text-foreground/40 dark:text-foreground/28">
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
									<p className="text-[12px] sm:text-[13px] text-neutral-500 dark:text-neutral-400 leading-relaxed max-w-2xl">
										Built-in email and SMS delivery for verification codes,
										magic links, password resets, and MFA. Customizable
										templates, abuse protection, and delivery tracking — no
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
											<div className="text-[11px] font-mono text-foreground/65 dark:text-foreground/50 uppercase tracking-wider mb-0.5">
												{item.label}
											</div>
											<div className="text-[11px] font-mono text-foreground/40 dark:text-foreground/28">
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
							<div className="border border-dashed border-foreground/[0.10] p-5 flex items-center justify-between">
								<div>
									<p className="text-[11px] font-mono uppercase tracking-widest text-foreground/80 dark:text-foreground/80 mb-1">
										Explore plans
									</p>
									<p className="text-[12px] text-foreground/50 dark:text-foreground/40 leading-relaxed">
										Dashboard, audit logs, security detection, transactional
										comms, and more.
									</p>
								</div>
								<Link
									href="/products/infrastructure"
									className="inline-flex items-center gap-1.5 shrink-0 ml-4 px-4 py-2 border border-dashed border-foreground/[0.14] text-foreground dark:text-foreground/80 hover:text-foreground hover:border-foreground/25 hover:bg-foreground/[0.02] transition-all"
								>
									<span className="font-mono text-[11px] uppercase tracking-widest">
										View Plans
									</span>
									<svg
										className="h-2.5 w-2.5 opacity-50"
										viewBox="0 0 10 10"
										fill="none"
									>
										<path
											d="M1 9L9 1M9 1H3M9 1V7"
											stroke="currentColor"
											strokeWidth="1.2"
										/>
									</svg>
								</Link>
							</div>
						</div>

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
