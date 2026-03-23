"use client";

import { useState, useRef, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";

const WELCOME_MESSAGE = {
  role: "assistant",
  content: "Hey! I'm Faye 👋 Your pocket-sized wellness companion sa work. How are you today? 🌿",
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
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [anonymousId, setAnonymousId] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const id = getAnonymousId();
    setAnonymousId(id);
    // Register user in Supabase
    fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anonymousId: id }),
    });
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
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-stone-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white/80 backdrop-blur rounded-3xl shadow-xl border border-green-100 flex flex-col h-[680px]">

        {/* Header */}
        <div className="p-5 border-b border-green-100 flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center text-xl shadow">
            🌿
          </div>
          <div>
            <div className="font-bold text-green-900">Faye</div>
            <div className="text-xs text-green-500 italic">Your workplace wellness companion</div>
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs text-green-400">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            here for you
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex items-end gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center text-sm flex-shrink-0">
                  🌿
                </div>
              )}
              <div className={`max-w-[78%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-green-600 text-white rounded-br-sm"
                  : "bg-white text-green-900 rounded-bl-sm shadow-sm border border-green-100"
              }`}>
                {msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-end gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center text-sm">
                🌿
              </div>
              <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border border-green-100 flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-2 h-2 rounded-full bg-green-400 animate-bounce"
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
                className="text-xs px-3 py-1.5 rounded-full border border-green-200 text-green-600 hover:bg-green-50 transition">
                {p}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t border-green-100 flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ano'ng nasa isip mo ngayon?"
            rows={1}
            className="flex-1 border border-green-200 rounded-2xl px-4 py-2.5 text-sm text-green-900 bg-white resize-none outline-none focus:border-green-400 transition"
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            className="w-10 h-10 rounded-full bg-green-600 disabled:bg-green-200 text-white flex items-center justify-center transition hover:bg-green-700 flex-shrink-0"
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}