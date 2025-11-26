export default function CommunityHeader() {
	return (
		<div className="h-full flex flex-col justify-center items-center text-white">
			<div className="max-w-6xl mx-auto px-4 py-16">
				<div className="text-center">
					<h1 className="text-4xl tracking-tighter md:text-5xl mt-3 font-normal mb-6 text-stone-800 dark:text-white">
						Community
					</h1>
					<p className="dark:text-gray-400 max-w-md mx-auto text-stone-800">
						join <span className="italic font-bold">better-auth</span> community
						to get help, share ideas, and stay up to date with the latest news
						and updates.
					</p>
				</div>
			</div>
		</div>
	);
}
