import React from "react";
import { InfiniteMovingCards } from "./infinite-scrolling";

type Props = {};

export interface Testimonial {
	id: number;
	from: string;
	avatar: string;
	message: string;
	link: string;
	social: "x" | "linkedin" | "telegram";
}

const testimonials: Testimonial[] = [
	{
		id: 1,
		from: "Dev Ed",
		avatar:
			"https://pbs.twimg.com/profile_images/1620476753398452224/fcozbw1J_400x400.jpg",
		message:
			"This has been the best auth experience by a mileee, auto generated my drizzle schemas for users, sessions etc, full type safe and dead simple api, well done  @better_auth 👏👏",
		link: "https://x.com/edgarasben/status/1856336936505590160",
		social: "x",
	},
	{
		id: 2,
		from: "Sébastien Chopin",
		avatar:
			"https://pbs.twimg.com/profile_images/1042510623962275840/1Iw_Mvud_400x400.jpg",
		message:
			"When @better_auth meets  @nuxt_hub to build full-stack Nuxt apps on Cloudflare (using D1 & KV).",
		link: "https://x.com/Atinux/status/1853751424561336322",
		social: "x",
	},
	{
		id: 10,
		from: "Kevin Kern",
		message:
			"Digging into better-auth.com this weekend. Check it out really cool lib",
		link: "https://x.com/kregenrek/status/1855395938262831140",
		social: "x",
		avatar:
			"https://pbs.twimg.com/profile_images/1849574174785732608/ltlLcyaT_400x400.jpg",
	},
	{
		id: 6,
		from: "Jonathan Wilke",
		message: "fuck, @better_auth is just so good",
		avatar:
			"https://pbs.twimg.com/profile_images/1849386198537560064/NKFdXusJ_400x400.jpg",
		link: "https://x.com/jonathan_wilke/status/1853086900279562329",
		social: "x",
	},

	{
		id: 5,
		from: "Tim⚡Dev",
		avatar:
			"https://pbs.twimg.com/profile_images/1835593762833354752/1bN3_d3F_400x400.jpg",
		message:
			"I love the js ecosystem. There’s always something disruptive happening. Just heard about @better_auth",
		link: "https://x.com/TimOConnellDev/status/1845273839506530404",
		social: "x",
	},
	{
		id: 3,
		from: "Yared Y Tegegn",
		avatar:
			"https://pbs.twimg.com/profile_images/1854956005391532033/aLu4S0pU_400x400.jpg",
		message:
			"It took me only 30 minutes to setup auth in my project thanks to @better_auth . Hands down, the best auth library I have ever used.",
		link: "https://x.com/yared_ow/status/1848435855309873453",
		social: "x",
	},
	{
		id: 7,
		from: "Paul Jasper",
		message:
			"Solved auth for my next project and I’m pretty happy with it: @better_auth with @prisma serverless database. What a great team!",
		avatar:
			"https://pbs.twimg.com/profile_images/1788425134170066944/wPanxB4f_400x400.jpg",
		link: "https://x.com/pauljasperdev/status/1854938664645558279",
		social: "x",
	},
	{
		id: 8,
		from: "Glenno",
		message:
			"Someone has finally nailed auth for Typescript projects. I have been searching for something like this for years.  Years. Anonymous auth, passcodes, 2fa, plugin architecture. Brilliant work @better_auth.",
		avatar:
			"https://pbs.twimg.com/profile_images/1850320546702958592/05O2vFM9_400x400.jpg",
		link: "https://x.com/ammostockpile/status/1854150422170354174",
		social: "x",
	},
	{
		id: 9,
		from: "Yusuf Mansur Özer",
		message:
			"Better Auth looks so nice and complete. Will definitely try it out after v1. I am currently with Nuxt Auth Utils it is great to start but Better Auth might be the way to go for bigger projects. 👀",
		avatar:
			"https://pbs.twimg.com/profile_images/1532002119972274177/D3SKwakL_400x400.jpg",
		link: "https://x.com/ymansurozer/status/1855579561875943731",
		social: "x",
	},
	{
		id: 4,
		from: "Dagamwi Babi",
		avatar:
			"https://pbs.twimg.com/profile_images/1853424779392380928/NMpggRqG_400x400.jpg",
		message:
			"@better_auth exceeded all expectations, and it's just getting started",
		link: "https://x.com/DagmawiBabi/status/1845966382703280458",
		social: "x",
	},
];

export default function Testimonial({}: Props) {
	return (
		<div className="px-8 py-12 overflow-auto border-l-[1.2px]">
			<InfiniteMovingCards items={testimonials.slice(0, 5)} />
			<InfiniteMovingCards
				direction="right"
				items={testimonials.slice(5, 10)}
				speed="normal"
			/>
		</div>
	);
}
