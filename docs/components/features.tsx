"use client";
import React from "react";

import {
	Globe2Icon,
	PlugIcon,
	PlugZap2Icon,
	Plus,
	RabbitIcon,
	ShieldCheckIcon,
	Webhook,
} from "lucide-react";
import { LockClosedIcon } from "@radix-ui/react-icons";

import { TechStackDisplay } from "./display-techstack";
import { Ripple } from "./ripple";
import { GithubStat } from "./github-stat";
import Testimonial from "./testimonial";
import { cn } from "@/lib/utils";

const features = [
	{
		id: 1,
		label: "Framework Agnostic",
		title: "Supports popular <strong>frameworks</strong>",
		description:
			"Supports popular frameworks, including React, Vue, Svelte, Astro, Solid, Next.js, Nuxt, Hono, and more.",
		icon: PlugZap2Icon,
	},
	{
		id: 2,
		label: "Authentication",
		title: "Email & Password <strong>Authentication</strong>",
		description:
			"Built-in support for email and password authentication, with secure password hashing and account management features.",
		icon: LockClosedIcon,
	},
	{
		id: 3,
		label: "Social Sign-on",
		title: "Support multiple <strong>OAuth providers</strong>",
		description:
			"Allow users to sign in with their accounts, including GitHub, Google, Discord, Twitter, and more.",
		icon: Webhook,
	},
	{
		id: 4,
		label: "Two Factor",
		title: "Two Factor <strong>Authentication</strong>",
		description:
			"With our built-in two factor authentication plugin, you can add an extra layer of security to your account.",
		icon: ShieldCheckIcon,
	},
	{
		id: 5,
		label: "Organization & Access Control",
		title: "Gain and manage <strong>access</strong>.",
		description:
			"Manage users and their access to resources within your application.",
		icon: RabbitIcon,
	},
	{
		id: 6,
		label: "Plugin Ecosystem",
		title: "Extend your application with plugins.",
		description:
			"Enhance your application with our official plugins and those created by the community.",
		icon: PlugIcon,
	},
];

export default function Features({ stars }: { stars: string | null }) {
	return (
		<div className="md:w-10/12 mt-10 mx-auto font-geist relative md:border-l-0 md:border-[1.2px] rounded-none -pr-2">
			<div className="w-full md:mx-0">
				<div className="grid grid-cols-1 relative md:grid-rows-2 md:grid-cols-3 border-b-[1.2px]">
					<div className="hidden md:grid top-1/2 left-0 -translate-y-1/2 w-full grid-cols-3 z-10 pointer-events-none select-none absolute">
						<Plus className="w-8 h-8 text-neutral-300 translate-x-[16.5px] translate-y-[.5px] ml-auto dark:text-neutral-600" />
						<Plus className="w-8 h-8 text-neutral-300 ml-auto translate-x-[16.5px] translate-y-[.5px] dark:text-neutral-600" />
					</div>
					{features.map((feature, index) => (
						<div
							key={feature.id}
							className={cn(
								"justify-center border-l-[1.2px] md:min-h-[240px] border-t-[1.2px] md:border-t-0 transform-gpu flex flex-col p-10",
								index >= 3 && "md:border-t-[1.2px]",
							)}
						>
							<div className="flex items-center gap-2 my-1">
								<feature.icon className="w-4 h-4" />
								<p className="text-gray-600 dark:text-gray-400">
									{feature.label}
								</p>
							</div>
							<div className="mt-2">
								<div className="max-w-full">
									<div className="flex gap-3 ">
										<p
											className="max-w-lg text-xl font-normal tracking-tighter md:text-2xl"
											dangerouslySetInnerHTML={{
												__html: feature.title,
											}}
										/>
									</div>
								</div>
								<p className="mt-2 text-sm text-left text-muted-foreground">
									{feature.description}
									<a className="ml-2 underline" href="/docs" target="_blank">
										Learn more
									</a>
								</p>
							</div>
						</div>
					))}
				</div>

				<Testimonial />

				<div className="relative col-span-3 border-t-[1.2px] border-l-[1.2px] md:border-b-[1.2px] dark:border-b-0  h-full py-20">
					<div className="w-full h-full p-16 pt-10 md:px-10">
						<div className="flex flex-col items-center justify-center w-full h-full gap-3">
							<div className="flex items-center gap-2">
								<Globe2Icon className="w-4 h-4" />
								<p className="text-gray-600 dark:text-gray-400">
									Own your auth
								</p>
							</div>
							<p className="max-w-md mx-auto mt-4 text-4xl font-normal tracking-tighter text-center md:text-4xl">
								<strong>Roll your own auth with confidence in minutes!</strong>
							</p>
							<div className="flex mt-[10px] z-20 justify-center items-start">
								<TechStackDisplay
									skills={[
										"nextJs",
										"nuxt",
										"svelteKit",
										"astro",
										"solidStart",
										// "react",
										// "hono",
										"expo",
										"tanstack",
									]}
								/>
							</div>
							<div className="flex items-center gap-2">
								<GithubStat stars={stars} />
							</div>
							<Ripple />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
