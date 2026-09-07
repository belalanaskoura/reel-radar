import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/LegalPage';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How ReelRadar collects, uses, and protects your data.',
};

const LAST_UPDATED = 'September 8, 2026';
const CONTACT_EMAIL = 'belalhamada489@gmail.com';

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Privacy Policy" updated={LAST_UPDATED}>
      <p>
        ReelRadar (&ldquo;ReelRadar&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) operates
        reelradar.online, a service for browsing movies playing at Cairo cinemas and getting
        notified when tickets go on sale. ReelRadar is operated by an individual, not a
        registered company. This policy explains what data we collect, why, and what choices you
        have about it.
      </p>

      <LegalSection heading="1. Data we collect">
        <p>
          <strong style={{ color: 'var(--ink)' }}>Account data.</strong> When you sign up, we
          store your email address and a hashed password (or, if you use &ldquo;Sign in with
          Google&rdquo;, the profile info Google shares with us — your name, email, and avatar).
          If you upload a profile picture, we store that image.
        </p>
        <p>
          <strong style={{ color: 'var(--ink)' }}>Watchlist and preferences.</strong> The movies
          you watchlist, the cinemas you follow, and your notification settings (email, browser
          push, or both).
        </p>
        <p>
          <strong style={{ color: 'var(--ink)' }}>Push notification data.</strong> If you enable
          browser push notifications, your browser generates a push subscription (an endpoint URL
          and encryption keys) that we store so we can deliver alerts to that device.
        </p>
        <p>
          <strong style={{ color: 'var(--ink)' }}>Feedback.</strong> If you use the in-app
          feedback form, we store what you send along with your account email so we can reply.
        </p>
        <p>
          <strong style={{ color: 'var(--ink)' }}>Usage data.</strong> We log a sample of page
          views (roughly 1 in 10) for basic traffic analytics — the page path and, where
          relevant, which movie or cinema it relates to. We don&rsquo;t use third-party analytics
          or advertising trackers, and this data isn&rsquo;t tied to your identity beyond
          whatever&rsquo;s in the URL itself.
        </p>
        <p>
          <strong style={{ color: 'var(--ink)' }}>Technical data.</strong> Standard server logs
          (IP address, browser user agent, timestamps) are captured briefly for security and
          debugging, consistent with normal web server operation.
        </p>
      </LegalSection>

      <LegalSection heading="2. How we use your data">
        <ul className="list-disc pl-5">
          <li>To create and secure your account, and to let you sign in.</li>
          <li>
            To notify you (by email and/or browser push) when a movie on your watchlist becomes
            bookable, when a followed cinema&rsquo;s lineup changes, or about account and
            security events.
          </li>
          <li>To respond to feedback or support requests you send us.</li>
          <li>To detect abuse, enforce rate limits, and keep the service secure and reliable.</li>
          <li>To understand aggregate usage (which pages are visited) so we can improve the app.</li>
        </ul>
        <p>We do not sell your data, and we do not use it for advertising.</p>
      </LegalSection>

      <LegalSection heading="3. Who we share data with">
        <p>
          We use a small number of third-party service providers to run ReelRadar. Each only
          receives the data it needs to do its job:
        </p>
        <ul className="list-disc pl-5">
          <li>
            <strong style={{ color: 'var(--ink)' }}>Supabase</strong> — hosts our database and
            handles authentication (including Google sign-in). Your account data, watchlist, and
            password hash live here.
          </li>
          <li>
            <strong style={{ color: 'var(--ink)' }}>Resend</strong> — sends transactional emails
            (notifications, password resets, feedback replies) on our behalf. Your email address
            and the email content pass through their systems to deliver the message.
          </li>
          <li>
            <strong style={{ color: 'var(--ink)' }}>Vercel</strong> — hosts the application
            itself and processes standard request/server logs.
          </li>
          <li>
            <strong style={{ color: 'var(--ink)' }}>Browser push services</strong> (e.g. Google
            or Mozilla&rsquo;s push infrastructure) — deliver push notifications to your browser;
            they see the encrypted push payload&rsquo;s destination, not its contents.
          </li>
          <li>
            <strong style={{ color: 'var(--ink)' }}>TMDB and OMDb</strong> — we query these
            movie-database APIs to show posters, synopses, and ratings. We don&rsquo;t send them
            any of your personal data.
          </li>
        </ul>
        <p>
          We do not share your data with advertisers or data brokers, and we don&rsquo;t sell it
          to anyone.
        </p>
      </LegalSection>

      <LegalSection heading="4. Data retention">
        <p>
          We keep your account data for as long as your account exists. Sampled page-view
          analytics and notification-delivery logs are pruned automatically after a bounded
          retention window. If you delete your account, your profile, watchlist, cinema follows,
          and push subscriptions are deleted; some records (like past notification history) may
          be retained in de-identified or aggregate form.
        </p>
      </LegalSection>

      <LegalSection heading="5. Your rights and choices">
        <ul className="list-disc pl-5">
          <li>
            <strong style={{ color: 'var(--ink)' }}>Access and correction.</strong> You can view
            and update your profile from your account settings at any time.
          </li>
          <li>
            <strong style={{ color: 'var(--ink)' }}>Notification preferences.</strong> You can
            turn email or push notifications on or off, or unfollow cinemas/movies, from your
            account or notification settings.
          </li>
          <li>
            <strong style={{ color: 'var(--ink)' }}>Deletion.</strong> You can request deletion
            of your account and associated data by contacting us (see below).
          </li>
          <li>
            <strong style={{ color: 'var(--ink)' }}>Portability and objection.</strong> Depending
            on where you live, you may have additional rights to request a copy of your data or
            object to certain processing — for example, if you&rsquo;re in Egypt, under Law No.
            151 of 2020 on the Protection of Personal Data, or if you&rsquo;re in the EU/EEA/UK,
            under GDPR. Contact us and we&rsquo;ll do our best to help.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="6. Cookies">
        <p>
          ReelRadar uses cookies that are strictly necessary to keep you signed in and to secure
          admin access — we don&rsquo;t use advertising or third-party tracking cookies. See our{' '}
          <Link href="/cookies" className="underline" style={{ color: 'var(--accent)' }}>
            Cookie Policy
          </Link>{' '}
          for details.
        </p>
      </LegalSection>

      <LegalSection heading="7. Children">
        <p>
          ReelRadar is not directed at children under 13, and we do not knowingly collect data
          from them.
        </p>
      </LegalSection>

      <LegalSection heading="8. Changes to this policy">
        <p>
          We may update this policy from time to time. If we make material changes, we&rsquo;ll
          update the &ldquo;last updated&rdquo; date above, and where appropriate notify you
          in-app.
        </p>
      </LegalSection>

      <LegalSection heading="9. Contact us">
        <p>
          Questions about this policy or a request about your data? Reach us at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline" style={{ color: 'var(--accent)' }}>
            {CONTACT_EMAIL}
          </a>{' '}
          or through the{' '}
          <Link href="/feedback" className="underline" style={{ color: 'var(--accent)' }}>
            in-app feedback form
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
