"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildEvent = buildEvent;
exports.sendEvent = sendEvent;
const http = __importStar(require("http"));
const fs = __importStar(require("fs"));
const PORT = 7891;
/**
 * Build a ClaudeStage event from the hook type and the parsed stdin JSON.
 *
 * stdin shapes (from Claude Code):
 *   PreToolUse:       { tool_name, tool_input, ... }
 *   PostToolUse:      { tool_name, tool_input, tool_response, ... }
 *   UserPromptSubmit: { prompt, ... }
 *   Stop:             { transcript_path, ... }
 */
function buildEvent(type, hookData) {
    const event = { type, timestamp: Date.now() };
    if (type === 'tool_use') {
        event.tool = hookData.tool_name;
        event.phase = 'pre';
        event.params = hookData.tool_input ?? {};
    }
    else if (type === 'tool_result') {
        event.tool = hookData.tool_name;
        event.phase = 'post';
        const resp = hookData.tool_response;
        event.success = !resp || (resp.is_error !== true && resp.success !== false);
    }
    else if (type === 'user_prompt') {
        event.text = hookData.prompt ?? '';
    }
    else if (type === 'stop') {
        // Claude Code Stop hook doesn't expose token counts directly.
        // Read them from the transcript file (last assistant message with usage).
        const transcriptPath = hookData.transcript_path;
        if (transcriptPath) {
            try {
                const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n');
                for (let i = lines.length - 1; i >= 0; i--) {
                    try {
                        const entry = JSON.parse(lines[i]);
                        const msg = entry['message'];
                        const usage = (msg?.['usage'] ?? entry['usage']);
                        if (usage?.['input_tokens'] != null) {
                            event.tokens = {
                                input: usage['input_tokens'] ?? 0,
                                output: usage['output_tokens'] ?? 0,
                            };
                            break;
                        }
                    }
                    catch { /* malformed line, skip */ }
                }
            }
            catch { /* file unreadable, skip */ }
        }
    }
    return event;
}
/**
 * POST an event to the stage server. Fails silently — never blocks Claude Code.
 */
function sendEvent(event, port = PORT) {
    const body = JSON.stringify(event);
    const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 500,
    }, () => { });
    req.on('error', () => { });
    req.write(body);
    req.end();
}
if (require.main === module) {
    const type = process.argv[2];
    if (type) {
        let raw = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (chunk) => { raw += chunk; });
        process.stdin.on('end', () => {
            let hookData = {};
            try {
                hookData = JSON.parse(raw);
            }
            catch { }
            sendEvent(buildEvent(type, hookData), PORT);
        });
    }
}
