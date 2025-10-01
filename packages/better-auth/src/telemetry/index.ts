let lazyImportCreateTelemetry: Promise<
	typeof import("./create-telemetry").createTelemetry
> | null = null;
// lazy load the telemetry module to split the bundle and avoid loading unnecessary code
export const createTelemetry: typeof import("./create-telemetry").createTelemetry =
	async (...args) => {
		if (!lazyImportCreateTelemetry) {
			lazyImportCreateTelemetry = import("./create-telemetry").then(
				(mod) => mod.createTelemetry,
			);
		}
		const createTelemetry = await lazyImportCreateTelemetry;
		return createTelemetry(...args);
	};
