"use client";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { kFormatter } from "@/lib/utils";
export default function Stats({ npmDownloads }: { npmDownloads: number }) {
	return (
		<div className="relative">
			<div className="md:mx-auto w-full">
				<div className="border border-input rounded-none overflow-hidden border-l-0 border-r-0">
					<div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-input">
						<div className="flex pt-5 dark:[box-shadow:0_-20px_80px_-20px_#dfbf9f1f_inset] flex-col items-center justify-between">
							<div className="relative flex flex-col p-3">
								<div className="inline-flex dark:[border:1px_solid_rgba(255,255,255,.1)] dark:[box-shadow:0_-20px_80px_-20px_#8686f01f_inset] border rounded-full items-center justify-center p-1 w-[4.0em] h-[4.0em] mx-auto mb-4">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="4em"
										height="4em"
										viewBox="0 0 24 24"
										className="my-2"
									>
										<path
											fill="currentColor"
											d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.1.1 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.1 16.1 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09c-.01-.02-.04-.03-.07-.03c-1.5.26-2.93.71-4.27 1.33c-.01 0-.02.01-.03.02c-2.72 4.07-3.47 8.03-3.1 11.95c0 .02.01.04.03.05c1.8 1.32 3.53 2.12 5.24 2.65c.03.01.06 0 .07-.02c.4-.55.76-1.13 1.07-1.74c.02-.04 0-.08-.04-.09c-.57-.22-1.11-.48-1.64-.78c-.04-.02-.04-.08-.01-.11c.11-.08.22-.17.33-.25c.02-.02.05-.02.07-.01c3.44 1.57 7.15 1.57 10.55 0c.02-.01.05-.01.07.01c.11.09.22.17.33.26c.04.03.04.09-.01.11c-.52.31-1.07.56-1.64.78c-.04.01-.05.06-.04.09c.32.61.68 1.19 1.07 1.74c.03.01.06.02.09.01c1.72-.53 3.45-1.33 5.25-2.65c.02-.01.03-.03.03-.05c.44-4.53-.73-8.46-3.1-11.95c-.01-.01-.02-.02-.04-.02M8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12c0 1.17-.84 2.12-1.89 2.12m6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12c0 1.17-.83 2.12-1.89 2.12"
										></path>
									</svg>
								</div>
								<span className="text-xl uppercase tracking-tighter font-bold font-mono bg-gradient-to-b dark:from-stone-200 dark:via-stone-400 dark:to-stone-700 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(255,255,255,0.1)] from-stone-800 via-stone-600 to-stone-400">
									Discord
								</span>
							</div>

							<div className="flex items-end  w-full gap-2 mt-4 text-gray-400">
								<Link
									className="w-full"
									href="https://discord.gg/better-auth"
									target="_blank"
								>
									<Button
										variant="outline"
										className="group duration-500 cursor-pointer text-gray-400 flex items-center gap-2 text-md hover:bg-transparent border-l-input/50 border-r-input/50 md:border-r-0 md:border-l-0 border-t-[1px] border-t-input py-7 w-full hover:text-black dark:hover:text-white"
									>
										<span className="uppercase font-mono group-hover:text-black duration-300 dark:group-hover:text-white">
											Join Our Discord
										</span>
										<ArrowUpRight className="w-6 h-6 opacity-20 ml-2 group-hover:opacity-300 duration-300 text-black group-hover:duration-700 dark:text-white" />
									</Button>
								</Link>
							</div>
						</div>

						<div className="flex pt-5 w-full dark:[box-shadow:0_-20px_80px_-20px_#dfbf9f1f_inset] flex-col items-center justify-between">
							<div className="relative p-3">
								<span className="text-[70px] tracking-tighter font-bold font-mono bg-gradient-to-b dark:from-stone-200 dark:via-stone-400 dark:to-stone-700 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(255,255,255,0.1)] from-stone-800 via-stone-600 to-stone-400">
									{kFormatter(npmDownloads) as string}
								</span>
							</div>
							<div className="flex -p-8 items-end w-full gap-2 mt-4 text-gray-400">
								<Link
									className="w-full"
									href="https://www.npmjs.com/package/better-auth"
									target="_blank"
								>
									<Button
										variant="outline"
										className="group duration-500 cursor-pointer text-gray-400 flex items-center gap-2 text-md hover:bg-transparent  border-l-input/50 border-r-input/50 md:border-r-0 md:border-l-0 border-t-[1px] border-t-input py-7 w-full hover:text-black dark:hover:text-white"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="1.5em"
											height="1.5em"
											viewBox="0 0 128 128"
										>
											<path
												fill="#000"
												d="M0 7.062C0 3.225 3.225 0 7.062 0h113.88c3.838 0 7.063 3.225 7.063 7.062v113.88c0 3.838-3.225 7.063-7.063 7.063H7.062c-3.837 0-7.062-3.225-7.062-7.063zm23.69 97.518h40.395l.05-58.532h19.494l-.05 58.581h19.543l.05-78.075l-78.075-.1l-.1 78.126z"
											></path>
											<path
												fill="#fff"
												d="M25.105 65.52V26.512H40.96c8.72 0 26.274.034 39.008.075l23.153.075v77.866H83.645v-58.54H64.057v58.54H25.105z"
											></path>
										</svg>

										<span className="uppercase font-mono group-hover:text-black duration-300 dark:group-hover:text-white">
											Downloads
										</span>
										<ArrowUpRight className="w-6 h-6 opacity-20 ml-2 group-hover:opacity-300 duration-300 text-black group-hover:duration-700 dark:text-white" />
									</Button>
								</Link>
							</div>
						</div>

						<div className="flex pt-5 dark:[box-shadow:0_-20px_80px_-20px_#dfbf9f1f_inset] flex-col items-center justify-between">
							<div className="relative flex flex-col p-3">
								<div className="inline-flex dark:[border:1px_solid_rgba(255,255,255,.1)] dark:[box-shadow:0_-20px_80px_-20px_#8686f01f_inset] border rounded-full items-center justify-center p-1 w-[4.0em] h-[4.0em] mx-auto mb-4">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="4em"
										height="4em"
										viewBox="0 0 24 24"
										className="my-2"
									>
										<path
											fill="currentColor"
											d="M10.75 13.04c0-.57-.47-1.04-1.04-1.04s-1.04.47-1.04 1.04a1.04 1.04 0 1 0 2.08 0m3.34 2.37c-.45.45-1.41.61-2.09.61s-1.64-.16-2.09-.61a.26.26 0 0 0-.38 0a.26.26 0 0 0 0 .38c.71.71 2.07.77 2.47.77s1.76-.06 2.47-.77a.26.26 0 0 0 0-.38c-.1-.1-.27-.1-.38 0m.2-3.41c-.57 0-1.04.47-1.04 1.04s.47 1.04 1.04 1.04s1.04-.47 1.04-1.04S14.87 12 14.29 12"
										></path>
										<path
											fill="currentColor"
											d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2m5.8 11.33c.02.14.03.29.03.44c0 2.24-2.61 4.06-5.83 4.06s-5.83-1.82-5.83-4.06c0-.15.01-.3.03-.44c-.51-.23-.86-.74-.86-1.33a1.455 1.455 0 0 1 2.47-1.05c1.01-.73 2.41-1.19 3.96-1.24l.74-3.49c.01-.07.05-.13.11-.16c.06-.04.13-.05.2-.04l2.42.52a1.04 1.04 0 1 1 .93 1.5c-.56 0-1.01-.44-1.04-.99l-2.17-.46l-.66 3.12c1.53.05 2.9.52 3.9 1.24a1.455 1.455 0 1 1 1.6 2.38"
										></path>
									</svg>
								</div>
								<span className="text-xl uppercase tracking-tighter font-bold font-mono bg-gradient-to-b dark:from-stone-200 dark:via-stone-400 dark:to-stone-700 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(255,255,255,0.1)] from-stone-800 via-stone-600 to-stone-400">
									Reddit
								</span>
							</div>
							<div className="flex items-end w-full gap-2 mt-4 text-gray-400">
								<Link
									className="w-full"
									href="https://reddit.com/r/better_auth"
									target="_blank"
								>
									<Button
										variant="outline"
										className="group duration-500 cursor-pointer text-gray-400 flex items-center gap-2 text-md hover:bg-transparent border-l-input/50 border-r-input/50 md:border-r-0 md:border-l-0  border-t-[1px] border-t-input py-7 w-full hover:text-black dark:hover:text-white"
									>
										<span className="uppercase font-mono group-hover:text-black duration-300 dark:group-hover:text-white">
											Join Subreddit
										</span>
										<ArrowUpRight className="w-6 h-6 opacity-20 ml-2 group-hover:opacity-300 duration-300 text-black group-hover:duration-700 dark:text-white" />
									</Button>
								</Link>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
