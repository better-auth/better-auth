import type { BetterAuthOptions } from "../../types";

export function createIsNumberIdModel(options: BetterAuthOptions) {
	const opt = options.advanced?.database?.useNumberId;
	const serialFallback = options.advanced?.database?.generateId === "serial";

	if (opt === true) return (_model: string) => true;
	if (opt === false) return (_model: string) => false;
	if (typeof opt === "function") return opt;
	if (Array.isArray(opt)) return (model: string) => opt.includes(model);
	// No useNumberId set → fall back to legacy behavior
	return (_model: string) => serialFallback;
}

export function anyModelUsesNumberId(options: BetterAuthOptions): boolean {
	const opt = options.advanced?.database?.useNumberId;
	if (opt === true) return true;
	if (opt === false) return false;
	if (typeof opt === "function") return true; // can't statically know

	if (Array.isArray(opt)) return opt.length > 0;
	return options.advanced?.database?.generateId === "serial";
}
