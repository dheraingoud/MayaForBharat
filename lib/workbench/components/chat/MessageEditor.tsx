// MAYA in-place message editor. Save/cancel contract ported from
// vercel-chatbot message-editor.tsx — but the editor itself is a minimal
// textarea (vercel's uses ProseMirror via text-editor.tsx; pulling that in
// is a new dep the M2 plan explicitly avoids).
//
// Save → parent does the client-side deleteTrailingMessages approximation:
//   setMessages(messages.slice(0, idx))   // drop edited user msg + trailing
//   append({ role:'user', content, parts:[{type:'text', text}] })  // re-send
// which re-rolls the assistant turn (mirrors MAYA's lander-first-prompt
// seed+send path in Chat.client.tsx:415-438).
//
// Enter = save, Shift+Enter = newline, Esc = cancel.
import { useEffect, useRef, useState } from 'react';

interface MessageEditorProps {
  initialText: string;
  onSave: (text: string) => void;
  onCancel: () => void;
  language?: 'hi' | 'en';
}

export function MessageEditor({ initialText, onSave, onCancel, language = 'en' }: MessageEditorProps) {
  const [text, setText] = useState(initialText);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 280)}px`;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, []);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (text.trim()) onSave(text.trim());
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="w-full">
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKey}
        rows={2}
        className="w-full bg-[#111110] text-[14px] text-[#F5F4F0] placeholder:text-[#6B6560] resize-none border-none outline-none rounded-2xl ring-1 ring-[#E8601A]/30 focus:ring-[#E8601A]/50 px-4 py-2.5 leading-relaxed max-h-[280px]"
        style={{ minHeight: '52px' }}
      />
      <div className="flex items-center justify-end gap-1.5 mt-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-[12px] text-[#9E9890] hover:text-[#F5F4F0] hover:bg-white/[0.04] transition-colors"
        >
          {language === 'hi' ? 'रद्द' : 'Cancel'}
        </button>
        <button
          type="button"
          onClick={() => text.trim() && onSave(text.trim())}
          disabled={!text.trim()}
          className="px-3 py-1.5 rounded-full bg-[#E8601A] text-white text-[12px] font-medium hover:bg-[#C94E12] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {language === 'hi' ? 'भेजें' : 'Send'}
        </button>
      </div>
    </div>
  );
}
