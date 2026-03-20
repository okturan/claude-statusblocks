export interface StatusLineData {
  model: { id: string; display_name: string };
  cwd?: string;
  workspace: { current_dir: string; project_dir: string };
  version: string;
  cost: {
    total_cost_usd: number;
    total_duration_ms: number;
    total_api_duration_ms: number;
    total_lines_added: number;
    total_lines_removed: number;
  };
  context_window: {
    context_window_size: number;
    used_percentage: number | null;
    remaining_percentage: number | null;
    total_input_tokens: number;
    total_output_tokens: number;
    current_usage: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens: number;
      cache_read_input_tokens: number;
    } | null;
  };
  rate_limits?: {
    five_hour?: { used_percentage: number; resets_at: number };
    seven_day?: { used_percentage: number; resets_at: number };
  };
  exceeds_200k_tokens: boolean;
  session_id: string;
  transcript_path?: string;
  output_style?: { name: string };
  vim?: { mode: string };
  agent?: { name: string };
  worktree?: {
    name: string;
    path: string;
    branch?: string;
    original_cwd?: string;
    original_branch?: string;
  };
}

/** A rendered block — a fixed-width multi-line unit */
export interface Block {
  id: string;
  priority: number;
  width: number;
  lines: string[];
}

export interface Segment {
  id: string;
  priority: number;
  render(data: StatusLineData, availWidth: number): Block;
  enabled(data: StatusLineData): boolean;
}

export interface Campaign {
  id: string;
  name: string;
  start: string;
  end: string;
  rules: {
    peakHours?: { start: number; end: number; tz: string };
    weekdaysOnly?: boolean;
    multiplier?: number;
  };
  display: {
    active: { text: string; color: string };
    inactive: { text: string; color: string };
  };
}

export interface StatusBlocksConfig {
  segments?: string[];
  theme?: 'default' | 'minimal' | 'full';
  showCampaigns?: boolean;
  separator?: string;
}
