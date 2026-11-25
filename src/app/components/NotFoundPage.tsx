import { BrandMark, Link } from '@/app/components/AppChrome';
import { EmptyState } from '@/shared/ui/feedback';

export function NotFoundPage() {
  return (
    <main className="centered-page">
      <Link to="/" className="centered-page__brand">
        <BrandMark />
      </Link>
      <EmptyState
        icon="search"
        title="We couldn’t find that page"
        action={
          <Link to="/" className="btn btn--primary btn--md">
            Back to home
          </Link>
        }
      >
        The link may be mistyped, or the design was deleted.
      </EmptyState>
    </main>
  );
}
