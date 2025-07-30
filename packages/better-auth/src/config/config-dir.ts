import os from "node:os";
import path from "node:path";
import process from "node:process";

export function getConfigDir(name: string) {
	const homedir = os.homedir();

	const macos = () => path.join(homedir, "Library", "Preferences", name);

	const win = () => {
		const { APPDATA = path.join(homedir, "AppData", "Roaming") } = process.env;
		return path.join(APPDATA, name, "Config");
	};

	const linux = () => {
		const { XDG_CONFIG_HOME = path.join(homedir, ".config") } = process.env;
		return path.join(XDG_CONFIG_HOME, name);
	};

	switch (process.platform) {
		case "darwin":
			return macos();
		case "win32":
			return win();
		default:
			return linux();
	}
}
