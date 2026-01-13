import { XMLParser } from "fast-xml-parser";

export const xmlParser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@_",
	removeNSPrefix: true,
	processEntities: false,
});

export function findNode(obj: unknown, nodeName: string): unknown {
	if (!obj || typeof obj !== "object") return null;

	const record = obj as Record<string, unknown>;

	if (nodeName in record) {
		return record[nodeName];
	}

	for (const value of Object.values(record)) {
		if (Array.isArray(value)) {
			for (const item of value) {
				const found = findNode(item, nodeName);
				if (found) return found;
			}
		} else if (typeof value === "object" && value !== null) {
			const found = findNode(value, nodeName);
			if (found) return found;
		}
	}

	return null;
}

export function countAllNodes(obj: unknown, nodeName: string): number {
	if (!obj || typeof obj !== "object") return 0;

	let count = 0;
	const record = obj as Record<string, unknown>;

	if (nodeName in record) {
		const node = record[nodeName];
		count += Array.isArray(node) ? node.length : 1;
	}

	for (const value of Object.values(record)) {
		if (Array.isArray(value)) {
			for (const item of value) {
				count += countAllNodes(item, nodeName);
			}
		} else if (typeof value === "object" && value !== null) {
			count += countAllNodes(value, nodeName);
		}
	}

	return count;
}
