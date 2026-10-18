import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
loadEnvConfig(root);
process.env.DATA_DIR = path.resolve(root, process.env.DATA_DIR || '.data');
process.env.HOSTNAME = process.env.NEWSROOM_BIND_HOST || '0.0.0.0';
await import(pathToFileURL(path.join(root, '.next/standalone/server.js')).href);
