/**
 * Settings page — AI provider configuration.
 */
import { SettingsForm } from "@/components/settings/SettingsForm";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="font-serif text-3xl">Settings</h1>
      <p className="mt-1 text-sm text-ink-500">
        Choose how the AI Game Master talks to the models.
      </p>
      <div className="mt-6">
        <SettingsForm />
      </div>
    </div>
  );
}
