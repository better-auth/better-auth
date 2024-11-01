"use client";
import {
	CheckIcon,
	Globe2Icon,
	PlugIcon,
	PlugZap2Icon,
	Plus,
	RabbitIcon,
	ShieldCheckIcon,
	Webhook,
	XIcon,
} from "lucide-react";
import { GitHubLogoIcon, LockClosedIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { Button } from "./ui/button";
import React, { useState } from "react";
import { TechStackDisplay } from "./display-techstack";
import { Ripple } from "./ripple";
import { GithubStat } from "./github-stat";

export default function Features({ stars }: { stars: string | null }) {
	return (
		<div className="md:w-10/12 overflow-hidden mt-10 mx-auto font-geist relative md:border-l-0 md:border-[1.2px] rounded-none -pr-2">
			<Plus className="absolute top-[-17px] left-[-17px] text-black/20 dark:text-white/30  w-8 h-8" />
			<div className="grid w-full grid-cols-1 grid-rows-4 md:grid-cols-3 md:mx-0 md:grid-rows-4">
				<div className="relative items-start justify-start border-l-[1.2px] border-t-[1.2px] md:border-t-0  transform-gpu  flex flex-col p-10 overflow-clip">
					<Plus className="absolute bottom-[-17px] left-[-17px] text-black/20 dark:text-white/30  w-8 h-8" />

					<div className="flex items-center gap-2 my-1">
						<PlugZap2Icon className="w-4 h-4" />
						<p className="text-gray-600 dark:text-gray-400">
							Framework Agnostic{" "}
						</p>
					</div>
					<div className="mt-2">
						<div className="max-w-full">
							<div className="flex gap-3 ">
								<p className="max-w-lg text-xl font-normal tracking-tighter md:text-2xl">
									Supports popular <strong>frameworks</strong>
								</p>
							</div>
						</div>
						<p className="mt-2 text-sm text-left text-muted-foreground">
							Supports your favorite frontend, backend and meta frameworks,
							including React, Vue, Svelte, Astro, Solid, Next.js, Nuxt, Hono,
							and more{" "}
							<a className="text-gray-50" href="/docs" target="_blank">
								Learn more
							</a>
						</p>
					</div>
				</div>
				<div className="relative items-start justify-start border-l-[1.2px] border-t-[1.2px] md:border-t-0  transform-gpu  flex flex-col p-10">
					<Plus className="absolute bottom-[-17px] left-[-17px] text-black/20 dark:text-white/30  w-8 h-8" />

					<div className="flex items-center gap-2 my-1">
						<LockClosedIcon className="w-4 h-4" />
						<p className="text-gray-600 dark:text-gray-400">Authentication</p>
					</div>
					<div className="mt-2">
						<div className="max-w-full">
							<div className="flex gap-3 ">
								<p className="max-w-lg text-2xl font-normal tracking-tighter">
									Email & Password <strong>Authentication</strong>
								</p>
							</div>
						</div>
						<p className="mt-2 text-sm text-left text-muted-foreground">
							Builtin support for email and password authentication, with secure
							password hashing and account management features{" "}
							<a className="text-gray-50" href="/docs" target="_blank">
								Learn more
							</a>
						</p>
					</div>
				</div>
				<div className="relative items-start justify-start md:border-l-[0.2px] border-t-[1.2px] md:border-t-0  flex flex-col p-10">
					<Plus className="absolute bottom-[-17px] left-[-17px] text-black/20 dark:text-white/30  w-8 h-8" />

					<div className="flex items-center gap-2 my-1">
						<Webhook className="w-4 h-4" />
						<p className="text-gray-600 dark:text-gray-400">Social Sign-on</p>
					</div>
					<div className="mt-2">
						<div className="max-w-full">
							<div className="flex gap-3 ">
								<p className="max-w-lg text-2xl font-normal tracking-tighter">
									Support multiple <strong>OAuth providers.</strong>
								</p>
							</div>
						</div>
						<p className="mt-2 text-sm text-left text-muted-foreground">
							Allow users to sign in with their accounts, including GitHub,
							Google, Discord, Twitter, and more.{" "}
							<a className="text-gray-50" href="#" target="_blank">
								Learn more
							</a>
						</p>
					</div>
				</div>
				<div className="items-start justify-start  border-l-[1.2px] border-t-[1.2px] flex flex-col p-10  ">
					<div className="flex items-center gap-2 my-1">
						<ShieldCheckIcon className="w-4 h-4" />
						<p className="text-gray-600 dark:text-gray-400">Two Factor</p>
					</div>
					<div className="mt-2">
						<div className="max-w-full">
							<div className="flex gap-3 ">
								<p className="max-w-lg text-2xl font-normal tracking-tighter">
									Two Factor <strong>Authentication</strong>
								</p>
							</div>
						</div>
						<p className="mt-2 text-sm text-left text-muted-foreground">
							With our built-in two factor authentication plugin, you can add an
							extra layer of security to your account.{" "}
							<Link className="text-gray-50" href="/docs" target="_blank">
								Learn more
							</Link>
						</p>
					</div>
				</div>
				<div className="items-start justify-staart  border-l-[1.2px] border-t-[1.2px] flex flex-col p-10  ">
					<div className="flex items-center gap-2 my-1">
						<RabbitIcon className="w-4 h-4" />
						<p className="text-gray-600 dark:text-gray-400">
							Organization & Access Control{" "}
						</p>
					</div>
					<div className="mt-2">
						<div className="max-w-full">
							<div className="flex gap-3 ">
								<p className="max-w-lg text-2xl font-normal tracking-tighter">
									Gain and manage <strong>access.</strong>
								</p>
							</div>
						</div>
						<p className="mt-2 text-sm text-left text-muted-foreground">
							Manage users and their access to resources within your
							application.{" "}
							<a className="text-gray-50" href="/docs" target="_blank">
								Learn more
							</a>
						</p>
					</div>
				</div>
				<div className="items-start justify-start  border-l-[1.2px] border-t-[1.2px] transform-gpu relative  flex flex-col p-10  ">
					<div className="flex items-center gap-2 my-1">
						<PlugIcon className="w-4 h-4" />
						<p className="text-gray-600 dark:text-gray-400">
							Plugin Ecosystem{" "}
						</p>
					</div>
					<div className="max-w-full">
						<div className="flex gap-3 ">
							<p className="max-w-lg text-2xl font-normal tracking-tighter">
								Extend your application with plugins
							</p>
						</div>
					</div>
					<div className="mt-2">
						<p className="mt-2 text-sm text-left text-muted-foreground">
							Enhance your application with our official plugins and those
							created by the community.{" "}
							<a className="text-gray-50" href="/docs" target="_blank">
								Learn more
							</a>
						</p>
					</div>
				</div>
				<div className="relative md:grid md:col-span-3 grid-cols-2 row-span-2 border-t-[1.2px] border-l-[1.2px]  md:border-b-[1.2px] dark:border-b-0  h-full py-20 ">
					<div className="top-0 left-0 w-full h-full p-16 pt-10 md:px-10 md:absolute">
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
