import { Link } from "@tanstack/react-router";
import { openCookieSettings } from "./CookieBanner";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} RoleProve. Practice the job. Prove the skill.</p>
        <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2">
          <Link to="/terms" className="hover:text-foreground">Terms</Link>
          <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link to="/cookies" className="hover:text-foreground">Cookies</Link>
          <button type="button" onClick={openCookieSettings} className="hover:text-foreground">Cookie settings</button>
          <Link to="/help" className="hover:text-foreground">Help</Link>
        </nav>
      </div>
    </footer>
  );
}
