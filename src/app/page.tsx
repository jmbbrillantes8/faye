"use client";

import { useState, useRef, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import ReactMarkdown from "react-markdown";
import { useABTest } from "@/hooks/useABTest";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Message = { role: "user" | "faye"; content: string };
type View = null | "landing" | "chat"; // null = determining on mount
type Device = null | "ios" | "android" | "browser";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const WELCOME_MESSAGE: Message = {
  role: "faye",
  content:
    "Hey! I'm Faye 👋\nI'm here to help you check in with yourself — whether you're feeling overwhelmed at work, need a space to reflect, or just want to breathe for a moment. We can talk about stress, burnout, how your day really went, or work through something together.\nKamusta ka?",
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

type FeedbackStatus = "idle" | "open" | "submitting" | "success" | "error";

export default function FayePage() {
  const { variant } = useABTest();
  const [view, setView] = useState<View>(null);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [anonymousId, setAnonymousId] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState<FeedbackStatus>("idle");
  const [feedbackText, setFeedbackText] = useState("");
  const [orgCode, setOrgCode] = useState("");
  const [orgCodeInput, setOrgCodeInput] = useState("");
  const [orgCodeError, setOrgCodeError] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [fadeIn, setFadeIn] = useState(false);
  const [device, setDevice] = useState<Device>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [androidInstalled, setAndroidInstalled] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const id = getAnonymousId();
    setAnonymousId(id);

    const hasConsent = localStorage.getItem("faye_consent") === "accepted";
    const savedOrgCode = localStorage.getItem("faye_org_code") || "";
    setOrgCode(savedOrgCode);
    setOrgCodeInput(savedOrgCode);

    if (!hasConsent) {
      // New user: no server calls until they accept the privacy policy.
      setView("landing");
      setTimeout(() => setFadeIn(true), 10);
      return;
    }

    // Returning user: already consented, safe to initialise.
    const initReturningUser = async () => {
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
          ? summary
              .replace(/^(\*{1,2})?(summary|here'?s? (a |the )?summary)\*{0,2}[:\s]*/i, "")
              .trim()
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

      setView("chat");
      setTimeout(() => setFadeIn(true), 10);
    };

    initReturningUser();
  }, []);

  useEffect(() => {
    if (view === "chat") {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading, view]);

  useEffect(() => {
    const ua = navigator.userAgent;
    if (/iphone|ipad|ipod/i.test(ua)) setDevice("ios");
    else if (/android/i.test(ua)) setDevice("android");
    else setDevice("browser");

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);
  }, []);

  useEffect(() => {
    // Pick up the prompt if it fired before React mounted
    const early = (window as { __pwaPrompt?: BeforeInstallPromptEvent }).__pwaPrompt;
    if (early) setDeferredPrompt(early);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const installed = () => setAndroidInstalled(true);
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

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

  const handleAccept = async () => {
    const trimmedCode = orgCodeInput.trim().toUpperCase();

    if (trimmedCode) {
      const res = await fetch("/api/validate-org-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmedCode }),
      });
      const { valid, org_name } = await res.json();
      if (!valid) {
        setOrgCodeError(true);
        return;
      }
      localStorage.setItem("faye_org_code", trimmedCode);
      setOrgCode(trimmedCode);
      setOrgName(org_name || "");
      await supabaseBrowser.from("user_org_codes").insert({
        anonymous_id: anonymousId,
        org_code: trimmedCode,
      });
    }

    setOrgCodeError(false);
    localStorage.setItem("faye_consent", "accepted");

    // Create user row now that consent is confirmed, then record the timestamp.
    await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anonymousId }),
    });

    fetch("/api/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anonymousId }),
    }).catch(() => {});

    setShowConsentModal(false);
    setFadeIn(false);
    setTimeout(() => {
      setView("chat");
      setTimeout(() => setFadeIn(true), 10);
    }, 250);
  };

  const sendMessage = async (text?: string) => {
    const userText = text || input.trim();
    if (!userText || loading) return;
    setInput("");

    const newMessages: Message[] = [...messages, { role: "user", content: userText }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText, anonymousId, history: messages, orgCode }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      if (!data.reply) throw new Error("Empty reply");
      setMessages([...newMessages, { role: "faye", content: data.reply }]);
    } catch {
      setMessages([
        ...newMessages,
        {
          role: "faye",
          content:
            "Sorry about that, I hit a small problem. It's nothing about what you said. Could you try sending that again?",
        },
      ]);
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

  const handleAndroidInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (outcome === "dismissed") setShowConsentModal(true);
    } else {
      setShowConsentModal(true);
    }
  };

  const feedbackPanel = (
    <>
      <button
        onClick={() => setFeedbackStatus(feedbackStatus === "open" ? "idle" : "open")}
        className="fixed bottom-5 right-5 text-white text-sm font-medium px-4 py-2 rounded-full shadow-lg transition hover:opacity-90"
        style={{ background: "#037EF3" }}
      >
        Feedback
      </button>

      {(feedbackStatus === "open" ||
        feedbackStatus === "submitting" ||
        feedbackStatus === "error" ||
        feedbackStatus === "success") && (
        <div className="fixed bottom-16 right-5 w-72 bg-white rounded-2xl shadow-xl border border-blue-100 p-4 flex flex-col gap-3 z-40">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-blue-900">Share your feedback</span>
            <button
              onClick={() => {
                setFeedbackStatus("idle");
                setFeedbackText("");
              }}
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
    </>
  );

  // Spinner while determining session
  if (view === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-50 to-slate-50 flex items-center justify-center">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-blue-300 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    );
  }

  // Landing page
  if (view === "landing") {
    return (
      <div
        className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-50 to-slate-50 flex items-center justify-center p-6"
        style={{ transition: "opacity 250ms ease", opacity: fadeIn ? 1 : 0 }}
      >
        <div className="w-full max-w-sm flex flex-col items-center text-center gap-8">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-4xl shadow-lg"
            style={{ background: "#037EF3" }}
          >
            🌿
          </div>

          <div className="flex flex-col gap-3">
            <h1 className="text-3xl font-bold text-blue-900">Hi, I&apos;m Faye.</h1>
            <p className="text-blue-700 text-base leading-relaxed">
              A safe space to check in with yourself — whether you&apos;re stressed, overwhelmed, or
              just need someone to talk to.
            </p>

          </div>

          {/* Device-aware CTA */}
          {isStandalone ? (
            // Already running as installed PWA
            <button
              onClick={() => setShowConsentModal(true)}
              className="w-full py-3.5 rounded-2xl text-white font-medium text-base transition hover:opacity-90 shadow-md"
              style={{ background: "#037EF3" }}
            >
              Chat with Faye
            </button>
          ) : device === "android" ? (
            androidInstalled ? (
              <div className="w-full flex flex-col gap-2">
                <p className="text-sm text-green-600 font-medium text-center">
                  Faye is installed! Open it from your home screen.
                </p>
                <button
                  onClick={() => setShowConsentModal(true)}
                  className="w-full py-3.5 rounded-2xl text-white font-medium text-base transition hover:opacity-90 shadow-md"
                  style={{ background: "#037EF3" }}
                >
                  Chat with Faye
                </button>
              </div>
            ) : (
              // Always show install CTA for Android browser — native prompt or manual instructions
              <div className="w-full flex flex-col gap-2">
                <button
                  onClick={handleAndroidInstall}
                  className="w-full py-3.5 rounded-2xl text-white font-medium text-base transition hover:opacity-90 shadow-md"
                  style={{ background: "#037EF3" }}
                >
                  Install Faye
                </button>
                <button
                  onClick={() => setShowConsentModal(true)}
                  className="w-full py-2.5 rounded-2xl text-blue-500 text-sm font-medium border border-blue-200 bg-white transition hover:bg-blue-50"
                >
                  Continue in browser
                </button>
              </div>
            )
          ) : device === "ios" ? (
            <div className="w-full flex flex-col gap-2">
              <button
                onClick={() => setShowIOSInstructions(true)}
                className="w-full py-3.5 rounded-2xl text-white font-medium text-base transition hover:opacity-90 shadow-md"
                style={{ background: "#037EF3" }}
              >
                Add to Home Screen
              </button>
              <button
                onClick={() => setShowConsentModal(true)}
                className="w-full py-2.5 rounded-2xl text-blue-500 text-sm font-medium border border-blue-200 bg-white transition hover:bg-blue-50"
              >
                Continue in browser
              </button>
            </div>
          ) : device === "browser" ? (
            <button
              onClick={() => setShowConsentModal(true)}
              className="w-full py-3.5 rounded-2xl text-white font-medium text-base transition hover:opacity-90 shadow-md"
              style={{ background: "#037EF3" }}
            >
              Chat with Faye
            </button>
          ) : (
            // device === null: still detecting, render placeholder to avoid layout shift
            <div className="w-full h-12" />
          )}

          <p className="text-xs text-blue-300">Free and anonymous. No account needed.</p>

        </div>

        {/* iOS install instructions modal */}
        {showIOSInstructions && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 z-50">
            <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-blue-900 text-base">Add Faye to your Home Screen</div>
                <button
                  onClick={() => setShowIOSInstructions(false)}
                  className="text-blue-300 hover:text-blue-500 text-2xl leading-none"
                >
                  ×
                </button>
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-sm font-bold text-blue-500 flex-shrink-0">1</div>
                  <p className="text-sm text-blue-800 leading-relaxed pt-1">
                    Tap the <span className="font-semibold">Share</span> button{" "}
                    <span className="inline-block text-base">⎙</span> at the bottom of your Safari browser.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-sm font-bold text-blue-500 flex-shrink-0">2</div>
                  <p className="text-sm text-blue-800 leading-relaxed pt-1">
                    Scroll down and tap{" "}
                    <span className="font-semibold">&ldquo;Add to Home Screen&rdquo;</span>.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-sm font-bold text-blue-500 flex-shrink-0">3</div>
                  <p className="text-sm text-blue-800 leading-relaxed pt-1">
                    Tap <span className="font-semibold">&ldquo;Add&rdquo;</span> in the top right. Faye will appear on your home screen.
                  </p>
                </div>
              </div>

              <p className="text-xs text-blue-400 text-center">Only works in Safari on iPhone or iPad.</p>

              <button
                onClick={() => {
                  setShowIOSInstructions(false);
                  setShowConsentModal(true);
                }}
                className="w-full py-3 rounded-2xl text-blue-500 text-sm font-medium border border-blue-200 bg-white transition hover:bg-blue-50"
              >
                Continue in browser instead
              </button>
            </div>
          </div>
        )}

        {/* Consent modal */}
        {showConsentModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 z-50">
            <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-lg flex-shrink-0"
                  style={{ background: "#037EF3" }}
                >
                  🌿
                </div>
                <div>
                  <div className="font-semibold text-blue-900 text-sm">Before we start</div>
                  <div className="text-xs text-blue-400">A few things to know</div>
                </div>
              </div>

              <p className="text-sm text-blue-800 leading-relaxed">
                Your privacy matters. Please take a moment to read our{" "}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline hover:opacity-80 transition"
                  style={{ color: "#037EF3" }}
                >
                  Privacy Policy
                </a>
                . By accepting, you agree to how Faye collects and uses your chat data to support
                your wellbeing.
              </p>

              <div>
                <input
                  type="text"
                  value={orgCodeInput}
                  onChange={(e) => {
                    setOrgCodeInput(e.target.value.toUpperCase());
                    setOrgCodeError(false);
                    setOrgName("");
                  }}
                  placeholder="Partner code (optional)"
                  maxLength={20}
                  className="w-full border border-blue-200 rounded-xl px-3 py-2.5 text-sm text-blue-900 bg-white outline-none focus:border-[#037EF3] transition tracking-widest placeholder:tracking-normal"
                />
                {orgCodeError ? (
                  <p className="text-xs text-red-400 mt-1">
                    Invalid org code. Please check with your organization.
                  </p>
                ) : orgName ? (
                  <p className="text-xs text-green-500 mt-1">✓ Joined as {orgName}</p>
                ) : (
                  <p className="text-xs text-blue-400 mt-1">
                    If your organization gave you a code, enter it here.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={handleAccept}
                  className="w-full py-3 rounded-2xl text-white text-sm font-medium transition hover:opacity-90"
                  style={{ background: "#037EF3" }}
                >
                  I accept — start chatting
                </button>
                <button
                  onClick={() => {
                    setShowConsentModal(false);
                    setOrgCodeError(false);
                  }}
                  className="w-full py-3 rounded-2xl text-blue-500 text-sm font-medium border border-blue-200 bg-white transition hover:bg-blue-50"
                >
                  Maybe later
                </button>
              </div>
            </div>
          </div>
        )}

        {feedbackPanel}
      </div>
    );
  }

  // Chat view (returning users or post-consent)
  return (
    <div
      className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-50 to-slate-50 flex items-center justify-center p-4"
      style={{ transition: "opacity 250ms ease", opacity: fadeIn ? 1 : 0 }}
    >
      <div className="w-full max-w-lg bg-white/80 backdrop-blur rounded-3xl shadow-xl border border-blue-100 flex flex-col h-[680px]">
        {/* Header */}
        <div className="p-5 border-b border-blue-100 flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center text-xl shadow"
            style={{ background: "#037EF3" }}
          >
            🌿
          </div>
          <div>
            <div className="font-bold text-blue-900">Faye</div>
            <div className="text-xs text-blue-400" data-variant={variant}>
              A little support for your workday.
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex items-end gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "faye" && (
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0"
                  style={{ background: "#037EF3" }}
                >
                  🌿
                </div>
              )}
              <div
                className={`max-w-[78%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "text-white rounded-br-sm whitespace-pre-wrap"
                    : "bg-white text-blue-900 rounded-bl-sm shadow-sm border border-blue-100 prose prose-sm prose-blue max-w-none"
                }`}
                style={msg.role === "user" ? { background: "#037EF3" } : {}}
              >
                {msg.role === "user" ? (
                  msg.content
                ) : (
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-end gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-sm"
                style={{ background: "#037EF3" }}
              >
                🌿
              </div>
              <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border border-blue-100 flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-blue-400 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Quick prompts — visible only on first message */}
        {messages.length <= 1 && (
          <div className="px-4 pb-3 flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => sendMessage(p)}
                className="text-xs px-3 py-1.5 rounded-full border border-blue-200 text-blue-600 hover:bg-blue-50 transition"
              >
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

      {feedbackPanel}
    </div>
  );
}
