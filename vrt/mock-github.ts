// GitHub GraphQL mock for VRT, serving the fixtures in test/fixtures.
//   swfz            -> default (last year), year-YYYY (with from), year-YYYY of `to` (with to only)
//   swfz-halloween  -> halloween-synthetic
//   anyone else     -> not-found
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const fixture = (name: string) => readFileSync(new URL(`../test/fixtures/${name}.json`, import.meta.url));

const fixtureName = (variables: { user?: string; from?: string; to?: string }): string => {
  if (variables.user === 'swfz-halloween') return 'halloween-synthetic';
  if (variables.user !== 'swfz') return 'not-found';
  if (variables.from) return `year-${variables.from.slice(0, 4)}`;
  if (variables.to) return `year-${variables.to.slice(0, 4)}`;
  return 'default';
};

createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    const { variables } = JSON.parse(body || '{}');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(fixture(fixtureName(variables ?? {})));
  });
}).listen(8000);
