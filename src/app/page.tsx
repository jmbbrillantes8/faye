"use client";

import { useState, useRef, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import ReactMarkdown from "react-markdown";
import { useABTest } from "@/hooks/useABTest";

type Message = { role: "user" | "faye" | "consent"; content: string };
type ConsentStatus = "unset" | "pending" | "accepted" | "declined";

const WELCOME_MESSAGE: Message = {
  role: "faye",
  content: "Hey! I'm Faye 👋\nI'm here to help you check in with yourself — whether you're feeling overwhelmed at work, need a space to reflect, or just want to breathe for a moment. We can talk about stress, burnout, how your day really went, or work through something together.\nKamusta ka?",
};

const CONSENT_MESSAGE: Message = { role: "consent", content: "" };

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

type FeedbackStatus = "idle" | "open" | "submitting" | "success" | "error";

export default function FayePage() {
  const { variant, headline } = useABTest();
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [anonymousId, setAnonymousId] = useState("");
  const [consentStatus, setConsentStatus] = useState<ConsentStatus>("unset");
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [pendingHistory, setPendingHistory] = useState<Message[]>([]);
  const [feedbackStatus, setFeedbackStatus] = useState<FeedbackStatus>("idle");
  const [feedbackText, setFeedbackText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const submitFeedback = async () => {
    if (!feedbackText.trim()) return;
    setFeedbackStatus("submitting");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: feedbackText, anonymousId }),
      });
      if (!res.ok) throw new Error();
      setFeedbackStatus("success");
      setFeedbackText("");
      setTimeout(() => setFeedbackStatus("idle"), 2500);
    } catch {
      setFeedbackStatus("error");
    }
  };

  useEffect(() => {
    const id = getAnonymousId();
    setAnonymousId(id);

    if (localStorage.getItem("faye_consent") === "accepted") {
      setConsentStatus("accepted");
    }

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

      const { history = [], summary } = await res.json();

      if (history.length > 0) {
        const cleanSummary = summary
          ? summary.replace(/^(\*{1,2})?(summary|here'?s? (a |the )?summary)\*{0,2}[:\s]*/i, "").trim()
          : null;
        setMessages([
          {
            role: "faye",
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

    const newMessages: Message[] = [...messages, { role: "user", content: userText }];
    setMessages(newMessages);

    if (consentStatus !== "accepted") {
      setPendingMessage(userText);
      setPendingHistory(messages);
      setConsentStatus("pending");
      setMessages([...newMessages, CONSENT_MESSAGE]);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText, anonymousId, history: messages }),
      });
      const data = await res.json();
      setMessages([...newMessages, { role: "faye", content: data.reply }]);
    } catch {
      setMessages([...newMessages, { role: "faye", content: "Oops, may nangyari. Try ulit? 🙏" }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleAccept = async () => {
    localStorage.setItem("faye_consent", "accepted");
    setConsentStatus("accepted");

    const withoutConsent = messages.filter((m) => m.role !== "consent");
    setMessages(withoutConsent);

    fetch("/api/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anonymousId }),
    }).catch(() => {});

    if (pendingMessage) {
      setLoading(true);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: pendingMessage,
            anonymousId,
            history: pendingHistory,
          }),
        });
        const data = await res.json();
        setMessages([...withoutConsent, { role: "faye", content: data.reply }]);
      } catch {
        setMessages([...withoutConsent, { role: "faye", content: "Oops, may nangyari. Try ulit? 🙏" }]);
      } finally {
        setLoading(false);
        setPendingMessage(null);
        setPendingHistory([]);
        inputRef.current?.focus();
      }
    }
  };

  const handleDecline = () => {
    setConsentStatus("declined");
    const withoutConsent = messages.filter((m) => m.role !== "consent");
    setMessages([
      ...withoutConsent,
      {
        role: "faye",
        content: "No worries, I understand. 🌿 Your comfort matters. Whenever you're ready, you can review and accept the privacy policy below to continue chatting.",
      },
    ]);
  };

  const handleReviewAndAccept = () => {
    setConsentStatus("pending");
    setMessages((prev) => [...prev, CONSENT_MESSAGE]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const inputDisabled = consentStatus === "pending" || consentStatus === "declined";

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
            <div className="text-xs text-blue-400" data-variant={variant}>A little support for your workday.</div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {messages.map((msg, i) => {
            if (msg.role === "consent") {
              return (
                <div key={i} className="flex items-end gap-2 justify-start">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0" style={{ background: "#037EF3" }}>
                    🌿
                  </div>
                  <div className="max-w-[85%] bg-white text-blue-900 rounded-2xl rounded-bl-sm shadow-sm border border-blue-200 px-4 py-3 text-sm leading-relaxed">
                    <p className="mb-2">
                      Before we continue, I want to be upfront about how I handle your data. 🌿
                    </p>
                    <p className="mb-3">
                      Please take a moment to read our{" "}
                      <a
                        href="/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium underline hover:opacity-80 transition"
                        style={{ color: "#037EF3" }}
                      >
                        Privacy Policy
                      </a>
                      . By accepting, you agree to how Faye collects and uses your chat data to support your wellbeing.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleAccept}
                        className="flex-1 py-2 rounded-xl text-white text-sm font-medium transition hover:opacity-90"
                        style={{ background: "#037EF3" }}
                      >
                        Accept
                      </button>
                      <button
                        onClick={handleDecline}
                        className="flex-1 py-2 rounded-xl text-blue-500 text-sm font-medium border border-blue-200 bg-white transition hover:bg-blue-50"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div key={i} className={`flex items-end gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "faye" && (
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
            );
          })}

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
        {consentStatus === "declined" ? (
          <div className="p-4 border-t border-blue-100 flex items-center justify-center">
            <button
              onClick={handleReviewAndAccept}
              className="text-sm font-medium transition hover:opacity-80"
              style={{ color: "#037EF3" }}
            >
              Review &amp; Accept Privacy Policy to continue →
            </button>
          </div>
        ) : (
          <div className="p-4 border-t border-blue-100 flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={inputDisabled}
              placeholder={inputDisabled ? "Please respond above to continue…" : "How can I help you now?"}
              rows={1}
              className="flex-1 border border-blue-200 rounded-2xl px-4 py-2.5 text-sm text-blue-900 bg-white resize-none outline-none focus:border-[#037EF3] transition disabled:opacity-40 disabled:cursor-not-allowed"
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading || inputDisabled}
              className="w-10 h-10 rounded-full text-white flex items-center justify-center transition flex-shrink-0 disabled:opacity-40"
              style={{ background: "#037EF3" }}
            >
              ➤
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="pb-3 flex justify-center">
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-300 hover:text-blue-400 transition"
          >
            Privacy Policy
          </a>
        </div>

      </div>

      {/* Floating feedback button */}
      <button
        onClick={() => setFeedbackStatus(feedbackStatus === "open" ? "idle" : "open")}
        className="fixed bottom-5 right-5 text-white text-sm font-medium px-4 py-2 rounded-full shadow-lg transition hover:opacity-90"
        style={{ background: "#037EF3" }}
      >
        Feedback
      </button>

      {/* Feedback modal */}
      {(feedbackStatus === "open" || feedbackStatus === "submitting" || feedbackStatus === "error" || feedbackStatus === "success") && (
        <div className="fixed bottom-16 right-5 w-72 bg-white rounded-2xl shadow-xl border border-blue-100 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-blue-900">Share your feedback</span>
            <button
              onClick={() => { setFeedbackStatus("idle"); setFeedbackText(""); }}
              className="text-blue-300 hover:text-blue-500 text-lg leading-none"
            >
              ×
            </button>
          </div>
          {feedbackStatus === "success" ? (
            <p className="text-sm text-green-600 text-center py-2">Thanks for your feedback! 🌿</p>
          ) : (
            <>
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="What's on your mind? Any suggestions or issues?"
                rows={4}
                className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm text-blue-900 bg-white resize-none outline-none focus:border-[#037EF3] transition"
              />
              {feedbackStatus === "error" && (
                <p className="text-xs text-red-400">Something went wrong. Please try again.</p>
              )}
              <button
                onClick={submitFeedback}
                disabled={!feedbackText.trim() || feedbackStatus === "submitting"}
                className="w-full py-2 rounded-xl text-white text-sm font-medium transition hover:opacity-90 disabled:opacity-40"
                style={{ background: "#037EF3" }}
              >
                {feedbackStatus === "submitting" ? "Sending…" : "Send feedback"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
