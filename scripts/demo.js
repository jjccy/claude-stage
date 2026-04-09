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
const http = __importStar(require("http"));
const PORT = 7891;
// Fires a scripted sequence of events to demo all three new features.
// Run AFTER pressing F5 to launch the Extension Development Host.
//
//   npx ts-node scripts/demo.ts
//   — or —
//   node scripts/demo.js   (after compiling)
function post(event) {
    return new Promise((resolve) => {
        const body = JSON.stringify({ ...event, timestamp: Date.now() });
        const req = http.request({
            hostname: '127.0.0.1',
            port: PORT,
            path: '/',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, (res) => {
            const tool = event['tool'] ? ` / ${event['tool']}` : '';
            console.log(`  ✓ ${event['type']}${tool} → ${res.statusCode}`);
            resolve();
        });
        req.on('error', (e) => {
            console.error(`  ✗ Could not reach server on port ${PORT}: ${e.message}`);
            resolve();
        });
        req.write(body);
        req.end();
    });
}
function wait(ms) {
    return new Promise(r => setTimeout(r, ms));
}
async function run() {
    console.log('\n── Claude Stage feature demo ────────────────────────────\n');
    // ── 1. User prompt ────────────────────────────────────────────
    console.log('1. User prompt');
    await post({ type: 'user_prompt', text: 'Summarise this repo for me' });
    await wait(1200);
    // ── 2. Normal tool use + SUCCESS flash ────────────────────────
    console.log('\n2. Tool success flash  (green glow on Claude)');
    await post({ type: 'tool_use', tool: 'Read', phase: 'pre', params: { file_path: 'package.json' } });
    await wait(800);
    await post({ type: 'tool_result', tool: 'Read', phase: 'post', success: true });
    await wait(1000);
    // ── 3. Tool FAILURE shake ─────────────────────────────────────
    console.log('\n3. Tool failure shake  (red shake + 😬 on Claude)');
    await post({ type: 'tool_use', tool: 'Bash', phase: 'pre', params: { command: 'bad-command --force' } });
    await wait(800);
    await post({ type: 'tool_result', tool: 'Bash', phase: 'post', success: false });
    await wait(1500);
    // ── 4. Agent spawn + hierarchy lines ─────────────────────────
    console.log('\n4. Agent hierarchy lines  (dashed lines Claude → agents)');
    await post({ type: 'tool_use', tool: 'Agent', phase: 'pre', params: { description: 'Explore src/' } });
    await wait(800);
    await post({ type: 'tool_use', tool: 'Agent', phase: 'pre', params: { description: 'Explore media/' } });
    await wait(1200);
    // ── 5. Stop with token data ───────────────────────────────────
    console.log('\n5. Token counter  (gauge fills in status bar)');
    await post({ type: 'stop', tokens: { input: 18500, output: 4200 } });
    await wait(1500);
    // ── 6. Second turn — tokens accumulate ───────────────────────
    console.log('\n6. Second turn — token gauge grows');
    await post({ type: 'user_prompt', text: 'Now write tests for it' });
    await wait(800);
    await post({ type: 'tool_use', tool: 'Grep', phase: 'pre', params: { pattern: 'describe' } });
    await wait(600);
    await post({ type: 'tool_result', tool: 'Grep', phase: 'post', success: true });
    await wait(600);
    await post({ type: 'stop', tokens: { input: 24000, output: 6100 } });
    console.log('\n────────────────────────────────────────────────────────\n');
    console.log('Done. Run  npx ts-node scripts/demo.ts  again to replay.');
    console.log('Use the "Claude Stage: Clear Stage" command to reset.\n');
}
run().catch(console.error);
