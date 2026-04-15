/// <reference path="./agent/idle.ts" />
/// <reference path="./agent/thinking.ts" />
/// <reference path="./agent/working.ts" />
/// <reference path="./agent/waiting.ts" />
/// <reference path="./agent/spawning.ts" />
/// <reference path="./user/idle.ts" />
/// <reference path="./user/thinking.ts" />
/// <reference path="./user/waiting.ts" />
/// <reference path="./claude/idle.ts" />
/// <reference path="./claude/error.ts" />
/// <reference path="./claude/thinking.ts" />
/// <reference path="./claude/searching.ts" />
/// <reference path="./claude/writing.ts" />
/// <reference path="./claude/running.ts" />
/// <reference path="./claude/spawning.ts" />
/// <reference path="./claude/waiting.ts" />
/// <reference path="./claude/celebrating.ts" />
/// <reference path="./claude/reading.ts" />

// ── Assemble PIXEL_RAW from per-file frame arrays ─────────────────────────────
// Keys: "role_state_N" — matches what PixelSpriteRenderer expects.

const PIXEL_RAW: Record<string, string[]> = (() => {
  const raw: Record<string, string[]> = {};

  function reg(prefix: string, frames: string[][]): void {
    frames.forEach((frame, i) => { raw[`${prefix}_${i}`] = frame; });
  }

  reg('agent_idle',     AGENT_IDLE_FRAMES);
  reg('agent_thinking', AGENT_THINKING_FRAMES);
  reg('agent_working',  AGENT_WORKING_FRAMES);
  reg('agent_waiting',  AGENT_WAITING_FRAMES);
  reg('agent_spawning', AGENT_SPAWNING_FRAMES);

  reg('user_idle',     USER_IDLE_FRAMES);
  reg('user_thinking', USER_THINKING_FRAMES);
  reg('user_waiting',  USER_WAITING_FRAMES);

  reg('claude_idle',        CLAUDE_IDLE_FRAMES);
  reg('claude_error',       CLAUDE_ERROR_FRAMES);
  reg('claude_thinking',    CLAUDE_THINKING_FRAMES);
  reg('claude_searching',   CLAUDE_SEARCHING_FRAMES);
  reg('claude_writing',     CLAUDE_WRITING_FRAMES);
  reg('claude_running',     CLAUDE_RUNNING_FRAMES);
  reg('claude_spawning',    CLAUDE_SPAWNING_FRAMES);
  reg('claude_waiting',     CLAUDE_WAITING_FRAMES);
  reg('claude_celebrating', CLAUDE_CELEBRATING_FRAMES);
  reg('claude_reading',     CLAUDE_READING_FRAMES);

  return raw;
})();
