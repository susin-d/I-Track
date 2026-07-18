import React, { useEffect, useState } from "react";
import * as Icons from "lucide-react";
import { api, getToken } from "../../api";

const FALLBACK_MARKETING = {
  preview: { sprintHealth: 84, completed: 32, planned: 41, velocityChange: 18, risk: 12, blockersResolved: 3, confidence: 92, risksCaught: 2 },
  proof: { avatars: ["AK", "JM", "RL"], additional: "+2k" },
  logos: ["northstar", "Vertex", "APERTURE", "lumon", "QUANTUM"],
  testimonial: { quote: "I-TRACK gave us back the one thing our team was missing: a shared sense of what matters.", name: "Maya Chen", title: "VP of Product at Northstar", initials: "MC" },
};

export function LandingPage() {
  const [marketing, setMarketing] = useState<any>(FALLBACK_MARKETING);
  const [marketingState, setMarketingState] = useState<"loading" | "live" | "fallback">("loading");
  const [menuOpen, setMenuOpen] = useState(false);
  const isLoggedIn = Boolean(getToken());
  const year = new Date().getFullYear();
  useEffect(() => {
    let active = true;
    void api<any>("/marketing")
      .then((data) => { if (active) { setMarketing(data); setMarketingState("live"); } })
      .catch(() => { if (active) setMarketingState("fallback"); });
    return () => { active = false; };
  }, []);
  const features = [
    { icon: Icons.Gauge, title: "See risk before it slips", text: "Live sprint health, workload signals, and delivery forecasts give every team an honest view of what happens next." },
    { icon: Icons.Sparkles, title: "Turn updates into action", text: "Ask I-TRACK what changed, where work is blocked, and what deserves attention—without another status meeting." },
    { icon: Icons.Route, title: "Keep work moving", text: "Plan, prioritize, and ship from one focused workspace built for product, design, and engineering teams." },
  ];
  return (
    <div className="landing">
      <header className="landing-nav">
        <a className="landing-logo" href="#top" aria-label="I-TRACK home"><span><img src="/logo-mark-soft-purple.png" alt="" /></span>I-TRACK</a>
        <button className="landing-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation" aria-expanded={menuOpen}>
          {menuOpen ? <Icons.X /> : <Icons.Menu />}
        </button>
        <nav className={menuOpen ? "open" : ""} aria-label="Main navigation">
          <a href="#features" onClick={() => setMenuOpen(false)}>Product</a>
          <a href="#workflow" onClick={() => setMenuOpen(false)}>How it works</a>
          <a href="#customers" onClick={() => setMenuOpen(false)}>Customers</a>
          <a href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</a>
        </nav>
        <div className="landing-actions">
          <a href={isLoggedIn ? "/dashboard" : "/login"}>
            {isLoggedIn ? "Dashboard" : "Log in"}
          </a>
          <a className="landing-button small" href="/register">Start free <Icons.ArrowUpRight /></a>
        </div>
      </header>

      <main id="top">
        {marketingState === "fallback" && <div className="landing-data-note" role="status">Showing the latest available product preview.</div>}
        <section className="landing-hero">
          <div className="hero-copy">
            <div className="eyebrow"><span></span>Built for teams that ship</div>
            <h1>Keep every sprint<br/><em>on track.</em></h1>
            <p>I-TRACK brings planning, delivery signals, and AI-powered insight into one calm workspace—so your team can move with clarity.</p>
            <div className="hero-actions">
              <a className="landing-button" href="/register">Start tracking for free <Icons.ArrowRight /></a>
              <a className="text-link" href="#workflow"><Icons.PlayCircle /> See how it works</a>
            </div>
              <div className="hero-proof">
              <div className="proof-avatars">{(marketing?.proof?.avatars || []).map((avatar: string) => <span key={avatar}>{avatar}</span>)}{marketing?.proof?.additional && <span>{marketing.proof.additional}</span>}</div>
              <p><b>Trusted by ambitious teams</b><br/>No credit card · Free to get started</p>
            </div>
          </div>
          <div className="hero-visual" aria-label="I-TRACK sprint dashboard preview">
            <div className="visual-glow"></div>
            <div className="mini-app">
              <div className="mini-sidebar">
                <div className="mini-brand"><img src="/logo-mark-soft-purple.png" alt="" /></div>
                {[Icons.LayoutDashboard, Icons.FolderKanban, Icons.Columns3, Icons.ChartNoAxesCombined].map((Icon, i) => <span className={i === 0 ? "active" : ""} key={i}><Icon /></span>)}
              </div>
              <div className="mini-main">
                <div className="mini-top"><span>SPRINT OVERVIEW</span><div><Icons.Search/><b>AK</b></div></div>
                <div className="mini-heading"><div><small>Current sprint</small><h3>Momentum is building.</h3></div><button disabled>+ Create issue</button></div>
                <div className="mini-stats">
                  <article><small>SPRINT HEALTH</small><strong>{marketing?.preview?.sprintHealth ?? "—"}<span>{marketing ? "%" : ""}</span></strong><i>On track</i></article>
                  <article><small>COMPLETED</small><strong>{marketing?.preview?.completed ?? "—"}<span>{marketing ? ` / ${marketing.preview.planned}` : ""}</span></strong><div className="mini-bar"><i></i></div></article>
                  <article><small>TEAM VELOCITY</small><strong>{marketing ? `+${marketing.preview.velocityChange}` : "—"}<span>{marketing ? "%" : ""}</span></strong><svg viewBox="0 0 120 30"><path d="M0 25 C22 23 24 11 42 17 S70 24 82 8 S105 11 120 2"/></svg></article>
                </div>
                <div className="mini-board"><div className="mini-board-empty">Connect your workspace to see live tickets</div></div>
              </div>
            </div>
            <div className="floating-card risk-card"><span><Icons.ShieldCheck /></span><div><small>SPRINT RISK</small><b>Low risk</b></div><strong>{marketing?.preview?.risk ?? "—"}</strong></div>
            <div className="floating-card ai-card"><Icons.Sparkles /><div><small>I-TRACK AI</small><b>{marketing ? `${marketing.preview.blockersResolved} blockers resolved this week` : "Loading workspace insight"}</b></div></div>
          </div>
        </section>

        <section className="logo-strip" id="customers"><p>Helping modern teams build what matters</p><div>{(marketing?.logos || []).map((logo: string) => <b key={logo}>{logo}</b>)}</div></section>

        <section className="landing-section" id="features">
          <div className="section-intro"><div><span className="section-kicker">ONE WORKSPACE. TOTAL CLARITY.</span><h2>Less tracking.<br/>More momentum.</h2></div><p>Your team shouldn't have to chase updates across five tools. I-TRACK puts the signal front and center, so everyone knows what matters now.</p></div>
          <div className="feature-grid">{features.map(({icon: Icon,title,text}, i) => <article key={title}><span className={`feature-icon f${i}`}><Icon /></span><h3>{title}</h3><p>{text}</p><a href="/register">Learn more <Icons.ArrowUpRight /></a></article>)}</div>
        </section>

        <section className="workflow-section" id="workflow">
          <div className="workflow-card"><div className="workflow-copy"><span className="section-kicker">FROM PLAN TO PROGRESS</span><h2>A clearer way to move work forward.</h2><p>Turn goals into focused sprints, spot trouble early, and help every teammate do their best work.</p>{["Plan around real team capacity","Catch blockers before standup","Share progress without the status chase"].map(x=><div className="workflow-point" key={x}><Icons.Check />{x}</div>)}<a className="landing-button" href="/register">Explore I-TRACK <Icons.ArrowRight/></a></div><div className="workflow-visual"><div className="pulse-ring"><span><Icons.Activity/></span></div><div className="signal signal-one"><small>SPRINT CONFIDENCE</small><b>92%</b><i></i></div><div className="signal signal-two"><Icons.Zap/><span><b>2 risks caught early</b><small>AI sprint analysis</small></span></div><div className="signal signal-three"><small>DELIVERY TREND</small><svg viewBox="0 0 180 65"><path d="M0 56 C30 53 30 40 55 44 S86 42 105 25 S143 30 180 5"/></svg></div></div></div>
        </section>

        <section className="quote-section"><Icons.Quote/><blockquote>{marketing?.testimonial?.quote ? `“${marketing.testimonial.quote}”` : ""}</blockquote><div className="quote-person"><span>{marketing?.testimonial?.initials || ""}</span><p><b>{marketing?.testimonial?.name || ""}</b><small>{marketing?.testimonial?.title || ""}</small></p></div></section>

        <section className="cta-section" id="pricing"><div><span className="section-kicker">YOUR NEXT SPRINT STARTS HERE</span><h2>Ready to move<br/>with clarity?</h2></div><div><p>Bring your team, your work, and your ambition. I-TRACK will help you keep the rest on track.</p><a className="landing-button dark" href="/register">Start for free <Icons.ArrowRight/></a><small>Free forever for teams up to 10</small></div></section>
      </main>
      <footer className="landing-footer"><a className="landing-logo" href="#top"><span><img src="/logo-mark-soft-purple.png" alt="" /></span>I-TRACK</a><p>© {year} I-TRACK. Built for momentum.</p><div><a href="#features">Product</a><a href="#pricing">Pricing</a><a href="/login">Log in</a></div></footer>
    </div>
  );
}
