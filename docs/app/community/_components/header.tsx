import { IconLink } from "@/app/changelogs/_components/changelog-layout";
import { GitHubIcon, XIcon } from "@/app/changelogs/_components/icons";
export default function CommunityHeader() {
	return (
		<div className="h-full flex flex-col justify-center items-center text-white">
			<div className="max-w-6xl mx-auto px-4 py-16">
				<div className="text-center mb-16">
					<h1 className="text-4xl tracking-tighter md:text-5xl mt-3 font-normal mb-6 text-stone-800 dark:text-white">
						Open Source Community
					</h1>
					<p className="dark:text-gray-400 max-w-md mx-auto text-stone-800">
						join <span className="italic font-bold">better-auth</span> community
						to get help, share ideas, and stay up to date.
					</p>
					<div className="flex justify-center items-center mt-6 space-x-6">
						<IconLink
							href="https://x.com/better_auth"
							icon={XIcon}
							className="flex-none text-gray-600 dark:text-gray-300"
						>
							X (formerly Twitter)
						</IconLink>
						<IconLink
							href="https://github.com/better-auth/better-auth"
							icon={GitHubIcon}
							className="flex-none text-gray-600 dark:text-gray-300"
						>
							GitHub
						</IconLink>
					</div>
				</div>
			</div>
		</div>
	);
}
