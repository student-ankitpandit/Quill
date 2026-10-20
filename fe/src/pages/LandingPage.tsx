import { ArrowDown, ArrowRight, ArrowUpRight, Check, Code2, Feather, GitBranch, Github, Globe2, Layers3, Play, Sparkles, Terminal, MessageSquareText, Bug, WandSparkles } from "lucide-react";
import { navigate } from "@/lib/router";
import { getLoginUrl, isLoggedIn } from "@/lib/api";
import "./LandingPage.css";
import "./PricingPage.css";

export function LandingPage() {
  const enterQuill = () => {
    if (isLoggedIn()) navigate({ page: "dashboard" });
    else window.location.href = getLoginUrl();
  };

  return (
    <main className="quill-home">
      <div className="home-orb home-orb-a" aria-hidden="true" />
      <div className="home-orb home-orb-b" aria-hidden="true" />
      <nav className="home-nav">
        <a className="home-brand" href="/" aria-label="Quill home"><span className="home-brand-mark"><Feather size={19} strokeWidth={2.2} /></span><span>Quill<span className="brand-period">.</span></span></a>
        <div className="home-nav-links"><a href="#workflow">How it works</a><a href="#features">Features</a><a href="#faq">FAQ</a></div>
        <div className="home-nav-actions"><a className="home-signin" href="#pricing">Pricing</a><button className="home-signin" onClick={enterQuill}>{isLoggedIn() ? "Open dashboard" : "Sign in"}</button><button className="home-nav-cta" onClick={enterQuill}>Get started <ArrowUpRight size={15} /></button></div>
      </nav>

      <section className="home-hero">
        <div className="hero-copy">
          <div className="hero-badge"><span className="badge-spark"><Sparkles size={13} /></span> Your coding agent, ready to work</div>
          <h1>Good ideas deserve<br />to <span>ship.</span></h1>
          <p className="hero-description">Give Quill a task. It opens your repository in a cloud workspace, figures out the code, and gets to work—with you in the loop.</p>
          <div className="hero-actions"><button className="home-primary-cta" onClick={enterQuill}><Github size={18} /> Continue with GitHub <ArrowRight size={16} /></button><a href="#workflow" className="home-text-cta">See how it works <ArrowDown size={15} /></a></div>
          <div className="hero-reassurance"><span><Check size={14} /> Your repositories stay yours</span><i /> <span>No setup to get started</span></div>
        </div>

        <div className="hero-visual" aria-label="Preview of a Quill coding session">
          <div className="preview-glow" />
          <div className="session-window">
            <div className="window-topbar"><div className="window-dots"><i /><i /><i /></div><div className="window-title"><span className="mini-mark"><Feather size={11} /></span> Quill <span className="window-slash">/</span> fix-cache-expiry</div><span className="window-live"><i /> Live</span></div>
            <div className="window-body">
              <aside className="window-sidebar"><div className="window-side-label">WORKSPACE</div><div className="window-side-link selected"><Code2 size={14} /> Session</div><div className="window-side-link"><Terminal size={14} /> Terminal</div><div className="window-side-link"><GitBranch size={14} /> Changes <span className="change-count">2</span></div></aside>
              <div className="window-chat"><div className="chat-date">TODAY · 10:42 AM</div><div className="user-bubble">Fix the cache expiry bug in the Redis client.</div><div className="agent-line"><span className="agent-avatar"><Sparkles size={12} /></span><div><strong>Quill</strong><p>I’ll trace the cache lifecycle and add a regression test for the expiry behavior.</p></div></div><div className="work-card"><div className="work-card-head"><span className="work-pulse" /> Working in <code>cache/client.go</code></div><div className="code-lines"><span><b>34</b>{" func (c *Client) SetWithTTL(key string, value []byte, ttl time.Duration) {"}</span><span><b>35</b>   expiresAt := time.Now().Add(ttl)</span><span className="added"><b>36</b>+  return c.store.Set(key, value, expiresAt)</span><span><b>37</b> {'}'}</span></div></div><div className="agent-line final-agent"><span className="agent-avatar done"><Check size={12} /></span><p>Expiry handling is fixed and the regression test passes.</p></div><div className="window-composer"><span>Ask Quill a follow-up…</span><span className="composer-send"><ArrowRight size={13} /></span></div></div>
            </div>
            <div className="window-bottom"><span><span className="green-dot" /> Sandbox ready</span><span><Globe2 size={12} /> Preview</span><span><GitBranch size={12} /> fix/cache-expiry</span></div>
          </div>
          <div className="floating-status"><span className="floating-check"><Check size={14} /></span><span><strong>Tests passed</strong><small>All checks are green</small></span><span className="status-spark"><Sparkles size={15} /></span></div>
        </div>
      </section>

      <section className="home-proof"><div className="proof-rule" /><p>ONE CLEAR WORKSPACE FROM TASK TO REVIEW</p><div className="proof-rule" /></section>

      <section className="home-workflow" id="workflow"><div className="section-intro"><span className="section-kicker">A better way to build</span><h2>From “what if” to<br /><span>ready for review.</span></h2><p>Quill handles the busywork while you stay close to every decision.</p></div><div className="workflow-steps">
        <article className="workflow-step"><div className="step-number">01</div><div className="step-icon"><GitBranch size={19} /></div><h3>Choose your repo</h3><p>Connect GitHub and pick a repository. Quill gets a clean, isolated workspace ready.</p><span className="step-link">Your code, safely checked out <Check size={14} /></span></article>
        <article className="workflow-step"><div className="step-number">02</div><div className="step-icon"><Sparkles size={19} /></div><h3>Describe the work</h3><p>Ask a question, report a bug, or describe a feature. Quill can chat first or jump into code.</p><span className="step-link">You stay in control <Check size={14} /></span></article>
        <article className="workflow-step"><div className="step-number">03</div><div className="step-icon"><Layers3 size={19} /></div><h3>Review the result</h3><p>Follow progress, inspect the changes, and open a pull request when you’re ready.</p><span className="step-link">Nothing ships without you <Check size={14} /></span></article>
      </div></section>


      <section className="home-usecases"><div className="usecases-heading"><span className="section-kicker">Start wherever you are</span><h2>Sometimes you need an answer.<br /><span>Sometimes you need a teammate.</span></h2><p>Quill meets the task where it is. Ask naturally, get a direct answer, or hand over a change when you’re ready.</p></div><div className="usecase-grid">
        <article className="usecase-card"><span className="usecase-icon"><MessageSquareText size={20} /></span><span className="usecase-label">UNDERSTAND</span><h3>Ask about your code</h3><p>“Where is the cache configured?” Get a clear explanation based on your repository, without unnecessary tool runs.</p><div className="usecase-example"><span className="example-user">How does this service handle retries?</span><span className="example-answer"><Sparkles size={13} /> Quill explains the retry flow and points you to the relevant files.</span></div></article>
        <article className="usecase-card"><span className="usecase-icon"><Bug size={20} /></span><span className="usecase-label">FIX</span><h3>Hand off a bug</h3><p>Share the symptoms and let Quill trace the issue, make a focused change, and verify the fix.</p><div className="usecase-example"><span className="example-user">Fix the expiry bug in the Redis client.</span><span className="example-answer"><Check size={13} /> Change made · regression test passes</span></div></article>
        <article className="usecase-card"><span className="usecase-icon"><WandSparkles size={20} /></span><span className="usecase-label">BUILD</span><h3>Shape the next idea</h3><p>Describe a feature in plain language. Work through the details together and review each change.</p><div className="usecase-example"><span className="example-user">Add a health check endpoint.</span><span className="example-answer"><GitBranch size={13} /> Ready for your review</span></div></article>
      </div></section>

      <section className="home-features" id="features"><div className="features-heading"><span className="section-kicker">Made for your flow</span><h2>A capable agent.<br /><span>A workspace you can trust.</span></h2><p>From first question to final review, your work stays visible and in your hands.</p></div><div className="feature-grid"><article><div className="feature-icon"><Code2 size={18} /></div><h3>Grounded in your repository</h3><p>Quill works with the files and project context you selected, so answers and edits relate to your actual code.</p></article><article><div className="feature-icon"><Terminal size={18} /></div><h3>A sandbox for every task</h3><p>Build and run the project in an isolated environment with a terminal and app preview alongside the conversation.</p></article><article><div className="feature-icon"><GitBranch size={18} /></div><h3>Review before it ships</h3><p>Follow the work, inspect the diff, ask for changes, and decide when it’s ready to become a pull request.</p></article></div></section>

      <section className="pricing-content" id="pricing">
        <div className="pricing-heading">
          <span className="section-kicker"><Sparkles size={13} /> Simple plans, more room to build</span>
          <h2>Choose your pace.<br /><span>Keep your work moving.</span></h2>
          <p>Pick the plan that fits how you work with Quill. Pricing is being finalized, and subscriptions are not available yet.</p>
          <div className="pricing-coming-pill"><span /> Plans and billing are coming soon</div>
        </div>
        <div className="pricing-cards">
          <article className="pricing-card">
            <div className="pricing-plan-name">Basic</div>
            <p className="pricing-plan-description">For everyday repository questions and focused coding tasks.</p>
            <div className="pricing-price"><span className="pricing-currency">$</span>9<span className="pricing-period">/ month</span></div>
            <div className="pricing-price-note">Planned price · final details coming soon</div>
            <div className="pricing-divider" />
            <ul><li><Check size={15} />Standard usage limits</li><li><Check size={15} />Core coding models</li><li><Check size={15} />Repository questions and code changes</li><li><Check size={15} />Reviewable workspace changes</li></ul>
            <button type="button" className="pricing-button" disabled>Coming soon <ArrowRight size={15} /></button>
          </article>
          <article className="pricing-card pricing-card-featured">
            <div className="pricing-popular">MORE CAPACITY</div>
            <div className="pricing-plan-name">Pro</div>
            <p className="pricing-plan-description">For heavier use, bigger projects, and more demanding work.</p>
            <div className="pricing-price"><span className="pricing-currency">$</span>19<span className="pricing-period">/ month</span></div>
            <div className="pricing-price-note">Planned price · final details coming soon</div>
            <div className="pricing-divider" />
            <ul><li><Check size={15} />Higher usage limits</li><li><Check size={15} />Access to more capable models</li><li><Check size={15} />Everything in Basic</li><li><Check size={15} />More room for complex coding tasks</li></ul>
            <button type="button" className="pricing-button pricing-button-featured" disabled>Coming soon <ArrowRight size={15} /></button>
          </article>
        </div>
        <p className="pricing-footnote">The prices and plan details shown are planned offerings. We’ll share final limits and model availability before subscriptions launch.</p>
      </section>

      <section className="home-faq" id="faq"><div className="faq-intro"><span className="section-kicker">A few useful details</span><h2>Good to know.</h2><p>Quill is designed to make repository work feel straightforward and transparent.</p></div><div className="faq-list">
        <details><summary>Can I ask Quill a question without asking it to change code?<span>+</span></summary><p>Yes. Ask about the repository or how something works. Quill can respond directly, then you can choose whether to ask it to make a change.</p></details>
        <details><summary>Does Quill work on my repository automatically?<span>+</span></summary><p>Quill only lists repositories you have granted to its GitHub App. Choose the repository for a session before describing the task.</p></details>
        <details><summary>Do I get to review the changes?<span>+</span></summary><p>Yes. You can follow the session, inspect file changes, and decide when to create a pull request.</p></details>
      </div></section>

      <section className="home-final-cta"><div className="final-cta-icon"><Play size={17} fill="currentColor" /></div><div><span className="section-kicker">Your next task is a good place to start</span><h2>Let’s make something better.</h2></div><button className="home-primary-cta" onClick={enterQuill}>Start with Quill <ArrowRight size={16} /></button></section>
      <footer className="home-footer"><a className="home-brand" href="/" aria-label="Quill home"><span className="home-brand-mark"><Feather size={16} strokeWidth={2.2} /></span><span>Quill<span className="brand-period">.</span></span></a><span>Thoughtful code, shipped together.</span><span>© {new Date().getFullYear()} Quill</span></footer>
    </main>
  );
}
