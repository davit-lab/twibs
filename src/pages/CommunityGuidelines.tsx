import LegalLayout from '@/components/legal/LegalLayout';

function Rule({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-bold tracking-tight mb-3">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export default function CommunityGuidelines() {
  return (
    <LegalLayout title="Community Guidelines" updatedAt="August 16, 2026">
      <p className="font-medium">
        Twibsers is a place to be yourself and connect with others. These guidelines help keep everyone safe,
        respectful, and creative.
      </p>

      <Rule title="Be respectful">
        <p>
          Treat others with kindness. Harassment, bullying, intimidation, and hateful speech based on race,
          ethnicity, religion, gender, sexual orientation, disability, or identity are not allowed.
        </p>
      </Rule>

      <Rule title="Share what is yours">
        <p>
          Post only content you own or have permission to share. Respect copyright and give credit when due.
          Impersonating other people, accounts, or brands is not allowed.
        </p>
      </Rule>

      <Rule title="Keep it appropriate">
        <p>
          No nudity, sexual content, graphic violence, self-harm promotion, or dangerous content. Content that is
          illegal — including anything exploiting minors — is strictly prohibited and may be reported to
          authorities.
        </p>
      </Rule>

      <Rule title="Don't spam or scam">
        <p>
          Don't spam feeds with repetitive or deceptive posts, mislead others for engagement, or run scams,
          phishing attempts, or fraudulent schemes.
        </p>
      </Rule>

      <Rule title="Reporting and consequences">
        <p>
          If you see something that violates these guidelines, use the report option on the post, comment, or
          profile. Our moderation team reviews reports, and content that violates the rules may be hidden or
          removed. Accounts that repeatedly break the rules may be suspended.
        </p>
      </Rule>

      <Rule title="Eligibility">
        <p>
          You must be at least 13 years old to use Twibsers. If we learn that an account belongs to someone
          younger, we will remove it.
        </p>
      </Rule>
    </LegalLayout>
  );
}
