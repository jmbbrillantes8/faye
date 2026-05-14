export const metadata = {
  title: "Privacy Policy — Faye",
};

const SECTIONS = [
  {
    title: "1. What We Collect",
    content: [
      {
        heading: "Information Faye collects",
        items: [
          "Chat and message content — the messages you send during a session",
          "Mood check-in responses — emotional inputs such as stress level or how you are feeling",
          "Session data — an anonymous session ID (a randomly generated identifier, not linked to your name or identity), timestamps, and basic browser or device metadata",
        ],
      },
      {
        heading: "Information Faye does NOT collect",
        items: [
          "Your name, email address, or any government-issued ID",
          "Your employer, company, or workplace",
          "Medical records or clinical history",
          "Any information that directly identifies you as an individual",
        ],
      },
      {
        heading: null,
        items: [
          "Faye does not require account creation. Anyone with access to the link can use Faye anonymously.",
        ],
      },
    ],
  },
  {
    title: "2. How We Use Your Data",
    content: [
      {
        heading: null,
        items: [
          "To operate Faye — generating responses, tracking mood within a session, and delivering wellness support",
          "To improve Faye — understanding how people interact with the chatbot helps us make it more helpful and culturally appropriate for Filipino users",
          "To maintain service health — session and device data helps us detect technical issues and ensure reliability",
        ],
      },
      {
        heading: null,
        items: [
          "We do not use your data for advertising, selling to third parties, profiling, or any commercial purpose beyond operating and improving Faye.",
        ],
      },
    ],
  },
  {
    title: "3. Mental Health Data and Sensitivity",
    content: [
      {
        heading: null,
        items: [
          "We recognize that conversations about mental health, work stress, and emotional wellbeing are deeply personal. We treat all chat content as sensitive data, even when it cannot be linked to an identified individual.",
          "Chat content is used only to generate Faye's responses and is not reviewed by humans unless required for safety or legal reasons",
          "Aggregate, anonymized insights (e.g. common stress themes) may be used to improve Faye's responses — never in a way that identifies any individual",
          "We do not build personal profiles or mental health assessments from your conversations",
        ],
      },
    ],
  },
  {
    title: "4. Not a Clinical Service",
    content: [
      {
        heading: null,
        items: [
          "Faye is a wellness support tool, not a licensed mental health provider. Conversations with Faye are not protected by clinical confidentiality (such as that between a patient and a therapist or doctor).",
          "Faye is designed to complement — not replace — professional mental health care. We encourage users who are experiencing serious distress, suicidal thoughts, or a mental health crisis to seek professional help immediately.",
        ],
      },
      {
        heading: "Crisis resources in the Philippines",
        items: [
          "National Center for Mental Health (NCMH) Crisis Hotline: 1553",
          "In Touch Crisis Line: (02) 893-7603",
          "Hopeline Philippines: (02) 804-4673",
        ],
      },
    ],
  },
  {
    title: "5. Data Storage and Retention",
    content: [
      {
        heading: null,
        items: [
          "Your data is stored on Supabase, a cloud database platform with encryption at rest and in transit.",
          "Chat content and mood responses are retained for up to 90 days, after which they are automatically deleted",
          "Session and device data is retained for up to 12 months for service analytics",
          "No sensitive identifying information is stored alongside your chat data",
          "We take reasonable technical and organizational measures to protect your data. However, no system is completely secure. We encourage you not to share highly sensitive personal information (e.g. financial details, government IDs) in your conversations with Faye.",
        ],
      },
    ],
  },
  {
    title: "6. Third-Party Services",
    content: [
      {
        heading: null,
        items: [
          "Supabase — secure data storage",
          "Anthropic Claude API — the AI language model that powers Faye's responses. Your messages are processed through Anthropic's systems in accordance with their privacy policy",
          "Notion — stores user feedback submitted through the app. Feedback text and your anonymous session identifier are sent to Notion for internal review",
          "Vercel — application hosting",
          "We select providers that maintain reasonable data protection standards. Each provider operates under their own privacy policy.",
        ],
      },
    ],
  },
  {
    title: "7. Your Rights Under RA 10173",
    content: [
      {
        heading: null,
        items: [
          "Under the Philippine Data Privacy Act of 2012 (RA 10173), you have the right to:",
          "Be informed about how your data is collected and used",
          "Access data linked to your session",
          "Request correction or deletion of your data",
          "Object to processing of your data",
          "File a complaint with the National Privacy Commission (NPC) at www.privacy.gov.ph",
          "Because Faye does not collect identifying information, exercising some of these rights may require you to provide your session identifier. Contact us at the address below and we will assist you.",
        ],
      },
    ],
  },
  {
    title: "8. Minors",
    content: [
      {
        heading: null,
        items: [
          "Faye is intended for adults aged 18 and above. We do not knowingly collect data from minors. If you believe someone under 18 has used Faye, please contact us so we can remove their data promptly.",
        ],
      },
    ],
  },
  {
    title: "9. Changes to This Policy",
    content: [
      {
        heading: null,
        items: [
          "We may update this Privacy Policy as Faye develops. Material changes will be reflected in the effective date at the top of this document. Where possible, we will notify users through the app interface.",
        ],
      },
    ],
  },
  {
    title: "10. Contact Us",
    content: [
      {
        heading: null,
        items: [
          "For privacy-related questions, data requests, or concerns:",
          "privacy@faye.app",
          "We aim to respond within 5 business days.",
        ],
      },
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-50 to-slate-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">

        {/* Header card */}
        <div className="bg-white/80 backdrop-blur rounded-3xl shadow-xl border border-blue-100 p-8 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-lg shadow flex-shrink-0"
              style={{ background: "#037EF3" }}
            >
              🌿
            </div>
            <div>
              <div className="font-bold text-blue-900 text-lg">Faye</div>
              <div className="text-xs text-blue-400">Privacy Policy</div>
            </div>
          </div>

          <div className="text-xs text-blue-400 mb-4">
            Effective date: March 2026 · Applies to: Faye web app
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 text-sm text-blue-800 mb-6">
            <strong>Important:</strong> Faye is not a clinical mental health service and does not replace professional care.
            If you are in crisis, please call the National Center for Mental Health Crisis Hotline:{" "}
            <strong>1553</strong>.
          </div>

          <p className="text-sm text-blue-900 leading-relaxed">
            Faye is a mental wellness chatbot designed to provide emotional support, guided check-ins, and coping tools
            for individuals experiencing work-related stress. This Privacy Policy explains what information Faye
            collects, how it is used, and how it is protected.
          </p>
          <p className="text-sm text-blue-700 mt-3 leading-relaxed">
            By using Faye, you agree to the practices described in this policy.
          </p>
        </div>

        {/* Policy sections */}
        <div className="space-y-4">
          {SECTIONS.map((section) => (
            <div
              key={section.title}
              className="bg-white/80 backdrop-blur rounded-2xl shadow-sm border border-blue-100 p-6"
            >
              <h2 className="font-bold text-blue-900 text-sm mb-3">{section.title}</h2>
              {section.content.map((block, bi) => (
                <div key={bi} className="mb-3 last:mb-0">
                  {block.heading && (
                    <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-2">
                      {block.heading}
                    </p>
                  )}
                  <ul className="space-y-1.5">
                    {block.items.map((item, ii) => (
                      <li key={ii} className="text-sm text-blue-900 leading-relaxed flex gap-2">
                        {block.heading !== null && block.items.length > 1 ? (
                          <>
                            <span className="text-blue-300 flex-shrink-0 mt-0.5">·</span>
                            <span>{item}</span>
                          </>
                        ) : (
                          <span>{item}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-blue-300">
          Faye — Mental wellness support for Filipinos — © 2026
        </div>
      </div>
    </div>
  );
}
