import { AnimatePresence } from "@/components/ui/fade-in";

const ChangelogOne = () => {
	return (
		<AnimatePresence>
			<div className="flex flex-col gap-4 items-start justify-center max-w-full md:max-w-2xl">
				<img
					src="https://camo.githubusercontent.com/3282afc585d07e52e883ac2345467841e5c9cbe3befdec9dd6f84c603748e0d4/68747470733a2f2f726573656e642e636f6d2f5f6e6578742f696d6167653f75726c3d253246737461746963253246706f737473253246776562686f6f6b732e6a706726773d36343026713d3735"
					className="w-full h-[400px] rounded-lg"
				/>
				<div className="flex flex-col gap-2">
					<h2 className="text-2xl font-bold tracking-tighter">
						Commit message suggestions
					</h2>
					<hr className="h-px bg-gray-200 w-full" />
				</div>
				<p className="text-gray-300 text-[0.855rem]">
					In the latest release, I've added support for commit message and
					description suggestions via an integration with OpenAI. Commit looks
					at all of your changes, and feeds that into the machine with a bit of
					prompt-tuning to get back a commit message that does a surprisingly
					good job at describing the intent of your changes. It's also been a
					pretty helpful way to remind myself what the hell I was working on at
					the end of the day yesterday when I get back to my computer and
					realize I didn't commit any of my work.
				</p>
				<div className="flex flex-col gap-2">
					<h4 className="text-xl tracking-tighter"> Improvement</h4>
					<hr className="h-px bg-gray-200 w-full" />
				</div>

				<ul className="list-disc ml-10 text-[0.855rem]">
					<li>
						Added commit message and description suggestions powered by OpenAI
					</li>
					<li>
						Started commit message and description suggestions powered by OpenAI
					</li>

					<li>
						Restored message and description suggestions powered by OpenAI
					</li>
					<li>
						Added commit message and description suggestions powered by OpenAI
					</li>
				</ul>
			</div>
		</AnimatePresence>
	);
};
export default ChangelogOne;
