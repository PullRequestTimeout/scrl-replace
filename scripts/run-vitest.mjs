// Runs Vitest from a cwd whose Windows drive letter is uppercase (see vitest.config.ts).
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const cwd = process.cwd().replace(/^([a-z]):/, (_, d) => `${d.toUpperCase()}:`);
const result = spawnSync('npx', ['vitest', ...process.argv.slice(2)], {
	cwd,
	stdio: 'inherit',
	shell: true
});
process.exit(result.status ?? 1);
