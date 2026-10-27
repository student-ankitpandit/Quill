import { ArrowUpRight, CircleCheck, Clock3, FileCode2, GitPullRequest, LoaderCircle, Search, ShieldAlert, ShieldCheck, CircleDot, ListChecks, MessageCircle, Send, GitBranch, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { askAboutPullRequest, reviewAgentPullRequest, type AgentPullRequestReview } from "@/lib/api";
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
  const [reviewTab, setReviewTab] = useState<"overview" | "findings" | "files">("overview");
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [failedReviewUrl, setFailedReviewUrl] = useState("");
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState("");
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);

  const runReview = async (prUrl = url) => {
    setUrl(prUrl);
    setReview(null);
    setReviewTab("overview");
    setChatMessages([]);
    setChatError("");
    setReviewError("");
    setFailedReviewUrl("");
    setReviewing(true);
    try {
      setReview(await reviewAgentPullRequest(prUrl));
    } catch (error) {
      const message = error instanceof DOMException && error.name === "TimeoutError"
        ? "The review request timed out. Please retry; larger pull requests can take longer to analyze."
        : error instanceof Error
          ? error.message
          : "Could not review this pull request.";
      setReviewError(message);
      setFailedReviewUrl(prUrl);
    } finally {
      setReviewing(false);
    }
  };

  const askQuestion = async (event?: FormEvent, prompt = chatQuestion) => {
    event?.preventDefault();
    const question = prompt.trim();
    if (!review || !question || chatBusy) return;
    setChatMessages((messages) => [...messages, { role: "user", content: question }]);
    setChatQuestion("");
    setChatError("");
    setChatBusy(true);
    try {
      const answer = await askAboutPullRequest(review.pullRequest.url, question);
      setChatMessages((messages) => [...messages, { role: "assistant", content: answer }]);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Could not get an answer about this pull request.");
    } finally {
      setChatBusy(false);
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
          <div>
            <div className="review-pr-context"><span>{review.pullRequest.url.split("/").slice(3, 5).join("/")}</span><span>#{review.pullRequest.number}</span><span className={`review-pr-state${review.pullRequest.merged ? " merged" : ""}`}><CircleDot size={12} />{review.pullRequest.merged ? "Merged" : review.pullRequest.draft ? "Draft" : review.pullRequest.state}</span></div>
            <h2>{review.pullRequest.title}</h2>
            <p><UserRound size={13} /> {review.pullRequest.author} <span aria-hidden="true">·</span> <GitBranch size={13} /> {review.pullRequest.headBranch} <span aria-hidden="true">→</span> {review.pullRequest.baseBranch}</p>
          </div>
          <a className="review-open-github" href={review.pullRequest.url} target="_blank" rel="noreferrer">Open PR <ArrowUpRight size={14} /></a>
        </header>

        <div className={`review-verdict ${verdict.className}`}>
          <div className="review-verdict-icon"><verdict.icon size={19} /></div>
          <div><strong>{verdict.label}</strong><p>{review.summary}</p></div>
          <span className="review-verdict-count">{review.findings.length} {review.findings.length === 1 ? "finding" : "findings"}</span>
        </div>

        <div className="review-result-stats">
          <span><FileCode2 size={14} /> {review.reviewedFiles.length} files reviewed</span>
          <span><strong>+{review.pullRequest.additions}</strong> / <strong className="review-deletions">−{review.pullRequest.deletions}</strong> lines</span>
          <span>{review.pullRequest.changedFiles} changed files</span>
        </div>

        <div className="review-detail-grid">
          <div className="review-detail-main">
            <div className="review-tabs" role="tablist" aria-label="Review details">
              <button type="button" role="tab" aria-selected={reviewTab === "overview"} onClick={() => setReviewTab("overview")}><GitPullRequest size={14} /> Overview</button>
              <button type="button" role="tab" aria-selected={reviewTab === "findings"} onClick={() => setReviewTab("findings")}><ShieldAlert size={14} /> Findings <span>{review.findings.length}</span></button>
              <button type="button" role="tab" aria-selected={reviewTab === "files"} onClick={() => setReviewTab("files")}><ListChecks size={14} /> Changed files <span>{review.pullRequest.changedFiles}</span></button>
            </div>

            {reviewTab === "overview" && <div className="review-overview-panel">
              <div className="review-overview-summary"><span className="review-overview-label">Quill’s summary</span><p>{review.summary}</p></div>
              <div className="review-pr-description"><h3>Pull request description</h3>{review.pullRequest.description ? <p>{review.pullRequest.description}</p> : <p className="review-no-description">No description was provided for this pull request.</p>}</div>
              <div className="review-overview-meta"><span>Opened <strong>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(review.pullRequest.createdAt))}</strong></span><span><GitPullRequest size={13} /> {review.pullRequest.commitCount} {review.pullRequest.commitCount === 1 ? "commit" : "commits"}</span></div>
            </div>}

            {reviewTab === "findings" && (review.findings.length ? <div className="review-finding-list">{review.findings.map((finding, index) => <article className={`review-finding severity-${finding.severity}`} key={`${finding.file}-${finding.line}-${index}`}><div><strong>{finding.severity}</strong><h3>{finding.title}</h3></div>{finding.file && <code>{finding.file}{finding.line ? `:${finding.line}` : ""}</code>}<p>{finding.details}</p></article>)}</div> : <div className="review-no-findings"><CircleCheck size={17} /><div><strong>No actionable findings</strong><p>Quill didn’t identify a concrete issue in the text diff it reviewed.</p></div></div>)}

            {reviewTab === "files" && <div className="review-file-list">
              {review.reviewedFiles.map((file) => <div className="review-file-row" key={file}><FileCode2 size={15} /><code>{file}</code><span>Reviewed</span></div>)}
              {review.omittedFiles.map((file) => <div className="review-file-row omitted" key={file}><FileCode2 size={15} /><code>{file}</code><span>Diff unavailable</span></div>)}
              {!review.reviewedFiles.length && !review.omittedFiles.length && <p className="review-omitted-files">GitHub did not return a file list for this pull request.</p>}
            </div>}
          </div>

          <aside className="review-reviewer-rail">
            <section className="review-chat-panel">
              <header><span className="review-chat-icon"><MessageCircle size={15} /></span><div><h3>Ask about this PR</h3><p>Quill answers using the pull request diff.</p></div></header>
              <div className="review-chat-prompts">
                {chatMessages.length === 0 && <>
                  <button type="button" disabled={chatBusy} onClick={() => void askQuestion(undefined, "Summarize the changes in this pull request.")}>Summarize the changes</button>
                  <button type="button" disabled={chatBusy} onClick={() => void askQuestion(undefined, "What are the main risks in this pull request?")}>What are the main risks?</button>
                  <button type="button" disabled={chatBusy} onClick={() => void askQuestion(undefined, "Explain the most important finding.")}>Explain the top finding</button>
                </>}
              </div>
              <div className="review-chat-transcript" aria-live="polite">
                {chatMessages.map((message, index) => <article className={`review-chat-message ${message.role}`} key={`${message.role}-${index}`}><span>{message.role === "user" ? "You" : "Quill"}</span><p>{message.content}</p></article>)}
                {chatBusy && <p className="review-chat-thinking"><LoaderCircle size={13} className="animate-spin" /> Quill is thinking…</p>}
              </div>
              {chatError && <p className="review-chat-error" role="alert">{chatError}</p>}
              <form className="review-chat-form" onSubmit={(event) => void askQuestion(event)}>
                <textarea aria-label="Ask Quill about this pull request" placeholder="Ask about the changes…" rows={2} value={chatQuestion} onChange={(event) => setChatQuestion(event.target.value)} maxLength={2000} disabled={chatBusy} />
                <button type="submit" aria-label="Send question" disabled={!chatQuestion.trim() || chatBusy}>{chatBusy ? <LoaderCircle size={15} className="animate-spin" /> : <Send size={15} />}</button>
              </form>
            </section>
            <section className="review-scope-card">
              <h3>Review scope</h3>
              <p>Quill checked the pull request diff for correctness, risky behavior, and credential-like content.</p>
              <div><span>Text files reviewed</span><strong>{review.reviewedFiles.length}</strong></div>
              {review.omittedFiles.length > 0 && <div><span>Files needing manual review</span><strong>{review.omittedFiles.length}</strong></div>}
              <p className="review-scope-note">Automated review can miss issues. Check the code and GitHub status checks yourself before merging.</p>
            </section>
          </aside>
        </div>
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
              {failedReviewUrl === session.prUrl && reviewError && <p className="review-card-error" role="alert">{reviewError}</p>}
            </article>
          );
        })}
      </div>
    </section>
  );
}
