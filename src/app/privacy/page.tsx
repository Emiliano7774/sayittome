import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

import PublicLegalFooter from "@/components/legal/PublicLegalFooter";

export const metadata: Metadata = {
  title: "Privacy Policy | SayItToMe",
  description:
    "Privacy Policy for SayItToMe — how we collect, use, store, and protect user information.",
};

const CONTACT_EMAIL = "sayittomebussines@gmail.com";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight text-white md:text-2xl">{title}</h2>
      <div className="space-y-3 text-sm leading-7 text-white/70 md:text-[15px] md:leading-8">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto w-full max-w-3xl px-5 py-10 pb-16 md:px-8 md:py-14">
        <header className="mb-10 border-b border-white/10 pb-8">
          <Link
            href="/"
            className="inline-flex items-center text-sm font-semibold text-violet-300 transition hover:text-violet-200"
          >
            ← Back to SayItToMe
          </Link>

          <div className="mt-6 flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-indigo-300 via-violet-500 to-[#4f35ff]" />
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-violet-300/90">
              SayItToMe
            </p>
          </div>

          <h1 className="mt-5 text-3xl font-black tracking-tight md:text-4xl">
            Privacy Policy for SayItToMe
          </h1>
          <p className="mt-3 text-sm text-white/45">Last updated: May 29, 2026</p>
          <p className="mt-5 text-base leading-7 text-white/65 md:text-[17px] md:leading-8">
            SayItToMe is an anonymous social interaction platform that allows users to create
            profiles, share content, view stories, and communicate through anonymous or direct
            conversations.
          </p>
          <p className="mt-3 text-base leading-7 text-white/65 md:text-[17px] md:leading-8">
            This Privacy Policy explains how SayItToMe collects, uses, stores, and protects user
            information.
          </p>
        </header>

        <article className="space-y-10 rounded-[28px] border border-white/10 bg-[#0a0a0a]/90 p-6 shadow-[0_0_40px_rgba(124,58,237,0.08)] md:p-8">
          <Section title="1. Information We Collect">
            <p>We may collect the following types of information:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Account information, such as email address and authentication data.
              </li>
              <li>
                Profile information, such as username, biography, profile photo, gallery photos,
                videos, country, region, language preferences, and profile settings.
              </li>
              <li>
                User-generated content, such as stories, photos, videos, messages, anonymous
                chats, reports, and interactions.
              </li>
              <li>
                Technical information, such as device type, browser, operating system, app version,
                crash data, security logs, and usage activity.
              </li>
              <li>
                Moderation and safety information, including reports, blocked users, content review
                status, sensitive media detection results, and anti-abuse signals.
              </li>
              <li>
                Advertising or analytics identifiers only when applicable and permitted by platform
                policies.
              </li>
            </ul>
          </Section>

          <Section title="2. How We Use Information">
            <p>We use collected information to:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Provide and operate the SayItToMe platform.</li>
              <li>Create and display user profiles.</li>
              <li>
                Enable stories, chats, anonymous messages, likes, followers, and discovery
                features.
              </li>
              <li>Improve app performance and user experience.</li>
              <li>
                Detect abuse, spam, harassment, unsafe behavior, and policy violations.
              </li>
              <li>Moderate user-generated content.</li>
              <li>Apply sensitive content blur and consent systems.</li>
              <li>Maintain security and prevent fraud.</li>
              <li>Comply with legal, platform, and policy requirements.</li>
            </ul>
          </Section>

          <Section title="3. User-Generated Content">
            <p>
              SayItToMe allows users to upload and share content such as profile photos, gallery
              images, stories, videos, and messages.
            </p>
            <p>
              Users are responsible for the content they upload or send. Some content may be
              reviewed, blurred, restricted, or removed if it violates platform rules, safety
              requirements, or applicable laws.
            </p>
          </Section>

          <Section title="4. Sensitive Content and Moderation">
            <p>
              SayItToMe uses moderation tools to help protect users and reduce unsafe exposure to
              sensitive content.
            </p>
            <p>
              Potentially sensitive images or media may be automatically blurred by default. Users
              may be asked to provide session-based consent before viewing certain sensitive
              content.
            </p>
            <p>
              Reported content may be reviewed and restricted. Repeat abuse, harassment, spam, or
              harmful behavior may result in temporary or permanent restrictions.
            </p>
          </Section>

          <Section title="5. Anonymous Interactions">
            <p>
              SayItToMe includes anonymous social features. Anonymous interactions are designed to
              protect user privacy, but safety systems may still process technical signals to
              prevent abuse, harassment, spam, or policy violations.
            </p>
          </Section>

          <Section title="6. Third-Party Services">
            <p>
              SayItToMe uses third-party services to operate the platform, including infrastructure
              and services provided by Google and Firebase, such as:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Firebase Authentication</li>
              <li>Cloud Firestore</li>
              <li>Firebase Storage</li>
              <li>Firebase Hosting</li>
              <li>Firebase Cloud Messaging</li>
              <li>Google Play services</li>
              <li>Analytics, advertising, or moderation services when applicable</li>
            </ul>
            <p>
              These services may process data according to their own privacy policies and security
              practices.
            </p>
          </Section>

          <Section title="7. Advertising and Analytics">
            <p>
              SayItToMe may display ads or use analytics tools to understand app performance and
              improve the service.
            </p>
            <p>
              Advertising providers may process device or advertising identifiers when allowed by
              the user&apos;s device settings and applicable platform policies.
            </p>
            <p>Users can control certain advertising preferences through their device settings.</p>
          </Section>

          <Section title="8. Data Storage and Security">
            <p>
              User data may be stored using secure cloud infrastructure, including Firebase and
              Google Cloud services. We take reasonable measures to protect user information, but
              no online platform can guarantee absolute security.
            </p>
          </Section>

          <Section title="9. Account and Data Deletion">
            <p>
              Users may request deletion of their account or associated data by contacting:{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="font-semibold text-violet-300 hover:text-violet-200"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
            <p>
              Please include the email address associated with the account and the username, if
              available.
            </p>
            <p>
              Some information may be retained when necessary for legal, security, fraud
              prevention, or abuse-prevention purposes.
            </p>
          </Section>

          <Section title="10. Children&apos;s Privacy">
            <p>
              SayItToMe is not intended for children under the minimum age required by applicable
              law or platform rules. Users who do not meet the required age should not use the
              service.
            </p>
          </Section>

          <Section title="11. Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time. Updates will be posted on this
              page with a revised &ldquo;Last updated&rdquo; date.
            </p>
          </Section>

          <Section title="12. Contact">
            <p>
              For privacy questions, account deletion requests, or data-related inquiries, contact:
            </p>
            <p>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="font-semibold text-violet-300 hover:text-violet-200"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
          </Section>
        </article>

        <PublicLegalFooter className="mt-10" />
      </div>
    </main>
  );
}
