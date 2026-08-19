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

export default function Terms() {
  return (
    <LegalLayout title="Terms of Service" updatedAt="August 16, 2026">
      <p className="font-medium">
        Welcome to Twibsers. By creating an account or using our services, you agree to these Terms of Service.
        Please read them carefully.
      </p>

      <Section n="1." title="Who we are">
        <p>
          Twibsers is a social platform where you can share photos, videos, stories, and connect with friends and
          community groups. These terms govern your use of the platform, our website, and any related services.
        </p>
      </Section>

      <Section n="2." title="Your account">
        <p>
          You are responsible for the accuracy of the information you provide and for safeguarding your account
          credentials. You must be at least 13 years old to use the service. You may not create multiple accounts
          to circumvent blocks, bans, or platform rules.
        </p>
      </Section>

      <Section n="3." title="Content you share">
        <p>
          You retain ownership of the content you post. By posting, you grant Twibsers a worldwide, non-exclusive,
          royalty-free license to host, store, display, and distribute your content so we can operate the platform.
        </p>
        <p>
          You confirm that you own or have the necessary rights to everything you share, and that your content does
          not infringe the rights of others.
        </p>
      </Section>

      <Section n="4." title="Acceptable use">
        <p>
          You agree not to use Twibsers to post or share content that is illegal, harassing, hateful, violent, or
          sexually explicit, or that otherwise violates our Community Guidelines. We may remove content or suspend
          accounts that violate these rules.
        </p>
      </Section>

      <Section n="5." title="Our services">
        <p>
          We work hard to keep the platform available, but we may modify, suspend, or discontinue features at any
          time. Advertisements shown on the platform are clearly marked as such.
        </p>
      </Section>

      <Section n="6." title="Termination">
        <p>
          You may delete your account at any time. We may terminate or restrict access to accounts that repeatedly
          or seriously violate these Terms or the Community Guidelines.
        </p>
      </Section>

      <Section n="7." title="Disclaimers and liability">
        <p>
          The service is provided "as is" without warranties of any kind. To the maximum extent permitted by law,
          Twibsers is not liable for indirect, incidental, or consequential damages arising from your use of the
          platform.
        </p>
      </Section>

      <Section n="8." title="Contact">
        <p>
          Questions about these Terms can be sent to{' '}
          <a href="mailto:support@twibsers.com" className="text-primary font-medium hover:underline">support@twibsers.com</a>.
        </p>
      </Section>
    </LegalLayout>
  );
}
