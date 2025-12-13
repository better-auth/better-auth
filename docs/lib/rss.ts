import { Feed } from "feed";
import { blogs } from "./source";
import { baseUrl } from "./utils";

export function getRSS() {
  const feed = new Feed({
    title: "Better Auth Blog",
    description: "Latest updates, articles, and insights about Better Auth",
    generator: "better-auth",
    id: `${baseUrl}blog`,
    link: `${baseUrl}blog`,
    language: "en",
    image: `${baseUrl}release-og/blogs.png`,
    favicon: `${baseUrl}favicon/favicon-32x32.png`,
    copyright: `All rights reserved ${new Date().getFullYear()}, Better Auth Inc.`,
  });

  for (const page of blogs.getPages()) {
    const url = page.url.replace("blogs/", "blog/");

    feed.addItem({
      id: url,
      title: page.data.title,
      description: page.data.description,
      image: page.data.image ? `${baseUrl}${page.data.image.startsWith("/") ? page.data.image.slice(1) : page.data.image}` : undefined,
      link: `${baseUrl}${(url.startsWith("/") ? url.slice(1) : url)}`,
      date: new Date(page.data.lastModified || page.data.date),
      author: page.data.author ? [{
        name: page.data.author.name,
        avatar: page.data.author.avatar,
        link: page.data.author.twitter,
      }] : [],
    });
  }

  return feed.rss2();
}
