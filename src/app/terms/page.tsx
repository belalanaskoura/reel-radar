import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/LegalPage';

export const metadata: Metadata = {
  title: 'Terms & Conditions',
  description: 'The terms that govern your use of ReelRadar.',
};

const LAST_UPDATED = 'September 8, 2026';
const CONTACT_EMAIL = 'belalhamada489@gmail.com';

export default function TermsPage() {
  return (
    <LegalPage title="Terms &amp; Conditions" updated={LAST_UPDATED}>
      <p>
        These terms govern your use of ReelRadar (reelradar.online), operated by an individual,
        not a registered company. By creating an account or using the site, you agree to them.
        If you don&rsquo;t agree, please don&rsquo;t use the service.
      </p>

      <LegalSection heading="1. What ReelRadar is">
        <p>
          ReelRadar tracks movie showtimes at tracked Cairo cinemas and notifies you when a movie
          you&rsquo;re watching becomes bookable. We surface publicly available showtime and
          pricing information for your convenience.
        </p>
        <p>
          <strong style={{ color: 'var(--ink)' }}>
            ReelRadar is not affiliated with, endorsed by, or officially connected to any cinema
            chain, distributor, or the TMDB/OMDb services referenced on this site.
          </strong>{' '}
          All cinema names, logos, and showtime data belong to their respective owners and are
          used only to identify the cinemas and describe their public listings.
        </p>
        <p>
          <strong style={{ color: 'var(--ink)' }}>We do not sell tickets.</strong> ReelRadar
          never processes payments or books seats on your behalf. Every &ldquo;book&rdquo; or
          &ldquo;showtimes&rdquo; link takes you to the cinema&rsquo;s own website to complete
          your purchase there, under their terms.
        </p>
      </LegalSection>

      <LegalSection heading="2. Accuracy of information">
        <p>
          Showtimes, bookability, and prices are gathered automatically from cinema websites and
          may be delayed, incomplete, or occasionally wrong — cinemas can change their listings
          at any time without notice to us. Displayed prices (where shown) are estimates based on
          published price templates or the cinema&rsquo;s own listings, and are not a guarantee
          of the price you&rsquo;ll be charged. Always confirm showtime, seat availability, and
          price on the cinema&rsquo;s own site before you rely on it.
        </p>
      </LegalSection>

      <LegalSection heading="3. Your account">
        <ul className="list-disc pl-5">
          <li>You must provide a valid email address and keep your login credentials secure.</li>
          <li>You&rsquo;re responsible for activity that happens under your account.</li>
          <li>You must be old enough to consent to these terms under the laws of your country.</li>
          <li>
            One account per person — don&rsquo;t create accounts to abuse rate limits, spam
            feedback, or interfere with the service.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="4. Acceptable use">
        <p>You agree not to:</p>
        <ul className="list-disc pl-5">
          <li>Scrape, reverse-engineer, or systematically extract data from ReelRadar itself.</li>
          <li>Attempt to bypass rate limits, authentication, or access controls.</li>
          <li>Use the service to send spam, abuse, or unlawful content through any feature (e.g. feedback).</li>
          <li>Interfere with the service&rsquo;s operation or other users&rsquo; access to it.</li>
        </ul>
        <p>We may suspend or terminate accounts that violate these terms.</p>
      </LegalSection>

      <LegalSection heading="5. Notifications">
        <p>
          By enabling email or push notifications, you consent to receive alerts about your
          watchlist, followed cinemas, and account-related messages. You can disable these at any
          time from your account settings — this won&rsquo;t affect your ability to browse the
          site.
        </p>
      </LegalSection>

      <LegalSection heading="6. Third-party sites">
        <p>
          ReelRadar links out to cinema booking pages and other third-party sites we don&rsquo;t
          control. We&rsquo;re not responsible for their content, availability, or how they
          handle your data once you leave ReelRadar.
        </p>
      </LegalSection>

      <LegalSection heading="7. Disclaimer of warranties">
        <p>
          ReelRadar is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without
          warranties of any kind, express or implied. We don&rsquo;t guarantee the service will
          be uninterrupted, error-free, or that showtime data will always be accurate or
          up to date.
        </p>
      </LegalSection>

      <LegalSection heading="8. Limitation of liability">
        <p>
          To the fullest extent permitted by law, ReelRadar and its operator won&rsquo;t be
          liable for any indirect, incidental, or consequential damages arising from your use of
          the service — including, without limitation, missed showtimes, incorrect pricing
          information, or a ticket purchase made on a third-party site based on information shown
          here.
        </p>
      </LegalSection>

      <LegalSection heading="9. Changes to the service or these terms">
        <p>
          We may modify or discontinue features of ReelRadar at any time. We may update these
          terms from time to time; continued use after a change means you accept the updated
          terms. Material changes will update the &ldquo;last updated&rdquo; date above.
        </p>
      </LegalSection>

      <LegalSection heading="10. Governing law">
        <p>
          These terms are governed by the laws of the Arab Republic of Egypt, without regard to
          conflict-of-law principles.
        </p>
      </LegalSection>

      <LegalSection heading="11. Contact us">
        <p>
          Questions about these terms? Reach us at{' '}
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
