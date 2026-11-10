import { BRAND, PORTFOLIO_URL, REPO_URL } from '../brand';

export function HowItWorks() {
  return (
    <article className="doc fade-in">
      <h1 className="serif">How {BRAND} works</h1>
      <p className="doc__lead">
        Every question goes through the same few steps. Most answers take two model calls and one round of searching.
      </p>

      <h2 className="serif">1. It works out the dates</h2>
      <p>
        If you say “last Tuesday” or “on 3 November”, that is turned into an exact day in your timezone before the model
        sees the question. Language models are unreliable at this, so it happens in code.
      </p>

      <h2 className="serif">2. It checks your past chats</h2>
      <p>
        When you refer to an earlier conversation, Scout looks it up in its database by date and topic. If there is nothing
        there, it tells you so instead of guessing what you asked.
      </p>

      <h2 className="serif">3. It searches the web</h2>
      <p>
        Questions about the world always start with a search, so answers come from current pages rather than the
        model’s memory. Several searches run at once, and for prices or specs it reads the pages themselves.
      </p>

      <h2 className="serif">4. It answers with sources</h2>
      <p>
        The answer streams in as it is written. Numbers in brackets link to the pages each fact came from, and the sources
        are listed underneath.
      </p>

      <h2 className="serif">5. It remembers what it said</h2>
      <p>
        After answering, Scout notes the facts it stated, like prices and versions, with their sources. Ask “is that still
        right?” later and it checks those exact facts again and shows what changed.
      </p>

      <h2 className="serif">Limits</h2>
      <p>
        To keep API costs predictable, questions are capped in length, answers have a maximum size, and each person has a
        daily message allowance. All of these are set in the server’s <code>.env</code> file.
      </p>

      <p className="doc__foot">
        The design notes and code are on{' '}
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          GitHub
        </a>
        . Built by{' '}
        <a href={PORTFOLIO_URL} target="_blank" rel="noreferrer">
          Shaan
        </a>
        .
      </p>
    </article>
  );
}
