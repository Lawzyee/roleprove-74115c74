import { Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-3xl flex-col items-start px-5 py-16">
        <p className="text-sm font-medium text-primary">404</p>
        <h1 className="mt-2 font-display text-3xl font-semibold">Page not found</h1>
        <p className="mt-3 text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild><Link to="/">Go to the home page</Link></Button>
          <Button asChild variant="outline"><Link to="/help">Visit the help centre</Link></Button>
        </div>
      </main>
    </>
  );
}

