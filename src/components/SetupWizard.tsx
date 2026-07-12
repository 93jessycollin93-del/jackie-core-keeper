import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  ShieldCheck,
  UserCircle,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { runStartupSelfTest, summarize, type ProbeResult } from "@/lib/self-test";

type Provider = {
  id: string;
  label: string;
  secretName: string;
  keyPrefix: string;
  minLen: number;
  docs: string;
  hint: string;
  /** true = billed to workspace credits (built-in). false = user pays the provider directly. */
  billedByWorkspace: boolean;
};

const PROVIDERS: Provider[] = [
  {
    id: "lovable",
    label: "Lovable AI Gateway (built-in)",
    secretName: "LOVABLE_API_KEY",
    keyPrefix: "",
    minLen: 0,
    docs: "https://docs.lovable.dev/features/ai",
    hint:
      "Auto-provisioned. Routes to Gemini, GPT-5, Claude and more through your workspace credits — no third-party billing.",
    billedByWorkspace: true,
  },
  {
    id: "openai",
    label: "OpenAI (bring your own — you pay OpenAI)",
    secretName: "OPENAI_API_KEY",
    keyPrefix: "sk-",
    minLen: 40,
    docs: "https://platform.openai.com/api-keys",
    hint: "Optional. Only add if you specifically want to be billed by OpenAI instead of using the built-in gateway.",
    billedByWorkspace: false,
  },
  {
    id: "anthropic",
    label: "Anthropic (bring your own — you pay Anthropic)",
    secretName: "ANTHROPIC_API_KEY",
    keyPrefix: "sk-ant-",
    minLen: 40,
    docs: "https://console.anthropic.com/settings/keys",
    hint: "Optional. Only add if you want to be billed by Anthropic directly.",
    billedByWorkspace: false,
  },
  {
    id: "groq",
    label: "Groq (bring your own — you pay Groq)",
    secretName: "GROQ_API_KEY",
    keyPrefix: "gsk_",
    minLen: 30,
    docs: "https://console.groq.com/keys",
    hint: "Optional. Only add if you want to be billed by Groq directly.",
    billedByWorkspace: false,
  },
  {
    id: "openrouter",
    label: "OpenRouter (bring your own — you pay OpenRouter)",
    secretName: "OPENROUTER_API_KEY",
    keyPrefix: "sk-or-",
    minLen: 30,
    docs: "https://openrouter.ai/keys",
    hint: "Optional. Only add if you want to be billed by OpenRouter directly.",
    billedByWorkspace: false,
  },
];


type ValidationState = { ok: boolean; msg: string };

function validateKey(p: Provider, raw: string): ValidationState {
  const key = raw.trim();
  if (!key) return { ok: false, msg: "Enter the key to validate." };
  if (p.keyPrefix && !key.startsWith(p.keyPrefix)) {
    return { ok: false, msg: `Expected prefix "${p.keyPrefix}". Double-check you copied the correct key.` };
  }
  if (key.length < p.minLen) {
    return { ok: false, msg: `Looks too short (${key.length} chars). ${p.label} keys are usually ≥ ${p.minLen}.` };
  }
  if (/\s/.test(key)) {
    return { ok: false, msg: "Contains whitespace. Re-copy the raw key without line breaks." };
  }
  return { ok: true, msg: "Format looks valid. Save it to the backend as the secret named below." };
}

type Step = 0 | 1 | 2 | 3;

export function SetupWizard() {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>(0);

  // Step 1 — RLS
  const [rlsRunning, setRlsRunning] = useState(false);
  const [rls, setRls] = useState<ProbeResult[] | null>(null);
  const rlsSummary = rls ? summarize(rls) : null;

  const runRls = async () => {
    setRlsRunning(true);
    try {
      setRls(await runStartupSelfTest());
    } finally {
      setRlsRunning(false);
    }
  };

  // Step 2 — provider
  const [providerId, setProviderId] = useState<string>("openai");
  const provider = useMemo(() => PROVIDERS.find((p) => p.id === providerId)!, [providerId]);
  const [rawKey, setRawKey] = useState("");
  const validation = useMemo(
    () => (rawKey ? validateKey(provider, rawKey) : null),
    [provider, rawKey],
  );

  // Step 3 — issue personal API key
  const [keyName, setKeyName] = useState("Default key");
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState<{ key: string; prefix: string } | null>(null);

  const issueKey = async () => {
    if (!keyName.trim()) {
      toast.error("Give the key a name.");
      return;
    }
    setIssuing(true);
    try {
      const { data, error } = await supabase.functions.invoke("api-keys/create", {
        body: { name: keyName.trim(), scopes: [] },
      });
      if (error) throw error;
      if (!data?.key) throw new Error("No key returned from server.");
      setIssued({ key: data.key, prefix: data.prefix ?? "" });
      toast.success("Personal API key issued. Copy it now — it won't be shown again.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Could not issue key: ${msg}`);
    } finally {
      setIssuing(false);
    }
  };

  const stepConfig = [
    { icon: UserCircle, title: "Identity" },
    { icon: ShieldCheck, title: "RLS self-test" },
    { icon: KeyRound, title: "Provider credentials" },
    { icon: CheckCircle2, title: "Personal API key" },
  ];

  const canNext =
    (step === 0 && !!user) ||
    (step === 1 && rlsSummary?.ok === true) ||
    (step === 2 && (providerId === "lovable" || validation?.ok === true)) ||
    step === 3;

  return (
    <div className="border border-border rounded-md bg-card">
      {/* Stepper */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border overflow-x-auto">
        {stepConfig.map((s, i) => {
          const Icon = s.icon;
          const active = i === step;
          const done = i < step;
          return (
            <div key={s.title} className="flex items-center gap-2 shrink-0">
              <div
                className={`flex items-center gap-2 px-2 py-1 rounded font-mono text-[11px] ${
                  active
                    ? "bg-primary/10 text-primary"
                    : done
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {i + 1}. {s.title}
              </div>
              {i < stepConfig.length - 1 && (
                <span className="text-muted-foreground/50 font-mono text-xs">›</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-4 space-y-4">
        {/* STEP 0 — identity */}
        {step === 0 && (
          <div className="space-y-3">
            <h3 className="font-mono text-sm">Confirm your session</h3>
            {user ? (
              <div className="flex items-start gap-2 p-3 border border-primary/30 rounded bg-primary/5">
                <CheckCircle2 className="w-4 h-4 text-primary mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs">{user.email ?? user.id}</div>
                  <div className="font-mono text-[10px] text-muted-foreground mt-1">
                    uid: {user.id}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 p-3 border border-destructive/30 rounded bg-destructive/5">
                <XCircle className="w-4 h-4 text-destructive mt-0.5" />
                <div className="font-mono text-xs">
                  Not signed in. Sign in first — RLS checks and key issuance need your JWT.
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 1 — RLS */}
        {step === 1 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-sm">Verify row-level security</h3>
              <Button size="sm" variant="outline" onClick={runRls} disabled={rlsRunning}>
                {rlsRunning ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <ShieldCheck className="w-3 h-3" />
                )}
                <span className="ml-1 font-mono text-xs">
                  {rls ? "Re-run" : "Run tests"}
                </span>
              </Button>
            </div>
            <p className="font-mono text-[11px] text-muted-foreground">
              Reads your rows, then attempts a foreign-user read and a foreign-user write on each
              table. Foreign reads must return zero rows; foreign writes must be rejected.
            </p>
            {rls && (
              <div className="border border-border rounded divide-y divide-border">
                {rls.map((r) => {
                  const Icon =
                    r.status === "pass" ? CheckCircle2 : r.status === "fail" ? XCircle : AlertTriangle;
                  const color =
                    r.status === "pass"
                      ? "text-primary"
                      : r.status === "fail"
                      ? "text-destructive"
                      : "text-muted-foreground";
                  return (
                    <div key={r.table} className="px-3 py-2 flex items-start gap-2">
                      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} />
                      <div className="flex-1 min-w-0">
                        <code className="font-mono text-xs">{r.table}</code>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {r.detail}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {rlsSummary && !rlsSummary.ok && (
              <div className="flex items-start gap-2 p-3 border border-destructive/30 rounded bg-destructive/5">
                <AlertTriangle className="w-4 h-4 text-destructive mt-0.5" />
                <div className="font-mono text-[11px]">
                  One or more tables failed the RLS probe. Do not proceed until every table passes;
                  add or repair its policies first.
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 2 — provider */}
        {step === 2 && (
          <div className="space-y-3">
            <h3 className="font-mono text-sm">Provider credentials</h3>
            <p className="font-mono text-[11px] text-muted-foreground">
              The built-in Lovable AI Gateway covers chat, embeddings, images, and speech through
              your workspace credits. You do not need to bring any third-party key — the other
              options here would bill <em>you</em> at the provider, not through Lovable.
            </p>
            <div className="flex flex-wrap gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setProviderId(p.id);
                    setRawKey("");
                  }}
                  className={`px-3 py-1.5 rounded font-mono text-xs border ${
                    providerId === p.id
                      ? "border-primary text-primary bg-primary/10"
                      : p.billedByWorkspace
                      ? "border-border text-foreground hover:text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p.billedByWorkspace ? "★ " : ""}
                  {p.label}
                </button>
              ))}
            </div>

            <div className="text-[11px] font-mono text-muted-foreground">{provider.hint}</div>
            <a
              href={provider.docs}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono text-[11px] text-primary hover:underline"
            >
              Open provider dashboard <ExternalLink className="w-3 h-3" />
            </a>

            {provider.id === "lovable" ? (
              <div className="flex items-start gap-2 p-3 border border-primary/30 rounded bg-primary/5">
                <CheckCircle2 className="w-4 h-4 text-primary mt-0.5" />
                <div className="font-mono text-[11px]">
                  Built-in and ready. All AI calls in this app route through the Lovable AI Gateway
                  and are billed to your workspace credits — no external provider account or card
                  required. Recommended for every deployment.
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-2 p-3 border border-yellow-500/40 rounded bg-yellow-500/5">
                  <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5" />
                  <div className="font-mono text-[11px]">
                    Optional bring-your-own-key. Every call using this key is billed by{" "}
                    <strong>{provider.label.split(" ")[0]}</strong> on the account tied to the key
                    — not through Lovable. Skip this step unless you specifically want that.
                  </div>
                </div>

              <>
                <div className="space-y-1">
                  <Label htmlFor="rawKey" className="font-mono text-xs">
                    Paste key to validate
                  </Label>
                  <Input
                    id="rawKey"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={provider.keyPrefix ? `${provider.keyPrefix}…` : "…"}
                    value={rawKey}
                    onChange={(e) => setRawKey(e.target.value)}
                    className="font-mono text-xs"
                  />
                  <p className="text-[10px] font-mono text-muted-foreground">
                    Validated locally only. Nothing is sent from this form.
                  </p>
                </div>

                {validation && (
                  <div
                    className={`flex items-start gap-2 p-3 rounded border ${
                      validation.ok
                        ? "border-primary/30 bg-primary/5"
                        : "border-destructive/30 bg-destructive/5"
                    }`}
                  >
                    {validation.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-primary mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 text-destructive mt-0.5" />
                    )}
                    <div className="font-mono text-[11px]">{validation.msg}</div>
                  </div>
                )}

                <div className="p-3 border border-border rounded bg-background/50">
                  <div className="font-mono text-[11px] mb-2">
                    Save it to the backend as this secret name:
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 font-mono text-xs px-2 py-1 rounded bg-muted">
                      {provider.secretName}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(provider.secretName);
                        toast.success("Copied secret name.");
                      }}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                  <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                    Ask Jackie in chat: "Save my {provider.label} key as {provider.secretName}" —
                    a secure form opens. The value is never sent through chat.
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* STEP 3 — personal key */}
        {step === 3 && (
          <div className="space-y-3">
            <h3 className="font-mono text-sm">Issue a personal API key</h3>
            <p className="font-mono text-[11px] text-muted-foreground">
              Creates a hashed row in <code>api_keys</code> scoped to your user. The full token is
              shown once — copy it now.
            </p>
            <div className="space-y-1">
              <Label htmlFor="keyName" className="font-mono text-xs">
                Key name
              </Label>
              <Input
                id="keyName"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                maxLength={80}
                className="font-mono text-xs"
                disabled={!!issued}
              />
            </div>
            {!issued && (
              <Button onClick={issueKey} disabled={issuing || !user}>
                {issuing ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <KeyRound className="w-3 h-3" />
                )}
                <span className="ml-1 font-mono text-xs">Issue key</span>
              </Button>
            )}
            {issued && (
              <div className="p-3 border border-primary/30 rounded bg-primary/5 space-y-2">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary mt-0.5" />
                  <div className="font-mono text-[11px]">
                    Key created. Copy it now — the plaintext is only shown once.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 font-mono text-[11px] px-2 py-1 rounded bg-muted break-all">
                    {issued.key}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(issued.key);
                      toast.success("Copied.");
                    }}
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
                {issued.prefix && (
                  <div className="font-mono text-[10px] text-muted-foreground">
                    prefix: {issued.prefix}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Nav */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep((s) => (s > 0 ? ((s - 1) as Step) : s))}
            disabled={step === 0}
          >
            <ArrowLeft className="w-3 h-3" />
            <span className="ml-1 font-mono text-xs">Back</span>
          </Button>
          {step < 3 ? (
            <Button
              size="sm"
              onClick={() => setStep((s) => ((s + 1) as Step))}
              disabled={!canNext}
            >
              <span className="mr-1 font-mono text-xs">Next</span>
              <ArrowRight className="w-3 h-3" />
            </Button>
          ) : (
            <span className="font-mono text-[11px] text-muted-foreground">Done.</span>
          )}
        </div>
      </div>
    </div>
  );
}
