import * as http from 'http';
import { EventEmitter } from 'events';

export interface ClaudeEvent {
  type:
    | 'tool_use'       // PreToolUse hook
    | 'tool_result'    // PostToolUse hook
    | 'agent_done'     // PostToolUse hook, tool=Agent (derived)
    | 'user_prompt'    // UserPromptSubmit hook
    | 'permission'     // Notification hook, notification_type=permission_prompt|elicitation_dialog (derived)
    | 'notification'   // Notification hook (auth_success and other types)
    | 'session_start'  // SessionStart hook
    | 'stop'           // Stop hook
    | 'stop_failure';  // StopFailure hook (rate_limit, billing_error, etc.)
  sessionId?: string;    // Claude Code session UUID (from session_id in hook stdin)
  tool?: string;         // Read, Edit, Bash, Grep, Glob, Agent, Write, etc.
  params?: Record<string, unknown>;
  text?: string;
  success?: boolean;     // tool_result: false when is_error=true
  tokens?: { input: number; output: number }; // stop: cumulative token usage
  notifType?: string;    // notification/permission: original notification_type value
  timestamp: number;
}

export class EventServer extends EventEmitter {
  private server: http.Server | null = null;
  private port: number;

  constructor(port: number) {
    super();
    this.port = port;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end();
          return;
        }

        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const event: ClaudeEvent = JSON.parse(body);
            event.timestamp = Date.now();
            this.emit('event', event);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          } catch {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
          }
        });
      });

      this.server.on('error', reject);
      this.server.listen(this.port, '127.0.0.1', () => resolve());
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  getPort(): number {
    return this.port;
  }
}
