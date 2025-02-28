"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const TableOfContents = ({
  sections,
}: {
  sections: {
    title: string;
    id: string;
  }[];
}) => {
  const [activeSection, setActiveSection] = useState("");

  useEffect(() => {
    const handleIntersection = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const href = entry.target.getAttribute("href");
          if (href) {
            setActiveSection(href);
          }
        }
      });
    };

    const observer = new IntersectionObserver(handleIntersection, {
      threshold: 0.4,
      rootMargin: "0px 0px -50% 0px",
    });

    const links = document.querySelectorAll('a[href^="#"]');
    links.forEach((link) => {
      observer.observe(link);
    });
    console.log({ links });

    return () => observer.disconnect();
  }, []);

  const scrollToSection = (href: string) => {
    const id = href.replace("#", "");
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <nav className="sticky top-24 left-4 self-start p-4 h-[calc(100vh-6rem)] overflow-y-auto">
      <ul className="space-y-2">
        {sections.map((section) => {
          const href = section.id;
          return (
            <li key={section.id}>
              <a
                href={href}
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection(href);
                }}
                className={cn(
                  "text-sm transition-colors pl-2 border-l-2 w-full text-left",
                  activeSection === href
                    ? "text-white/90 border-white"
                    : "text-white/60 hover:text-white/80 border-transparent",
                )}
              >
                {section.title}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default TableOfContents;
