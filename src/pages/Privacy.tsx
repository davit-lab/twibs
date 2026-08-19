import LegalLayout from '@/components/legal/LegalLayout';

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-bold tracking-tight mb-3 flex items-baseline gap-2">
        <span className="text-primary font-extrabold">{n}</span>
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export default function Privacy() {
  return (
    <LegalLayout title="Privacy Policy" updatedAt="August 16, 2026">
      <p className="font-medium">
        This Privacy Policy explains what information we collect, how we use it, and the choices you have.
      </p>

      <Section n="1." title="Information we collect">
        <p>
          When you create an account, we collect your email address, display name, and profile photo. If you add
          location information, we use it to power features like nearby discovery. Content you post (photos,
          videos, stories, comments) and your interactions (follows, stars, saves) are stored to operate the
          platform.
        </p>
      </Section>

      <Section n="2." title="How we use information">
        <p>
          We use your information to provide the service, personalise your feed, notify you of activity, show you
          relevant advertising, and keep the platform safe. We do not sell your personal data.
        </p>
      </Section>

      <Section n="3." title="Advertising">
        <p>
          Sponsors place advertisements on Twibsers. Advertisers provide their own creative content and targeting
          preferences, and their campaigns are served through our advertising system. We share aggregated
          performance data (such as views and engagement) with advertisers, but not your personal identity.
        </p>
      </Section>

      <Section n="4." title="Sharing and disclosure">
        <p>
          Public profile information and posts you share publicly are visible to other users. We may disclose
          information to service providers who help operate the service, and when required by law or to protect
          the safety of our users.
        </p>
      </Section>

      <Section n="5." title="Data storage and security">
        <p>
          Your data is stored securely, and access is protected with industry-standard controls. No method of
          transmission or storage is completely secure, but we work to protect your information.
        </p>
      </Section>

      <Section n="6." title="Your choices">
        <p>
          You can edit your profile, change notification preferences, block or mute other users, and delete your
          posts at any time. Deleting your account removes your account data from the platform.
        </p>
      </Section>

      <Section n="7." title="Contact">
        <p>
          For privacy questions or requests, contact{' '}
          <a href="mailto:support@twibsers.com" className="text-primary font-medium hover:underline">support@twibsers.com</a>.
        </p>
      </Section>
    </LegalLayout>
  );
}
