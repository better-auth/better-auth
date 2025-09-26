import { z } from 'zod';

const InkeepRecordTypes = z.enum([
  'documentation',
  'site',
  'discourse_post',
  'github_issue',
  'github_discussion',
  'stackoverflow_question',
  'discord_forum_post',
  'discord_message',
  'custom_question_answer',
]);

const LinkType = z.union([
  InkeepRecordTypes,
  z.string(), 
]);

const LinkSchema = z.object({
  label: z.string().optional(), 
  url: z.string().url().describe('The URL of the documentation page'),
  title: z.string().optional(),
  type: LinkType.optional(),
  breadcrumbs: z.array(z.string()).optional(),
}).strict();

const LinksSchema = z.array(LinkSchema).min(1).max(10).describe('Array of relevant documentation links');

export const ProvideLinksToolSchema = z.object({
  links: LinksSchema,
}).strict();

const KnownAnswerConfidence = z.enum([
  'very_confident',
  'somewhat_confident',
  'not_confident',
  'no_sources',
  'other',
]);

const AnswerConfidence = z.union([KnownAnswerConfidence, z.string()]); // evolvable

const AIAnnotationsToolSchema = z.object({
  answerConfidence: AnswerConfidence,
}).strict();

export const ProvideAIAnnotationsToolSchema = z.object({
  aiAnnotations: AIAnnotationsToolSchema,
}).strict();

export const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1).max(10000),
  id: z.string().optional(),
  parts: z.array(z.any()).optional(), 
}).strict();

export const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1).max(50),
  stream: z.boolean().optional().default(true),
}).strict();