import { Badge } from "@/components/ui/badge";
import { AnimatePresence } from "@/components/ui/fade-in";
import Link from "next/link";

const listOfFeatures = [
	"Database Schema Generation",
	"Phone Number Plugin",
	"Anonymous Plugin",
	"Better type Inference",
	"User Delete API",
	"Custom table/model names",
	"Removed flat db config",
	"new core table for verification use cases",
	"moved passkey challenge keys to be stored on db ",
	"and many bug fixes and improvements",
];

const ChangelogThree = () => {
	return (
		<AnimatePresence>
			<div className="flex flex-col gap-4 items-start justify-center max-w-full md:max-w-2xl">
				<div className="flex flex-col gap-2">
					<h2 className="text-2xl font-bold tracking-tighter">v0.3.0</h2>
					<p>
						Database Schema Generation, Phone Number Plugin, Anonymous Plugin,
						Better type Inference, Custom table names, and many more.
					</p>
				</div>
				<p className="text-gray-600 dark:text-gray-300 text-[0.855rem]"></p>
				<div className="flex flex-col gap-2">
					<h4 className="text-xl tracking-tighter">Features & Changes</h4>
				</div>
				<ul className="list-disc ml-10 text-[0.855rem] text-gray-600 dark:text-gray-300">
					{listOfFeatures.map((change, i) => (
						<li key={i}>{change}</li>
					))}
				</ul>
				<p>
					see{" "}
					<Link
						href="https://github.com/better-auth/better-auth/releases/tag/v0.3.0"
						className="underline"
					>
						release note{" "}
					</Link>
					for full list of changes.
				</p>
				<Badge variant="secondary">
					🚧 We still in beta and we don't recommend to use better-auth in
					production just yet.
				</Badge>
			</div>
		</AnimatePresence>
	);
};
export default ChangelogThree;
