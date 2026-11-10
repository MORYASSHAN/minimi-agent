import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

interface Props {
  busy: boolean;
  disabled?: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  size?: 'large' | 'normal';
  autoFocus?: boolean;
  placeholder?: string;
  /** Question word limit (from the server's usage limits). */
  maxWords?: number;
}

export interface ComposerHandle {
  focus(): void;
}

export const Composer = forwardRef<ComposerHandle, Props>(function Composer(
  { busy, disabled, onSend, onStop, size = 'normal', autoFocus, placeholder = 'Ask anything…', maxWords },
  ref,
) {
  const [text, setText] = useState('');
  const [multiline, setMultiline] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => area.current?.focus() }), []);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
    setMultiline(el.scrollHeight > (size === 'large' ? 64 : 52));
  }, [text, size]);

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const overLimit = !!maxWords && words > maxWords;
  const showCount = !!maxWords && words >= maxWords * 0.6;
  const canSend = !busy && !disabled && words > 0 && !overLimit;
  const submit = () => {
    if (!canSend) return;
    onSend(text);
    setText('');
  };

  return (
    <form
      className={`composer composer--${size} ${multiline ? 'composer--multi' : ''} ${disabled ? 'composer--disabled' : ''}`}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={area}
        value={text}
        rows={1}
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
      {showCount && (
        <span className={`wordcount ${overLimit ? 'wordcount--over' : ''}`} title={overLimit ? 'Too long: shorten your question to send it' : undefined}>
          {words}/{maxWords}
        </span>
      )}
      {busy ? (
        <button type="button" className="send send--stop" onClick={onStop} aria-label="Stop answering">
          <span className="send__square" />
        </button>
      ) : (
        <button type="submit" className="send" disabled={!canSend} aria-label="Send">
          <svg viewBox="0 0 20 20" aria-hidden>
            <path d="M10 15.5V4.5M5 9.5l5-5 5 5" />
          </svg>
        </button>
      )}
    </form>
  );
});
