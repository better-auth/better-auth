import { Badge } from "@/components/ui/badge";
import { AnimatePresence } from "@/components/ui/fade-in";
import Link from "next/link";

const listOfFeatures = [
	"Database adapters support including prisma, drizzle and mongo db.",
	"Database hooks",
	"CrossDomain cookies",
	"onRequest and onResponse plugin hooks",
	"init interface for plugins",
];

const ChangelogOne = () => {
	return (
		<AnimatePresence>
			<div className="flex flex-col gap-4 items-start justify-center max-w-full md:max-w-2xl">
				<div className="flex flex-col gap-2">
					<h2 className="text-2xl font-bold tracking-tighter">v0.2.0</h2>
					<p>
						We have added support for database adapters including prisma,
						drizzle and mongo db and other changes.
					</p>
				</div>
				<p className="text-gray-600 dark:text-gray-300 text-[0.855rem]"></p>
				<div className="flex flex-col gap-2">
					<h4 className="text-xl tracking-tighter">Changes</h4>
				</div>
				<ul className="list-disc ml-10 text-[0.855rem] text-gray-600 dark:text-gray-300">
					{listOfFeatures.map((change, i) => (
						<li key={i}>{change}</li>
					))}
				</ul>
				<p>
					see{" "}
					<Link href="https://github.com/better-auth/better-auth/releases/tag/v0.2.0">
						Changelog
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
export default ChangelogOne;
