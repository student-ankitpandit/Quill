import { ArrowUpRight, CircleCheck, Clock3, FileCode2, GitPullRequest, LoaderCircle, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { reviewAgentPullRequest, type AgentPullRequestReview } from "@/lib/api";
import { navigate } from "@/lib/router";
import type { SessionSummary } from "./apiPage";
import "./ReviewPage.css";

export default function ReviewPage({
  sessions,
  loadError,
}: {
  sessions: SessionSummary[] | null;
  loadError: boolean;
}) {
  const pullRequests = (sessions ?? []).filter((session) => Boolean(session.prUrl));
  const [url, setUrl] = useState("");
  const [review, setReview] = useState<AgentPullRequestReview | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState("");

  const runReview = async (prUrl = url) => {
    setUrl(prUrl);
    setReview(null);
    setReviewError("");
    setReviewing(true);
    try {
      setReview(await reviewAgentPullRequest(prUrl));
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Could not review this pull request.");
    } finally {
      setReviewing(false);
    }
  };

  const verdict = review?.verdict === "needs_attention"
    ? { label: "Needs attention", icon: ShieldAlert, className: "needs-attention" }
    : review?.verdict === "review_recommended"
      ? { label: "Review recommended", icon: ShieldAlert, className: "review-recommended" }
      : { label: "No issues detected", icon: ShieldCheck, className: "no-issues" };

  return (
    <section className="review-page">
      <header className="review-page-heading">
        <div>
          <p className="review-eyebrow"><GitPullRequest size={15} /> Pull request review</p>
          <h1>Review</h1>
          <p className="review-description">Paste the URL of an existing pull request in a repository connected to GitHub to check it for bugs, risky changes, and exposed credentials.</p>
        </div>
        {pullRequests.length > 0 && <span className="review-count">{pullRequests.length} {pullRequests.length === 1 ? "pull request" : "pull requests"}</span>}
      </header>

      <form className="review-url-form" onSubmit={(event) => { event.preventDefault(); void runReview(); }}>
        <label htmlFor="review-pr-url">Pull request URL</label>
        <div className="review-url-row">
          <input id="review-pr-url" type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://github.com/owner/repo/pull/123" disabled={reviewing} />
          <button className="btn btn-primary" type="submit" disabled={reviewing || !url.trim()}>{reviewing ? <><LoaderCircle size={15} className="animate-spin" /> Reviewing…</> : <><ShieldCheck size={15} /> Review PR</>}</button>
        </div>
        <p>Quill reviews existing pull requests that the connected GitHub App can access.</p>
      </form>
      {reviewError && <p className="review-error" role="alert">{reviewError}</p>}

      {review && <section className={`review-result ${verdict.className}`} aria-live="polite">
        <header className="review-result-heading">
          <div><span className="review-result-kicker"><verdict.icon size={16} /> {verdict.label}</span><h2>#{review.pullRequest.number} · {review.pullRequest.title}</h2><p>{review.pullRequest.state}{review.pullRequest.merged ? " · merged" : ""}{review.pullRequest.draft ? " · draft" : ""} · {review.pullRequest.headBranch} → {review.pullRequest.baseBranch}</p></div>
          <a href={review.pullRequest.url} target="_blank" rel="noreferrer">Open on GitHub <ArrowUpRight size={14} /></a>
        </header>
        <p className="review-result-summary">{review.summary}</p>
        <div className="review-result-stats"><span><FileCode2 size={14} /> {review.reviewedFiles.length} files reviewed</span><span>+{review.pullRequest.additions} / −{review.pullRequest.deletions} lines</span><span>{review.pullRequest.changedFiles} changed total</span></div>
        {review.findings.length ? <div className="review-finding-list">{review.findings.map((finding, index) => <article className={`review-finding severity-${finding.severity}`} key={`${finding.file}-${finding.line}-${index}`}><div><strong>{finding.severity}</strong><h3>{finding.title}</h3></div>{finding.file && <code>{finding.file}{finding.line ? `:${finding.line}` : ""}</code>}<p>{finding.details}</p></article>)}</div> : <p className="review-no-findings"><CircleCheck size={16} /> No actionable findings were detected in the reviewed diff.</p>}
        {review.omittedFiles.length > 0 && <p className="review-omitted-files">Some files did not include a text diff and could not be analyzed: {review.omittedFiles.join(", ")}</p>}
        <p className="review-disclaimer">Automated review can miss issues. Check the code and GitHub status checks yourself before merging.</p>
      </section>}

      <h2 className="review-list-heading">Quill-created pull requests</h2>

      {sessions === null && <div className="review-empty"><span className="review-empty-icon"><Clock3 size={20} /></span><h2>Loading pull requests…</h2></div>}
      {sessions?.length === 0 && loadError && <div className="review-empty"><h2>Could not load pull requests</h2><p>Quill couldn’t reach the server. It will retry shortly.</p></div>}
      {sessions !== null && pullRequests.length === 0 && !(sessions.length === 0 && loadError) && (
        <div className="review-empty">
          <span className="review-empty-icon"><Search size={20} /></span>
          <h2>No pull requests yet</h2>
          <p>Pull requests created by Quill appear here after a repository task is complete.</p>
        </div>
      )}

      <div className="review-list">
        {pullRequests.map((session) => {
          const merged = Boolean(session.prMergedAt);
          return (
            <article className="review-card" key={session.id}>
              <div className="review-card-main">
                <div className="review-card-icon"><GitPullRequest size={18} /></div>
                <div className="review-card-copy">
                  <h2>{session.title || session.task || "Agent pull request"}</h2>
                  <p>{session.repoFullName}{session.prBaseBranch ? ` · targets ${session.prBaseBranch}` : ""}</p>
                  <span className={`review-status${merged ? " merged" : ""}`}>
                    {merged ? <CircleCheck size={14} /> : <GitPullRequest size={14} />}
                    {merged ? `Merged ${session.prMergedAt ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(session.prMergedAt)) : ""}` : "Ready for your review"}
                  </span>
                </div>
              </div>
              <div className="review-card-actions">
                <button className="btn btn-quiet" type="button" disabled={reviewing} onClick={() => void runReview(session.prUrl!)}>{reviewing && url === session.prUrl ? "Reviewing…" : "Run review"}</button>
                <button className="btn btn-quiet" type="button" onClick={() => navigate({ page: "session", sessionId: session.id })}>Open session</button>
                <a className="review-github-link" href={session.prUrl} target="_blank" rel="noreferrer">Review PR on GitHub <ArrowUpRight size={15} /></a>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
