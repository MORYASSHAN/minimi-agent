import { Types } from 'mongoose';
import type { ConversationStore, Enrichment, ThreadRecord, TurnPatch, TurnQuery, TurnRecord } from '../memory/store.js';
import { ThreadModel, TurnModel, type ThreadDoc, type TurnDoc } from './models.js';

const isId = (id: string) => Types.ObjectId.isValid(id) && String(new Types.ObjectId(id)) === id;

function toThread(d: ThreadDoc): ThreadRecord {
  return {
    id: String(d._id),
    userId: d.userId,
    title: d.title,
    titleFinal: Boolean(d.titleFinal),
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function toTurn(d: TurnDoc): TurnRecord {
  const e = d.enrichment;
  return {
    id: String(d._id),
    threadId: String(d.threadId),
    userId: d.userId,
    question: d.question,
    answer: d.answer ?? '',
    status: d.status as TurnRecord['status'],
    timezone: d.timezone ?? 'UTC',
    model: d.model ?? undefined,
    sources: (d.sources ?? []) as TurnRecord['sources'],
    citedSourceIds: d.citedSourceIds ?? [],
    searches: (d.searches ?? []) as TurnRecord['searches'],
    memory: (d.memory ?? undefined) as TurnRecord['memory'],
    timings: (d.timings ?? undefined) as TurnRecord['timings'],
    enrichment: {
      status: (e?.status ?? 'pending') as Enrichment['status'],
      summary: e?.summary ?? '',
      topics: e?.topics ?? [],
      entities: e?.entities ?? [],
      claims: (e?.claims ?? []) as Enrichment['claims'],
    },
    createdAt: d.createdAt,
  };
}

export class MongoStore implements ConversationStore {
  async createThread(userId: string, title: string, at: Date): Promise<ThreadRecord> {
    const doc = await ThreadModel.create({ userId, title, createdAt: at, updatedAt: at });
    return toThread(doc.toObject() as ThreadDoc);
  }

  async getThread(userId: string, threadId: string): Promise<ThreadRecord | null> {
    if (!isId(threadId)) return null;
    const doc = await ThreadModel.findOne({ _id: threadId, userId }).lean<ThreadDoc>();
    return doc ? toThread(doc) : null;
  }

  async listThreads(userId: string, limit: number): Promise<ThreadRecord[]> {
    const docs = await ThreadModel.find({ userId }).sort({ updatedAt: -1 }).limit(limit).lean<ThreadDoc[]>();
    return docs.map(toThread);
  }

  async deleteThread(userId: string, threadId: string): Promise<boolean> {
    if (!isId(threadId)) return false;
    const res = await ThreadModel.deleteOne({ _id: threadId, userId });
    if (res.deletedCount) await TurnModel.deleteMany({ threadId, userId });
    return res.deletedCount > 0;
  }

  async touchThread(threadId: string, at: Date, title?: { title: string; final: boolean }): Promise<void> {
    const set: Record<string, unknown> = { updatedAt: at };
    if (title) Object.assign(set, { title: title.title, titleFinal: title.final });
    await ThreadModel.updateOne({ _id: threadId }, { $set: set });
  }

  async listTurns(threadId: string): Promise<TurnRecord[]> {
    if (!isId(threadId)) return [];
    const docs = await TurnModel.find({ threadId }).sort({ createdAt: 1 }).lean<TurnDoc[]>();
    return docs.map(toTurn);
  }

  async createTurn(input: Pick<TurnRecord, 'threadId' | 'userId' | 'question' | 'timezone' | 'createdAt'>): Promise<TurnRecord> {
    const doc = await TurnModel.create({ ...input, status: 'pending' });
    return toTurn(doc.toObject() as TurnDoc);
  }

  async finishTurn(turnId: string, patch: TurnPatch): Promise<void> {
    await TurnModel.updateOne({ _id: turnId }, { $set: patch });
  }

  async getTurn(turnId: string): Promise<TurnRecord | null> {
    if (!isId(turnId)) return null;
    const doc = await TurnModel.findById(turnId).lean<TurnDoc>();
    return doc ? toTurn(doc) : null;
  }

  async setEnrichment(turnId: string, enrichment: Enrichment): Promise<void> {
    await TurnModel.updateOne({ _id: turnId }, { $set: { enrichment } });
  }

  async findTurns(q: TurnQuery): Promise<TurnRecord[]> {
    const filter: Record<string, unknown> = { userId: q.userId, status: { $in: ['complete', 'aborted'] } };
    if (q.from || q.to) filter.createdAt = { ...(q.from && { $gte: q.from }), ...(q.to && { $lte: q.to }) };

    if (q.terms?.length) {
      filter.$text = { $search: q.terms.join(' ') };
      const docs = await TurnModel.find(filter, { score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' } })
        .limit(q.limit)
        .lean<TurnDoc[]>();
      return docs.map(toTurn);
    }
    const docs = await TurnModel.find(filter).sort({ createdAt: -1 }).limit(q.limit).lean<TurnDoc[]>();
    return docs.map(toTurn);
  }

  async countTurnsSince(userId: string, since: Date): Promise<number> {
    return TurnModel.countDocuments({ userId, createdAt: { $gte: since } });
  }

  async firstTurnAt(userId: string): Promise<Date | null> {
    const doc = await TurnModel.findOne({ userId, status: { $in: ['complete', 'aborted'] } })
      .sort({ createdAt: 1 })
      .select({ createdAt: 1 })
      .lean<{ createdAt: Date }>();
    return doc?.createdAt ?? null;
  }
}
