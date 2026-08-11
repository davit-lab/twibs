// Server-side email notifications for administrator authentication.
//
// Emails are always sent from the Edge Function using the EMAIL_API_KEY /
// EMAIL_PROVIDER environment secrets. The React client never sees the key.
// The message contains context metadata (time, IP, device, method) but NEVER
// raw images, embeddings or any biometric data.

export interface AdminLoginEmail {
  success: boolean;
  method: string; // 'face' | 'passkey' | 'face+passkey'
  ip: string;
  userAgent: string;
  location?: string;
}

interface EmailProvider {
  name: string;
  send(mail: AdminLoginEmail & { subject: string; text: string }): Promise<void>;
}

const resendProvider: EmailProvider = {
  name: "resend",
  async send(mail) {
    const apiKey = Deno.env.get("EMAIL_API_KEY");
    const to = Deno.env.get("ADMIN_SECURITY_EMAIL");
    if (!apiKey || !to) {
      console.warn("[email] resend configured but EMAIL_API_KEY/ADMIN_SECURITY_EMAIL missing; skipped");
      return;
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: Deno.env.get("EMAIL_FROM") ?? "Security <security@twibs.com>",
        to: [to],
        subject: mail.subject,
        text: mail.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend error ${res.status}: ${body.slice(0, 200)}`);
    }
  },
};

const consoleProvider: EmailProvider = {
  name: "console",
  async send(mail) {
    console.log("[email:console]", mail.subject, JSON.stringify(mail, null, 2));
  },
};

function selectProvider(): EmailProvider {
  const provider = (Deno.env.get("EMAIL_PROVIDER") ?? "console").toLowerCase();
  if (provider === "resend") return resendProvider;
  if (provider === "console") return consoleProvider;
  throw new Error(`Unknown EMAIL_PROVIDER: ${provider}`);
}

export async function sendAdminLoginNotification(mail: AdminLoginEmail): Promise<void> {
  const provider = selectProvider();
  const outcome = mail.success ? "successful" : "failed";
  const subject = `[Security] Administrator authentication ${outcome}`;

  const locationLine = mail.location ? `Approximate location: ${mail.location}` : "";
  const text = [
    `Administrator authentication ${outcome}`,
    ``,
    `Time: ${new Date().toISOString()}`,
    `Authentication: ${mail.method}`,
    `Device/browser: ${mail.userAgent || "unknown"}`,
    mail.ip ? `IP address: ${mail.ip}` : "IP address: unavailable",
    locationLine,
    ``,
    `If you did not just attempt to sign in, treat this as a security incident.`,
  ]
    .filter(Boolean)
    .join("\n");

  await provider.send({ ...mail, subject, text });
}
