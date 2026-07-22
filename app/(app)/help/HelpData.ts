export type HelpArticle = {
  id: string;
  cat: "Getting Started" | "FAQ" | "Video Tutorials";
  ic: string;
  title: string;
  desc: string;
  body: string[];
  video?: boolean;
};

export const HELP_CAT_CLS: Record<HelpArticle["cat"], string> = {
  "Getting Started": "b-amber",
  FAQ: "b-info",
  "Video Tutorials": "b-purple",
};

export const APP_VERSION = { v: "0.9.4", build: "2026.07.10", channel: "Preview" };

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: "h1",
    cat: "Getting Started",
    ic: "🏁",
    title: "Set up your company workspace",
    desc: "Register your company, add your SSM and CIDB details, and upload your logo in Company Settings.",
    body: [
      "Every BinaWorks workspace belongs to one company. When you register, you become the Owner with full access — including team management and company settings.",
      "Head to Company Settings to complete your profile: registration numbers, business address and branding. Your logo appears in the sidebar for the whole team.",
    ],
  },
  {
    id: "h2",
    cat: "Getting Started",
    ic: "🏗️",
    title: "Create your first project",
    desc: "Projects are the backbone — reports, attendance, materials and documents all hang off one.",
    body: [
      "Open Projects and click Create Project. Give it a name, site address, client, contract value in RM, and the planned start and end dates.",
      "Assign a project manager and set your baseline progress. Everything else in BinaWorks — daily reports, attendance, material requests, documents — is filed against a project.",
      "Tip: keep one project per contract or work order for the cleanest reporting.",
    ],
  },
  {
    id: "h3",
    cat: "Getting Started",
    ic: "✉️",
    title: "Invite your team and assign roles",
    desc: "Send invitations with a role and let people join instantly. Each person belongs to one company only.",
    body: [
      "From the Team page, click Invite User. Enter their name, email and role — the role decides exactly what they can see and do.",
      "They get an invitation link to create their password and land directly in your workspace.",
      "Click any role badge anywhere in the app to see its full permission breakdown.",
    ],
  },
  {
    id: "h4",
    cat: "Getting Started",
    ic: "🗒️",
    title: "File a daily report from site",
    desc: "Weather, manpower by trade, work done, delays and photos — in under two minutes.",
    body: [
      "Supervisors open Daily Reports → New Report. Pick the project and date, note the weather, and set manpower by trade.",
      "Describe work completed and flag delays, then attach site photos straight from the phone camera.",
      "Submitted reports appear instantly for your PM and Owner to review.",
    ],
  },
  {
    id: "h5",
    cat: "FAQ",
    ic: "📦",
    title: "How do material request approvals work?",
    desc: "Draft → Submitted → Approved/Rejected → Ordered → Delivered, with a full audit trail.",
    body: [
      "A supervisor raises a request with quantity, needed-by date and justification. It lands with anyone holding the Approve Material Requests permission (PM or Owner).",
      "Rejections require a comment; every state change is stamped onto the request timeline with who and when.",
      "Storekeepers or supervisors mark goods Delivered with the received quantity.",
    ],
  },
  {
    id: "h6",
    cat: "FAQ",
    ic: "👥",
    title: "Can a user belong to two companies?",
    desc: "No — each account belongs to exactly one company workspace.",
    body: [
      "BinaWorks enforces one company per user. An email address can only ever hold one account, and that account lives inside a single workspace.",
      "This keeps data cleanly separated between contractors — nothing leaks across companies.",
    ],
  },
  {
    id: "h7",
    cat: "FAQ",
    ic: "💰",
    title: "How are wages calculated?",
    desc: "Attendance × daily rate: present = 1 day, half-day = 0.5, absent = 0.",
    body: [
      "Each worker has a daily rate in RM. The monthly attendance summary multiplies days worked by that rate — half-days count as 0.5.",
      "Export the summary as CSV for payroll.",
      "Rates are edited on the worker record by a PM or the Owner.",
    ],
  },
  {
    id: "h8",
    cat: "FAQ",
    ic: "🪪",
    title: "What do the CIDB green card alerts mean?",
    desc: "Workers with cards expiring within 30 days are flagged in red across the app.",
    body: [
      "Every worker record stores a CIDB green card number and expiry date. When expiry falls within 30 days, BinaWorks flags the worker in attendance and rosters.",
      "Renew the card and update the expiry date on the worker record to clear the flag.",
    ],
  },
  {
    id: "h9",
    cat: "FAQ",
    ic: "🔑",
    title: "How do I reset an employee's password?",
    desc: "They reset it themselves with \"Forgot password?\" on the sign-in page — no admin action needed.",
    body: [
      "BinaWorks doesn't let Owners or Admins set a password on someone else's behalf. Instead, ask the teammate to click \"Forgot password?\" on the sign-in page — they'll get an email to set a new one themselves.",
      "Deactivated accounts keep their history but can't sign in until reactivated by an Owner or Admin from Team.",
    ],
  },
  {
    id: "h10",
    cat: "Video Tutorials",
    ic: "▶",
    title: "BinaWorks in 5 minutes",
    desc: "A quick tour of the dashboard, projects and the daily site workflow.",
    video: true,
    body: [
      "This walkthrough video is still being filmed — check back soon.",
      "It'll cover: signing in, reading the dashboard, opening a project, and where every module lives.",
    ],
  },
  {
    id: "h11",
    cat: "Video Tutorials",
    ic: "▶",
    title: "Daily reports walkthrough",
    desc: "Filing a complete report from site, with photos, in real time.",
    video: true,
    body: [
      "This walkthrough video is still being filmed — check back soon.",
      "It'll cover: weather, manpower, delays, photo uploads and PM review.",
    ],
  },
  {
    id: "h12",
    cat: "Video Tutorials",
    ic: "▶",
    title: "Approving material requests",
    desc: "The approval flow from a PM's seat — including rejections done right.",
    video: true,
    body: [
      "This walkthrough video is still being filmed — check back soon.",
      "It'll cover: the request timeline, approve/reject with comments, ordering and delivery.",
    ],
  },
];
