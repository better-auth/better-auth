// Gem ATS Job Board API client.
// Reference: https://api.gem.com/job_board/v0/reference
// OpenAPI spec: https://api.gem.com/job_board/v0/openapi.json

// Open unions: spec lists known values, but the API is v0 and may add more.
// `(string & {})` keeps autocomplete on the literals while accepting any string.
export type GemEmploymentType =
	| "contract"
	| "full_time"
	| "intern"
	| "part_time"
	| "temporary"
	| (string & {});

export type GemLocationType = "in_office" | "hybrid" | "remote" | (string & {});

export interface GemLocationName {
	name: string;
}

export interface GemDepartment {
	id: string;
	name: string;
	parent_id: string | null;
	child_ids: string[];
}

export interface GemOffice {
	id: string;
	name: string;
	location: GemLocationName;
	parent_id: string | null;
	child_ids: string[];
	parent_office_external_id: string | null;
	child_office_external_ids: string[];
	deleted_at?: string;
}

export interface GemJobPost {
	id: string;
	title: string;
	first_published_at: string;
	internal_job_id: string;
	content: string;
	content_plain: string;
	created_at: string;
	updated_at: string;
	departments: GemDepartment[];
	offices: GemOffice[];
	absolute_url: string;
	location?: GemLocationName;
	location_type: GemLocationType;
	employment_type: GemEmploymentType;
	requisition_id: string;
}

const VANITY_URL_PATH = "better-auth";
const JOB_POSTS_URL = `https://api.gem.com/job_board/v0/${VANITY_URL_PATH}/job_posts/`;

export async function fetchGemJobPosts(): Promise<GemJobPost[]> {
	try {
		const response = await fetch(JOB_POSTS_URL, {
			next: { revalidate: 3600 },
		});
		if (!response.ok) {
			console.error("Failed to fetch Gem job posts:", response.status);
			return [];
		}
		const data = await response.json();
		if (!Array.isArray(data)) {
			console.error("Unexpected Gem response shape:", typeof data);
			return [];
		}
		return data as GemJobPost[];
	} catch (error) {
		console.error("Error fetching Gem job posts:", error);
		return [];
	}
}

/**
 * Title-case a snake_case enum value from Gem (e.g. `full_time` → `Full Time`)
 *
 * @see https://api.gem.com/job_board/v0/openapi.json
 */
export function formatGemEnum(value: string): string {
	return value
		.split("_")
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}
