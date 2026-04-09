'use strict';
const { buildEvent } = require('../../hooks/notify');

describe('buildEvent', () => {

  describe('tool_use', () => {
    it('sets type, tool, phase=pre, and params from hook data', () => {
      const ev = buildEvent('tool_use', {
        tool_name:  'Bash',
        tool_input: { command: 'ls -la' },
      });
      expect(ev.type).toBe('tool_use');
      expect(ev.tool).toBe('Bash');
      expect(ev.phase).toBe('pre');
      expect(ev.params).toEqual({ command: 'ls -la' });
    });

    it('defaults params to {} when tool_input is absent', () => {
      const ev = buildEvent('tool_use', { tool_name: 'Read' });
      expect(ev.params).toEqual({});
    });
  });

  describe('tool_result', () => {
    it('sets success=true when is_error is false', () => {
      const ev = buildEvent('tool_result', {
        tool_name:     'Bash',
        tool_response: { output: 'ok', is_error: false },
      });
      expect(ev.success).toBe(true);
    });

    it('sets success=false when is_error is true', () => {
      const ev = buildEvent('tool_result', {
        tool_name:     'Bash',
        tool_response: { output: 'command not found', is_error: true },
      });
      expect(ev.success).toBe(false);
    });

    it('sets success=false when tool_response.success is false', () => {
      const ev = buildEvent('tool_result', {
        tool_name:     'Write',
        tool_response: { success: false },
      });
      expect(ev.success).toBe(false);
    });

    it('defaults success=true when tool_response is absent', () => {
      const ev = buildEvent('tool_result', { tool_name: 'Read' });
      expect(ev.success).toBe(true);
    });
  });

  describe('user_prompt', () => {
    it('copies prompt into text', () => {
      const ev = buildEvent('user_prompt', { prompt: 'Hello world' });
      expect(ev.type).toBe('user_prompt');
      expect(ev.text).toBe('Hello world');
    });

    it('defaults text to empty string when prompt is absent', () => {
      const ev = buildEvent('user_prompt', {});
      expect(ev.text).toBe('');
    });
  });

  describe('stop', () => {
    it('reads token usage from transcript_path if available', () => {
      const os   = require('os');
      const fs   = require('fs');
      const path = require('path');

      const transcriptPath = path.join(os.tmpdir(), `transcript-${Date.now()}.jsonl`);
      fs.writeFileSync(transcriptPath, [
        JSON.stringify({ type: 'human',     message: { role: 'user', content: 'hi' } }),
        JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: 'hello',
          usage: { input_tokens: 1500, output_tokens: 300 } } }),
      ].join('\n'));

      const ev = buildEvent('stop', { transcript_path: transcriptPath });
      fs.unlinkSync(transcriptPath);

      expect(ev.tokens).toEqual({ input: 1500, output: 300 });
    });

    it('omits tokens when transcript_path is absent', () => {
      const ev = buildEvent('stop', {});
      expect(ev.tokens).toBeUndefined();
    });

    it('omits tokens when transcript file has no usage data', () => {
      const os   = require('os');
      const fs   = require('fs');
      const path = require('path');

      const transcriptPath = path.join(os.tmpdir(), `transcript-${Date.now()}.jsonl`);
      fs.writeFileSync(transcriptPath, JSON.stringify({ type: 'human', message: {} }));

      const ev = buildEvent('stop', { transcript_path: transcriptPath });
      fs.unlinkSync(transcriptPath);

      expect(ev.tokens).toBeUndefined();
    });

    it('omits tokens when transcript file does not exist', () => {
      const ev = buildEvent('stop', { transcript_path: '/nonexistent/path.jsonl' });
      expect(ev.tokens).toBeUndefined();
    });
  });

  it('always includes a numeric timestamp', () => {
    const before = Date.now();
    const ev = buildEvent('stop', {});
    expect(typeof ev.timestamp).toBe('number');
    expect(ev.timestamp).toBeGreaterThanOrEqual(before);
  });

});
