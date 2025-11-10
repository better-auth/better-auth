import { useAtom } from "jotai";
import { Moon, PlusIcon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "../ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "../ui/dialog";
import { Label } from "../ui/label";
import { ScrollArea } from "../ui/scroll-area";
import { Separator } from "../ui/separator";
import { Switch } from "../ui/switch";
import CodeTabs from "./code-tabs";
import SignIn from "./sign-in";
import { SignUp } from "./sign-up";
import { socialProviders } from "./social-provider";
import { optionsAtom } from "./store";
import { AuthTabs } from "./tabs";

const frameworks = [
	{
		title: "Next.js",
		description: "The React Framework for Production",
		Icon: () => (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="2em"
				height="2em"
				viewBox="0 0 15 15"
			>
				<path
					fill="currentColor"
					fillRule="evenodd"
					d="M0 7.5a7.5 7.5 0 1 1 11.698 6.216L4.906 4.21A.5.5 0 0 0 4 4.5V12h1V6.06l5.83 8.162A7.5 7.5 0 0 1 0 7.5M10 10V4h1v6z"
					clipRule="evenodd"
				></path>
			</svg>
		),
	},
	{
		title: "Nuxt",
		description: "The Intuitive Vue Framework",
		Icon: () => (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="2em"
				height="2em"
				viewBox="0 0 256 256"
			>
				<g fill="none">
					<rect width="256" height="256" fill="#242938" rx="60"></rect>
					<path
						fill="#00DC82"
						d="M138.787 189.333h68.772c2.184.001 4.33-.569 6.222-1.652a12.4 12.4 0 0 0 4.554-4.515a12.24 12.24 0 0 0-.006-12.332l-46.185-79.286a12.4 12.4 0 0 0-4.553-4.514a12.53 12.53 0 0 0-12.442 0a12.4 12.4 0 0 0-4.553 4.514l-11.809 20.287l-23.09-39.67a12.4 12.4 0 0 0-4.555-4.513a12.54 12.54 0 0 0-12.444 0a12.4 12.4 0 0 0-4.555 4.513L36.67 170.834a12.24 12.24 0 0 0-.005 12.332a12.4 12.4 0 0 0 4.554 4.515a12.5 12.5 0 0 0 6.222 1.652h43.17c17.104 0 29.718-7.446 38.397-21.973l21.072-36.169l11.287-19.356l33.873 58.142h-45.16zm-48.88-19.376l-30.127-.007l45.16-77.518l22.533 38.759l-15.087 25.906c-5.764 9.426-12.312 12.86-22.48 12.86"
					></path>
				</g>
			</svg>
		),
	},
	{
		title: "SvelteKit",
		description: "Web development for the rest of us",
		Icon: () => (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="2em"
				height="2em"
				viewBox="0 0 256 256"
			>
				<g fill="none">
					<rect width="256" height="256" fill="#FF3E00" rx="60"></rect>
					<g clipPath="url(#skillIconsSvelte0)">
						<path
							fill="#fff"
							d="M193.034 61.797c-16.627-23.95-49.729-30.966-73.525-15.865L77.559 72.78c-11.44 7.17-19.372 18.915-21.66 32.186c-1.984 11.136-.306 22.576 5.033 32.492c-3.66 5.491-6.102 11.593-7.17 18c-2.44 13.576.764 27.61 8.696 38.745c16.78 23.95 49.728 30.966 73.525 15.865l41.949-26.695c11.441-7.17 19.373-18.915 21.661-32.187c1.983-11.135.305-22.576-5.034-32.491c3.661-5.492 6.102-11.593 7.17-18c2.593-13.729-.61-27.763-8.695-38.898"
						></path>
						<path
							fill="#FF3E00"
							d="M115.39 196.491a33.25 33.25 0 0 1-35.695-13.271c-4.881-6.712-6.712-15.101-5.34-23.339c.306-1.373.611-2.593.916-3.966l.763-2.44L78.169 155a55.6 55.6 0 0 0 16.475 8.237l1.525.458l-.152 1.525c-.153 2.136.458 4.424 1.678 6.255c2.441 3.508 6.712 5.186 10.83 4.118c.916-.305 1.831-.61 2.594-1.068l41.796-26.695c2.136-1.372 3.509-3.355 3.966-5.796s-.152-5.034-1.525-7.017c-2.441-3.509-6.712-5.034-10.831-3.966c-.915.305-1.83.61-2.593 1.068l-16.017 10.22c-2.593 1.678-5.491 2.898-8.542 3.661a33.25 33.25 0 0 1-35.695-13.271c-4.729-6.712-6.712-15.102-5.186-23.339c1.372-7.932 6.254-15.102 13.118-19.373l41.949-26.695c2.593-1.678 5.492-2.898 8.543-3.814a33.25 33.25 0 0 1 35.695 13.272c4.881 6.712 6.711 15.101 5.339 23.339c-.306 1.373-.611 2.593-1.068 3.966l-.763 2.44l-2.136-1.525a55.6 55.6 0 0 0-16.474-8.237l-1.526-.458l.153-1.525c.153-2.136-.458-4.424-1.678-6.255c-2.441-3.508-6.712-5.034-10.83-3.966c-.916.305-1.831.61-2.594 1.068l-41.796 26.695c-2.136 1.373-3.509 3.356-3.966 5.797s.152 5.034 1.525 7.017c2.441 3.508 6.712 5.033 10.831 3.966c.915-.305 1.83-.611 2.593-1.068l16.017-10.22c2.593-1.678 5.491-2.899 8.542-3.814a33.25 33.25 0 0 1 35.695 13.271c4.881 6.712 6.712 15.102 5.339 23.339c-1.373 7.932-6.254 15.102-13.119 19.373l-41.949 26.695c-2.593 1.678-5.491 2.898-8.542 3.813"
						></path>
					</g>
					<defs>
						<clipPath id="skillIconsSvelte0">
							<path fill="#fff" d="M53 38h149.644v180H53z"></path>
						</clipPath>
					</defs>
				</g>
			</svg>
		),
	},
	{
		title: "SolidStart",
		description: "Fine-grained reactivity goes fullstack",
		Icon: () => (
			<svg
				data-hk="00000010210"
				width="2em"
				height="2em"
				viewBox="0 0 500 500"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
				role="presentation"
			>
				<path
					d="M233.205 430.856L304.742 425.279C304.742 425.279 329.208 421.295 343.569 397.659L293.041 385.443L233.205 430.856Z"
					fill="url(#paint0_linear_1_2)"
				></path>
				<path
					d="M134.278 263.278C113.003 264.341 73.6443 268.059 73.6443 268.059L245.173 392.614L284.265 402.44L343.569 397.925L170.977 273.105C170.977 273.105 157.148 263.278 137.203 263.278C136.139 263.278 135.342 263.278 134.278 263.278Z"
					fill="url(#paint1_linear_1_2)"
				></path>
				<path
					d="M355.536 238.58L429.2 234.065C429.2 234.065 454.464 230.348 468.825 206.977L416.435 193.964L355.536 238.58Z"
					fill="url(#paint2_linear_1_2)"
				></path>
				<path
					d="M251.289 68.6128C229.217 69.4095 188.795 72.5964 188.795 72.5964L367.503 200.072L407.926 210.429L469.09 206.712L289.318 78.9702C289.318 78.9702 274.426 68.6128 253.417 68.6128C252.885 68.6128 252.087 68.6128 251.289 68.6128Z"
					fill="url(#paint3_linear_1_2)"
				></path>
				<path
					d="M31.0946 295.679C30.8287 295.945 30.8287 296.21 30.8287 296.475L77.8993 330.469L202.623 420.764C228.95 439.62 264.586 431.653 282.67 402.44L187.465 333.921L110.077 277.62C100.504 270.715 89.8663 267.528 79.2289 267.528C60.6134 267.528 42.2639 277.354 31.0946 295.679Z"
					fill="url(#paint4_linear_1_2)"
				></path>
				<path
					d="M147.043 99.9505C147.043 100.216 146.776 100.482 146.511 100.747L195.442 135.538L244.374 170.062L325.751 227.957C353.142 247.345 389.841 239.642 407.925 210.695L358.461 175.374L308.997 140.318L228.153 82.6881C218.047 75.5177 206.611 72.0652 195.442 72.0652C176.561 72.3308 158.212 81.8915 147.043 99.9505Z"
					fill="url(#paint5_linear_1_2)"
				></path>
				<path
					d="M112.471 139.255L175.497 208.305C178.423 212.289 181.614 216.006 185.337 219.193L308.199 354.105L369.364 350.387C387.448 321.439 380.002 282.135 352.611 262.748L271.234 204.852L222.568 170.328L173.636 135.538L112.471 139.255Z"
					fill="url(#paint6_linear_1_2)"
				></path>
				<path
					d="M111.939 140.052C94.1213 168.734 101.567 207.509 128.427 226.629L209.005 283.994L258.735 319.049L308.199 354.105C326.283 325.158 318.836 285.852 291.445 266.465L112.471 139.255C112.471 139.521 112.204 139.787 111.939 140.052Z"
					fill="url(#paint7_linear_1_2)"
				></path>
				<defs>
					<linearGradient
						id="paint0_linear_1_2"
						x1="359.728"
						y1="56.8062"
						x2="265.623"
						y2="521.28"
						gradientUnits="userSpaceOnUse"
					>
						<stop stopColor="#1593F5"></stop>
						<stop offset="1" stopColor="#0084CE"></stop>
					</linearGradient>
					<linearGradient
						id="paint1_linear_1_2"
						x1="350.496"
						y1="559.872"
						x2="-44.0802"
						y2="-73.2062"
						gradientUnits="userSpaceOnUse"
					>
						<stop stopColor="#1593F5"></stop>
						<stop offset="1" stopColor="#0084CE"></stop>
					</linearGradient>
					<linearGradient
						id="paint2_linear_1_2"
						x1="610.25"
						y1="570.526"
						x2="372.635"
						y2="144.034"
						gradientUnits="userSpaceOnUse"
					>
						<stop stopColor="white"></stop>
						<stop offset="1" stopColor="#15ABFF"></stop>
					</linearGradient>
					<linearGradient
						id="paint3_linear_1_2"
						x1="188.808"
						y1="-180.608"
						x2="390.515"
						y2="281.703"
						gradientUnits="userSpaceOnUse"
					>
						<stop stopColor="white"></stop>
						<stop offset="1" stopColor="#79CFFF"></stop>
					</linearGradient>
					<linearGradient
						id="paint4_linear_1_2"
						x1="415.84"
						y1="-4.74684"
						x2="95.1922"
						y2="439.83"
						gradientUnits="userSpaceOnUse"
					>
						<stop stopColor="#0057E5"></stop>
						<stop offset="1" stopColor="#0084CE"></stop>
					</linearGradient>
					<linearGradient
						id="paint5_linear_1_2"
						x1="343.141"
						y1="-21.5427"
						x2="242.301"
						y2="256.708"
						gradientUnits="userSpaceOnUse"
					>
						<stop stopColor="white"></stop>
						<stop offset="1" stopColor="#15ABFF"></stop>
					</linearGradient>
					<linearGradient
						id="paint6_linear_1_2"
						x1="469.095"
						y1="533.421"
						x2="-37.6939"
						y2="-135.731"
						gradientUnits="userSpaceOnUse"
					>
						<stop stopColor="white"></stop>
						<stop offset="1" stopColor="#79CFFF"></stop>
					</linearGradient>
					<linearGradient
						id="paint7_linear_1_2"
						x1="380.676"
						y1="-89.0869"
						x2="120.669"
						y2="424.902"
						gradientUnits="userSpaceOnUse"
					>
						<stop stopColor="white"></stop>
						<stop offset="1" stopColor="#79CFFF"></stop>
					</linearGradient>
				</defs>
			</svg>
		),
	},
];

export function Builder() {
	const [currentStep, setCurrentStep] = useState(0);

	const [options, setOptions] = useAtom(optionsAtom);
	const { setTheme, resolvedTheme } = useTheme();
	return (
		<Dialog>
			<DialogTrigger asChild>
				<button className="bg-stone-950 no-underline group cursor-pointer relative  p-px text-xs font-semibold leading-6  text-white md:inline-block hidden">
					<span className="absolute inset-0 overflow-hidden rounded-sm">
						<span className="absolute inset-0 rounded-sm bg-[image:radial-gradient(75%_100%_at_50%_0%,rgba(56,189,248,0.6)_0%,rgba(56,189,248,0)_75%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100"></span>
					</span>
					<div className="relative flex space-x-2 items-center z-10 rounded-none bg-zinc-950 py-2 px-4 ring-1 ring-white/10 ">
						<PlusIcon size={14} />
						<span>Create Sign in Box</span>
					</div>
					<span className="absolute -bottom-0 left-[1.125rem] h-px w-[calc(100%-2.25rem)] bg-gradient-to-r from-emerald-400/0 via-stone-800/90 to-emerald-400/0 transition-opacity duration-500 group-hover:opacity-40"></span>
				</button>
			</DialogTrigger>
			<DialogContent className="max-w-7xl h-5/6 overflow-clip !rounded-none">
				<DialogHeader>
					<DialogTitle>Create Sign in Box</DialogTitle>
					<DialogDescription>
						Configure the sign in box to your liking and copy the code to your
						application.
					</DialogDescription>
				</DialogHeader>

				<div className="overflow-y-scroll no-scrollbar flex gap-4 md:gap-12 flex-col md:flex-row items-center md:items-start">
					<div className={cn("w-4/12")}>
						<div className="overflow-scroll h-[580px] relative no-scrollbar">
							{options.signUp ? (
								<AuthTabs
									tabs={[
										{
											title: "Sign In",
											value: "sign-in",
											content: <SignIn />,
										},
										{
											title: "Sign Up",
											value: "sign-up",
											content: <SignUp />,
										},
									]}
								/>
							) : (
								<SignIn />
							)}
						</div>
					</div>
					<ScrollArea className="w-[45%] flex-grow no-scrollbar">
						<div className="h-[580px]">
							{currentStep === 0 ? (
								<Card className="rounded-none flex-grow h-full">
									<CardHeader className="flex flex-row justify-between">
										<CardTitle>Configuration</CardTitle>
										<div
											className="cursor-pointer"
											onClick={() => {
												if (resolvedTheme === "dark") {
													setTheme("light");
												} else {
													setTheme("dark");
												}
											}}
										>
											{resolvedTheme === "dark" ? (
												<Moon onClick={() => setTheme("light")} size={18} />
											) : (
												<Sun onClick={() => setTheme("dark")} size={18} />
											)}
										</div>
									</CardHeader>
									<CardContent className="max-h-[400px] overflow-scroll">
										<div className="flex flex-col gap-2">
											<div>
												<Label>Email & Password</Label>
											</div>
											<Separator />
											<div className="flex items-center justify-between">
												<div className="flex items-center">
													<Label
														className="cursor-pointer"
														htmlFor="email-provider-email"
													>
														Enabled
													</Label>
												</div>
												<Switch
													id="email-provider-email"
													checked={options.email}
													onCheckedChange={(checked) => {
														setOptions((prev) => ({
															...prev,
															email: checked,
															magicLink: checked ? false : prev.magicLink,
															signUp: checked,
														}));
													}}
												/>
											</div>
											<div className="flex items-center justify-between">
												<div className="flex items-center gap-2">
													<Label
														className="cursor-pointer"
														htmlFor="email-provider-remember-me"
													>
														Remember Me
													</Label>
												</div>
												<Switch
													id="email-provider-remember-me"
													checked={options.rememberMe}
													onCheckedChange={(checked) => {
														setOptions((prev) => ({
															...prev,
															rememberMe: checked,
														}));
													}}
												/>
											</div>
											<div className="flex items-center justify-between">
												<div className="flex items-center gap-2">
													<Label
														className="cursor-pointer"
														htmlFor="email-provider-forget-password"
													>
														Forget Password
													</Label>
												</div>
												<Switch
													id="email-provider-forget-password"
													checked={options.requestPasswordReset}
													onCheckedChange={(checked) => {
														setOptions((prev) => ({
															...prev,
															requestPasswordReset: checked,
														}));
													}}
												/>
											</div>
										</div>
										<div className="flex flex-col gap-2 mt-4">
											<div>
												<Label>Social Providers</Label>
											</div>
											<Separator />
											{Object.entries(socialProviders).map(
												([provider, { Icon }]) => (
													<div
														className="flex items-center justify-between"
														key={provider}
													>
														<div className="flex items-center gap-2">
															<Icon />
															<Label
																className="cursor-pointer"
																htmlFor={"social-provider".concat(
																	"-",
																	provider,
																)}
															>
																{provider.charAt(0).toUpperCase() +
																	provider.slice(1)}
															</Label>
														</div>
														<Switch
															id={"social-provider".concat("-", provider)}
															checked={options.socialProviders.includes(
																provider,
															)}
															onCheckedChange={(checked) => {
																setOptions((prev) => ({
																	...prev,
																	socialProviders: checked
																		? [...prev.socialProviders, provider]
																		: prev.socialProviders.filter(
																				(p) => p !== provider,
																			),
																}));
															}}
														/>
													</div>
												),
											)}
										</div>
										<div className="flex flex-col gap-2 mt-4">
											<div>
												<Label>Plugins</Label>
											</div>
											<Separator />
											<div className="flex items-center justify-between">
												<div className="flex items-center gap-2">
													<svg
														xmlns="http://www.w3.org/2000/svg"
														width="1em"
														height="1em"
														viewBox="0 0 24 24"
													>
														<path
															fill="currentColor"
															d="M5 20q-.825 0-1.412-.587T3 18v-.8q0-.85.438-1.562T4.6 14.55q1.55-.775 3.15-1.162T11 13q.35 0 .7.013t.7.062q.275.025.437.213t.163.462q.05 1.175.575 2.213t1.4 1.762q.175.125.275.313t.1.412V19q0 .425-.288.713T14.35 20zm6-8q-1.65 0-2.825-1.175T7 8t1.175-2.825T11 4t2.825 1.175T15 8t-1.175 2.825T11 12m7.5 2q.425 0 .713-.288T19.5 13t-.288-.712T18.5 12t-.712.288T17.5 13t.288.713t.712.287m.15 8.65l-1-1q-.05-.05-.15-.35v-4.45q-1.1-.325-1.8-1.237T15 13.5q0-1.45 1.025-2.475T18.5 10t2.475 1.025T22 13.5q0 1.125-.638 2t-1.612 1.25l.9.9q.15.15.15.35t-.15.35l-.8.8q-.15.15-.15.35t.15.35l.8.8q.15.15.15.35t-.15.35l-1.3 1.3q-.15.15-.35.15t-.35-.15"
														></path>
													</svg>
													<Label
														className="cursor-pointer"
														htmlFor="plugin-passkey"
													>
														Passkey
													</Label>
												</div>
												<Switch
													id="plugin-passkey"
													checked={options.passkey}
													onCheckedChange={(checked) => {
														setOptions((prev) => ({
															...prev,
															passkey: checked,
														}));
													}}
												/>
											</div>

											<div className="flex items-center justify-between">
												<div className="flex items-center gap-2">
													<svg
														xmlns="http://www.w3.org/2000/svg"
														width="1em"
														height="1em"
														viewBox="0 0 24 24"
													>
														<g fill="none">
															<path d="m12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035q-.016-.005-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093q.019.005.029-.008l.004-.014l-.034-.614q-.005-.018-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z"></path>
															<path
																fill="currentColor"
																d="M17.5 3a4.5 4.5 0 0 1 4.495 4.288L22 7.5V15a2 2 0 0 1-1.85 1.995L20 17h-3v3a1 1 0 0 1-1.993.117L15 20v-3H4a2 2 0 0 1-1.995-1.85L2 15V7.5a4.5 4.5 0 0 1 4.288-4.495L6.5 3zm-11 2A2.5 2.5 0 0 0 4 7.5V15h5V7.5A2.5 2.5 0 0 0 6.5 5M7 8a1 1 0 0 1 .117 1.993L7 10H6a1 1 0 0 1-.117-1.993L6 8z"
															></path>
														</g>
													</svg>
													<Label
														className="cursor-pointer"
														htmlFor="plugin-otp-magic-link"
													>
														Magic Link
													</Label>
												</div>
												<Switch
													id="plugin-otp-magic-link"
													checked={options.magicLink}
													onCheckedChange={(checked) => {
														setOptions((prev) => ({
															...prev,
															magicLink: checked,
															email: checked ? false : prev.email,
															signUp: checked ? false : prev.signUp,
														}));
													}}
												/>
											</div>
										</div>
										<div className="mt-4">
											<Separator />
											<div className="flex items-center justify-between mt-2">
												<Label
													className="cursor-pointer"
													htmlFor="label-powered-by"
												>
													Show Built with label
												</Label>
												<Switch
													id="label-powered-by"
													checked={options.label}
													onCheckedChange={(checked) => {
														setOptions((prev) => ({
															...prev,
															label: checked,
														}));
													}}
												/>
											</div>
										</div>
									</CardContent>
									<CardFooter>
										<button
											className="bg-stone-950 no-underline group cursor-pointer relative shadow-2xl shadow-zinc-900 rounded-sm p-px text-xs font-semibold leading-6  text-white inline-block w-full"
											onClick={() => {
												setCurrentStep(currentStep + 1);
											}}
										>
											<span className="absolute inset-0 overflow-hidden rounded-sm">
												<span className="absolute inset-0 rounded-sm bg-[image:radial-gradient(75%_100%_at_50%_0%,rgba(56,189,248,0.6)_0%,rgba(56,189,248,0)_75%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100"></span>
											</span>
											<div className="relative flex space-x-2 items-center z-10 rounded-none bg-zinc-950 py-2 px-4 ring-1 ring-white/10 justify-center">
												<span>Continue</span>
											</div>
											<span className="absolute -bottom-0 left-[1.125rem] h-px w-[calc(100%-2.25rem)] bg-gradient-to-r from-emerald-400/0 via-stone-800/90 to-emerald-400/0 transition-opacity duration-500 group-hover:opacity-40"></span>
										</button>
									</CardFooter>
								</Card>
							) : currentStep === 1 ? (
								<Card className="rounded-none flex-grow  h-full">
									<CardHeader>
										<CardTitle>Choose Framework</CardTitle>
										<p
											className="text-blue-400 hover:underline mt-1 text-sm cursor-pointer"
											onClick={() => {
												setCurrentStep(0);
											}}
										>
											Go Back
										</p>
									</CardHeader>
									<CardContent className="flex items-start gap-2 flex-wrap justify-between">
										{frameworks.map((fm) => (
											<div
												onClick={() => {
													if (fm.title === "Next.js") {
														setCurrentStep(currentStep + 1);
													}
												}}
												className={cn(
													"flex flex-col items-center gap-4 border p-6 rounded-md w-5/12 flex-grow h-44 relative",
													fm.title !== "Next.js"
														? "opacity-55"
														: "hover:ring-1 transition-all ring-border hover:bg-background duration-200 ease-in-out cursor-pointer",
												)}
												key={fm.title}
											>
												{fm.title !== "Next.js" && (
													<span className="absolute top-4 right-4 text-xs">
														Coming Soon
													</span>
												)}
												<fm.Icon />
												<Label className="text-2xl">{fm.title}</Label>
												<p className="text-sm">{fm.description}</p>
											</div>
										))}
									</CardContent>
								</Card>
							) : (
								<Card className="rounded-none w-full overflow-y-hidden h-full overflow-auto">
									<CardHeader>
										<div className="flex flex-col -mb-2 items-start">
											<CardTitle>Code</CardTitle>
										</div>
									</CardHeader>
									<CardContent>
										<div className="flex gap-2 items-baseline">
											<p>
												Copy the code below and paste it in your application to
												get started.
											</p>
											<p
												className="text-blue-400 hover:underline mt-1 text-sm cursor-pointer"
												onClick={() => {
													setCurrentStep(0);
												}}
											>
												Go Back
											</p>
										</div>
										<div>
											<CodeTabs />
										</div>
									</CardContent>
								</Card>
							)}
						</div>
					</ScrollArea>
				</div>
			</DialogContent>
		</Dialog>
	);
}
