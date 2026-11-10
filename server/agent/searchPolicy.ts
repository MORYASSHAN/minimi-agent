// When the first model call must search (tool_choice "required"). A prompt alone
// can't guarantee the model checks the web before answering.
const SMALL_TALK =
  /^(hi|hii+|hello|hey|yo|thanks|thank you|thx|ty|ok|okay|k|cool|nice|great|perfect|got it|bye|good (morning|afternoon|evening|night)|how are you)[\s!.?]*$/i;

/** Work on the user's own text or pure reasoning: the web adds nothing. */
const OWN_TEXT_TASK =
  /^(please\s+)?(rewrite|rephrase|reword|proofread|shorten|translate|summari[sz]e (this|the following|my)|fix (this|my)|format (this|my)|calculate|solve|convert)\b|```/i;

/** Words that mean "check the present", even inside a question about a past conversation. */
const ASKS_ABOUT_NOW = /\b(still|now|today|current(ly)?|latest|changed?|since|updated?|new|anything new)\b/i;

export interface RecallSignal {
  /** The message refers to an earlier conversation. */
  triggered: boolean;
  /** ...and memory actually found it. */
  found: boolean;
}

export function mustSearchFirst(message: string, recall: RecallSignal): boolean {
  const text = message.trim();
  if (SMALL_TALK.test(text) || OWN_TEXT_TASK.test(text)) return false;
  if (!recall.triggered) return true;
  // About a past chat we found: re-check the web only if they ask about the present
  // ("is it still correct?"), not for "what did I ask you on 3 November?".
  if (recall.found) return ASKS_ABOUT_NOW.test(text);
  // About a past chat we don't have: let the model decide. Often the right move is
  // "I have no record of that" plus a question, not a forced, aimless search.
  return false;
}
