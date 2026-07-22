const RESEND_API_URL = "https://api.resend.com/emails";

/**
 * Sends a transactional email via Resend. Silently no-ops (logs a warning)
 * when RESEND_API_KEY isn't configured, so local dev without an email
 * provider doesn't crash invite/notification flows.
 */
export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[email] RESEND_API_KEY not set — skipped sending "${subject}" to ${to}`);
    return;
  }
  const from = process.env.RESEND_FROM_EMAIL || "BinaWorks <onboarding@resend.dev>";

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[email] Resend request failed (${res.status}): ${body}`);
  }
}

export function inviteEmailHtml({
  orgName,
  roleLabel,
  invitedByName,
  link,
}: {
  orgName: string;
  roleLabel: string;
  invitedByName: string;
  link: string;
}): string {
  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;color:#17212D;max-width:480px;margin:0 auto">
      <div style="background:#F5A800;color:#241A02;font-weight:700;font-size:14px;letter-spacing:.06em;text-transform:uppercase;padding:16px 24px;border-radius:10px 10px 0 0">
        BinaWorks
      </div>
      <div style="border:1px solid #E6EAF1;border-top:0;border-radius:0 0 10px 10px;padding:24px">
        <h2 style="margin:0 0 12px;font-size:20px">You&rsquo;re invited to ${orgName}</h2>
        <p style="color:#55677B;line-height:1.55;margin:0 0 20px">
          ${invitedByName} invited you to join <b>${orgName}</b> on BinaWorks as a <b>${roleLabel}</b>.
        </p>
        <a href="${link}" style="display:inline-block;background:#F5A800;color:#241A02;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:8px">
          Accept invitation
        </a>
        <p style="color:#8797AA;font-size:12.5px;margin:20px 0 0">
          If the button doesn&rsquo;t work, paste this link into your browser:<br>${link}
        </p>
      </div>
    </div>
  `;
}
