import * as fs from "fs";
import path from "path";

export type State = "IDLE" | "RUNNING";

export function makeTestState(dirname: string) {
	const stateFilePath = path.join(dirname, "./state.txt");

	function getState(): State {
		try {
			return fs
				.readFileSync(stateFilePath, "utf-8")
				.split("\n")[0]!
				.trim() as State;
		} catch {
			return "IDLE";
		}
	}

	function setState(state: State) {
		fs.writeFileSync(stateFilePath, state, "utf-8");
	}

	return { stateFilePath, getState, setState };
}
