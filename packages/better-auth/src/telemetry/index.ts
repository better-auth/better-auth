let lazyImportCreateTelemetry: Promise<
	typeof import("./create-telemetry").createTelemetry
> | null = null;
// lazy load the telemetry module to split the bundle and avoid loading unnecessary code
export const createTelemetry: typeof import("./create-telemetry").createTelemetry =
	async (...args) => {
		if (!lazyImportCreateTelemetry) {
			// keep esbuild from following dynamic import during bundling
			const importPath = "./create-telemetry";
			lazyImportCreateTelemetry = import(importPath).then(
				(mod) => mod.createTelemetry,
			);
		}
		const createTelemetry = await lazyImportCreateTelemetry;
		return createTelemetry(...args);
	};
