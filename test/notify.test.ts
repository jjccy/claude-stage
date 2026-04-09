import * as os   from 'os';
import * as fs   from 'fs';
import * as path from 'path';
import { buildEvent, HookData } from '../src/hook/notify';

describe('buildEvent', () => {

  describe('tool_use', () => {
    it('sets type, tool, phase=pre, and params from hook data', () => {
      const ev = buildEvent('tool_use', {
        tool_name:  'Bash',
        tool_input: { command: 'ls -la' },
      })!;
      expect(ev.type).toBe('tool_use');
      expect(ev.tool).toBe('Bash');
      expect(ev.phase).toBe('pre');
      expect(ev.params).toEqual({ command: 'ls -la' });
    });

    it('defaults params to {} when tool_input is absent', () => {
      const ev = buildEvent('tool_use', { tool_name: 'Read' })!;
      expect(ev.params).toEqual({});
    });
  });

  describe('tool_result', () => {
    it('sets success=true when is_error is false', () => {
      const ev = buildEvent('tool_result', {
        tool_name:     'Bash',
        tool_response: { output: 'ok', is_error: false },
      })!;
      expect(ev.success).toBe(true);
    });

    it('sets success=false when is_error is true', () => {
      const ev = buildEvent('tool_result', {
        tool_name:     'Bash',
        tool_response: { output: 'command not found', is_error: true },
      })!;
      expect(ev.success).toBe(false);
    });

    it('sets success=false when tool_response.success is false', () => {
      const ev = buildEvent('tool_result', {
        tool_name:     'Write',
        tool_response: { success: false },
      })!;
      expect(ev.success).toBe(false);
    });

    it('defaults success=true when tool_response is absent', () => {
      const ev = buildEvent('tool_result', { tool_name: 'Read' })!;
      expect(ev.success).toBe(true);
    });

    it('emits agent_done type for Agent tool', () => {
      const ev = buildEvent('tool_result', {
        tool_name:     'Agent',
        tool_response: { is_error: false },
      })!;
      expect(ev.type).toBe('agent_done');
      expect(ev.success).toBe(true);
    });

    it('emits agent_done with success=false when Agent tool errors', () => {
      const ev = buildEvent('tool_result', {
        tool_name:     'Agent',
        tool_response: { is_error: true },
      })!;
      expect(ev.type).toBe('agent_done');
      expect(ev.success).toBe(false);
    });
  });

  describe('user_prompt', () => {
    it('copies prompt into text', () => {
      const ev = buildEvent('user_prompt', { prompt: 'Hello world' })!;
      expect(ev.type).toBe('user_prompt');
      expect(ev.text).toBe('Hello world');
    });

    it('defaults text to empty string when prompt is absent', () => {
      const ev = buildEvent('user_prompt', {})!;
      expect(ev.text).toBe('');
    });

    it('returns null for XML-tagged system inputs (sub-agent tasks)', () => {
      expect(buildEvent('user_prompt', { prompt: '<task>do something</task>' })).toBeNull();
    });

    it('returns null for IDE context injections', () => {
      expect(buildEvent('user_prompt', { prompt: '<ide_opened_file>src/foo.ts</ide_opened_file>' })).toBeNull();
    });

    it('does not filter prompts that merely contain XML (not starting with it)', () => {
      const ev = buildEvent('user_prompt', { prompt: 'fix the <b>bug</b>' })!;
      expect(ev).not.toBeNull();
      expect(ev.text).toBe('fix the <b>bug</b>');
    });
  });

  describe('stop', () => {
    function makeTranscript(lines: unknown[]): string {
      const p = path.join(os.tmpdir(), `transcript-${Date.now()}.jsonl`);
      fs.writeFileSync(p, lines.map(l => JSON.stringify(l)).join('\n'));
      return p;
    }

    it('reads token usage from transcript_path if available', () => {
      const p = makeTranscript([
        { type: 'human',     message: { role: 'user', content: 'hi' } },
        { type: 'assistant', message: { role: 'assistant', content: 'hello',
            usage: { input_tokens: 1500, output_tokens: 300 } } },
      ]);
      const ev = buildEvent('stop', { transcript_path: p })!;
      fs.unlinkSync(p);
      expect(ev.tokens).toEqual({ input: 1500, output: 300 });
    });

    it('omits tokens when transcript_path is absent', () => {
      const ev = buildEvent('stop', {})!;
      expect(ev.tokens).toBeUndefined();
    });

    it('omits tokens when transcript has no usage data', () => {
      const p = makeTranscript([{ type: 'human', message: {} }]);
      const ev = buildEvent('stop', { transcript_path: p })!;
      fs.unlinkSync(p);
      expect(ev.tokens).toBeUndefined();
    });

    it('omits tokens when transcript file does not exist', () => {
      const ev = buildEvent('stop', { transcript_path: '/nonexistent/path.jsonl' })!;
      expect(ev.tokens).toBeUndefined();
    });
  });

  it('always includes a numeric timestamp', () => {
    const before = Date.now();
    const ev     = buildEvent('stop', {} as HookData)!;
    expect(typeof ev.timestamp).toBe('number');
    expect(ev.timestamp).toBeGreaterThanOrEqual(before);
  });

  it('includes sessionId equal to process.cwd()', () => {
    const ev = buildEvent('stop', {} as HookData)!;
    expect(ev.sessionId).toBe(process.cwd());
  });

});
