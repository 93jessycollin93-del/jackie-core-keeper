export type ToolDef = {
  id: string;
  name: string;
  category: string;
  description: string;
  needsKey?: string;    // env var name required, if any
  executable?: boolean; // has real implementation in tool-exec edge fn
};

const T = (
  id: string, name: string, category: string, description: string,
  opts: { needsKey?: string; executable?: boolean } = {}
): ToolDef => ({ id, name, category, description, ...opts });

export const TOOLS: ToolDef[] = [
  // CORE EXECUTION
  T("web_search", "Web Search", "Core Execution", "DuckDuckGo/Google search", { executable: true }),
  T("code_execute_python", "Run Python", "Core Execution", "Execute Python in sandbox", { executable: true }),
  T("code_execute_bash", "Run Bash", "Core Execution", "Execute shell command", { executable: true }),
  T("code_execute_javascript", "Run JavaScript", "Core Execution", "Execute JS via Deno", { executable: true }),
  T("http_request", "HTTP Request", "Core Execution", "GET/POST/etc any URL", { executable: true }),
  T("calculator", "Calculator", "Core Execution", "Evaluate math expressions", { executable: true }),

  // FILE & DATA
  T("file_read", "File Read", "File & Data", "Read from storage bucket", { executable: true }),
  T("file_write", "File Write", "File & Data", "Write to storage bucket", { executable: true }),
  T("file_delete", "File Delete", "File & Data", "Delete from storage bucket", { executable: true }),
  T("file_list", "File List", "File & Data", "List storage bucket contents", { executable: true }),
  T("json_parse", "JSON Parse", "File & Data", "Parse & query JSON", { executable: true }),
  T("csv_handler", "CSV Handler", "File & Data", "Parse/emit CSV", { executable: true }),
  T("yaml_parser", "YAML Parser", "File & Data", "Parse YAML to JSON", { executable: true }),
  T("markdown_to_html", "Markdown → HTML", "File & Data", "Render markdown", { executable: true }),

  // AI & MODELS
  T("ollama_call", "Ollama Call", "AI & Models", "Local Ollama endpoint", { executable: true, needsKey: "OLLAMA_BASE_URL" }),
  T("claude_api", "Claude", "AI & Models", "Anthropic Claude API", { needsKey: "ANTHROPIC_API_KEY" }),
  T("groq_api", "Groq", "AI & Models", "Groq free inference", { executable: true, needsKey: "GROQ_API_KEY" }),
  T("gemini_api", "Gemini (Lovable)", "AI & Models", "Google Gemini via Lovable Gateway", { executable: true }),
  T("model_status_check", "Model Status", "AI & Models", "Ping model endpoints", { executable: true }),

  // SYSTEM MONITORING (edge-side — reports what's available in serverless runtime)
  T("system_info", "System Info", "System Monitoring", "Runtime info (edge)", { executable: true }),
  T("gpu_monitor", "GPU Monitor", "System Monitoring", "nvidia-smi (requires local agent)", {}),
  T("thermal_info", "Thermal Info", "System Monitoring", "GPU temp (requires local agent)", {}),
  T("process_list", "Process List", "System Monitoring", "Requires local agent", {}),
  T("network_check", "Network Check", "System Monitoring", "Reachability + latency", { executable: true }),
  T("disk_space", "Disk Space", "System Monitoring", "Requires local agent", {}),

  // GITHUB
  T("github_issue_read", "GH Issue Read", "GitHub", "Read an issue", { executable: true, needsKey: "GITHUB_TOKEN" }),
  T("github_pr_read", "GH PR Read", "GitHub", "Read a pull request", { executable: true, needsKey: "GITHUB_TOKEN" }),
  T("github_search_code", "GH Search Code", "GitHub", "Search code across GH", { executable: true, needsKey: "GITHUB_TOKEN" }),
  T("github_commit_info", "GH Commit Info", "GitHub", "Read commit details", { executable: true, needsKey: "GITHUB_TOKEN" }),
  T("repo_info", "Repo Info", "GitHub", "Repo metadata", { executable: true, needsKey: "GITHUB_TOKEN" }),

  // INTEGRATIONS
  T("slack_send", "Slack Send", "Integrations", "Post via incoming webhook", { executable: true, needsKey: "SLACK_WEBHOOK_URL" }),
  T("email_send", "Email Send", "Integrations", "SMTP/Resend send", { needsKey: "RESEND_API_KEY" }),
  T("discord_notify", "Discord Notify", "Integrations", "Discord webhook", { executable: true, needsKey: "DISCORD_WEBHOOK_URL" }),
  T("webhook_call", "Webhook Call", "Integrations", "Arbitrary webhook POST", { executable: true }),

  // TEXT / NLP
  T("text_summarize", "Summarize", "Text/NLP", "Summarize text via Gemini", { executable: true }),
  T("sentiment_analyze", "Sentiment", "Text/NLP", "Classify sentiment", { executable: true }),
  T("token_counter", "Token Counter", "Text/NLP", "Approx token count", { executable: true }),
  T("language_detect", "Language Detect", "Text/NLP", "Detect language", { executable: true }),

  // DATABASE
  T("sql_query", "SQL Query", "Database", "SELECT on connected DB", { executable: true }),
  T("postgres_connect", "Postgres Connect", "Database", "Connection health check", { executable: true }),
  T("sqlite_query", "SQLite Query", "Database", "SQLite in-memory query", { executable: true }),

  // SECURITY
  T("api_key_validator", "API Key Validator", "Security", "Shape/prefix check", { executable: true }),
  T("ssl_cert_check", "SSL Cert Check", "Security", "Check TLS cert of host", { executable: true }),
  T("auth_token_check", "Auth Token Check", "Security", "Decode/validate JWT", { executable: true }),
];

export const TOOL_CATEGORIES = Array.from(new Set(TOOLS.map(t => t.category)));
export const TOOL_BY_ID = new Map(TOOLS.map(t => [t.id, t]));
export const EXECUTABLE_TOOLS = TOOLS.filter(t => t.executable);
