import { ArrowUpRight } from "lucide-react";
import { useEffect } from "react";
import { getLoginUrl, isLoggedIn } from "@/lib/api";
import { QuillMark } from "@/components/QuillMark";
import { SiteFooter } from "@/components/Footer";
import "./LandingPage.css";
import "./PolicyPageLight.css";

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
          <span className="home-brand-mark">
            <QuillMark size={19} />
          </span>
          <span>quill</span>
        </a>
        <div className="home-nav-links">
          <a href="/#workflow">How it works</a>
          <a href="/#features">Features</a>
          <a href="/#faq">FAQ</a>
          <a href="/#pricing">Pricing</a>
        </div>
        <div className="home-nav-actions">
          <button className="home-signin" onClick={enterQuill}>
            {isLoggedIn() ? "Open dashboard" : "Sign in"}
          </button>
          <button className="home-nav-cta" onClick={enterQuill}>
            Get started <ArrowUpRight size={15} />
          </button>
        </div>
      </nav>
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
