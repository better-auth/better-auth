import { release } from "os";
import { Progress } from "./ui/progress";
import { motion } from "framer-motion";
import Link from "next/link";

async function getNpmVersion() {
	try {
		const response = await fetch("https://registry.npmjs.org/better-auth", {
			next: {
				revalidate: 60,
			},
		});
		if (!response?.ok) {
			return null;
		}
		const json = await response.json();
		console.log({ json });
		const versions = json.versions as Record<string, string>[];
		const versionToKey = Object.keys(versions);
		const latestVersion = versionToKey[versionToKey.length - 1];
		const releases = latestVersion.split(".").slice(0, 3);
		const betaCandidate = releases[releases.length - 1];
		releases[releases.length - 1] = betaCandidate.includes("beta")
			? betaCandidate.split("-")[0]
			: betaCandidate;

		return releases;
	} catch {
		return null;
	}
}
export const VersionProgress = async () => {
	const version = await getNpmVersion();
	if (!version?.length) {
		return <></>;
	}

	const majorVersion = version[0];
	const minorPatch = parseInt(version.slice(1, 3).join(""));
	const currentPercent = (minorPatch / 100) * 100;
	return (
		<Link
			href="https://github.com/orgs/better-auth/projects/2"
			className="w-full"
		>
			<div className="inline-flex bg-background ring-black border border-input shadow-sm hover:border hover:border-input hover:text-accent-foreground rounded-none h-10 p-5 ml-auto z-50 overflow-hidden text-sm font-medium focus-visible:outline-none  disabled:pointer-events-none disabled:opacity-50 bg-transprent dark:text-white text-black px-4 py-2 max-w-[14rem] whitespace-pre md:flex group relative w-full justify-center items-center gap-2 transition-all duration-300 ease-out hover:ring-black">
				<div className="flex w-full gap-2 items-center">
					<p style={{ fontFamily: "monospace" }}>v{majorVersion}.0</p>
					<Progress value={currentPercent} />
					<p style={{ fontFamily: "monospace" }}>{currentPercent}%</p>
				</div>
			</div>
		</Link>
	);
};
