/** Truncate on a word boundary and mark the cut. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.8 ? cut.slice(0, lastSpace) : cut).trimEnd() + ' …';
}

export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

const TRACKING_PARAMS = /^(utm_|ref$|ref_src$|fbclid$|gclid$|mc_cid$|mc_eid$)/i;

/** Canonical form used to de-duplicate the same page found by different queries/providers. */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = '';
    u.hostname = u.hostname.replace(/^www\./, '').toLowerCase();
    for (const key of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
    let s = u.toString();
    if (s.endsWith('/')) s = s.slice(0, -1);
    return s.replace(/^http:/, 'https:');
  } catch {
    return raw.trim();
  }
}

export function domainOf(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, '');
  } catch {
    return raw;
  }
}

/** Extract citation numbers like [3] or [2, 5] from an answer. */
export function citedIds(answer: string): number[] {
  const ids = new Set<number>();
  for (const m of answer.matchAll(/\[(\d+(?:\s*[,–-]\s*\d+)*)\](?!\()/g)) {
    for (const n of m[1]!.split(/[,–-]/)) {
      const id = Number(n.trim());
      if (Number.isInteger(id) && id > 0) ids.add(id);
    }
  }
  return [...ids].sort((a, b) => a - b);
}

const STOPWORDS = new Set(
  `a an the and or but if then than so to of in on at by for with about from into over after before since until
  i me my we our us you your he she it they them their this that these those is are was were be been being am
  do does did done have has had having can could would should will shall may might must what which who whom whose
  when where why how any all some each both few more most other such no nor not only own same too very just also
  ask asked asking tell told say said talk talked discuss discussed mention mentioned answer answered question
  still correct right true today yesterday tomorrow now currently last next ago earlier previously recently week
  weeks month months year years day days monday tuesday wednesday thursday friday saturday sunday january february
  march april may june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec
  morning afternoon evening night time changed change since anything something thing things get got please thanks
  shortlisted shortlist chose picked compared looked look again back them those there here one ones
  recommend recommended suggest suggested remember recall conversation chat discussion list answers says latest`
    .split(/\s+/)
    .filter(Boolean),
);

/** Topic words from a message, minus stopwords, dates and recall verbs. Used for memory search. */
export function topicTerms(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}.+#-]+/gu, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[.-]+|[.-]+$/g, ''))
    .filter((w) => w.length > 1 && !STOPWORDS.has(w) && !/^\d+(st|nd|rd|th)?$/.test(w));
  return [...new Set(words)];
}
