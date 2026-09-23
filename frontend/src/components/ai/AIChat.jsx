import { useEffect, useRef, useState } from "react";
import { aiApi } from "../../lib/services";
import "./AIChat.css";

const GREETING = {
  role: "ai",
  text: "Hi! I'm your AI Analyst. I can see your leads, pipeline and follow-ups - ask me anything about them.",
};

const SUGGESTIONS = [
  "Summarize my pipeline",
  "Which leads need follow-up?",
  "What are my biggest open deals?",
];

export default function AIChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  // Keep the newest message in view.
  useEffect(() => {
    if (isOpen) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, isOpen]);

  const send = async (raw) => {
    const message = raw.trim();
    if (!message || loading) return;

    // Earlier turns give the AI conversational memory (the new message is sent separately).
    const history = messages.filter((m) => !m.error).slice(-10).map(({ role, text }) => ({ role, text }));

    setMessages((prev) => [...prev, { role: "user", text: message }]);
    setInput("");
    setLoading(true);

    try {
      const res = await aiApi.chat({ message, history });
      setMessages((prev) => [...prev, { role: "ai", text: res.reply }]);
    } catch (err) {
      // Show the real reason (missing key, quota, network...) instead of a vague error.
      setMessages((prev) => [
        ...prev,
        { role: "ai", error: true, text: err?.message || "Something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    send(input);
  };

  const newChat = () => setMessages([GREETING]);

  return (
    <div className={`ai-chat-container ${isOpen ? "open" : ""}`}>
      {!isOpen && (
        <button className="ai-chat-toggle" onClick={() => setIsOpen(true)}>
          <span className="sparkle-icon">✨</span> Ask AI
        </button>
      )}

      {isOpen && (
        <div className="ai-chat-window">
          <div className="ai-chat-header">
            <h3>Gemini AI Analyst</h3>
            <div className="ai-chat-header-actions">
              <button className="close-btn" onClick={newChat} title="New chat" aria-label="New chat">
                ↺
              </button>
              <button className="close-btn" onClick={() => setIsOpen(false)} title="Close" aria-label="Close chat">
                ×
              </button>
            </div>
          </div>

          <div className="ai-chat-messages">
            {messages.map((m, i) => (
              <div key={i} className={`chat-message ${m.role}`}>
                <div className={`chat-bubble ${m.error ? "error" : ""}`}>{m.text}</div>
              </div>
            ))}

            {messages.length === 1 && !loading && (
              <div className="ai-chat-suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}

            {loading && (
              <div className="chat-message ai">
                <div className="chat-bubble typing">Thinking…</div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form className="ai-chat-input" onSubmit={onSubmit}>
            <input
              type="text"
              placeholder="Ask about your leads or pipeline..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              maxLength={2000}
            />
            <button type="submit" disabled={loading || !input.trim()}>
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
