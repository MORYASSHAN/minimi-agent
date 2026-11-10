import { z } from 'zod';
import type { Logger } from '../lib/logger.js';
import type { ChatModel } from '../llm/types.js';
import type { ConversationStore, Enrichment } from './store.js';
import { formatLocal } from './temporal.js';

const EnrichmentSchema = z.object({
  title: z.string(),
  summary: z.string(),
  topics: z.array(z.string()),
  entities: z.array(z.string()),
  claims: z.array(
    z.object({
      subject: z.string(),
      attribute: z.string(),
      value: z.string(),
      source: z.number().int().nullable(),
    }),
  ),
});

const SYSTEM = `You index one turn of a chat between a user and a research assistant, for the assistant's long-term memory.
Return JSON with:
- title: a 3-6 word conversation title, no quotes, no trailing period.
- summary: 1-2 sentences: what the user wanted and the gist of the answer, keeping key names and numbers.
- topics: 2-6 short phrases the user might later use to refer to this conversation (e.g. "postgres hosting", "crm pricing").
- entities: products, companies, people and places named, in canonical form (e.g. "HubSpot", "AWS RDS").
- claims: up to 15 checkable facts the answer asserted that could change over time: prices, plans, limits, versions,
  release dates, availability, rankings. subject = the entity, attribute = what is measured, value = the exact value
  with units and conditions as stated, source = the citation number the answer used for it, or null.
  Skip opinions, advice and facts that never change. Use an empty array if there are none.`;

// Runs after the answer is sent. Extracts a summary, topics and claims for later recall.
export class TurnEnricher {
  constructor(
    private readonly store: ConversationStore,
    private readonly model: ChatModel,
    private readonly logger: Logger,
  ) {}

  async enrich(turnId: string): Promise<void> {
    const turn = await this.store.getTurn(turnId);
    if (!turn || !turn.answer.trim()) return;

    const sourceList = turn.sources.map((s) => `[${s.id}] ${s.url}`).join('\n') || '(none)';
    const user = [
      `Date: ${formatLocal(turn.createdAt, turn.timezone)}`,
      `User question: ${turn.question}`,
      `Assistant answer:\n${turn.answer.slice(0, 12_000)}`,
      `Sources:\n${sourceList}`,
    ].join('\n\n');

    try {
      const out = await this.model.json({ system: SYSTEM, user, schema: EnrichmentSchema, name: 'turn_memory', maxTokens: 1_500 });
      const urlById = new Map(turn.sources.map((s) => [s.id, s.url]));
      const enrichment: Enrichment = {
        status: 'done',
        summary: out.summary.trim(),
        topics: out.topics.map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 6),
        entities: out.entities.map((e) => e.trim()).filter(Boolean).slice(0, 12),
        claims: out.claims.slice(0, 15).map((c) => ({
          subject: c.subject.trim(),
          attribute: c.attribute.trim(),
          value: c.value.trim(),
          sourceUrl: c.source != null ? urlById.get(c.source) : undefined,
        })),
      };
      await this.store.setEnrichment(turnId, enrichment);

      const thread = await this.store.getThread(turn.userId, turn.threadId);
      if (thread && !thread.titleFinal && out.title.trim()) {
        await this.store.touchThread(thread.id, thread.updatedAt, { title: out.title.trim().slice(0, 80), final: true });
      }
      this.logger.debug('turn enriched', { turnId, claims: enrichment.claims.length });
    } catch (err) {
      // The raw turn is still searchable by its question and answer text; enrichment only improves recall.
      await this.store.setEnrichment(turnId, { ...turn.enrichment, status: 'failed' });
      throw err;
    }
  }
}
