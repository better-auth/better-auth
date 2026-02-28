import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const raw = execSync(
	"gh api repos/better-auth/better-auth/contributors --paginate",
	{ encoding: "utf-8" },
);
const data = JSON.parse(raw);
const filtered = data
	.filter((c) => c.type !== "Bot" && !c.login.includes("[bot]"))
	.map((c) => ({
		login: c.login,
		avatar_url: c.avatar_url,
		html_url: c.html_url,
	}));

writeFileSync("lib/contributors-data.json", JSON.stringify(filtered, null, 2));
console.log(`${filtered.length} contributors saved`);
