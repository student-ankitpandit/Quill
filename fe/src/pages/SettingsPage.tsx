import { useMemo, useState } from "react";
import { ExternalLink, LayoutGrid, Search } from "lucide-react";
import { clearAuth, getInstallUrl, isLoggedIn } from "@/lib/api";
import { navigate } from "@/lib/router";
import "./SettingsPage.css";

export default function Settings() {
  const [search, setSearch] = useState("");
  const githubConnected = isLoggedIn();
  const showConnections = useMemo(() => "connections github integration".includes(search.trim().toLowerCase()), [search]);

  return (
    <section className="settings-page">
      <aside className="settings-nav">
        <label className="settings-search"><Search size={16} /><input aria-label="Search settings" placeholder="Search settings..." value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>/</kbd></label>
        <p className="settings-nav-caption">Connections</p>
        <nav aria-label="Settings sections">
          {showConnections ? <button className="settings-nav-item active" type="button"><LayoutGrid size={17} /><span>Connections</span></button> : <p className="settings-empty-search">No matching settings</p>}
        </nav>
      </aside>

      <div className="settings-content">
        <header className="settings-heading"><div><h1>Connections</h1><p className="muted">Manage your Quill workspace and account settings.</p></div></header>
        <div className="settings-card">
          <div className="settings-card-heading">
            <div className="settings-provider-icon github-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.56.1.76-.24.76-.54v-2.08c-3.1.67-3.76-1.32-3.76-1.32-.51-1.29-1.24-1.63-1.24-1.63-1.02-.7.08-.69.08-.69 1.13.08 1.73 1.16 1.73 1.16 1 .1.79 2.3 3.16 1.63.1-.73.39-1.23.71-1.51-2.48-.28-5.09-1.24-5.09-5.52 0-1.22.44-2.22 1.16-3-.12-.28-.5-1.42.11-2.96 0 0 .95-.3 3.05 1.15a10.6 10.6 0 0 1 5.55 0c2.1-1.45 3.05-1.15 3.05-1.15.61 1.54.23 2.68.11 2.96.72.78 1.16 1.78 1.16 3 0 4.29-2.61 5.24-5.1 5.51.4.35.76 1.03.76 2.08v3.08c0 .3.2.65.77.54A11.1 11.1 0 0 0 12 .9Z" /></svg></div>
            <div><h2>GitHub</h2><p>Repositories and pull requests</p></div>
            <span className={`connection-status${githubConnected ? " connected" : ""}`}><i />{githubConnected ? "Connected" : "Not connected"}</span>
          </div>
          <div className="settings-card-body">
            <p>{githubConnected ? "Quill can access the repositories granted to your GitHub App installation." : "Connect your GitHub account to choose repositories and work on them with Quill."}</p>
            <div className="settings-connection-actions">
              <a className="btn btn-quiet settings-manage-link" href={getInstallUrl()} target="_blank" rel="noreferrer">{githubConnected ? "Manage repository access" : "Connect GitHub"}<ExternalLink size={15} /></a>
              {githubConnected && <button className="btn btn-quiet settings-disconnect" type="button" onClick={() => { clearAuth(); navigate({ page: "landing" }); }}>Disconnect GitHub</button>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
