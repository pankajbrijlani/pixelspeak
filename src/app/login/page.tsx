"use client";

import { Suspense, useActionState } from "react";
import { loginAction } from "./actions";
import { useSearchParams } from "next/navigation";

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const [state, formAction, pending] = useActionState(loginAction, undefined);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <div>
        <label className="block text-xs font-medium text-neutral-400">
          Email
        </label>
        <input
          type="email"
          name="email"
          required
          autoFocus
          className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-400">
          Password
        </label>
        <input
          type="password"
          name="password"
          required
          className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
        />
      </div>

      {state?.error && <p className="text-sm text-red-400">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-50"
      >
        {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-8 shadow-xl">
        <h1 className="text-xl font-semibold tracking-tight text-white">
          PixelSpeak Growth
        </h1>
        <p className="mt-1 text-sm text-neutral-400">
          Sign in to manage leads, campaigns, and ads.
        </p>

        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>

        <p className="mt-6 text-xs text-neutral-500">
          No account yet? Create one with{" "}
          <code className="rounded bg-neutral-800 px-1 py-0.5">
            npm run create-user
          </code>{" "}
          from the server.
        </p>
      </div>
    </main>
  );
}
