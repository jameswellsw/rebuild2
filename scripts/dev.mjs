#!/usr/bin/env node
/**
 * Starts the API/room server and the Vite dev server together.
 * Keeps the two processes' output prefixed so failures are obvious.
 */
import { spawn } from 'node:child_process';
import process from 'node:process';

const procs = [];
function run(name, color, command, args, cwd) {
  const child = spawn(command, args, {
    cwd,
    shell: process.platform === 'win32',
    env: { ...process.env, FORCE_COLOR: '1' },
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  const prefix = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, target) => {
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) target.write(prefix + line + '\n');
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    console.log(prefix + `exited with code ${code}`);
    shutdown(code ?? 1);
  });
  procs.push(child);
  return child;
}

function shutdown(code = 0) {
  for (const p of procs) {
    if (!p.killed) p.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 250);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const root = new URL('..', import.meta.url).pathname;
run('server', '36', 'npm', ['run', 'dev', '-w', '@rebuilt/server'], root);
run('web', '35', 'npm', ['run', 'dev', '-w', '@rebuilt/web'], root);
