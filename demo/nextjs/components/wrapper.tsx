"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Link from "next/link";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

export function Wrapper(props: { children: React.ReactNode }) {
	return (
		<div className="min-h-screen w-full dark:bg-black bg-white relative flex justify-center">
			<div className="absolute inset-0 bg-grid-small text-black/2 dark:text-white/4 pointer-events-none" />
			<div className="absolute pointer-events-none inset-0 items-center justify-center bg-white dark:bg-black mask-[radial-gradient(ellipse_at_center,transparent_40%,white)] dark:mask-[radial-gradient(ellipse_at_center,transparent_40%,black)]"></div>

			<div className="bg-white dark:bg-black border-b py-2 flex justify-between items-center border-border absolute z-50 w-full px-4">
				<Link href="/">
					<div className="flex items-center gap-2">
						<Logo />
						<p className="select-none">BETTER-AUTH.</p>
					</div>
				</Link>
				<div className="z-50 flex items-center">
					<ThemeToggle />
				</div>
			</div>

			<div className="mt-20 lg:w-7/12 w-full">{props.children}</div>
		</div>
	);
}

const queryClient = new QueryClient();

export function WrapperWithQuery(props: { children: React.ReactNode | any }) {
	return (
		<QueryClientProvider client={queryClient}>
			{props.children}
		</QueryClientProvider>
	);
}
