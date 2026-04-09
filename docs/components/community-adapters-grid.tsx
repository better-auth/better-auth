"use client";

import { ArrowUpRight, Database, Search } from "lucide-react";
import { useState } from "react";

interface CommunityAdapter {
	name: string;
	url: string;
	database: string;
	databaseUrl: string;
	author: {
		name: string;
		url: string;
		avatar: string;
	};
}

const adapters: CommunityAdapter[] = [
	{
		name: "convex-better-auth",
		url: "https://github.com/get-convex/better-auth",
		database: "Convex",
		databaseUrl: "https://www.convex.dev/",
		author: {
			name: "erquhart",
			url: "https://github.com/erquhart",
			avatar: "https://github.com/erquhart.png",
		},
	},
	{
		name: "surreal-better-auth",
		url: "https://github.com/oskar-gmerek/surreal-better-auth",
		database: "SurrealDB",
		databaseUrl: "https://surrealdb.com/",
		author: {
			name: "Oskar Gmerek",
			url: "https://oskargmerek.com",
			avatar: "https://github.com/oskar-gmerek.png",
		},
	},
	{
		name: "surrealdb-better-auth",
		url: "https://github.com/Necmttn/surrealdb-better-auth",
		database: "SurrealDB",
		databaseUrl: "https://surrealdb.com/",
		author: {
			name: "Necmttn",
			url: "https://github.com/Necmttn",
			avatar: "https://github.com/Necmttn.png",
		},
	},
	{
		name: "better-auth-surrealdb",
		url: "https://github.com/msanchezdev/better-auth-surrealdb",
		database: "SurrealDB",
		databaseUrl: "https://surrealdb.com/",
		author: {
			name: "msanchezdev",
			url: "https://github.com/msanchezdev",
			avatar: "https://github.com/msanchezdev.png",
		},
	},
	{
		name: "@payload-auth/better-auth-plugin",
		url: "https://github.com/payload-auth/payload-auth",
		database: "Payload CMS",
		databaseUrl: "https://payloadcms.com/",
		author: {
			name: "forrestdevs",
			url: "https://github.com/forrestdevs",
			avatar: "https://github.com/forrestdevs.png",
		},
	},
	{
		name: "better-auth-instantdb",
		url: "https://github.com/daveyplate/better-auth-instantdb",
		database: "InstantDB",
		databaseUrl: "https://www.instantdb.com/",
		author: {
			name: "daveycodez",
			url: "https://github.com/daveycodez",
			avatar: "https://github.com/daveycodez.png",
		},
	},
	{
		name: "@nerdfolio/remult-better-auth",
		url: "https://github.com/nerdfolio/remult-better-auth",
		database: "Remult",
		databaseUrl: "https://remult.dev/",
		author: {
			name: "Tai Vo",
			url: "https://github.com/taivo",
			avatar: "https://github.com/taivo.png",
		},
	},
	{
		name: "pocketbase-better-auth",
		url: "https://github.com/LightInn/pocketbase-better-auth",
		database: "PocketBase",
		databaseUrl: "https://pocketbase.io/",
		author: {
			name: "LightInn",
			url: "https://github.com/LightInn",
			avatar: "https://github.com/LightInn.png",
		},
	},
	{
		name: "better-auth-firestore",
		url: "https://github.com/yultyyev/better-auth-firestore",
		database: "Firebase Firestore",
		databaseUrl: "https://firebase.google.com/docs/firestore",
		author: {
			name: "yultyyev",
			url: "https://github.com/yultyyev",
			avatar: "https://github.com/yultyyev.png",
		},
	},
	{
		name: "@zenstackhq/better-auth",
		url: "https://github.com/zenstackhq/zenstack-v3/tree/main/packages/auth-adapters/better-auth",
		database: "ZenStack",
		databaseUrl: "https://zenstack.dev",
		author: {
			name: "zenstackhq",
			url: "https://github.com/zenstackhq",
			avatar: "https://github.com/zenstackhq.png",
		},
	},
	{
		name: "@strapi-community/plugin-better-auth",
		url: "https://github.com/strapi-community/plugin-better-auth",
		database: "Strapi CMS",
		databaseUrl: "https://strapi.io/",
		author: {
			name: "boazpoolman",
			url: "https://github.com/boazpoolman",
			avatar: "https://github.com/boazpoolman.png",
		},
	},
];

export function CommunityAdaptersGrid() {
	const [filter, setFilter] = useState("");

	const filtered = adapters.filter((a) => {
		const q = filter.toLowerCase();
		return (
			a.name.toLowerCase().includes(q) ||
			a.database.toLowerCase().includes(q) ||
			a.author.name.toLowerCase().includes(q)
		);
	});

	return (
		<div className="not-prose">
			<div className="relative mb-4">
				<Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-foreground/30" />
				<input
					type="text"
					placeholder="Filter adapters..."
					value={filter}
					onChange={(e) => setFilter(e.target.value)}
					className="w-full border border-foreground/[0.08] bg-foreground/[0.02] pl-9 pr-4 py-2 text-sm font-mono text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-foreground/20 transition-colors"
				/>
			</div>

			<div className="text-[11px] font-mono uppercase tracking-wider text-foreground/30 mb-2">
				{filtered.length} adapter{filtered.length !== 1 ? "s" : ""}
			</div>

			<div className="border border-foreground/[0.08] divide-y divide-foreground/[0.06]">
				{filtered.map((adapter) => (
					<div
						key={adapter.name}
						className="group flex flex-col gap-2 px-4 py-3.5 hover:bg-foreground/[0.03] transition-colors"
					>
						<div className="flex items-start justify-between gap-3">
							<a
								href={adapter.url}
								target="_blank"
								rel="noopener noreferrer"
								className="font-mono text-[13px] text-foreground/90 group-hover:text-foreground transition-colors break-all hover:underline"
							>
								{adapter.name}
							</a>
							<ArrowUpRight className="size-3.5 shrink-0 text-foreground/20 group-hover:text-foreground/50 transition-colors mt-0.5" />
						</div>
						<div className="flex items-center gap-3 flex-wrap">
							<span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-foreground/40">
								<Database className="size-3" />
								<a
									href={adapter.databaseUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="hover:text-foreground/70 transition-colors"
								>
									{adapter.database}
								</a>
							</span>
							<span className="text-foreground/10">|</span>
							<span className="inline-flex items-center gap-1.5">
								<img
									src={adapter.author.avatar}
									alt={adapter.author.name}
									className="size-4 border border-foreground/10 opacity-60"
									style={{ borderRadius: 0 }}
								/>
								<a
									href={adapter.author.url}
									target="_blank"
									rel="noopener noreferrer"
									className="text-[11px] font-mono text-foreground/40 hover:text-foreground/70 transition-colors"
								>
									{adapter.author.name}
								</a>
							</span>
						</div>
					</div>
				))}
				{filtered.length === 0 && (
					<div className="px-4 py-8 text-center text-sm text-foreground/30 font-mono">
						No adapters found.
					</div>
				)}
			</div>
		</div>
	);
}
