import React from "react";
import { InfiniteMovingCards } from "./infinite-scrolling";

type Props = {};

export interface Testimonial {
	id: number;
	from: string;
	avatar: string;
	message: string;
	link: string;
	social: "x" | "linkedin";
}

const testimonials1: Testimonial[] = [
	{
		id: 1,
		from: "Edgaras",
		avatar:
			"https://pbs.twimg.com/profile_images/1648089090947010560/xGxBzHki_400x400.jpg",
		message:
			"🥈 @better_auth is approaching v1 release - promising to become the most comprehensive, framework-agnostic authentication library for TypeScript. Perfect for developers who want to focus on building their application!",
		link: "https://x.com/edgarasben/status/1856336936505590160",
		social: "linkedin",
	},
	{
		id: 2,
		from: "Yusuf Mansur Özer",
		avatar:
			"https://pbs.twimg.com/profile_images/1532002119972274177/D3SKwakL_400x400.jpg",
		message:
			"Better Auth looks so nice and complete. Will definitely try it out after v1. I am currently with Nuxt Auth Utils it is great to start but Better Auth might be the way to go for bigger projects. 👀",
		link: "https://x.com/ymansurozer/status/1855579561875943731",
		social: "x",
	},
	{
		id: 3,
		from: "Yusuf Mansur Özer",
		avatar:
			"https://pbs.twimg.com/profile_images/1532002119972274177/D3SKwakL_400x400.jpg",
		message:
			"Better Auth looks so nice and complete. Will definitely try it out after v1. I am currently with Nuxt Auth Utils it is great to start but Better Auth might be the way to go for bigger projects. 👀",
		link: "https://x.com/ymansurozer/status/1855579561875943731",
		social: "x",
	},
	{
		id: 4,
		from: "Yusuf Mansur Özer",
		avatar:
			"https://pbs.twimg.com/profile_images/1532002119972274177/D3SKwakL_400x400.jpg",
		message:
			"Better Auth looks so nice and complete. Will definitely try it out after v1. I am currently with Nuxt Auth Utils it is great to start but Better Auth might be the way to go for bigger projects. 👀",
		link: "https://x.com/ymansurozer/status/1855579561875943731",
		social: "x",
	},
];

const testimonials2: Testimonial[] = [
	{
		id: 1,
		from: "Edgaras",
		avatar:
			"https://pbs.twimg.com/profile_images/1648089090947010560/xGxBzHki_400x400.jpg",
		message:
			"🥈 @better_auth is approaching v1 release - promising to become the most comprehensive, framework-agnostic authentication library for TypeScript. Perfect for developers who want to focus on building their application!",
		link: "https://x.com/edgarasben/status/1856336936505590160",
		social: "x",
	},
	{
		id: 2,
		from: "Yusuf Mansur Özer",
		avatar:
			"https://pbs.twimg.com/profile_images/1532002119972274177/D3SKwakL_400x400.jpg",
		message:
			"Better Auth looks so nice and complete. Will definitely try it out after v1. I am currently with Nuxt Auth Utils it is great to start but Better Auth might be the way to go for bigger projects. 👀",
		link: "https://x.com/ymansurozer/status/1855579561875943731",
		social: "x",
	},
	{
		id: 3,
		from: "Yusuf Mansur Özer",
		avatar:
			"https://pbs.twimg.com/profile_images/1532002119972274177/D3SKwakL_400x400.jpg",
		message:
			"Better Auth looks so nice and complete. Will definitely try it out after v1. I am currently with Nuxt Auth Utils it is great to start but Better Auth might be the way to go for bigger projects. 👀",
		link: "https://x.com/ymansurozer/status/1855579561875943731",
		social: "x",
	},
	{
		id: 4,
		from: "Yusuf Mansur Özer",
		avatar:
			"https://pbs.twimg.com/profile_images/1532002119972274177/D3SKwakL_400x400.jpg",
		message:
			"Better Auth looks so nice and complete. Will definitely try it out after v1. I am currently with Nuxt Auth Utils it is great to start but Better Auth might be the way to go for bigger projects. 👀",
		link: "https://x.com/ymansurozer/status/1855579561875943731",
		social: "x",
	},
];

export default function Testimonial({}: Props) {
	return (
		<div className="px-8 py-12 overflow-auto border-l-[1.2px]">
			<InfiniteMovingCards items={testimonials1} />
			<InfiniteMovingCards
				direction="right"
				items={testimonials2}
				speed="normal"
			/>
		</div>
	);
}
