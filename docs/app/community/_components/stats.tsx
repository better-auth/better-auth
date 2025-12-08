"use client";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { kFormatter } from "@/lib/utils";
export default function Stats({
	npmDownloads,
	githubStars,
}: {
	npmDownloads: number;
	githubStars: number;
}) {
	return (
		<div className="relative">
			<Link
				href="https://better-merch.dev"
				target="_blank"
				rel="noopener noreferrer"
				className="border-t py-3 flex items-center gap-2 justify-center group hover:bg-stone-50 dark:hover:bg-stone-950 transition-colors duration-300 cursor-pointer text-stone-600 dark:text-white/80"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="1.2em"
					height="1.2em"
					viewBox="0 0 24 24"
				>
					<path
						fill="none"
						stroke="#ffffff"
						strokeLinecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9 8a3 3 0 1 0 6 0M3 16.8V7.2c0-1.12 0-1.68.218-2.108c.192-.377.497-.682.874-.874C4.52 4 5.08 4 6.2 4h11.6c1.12 0 1.68 0 2.107.218c.377.192.683.497.875.874c.218.427.218.987.218 2.105v9.607c0 1.118 0 1.677-.218 2.104a2 2 0 0 1-.875.874c-.427.218-.986.218-2.104.218H6.197c-1.118 0-1.678 0-2.105-.218a2 2 0 0 1-.874-.874C3 18.48 3 17.92 3 16.8"
					/>
				</svg>
				<p>Shop our collection from Better Merch</p>

				<ChevronRight className="w-4 h-4 text-stone-600 dark:text-white/80 transition-transform duration-300 group-hover:translate-x-0.75" />
			</Link>

			<div className="md:mx-auto w-full">
				<div className="border border-b-0 rounded-none overflow-hidden border-l-0 border-r-0">
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
								<span className="text-xl uppercase tracking-tighter font-bold font-mono bg-linear-to-b dark:from-stone-200 dark:via-stone-400 dark:to-stone-700 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(255,255,255,0.1)] from-stone-800 via-stone-600 to-stone-400">
									Discord
								</span>
							</div>

							<div className="flex items-end  w-full gap-2 mt-4 text-gray-400">
								<Link
									className="w-full"
									href="https://discord.gg/better-auth"
									rel="noopener noreferrer"
									target="_blank"
								>
									<Button
										variant="outline"
										className="group duration-500 cursor-pointer text-gray-400 flex items-center gap-2 text-md hover:bg-transparent border-l-input/50 border-r-input/50 md:border-r-0 md:border-l-0 border-t border-t-input py-7 w-full hover:text-black dark:hover:text-white"
									>
										<span className="uppercase font-mono group-hover:text-black duration-300 dark:group-hover:text-white">
											Join Our Discord
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
										viewBox="0 0 28 28"
										className="mt-1 ml-1"
									>
										<path
											fill="currentColor"
											d="M25.418 12v.03c0 .543-.156 1.05-.425 1.479l.007-.012a2.77 2.77 0 0 1-1.112 1.021l-.016.007c.108.403.17.865.17 1.343v.018v-.001a6.33 6.33 0 0 1-1.518 4.08l.007-.009a10.2 10.2 0 0 1-4.052 2.936l-.069.024c-1.635.686-3.535 1.085-5.529 1.085L12.728 24h.008l-.146.001c-1.991 0-3.888-.399-5.617-1.121l.096.036a10.26 10.26 0 0 1-4.101-2.944l-.013-.016a6.3 6.3 0 0 1-1.51-4.069v-.007q.002-.707.161-1.366l-.008.04a2.86 2.86 0 0 1-1.156-1.029l-.007-.011a2.8 2.8 0 0 1-.44-1.512c0-.777.314-1.481.823-1.991a2.7 2.7 0 0 1 1.952-.83h.05h-.003h.039c.799 0 1.519.343 2.019.889l.002.002a13.14 13.14 0 0 1 7.296-2.298h.008l1.646-7.39a.48.48 0 0 1 .211-.296l.002-.001a.46.46 0 0 1 .372-.071l-.003-.001l5.234 1.149c.174-.353.435-.639.757-.838l.009-.005c.319-.2.707-.319 1.123-.319c.585 0 1.116.235 1.501.617c.385.369.624.888.624 1.463v.036v-.002v.03c0 .578-.239 1.1-.624 1.472l-.001.001a2.1 2.1 0 0 1-1.504.624a2.12 2.12 0 0 1-1.497-.617a2.03 2.03 0 0 1-.617-1.461v-.038v.002l-4.738-1.05l-1.475 6.694c2.747.02 5.293.865 7.407 2.3l-.047-.03a2.8 2.8 0 0 1 2.031-.865c.78 0 1.486.317 1.997.83c.509.496.825 1.189.825 1.955v.039V12zM5.929 14.822v.032c0 .576.236 1.097.617 1.471a2.02 2.02 0 0 0 1.463.624h.036h-.002a2.13 2.13 0 0 0 2.128-2.128v-.034c0-.575-.239-1.094-.624-1.462l-.001-.001a2.06 2.06 0 0 0-1.471-.617h-.034h.002a2.13 2.13 0 0 0-2.114 2.113v.001zm11.489 5.036a.513.513 0 0 0 0-.738a.48.48 0 0 0-.341-.142h-.014h.001h-.008a.53.53 0 0 0-.361.142a3.54 3.54 0 0 1-1.694.876l-.023.004a9.26 9.26 0 0 1-4.604-.014l.064.014a3.55 3.55 0 0 1-1.721-.882l.002.002a.53.53 0 0 0-.361-.142h-.019a.48.48 0 0 0-.341.142a.47.47 0 0 0-.16.352v.014c0 .146.061.278.16.372a4.2 4.2 0 0 0 1.65.957l.03.008a8 8 0 0 0 1.695.414l.043.005q.666.064 1.29.064t1.29-.064a8.4 8.4 0 0 0 1.796-.437l-.058.019a4.2 4.2 0 0 0 1.685-.966l-.002.002zm-.042-2.908h.034c.575 0 1.094-.239 1.462-.624l.001-.001c.381-.374.617-.895.617-1.471v-.034v.002a2.13 2.13 0 0 0-2.113-2.114h-.033c-.576 0-1.097.236-1.471.617a2.02 2.02 0 0 0-.624 1.463v.036v-.002a2.13 2.13 0 0 0 2.128 2.128z"
										/>
									</svg>
								</div>
								<span className="text-xl uppercase tracking-tighter font-bold font-mono bg-linear-to-b dark:from-stone-200 dark:via-stone-400 dark:to-stone-700 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(255,255,255,0.1)] from-stone-800 via-stone-600 to-stone-400">
									Reddit
								</span>
							</div>
							<div className="flex items-end w-full gap-2 mt-4 text-gray-400">
								<Link
									className="w-full"
									href="https://reddit.com/r/better_auth"
									rel="noopener noreferrer"
									target="_blank"
								>
									<Button
										variant="outline"
										className="group duration-500 cursor-pointer text-gray-400 flex items-center gap-2 text-md hover:bg-transparent border-l-input/50 border-r-input/50 md:border-r-0 md:border-l-0  border-t border-t-input py-7 w-full hover:text-black dark:hover:text-white"
									>
										<span className="uppercase font-mono group-hover:text-black duration-300 dark:group-hover:text-white">
											Join Subreddit
										</span>
										<ArrowUpRight className="w-6 h-6 opacity-20 ml-2 group-hover:opacity-300 duration-300 text-black group-hover:duration-700 dark:text-white" />
									</Button>
								</Link>
							</div>
						</div>

						<div className="flex pt-5 dark:[box-shadow:0_-20px_80px_-20px_#dfbf9f1f_inset] flex-col items-center justify-between">
							<div className="relative flex flex-col p-3">
								<div className="flex dark:[border:1px_solid_rgba(255,255,255,.1)] dark:[box-shadow:0_-20px_80px_-20px_#8686f01f_inset] border rounded-full items-center justify-center p-1 w-[4.0em] h-[4.0em] mx-auto mb-4">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="4em"
										height="4em"
										viewBox="0 0 19 19"
										className="my-2 mx-auto pl-2 pt-1"
									>
										<path
											fill="currentColor"
											d="M9.294 6.928L14.357 1h-1.2L8.762 6.147L5.25 1H1.2l5.31 7.784L1.2 15h1.2l4.642-5.436L10.751 15h4.05zM7.651 8.852l-.538-.775L2.832 1.91h1.843l3.454 4.977l.538.775l4.491 6.47h-1.843z"
										/>
									</svg>
								</div>
								<span className="text-xl uppercase tracking-tighter font-bold font-mono bg-linear-to-b dark:from-stone-200 dark:via-stone-400 dark:to-stone-700 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(255,255,255,0.1)] from-stone-800 via-stone-600 to-stone-400">
									Twitter
								</span>
							</div>
							<div className="flex items-end w-full gap-2 mt-4 text-gray-400">
								<Link
									className="w-full"
									href="https://x.com/better_auth"
									rel="noopener noreferrer"
									target="_blank"
								>
									<Button
										variant="outline"
										className="group duration-500 cursor-pointer text-gray-400 flex items-center gap-2 text-md hover:bg-transparent border-l-input/50 border-r-input/50 md:border-r-0 md:border-l-0  border-t border-t-input py-7 w-full hover:text-black dark:hover:text-white"
									>
										<span className="uppercase font-mono group-hover:text-black duration-300 dark:group-hover:text-white">
											Follow on 𝕏
										</span>
										<ArrowUpRight className="w-6 h-6 opacity-20 ml-2 group-hover:opacity-300 duration-300 text-black group-hover:duration-700 dark:text-white" />
									</Button>
								</Link>
							</div>
						</div>
					</div>
				</div>

				<div>
					<div className="flex md:flex-row flex-col w-full dark:[box-shadow:0_-20px_80px_-20px_#dfbf9f1f_inset]">
						<div className="w-full text-center border-r pt-5">
							<div className="relative p-3 ">
								<span className="text-[70px] tracking-tighter font-bold font-mono bg-linear-to-b dark:from-stone-200 dark:via-stone-400 dark:to-stone-700 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(255,255,255,0.1)] from-stone-800 via-stone-600 to-stone-400">
									{kFormatter(npmDownloads)}
								</span>
							</div>
							<div className="flex items-end w-full gap-2 mt-4 text-gray-400">
								<Link
									className="w-full"
									href="https://www.npmjs.com/package/better-auth"
									rel="noopener noreferrer"
									target="_blank"
								>
									<Button
										variant="outline"
										className="group duration-500 cursor-pointer text-gray-400 flex items-center gap-2 text-md hover:bg-transparent  border-l-input/50 border-r-input/50 md:border-r-0 md:border-l-0 border-t border-t-input py-7 w-full hover:text-black dark:hover:text-white"
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

						<div className="w-full text-center pt-5">
							<div className="relative p-3">
								<span className="text-[70px] tracking-tighter font-bold font-mono bg-linear-to-b dark:from-stone-200 dark:via-stone-400 dark:to-stone-700 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(255,255,255,0.1)] from-stone-800 via-stone-600 to-stone-400">
									{kFormatter(githubStars)}
								</span>
							</div>
							<div className="flex -p-8 items-end w-full gap-2 mt-4 text-gray-400">
								<Link
									className="w-full"
									href="https://github.com/better-auth/better-auth"
									rel="noopener noreferrer"
									target="_blank"
								>
									<Button
										variant="outline"
										className="group duration-500 cursor-pointer text-gray-400 flex items-center gap-2 text-md hover:bg-transparent  border-l-input/50 border-r-input/50 md:border-r-0 md:border-l-0 border-t border-t-input py-7 w-full hover:text-black dark:hover:text-white"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="24"
											height="24"
											viewBox="0 0 24 24"
										>
											<g fill="none">
												<path d="m12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035q-.016-.005-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093q.019.005.029-.008l.004-.014l-.034-.614q-.005-.018-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z" />
												<path
													fill="currentColor"
													d="M6.315 6.176c-.25-.638-.24-1.367-.129-2.034a6.8 6.8 0 0 1 2.12 1.07c.28.214.647.283.989.18A9.3 9.3 0 0 1 12 5c.961 0 1.874.14 2.703.391c.342.104.709.034.988-.18a6.8 6.8 0 0 1 2.119-1.07c.111.667.12 1.396-.128 2.033c-.15.384-.075.826.208 1.14C18.614 8.117 19 9.04 19 10c0 2.114-1.97 4.187-5.134 4.818c-.792.158-1.101 1.155-.495 1.726c.389.366.629.882.629 1.456v3a1 1 0 0 0 2 0v-3c0-.57-.12-1.112-.334-1.603C18.683 15.35 21 12.993 21 10c0-1.347-.484-2.585-1.287-3.622c.21-.82.191-1.646.111-2.28c-.071-.568-.17-1.312-.57-1.756c-.595-.659-1.58-.271-2.28-.032a9 9 0 0 0-2.125 1.045A11.4 11.4 0 0 0 12 3c-.994 0-1.953.125-2.851.356a9 9 0 0 0-2.125-1.045c-.7-.24-1.686-.628-2.281.031c-.408.452-.493 1.137-.566 1.719l-.005.038c-.08.635-.098 1.462.112 2.283C3.484 7.418 3 8.654 3 10c0 2.992 2.317 5.35 5.334 6.397A4 4 0 0 0 8 17.98l-.168.034c-.717.099-1.176.01-1.488-.122c-.76-.322-1.152-1.133-1.63-1.753c-.298-.385-.732-.866-1.398-1.088a1 1 0 0 0-.632 1.898c.558.186.944 1.142 1.298 1.566c.373.448.869.916 1.58 1.218c.682.29 1.483.393 2.438.276V21a1 1 0 0 0 2 0v-3c0-.574.24-1.09.629-1.456c.607-.572.297-1.568-.495-1.726C6.969 14.187 5 12.114 5 10c0-.958.385-1.881 1.108-2.684c.283-.314.357-.756.207-1.14"
												/>
											</g>
										</svg>

										<span className="uppercase font-mono group-hover:text-black duration-300 dark:group-hover:text-white">
											Stars
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
