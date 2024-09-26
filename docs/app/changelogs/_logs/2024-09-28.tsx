import { AnimatePresence } from "@/components/ui/fade-in";

const listOfFeatures = ["The first better-auth public beta release"];

const bugFixes = [""];

const ChangelogOne = () => {
	return (
		<AnimatePresence>
			<div className="flex flex-col gap-4 items-start justify-center max-w-full md:max-w-2xl">
				<div className="flex flex-col gap-2">
					<h2 className="text-2xl font-bold tracking-tighter">
						Public Beta Release
					</h2>
					<p>
						The first public beta release of better-auth is now available. This
						release includes a lot of new features and improvements.
					</p>
				</div>
				<p className="text-gray-600 dark:text-gray-300 text-[0.855rem]"></p>
				<div className="flex flex-col gap-2">
					<h4 className="text-xl tracking-tighter">Features</h4>
				</div>
				<ul className="list-disc ml-10 text-[0.855rem] text-gray-600 dark:text-gray-300">
					{listOfFeatures.map((change, i) => (
						<li key={i}>{change}</li>
					))}
				</ul>
			</div>
		</AnimatePresence>
	);
};
export default ChangelogOne;
