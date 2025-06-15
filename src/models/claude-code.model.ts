export interface ClaudeCodeUsageData {
  id: string;
  model: string;
  role: "assistant" | "user";
  stop_reason: string | null;
  stop_sequence: string | null;
  tool_use: string[];
  usage: {
    cache_creation_input_tokens: number | null;
    cache_read_input_tokens: number | null;
    input_tokens: number;
    output_tokens: number | null;
  };
  updated_at: string;
  project: string;
  user: string;
  machine: string;
  session: string;
}