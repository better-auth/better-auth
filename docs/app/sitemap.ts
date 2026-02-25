import type { MetadataRoute } from "next";
import { blogs, source } from "@/lib/source";

const BASE_URL = "https://www.better-auth.com";

export default function sitemap(): MetadataRoute.Sitemap {
	const basePages: MetadataRoute.Sitemap = [
		{
			url: BASE_URL,
			lastModified: new Date(),
			changeFrequency: "daily",
			priority: 1.0,
		},
		{
			url: `${BASE_URL}/blog`,
			lastModified: new Date(),
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${BASE_URL}/changelogs`,
			lastModified: new Date(),
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${BASE_URL}/community`,
			lastModified: new Date(),
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${BASE_URL}/enterprise`,
			lastModified: new Date(),
			changeFrequency: "weekly",
			priority: 0.8,
		},
	];

	const docPages: MetadataRoute.Sitemap = source.getPages().map((page) => ({
		url: `${BASE_URL}${page.url}`,
		lastModified: page.data.lastModified
			? new Date(page.data.lastModified)
			: new Date(),
		changeFrequency: "weekly",
		priority: 0.7,
	}));

	const blogPages: MetadataRoute.Sitemap = blogs.getPages().map((page) => ({
		url: `${BASE_URL}${page.url.replace("/blogs/", "/blog/")}`,
		lastModified: page.data.date ? new Date(page.data.date) : new Date(),
		changeFrequency: "monthly",
		priority: 0.6,
	}));

	// These pages are not being used
	//
	// const changelogPages: MetadataRoute.Sitemap = changelogs
	// 	.getPages()
	// 	.map((page) => ({
	// 		url: `${BASE_URL}${page.url}`,
	// 		lastModified: page.data.date ? new Date(page.data.date) : new Date(),
	// 		changeFrequency: "monthly",
	// 		priority: 0.6,
	// 	}));

	return [
		...basePages,
		...docPages,
		...blogPages,
		//  ...changelogPages
	];
}
