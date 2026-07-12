import { StartupSelfTest } from "@/components/StartupSelfTest";
import { SetupWizard } from "@/components/SetupWizard";

export default function Setup() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <header>
          <h1 className="font-mono text-xl">Setup</h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            Guided provider setup and live row-level-security verification against your session.
          </p>
        </header>
        <StartupSelfTest />
        <SetupWizard />
      </div>
    </div>
  );
}
