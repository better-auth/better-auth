import * as fs from "node:fs";
import path from "node:path";

export type State = "IDLE" | "RUNNING";

export const stateFilePath = path.join(__dirname, "./state.txt");

export function getState(): State {
	return fs.readFileSync(stateFilePath, "utf-8").split("\n")[0].trim() as State;
}

export function setState(state: State) {
	fs.writeFileSync(stateFilePath, state, "utf-8");
}
