import Link from "next/link";
import { signupAction } from "@/app/auth/actions";

type SignupPageProps = {
  searchParams?: {
    error?: string;
    next?: string;
  };
};

export default function SignupPage({ searchParams }: SignupPageProps) {
  const error = searchParams?.error;
  const nextPath = searchParams?.next ?? "/";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-10">
      <section className="w-full rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-2xl font-semibold text-slate-900">Create account</h1>
        <p className="mt-1 text-sm text-slate-500">Start tracking meals, workouts, and progress with your own login.</p>

        <form action={signupAction} className="mt-6 space-y-4">
          <input type="hidden" name="next" value={nextPath} />
          <label className="block text-sm text-slate-700">
            Email
            <input name="email" type="email" required className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
          </label>
          <label className="block text-sm text-slate-700">
            Password
            <input name="password" type="password" required minLength={6} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
          </label>

          {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

          <button type="submit" className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-400">
            Sign up
          </button>
        </form>

        <p className="mt-4 text-sm text-slate-600">
          Already have an account?{" "}
          <Link href={`/login?next=${encodeURIComponent(nextPath)}`} className="font-medium text-emerald-700 hover:text-emerald-600">
            Log in
          </Link>
        </p>
      </section>
    </main>
  );
}
