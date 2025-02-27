// "use client";

// import { useEffect, useState } from "react";
// import { cn } from "@/lib/utils";

// const TableOfContents = ({
//   sections,
// }: {
//   sections: {
//     title: string;
//     id: string;
//   }[];
// }) => {
//   const [activeSection, setActiveSection] = useState("");

//   useEffect(() => {
//     const handleIntersection = (entries: IntersectionObserverEntry[]) => {
//       entries.forEach((entry) => {
//         if (entry.isIntersecting) {
//           setActiveSection(entry.target.id);
//         }
//       });
//     };

//     const observer = new IntersectionObserver(handleIntersection, {
//       threshold: 0.5, // Adjust threshold as needed
//       rootMargin: "0px 0px -50% 0px", // Adjust rootMargin for better precision
//     });

//     const sections = document.querySelectorAll("section[id]");
//     sections.forEach((section) => observer.observe(section));

//     return () => observer.disconnect();
//   }, []);

//   const scrollToSection = (id: string) => {
//     const element = document.getElementById(id);
//     if (element) {
//       element.scrollIntoView({ behavior: "smooth" });
//     }
//   };

//   return (
//     <nav className="sticky top-24 left-4 self-start p-4 h-[calc(100vh-6rem)] overflow-y-auto">
//       <ul className="space-y-2">
//         {sections.map((section) => (
//           <li key={section.id}>
//             <a
//               href={`${section.id}`}
//               onClick={() => scrollToSection(section.id)}
//               className={cn(
//                 "text-sm transition-colors pl-2 border-l-2 w-full text-left",
//                 activeSection === section.id
//                   ? "text-white/90 border-white"
//                   : "text-white/60 hover:text-white/80 border-transparent",
//               )}
//             >
//               {section.id} x {activeSection} {section.title}
//             </a>
//           </li>
//         ))}
//       </ul>
//     </nav>
//   );
// };

// "use client";

// import { useEffect, useState } from "react";
// import { cn } from "@/lib/utils";

// const TableOfContents = ({
//   sections,
// }: {
//   sections: {
//     title: string;
//     id: string;
//   }[];
// }) => {
//   const [activeSection, setActiveSection] = useState("");

//   useEffect(() => {
//     const handleIntersection = (entries: IntersectionObserverEntry[]) => {
//       console.log("entiry: ", entries);
//       entries.forEach((entry) => {
//         if (entry.isIntersecting) {
//           // Use the `href` value (section ID) to set the active section
//           setActiveSection(`#${entry.target.id}`);
//         }
//       });
//     };

//     const observer = new IntersectionObserver(handleIntersection, {
//       threshold: 0.5, // Adjust threshold as needed
//       rootMargin: "0px 0px -50% 0px", // Adjust rootMargin for better precision
//     });

//     const sections = document.querySelectorAll("section[id]");
//     sections.forEach((section) => observer.observe(section));

//     return () => observer.disconnect();
//   }, []);

//   const scrollToSection = (href: string) => {
//     const id = href.replace("#", ""); // Extract the ID from the href
//     const element = document.getElementById(id);
//     if (element) {
//       element.scrollIntoView({ behavior: "smooth" });
//     }
//   };

//   return (
//     <nav className="sticky top-24 left-4 self-start p-4 h-[calc(100vh-6rem)] overflow-y-auto">
//       <ul className="space-y-2">
//         {sections.map((section) => {
//           const href = `#${section.id}`; // Generate the href value
//           return (
//             <li key={section.id}>
//               <a
//                 href={href}
//                 onClick={(e) => {
//                   e.preventDefault(); // Prevent default anchor behavior
//                   scrollToSection(href);
//                 }}
//                 className={cn(
//                   "text-sm transition-colors pl-2 border-l-2 w-full text-left",
//                   activeSection === href
//                     ? "text-white/90 border-white"
//                     : "text-white/60 hover:text-white/80 border-transparent",
//                 )}
//               >
//                 {section.title}
//               </a>
//             </li>
//           );
//         })}
//       </ul>
//     </nav>
//   );
// };

// export default TableOfContents;

"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const TableOfContents = ({
	sections,
}: {
	sections: {
		title: string;
		id: string; // id already contains the `#` (e.g., "#about-builtt")
	}[];
}) => {
	const [activeSection, setActiveSection] = useState("");

	useEffect(() => {
		const handleIntersection = (entries: IntersectionObserverEntry[]) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					// Get the `href` value from the observed `<a>` tag
					const href = entry.target.getAttribute("href");
					if (href) {
						setActiveSection(href);
					}
				}
			});
		};

		const observer = new IntersectionObserver(handleIntersection, {
			threshold: 0.5, // Adjust threshold as needed
			rootMargin: "0px 0px -50% 0px", // Adjust rootMargin for better precision
		});

		const links = document.querySelectorAll('a[href^="#"]');
		links.forEach((link) => {
			observer.observe(link);
		});
		console.log({ links });

		return () => observer.disconnect();
	}, []);

	const scrollToSection = (href: string) => {
		const id = href.replace("#", ""); // Extract the ID from the href
		const element = document.getElementById(id);
		if (element) {
			element.scrollIntoView({ behavior: "smooth" });
		}
	};

	return (
		<nav className="sticky top-24 left-4 self-start p-4 h-[calc(100vh-6rem)] overflow-y-auto">
			<ul className="space-y-2">
				{sections.map((section) => {
					const href = section.id; // Use the `id` directly (it already contains the `#`)
					return (
						<li key={section.id}>
							<a
								href={href}
								onClick={(e) => {
									e.preventDefault(); // Prevent default anchor behavior
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
