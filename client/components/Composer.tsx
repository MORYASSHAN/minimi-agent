import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

interface Props {
  busy: boolean;
  disabled?: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  size?: 'large' | 'normal';
  autoFocus?: boolean;
  placeholder?: string;
  /** Question word limit, from the server's usage limits. */
  maxWords?: number;
}

export interface ComposerHandle {
  focus(): void;
}

export const Composer = forwardRef<ComposerHandle, Props>(function Composer(
  { busy, disabled, onSend, onStop, size = 'normal', autoFocus, placeholder = 'Ask anything', maxWords },
  ref,
) {
  const [text, setText] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => area.current?.focus() }), []);

  // Grow with the text, up to a cap.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const overLimit = !!maxWords && words > maxWords;
  const canSend = !busy && !disabled && words > 0 && !overLimit;
  const submit = () => {
    if (!canSend) return;
    onSend(text);
    setText('');
  };

  return (
    <form
      className={`composer composer--${size} ${disabled ? 'is-disabled' : ''}`}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onClick={() => area.current?.focus()}
    >
      <textarea
        ref={area}
        value={text}
        rows={size === 'large' ? 2 : 1}
        autoFocus={autoFocus}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        aria-label="Ask a question"
      />
      <div className="composer__bar">
        <span className="tag">
          <svg viewBox="0 0 16 16" aria-hidden>
            <circle cx="8" cy="8" r="6" />
            <path d="M2 8h12M8 2c1.7 1.8 2.5 3.8 2.5 6S9.7 12.2 8 14C6.3 12.2 5.5 10.2 5.5 8S6.3 3.8 8 2z" />
          </svg>
          Web search
        </span>
        <span className="composer__right">
          {maxWords && words >= maxWords * 0.75 && (
            <span className={`count ${overLimit ? 'count--over' : ''}`}>
              {words} / {maxWords} words
            </span>
          )}
          {busy ? (
            <button type="button" className="send send--stop" onClick={onStop} aria-label="Stop">
              <span />
            </button>
          ) : (
            <button type="submit" className="send" disabled={!canSend} aria-label="Send">
              <svg viewBox="0 0 16 16" aria-hidden>
                <path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" />
              </svg>
            </button>
          )}
        </span>
      </div>
    </form>
  );
});
