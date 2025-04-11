import { z } from "zod";

export const Recipient = z.object({
	emailAddress: z.object({
		address: z.string().optional(),
		name: z.string().optional(),
	}).optional(),
});

export const Flag = z.object({
	completedDateTime: z.date().optional(),
	dueDateTime: z.date().optional(),
	flagStatus: z.enum(["notFlagged", "flagged", "completed"]).optional(),
	startDateTime: z.date().optional(),
});

export const Body = z.object({
	content: z.string().optional(),
	contentType: z.enum(["text", "html"]).optional(),
});

export const InternetMessageHeader = z.object({
	name: z.string().optional(),
	value: z.string().optional(),
});

export const Attachment = z.object({
	contentType: z.string().optional(),
	id: z.string().optional(),
	lastModifiedDateTime: z.date().optional(),
	name: z.string().optional(),
	size: z
		.number()
		.int()
		.lte(2 ** 32).optional(),
	isInline: z.boolean().optional(),
	contentBytes: z.string().optional(),
});

export const Extension = z.object({
	id: z.string().optional(),
});

export const MultiValueLegacyExtendedProperty = z.object({
	id: z.string().optional(),
	value: z.array(z.string()).optional(),
});

export const SingleValueLegacyExtendedProperty = z.object({
	id: z.string().optional(),
	value: z.string().optional(),
});

export const Message = z.object({
	bccRecipients: z.array(Recipient).optional(),
	body: Body.optional(),
	bodyPreview: z.string().optional(),
	ccRecipients: z.array(Recipient).optional(),
	changeKey: z.string().optional(),
	conversationId: z.string().optional(),
	conversationIndex: z.string().optional(),
	createdDateTime: z.date().optional(),
	flag: Flag.optional(),
	from: Recipient.optional(),
	hasAttachments: z.boolean().optional(),
	id: z.string().optional(),
	importance: z.enum(["low", "normal", "high"]).optional(),
	inferenceClassification: z.enum(["focused", "other"]).optional(),
	internetMessageId: z.string().optional(),
	internetMessageHeaders: z.array(InternetMessageHeader).optional(),
	isDeliveryReceiptRequested: z.boolean().optional(),
	isDraft: z.boolean().optional(),
	isRead: z.boolean().optional(),
	isReadReceiptRequested: z.boolean().optional(),
	lastModifiedDateTime: z.date().optional(),
	parentFolderId: z.string().optional(),
	receivedDateTime: z.date().optional(),
	replyTo: z.array(Recipient).optional(),
	sender: Recipient.optional(),
	sentDateTime: z.date().optional(),
	subject: z.string().optional(),
	toRecipients: z.array(Recipient).optional(),
	uniqueBody: Body.optional().default({
		content: "",
		contentType: "text",
	}).optional(),
	webLink: z.string().optional(),

	// Relationships

	attachments: z.array(Attachment).optional(),
	extensions: z.array(Extension).optional(),
	singleValueExtendedProperties: z.array(SingleValueLegacyExtendedProperty).optional(),
	multiValueExtendedProperties: z.array(MultiValueLegacyExtendedProperty).optional(),
});

export const DraftMessage = z.object({
	...Message.optional(),
	isDraft: true,
})