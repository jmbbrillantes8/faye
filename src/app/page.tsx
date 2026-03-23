"use client";

import { useState, useRef, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import ReactMarkdown from "react-markdown";
import { useABTest } from "@/hooks/useABTest";

const WELCOME_MESSAGE = {
  role: "assistant",
  content: "Hey! I'm Faye 👋\nI'm here to help you check in with yourself — whether you're feeling overwhelmed at work, need a space to reflect, or just want to breathe for a moment. We can talk about stress, burnout, how your day really went, or work through something together.\nKamusta ka?",
};

const QUICK_PROMPTS = [
  "I'm feeling overwhelmed",
  "I need to vent",
  "Help me reframe a thought",
  "I want to do a quick check-in",
];

function getAnonymousId(): string {
  let id = localStorage.getItem("faye_user_id");
  if (!id) {
    id = uuidv4();
    localStorage.setItem("faye_user_id", id);
  }
  return id;
}

export default function FayePage() {
  const { variant, headline } = useABTest();
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [anonymousId, setAnonymousId] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const id = getAnonymousId();
    setAnonymousId(id);

    const initUser = async () => {
      await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anonymousId: id }),
      });

      const res = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anonymousId: id }),
      });

      const { history, summary } = await res.json();

      if (history.length > 0) {
        const cleanSummary = summary
          ? summary.replace(/^(\*{1,2})?(summary|here'?s? (a |the )?summary)\*{0,2}[:\s]*/i, "").trim()
          : null;
        setMessages([
          {
            role: "assistant",
            content: cleanSummary
              ? `Welcome back! 🌿 Last time, ${cleanSummary} Kumusta ka ngayon?`
              : "Welcome back! 🌿 Kumusta ka ngayon?",
          },
          ...history,
        ]);
      }
    };

    initUser();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (text?: string) => {
    const userText = text || input.trim();
    if (!userText || loading) return;
    setInput("");

    const newMessages = [...messages, { role: "user", content: userText }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userText,
          anonymousId,
          history: messages,
        }),
      });

      const data = await res.json();
      setMessages([...newMessages, { role: "assistant", content: data.reply }]);
    } catch {
      setMessages([...newMessages, {
        role: "assistant",
        content: "Oops, may nangyari. Try ulit? 🙏",
      }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-50 to-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white/80 backdrop-blur rounded-3xl shadow-xl border border-blue-100 flex flex-col h-[680px]">

        {/* Header */}
        <div className="p-5 border-b border-blue-100 flex items-center gap-3">
          <div className="w-11 h-11 rounded-full flex items-center justify-center text-xl shadow" style={{ background: "#037EF3" }}>
            🌿
          </div>
          <div>
            <div className="font-bold text-blue-900">Faye</div>
            {headline && (
              <div className="text-xs text-blue-400 italic" data-variant={variant}>{headline}</div>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs text-blue-400">
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            here for you
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex items-end gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0" style={{ background: "#037EF3" }}>
                  🌿
                </div>
              )}
              <div className={`max-w-[78%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                msg.role === "user"
                  ? "text-white rounded-br-sm whitespace-pre-wrap"
                  : "bg-white text-blue-900 rounded-bl-sm shadow-sm border border-blue-100 prose prose-sm prose-blue max-w-none"
              }`} style={msg.role === "user" ? { background: "#037EF3" } : {}}>
                {msg.role === "user" ? msg.content : <ReactMarkdown>{msg.content}</ReactMarkdown>}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-end gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background: "#037EF3" }}>
                🌿
              </div>
              <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border border-blue-100 flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-2 h-2 rounded-full bg-blue-400 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Quick prompts */}
        {messages.length <= 1 && (
          <div className="px-4 pb-3 flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((p) => (
              <button key={p} onClick={() => sendMessage(p)}
                className="text-xs px-3 py-1.5 rounded-full border border-blue-200 text-blue-600 hover:bg-blue-50 transition">
                {p}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t border-blue-100 flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="How can I help you now?"
            rows={1}
            className="flex-1 border border-blue-200 rounded-2xl px-4 py-2.5 text-sm text-blue-900 bg-white resize-none outline-none focus:border-[#037EF3] transition"
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            className="w-10 h-10 rounded-full text-white flex items-center justify-center transition flex-shrink-0 disabled:opacity-40"
            style={{ background: "#037EF3" }}
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}