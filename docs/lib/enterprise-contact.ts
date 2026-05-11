import * as z from "zod";

// Not exhaustive - covers the most common free providers to filter casual inquiries
const FREE_EMAIL_DOMAINS = new Set([
	"gmail.com",
	"yahoo.com",
	"hotmail.com",
	"outlook.com",
	"live.com",
	"icloud.com",
	"naver.com",
	"hanmail.net",
	"protonmail.com",
	"aol.com",
]);

export function isFreeEmail(email: string): boolean {
	const domain = email.split("@")[1]?.toLowerCase();
	return FREE_EMAIL_DOMAINS.has(domain ?? "");
}

export const contactSchema = z.object({
	fullName: z.string().min(1, "Full name is required"),
	company: z.string().min(1, "Company is required"),
	email: z.email("Please enter a valid email address"),
	companySize: z.string().optional(),
	description: z.string().min(1, "Please describe your needs"),
});
