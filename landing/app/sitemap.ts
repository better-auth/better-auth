import type { MetadataRoute } from "next";
import { blogs, source } from "@/lib/source";
import { baseUrl } from "@/lib/utils";

export const revalidate = false;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const url = (path: string): string => new URL(path, baseUrl).toString();
	const docPages = await Promise.all(
		source.getPages().map(async (page) => {
			const { lastModified } = await page.data.load();

			return {
				url: url(page.url),
				lastModified: lastModified ? new Date(lastModified) : undefined,
				priority: 0.5,
			} satisfies MetadataRoute.Sitemap[number];
		}),
	);

	const blogPages = blogs.getPages().map((page) => {
		const lastModified = page.data.lastModified;

		return {
			url: url(page.url),
			lastModified: lastModified ? new Date(lastModified) : undefined,
			priority: 0.6,
		} satisfies MetadataRoute.Sitemap[number];
	});

	return [
		{
			url: url("/"),
			priority: 1,
		},
    {
      url: url("/blog"),
      priority: 0.9,
    },
    {
			url: url("/careers"),
			priority: 0.7,
		},
    {
			url: url("/changelog"),
			priority: 0.7,
		},
    {
			url: url("/community"),
			priority: 0.7,
		},
    {
			url: url("/enterprise"),
			priority: 0.7,
		},
    {
			url: url("/legal/terms"),
			priority: 0.3,
		},
    {
			url: url("/legal/privacy"),
			priority: 0.3,
		},
    {
			url: url("/products/framework"),
			priority: 0.7,
		},
		...docPages,
		...blogPages,
	];
}
