import type { SCIMAttributeProjection } from "./collection-query";

/** Minimum shape required for SCIM response attribute projection. */
export interface SCIMProjectableResource {
	schemas: readonly string[];
	id: string;
}

/** A projected resource always retains the mandatory SCIM identity fields. */
export type SCIMProjectedResource<Resource extends SCIMProjectableResource> =
	Pick<Resource, "schemas" | "id"> & Partial<Omit<Resource, "schemas" | "id">>;

interface AttributePathNode {
	selected: boolean;
	children: Map<string, AttributePathNode>;
}

type SelectedValue = { selected: true; value: unknown } | { selected: false };

function createAttributePathNode(): AttributePathNode {
	return { selected: false, children: new Map() };
}

function createAttributePathTree(
	attributePaths: ReadonlySet<string>,
): AttributePathNode {
	const root = createAttributePathNode();

	for (const attributePath of attributePaths) {
		const segments = attributePath.split(".");
		let node = root;
		for (const segment of segments) {
			const normalizedSegment = segment.toLowerCase();
			let child = node.children.get(normalizedSegment);
			if (!child) {
				child = createAttributePathNode();
				node.children.set(normalizedSegment, child);
			}
			node = child;
		}
		node.selected = true;
	}

	return root;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function includeSelectedValue(
	value: unknown,
	node: AttributePathNode,
): SelectedValue {
	if (node.selected) return { selected: true, value };

	if (Array.isArray(value)) {
		const selectedItems: unknown[] = [];
		for (const item of value) {
			const selectedItem = includeSelectedValue(item, node);
			if (selectedItem.selected) selectedItems.push(selectedItem.value);
		}
		return selectedItems.length > 0
			? { selected: true, value: selectedItems }
			: { selected: false };
	}

	if (!isRecord(value)) return { selected: false };

	const selectedObject: Record<string, unknown> = {};
	for (const [key, childValue] of Object.entries(value)) {
		const childNode = node.children.get(key.toLowerCase());
		if (!childNode) continue;
		const selectedChild = includeSelectedValue(childValue, childNode);
		if (selectedChild.selected) selectedObject[key] = selectedChild.value;
	}

	return Object.keys(selectedObject).length > 0
		? { selected: true, value: selectedObject }
		: { selected: false };
}

function excludeSelectedValue(
	value: unknown,
	node: AttributePathNode,
): SelectedValue {
	if (node.selected) return { selected: false };

	if (Array.isArray(value)) {
		return {
			selected: true,
			value: value.flatMap((item) => {
				const selectedItem = excludeSelectedValue(item, node);
				return selectedItem.selected ? [selectedItem.value] : [];
			}),
		};
	}

	if (!isRecord(value)) return { selected: true, value };

	const selectedObject: Record<string, unknown> = {};
	for (const [key, childValue] of Object.entries(value)) {
		const childNode = node.children.get(key.toLowerCase());
		if (!childNode) {
			selectedObject[key] = childValue;
			continue;
		}

		const selectedChild = excludeSelectedValue(childValue, childNode);
		if (selectedChild.selected) selectedObject[key] = selectedChild.value;
	}
	return { selected: true, value: selectedObject };
}

/**
 * Apply SCIM `attributes` or `excludedAttributes` selection without mutating
 * the canonical resource. Attribute matching is case-insensitive while output
 * retains the resource's original key spelling.
 */
export function projectSCIMResourceAttributes<
	Resource extends SCIMProjectableResource,
>(
	resource: Resource,
	projection: SCIMAttributeProjection,
): SCIMProjectedResource<Resource> {
	if (projection.mode === "default") {
		return { ...resource };
	}

	const attributePaths =
		projection.mode === "include"
			? projection.attributes
			: projection.excludedAttributes;
	const tree = createAttributePathTree(attributePaths);
	const output: Record<string, unknown> = {
		schemas: resource.schemas,
		id: resource.id,
	};

	for (const [key, value] of Object.entries(resource)) {
		const normalizedKey = key.toLowerCase();
		if (normalizedKey === "schemas" || normalizedKey === "id") continue;

		const node = tree.children.get(normalizedKey);
		if (projection.mode === "include") {
			if (!node) continue;
			const selectedValue = includeSelectedValue(value, node);
			if (selectedValue.selected) output[key] = selectedValue.value;
			continue;
		}

		if (!node) {
			output[key] = value;
			continue;
		}
		const selectedValue = excludeSelectedValue(value, node);
		if (selectedValue.selected) output[key] = selectedValue.value;
	}

	return output as SCIMProjectedResource<Resource>;
}
