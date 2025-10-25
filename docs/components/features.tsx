"use client";

import { LockClosedIcon } from "@radix-ui/react-icons";
import {
	Globe2Icon,
	PlugIcon,
	PlugZap2Icon,
	Plus,
	RabbitIcon,
	ShieldCheckIcon,
	Webhook,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TechStackDisplay } from "./display-techstack";
import { GithubStat } from "./github-stat";
import { Testimonial } from "./landing/testimonials";
import { Ripple } from "./ripple";

const features = [
	{
		id: 1,
		label: "Framework Agnostic",
		title: "Support for popular <strong>frameworks</strong>.",
		description:
			"Supports popular frameworks, including React, Vue, Svelte, Astro, Solid, Next.js, Nuxt, Tanstack Start, Hono, and more.",
		icon: PlugZap2Icon,
	},
	{
		id: 2,
		label: "Authentication",
		title: "Email & Password <strong>Authentication</strong>.",
		description:
			"Built-in support for email and password authentication, with session and account management features.",
		icon: LockClosedIcon,
	},
	{
		id: 3,
		label: "Social Sign-on",
		title: "Support multiple <strong>OAuth providers</strong>.",
		description:
			"Allow users to sign in with their accounts, including GitHub, Google, Discord, Twitter, and more.",
		icon: Webhook,
	},
	{
		id: 4,
		label: "Two Factor",
		title: "Multi Factor <strong>Authentication</strong>.",
		description:
			"Secure your users accounts with two factor authentication with a few lines of code.",
		icon: ShieldCheckIcon,
	},
	{
		id: 5,
		label: "Multi Tenant",
		title: "<strong>Organization</strong> Members and Invitation.",
		description:
			"Multi tenant support with members, organization, teams and invitation with access control.",

		icon: RabbitIcon,
	},

	{
		id: 6,
		label: "Plugin Ecosystem",
		title: "A lot more features with <strong>plugins</strong>.",
		description:
			"Improve your application experience with our official plugins and those created by the community.",
		icon: PlugIcon,
	},
];

export default function Features({ stars }: { stars: string | null }) {
	return (
		<div className="md:w-10/12 mt-10 mx-auto relative md:border-l-0 md:border-b-0 md:border-[1.2px] rounded-none -pr-2 dark:bg-black/[0.95] ">
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
								"justify-center md:border-l-[1.2px] md:min-h-[240px] border-t-[1.2px] md:border-t-0 transform-gpu flex flex-col p-10 2xl:p-12",
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
				<div className="w-full md:border-l hidden md:block">
					<Testimonial />
				</div>
				<div className="relative col-span-3 md:border-l-[1.2px] md:border-t-[1.2px] h-full py-20">
					<div className="w-full h-full p-16 pt-10 md:px-10 2xl:px-16">
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
										"react",
										"hono",
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
