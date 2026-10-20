import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { SiteFooter } from "@/components/Footer";
import "./PolicyPage.css";

type PolicyName =
  | "refund-policy"
  | "return-policy"
  | "privacy-policy"
  | "terms";

type PolicySection = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
};
type PolicyDocument = {
  title: string;
  summary: string;
  sections: PolicySection[];
};

const policies: Record<PolicyName, PolicyDocument> = {
  "refund-policy": {
    title: "Refund policy",
    summary:
      "A clear guide to refunds for Quill subscriptions and digital services.",
    sections: [
      {
        heading: "Subscriptions are not available yet",
        paragraphs: [
          "Quill is currently in early access. Checkout and paid subscriptions are not active, so Quill is not currently collecting subscription payments. There are no subscription charges to refund at this time.",
        ],
      },
      {
        heading: "When paid plans launch",
        paragraphs: [
          "Before you purchase, Quill will show the price, billing interval, renewal terms, cancellation steps, and any refund eligibility that applies to your plan. Those checkout terms will form part of this policy.",
          "If you believe you were charged in error after paid plans launch, contact Quill through the maintainer’s LinkedIn profile linked below. Include the account email and transaction reference, but never send card numbers or security codes. Any refund will be returned through the original payment method where possible and subject to applicable law.",
        ],
      },
      {
        heading: "Cancellation",
        paragraphs: [
          "Cancellation and the end of access will be explained before a subscription is purchased. This page does not promise a refund for unused time; the final terms will be displayed before checkout.",
        ],
      },
      {
        heading: "Changes to this policy",
        paragraphs: [
          "This policy will be updated before paid subscriptions become available. The date at the top of the page indicates the latest revision.",
        ],
      },
    ],
  },
  "return-policy": {
    title: "Return policy",
    summary:
      "Quill is a digital software service; it does not ship physical products.",
    sections: [
      {
        heading: "Digital service only",
        paragraphs: [
          "Quill provides software for working with code repositories and cloud development workspaces. No physical goods are sold or shipped, so there are no physical items to return.",
        ],
      },
      {
        heading: "Subscriptions",
        paragraphs: [
          "Paid subscriptions are not available yet. If Quill introduces paid plans, the cancellation and refund terms will be shown before purchase and in the Refund policy.",
        ],
      },
      {
        heading: "Something went wrong?",
        paragraphs: [
          "For a billing or access issue after subscriptions launch, contact the maintainer through the LinkedIn link in the footer. Do not share payment-card details in a message.",
        ],
      },
    ],
  },
  "privacy-policy": {
    title: "Privacy policy",
    summary:
      "What Quill handles when you connect GitHub and work with an agent.",
    sections: [
      {
        heading: "Information Quill processes",
        paragraphs: [
          "Quill processes information needed to provide the service. Depending on how you use it, this can include:",
        ],
        bullets: [
          "GitHub account and installation details, such as account identifiers, login, profile name, and email when available.",
          "Repository names and access needed to check out a repository or perform an action you request.",
          "Your prompts, conversation messages, agent responses, activity logs, code changes, and related session metadata.",
          "Side-chat messages, repository setup preferences, and terminal session metadata.",
          "Agent provider, model, and usage information used to operate sessions and understand service usage.",
        ],
      },
      {
        heading: "How information is used",
        paragraphs: [
          "Quill uses this information to authenticate you, connect the repositories you select, create and operate isolated coding workspaces, answer prompts, save session history, show changes, and troubleshoot reliability or security issues. Quill does not initiate a pull-request merge without your explicit confirmation in the product.",
        ],
      },
      {
        heading: "Service providers",
        paragraphs: [
          "To provide Quill, relevant information is sent to service providers that perform parts of the workflow. This includes GitHub for account and repository access, E2B for cloud coding workspaces, OpenAI for model responses, and providers that host Quill’s backend and PostgreSQL database. Those providers process information under their own terms and privacy practices.",
          "Repository contents and prompts may be processed by the coding workspace and model provider to complete your request. Do not connect a repository or submit information that you are not authorized to share with those services.",
        ],
      },
      {
        heading: "Storage and retention",
        paragraphs: [
          "Quill stores account and session information in its PostgreSQL database so sessions and their history can be retrieved. Session records can be deleted through the product, which also attempts to stop the associated workspace. Some information may remain with infrastructure providers under their own retention practices or in backups for a limited period. Exact backup and provider retention periods are still being finalized and will be stated here before general commercial launch.",
        ],
      },
      {
        heading: "Your choices",
        paragraphs: [
          "You can disconnect or uninstall the Quill GitHub App from GitHub to end repository access. You can delete sessions in Quill. For a privacy request or account-data question, contact the maintainer privately through the LinkedIn profile in the footer; please do not post personal information in a public issue.",
        ],
      },
      {
        heading: "Security and updates",
        paragraphs: [
          "Quill and its providers use safeguards intended to protect information, but no online service can guarantee absolute security. This policy may change as Quill adds features or providers. Material updates will be reflected on this page.",
        ],
      },
      {
        heading: "Contact",
        paragraphs: [
          "Quill is currently an early-access project. The operator’s formal business identity, direct privacy email, and any required regional representative details have not yet been published. These details and specific retention periods should be completed before a public commercial launch.",
        ],
      },
    ],
  },
  terms: {
    title: "Terms & conditions",
    summary: "The ground rules for using Quill’s coding workspace and agent.",
    sections: [
      {
        heading: "Early access",
        paragraphs: [
          "Quill is an early-access software service that helps you ask questions about code repositories and request code changes. Features may change, be unavailable, or be discontinued while the service is developed. Paid plans and checkout are not active yet.",
        ],
      },
      {
        heading: "Your account and repositories",
        paragraphs: [
          "You are responsible for your account and for making sure you have permission to connect each GitHub account and repository. You authorize Quill to access the repositories you select and to process their contents to fulfill your requests.",
        ],
      },
      {
        heading: "Your code and agent output",
        paragraphs: [
          "You retain your rights to the code and content you provide. You allow Quill and its service providers to process that content only as needed to operate the service and perform the tasks you request. Agent output can be incomplete or incorrect: review code, commands, test results, and security implications before relying on or shipping changes.",
        ],
      },
      {
        heading: "GitHub actions and pull requests",
        paragraphs: [
          "Quill may create commits or pull requests when you ask it to. You remain responsible for reviewing them. Quill will merge a pull request only after you explicitly approve the merge in Quill; creating a pull request alone is not permission to merge it.",
        ],
      },
      {
        heading: "Acceptable use",
        paragraphs: [
          "Do not use Quill to violate the law, infringe others’ rights, bypass repository permissions, disrupt the service, or submit malicious code or instructions. Do not use the service for activity you are not authorized to perform.",
        ],
      },
      {
        heading: "Third-party services",
        paragraphs: [
          "Quill depends on third-party services, including GitHub, E2B, OpenAI, and infrastructure providers. Their services may have separate terms, availability limits, and privacy practices. Quill is not responsible for outages or changes controlled by those providers.",
        ],
      },
      {
        heading: "Availability and liability",
        paragraphs: [
          "Quill is provided during early access on an as-available basis. To the extent permitted by applicable law, Quill makes no guarantee that agent output is accurate, secure, or suitable for a particular purpose, and is not liable for indirect or consequential losses arising from use of the service. Nothing in these terms limits rights or remedies that cannot legally be limited.",
        ],
      },
      {
        heading: "Changes and contact",
        paragraphs: [
          "These terms may be updated as the service develops. Continued use after an update means you accept the updated terms where the law allows. For questions, contact the maintainer through the LinkedIn profile in the footer. The operator’s formal legal identity and governing-law details will be published before commercial launch.",
        ],
      },
    ],
  },
};

export function PolicyPage({ policy }: { policy: PolicyName }) {
  const document = policies[policy];

  return (
    <main className="policy-page">
      <header className="policy-topbar">
        <a href="/" className="policy-back">
          <ArrowLeft size={15} /> Back to Quill
        </a>
        <span className="policy-wordmark">
          Quill<span>.</span>
        </span>
      </header>
      <article className="policy-content">
        <span className="policy-kicker">QUILL · POLICY</span>
        <h1>{document.title}</h1>
        <p className="policy-summary">{document.summary}</p>
        <div className="policy-meta">
          Last updated October 20, 2026 <span>·</span> Early access
        </div>
        <aside className="policy-notice">
          <strong>Early-access notice</strong>
          <p>
            Quill’s paid plans are not available yet. These pages describe the
            current service and planned billing approach; the operator’s legal
            details and certain launch-specific terms will be completed before
            subscriptions open.
          </p>
        </aside>
        <div className="policy-sections">
          {document.sections.map((section) => (
            <section className="policy-section" key={section.heading}>
              <h2>{section.heading}</h2>
              {section.paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
              {section.bullets && (
                <ul>
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
        <a
          className="policy-contact"
          href="https://linkedin.com/in/panditankit"
          target="_blank"
          rel="noreferrer"
        >
          Contact the maintainer <ArrowUpRight size={14} />
        </a>
      </article>
      <SiteFooter />
    </main>
  );
}
