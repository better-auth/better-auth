import { setOutput as setActionOutput } from "@actions/core";

export function setOutput(name: string, value: string): void {
	if (process.env.GITHUB_OUTPUT) setActionOutput(name, value);
	console.log(
		`  ${name}: ${value.length > 100 ? `${value.slice(0, 100)}...` : value}`,
	);
}
