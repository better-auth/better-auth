// ORIGINALLY FROM CLOUDFLARE WRANGLER:
// https://github.com/cloudflare/wrangler2/blob/main/.github/changeset-version.js

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// This script is used by pre-release workflows to update the version of packages being released.
// It enters pre-release mode, runs changeset version to create pre-release versions,
// and updates the package-lock.json file.

async function prerelease() {
	try {
		console.log("Entering pre-release mode...");
		await execAsync("npx changeset pre enter next");

		console.log("Updating package versions for pre-release...");
		await execAsync("npx changeset version");

		console.log("Updating package-lock.json...");
		await execAsync("npm install");

		console.log("Pre-release versioning completed successfully!");
	} catch (error) {
		console.error("Error during pre-release process:", error);
		process.exit(1);
	}
}

prerelease();
