import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Zap, AlertCircle, CheckCircle } from "lucide-react";
import { useOllama } from "@/hooks/useOllama";

interface OllamaSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function OllamaSettings({ isOpen, onClose }: OllamaSettingsProps) {
  const ollama = useOllama();
  const [endpoint, setEndpoint] = useState(ollama.config.endpoint);
  const [model, setModel] = useState(ollama.config.model);
  const [temperature, setTemperature] = useState(ollama.config.temperature ?? 0.7);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    setEndpoint(ollama.config.endpoint);
    setModel(ollama.config.model);
    setTemperature(ollama.config.temperature ?? 0.7);
  }, [ollama.config]);

  const handleTestConnection = async () => {
    setIsTesting(true);
    await ollama.checkHealth(endpoint);
    setIsTesting(false);
  };

  const handleSave = () => {
    ollama.updateConfig({ endpoint, model, temperature });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg p-6 w-full max-w-md">
        <div className="flex items-center gap-2 mb-6">
          <Zap className="w-5 h-5 text-yellow-500" />
          <h2 className="text-lg font-semibold">Ollama Settings</h2>
        </div>

        <div className="space-y-4">
          {/* Endpoint */}
          <div>
            <label className="text-sm font-medium block mb-2">
              Ollama Endpoint
            </label>
            <Input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="http://localhost:11434"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Default: http://localhost:11434
            </p>
          </div>

          {/* Connection Status */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/50">
            {ollama.isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Checking connection...</span>
              </>
            ) : ollama.isHealthy ? (
              <>
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-sm text-green-600">Connected</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 text-red-500" />
                <span className="text-sm text-red-600">Not connected</span>
              </>
            )}
          </div>

          {/* Model Selection */}
          <div>
            <label className="text-sm font-medium block mb-2">Model</label>
            {ollama.models.length > 0 ? (
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
              >
                {ollama.models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <div className="p-3 rounded-lg bg-secondary/50 text-sm text-muted-foreground">
                {ollama.isHealthy
                  ? "No models found. Pull models in Ollama."
                  : "Connect to Ollama to see available models."}
              </div>
            )}
          </div>

          {/* Temperature */}
          <div>
            <label className="text-sm font-medium block mb-2">
              Temperature: {temperature.toFixed(2)}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Lower = more deterministic, Higher = more creative
            </p>
          </div>

          {/* Enable Toggle */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/50">
            <input
              type="checkbox"
              id="ollama-enabled"
              checked={ollama.isEnabled}
              onChange={(e) => ollama.setEnabled(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="ollama-enabled" className="text-sm font-medium">
              {ollama.isEnabled ? "Ollama Enabled" : "Ollama Disabled"}
            </label>
          </div>

          {/* Error Message */}
          {ollama.error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950 text-sm text-red-600 dark:text-red-300">
              {ollama.error}
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-3 mt-6">
          <Button
            onClick={handleTestConnection}
            disabled={isTesting}
            variant="outline"
            className="flex-1"
          >
            {isTesting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Testing...
              </>
            ) : (
              "Test Connection"
            )}
          </Button>
          <Button onClick={handleSave} className="flex-1">
            Save & Close
          </Button>
        </div>
      </div>
    </div>
  );
}
