export type GemEmploymentType =
	| "contract"
	| "full_time"
	| "intern"
	| "part_time"
	| "temporary"
	| (string & {});

export interface GemLocationName {
	name: string;
}

export interface GemDepartment {
	id?: string;
	name: string;
	parent_id?: string | null;
	child_ids?: string[];
}

export interface GemJobPost {
	id: string;
	title: string;
	absolute_url: string;
	content?: string;
	content_plain?: string;
	departments?: GemDepartment[] | null;
	location?: GemLocationName | null;
	employment_type: GemEmploymentType;
}

const JOB_POSTS_URL = "https://api.gem.com/job_board/v0/better-auth/job_posts";

type JobBase = Pick<
	GemJobPost,
	| "id"
	| "title"
	| "absolute_url"
	| "departments"
	| "location"
	| "employment_type"
>;

export type RawJob = JobBase & Pick<GemJobPost, "content" | "content_plain">;

export type Job = JobBase & {
	roleParagraphs: string[];
};

export function getRoleParagraphs(contentPlain?: string): string[] {
	if (!contentPlain) return [];

	const normalize = (line: string) =>
		line
			.replace(/[\u2018\u2019']/g, "'")
			.replace(/\s+/g, " ")
			.replace(/:\s*$/, "")
			.trim();

	const isHeading = (line: string) => {
		const n = normalize(line);
		return (
			n.length > 0 && n.length <= 48 && /^[A-Z0-9]/.test(n) && !/[.!?]$/.test(n)
		);
	};

	const isRoleSection = (line: string) => {
		const n = normalize(line);
		return /^(?:about\s+)?(?:the\s+)?role$/i.test(n) && isHeading(line);
	};

	const lines = contentPlain
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	const roleIndex = lines.findIndex(isRoleSection);
	if (roleIndex === -1) return [];

	const paragraphs: string[] = [];
	for (const line of lines.slice(roleIndex + 1)) {
		if (isHeading(line)) break;
		paragraphs.push(line.replace(/\s+/g, " ").trim());
	}

	return paragraphs;
}

export function toJob(rawJob: RawJob): Job {
	const { content: _content, content_plain, ...job } = rawJob;

	return {
		...job,
		roleParagraphs: getRoleParagraphs(content_plain),
	};
}

export async function fetchGemJobPosts(): Promise<GemJobPost[]> {
	try {
		const res = await fetch(JOB_POSTS_URL, {
			next: { revalidate: 60 },
		});
		if (!res.ok) {
			console.error("Failed to fetch Gem job posts:", res.status);
			return [];
		}

		const data = await res.json();
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
