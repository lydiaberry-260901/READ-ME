import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata = { title: "No access" };

export default function NoAccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="card w-full max-w-md p-8">
        <Logo />
        <h1 className="mt-8 text-2xl font-semibold">You do not have access to this page</h1>
        <p className="mt-2 text-mocha-muted">
          Your role does not include this area. If you need it for your work, ask an admin to change your role.
        </p>
        <Link href="/" className="btn btn-primary mt-6 no-underline">
          Back to home
        </Link>
      </div>
    </main>
  );
}
