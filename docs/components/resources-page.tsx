"use client";
import { useState } from "react";
import { ResourceCard } from "./resource-card";
import { ResourceFilter } from "./resource-filter";

interface Resource {
	title: string;
	description: string;
	href: string;
	tags: string[];
}

interface Resources {
	gettingStarted: Resource[];
	videoTutorials: Resource[];
	blogPosts: Resource[];
	community: Resource[];
}

interface ActiveFilters {
	gettingStarted: string | null;
	videoTutorials: string | null;
	blogPosts: string | null;
	community: string | null;
}

const resources: Resources = {
	gettingStarted: [
		{
			title: "Getting Started with Better Auth",
			description:
				"Learn the basics of Better Auth and how to implement authentication in your application.",
			href: "https://example.com/getting-started",
			tags: ["quickstart", "setup", "basics"],
		},
		{
			title: "Authentication Best Practices",
			description:
				"Discover the best practices for implementing secure authentication in your applications.",
			href: "https://example.com/best-practices",
			tags: ["security", "best-practices", "guidelines"],
		},
		{
			title: "Better Auth vs Other Solutions",
			description:
				"A comprehensive comparison of Better Auth with other authentication solutions.",
			href: "https://example.com/comparison",
			tags: ["comparison", "alternatives"],
		},
	],
	videoTutorials: [
		{
			title: "The State of Authentication",
			description:
				"<strong>Theo(t3.gg)</strong> explores the current landscape of authentication, discussing trends, challenges, and where the industry is heading.",
			href: "https://www.youtube.com/watch?v=D2f_gN1uZbc",
			tags: ["trends", "overview"],
		},
		{
			title: "Last Authentication You Will Ever Need",
			description:
				"A comprehensive tutorial demonstrating why Better Auth could be the final authentication solution you'll need for your projects.",
			href: "https://www.youtube.com/watch?v=hFtufpaMcLM",
			tags: ["tutorial", "implementation", "guide"],
		},
		{
			title: "This Might Be My New Favourite Auth Library",
			description:
				"<strong>DevEd</strong> explores the features and capabilities of Better Auth, explaining why it stands out among authentication libraries.",
			href: "https://www.youtube.com/watch?v=Hjs3zM7o7NE",
			tags: ["review", "showcase"],
		},
		{
			title: "Nextjs 15 Authentication Made EASY with Better Auth",
			description:
				"A practical guide showing how to seamlessly integrate Better Auth with Next.js 15 for robust authentication.",
			href: "youtube.com/watch?v=lxslnp-ZEMw",
			tags: ["nextjs", "integration", "tutorial"],
		},
		{
			title: "Best authentication framework for next.js",
			description:
				"A detailed comparison of authentication frameworks for Next.js, highlighting why Better Auth might be your best choice.",
			href: "youtube.com/watch?v=V--T0q9FrEw",
			tags: ["nextjs", "comparison", "frameworks"],
		},
		{
			title: "Better-Auth: A First Look",
			description:
				"An introductory overview and demonstration of Better Auth's core features and capabilities.",
			href: "youtube.com/watch?v=2cQTV6NYxis",
			tags: ["overview", "introduction", "demo"],
		},
		{
			title: "Stripe was never so easy (with better auth)",
			description: "A tutorial on how to integrate Stripe with Better Auth.",
			href: "https://www.youtube.com/watch?v=g-RIrzBEX6M",
			tags: ["overview", "introduction", "demo"],
		},
	],
	blogPosts: [
		{
			title: "Better Auth with Hono, Bun, TypeScript, React and Vite",
			description:
				"You'll learn how to implement authentication with Better Auth in a client - server architecture, where the frontend is separate from the backend.",
			href: "https://catalins.tech/better-auth-with-hono-bun-typescript-react-vite",
			tags: ["typescript", "react", "bun", "vite"],
		},
		{
			title: "Polar.sh + BetterAuth for Organizations",
			description:
				"Polar.sh is a platform for building payment integrations. This article will show you how to use Better Auth to authenticate your users.",
			href: " https://dev.to/phumudzosly/polarsh-betterauth-for-organizations-1j1b",
			tags: ["organizations", "integration", "payments"],
		},
		{
			title: "Authenticating users in Astro with Better Auth",
			description:
				"Step by step guide on how to authenticate users in Astro with Better Auth.",
			href: "https://www.launchfa.st/blog/astro-better-auth",
			tags: ["astro", "integration", "tutorial"],
		},
		{
			title: "Building Multi-Tenant Apps With Better-Auth and ZenStack",
			description:
				"Learn how to build multi-tenant apps with Better-Auth and ZenStack.",
			href: "https://zenstack.dev/blog/better-auth",
			tags: ["multi-tenant", "zenstack", "architecture"],
		},
	],
	community: [
		{
			title: "GitHub Discussions",
			description: "Join the community discussion about Better Auth on GitHub.",
			href: "https://github.com/better-auth/better-auth/discussions",
			tags: ["support", "github", "discussions"],
		},
		{
			title: "Stack Overflow",
			description:
				"Find answers to common questions about Better Auth on Stack Overflow.",
			href: "https://stackoverflow.com/questions/tagged/better-auth",
			tags: ["q&a", "troubleshooting", "help"],
		},
		{
			title: "Discord Community",
			description:
				"Join our Discord community for real-time support and discussions.",
			href: "https://discord.gg/better-auth",
			tags: ["chat", "realtime", "community"],
		},
	],
};

export function ResourcesPage() {
	const [activeFilters, setActiveFilters] = useState<ActiveFilters>({
		gettingStarted: null,
		videoTutorials: null,
		blogPosts: null,
		community: null,
	});

	const allTags = Array.from(
		new Set(
			Object.values(resources)
				.flat()
				.flatMap((resource) => resource.tags)
				.slice(0, 10),
		),
	);

	const blogsTags = Array.from(
		new Set(
			Object.values(resources.blogPosts)
				.flat()
				.flatMap((resource) => resource.tags)
				.slice(0, 10),
		),
	);
	const videoTags = Array.from(
		new Set(
			Object.values(resources.videoTutorials)
				.flat()
				.flatMap((resource) => resource.tags)
				.slice(0, 10),
		),
	);
	const getStartedTags = Array.from(
		new Set(
			Object.values(resources.gettingStarted)
				.flat()
				.flatMap((resource) => resource.tags)
				.slice(0, 10),
		),
	);

	const filterResources = (
		resources: Resource[],
		activeTag: string | null,
	): Resource[] => {
		if (!activeTag) return resources;
		return resources.filter((resource) => resource.tags.includes(activeTag));
	};

	return (
		<div className="space-y-8 border-t-[1.2px]">
			<a href="#videos" className="no-underline">
				<h2 id="videos" className="text-2xl font-bold tracking-tight">
					Video Tutorials
				</h2>
			</a>
			<ResourceFilter
				title="Filter by topic"
				tags={videoTags}
				activeTag={activeFilters.videoTutorials}
				onTagClick={(tag) =>
					setActiveFilters((prev) => ({ ...prev, videoTutorials: tag }))
				}
			/>
			<div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
				{filterResources(
					resources.videoTutorials,
					activeFilters.videoTutorials,
				).map((resource) => (
					<ResourceCard key={resource.href} {...resource} />
				))}
			</div>
			<a href="#blog" className="no-underline">
				<h2 id="blog" className="text-2xl font-bold tracking-tight">
					Blog Posts
				</h2>
			</a>
			<ResourceFilter
				title="Filter by topic"
				tags={blogsTags}
				activeTag={activeFilters.blogPosts}
				onTagClick={(tag) =>
					setActiveFilters((prev) => ({ ...prev, blogPosts: tag }))
				}
			/>
			<div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
				{filterResources(resources.blogPosts, activeFilters.blogPosts).map(
					(resource) => (
						<ResourceCard key={resource.href} {...resource} />
					),
				)}
			</div>
		</div>
	);
}
