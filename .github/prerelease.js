import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

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
