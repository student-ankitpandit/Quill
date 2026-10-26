import { ArrowUpRight } from "lucide-react";
import { useEffect } from "react";
import { getLoginUrl, isLoggedIn } from "@/lib/api";
import { QuillMark } from "@/components/QuillMark";
import { SiteFooter } from "@/components/Footer";
import "./LandingPage.css";
import "./PolicyPageLight.css";

type PolicyName = "refund-policy" | "return-policy" | "privacy-policy" | "terms";
type PolicySection = { title: string; paragraphs?: string[]; bullets?: string[] };
type PolicyDocument = { title: string; summary: string; sections: PolicySection[] };
const enquiryEmail = "ankitpandit.codes@gmail.com";

function PolicyText({ text }: { text: string }) {
  const emailIndex = text.indexOf(enquiryEmail);
  if (emailIndex < 0) return <>{text}</>;
  return <>{text.slice(0, emailIndex)}<a className="policy-inline-contact" href={`mailto:${enquiryEmail}`}>{enquiryEmail}</a>{text.slice(emailIndex + enquiryEmail.length)}</>;
}

const policyDocuments: Record<PolicyName, PolicyDocument> = {
  "refund-policy": {
    title: "Refund policy",
    summary: "This draft explains how refund requests for Quill’s digital subscription plans are handled.",
    sections: [
      { title: "Digital subscription access", paragraphs: ["Quill plans provide access to digital software features for the period shown at checkout. Plans are currently offered as a one-time payment for a 30-day access period; they do not renew automatically unless checkout clearly says otherwise.", "Because access is delivered digitally, there is no physical item to return. Refund requests are still considered fairly and in accordance with applicable consumer-protection law."] },
      { title: "When to contact us", paragraphs: ["Contact us if you were charged more than once for the same purchase, payment succeeded but your plan was not activated, or another billing error occurred. If a material service problem prevented you from using a paid plan, tell us what happened and when.", "A refund is not automatic in every case. We will review the payment and the circumstances and explain the outcome. Nothing in this policy removes any refund or consumer rights that cannot legally be waived."] },
      { title: "How to request a refund", bullets: [`Email ${enquiryEmail} from the email associated with your Quill account.`, "Include your GitHub username, Razorpay payment or order ID, payment date, amount, and a short description of the issue.", "Never send your card number, CVV, password, or one-time passcode."] },
      { title: "Processing", paragraphs: ["If a refund is approved, it will be submitted through Razorpay or the original payment method where possible. Your bank or payment provider may take additional time to post it. We will share any available refund reference with you."] },
      { title: "Contact", paragraphs: [`Refund questions: ${enquiryEmail}.`] },
    ],
  },
  "return-policy": {
    title: "Return policy",
    summary: "Quill is a software service delivered online, so this policy covers subscription cancellation and access rather than shipping physical goods.",
    sections: [
      { title: "No physical returns", paragraphs: ["Quill does not currently sell physical goods. There is no product to ship back or return. If you received a charge for a purchase you did not make, contact us promptly using the details below."] },
      { title: "Canceling a plan", paragraphs: ["Quill plans are currently one-time purchases for 30 days of access and do not automatically renew unless checkout clearly states otherwise. You can choose not to make another purchase. Canceling or disconnecting GitHub access does not itself create a refund; refund requests are handled under the Refund policy."] },
      { title: "Access after cancellation", paragraphs: ["If you disconnect the GitHub App, Quill can no longer access the repositories granted through that installation. Any remaining subscription access and any data retained by Quill are handled according to the plan terms and Privacy policy."] },
      { title: "Contact", paragraphs: [`For account, access, or purchase questions, contact ${enquiryEmail}.`] },
    ],
  },
  "privacy-policy": {
    title: "Privacy policy",
    summary: "This draft describes the information Quill uses to provide repository assistance, manage accounts, and process subscriptions.",
    sections: [
      { title: "Information we handle", bullets: ["Account information received through GitHub, such as your GitHub user ID, username, profile details, and email when GitHub makes it available.", "Repository names and repository content that you authorize the Quill GitHub App to access, along with task prompts, code changes, pull-request details, and agent activity needed to run your requested work.", "Plan, usage, and transaction references needed to activate subscriptions and provide account support. Payment card details are handled by Razorpay; Quill does not need your full card number or CVV.", "Service logs, device/browser information, and security events used to operate, troubleshoot, and protect Quill."] },
      { title: "How we use information", paragraphs: ["We use this information to sign you in, connect the repositories you select, run agent tasks and pull-request reviews, show session history and usage, process subscriptions, respond to support requests, prevent abuse, and maintain the service."] },
      { title: "Code and service providers", paragraphs: ["To perform a task or review, relevant repository content and prompts may be processed by the cloud workspace and AI model providers that power Quill. Information may also be shared with GitHub for repository access and pull-request operations, Razorpay for payments, and hosting or infrastructure providers that run the service. Each provider receives information needed for its role.", "GitHub permissions can be reviewed or revoked from your GitHub account’s installed-app settings. Revoking access prevents future repository access by Quill, but may not immediately remove information already stored in service backups or records required for security, accounting, or legal purposes."] },
      { title: "Retention and security", paragraphs: ["We keep information for as long as needed to provide Quill, maintain session history, meet security and operational needs, resolve disputes, and comply with applicable obligations. We use reasonable safeguards, but no internet service can promise absolute security. Specific retention periods and deletion controls should be added here before publication."] },
      { title: "Your choices and requests", paragraphs: [`You can manage repository access through GitHub and contact us to ask about access, correction, or deletion of personal information, subject to applicable law and records we must retain. Contact: ${enquiryEmail}.`] },
      { title: "Cookies and local storage", paragraphs: ["Quill may use essential browser storage to maintain sign-in state, remember preferences, and protect the service. Add a full cookie and analytics disclosure here if non-essential analytics or advertising tools are introduced."] },
      { title: "Changes and contact", paragraphs: [`We may update this policy as Quill changes. We will update the date and provide any notice required by law. Privacy contact: ${enquiryEmail}.`] },
    ],
  },
  terms: {
    title: "Terms & conditions",
    summary: "These draft terms cover access to Quill, repository permissions, subscriptions, and the limits of AI-generated work.",
    sections: [
      { title: "Using Quill", paragraphs: ["Quill is a coding-assistance service. By using it, you agree to use the service lawfully, keep your account secure, and provide accurate account information. You must be legally able to enter into these terms."] },
      { title: "GitHub and repository permissions", paragraphs: ["You choose whether to install the Quill GitHub App and which repositories it can access. You must have authority to grant that access. Quill uses the permissions you grant to perform the tasks you request. You remain responsible for reviewing and approving code changes and pull requests before merging them."] },
      { title: "Your content and AI output", paragraphs: ["You retain your rights to the code and materials you provide. You authorize Quill and its service providers to process them only as needed to operate the service and perform your requests. AI-generated suggestions may be inaccurate, incomplete, insecure, or unsuitable for your project. Review and test all changes before relying on them."] },
      { title: "Plans and payments", paragraphs: ["Plan price, included usage, access period, and any applicable taxes will be shown before purchase. Quill plans are currently one-time purchases for a 30-day access period and do not automatically renew unless checkout clearly says otherwise. Payments are processed by Razorpay and are subject to the Refund policy and applicable law."] },
      { title: "Acceptable use", bullets: ["Do not use Quill to violate law, infringe others’ rights, or access repositories without authorization.", "Do not interfere with the service, attempt to bypass security or usage limits, or upload malware or credentials you are not authorized to use.", "Do not treat Quill’s output as a substitute for your own code review, testing, security checks, or professional advice."] },
      { title: "Availability and suspension", paragraphs: ["We may change, suspend, or discontinue features to maintain or improve Quill, and may restrict access where reasonably needed to protect users, the service, or third parties. We will provide notice where required by law."] },
      { title: "Disclaimers and liability", paragraphs: ["To the extent permitted by law, Quill is provided without a promise that it will be uninterrupted, error-free, or suitable for every use. Nothing in these terms excludes rights or liability that cannot legally be excluded. Any permitted limitation of liability and governing-law details must be completed by the operator before publication."] },
      { title: "Changes and contact", paragraphs: [`We may update these terms and will revise the effective date when we do. Contact: ${enquiryEmail}.`] },
    ],
  },
};

export function PolicyPage({ policy }: { policy: PolicyName }) {
  const document = policyDocuments[policy];

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [policy]);

  const enterQuill = () => {
    if (isLoggedIn()) window.location.href = "/dashboard";
    else window.location.href = getLoginUrl();
  };

  return (
    <main className="policy-page">
      <nav className="home-nav">
        <a className="home-brand" href="/" aria-label="quill home">
          <span className="home-brand-mark"><QuillMark size={19} /></span>
          <span>quill</span>
        </a>
        <div className="home-nav-links">
          <a href="/#workflow">How it works</a>
          <a href="/#features">Features</a>
          <a href="/#pricing">Pricing</a>
          <a href="/#faq">FAQ</a>
        </div>
        <div className="home-nav-actions">
          <button className="home-signin" onClick={enterQuill}>{isLoggedIn() ? "Open dashboard" : "Sign in"}</button>
          <button className="home-nav-cta" onClick={enterQuill}>Get started <ArrowUpRight size={15} /></button>
        </div>
      </nav>
      <article className="policy-content">
        <h1>{document.title}</h1>
        <p className="policy-summary">{document.summary}</p>
        <div className="policy-sections">
          {document.sections.map((section) => (
            <section className="policy-section" key={section.title}>
              <h2>{section.title}</h2>
              {section.paragraphs?.map((paragraph) => <p key={paragraph}><PolicyText text={paragraph} /></p>)}
              {section.bullets && <ul>{section.bullets.map((bullet) => <li key={bullet}><PolicyText text={bullet} /></li>)}</ul>}
            </section>
          ))}
        </div>
      </article>
      <SiteFooter />
    </main>
  );
}
