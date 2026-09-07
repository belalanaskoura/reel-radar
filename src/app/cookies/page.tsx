import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/LegalPage';

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description: 'Which cookies ReelRadar uses and why.',
};

const LAST_UPDATED = 'September 7, 2026';
const CONTACT_EMAIL = 'belalhamada489@gmail.com';

export default function CookiePolicyPage() {
  return (
    <LegalPage title="Cookie Policy" updated={LAST_UPDATED}>
      <p>
        This page explains the cookies ReelRadar sets and why. In short: we only use cookies
        that are strictly necessary to make the site work — signing you in, keeping your session
        secure, and protecting admin access. We don&rsquo;t use advertising cookies, and we
        don&rsquo;t use any third-party analytics or tracking cookies.
      </p>

      <LegalSection heading="Cookies we use">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-left text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--rule)' }}>
                <th className="py-2 pr-4 font-semibold" style={{ color: 'var(--ink)' }}>
                  Cookie
                </th>
                <th className="py-2 pr-4 font-semibold" style={{ color: 'var(--ink)' }}>
                  Purpose
                </th>
                <th className="py-2 font-semibold" style={{ color: 'var(--ink)' }}>
                  Duration
                </th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--rule)' }}>
                <td className="py-2 pr-4 align-top">Supabase auth session</td>
                <td className="py-2 pr-4 align-top">
                  Keeps you signed in and identifies your account on each request. Strictly
                  necessary — without it you&rsquo;d be signed out on every page load.
                </td>
                <td className="py-2 align-top">Up to 30 days</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 align-top">Admin session</td>
                <td className="py-2 pr-4 align-top">
                  A short-lived, signed cookie that lets an already-verified admin skip
                  re-checking admin status on every click. Only set for admin accounts. Strictly
                  necessary for admin security.
                </td>
                <td className="py-2 align-top">A few minutes</td>
              </tr>
            </tbody>
          </table>
        </div>
      </LegalSection>

      <LegalSection heading="What we don't use">
        <ul className="list-disc pl-5">
          <li>No advertising or ad-retargeting cookies.</li>
          <li>No third-party analytics cookies (e.g. Google Analytics) — our usage stats are logged server-side, not via a browser cookie or tracking script.</li>
          <li>No cross-site tracking or social-media &ldquo;like&rdquo;/embed cookies.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Local storage (not a cookie, but similar)">
        <p>
          We also use your browser&rsquo;s local storage — not sent to our servers — for two
          things: remembering your light/dark theme preference, and remembering which
          &ldquo;what&rsquo;s new&rdquo; announcements you&rsquo;ve already seen. Clearing your
          browser data resets both.
        </p>
      </LegalSection>

      <LegalSection heading="Managing cookies">
        <p>
          Because every cookie ReelRadar sets is strictly necessary for the site to function
          (signing in, staying signed in, admin security), we don&rsquo;t show a cookie-consent
          banner asking you to opt in — there&rsquo;s no optional/advertising cookie to opt out
          of. You can still block or delete cookies entirely through your browser settings, but
          doing so will sign you out and prevent you from staying logged in.
        </p>
      </LegalSection>

      <LegalSection heading="Questions">
        <p>
          See our{' '}
          <Link href="/privacy" className="underline" style={{ color: 'var(--accent)' }}>
            Privacy Policy
          </Link>{' '}
          for how we handle data more broadly, or reach us at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline" style={{ color: 'var(--accent)' }}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
