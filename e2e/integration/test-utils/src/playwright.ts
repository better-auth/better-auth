import { createRequire } from "node:module";

export const terminate = createRequire(import.meta.url)(
	// use terminate instead of cp.kill,
	//  because cp.kill will not kill the child process of the child process
	//  to avoid the zombie process
	"terminate/promise",
) as (pid: number) => Promise<void>;
