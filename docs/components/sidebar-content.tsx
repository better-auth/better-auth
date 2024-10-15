import {
	Key,
	LucideAArrowDown,
	LucideIcon,
	Mailbox,
	Phone,
	ScanFace,
	ShieldCheck,
	UserCircle,
	Users2,
	UserSquare2,
} from "lucide-react";
import { ReactNode, SVGProps } from "react";
import { Icons } from "./icons";

interface Content {
	title: string;
	href?: string;
	Icon: ((props?: SVGProps<any>) => ReactNode) | LucideIcon;
	list: {
		title: string;
		href: string;
		icon: ((props?: SVGProps<any>) => ReactNode) | LucideIcon;
		group?: boolean;
	}[];
}

export const contents: Content[] = [
	{
		title: "Get Started",
		Icon: () => (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="1.4em"
				height="1.4em"
				viewBox="0 0 24 24"
			>
				<path
					fill="currentColor"
					d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2m-1 14H9V8h2zm1 0V8l5 4z"
				/>
			</svg>
		),
		list: [
			{
				title: "Introduction",
				href: "/docs/introduction",
				icon: () => (
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="1.2em"
						height="1.2em"
						viewBox="0 0 256 256"
					>
						<path
							fill="currentColor"
							d="M232 48h-64a32 32 0 0 0-32 32v87.73a8.17 8.17 0 0 1-7.47 8.25a8 8 0 0 1-8.53-8V80a32 32 0 0 0-32-32H24a8 8 0 0 0-8 8v144a8 8 0 0 0 8 8h72a24 24 0 0 1 24 23.94a7.9 7.9 0 0 0 5.12 7.55A8 8 0 0 0 136 232a24 24 0 0 1 24-24h72a8 8 0 0 0 8-8V56a8 8 0 0 0-8-8m-24 120h-39.73a8.17 8.17 0 0 1-8.25-7.47a8 8 0 0 1 8-8.53h39.73a8.17 8.17 0 0 1 8.25 7.47a8 8 0 0 1-8 8.53m0-32h-39.73a8.17 8.17 0 0 1-8.25-7.47a8 8 0 0 1 8-8.53h39.73a8.17 8.17 0 0 1 8.25 7.47a8 8 0 0 1-8 8.53m0-32h-39.73a8.17 8.17 0 0 1-8.27-7.47a8 8 0 0 1 8-8.53h39.73a8.17 8.17 0 0 1 8.27 7.47a8 8 0 0 1-8 8.53"
						/>
					</svg>
				),
			},
			{
				title: "Installation",
				href: "/docs/installation",
				icon: () => (
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="1.2em"
						height="1.2em"
						viewBox="0 0 24 24"
					>
						<path
							fill="currentColor"
							fillRule="evenodd"
							d="M2 12c0-4.714 0-7.071 1.464-8.536C4.93 2 7.286 2 12 2c4.714 0 7.071 0 8.535 1.464C22 4.93 22 7.286 22 12c0 4.714 0 7.071-1.465 8.535C19.072 22 16.714 22 12 22s-7.071 0-8.536-1.465C2 19.072 2 16.714 2 12m10-5.75a.75.75 0 0 1 .75.75v5.19l1.72-1.72a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06l1.72 1.72V7a.75.75 0 0 1 .75-.75m-4 10a.75.75 0 0 0 0 1.5h8a.75.75 0 0 0 0-1.5z"
							clipRule="evenodd"
						/>
					</svg>
				),
			},
			{
				title: "Basic Usage",
				href: "/docs/basic-usage",
				icon: () => (
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="1.2em"
						height="1.2em"
						viewBox="0 0 16 16"
					>
						<path
							fill="currentColor"
							d="M2 3.75C2 2.784 2.784 2 3.75 2h8.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25zM6 6.5a.5.5 0 0 0-1 0v4a.5.5 0 0 0 1 0zM8 8a.5.5 0 0 0-.5.5v2a.5.5 0 0 0 1 0v-2A.5.5 0 0 0 8 8m3-2.5a.5.5 0 0 0-1 0v5a.5.5 0 0 0 1 0z"
						></path>
					</svg>
				),
			},
		],
	},
	{
		title: "Concepts",
		list: [
			{
				href: "/docs/concepts/api",
				title: "API",
				icon: () => (
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="1.2em"
						height="1.2em"
						viewBox="0 0 24 24"
					>
						<path
							className="fill-current"
							fillRule="evenodd"
							d="M2.6 13.25a1.35 1.35 0 0 0-1.35 1.35v6.8c0 .746.604 1.35 1.35 1.35h18.8a1.35 1.35 0 0 0 1.35-1.35v-6.8a1.35 1.35 0 0 0-1.35-1.35zm3.967 5.25a.75.75 0 0 0-1.114-1.003l-.01.011a.75.75 0 0 0 1.114 1.004zM2.6 1.25A1.35 1.35 0 0 0 1.25 2.6v6.8c0 .746.604 1.35 1.35 1.35h18.8a1.35 1.35 0 0 0 1.35-1.35V2.6a1.35 1.35 0 0 0-1.35-1.35zM6.567 6.5a.75.75 0 0 0-1.114-1.003l-.01.011a.75.75 0 1 0 1.114 1.004z"
							clipRule="evenodd"
						></path>
					</svg>
				),
			},
			{
				title: "CLI",
				icon: () => (
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="1.2em"
						height="1.2em"
						viewBox="0 0 256 256"
					>
						<path
							fill="currentColor"
							d="M216 40H40a16 16 0 0 0-16 16v144a16 16 0 0 0 16 16h176a16 16 0 0 0 16-16V56a16 16 0 0 0-16-16m-91 94.25l-40 32a8 8 0 1 1-10-12.5L107.19 128L75 102.25a8 8 0 1 1 10-12.5l40 32a8 8 0 0 1 0 12.5M176 168h-40a8 8 0 0 1 0-16h40a8 8 0 0 1 0 16"
						></path>
					</svg>
				),
				href: "/docs/concepts/cli",
			},
			{
				title: "Client",
				href: "/docs/concepts/client",
				icon: () => (
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="1.2em"
						height="1.2em"
						viewBox="0 0 24 24"
					>
						<path
							fill="currentColor"
							d="M4 8h4V4H4zm6 12h4v-4h-4zm-6 0h4v-4H4zm0-6h4v-4H4zm6 0h4v-4h-4zm6-10v4h4V4zm-6 4h4V4h-4zm6 6h4v-4h-4zm0 6h4v-4h-4z"
						></path>
					</svg>
				),
			},
			{
				title: "Cookies",
				href: "/docs/concepts/cookies",
				icon: () => (
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="1.2em"
						height="1.2em"
						viewBox="0 0 16 16"
					>
						<path
							fill="currentColor"
							d="M8 1a7 7 0 1 0 6.926 5.978a.5.5 0 0 0-.781-.338a2 2 0 0 1-3.111-1.273a.5.5 0 0 0-.401-.4A2 2 0 0 1 9.36 1.854a.5.5 0 0 0-.338-.78A7 7 0 0 0 8 1m0 7.75a.75.75 0 1 1 0-1.5a.75.75 0 0 1 0 1.5m-2 2a.75.75 0 1 1-1.5 0a.75.75 0 0 1 1.5 0M4.75 7a.75.75 0 1 1 0-1.5a.75.75 0 0 1 0 1.5m5.75 4.25a.75.75 0 1 1-1.5 0a.75.75 0 0 1 1.5 0"
						></path>
					</svg>
				),
			},
			{
				title: "Database",
				icon: (props?: SVGProps<any>) => (
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="1.2em"
						height="1.2em"
						viewBox="0 0 16 16"
					>
						<g fill="currentColor">
							<path d="M3.904 1.777C4.978 1.289 6.427 1 8 1s3.022.289 4.096.777C13.125 2.245 14 2.993 14 4s-.875 1.755-1.904 2.223C11.022 6.711 9.573 7 8 7s-3.022-.289-4.096-.777C2.875 5.755 2 5.007 2 4s.875-1.755 1.904-2.223"></path>
							<path d="M2 6.161V7c0 1.007.875 1.755 1.904 2.223C4.978 9.71 6.427 10 8 10s3.022-.289 4.096-.777C13.125 8.755 14 8.007 14 7v-.839c-.457.432-1.004.751-1.49.972C11.278 7.693 9.682 8 8 8s-3.278-.307-4.51-.867c-.486-.22-1.033-.54-1.49-.972"></path>
							<path d="M2 9.161V10c0 1.007.875 1.755 1.904 2.223C4.978 12.711 6.427 13 8 13s3.022-.289 4.096-.777C13.125 11.755 14 11.007 14 10v-.839c-.457.432-1.004.751-1.49.972c-1.232.56-2.828.867-4.51.867s-3.278-.307-4.51-.867c-.486-.22-1.033-.54-1.49-.972"></path>
							<path d="M2 12.161V13c0 1.007.875 1.755 1.904 2.223C4.978 15.711 6.427 16 8 16s3.022-.289 4.096-.777C13.125 14.755 14 14.007 14 13v-.839c-.457.432-1.004.751-1.49.972c-1.232.56-2.828.867-4.51.867s-3.278-.307-4.51-.867c-.486-.22-1.033-.54-1.49-.972"></path>
						</g>
					</svg>
				),
				href: "/docs/concepts/database",
			},
			{
				href: "/docs/concepts/plugins",
				title: "Plugins",
				icon: (props?: SVGProps<any>) => (
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="1.2em"
						height="1.2em"
						viewBox="0 0 20 20"
					>
						<path
							fill="currentColor"
							d="M20 14v4a2 2 0 0 1-2 2h-4v-2a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2H6a2 2 0 0 1-2-2v-4H2a2 2 0 0 1-2-2a2 2 0 0 1 2-2h2V6c0-1.1.9-2 2-2h4V2a2 2 0 0 1 2-2a2 2 0 0 1 2 2v2h4a2 2 0 0 1 2 2v4h-2a2 2 0 0 0-2 2a2 2 0 0 0 2 2z"
						></path>
					</svg>
				),
			},
			{
				title: "Rate Limit",
				icon: () => {
					return (
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="1.2em"
							height="1.2em"
							viewBox="0 0 24 24"
						>
							<path
								className="fill-current"
								d="M13 12.6V9q0-.425-.288-.712T12 8t-.712.288T11 9v3.975q0 .2.075.388t.225.337l2.8 2.8q.275.275.7.275t.7-.275t.275-.7t-.275-.7zM12 22q-1.875 0-3.512-.712t-2.85-1.925t-1.925-2.85T3 13t.713-3.512t1.924-2.85t2.85-1.925T12 4t3.513.713t2.85 1.925t1.925 2.85T21 13t-.712 3.513t-1.925 2.85t-2.85 1.925T12 22M2.05 7.3q-.275-.275-.275-.7t.275-.7L4.9 3.05q.275-.275.7-.275t.7.275t.275.7t-.275.7L3.45 7.3q-.275.275-.7.275t-.7-.275m19.9 0q-.275.275-.7.275t-.7-.275L17.7 4.45q-.275-.275-.275-.7t.275-.7t.7-.275t.7.275l2.85 2.85q.275.275.275.7t-.275.7"
							></path>
						</svg>
					);
				},
				href: "/docs/concepts/rate-limit",
			},
			{
				title: "Sessions",
				href: "/docs/concepts/session-management",
				icon: () => (
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="1.2em"
						height="1.2em"
						viewBox="0 0 24 24"
					>
						<path
							className="fill-current"
							fillRule="evenodd"
							d="M3 10.417c0-3.198 0-4.797.378-5.335c.377-.537 1.88-1.052 4.887-2.081l.573-.196C10.405 2.268 11.188 2 12 2s1.595.268 3.162.805l.573.196c3.007 1.029 4.51 1.544 4.887 2.081C21 5.62 21 7.22 21 10.417v1.574c0 5.638-4.239 8.375-6.899 9.536C13.38 21.842 13.02 22 12 22s-1.38-.158-2.101-.473C7.239 20.365 3 17.63 3 11.991zM14 9a2 2 0 1 1-4 0a2 2 0 0 1 4 0m-2 8c4 0 4-.895 4-2s-1.79-2-4-2s-4 .895-4 2s0 2 4 2"
							clipRule="evenodd"
						></path>
					</svg>
				),
			},
			{
				title: "Typescript",
				href: "/docs/concepts/typescript",
				icon: () => (
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="1em"
						height="1em"
						viewBox="0 0 128 128"
					>
						<path
							className="fill-current"
							d="M2 63.91v62.5h125v-125H2zm100.73-5a15.56 15.56 0 0 1 7.82 4.5a20.6 20.6 0 0 1 3 4c0 .16-5.4 3.81-8.69 5.85c-.12.08-.6-.44-1.13-1.23a7.09 7.09 0 0 0-5.87-3.53c-3.79-.26-6.23 1.73-6.21 5a4.6 4.6 0 0 0 .54 2.34c.83 1.73 2.38 2.76 7.24 4.86c8.95 3.85 12.78 6.39 15.16 10c2.66 4 3.25 10.46 1.45 15.24c-2 5.2-6.9 8.73-13.83 9.9a38.3 38.3 0 0 1-9.52-.1A23 23 0 0 1 80 109.19c-1.15-1.27-3.39-4.58-3.25-4.82a9 9 0 0 1 1.15-.73l4.6-2.64l3.59-2.08l.75 1.11a16.8 16.8 0 0 0 4.74 4.54c4 2.1 9.46 1.81 12.16-.62a5.43 5.43 0 0 0 .69-6.92c-1-1.39-3-2.56-8.59-5c-6.45-2.78-9.23-4.5-11.77-7.24a16.5 16.5 0 0 1-3.43-6.25a25 25 0 0 1-.22-8c1.33-6.23 6-10.58 12.82-11.87a31.7 31.7 0 0 1 9.49.26zm-29.34 5.24v5.12H57.16v46.23H45.65V69.26H29.38v-5a49 49 0 0 1 .14-5.16c.06-.08 10-.12 22-.1h21.81z"
						></path>
					</svg>
				),
			},
			{
				title: "Users & Accounts",
				href: "/docs/concepts/users-accounts",
				icon: () => (
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="1.2em"
						height="1.2em"
						viewBox="0 0 24 24"
					>
						<path
							className="fill-current"
							d="M17 15q-1.05 0-1.775-.725T14.5 12.5t.725-1.775T17 10t1.775.725t.725 1.775t-.725 1.775T17 15m-4 5q-.425 0-.712-.288T12 19v-.4q0-.6.313-1.112t.887-.738q.9-.375 1.863-.562T17 16t1.938.188t1.862.562q.575.225.888.738T22 18.6v.4q0 .425-.288.713T21 20zm-3-8q-1.65 0-2.825-1.175T6 8t1.175-2.825T10 4t2.825 1.175T14 8t-1.175 2.825T10 12m-8 5.2q0-.85.425-1.562T3.6 14.55q1.5-.75 3.113-1.15T10 13q.875 0 1.75.15t1.75.35l-1.7 1.7q-.625.625-1.213 1.275T10 18v.975q0 .3.113.563t.362.462H4q-.825 0-1.412-.587T2 18z"
						></path>
					</svg>
				),
			},
		],
		Icon: () => (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="1.4em"
				height="1.4em"
				viewBox="0 0 24 24"
			>
				<path
					fill="currentColor"
					fillRule="evenodd"
					d="M14.25 4.48v3.057c0 .111 0 .27.021.406a.94.94 0 0 0 .444.683a.96.96 0 0 0 .783.072c.13-.04.272-.108.378-.159L17 8.005l1.124.534c.106.05.248.119.378.16a.96.96 0 0 0 .783-.073a.94.94 0 0 0 .444-.683c.022-.136.021-.295.021-.406V3.031q.17-.008.332-.013C21.154 2.98 22 3.86 22 4.933v11.21c0 1.112-.906 2.01-2.015 2.08c-.97.06-2.108.179-2.985.41c-1.082.286-2.373.904-3.372 1.436q-.422.224-.878.323V5.174a3.6 3.6 0 0 0 .924-.371q.277-.162.576-.323m5.478 8.338a.75.75 0 0 1-.546.91l-4 1a.75.75 0 1 1-.364-1.456l4-1a.75.75 0 0 1 .91.546M11.25 5.214a3.4 3.4 0 0 1-.968-.339C9.296 4.354 8.05 3.765 7 3.487c-.887-.233-2.041-.352-3.018-.412C2.886 3.008 2 3.9 2 4.998v11.146c0 1.11.906 2.01 2.015 2.079c.97.06 2.108.179 2.985.41c1.081.286 2.373.904 3.372 1.436q.422.224.878.324zM4.273 8.818a.75.75 0 0 1 .91-.546l4 1a.75.75 0 1 1-.365 1.456l-4-1a.75.75 0 0 1-.545-.91m.91 3.454a.75.75 0 1 0-.365 1.456l4 1a.75.75 0 0 0 .364-1.456z"
					clipRule="evenodd"
				></path>
				<path
					className="fill-foreground"
					d="M18.25 3.151c-.62.073-1.23.18-1.75.336a8 8 0 0 0-.75.27v3.182l.75-.356l.008-.005a1.1 1.1 0 0 1 .492-.13q.072 0 .138.01c.175.029.315.1.354.12l.009.005l.75.356V3.15"
				></path>
			</svg>
		),
	},
	{
		title: "Authentication",
		Icon: () => (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="1.4em"
				height="1.4em"
				viewBox="0 0 24 24"
			>
				<path
					className="fill-foreground"
					fillRule="evenodd"
					d="M10 4h4c3.771 0 5.657 0 6.828 1.172C22 6.343 22 8.229 22 12c0 3.771 0 5.657-1.172 6.828C19.657 20 17.771 20 14 20h-4c-3.771 0-5.657 0-6.828-1.172C2 17.657 2 15.771 2 12c0-3.771 0-5.657 1.172-6.828C4.343 4 6.229 4 10 4m3.25 5a.75.75 0 0 1 .75-.75h5a.75.75 0 0 1 0 1.5h-5a.75.75 0 0 1-.75-.75m1 3a.75.75 0 0 1 .75-.75h4a.75.75 0 0 1 0 1.5h-4a.75.75 0 0 1-.75-.75m1 3a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 0 1.5h-3a.75.75 0 0 1-.75-.75M11 9a2 2 0 1 1-4 0a2 2 0 0 1 4 0m-2 8c4 0 4-.895 4-2s-1.79-2-4-2s-4 .895-4 2s0 2 4 2"
					clipRule="evenodd"
				/>
			</svg>
		),
		list: [
			{
				title: "Email & Password",
				href: "/docs/authentication/email-password",
				icon: () => (
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="1.2em"
						height="1.2em"
						viewBox="0 0 24 24"
					>
						<path
							fill="currentColor"
							fillRule="evenodd"
							d="M3.172 5.172C2 6.343 2 8.229 2 12c0 3.771 0 5.657 1.172 6.828C4.343 20 6.229 20 10 20h4c3.771 0 5.657 0 6.828-1.172C22 17.657 22 15.771 22 12c0-3.771 0-5.657-1.172-6.828C19.657 4 17.771 4 14 4h-4C6.229 4 4.343 4 3.172 5.172M8 13a1 1 0 1 0 0-2a1 1 0 0 0 0 2m5-1a1 1 0 1 1-2 0a1 1 0 0 1 2 0m3 1a1 1 0 1 0 0-2a1 1 0 0 0 0 2"
							clipRule="evenodd"
						/>
					</svg>
				),
			},
			{
				title: "Social Sign-On",
				group: true,
				icon: LucideAArrowDown,
				href: "/",
			},
			{
				title: "Apple",
				href: "/docs/authentication/apple",
				icon: () => (
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="1.2em"
						height="1.2em"
						viewBox="0 0 20 20"
					>
						<path
							fill="currentColor"
							fillRule="evenodd"
							d="M14.122 4.682c1.35 0 2.781.743 3.8 2.028c-3.34 1.851-2.797 6.674.578 7.963c-.465 1.04-.687 1.505-1.285 2.426c-.835 1.284-2.01 2.884-3.469 2.898c-1.295.012-1.628-.853-3.386-.843c-1.758.01-2.125.858-3.42.846c-1.458-.014-2.573-1.458-3.408-2.743C1.198 13.665.954 9.45 2.394 7.21C3.417 5.616 5.03 4.683 6.548 4.683c1.545 0 2.516.857 3.794.857c1.24 0 1.994-.858 3.78-.858M13.73 0c.18 1.215-.314 2.405-.963 3.247c-.695.902-1.892 1.601-3.05 1.565c-.21-1.163.332-2.36.99-3.167C11.43.755 12.67.074 13.73 0"
						/>
					</svg>
				),
			},

			{
				title: "Discord",
				href: "/docs/authentication/discord",
				icon: () => (
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="1.2em"
						height="1.2em"
						viewBox="0 0 24 24"
					>
						<path
							fill="currentColor"
							d="M18.59 5.89c-1.23-.57-2.54-.99-3.92-1.23c-.17.3-.37.71-.5 1.04c-1.46-.22-2.91-.22-4.34 0c-.14-.33-.34-.74-.51-1.04c-1.38.24-2.69.66-3.92 1.23c-2.48 3.74-3.15 7.39-2.82 10.98c1.65 1.23 3.24 1.97 4.81 2.46c.39-.53.73-1.1 1.03-1.69c-.57-.21-1.11-.48-1.62-.79c.14-.1.27-.21.4-.31c3.13 1.46 6.52 1.46 9.61 0c.13.11.26.21.4.31c-.51.31-1.06.57-1.62.79c.3.59.64 1.16 1.03 1.69c1.57-.49 3.17-1.23 4.81-2.46c.39-4.17-.67-7.78-2.82-10.98Zm-9.75 8.78c-.94 0-1.71-.87-1.71-1.94s.75-1.94 1.71-1.94s1.72.87 1.71 1.94c0 1.06-.75 1.94-1.71 1.94m6.31 0c-.94 0-1.71-.87-1.71-1.94s.75-1.94 1.71-1.94s1.72.87 1.71 1.94c0 1.06-.75 1.94-1.71 1.94"
						/>
					</svg>
				),
			},
			{
				title: "Facebook",
				href: "/docs/authentication/facebook",
				icon: () => (
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="1.2em"
						height="1.2em"
						viewBox="0 0 24 24"
					>
						<g fill="none">
							<path d="M24 0v24H0V0zM12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035q-.016-.005-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093q.019.005.029-.008l.004-.014l-.034-.614q-.005-.019-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z"></path>
							<path
								fill="currentColor"
								d="M13.5 21.888C18.311 21.164 22 17.013 22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 5.013 3.689 9.165 8.5 9.888V15H9a1.5 1.5 0 0 1 0-3h1.5v-2A3.5 3.5 0 0 1 14 6.5h.5a1.5 1.5 0 0 1 0 3H14a.5.5 0 0 0-.5.5v2H15a1.5 1.5 0 0 1 0 3h-1.5z"
							></path>
						</g>
					</svg>
				),
			},
			{
				title: "Github",
				href: "/docs/authentication/github",
				icon: () => (
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="1em"
						height="1em"
						viewBox="0 0 15 15"
					>
						<path
							fill="currentColor"
							fillRule="evenodd"
							d="M7.5.25a7.25 7.25 0 0 0-2.292 14.13c.363.066.495-.158.495-.35c0-.172-.006-.628-.01-1.233c-2.016.438-2.442-.972-2.442-.972c-.33-.838-.805-1.06-.805-1.06c-.658-.45.05-.441.05-.441c.728.051 1.11.747 1.11.747c.647 1.108 1.697.788 2.11.602c.066-.468.254-.788.46-.969c-1.61-.183-3.302-.805-3.302-3.583a2.8 2.8 0 0 1 .747-1.945c-.075-.184-.324-.92.07-1.92c0 0 .61-.194 1.994.744A6.963 6.963 0 0 1 7.5 3.756A6.97 6.97 0 0 1 9.315 4c1.384-.938 1.992-.743 1.992-.743c.396.998.147 1.735.072 1.919c.465.507.745 1.153.745 1.945c0 2.785-1.695 3.398-3.31 3.577c.26.224.492.667.492 1.343c0 .97-.009 1.751-.009 1.989c0 .194.131.42.499.349A7.25 7.25 0 0 0 7.499.25"
							clipRule="evenodd"
						/>
					</svg>
				),
			},
			{
				title: "Google",
				href: "/docs/authentication/google",
				icon: () => (
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="1em"
						height="1em"
						viewBox="0 0 56 56"
					>
						<path
							fill="currentColor"
							fillRule="evenodd"
							d="M28.458 5c6.167 0 11.346 2.2 15.368 5.804l.323.295l-6.62 6.464c-1.695-1.59-4.666-3.493-9.07-3.493c-6.204 0-11.47 4.093-13.372 9.749c-.47 1.46-.756 3.023-.756 4.64c0 1.615.287 3.18.782 4.639c1.877 5.656 7.142 9.748 13.345 9.748c3.347 0 5.928-.886 7.881-2.176l.251-.17l.307-.222c2.813-2.108 4.144-5.084 4.46-7.169l.03-.22h-12.93v-8.705h22.025c.339 1.46.495 2.867.495 4.795c0 7.142-2.554 13.163-6.985 17.255c-3.884 3.597-9.201 5.682-15.535 5.682c-9.031 0-16.85-5.102-20.772-12.57l-.184-.358l-.222-.457A23.45 23.45 0 0 1 5 28.458c0-3.6.827-7.01 2.28-10.073l.222-.457l.184-.357C11.608 10.1 19.426 5 28.458 5"
						/>
					</svg>
				),
			},
			{
				title: "Microsoft",
				href: "/docs/authentication/microsoft",
				icon: () => (
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="1.2em"
						height="1.2em"
						viewBox="0 0 24 24"
					>
						<path
							fill="currentColor"
							d="M2 3h9v9H2zm9 19H2v-9h9zM21 3v9h-9V3zm0 19h-9v-9h9z"
						></path>
					</svg>
				),
			},
			{
				title: "Twitch",
				href: "/docs/authentication/twitch",
				icon: () => (
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="1em"
						height="1em"
						viewBox="0 0 24 24"
					>
						<path
							fill="currentColor"
							fillRule="evenodd"
							d="M3.9 2.5a.9.9 0 0 0-.9.9v14.194a.9.9 0 0 0 .9.9h4.116v3.03a.7.7 0 0 0 1.194.494l3.525-3.524h4.643a.9.9 0 0 0 .636-.264l2.722-2.722a.9.9 0 0 0 .264-.636V3.4a.9.9 0 0 0-.9-.9zm7.319 5.2a.75.75 0 0 0-1.5 0v4.272a.75.75 0 1 0 1.5 0zm5.016 0a.75.75 0 0 0-1.5 0v4.272a.75.75 0 1 0 1.5 0z"
							clipRule="evenodd"
						></path>
					</svg>
				),
			},
			{
				title: "X (Twitter)",
				href: "/docs/authentication/twitter",
				icon: () => (
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
		],
	},
	{
		title: "Integrations",
		Icon: () => (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="1.3em"
				height="1.3em"
				viewBox="0 0 48 48"
			>
				<path
					fill="currentColor"
					stroke="currentColor"
					stroke-linejoin="round"
					stroke-width="4"
					d="M18 6H8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Zm0 22H8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V30a2 2 0 0 0-2-2ZM40 6H30a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Zm0 22H30a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V30a2 2 0 0 0-2-2Z"
				></path>
			</svg>
		),
		list: [
			{
				group: true,
				title: "Full Stack",
				href: "/docs/integrations",
				icon: LucideAArrowDown,
			},
			{
				title: "Astro",
				icon: Icons.astro,
				href: "/docs/integrations/astro",
			},

			{
				title: "Remix",
				icon: Icons.remix,
				href: "/docs/integrations/remix",
			},
			{
				title: "Next",
				icon: Icons.nextJS,
				href: "/docs/integrations/next",
			},
			{
				title: "Nuxt",
				icon: Icons.nuxt,
				href: "/docs/integrations/nuxt",
			},
			{
				title: "Svelte Kit",
				icon: Icons.svelteKit,
				href: "/docs/integrations/svelte-kit",
			},

			{
				title: "Solid Start",
				icon: Icons.solidStart,
				href: "/docs/integrations/solid-start",
			},
			{
				group: true,
				title: "Backend",
				href: "/docs/integrations",
				icon: LucideAArrowDown,
			},
			{
				title: "Hono",
				icon: Icons.hono,
				href: "/docs/integrations/hono",
			},
			{
				title: "Node",
				icon: Icons.node,
				href: "/docs/integrations/node",
			},
			{
				title: "Elysia",
				icon: Icons.elysia,
				href: "/docs/integrations/elysia",
			},
		],
	},
	{
		title: "Plugins",
		Icon: () => (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="1.4em"
				height="1.4em"
				viewBox="0 0 24 24"
			>
				<g fill="none">
					<path d="M24 0v24H0V0zM12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035c-.01-.004-.019-.001-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427c-.002-.01-.009-.017-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093c.012.004.023 0 .029-.008l.004-.014l-.034-.614c-.003-.012-.01-.02-.02-.022m-.715.002a.023.023 0 0 0-.027.006l-.006.014l-.034.614c0 .012.007.02.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z" />
					<path
						fill="currentColor"
						d="M15 20a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2zm0-18a1 1 0 0 1 .993.883L16 3v3h2a2 2 0 0 1 1.995 1.85L20 8v5a6 6 0 0 1-5.775 5.996L14 19h-4a6 6 0 0 1-5.996-5.775L4 13V8a2 2 0 0 1 1.85-1.995L6 6h2V3a1 1 0 0 1 1.993-.117L10 3v3h4V3a1 1 0 0 1 1-1"
					/>
				</g>
			</svg>
		),
		list: [
			{
				title: "Authentication",
				group: true,
				href: "/docs/plugins/1st-party-plugins",
				icon: () => <LucideAArrowDown className="w-4 h-4" />,
			},

			{
				title: "Two Factor",
				icon: () => <ScanFace className="w-4 h-4" />,
				href: "/docs/plugins/2fa",
			},
			{
				title: "Username",
				icon: () => <UserSquare2 className="w-4 h-4" />,
				href: "/docs/plugins/username",
			},
			{
				title: "Anonymous",
				icon: () => <UserCircle className="w-4 h-4" />,
				href: "/docs/plugins/anonymous",
			},
			{
				title: "Phone Number",
				icon: () => <Phone className="w-4 h-4" />,
				href: "/docs/plugins/phone-number",
			},
			{
				title: "Magic Link",
				href: "/docs/plugins/magic-link",
				icon: () => <Mailbox className="w-4 h-4" />,
			},
			{
				title: "Passkey",
				href: "/docs/plugins/passkey",
				icon: () => (
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="1.2em"
						height="1.2em"
						viewBox="0 0 24 24"
					>
						<path
							className="fill-foreground"
							d="M3.25 9.65q-.175-.125-.213-.312t.113-.388q1.55-2.125 3.888-3.3t4.987-1.175q2.65 0 5 1.138T20.95 8.9q.175.225.113.4t-.213.3q-.15.125-.35.113t-.35-.213q-1.375-1.95-3.537-2.987t-4.588-1.038q-2.425 0-4.55 1.038T3.95 9.5q-.15.225-.35.25t-.35-.1m11.6 12.325q-2.6-.65-4.25-2.588T8.95 14.65q0-1.25.9-2.1t2.175-.85q1.275 0 2.175.85t.9 2.1q0 .825.625 1.388t1.475.562q.85 0 1.45-.562t.6-1.388q0-2.9-2.125-4.875T12.05 7.8q-2.95 0-5.075 1.975t-2.125 4.85q0 .6.113 1.5t.537 2.1q.075.225-.012.4t-.288.25q-.2.075-.387-.012t-.263-.288q-.375-.975-.537-1.937T3.85 14.65q0-3.325 2.413-5.575t5.762-2.25q3.375 0 5.8 2.25t2.425 5.575q0 1.25-.887 2.087t-2.163.838q-1.275 0-2.187-.837T14.1 14.65q0-.825-.612-1.388t-1.463-.562q-.85 0-1.463.563T9.95 14.65q0 2.425 1.438 4.05t3.712 2.275q.225.075.3.25t.025.375q-.05.175-.2.3t-.375.075M6.5 4.425q-.2.125-.4.063t-.3-.263q-.1-.2-.05-.362T6 3.575q1.4-.75 2.925-1.15t3.1-.4q1.6 0 3.125.388t2.95 1.112q.225.125.263.3t-.038.35q-.075.175-.25.275t-.425-.025q-1.325-.675-2.738-1.037t-2.887-.363q-1.45 0-2.85.338T6.5 4.425m2.95 17.2q-1.475-1.55-2.262-3.162T6.4 14.65q0-2.275 1.65-3.838t3.975-1.562q2.325 0 4 1.563T17.7 14.65q0 .225-.137.363t-.363.137q-.2 0-.35-.137t-.15-.363q0-1.875-1.388-3.137t-3.287-1.263q-1.9 0-3.262 1.263T7.4 14.65q0 2.025.7 3.438t2.05 2.837q.15.15.15.35t-.15.35q-.15.15-.35.15t-.35-.15m7.55-1.7q-2.225 0-3.863-1.5T11.5 14.65q0-.2.138-.35t.362-.15q.225 0 .363.15t.137.35q0 1.875 1.35 3.075t3.15 1.2q.15 0 .425-.025t.575-.075q.225-.05.388.063t.212.337q.05.2-.075.35t-.325.2q-.45.125-.787.138t-.413.012"
						></path>
					</svg>
				),
			},
			{
				title: "Generic OAuth",
				href: "/docs/plugins/generic-oauth",
				icon: () => (
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="1.2em"
						height="1.2em"
						viewBox="0 0 24 24"
					>
						<g
							fill="none"
							stroke="currentColor"
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
						>
							<path d="M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0"></path>
							<path d="M12.556 6c.65 0 1.235.373 1.508.947l2.839 7.848a1.646 1.646 0 0 1-1.01 2.108a1.673 1.673 0 0 1-2.068-.851L13.365 15h-2.73l-.398.905A1.67 1.67 0 0 1 8.26 16.95l-.153-.047a1.647 1.647 0 0 1-1.056-1.956l2.824-7.852a1.66 1.66 0 0 1 1.409-1.087z"></path>
						</g>
					</svg>
				),
			},
			{
				title: "Authorization",
				group: true,
				href: "/docs/plugins/1st-party-plugins",
				icon: () => <LucideAArrowDown className="w-4 h-4" />,
			},
			{
				title: "Admin",
				href: "/docs/plugins/admin",
				icon: () => (
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="1.2em"
						height="1.2em"
						viewBox="0 0 24 24"
					>
						<path
							className="fill-current"
							d="M12 23C6.443 21.765 2 16.522 2 11V5l10-4l10 4v6c0 5.524-4.443 10.765-10 12M4 6v5a10.58 10.58 0 0 0 8 10a10.58 10.58 0 0 0 8-10V6l-8-3Z"
						></path>
						<circle cx="12" cy="8.5" r="2.5" className="fill-current"></circle>
						<path
							className="fill-current"
							d="M7 15a5.78 5.78 0 0 0 5 3a5.78 5.78 0 0 0 5-3c-.025-1.896-3.342-3-5-3c-1.667 0-4.975 1.104-5 3"
						></path>
					</svg>
				),
			},
			{
				title: "Organization",
				icon: () => <Users2 className="w-4 h-4" />,
				href: "/docs/plugins/organization",
			},
			{
				title: "Utility",
				group: true,
				href: "/docs/plugins/1st-party-plugins",
				icon: () => <LucideAArrowDown className="w-4 h-4" />,
			},

			{
				title: "Bearer",
				icon: () => <Key className="w-4 h-4" />,
				href: "/docs/plugins/bearer",
			},
		],
	},
	{
		title: "Reference",
		Icon: () => (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="1.3em"
				height="1.3em"
				viewBox="0 0 20 20"
			>
				<path
					fill="currentColor"
					d="M0 3v16h5V3zm4 12H1v-1h3zm0-3H1v-1h3zm2-9v16h5V3zm4 12H7v-1h3zm0-3H7v-1h3zm1-8.5l4.1 15.4l4.8-1.3l-4-15.3zm7 10.6l-2.9.8l-.3-1l2.9-.8zm-.8-2.9l-2.9.8l-.2-1l2.9-.8z"
				></path>
			</svg>
		),
		list: [
			{
				title: "Options",
				href: "/docs/reference/options",
				icon: () => (
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="1.2em"
						height="1.2em"
						viewBox="0 0 24 24"
					>
						<path
							fill="currentColor"
							d="M6.5 16q1.175 0 2.288.263T11 17.05V7.2q-1.025-.6-2.175-.9T6.5 6q-.9 0-1.788.175T3 6.7v9.9q.875-.3 1.738-.45T6.5 16m6.5 1.05q1.1-.525 2.213-.787T17.5 16q.9 0 1.763.15T21 16.6V6.7q-.825-.35-1.713-.525T17.5 6q-1.175 0-2.325.3T13 7.2zm-1 2.425q-.35 0-.663-.087t-.587-.238q-.975-.575-2.05-.862T6.5 18q-1.05 0-2.062.275T2.5 19.05q-.525.275-1.012-.025T1 18.15V6.1q0-.275.138-.525T1.55 5.2q1.15-.6 2.4-.9T6.5 4q1.45 0 2.838.375T12 5.5q1.275-.75 2.663-1.125T17.5 4q1.3 0 2.55.3t2.4.9q.275.125.413.375T23 6.1v12.05q0 .575-.487.875t-1.013.025q-.925-.5-1.937-.775T17.5 18q-1.125 0-2.2.288t-2.05.862q-.275.15-.587.238t-.663.087m2-10.7q0-.225.163-.462T14.525 8q.725-.25 1.45-.375T17.5 7.5q.5 0 .988.063t.962.162q.225.05.388.25t.162.45q0 .425-.275.625t-.7.1q-.35-.075-.737-.112T17.5 9q-.65 0-1.275.125t-1.2.325q-.45.175-.737-.025T14 8.775m0 5.5q0-.225.163-.462t.362-.313q.725-.25 1.45-.375T17.5 13q.5 0 .988.063t.962.162q.225.05.388.25t.162.45q0 .425-.275.625t-.7.1q-.35-.075-.737-.112T17.5 14.5q-.65 0-1.275.113t-1.2.312q-.45.175-.737-.012T14 14.275m0-2.75q0-.225.163-.462t.362-.313q.725-.25 1.45-.375t1.525-.125q.5 0 .988.063t.962.162q.225.05.388.25t.162.45q0 .425-.275.625t-.7.1q-.35-.075-.737-.112t-.788-.038q-.65 0-1.275.125t-1.2.325q-.45.175-.737-.025t-.288-.65"
						></path>
					</svg>
				),
			},
			{
				title: "Security",
				href: "/docs/reference/security",
				icon: () => <ShieldCheck className="text-current w-4 h-4" />,
			},
		],
	},
];

export const examples: Content[] = [
	{
		title: "Examples",
		href: "/docs/examples/next",
		Icon: () => (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="1.4em"
				height="1.4em"
				viewBox="0 0 24 24"
			>
				<path
					fill="currentColor"
					d="M2 6.95c0-.883 0-1.324.07-1.692A4 4 0 0 1 5.257 2.07C5.626 2 6.068 2 6.95 2c.386 0 .58 0 .766.017a4 4 0 0 1 2.18.904c.144.119.28.255.554.529L11 4c.816.816 1.224 1.224 1.712 1.495a4 4 0 0 0 .848.352C14.098 6 14.675 6 15.828 6h.374c2.632 0 3.949 0 4.804.77q.119.105.224.224c.77.855.77 2.172.77 4.804V14c0 3.771 0 5.657-1.172 6.828S17.771 22 14 22h-4c-3.771 0-5.657 0-6.828-1.172S2 17.771 2 14z"
					opacity=".5"
				></path>
				<path
					fill="currentColor"
					d="M20 6.238c0-.298-.005-.475-.025-.63a3 3 0 0 0-2.583-2.582C17.197 3 16.965 3 16.5 3H9.988c.116.104.247.234.462.45L11 4c.816.816 1.224 1.224 1.712 1.495a4 4 0 0 0 .849.352C14.098 6 14.675 6 15.829 6h.373c1.78 0 2.957 0 3.798.238"
				></path>
				<path
					fill="currentColor"
					fillRule="evenodd"
					d="M12.25 10a.75.75 0 0 1 .75-.75h5a.75.75 0 0 1 0 1.5h-5a.75.75 0 0 1-.75-.75"
					clipRule="evenodd"
				></path>
			</svg>
		),
		list: [
			{
				title: "Astro + SolidJs",
				href: "/docs/examples/astro",
				icon: Icons.astro,
			},
			{
				title: "Remix",
				href: "/docs/examples/remix",
				icon: Icons.remix,
			},
			{
				title: "Next JS",
				href: "/docs/examples/next-js",
				icon: Icons.nextJS,
			},
			{
				title: "Nuxt",
				href: "/docs/examples/nuxt",
				icon: Icons.nuxt,
			},
			{
				title: "Svelte Kit",
				href: "/docs/examples/svelte-kit",
				icon: Icons.svelteKit,
			},
		],
	},
];
