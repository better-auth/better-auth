import { ChevronLeft, Copy, Mail, PlusIcon } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "../ui/dialog";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "../ui/card";
import SignIn from "./sign-in";
import { SignUp } from "./sign-up";
import { AuthTabs } from "./tabs";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { Separator } from "../ui/separator";
import { useState } from "react";
import CodeTabs from "./code-tabs";
import { cn } from "@/lib/utils";

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
		title: "Svelte Kit",
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
		title: "Solid Start",
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
						<stop stop-color="#1593F5"></stop>
						<stop offset="1" stop-color="#0084CE"></stop>
					</linearGradient>
					<linearGradient
						id="paint1_linear_1_2"
						x1="350.496"
						y1="559.872"
						x2="-44.0802"
						y2="-73.2062"
						gradientUnits="userSpaceOnUse"
					>
						<stop stop-color="#1593F5"></stop>
						<stop offset="1" stop-color="#0084CE"></stop>
					</linearGradient>
					<linearGradient
						id="paint2_linear_1_2"
						x1="610.25"
						y1="570.526"
						x2="372.635"
						y2="144.034"
						gradientUnits="userSpaceOnUse"
					>
						<stop stop-color="white"></stop>
						<stop offset="1" stop-color="#15ABFF"></stop>
					</linearGradient>
					<linearGradient
						id="paint3_linear_1_2"
						x1="188.808"
						y1="-180.608"
						x2="390.515"
						y2="281.703"
						gradientUnits="userSpaceOnUse"
					>
						<stop stop-color="white"></stop>
						<stop offset="1" stop-color="#79CFFF"></stop>
					</linearGradient>
					<linearGradient
						id="paint4_linear_1_2"
						x1="415.84"
						y1="-4.74684"
						x2="95.1922"
						y2="439.83"
						gradientUnits="userSpaceOnUse"
					>
						<stop stop-color="#0057E5"></stop>
						<stop offset="1" stop-color="#0084CE"></stop>
					</linearGradient>
					<linearGradient
						id="paint5_linear_1_2"
						x1="343.141"
						y1="-21.5427"
						x2="242.301"
						y2="256.708"
						gradientUnits="userSpaceOnUse"
					>
						<stop stop-color="white"></stop>
						<stop offset="1" stop-color="#15ABFF"></stop>
					</linearGradient>
					<linearGradient
						id="paint6_linear_1_2"
						x1="469.095"
						y1="533.421"
						x2="-37.6939"
						y2="-135.731"
						gradientUnits="userSpaceOnUse"
					>
						<stop stop-color="white"></stop>
						<stop offset="1" stop-color="#79CFFF"></stop>
					</linearGradient>
					<linearGradient
						id="paint7_linear_1_2"
						x1="380.676"
						y1="-89.0869"
						x2="120.669"
						y2="424.902"
						gradientUnits="userSpaceOnUse"
					>
						<stop stop-color="white"></stop>
						<stop offset="1" stop-color="#79CFFF"></stop>
					</linearGradient>
				</defs>
			</svg>
		),
	},
];

export function Builder() {
	const socialProviders = {
		apple: {
			Icon: () => (
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="1em"
					height="1em"
					viewBox="0 0 24 24"
				>
					<path
						fill="currentColor"
						d="M17.05 20.28c-.98.95-2.05.8-3.08.35c-1.09-.46-2.09-.48-3.24 0c-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8c1.18-.24 2.31-.93 3.57-.84c1.51.12 2.65.72 3.4 1.8c-3.12 1.87-2.38 5.98.48 7.13c-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25c.29 2.58-2.34 4.5-3.74 4.25"
					></path>
				</svg>
			),
		},
		dropbox: {
			Icon: () => (
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="1em"
					height="1em"
					viewBox="0 0 24 24"
				>
					<g fill="none" fillRule="evenodd">
						<path d="m12.594 23.258l-.012.002l-.071.035l-.02.004l-.014-.004l-.071-.036q-.016-.004-.024.006l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.016-.018m.264-.113l-.014.002l-.184.093l-.01.01l-.003.011l.018.43l.005.012l.008.008l.201.092q.019.005.029-.008l.004-.014l-.034-.614q-.005-.019-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.003-.011l.018-.43l-.003-.012l-.01-.01z"></path>
						<path
							fill="currentColor"
							d="m11.998 13.503l2.879 1.662c.426.246.923.34 1.365.34c.443 0 .94-.094 1.367-.34l.587-.34V17a1 1 0 0 1-.5.866l-5.196 3a1 1 0 0 1-1 0l-5.196-3a1 1 0 0 1-.5-.866v-2.172l.583.337c.426.246.923.34 1.366.34c.442 0 .939-.094 1.366-.34zM6.887 3.5c.434-.251 1.115-.274 1.594-.068l.138.068l3.379 1.95l3.379-1.95c.434-.251 1.115-.274 1.594-.068l.138.068l4.242 2.45c.447.257.476.664.09.942l-.09.057l-3.378 1.95l3.378 1.95c.447.258.476.665.09.943l-.09.057l-4.242 2.45c-.435.25-1.116.273-1.595.068l-.137-.068l-3.38-1.951l-3.378 1.95c-.435.252-1.116.274-1.595.07l-.137-.07l-4.243-2.449c-.447-.257-.476-.665-.09-.942l.09-.058L6.022 8.9L2.644 6.95c-.447-.257-.476-.665-.09-.942l.09-.058zm5.546 2.702c-.205-.119-.52-.136-.755-.051l-.111.05l-4.243 2.45c-.212.122-.236.313-.07.45l.07.05l4.243 2.449c.205.118.52.135.755.05l.111-.05l4.243-2.45c.212-.122.236-.312.07-.45l-.07-.05z"
						></path>
					</g>
				</svg>
			),
		},
		discord: {
			Icon: () => (
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="1em"
					height="1em"
					viewBox="0 0 24 24"
				>
					<path
						fill="currentColor"
						d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.1.1 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.1 16.1 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09c-.01-.02-.04-.03-.07-.03c-1.5.26-2.93.71-4.27 1.33c-.01 0-.02.01-.03.02c-2.72 4.07-3.47 8.03-3.1 11.95c0 .02.01.04.03.05c1.8 1.32 3.53 2.12 5.24 2.65c.03.01.06 0 .07-.02c.4-.55.76-1.13 1.07-1.74c.02-.04 0-.08-.04-.09c-.57-.22-1.11-.48-1.64-.78c-.04-.02-.04-.08-.01-.11c.11-.08.22-.17.33-.25c.02-.02.05-.02.07-.01c3.44 1.57 7.15 1.57 10.55 0c.02-.01.05-.01.07.01c.11.09.22.17.33.26c.04.03.04.09-.01.11c-.52.31-1.07.56-1.64.78c-.04.01-.05.06-.04.09c.32.61.68 1.19 1.07 1.74c.03.01.06.02.09.01c1.72-.53 3.45-1.33 5.25-2.65c.02-.01.03-.03.03-.05c.44-4.53-.73-8.46-3.1-11.95c-.01-.01-.02-.02-.04-.02M8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12c0 1.17-.84 2.12-1.89 2.12m6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12c0 1.17-.83 2.12-1.89 2.12"
					></path>
				</svg>
			),
		},
		facebook: {
			Icon: () => (
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="1em"
					height="1em"
					viewBox="0 0 24 24"
				>
					<path
						d="M20 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h8.615v-6.96h-2.338v-2.725h2.338v-2c0-2.325 1.42-3.592 3.5-3.592c.699-.002 1.399.034 2.095.107v2.42h-1.435c-1.128 0-1.348.538-1.348 1.325v1.735h2.697l-.35 2.725h-2.348V21H20a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1z"
						fill="currentColor"
					></path>
				</svg>
			),
		},
		github: {
			Icon: () => (
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="1em"
					height="1em"
					viewBox="0 0 24 24"
				>
					<path
						fill="currentColor"
						d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2"
					></path>
				</svg>
			),
		},
		gitlab: {
			Icon: () => (
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="1em"
					height="1em"
					viewBox="0 0 24 24"
				>
					<path
						fill="currentColor"
						d="m22.749 9.769l-.031-.08l-3.027-7.9a.79.79 0 0 0-.782-.495a.8.8 0 0 0-.456.17a.8.8 0 0 0-.268.408L16.14 8.125H7.865L5.822 1.872a.8.8 0 0 0-.269-.409a.81.81 0 0 0-.926-.05c-.14.09-.25.22-.312.376L1.283 9.684l-.03.08a5.62 5.62 0 0 0 1.864 6.496l.01.008l.028.02l4.61 3.453l2.282 1.726l1.39 1.049a.935.935 0 0 0 1.13 0l1.389-1.05l2.281-1.726l4.639-3.473l.011-.01A5.62 5.62 0 0 0 22.75 9.77"
					></path>
				</svg>
			),
		},
		google: {
			Icon: () => (
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="1em"
					height="1em"
					viewBox="0 0 24 24"
				>
					<path
						fill="currentColor"
						d="M11.99 13.9v-3.72h9.36c.14.63.25 1.22.25 2.05c0 5.71-3.83 9.77-9.6 9.77c-5.52 0-10-4.48-10-10S6.48 2 12 2c2.7 0 4.96.99 6.69 2.61l-2.84 2.76c-.72-.68-1.98-1.48-3.85-1.48c-3.31 0-6.01 2.75-6.01 6.12s2.7 6.12 6.01 6.12c3.83 0 5.24-2.65 5.5-4.22h-5.51z"
					></path>
				</svg>
			),
		},
		linkedin: {
			Icon: () => (
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="1em"
					height="1em"
					viewBox="0 0 24 24"
				>
					<path
						fill="currentColor"
						d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93zM6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37z"
					></path>
				</svg>
			),
		},
		microsoft: {
			Icon: () => (
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="1em"
					height="1em"
					viewBox="0 0 24 24"
				>
					<path
						fill="currentColor"
						d="M2 3h9v9H2zm9 19H2v-9h9zM21 3v9h-9V3zm0 19h-9v-9h9z"
					></path>
				</svg>
			),
		},
		twitch: {
			Icon: () => (
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="1em"
					height="1em"
					viewBox="0 0 24 24"
				>
					<path
						fill="currentColor"
						d="M11.64 5.93h1.43v4.28h-1.43m3.93-4.28H17v4.28h-1.43M7 2L3.43 5.57v12.86h4.28V22l3.58-3.57h2.85L20.57 12V2m-1.43 9.29l-2.85 2.85h-2.86l-2.5 2.5v-2.5H7.71V3.43h11.43Z"
					></path>
				</svg>
			),
		},
		spotify: {
			Icon: () => (
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="1em"
					height="1em"
					viewBox="0 0 24 24"
				>
					<path
						fill="currentColor"
						d="M12.001 2c-5.5 0-10 4.5-10 10s4.5 10 10 10s10-4.5 10-10s-4.45-10-10-10m3.75 14.65c-2.35-1.45-5.3-1.75-8.8-.95c-.35.1-.65-.15-.75-.45c-.1-.35.15-.65.45-.75c3.8-.85 7.1-.5 9.7 1.1c.35.15.4.55.25.85c-.2.3-.55.4-.85.2m1-2.7c-2.7-1.65-6.8-2.15-9.95-1.15c-.4.1-.85-.1-.95-.5s.1-.85.5-.95c3.65-1.1 8.15-.55 11.25 1.35c.3.15.45.65.2 1s-.7.5-1.05.25M6.3 9.75c-.5.15-1-.15-1.15-.6c-.15-.5.15-1 .6-1.15c3.55-1.05 9.4-.85 13.1 1.35c.45.25.6.85.35 1.3c-.25.35-.85.5-1.3.25C14.7 9 9.35 8.8 6.3 9.75"
					></path>
				</svg>
			),
		},
		x: {
			Icon: () => (
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="0.88em"
					height="1em"
					viewBox="0 0 448 512"
				>
					<path
						fill="currentColor"
						d="M64 32C28.7 32 0 60.7 0 96v320c0 35.3 28.7 64 64 64h320c35.3 0 64-28.7 64-64V96c0-35.3-28.7-64-64-64zm297.1 84L257.3 234.6L379.4 396h-95.6L209 298.1L123.3 396H75.8l111-126.9L69.7 116h98l67.7 89.5l78.2-89.5zm-37.8 251.6L153.4 142.9h-28.3l171.8 224.7h26.3z"
					></path>
				</svg>
			),
		},
	};

	const [currentStep, setCurrentStep] = useState(0);
	return (
		<Dialog>
			<DialogTrigger asChild>
				<button className="bg-stone-950 no-underline group cursor-pointer relative shadow-2xl shadow-zinc-900 rounded-sm p-px text-xs font-semibold leading-6  text-white inline-block">
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
			<DialogContent className="max-w-7xl h-5/6 overflow-scroll">
				<DialogHeader>
					<DialogTitle>Create Sign in Box</DialogTitle>
					<DialogDescription>
						Configure the sign in box to your liking and copy the code to your
						application
					</DialogDescription>
				</DialogHeader>

				<div className="flex gap-4 md:gap-12 flex-col md:flex-row items-center md:items-start">
					<div className="w-4/12">
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
					</div>

					<div className="flex-grow w-5/12 h-[530px]">
						{currentStep === 0 ? (
							<Card className="rounded-none flex-grow mt-10 h-full">
								<CardHeader>
									<CardTitle>Configuration</CardTitle>
								</CardHeader>
								<CardContent className="max-h-[400px] overflow-scroll">
									<div className="flex flex-col gap-2">
										<div>
											<Label>Email & Password</Label>
										</div>
										<Separator />
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-2">
												<Label>Enabled</Label>
											</div>
											<Switch />
										</div>
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-2">
												<Label>Remember Me</Label>
											</div>
											<Switch />
										</div>
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-2">
												<Label>Forget Password</Label>
											</div>
											<Switch />
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
														<Label>
															{provider.charAt(0).toUpperCase() +
																provider.slice(1)}
														</Label>
													</div>
													<Switch />
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
												<Label>Passkey</Label>
											</div>
											<Switch />
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
												<Label>Magic Link</Label>
											</div>
											<Switch />
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
							<Card className="rounded-none flex-grow mt-10 h-full">
								<CardHeader>
									<CardTitle>Choose Framework</CardTitle>
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
								<CardFooter className="flex items-center justify-between">
									<button
										onClick={() => {
											setCurrentStep(0);
										}}
									>
										<div className="relative flex space-x-2 items-center z-10  bg-zinc-900 py-2 px-4 border border-r-0">
											<ChevronLeft size={16} />
											<span>Back</span>
										</div>
									</button>
									<button
										className="bg-stone-950 no-underline group cursor-pointer relative shadow-2xl shadow-zinc-900 p-px text-xs font-semibold leading-6  text-white inline-block w-full"
										onClick={() => {
											setCurrentStep(currentStep + 1);
										}}
									>
										<span className="absolute inset-0 overflow-hidden">
											<span className="absolute inset-0 rounded-sm bg-[image:radial-gradient(75%_100%_at_50%_0%,rgba(56,189,248,0.6)_0%,rgba(56,189,248,0)_75%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100"></span>
										</span>
										<div className="relative flex space-x-2 items-center z-10 rounded-none bg-zinc-950 py-2 px-4 ring-1 ring-white/10 justify-center">
											<span>Continue</span>
										</div>
										<span className="absolute -bottom-0 left-[1.125rem] h-px w-[calc(100%-2.25rem)] bg-gradient-to-r from-emerald-400/0 via-stone-800/90 to-emerald-400/0 transition-opacity duration-500 group-hover:opacity-40"></span>
									</button>
								</CardFooter>
							</Card>
						) : (
							<Card className="rounded-none flex-grow mt-10 h-full overflow-scroll">
								<CardHeader>
									<CardTitle>Code</CardTitle>
								</CardHeader>
								<CardContent>
									<div>
										<p>
											To use the sign in box in your application, copy the code
											below and paste it in your application.
										</p>
									</div>
									<div>
										<CodeTabs />
									</div>
								</CardContent>
							</Card>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
