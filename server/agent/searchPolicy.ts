/**
 * Search-first policy. The product promise is "answers from the live web", so the first
 * model round is *required* to call web_search unless the message clearly doesn't need it.
 * Deciding this in code (not in the prompt) makes it deterministic: "Who is the president
 * of Uganda?" always gets a fresh, cited answer, never a guess from training data.
 */
const SMALL_TALK =
  /^(hi|hii+|hello|hey|yo|sup|thanks|thank you|thx|ty|ok|okay|k|cool|nice|great|awesome|perfect|got it|bye|good (morning|afternoon|evening|night)|how are you\??)[\s!.?🙂😊👍]*$/i;

/** Words that mean "check the present", even inside a question about a past conversation. */
const ASKS_ABOUT_NOW = /\b(still|now|today|current(ly)?|latest|changed?|since|updated?|new|anything new)\b/i;

export function mustSearchFirst(message: string, recalledPastChat: boolean): boolean {
  const text = message.trim();
  if (SMALL_TALK.test(text)) return false;
  // "What did I ask you on 3 November?" is answered from memory alone;
  // "...is it still correct?" needs the web again.
  if (recalledPastChat && !ASKS_ABOUT_NOW.test(text)) return false;
  return true;
}
