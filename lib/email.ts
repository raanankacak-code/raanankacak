import { logger } from "@/lib/logger";

/**
 * Resend's endpoint, overridable so a staging deploy can point at a mail
 * catcher instead of delivering to real inboxes — and so the email a build
 * actually produces can be inspected rather than inferred from the template.
 */
function resendEndpoint(): string {
  return process.env.RESEND_API_URL || "https://api.resend.com/emails";
}

/**
 * Escapes a value for interpolation into HTML.
 *
 * Every value these templates interpolate is user-controlled: the company
 * name and the inviter's display name are free text a member can set, and
 * they end up inside an email that genuinely arrives from our domain. Left
 * raw, a company called `<a href="http://evil">Click here</a>` gets its
 * markup rendered by the recipient's mail client with our branding around
 * it. Mail clients strip scripts; they do not strip a convincing link.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Strips characters that have no business in a header line.
 *
 * The subject carries the company name too. Resend takes JSON rather than a
 * raw SMTP envelope, so a newline is unlikely to split a header there — but
 * "unlikely, given the provider we happen to use today" is not a property
 * worth depending on.
 *
 * Written as a scan rather than a regex so no control characters appear in
 * this file at all.
 */
export function sanitizeHeaderValue(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 0x20 || code === 0x7f ? " " : ch;
  }
  return out.replace(/\s+/g, " ").trim();
}

/** What happened to an email, so a caller can tell the user the truth. */
export interface EmailResult {
  delivered: boolean;
  /** Why it did not go, when it did not. For logs, not for users. */
  reason?: string;
}

/**
 * Sends a transactional email via Resend.
 *
 * Returns a result rather than throwing, because every caller does something
 * useful first — creating an invite, say — and discarding that because a mail
 * provider is having a bad afternoon would be the worse outcome. It no longer
 * returns void, though: it used to log a failure and return as if nothing had
 * happened, so POST /api/team/invites answered 201 whether or not the
 * invitation had gone anywhere. The invite row existed, the recipient heard
 * nothing, and nobody found out until they asked why they were never added.
 */
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const safeSubject = sanitizeHeaderValue(subject);

  if (!apiKey) {
    logger.warn("Email skipped: RESEND_API_KEY not set", { subject: safeSubject, to });
    return { delivered: false, reason: "not-configured" };
  }
  const from = process.env.RESEND_FROM_EMAIL || "BinaWorks <onboarding@resend.dev>";

  let res: Response;
  try {
    res = await fetch(resendEndpoint(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject: safeSubject, html }),
    });
  } catch (err) {
    // A network failure reaching Resend used to propagate out of the route
    // and 500 the request, throwing away a perfectly good invite.
    logger.error("Resend request could not be sent", {
      subject: safeSubject,
      to,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return { delivered: false, reason: "network-error" };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.error("Resend request failed", { status: res.status, responseBody: body, subject: safeSubject, to });
    return { delivered: false, reason: `http-${res.status}` };
  }
  return { delivered: true };
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
  const org = escapeHtml(orgName);
  const role = escapeHtml(roleLabel);
  const invitedBy = escapeHtml(invitedByName);
  // The link is built from a configured base URL (see appOrigin), never from
  // anything a member typed — but it lands in an href, and an unescaped quote
  // there would break out of the attribute.
  const href = escapeHtml(link);

  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;color:#17212D;max-width:480px;margin:0 auto">
      <div style="background:#F5A800;color:#241A02;font-weight:700;font-size:14px;letter-spacing:.06em;text-transform:uppercase;padding:16px 24px;border-radius:10px 10px 0 0">
        BinaWorks
      </div>
      <div style="border:1px solid #E6EAF1;border-top:0;border-radius:0 0 10px 10px;padding:24px">
        <h2 style="margin:0 0 12px;font-size:20px">You&rsquo;re invited to ${org}</h2>
        <p style="color:#55677B;line-height:1.55;margin:0 0 20px">
          ${invitedBy} invited you to join <b>${org}</b> on BinaWorks as a <b>${role}</b>.
        </p>
        <a href="${href}" style="display:inline-block;background:#F5A800;color:#241A02;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:8px">
          Accept invitation
        </a>
        <p style="color:#8797AA;font-size:12.5px;margin:20px 0 0">
          If the button doesn&rsquo;t work, paste this link into your browser:<br>${href}
        </p>
      </div>
    </div>
  `;
}

/**
 * The invitation a customer gets, as opposed to an employee.
 *
 * Worth its own template: "invited you to join E2E Test Co as a Client" reads
 * like a job offer from a company they are paying. This one says what the
 * login is for and, just as importantly, what it does not show them — a
 * customer who thinks they have been given the run of their contractor's
 * workspace is a support call at best.
 */
export function clientInviteEmailHtml({
  orgName,
  invitedByName,
  projectNames,
  link,
}: {
  orgName: string;
  invitedByName: string;
  projectNames: string[];
  link: string;
}): string {
  const org = escapeHtml(orgName);
  const invitedBy = escapeHtml(invitedByName);
  const href = escapeHtml(link);
  const projects = projectNames.map((n) => `<li style="margin-bottom:4px">${escapeHtml(n)}</li>`).join("");

  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;color:#17212D;max-width:480px;margin:0 auto">
      <div style="background:#F5A800;color:#241A02;font-weight:700;font-size:14px;letter-spacing:.06em;text-transform:uppercase;padding:16px 24px;border-radius:10px 10px 0 0">
        BinaWorks
      </div>
      <div style="border:1px solid #E6EAF1;border-top:0;border-radius:0 0 10px 10px;padding:24px">
        <h2 style="margin:0 0 12px;font-size:20px">Follow your project with ${org}</h2>
        <p style="color:#55677B;line-height:1.55;margin:0 0 16px">
          ${invitedBy} has given you a login to see how your work is progressing:
        </p>
        <ul style="color:#17212D;line-height:1.5;margin:0 0 16px;padding-left:20px">${projects}</ul>
        <p style="color:#55677B;line-height:1.55;margin:0 0 20px">
          You will see progress, the site diary and its photographs, the safety record and the snag list — and you
          can sign off work when they ask you to. Nothing else in ${org}&rsquo;s account is visible to you.
        </p>
        <a href="${href}" style="display:inline-block;background:#F5A800;color:#241A02;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:8px">
          Set up your login
        </a>
        <p style="color:#8797AA;font-size:12.5px;margin:20px 0 0">
          If the button doesn&rsquo;t work, paste this link into your browser:<br>${href}
        </p>
      </div>
    </div>
  `;
}

/**
 * "Something needs your signature."
 *
 * Without this the request sits in the portal until the client happens to
 * sign in, which for a sign-off is the difference between a decision this
 * week and a decision when someone remembers to telephone.
 */
export function approvalRequestEmailHtml({
  orgName,
  projectName,
  title,
  description,
  link,
}: {
  orgName: string;
  projectName: string;
  title: string;
  description?: string | null;
  link: string;
}): string {
  const org = escapeHtml(orgName);
  const project = escapeHtml(projectName);
  const what = escapeHtml(title);
  const href = escapeHtml(link);
  const detail = description?.trim()
    ? `<p style="color:#55677B;line-height:1.55;margin:0 0 20px">${escapeHtml(description.trim())}</p>`
    : "";

  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;color:#17212D;max-width:480px;margin:0 auto">
      <div style="background:#F5A800;color:#241A02;font-weight:700;font-size:14px;letter-spacing:.06em;text-transform:uppercase;padding:16px 24px;border-radius:10px 10px 0 0">
        BinaWorks
      </div>
      <div style="border:1px solid #E6EAF1;border-top:0;border-radius:0 0 10px 10px;padding:24px">
        <h2 style="margin:0 0 12px;font-size:20px">${org} needs your sign-off</h2>
        <p style="color:#55677B;line-height:1.55;margin:0 0 8px">On <b>${project}</b>:</p>
        <p style="font-size:17px;font-weight:600;margin:0 0 12px">${what}</p>
        ${detail}
        <a href="${href}" style="display:inline-block;background:#F5A800;color:#241A02;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:8px">
          Open it and answer
        </a>
        <p style="color:#8797AA;font-size:12.5px;margin:20px 0 0">
          You can approve it or reject it with a reason. Your answer is recorded with your name and the date.
        </p>
      </div>
    </div>
  `;
}
