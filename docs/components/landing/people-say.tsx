import { cn } from "@/lib/utils";
import { Icons } from "../icons";
import Link from "next/link";

const testimonials = [
	{
		name: "Dev Ed",
		profession: "Content Creator",
		link: "https://x.com/edgarasben/status/1856336936505590160",
		description:
			"This has been the best auth experience by a mileee, auto generated my drizzle schemas for users, sessions etc, full type safe and dead simple api, well done @better_auth 👏👏",
		avatar:
			"https://pbs.twimg.com/profile_images/1620476753398452224/fcozbw1J_400x400.jpg",
		image: "",
		social: <Icons.x />,
	},
	{
		name: "Sébastien Chopin",
		profession: "Creator of Nuxt & NuxtLabs",
		link: "https://x.com/Atinux/status/1853751424561336322",
		description:
			"When @better_auth meets @nuxt_hub to build full-stack Nuxt apps on Cloudflare (using D1 & KV).",
		avatar:
			"https://pbs.twimg.com/profile_images/1862505215624142848/7tSrng8r_400x400.jpg",
		image: "",
		social: <Icons.x />,
	},
	{
		name: "Kevin Kern",
		profession: "Developer",
		link: "https://x.com/kregenrek/status/1855395938262831140",
		description:
			"Digging into better-auth.com this weekend. Check it out really cool lib",
		avatar:
			"https://pbs.twimg.com/profile_images/1849574174785732608/ltlLcyaT_400x400.jpg",
		image: "",
		social: <Icons.x />,
	},
	{
		name: "Jonathan Wilke",
		profession: "Creator of Supastarter",
		link: "https://x.com/jonathan_wilke/status/1853086900279562329",
		description: "fuck, @better_auth is just so good",
		avatar:
			"https://pbs.twimg.com/profile_images/1849386198537560064/NKFdXusJ_400x400.jpg",
		image: "",
		social: <Icons.x />,
	},
	{
		name: "Tim⚡Dev",
		profession: "Developer",
		link: "https://x.com/TimOConnellDev/status/1845273839506530404",
		description:
			"I love the js ecosystem. There’s always something disruptive happening. Just heard about @better_auth",
		avatar:
			"https://pbs.twimg.com/profile_images/1835593762833354752/1bN3_d3F_400x400.jpg",
		image: "",
		social: <Icons.x />,
	},
	{
		name: "Yared Y Tegegn",
		profession: "Developer",
		link: "https://x.com/yared_ow/status/1848435855309873453",
		description:
			"It took me only 30 minutes to setup auth in my project thanks to @better_auth. Hands down, the best auth library I have ever used.",
		avatar:
			"https://pbs.twimg.com/profile_images/1854956005391532033/aLu4S0pU_400x400.jpg",
		image: "",
		social: <Icons.x />,
	},
	{
		name: "Paul Jasper",
		profession: "Indie hacker",
		link: "https://x.com/pauljasperdev/status/1854938664645558279",
		description:
			"Solved auth for my next project and I’m pretty happy with it: @better_auth with @prisma serverless database. What a great team!",
		avatar:
			"https://pbs.twimg.com/profile_images/1788425134170066944/wPanxB4f_400x400.jpg",
		image: "",
		social: <Icons.x />,
	},
	{
		name: "Tech Nerd",
		profession: "Developer",
		link: "https://x.com/TechNerd556/status/1863523931614822784",
		description:
			"Using @better_auth with custom components feels like having someone hand you the remote while you're comfortably on the sofa. The ease I'm feeling rn is insane Auth done in under 5 minutes 🤌⚡️.",
		avatar:
			"https://pbs.twimg.com/profile_images/1826246307326902273/Ee4nlPjH_400x400.jpg",
		image: "",
		social: <Icons.x />,
	},
	{
		name: "Yusuf Mansur Özer",
		profession: "Developer",
		link: "https://x.com/ymansurozer/status/1855579561875943731",
		description:
			"Better Auth looks so nice and complete. Will definitely try it out after v1. I am currently with Nuxt Auth Utils it is great to start but Better Auth might be the way to go for bigger projects. 👀",
		avatar:
			"https://pbs.twimg.com/profile_images/1532002119972274177/D3SKwakL_400x400.jpg",
		image: "",
		social: <Icons.x />,
	},
	{
		name: "Dagmawi Babi",
		profession: "Developer",
		link: "https://x.com/DagmawiBabi/status/1845966382703280458",
		description:
			"@better_auth exceeded all expectations, and it's just getting started",
		avatar:
			"https://pbs.twimg.com/profile_images/1853424779392380928/NMpggRqG_400x400.jpg",
		image: "",
		social: <Icons.x />,
	},
];
type TestimonialProps = (typeof testimonials)[number];
const PeopleSay = ({
	reverse = false,
	testimonials,
}: {
	reverse?: boolean;
	testimonials: TestimonialProps[];
}) => {
	const animeSeconds = testimonials.length * 10;
	return (
		<div className="mx-auto  max-w-full">
			<div
				className={`[--anime-duration:${animeSeconds}s] px-10 mx-auto w-full`}
			>
				<div
					style={{
						animationDuration: `${animeSeconds}s`,
					}}
					className={cn(
						"scroller flex flex-nowrap w-max min-w-full duration-[1000s] hover:[animation-play-state:paused] overflow-hidden relative gap-5 justify-around shrink-0",
						reverse ? "animate-hrtl-scroll-reverse " : "animate-hrtl-scroll",
					)}
				>
					{testimonials.map((testimonial, indx) => {
						return (
							<div
								key={indx}
								className={cn(
									"flex flex-col justify-between h-[220px] rounded-none border-[1.2px] border-black/20 shrink-0 grow-0 w-[450px] dark:border-white/10",
								)}
							>
								<p className="py-5 px-5 text-md font-extralight tracking-tight sm:text-xl md:text-lg text-pretty text-text-primary dark:text-dark-text-primary">
									&quot;{testimonial.description}.&quot;
								</p>
								<div className="flex overflow-hidden h-[28%] gap-1 w-full border-t-[1.2px]">
									<div className="flex gap-3 items-center py-3 px-4 w-3/4">
										<img
											src={testimonial.avatar}
											className="w-10 rounded-full h-10"
											alt="avatar"
										/>
										<div className="flex flex-col flex-1 gap-0 justify-start items-start">
											<h5 className="text-base font-medium md:text-md">
												{testimonial.name}
											</h5>
											<p className="text-sm md:text-base text-black/30 mt-[-4px] text-text-tertiary dark:text-white/50 dark:text-dark-text-tertiary">
												{testimonial.profession}
											</p>
										</div>
									</div>
									<div className="w-[1px] bg-black/20 dark:bg-white/20" />
									<div className="flex justify-center items-center mx-auto max-w-full">
										<Link href={testimonial.link} target="_blank">
											{testimonial.social}
										</Link>
									</div>
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
};

export const Testimonial = () => {
	return (
		<div className="mx-auto overflow-hidden py-5 max-w-full">
			<div className="flex flex-col gap-3">
				<div
					style={{
						maskImage:
							"linear-gradient(to left, transparent 0%, black 20%, black 80%, transparent 95%)",
					}}
					className="flex overflow-hidden relative gap-5 justify-around shrink-0"
				>
					<PeopleSay
						reverse
						testimonials={Array(10)
							.fill(testimonials.slice(0, Math.floor(testimonials.length / 2)))
							.flat()}
					/>
				</div>
				<div
					style={{
						maskImage:
							"linear-gradient(to left, transparent 0%, black 20%, black 80%, transparent 95%)",
					}}
					className="flex overflow-hidden relative gap-5 justify-around shrink-0"
				>
					<PeopleSay
						testimonials={Array(10)
							.fill(
								testimonials.slice(
									Math.floor(testimonials.length / 2) + 1,
									testimonials.length - 1,
								),
							)
							.flat()}
					/>
				</div>
			</div>
		</div>
	);
};
