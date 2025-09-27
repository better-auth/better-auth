#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";

function extractMetricsFromTrace(tracePath) {
	const traceFile = path.join(tracePath, "trace.json");
	const traceData = JSON.parse(fs.readFileSync(traceFile, "utf8"));

	const typesFile = path.join(tracePath, "types.json");
	let typesData = null;
	if (fs.existsSync(typesFile)) {
		typesData = JSON.parse(fs.readFileSync(typesFile, "utf8"));
	}

	const metrics = [];

	const eventsByCategory = {};
	let totalDuration = 0;
	let programStartTime = null;
	let programEndTime = null;

	for (const event of traceData) {
		if (!event.cat) continue;

		if (!eventsByCategory[event.cat]) {
			eventsByCategory[event.cat] = {
				count: 0,
				totalDuration: 0,
				events: [],
			};
		}

		eventsByCategory[event.cat].events.push(event);
		eventsByCategory[event.cat].count++;

		if (event.name === "createProgram" && event.ph === "B") {
			programStartTime = event.ts;
		}
		if (event.name === "createProgram" && event.ph === "E") {
			programEndTime = event.ts;
		}

		if (event.dur) {
			eventsByCategory[event.cat].totalDuration += event.dur;
		} else if (event.ph === "B") {
			const endEvent = traceData.find(
				(e) =>
					e.ph === "E" &&
					e.name === event.name &&
					e.ts > event.ts &&
					e.pid === event.pid &&
					e.tid === event.tid,
			);
			if (endEvent) {
				const duration = endEvent.ts - event.ts;
				eventsByCategory[event.cat].totalDuration += duration;
			}
		}
	}

	if (programStartTime && programEndTime) {
		totalDuration = (programEndTime - programStartTime) / 1000;
		metrics.push({
			name: "Total Compilation Time",
			unit: "ms",
			value: totalDuration,
		});
	} else {
		const timestamps = traceData.filter((e) => e.ts).map((e) => e.ts);
		if (timestamps.length > 0) {
			totalDuration =
				(Math.max(...timestamps) - Math.min(...timestamps)) / 1000;
			metrics.push({
				name: "Total Compilation Time",
				unit: "ms",
				value: totalDuration,
			});
		}
	}

	if (eventsByCategory["parse"]) {
		const parseTime = eventsByCategory["parse"].totalDuration / 1000;
		metrics.push({
			name: "Parse Time",
			unit: "ms",
			value: parseTime,
		});

		const parsedFiles = new Set(
			eventsByCategory["parse"].events
				.filter((e) => e.name === "createSourceFile")
				.map((e) => e.args?.path)
				.filter(Boolean),
		).size;

		metrics.push({
			name: "Files Parsed",
			unit: "files",
			value: parsedFiles,
		});
	}

	if (eventsByCategory["bind"]) {
		const bindTime = eventsByCategory["bind"].totalDuration / 1000;
		metrics.push({
			name: "Bind Time",
			unit: "ms",
			value: bindTime,
		});
	}

	if (eventsByCategory["check"]) {
		const checkTime = eventsByCategory["check"].totalDuration / 1000;
		metrics.push({
			name: "Type Check Time",
			unit: "ms",
			value: checkTime,
		});
	}

	if (eventsByCategory["emit"]) {
		const emitTime = eventsByCategory["emit"].totalDuration / 1000;
		metrics.push({
			name: "Emit Time",
			unit: "ms",
			value: emitTime,
		});
	}

	const moduleResolutionEvents = traceData.filter(
		(e) =>
			e.name === "resolveModuleNamesWorker" ||
			e.name === "resolveModuleName" ||
			e.name === "ResolveModule",
	);

	if (moduleResolutionEvents.length > 0) {
		const moduleResolutionTime =
			moduleResolutionEvents
				.filter((e) => e.dur)
				.reduce((sum, e) => sum + e.dur, 0) / 1000;

		metrics.push({
			name: "Module Resolution Time",
			unit: "ms",
			value: moduleResolutionTime,
		});

		metrics.push({
			name: "Module Resolutions",
			unit: "count",
			value: moduleResolutionEvents.length,
		});
	}

	if (typesData) {
		if (typesData.length) {
			metrics.push({
				name: "Total Types",
				unit: "count",
				value: typesData.length,
			});

			const typeKinds: Record<string, number> = {};
			for (const type of typesData) {
				const kind = type.kind || "unknown";
				typeKinds[kind] = (typeKinds[kind] || 0) + 1;
			}

			const sortedKinds = Object.entries(typeKinds)
				.sort((a, b) => b[1] - a[1])
				.slice(0, 5);

			for (const [kind, count] of sortedKinds) {
				metrics.push({
					name: `Type Kind: ${kind}`,
					unit: "count",
					value: count,
				});
			}
		}
	}

	if (totalDuration > 0) {
		const parseRatio =
			((metrics.find((m) => m.name === "Parse Time")?.value || 0) /
				totalDuration) *
			100;
		const checkRatio =
			((metrics.find((m) => m.name === "Type Check Time")?.value || 0) /
				totalDuration) *
			100;

		metrics.push({
			name: "Parse Time Ratio",
			unit: "%",
			value: parseRatio,
		});

		metrics.push({
			name: "Type Check Time Ratio",
			unit: "%",
			value: checkRatio,
		});
	}

	return metrics;
}

if (process.argv.length < 3) {
	console.error("Usage: node extract-tsc-metrics.mts <trace-directory>");
	process.exit(1);
}

const tracePath = process.argv[2];

if (!fs.existsSync(tracePath)) {
	console.error(`Directory not found: ${tracePath}`);
	process.exit(1);
}

try {
	const metrics = extractMetricsFromTrace(tracePath);
	console.log(JSON.stringify(metrics, null, 2));
} catch (error) {
	console.error(`Error parsing trace: ${error.message}`);
	process.exit(1);
}
