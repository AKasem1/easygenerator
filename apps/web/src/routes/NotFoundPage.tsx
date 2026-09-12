import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <section className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Page not found</h1>
      <Link to="/sign-in" className="mt-2 inline-block text-sm text-indigo-600 underline">
        Go to sign in
      </Link>
    </section>
  );
}
