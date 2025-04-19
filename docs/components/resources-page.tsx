'use client'
import { useState } from "react";
import { ResourceCard } from "./resource-card";
import { ResourceFilter } from "./resource-filter";

interface Resource {
  title: string;
  description: string;
  href: string;
  tags: string[];
}

interface Resources {
  gettingStarted: Resource[];
  videoTutorials: Resource[];
  blogPosts: Resource[];
  community: Resource[];
}

interface ActiveFilters {
  gettingStarted: string | null;
  videoTutorials: string | null;
  blogPosts: string | null;
  community: string | null;
}

const resources: Resources = {
  gettingStarted: [
    {
      title: "Getting Started with Better Auth",
      description: "Learn the basics of Better Auth and how to implement authentication in your application.",
      href: "https://example.com/getting-started",
      tags: ["basics", "authentication"]
    },
    {
      title: "Authentication Best Practices",
      description: "Discover the best practices for implementing secure authentication in your applications.",
      href: "https://example.com/best-practices",
      tags: ["security", "best-practices"]
    },
    {
      title: "Better Auth vs Other Solutions",
      description: "A comprehensive comparison of Better Auth with other authentication solutions.",
      href: "https://example.com/comparison",
      tags: ["analysis"]
    }
  ],
  videoTutorials: [
    {
      title: "Building a Secure Auth System",
      description: "Step-by-step guide to building a secure authentication system with Better Auth.",
      href: "https://example.com/video-tutorial",
      tags: ["security", "tutorial"]
    },
    {
      title: "Social Authentication Deep Dive",
      description: "Learn how to implement social authentication with various providers.",
      href: "https://example.com/social-auth",
      tags: ["social", "oauth"]
    },
    {
      title: "Two-Factor Authentication",
      description: "Implement robust two-factor authentication in your application.",
      href: "https://example.com/2fa",
      tags: ["2fa", "security"]
    }
  ],
  blogPosts: [
    {
      title: "The Future of Authentication",
      description: "Exploring upcoming trends and innovations in authentication technology.",
      href: "https://example.com/future-auth",
      tags: ["trends", "future"]
    },
    {
      title: "Passwordless Authentication Guide",
      description: "A comprehensive guide to implementing passwordless authentication.",
      href: "https://example.com/passwordless",
      tags: ["passwordless", "security"]
    },
    {
      title: "OAuth 2.0 Explained",
      description: "Deep dive into OAuth 2.0 and how it works with Better Auth.",
      href: "https://example.com/oauth",
      tags: ["oauth", "security"]
    }
  ],
  community: [
    {
      title: "GitHub Discussions",
      description: "Join the community discussion about Better Auth on GitHub.",
      href: "https://github.com/better-auth/better-auth/discussions",
      tags: ["community", "support"]
    },
    {
      title: "Stack Overflow",
      description: "Find answers to common questions about Better Auth on Stack Overflow.",
      href: "https://stackoverflow.com/questions/tagged/better-auth",
      tags: ["community", "q&a"]
    },
    {
      title: "Discord Community",
      description: "Join our Discord community for real-time support and discussions.",
      href: "https://discord.gg/better-auth",
      tags: ["community", "chat"]
    }
  ]
};

export function ResourcesPage() {
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({
    gettingStarted: null,
    videoTutorials: null,
    blogPosts: null,
    community: null
  });

  const allTags = Array.from(
    new Set(
      Object.values(resources)
        .flat()
        .flatMap((resource) => resource.tags).slice(0, 10)
    )
  );

  const filterResources = (resources: Resource[], activeTag: string | null): Resource[] => {
    if (!activeTag) return resources;
    return resources.filter((resource) => resource.tags.includes(activeTag));
  };

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold tracking-tight">Getting Started</h2>
      <ResourceFilter
        title="Filter by topic"
        tags={allTags}
        activeTag={activeFilters.gettingStarted}
        onTagClick={(tag) =>
          setActiveFilters((prev) => ({ ...prev, gettingStarted: tag }))
        }
      />
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {filterResources(resources.gettingStarted, activeFilters.gettingStarted).map(
          (resource) => (
            <ResourceCard key={resource.href} {...resource} />
          )
        )}
      </div>
      <h2 className="text-2xl font-bold tracking-tight">Video Tutorials</h2>
      <ResourceFilter
        title="Filter by topic"
        tags={allTags}
        activeTag={activeFilters.videoTutorials}
        onTagClick={(tag) =>
          setActiveFilters((prev) => ({ ...prev, videoTutorials: tag }))
        }
      />
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {filterResources(resources.videoTutorials, activeFilters.videoTutorials).map(
          (resource) => (
            <ResourceCard key={resource.href} {...resource} />
          )
        )}
      </div>

      <h2 className="text-2xl font-bold tracking-tight">Blog Posts</h2>
      <ResourceFilter
        title="Filter by topic"
        tags={allTags}
        activeTag={activeFilters.blogPosts}
        onTagClick={(tag) =>
          setActiveFilters((prev) => ({ ...prev, blogPosts: tag }))
        }
      />
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {filterResources(resources.blogPosts, activeFilters.blogPosts).map(
          (resource) => (
            <ResourceCard key={resource.href} {...resource} />
          )
        )}
      </div>
    </div>
  );
} 