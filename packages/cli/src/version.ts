import packageJson from "../package.json" with { type: "json" };

export const cliVersion = packageJson.version;
