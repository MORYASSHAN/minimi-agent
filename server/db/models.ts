import mongoose, { Schema, type InferSchemaType } from 'mongoose';

// threads: one per chat. turns: a question and its answer, plus what the background job
// extracts later. createdAt comes from the Clock, not Mongoose, so tests can control it.

const ThreadSchema = new Schema(
  {
    userId: { type: String, required: true },
    title: { type: String, required: true },
    titleFinal: { type: Boolean, default: false },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { versionKey: false },
);
ThreadSchema.index({ userId: 1, updatedAt: -1 });

const SourceSchema = new Schema(
  { id: Number, url: String, title: String, domain: String, snippet: String, publishedAt: String },
  { _id: false },
);

const SearchStepSchema = new Schema(
  {
    id: String,
    queries: [String],
    since: String,
    depth: { type: String, enum: ['fast', 'deep'] },
    status: { type: String, enum: ['running', 'done', 'error'] },
    resultCount: Number,
    provider: String,
    ms: Number,
  },
  { _id: false },
);

const ClaimSchema = new Schema(
  { subject: String, attribute: String, value: String, sourceUrl: String },
  { _id: false },
);

const TurnSchema = new Schema(
  {
    threadId: { type: Schema.Types.ObjectId, ref: 'Thread', required: true },
    userId: { type: String, required: true },
    question: { type: String, required: true },
    answer: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'complete', 'aborted', 'error'], default: 'pending' },
    timezone: { type: String, default: 'UTC' },
    model: String,
    sources: { type: [SourceSchema], default: [] },
    citedSourceIds: { type: [Number], default: [] },
    searches: { type: [SearchStepSchema], default: [] },
    memory: { type: Schema.Types.Mixed },
    timings: { type: Schema.Types.Mixed },
    enrichment: {
      status: { type: String, enum: ['pending', 'done', 'failed'], default: 'pending' },
      summary: { type: String, default: '' },
      topics: { type: [String], default: [] },
      entities: { type: [String], default: [] },
      claims: { type: [ClaimSchema], default: [] },
    },
    createdAt: { type: Date, required: true },
  },
  { versionKey: false },
);
TurnSchema.index({ threadId: 1, createdAt: 1 });
TurnSchema.index({ userId: 1, createdAt: -1 });
// Full-text recall over what was asked, what was answered and what it was about.
// userId prefix keeps every text query scoped to one user.
TurnSchema.index(
  {
    userId: 1,
    question: 'text',
    'enrichment.topics': 'text',
    'enrichment.entities': 'text',
    'enrichment.summary': 'text',
    answer: 'text',
  },
  {
    name: 'turn_recall_text',
    weights: { question: 6, 'enrichment.topics': 5, 'enrichment.entities': 5, 'enrichment.summary': 3, answer: 1 },
  },
);

export type ThreadDoc = InferSchemaType<typeof ThreadSchema> & { _id: mongoose.Types.ObjectId };
export type TurnDoc = InferSchemaType<typeof TurnSchema> & { _id: mongoose.Types.ObjectId };

export const ThreadModel = mongoose.model('Thread', ThreadSchema);
export const TurnModel = mongoose.model('Turn', TurnSchema);
