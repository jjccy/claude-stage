// Claude Stage – demo script
// Fires a scripted sequence of events to exercise all stage features.
// Run after pressing F5 to launch the Extension Development Host:
//
//   node scripts/demo.js

'use strict';

const http = require('http');
const PORT = 7891;

function post(event) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ ...event, timestamp: Date.now() });
    const req  = http.request({
      hostname: '127.0.0.1',
      port:     PORT,
      path:     '/',
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      const tool = event.tool ? ` / ${event.tool}` : '';
      console.log(`  ✓ ${event.type}${tool} → ${res.statusCode}`);
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

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  console.log('\n── Claude Stage demo ────────────────────────────────────\n');

  // 1. User prompt
  console.log('1. User prompt');
  await post({ type: 'user_prompt', text: 'Summarise this repo for me' });
  await wait(1200);

  // 2. Tool use + success flash (green glow)
  console.log('\n2. Tool success flash');
  await post({ type: 'tool_use',    tool: 'Read', phase: 'pre',  params: { file_path: 'package.json' } });
  await wait(800);
  await post({ type: 'tool_result', tool: 'Read', phase: 'post', success: true });
  await wait(1000);

  // 3. Tool failure shake (red shake)
  console.log('\n3. Tool failure shake');
  await post({ type: 'tool_use',    tool: 'Bash', phase: 'pre',  params: { command: 'bad-command --force' } });
  await wait(800);
  await post({ type: 'tool_result', tool: 'Bash', phase: 'post', success: false });
  await wait(1500);

  // 4. Agent hierarchy lines
  console.log('\n4. Agent hierarchy lines');
  await post({ type: 'tool_use', tool: 'Agent', phase: 'pre', params: { description: 'Explore src/' } });
  await wait(800);
  await post({ type: 'tool_use', tool: 'Agent', phase: 'pre', params: { description: 'Explore media/' } });
  await wait(1200);

  // 5. Stop with token data
  console.log('\n5. Token counter');
  await post({ type: 'stop', tokens: { input: 18500, output: 4200 } });
  await wait(1500);

  // 6. Second turn – tokens accumulate
  console.log('\n6. Second turn – token gauge grows');
  await post({ type: 'user_prompt', text: 'Now write tests for it' });
  await wait(800);
  await post({ type: 'tool_use',    tool: 'Grep', phase: 'pre',  params: { pattern: 'describe' } });
  await wait(600);
  await post({ type: 'tool_result', tool: 'Grep', phase: 'post', success: true });
  await wait(600);
  await post({ type: 'stop', tokens: { input: 24000, output: 6100 } });

  console.log('\n─────────────────────────────────────────────────────────\n');
  console.log('Done. Run  node scripts/demo.js  again to replay.');
  console.log('Use the "Claude Stage: Clear Stage" command to reset.\n');
}

run().catch(console.error);
