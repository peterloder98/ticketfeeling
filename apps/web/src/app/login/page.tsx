import { BrandLogo } from "@/components/brand-logo";
import { LoginForm } from "@/components/login-form";

export const metadata = { title: "Anmelden" };

export default function LoginPage() {
  return (
    <div className="tf-container py-16 md:py-24">
      <div className="mx-auto max-w-md">
        <BrandLogo variant="app" href="/" className="mb-8" />
        <h1 className="tf-display text-4xl">Willkommen zurück</h1>
        <p className="mt-3 text-[var(--tf-text-secondary)]">
          Melde dich an — Admin, Tageskasse oder Vorverkaufsstelle.
        </p>
        <div className="tf-card mt-8">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
