import { ArrowLeft } from "lucide-react";
import { SiteFooter } from "@/components/Footer";
import "./PolicyPage.css";

type PolicyName =
  | "refund-policy"
  | "return-policy"
  | "privacy-policy"
  | "terms";

const policyTitles: Record<PolicyName, string> = {
  "refund-policy": "Refund policy",
  "return-policy": "Return policy",
  "privacy-policy": "Privacy policy",
  terms: "Terms & conditions",
};

export function PolicyPage({ policy }: { policy: PolicyName }) {
  const title = policyTitles[policy];

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
        <h1>{title}</h1>
        <aside className="policy-notice">
          <strong>Coming soon</strong>
          <p>Details for this page will be revealed soon.</p>
        </aside>
      </article>
      <SiteFooter />
    </main>
  );
}
