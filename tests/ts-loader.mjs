import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(projectRoot, 'src');

function resolveFile(basePath) {
  const extensions = ['', '.ts', '.tsx', '.js', '/index.ts', '/index.js'];
  for (const ext of extensions) {
    const candidate = basePath + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

export function resolve(specifier, context, nextResolve) {
  // Support next/* subpaths like next/cache and next/navigation
  if (specifier === 'next/cache') {
    return nextResolve(pathToFileURL(path.join(projectRoot, 'node_modules/next/cache.js')).href, context);
  }
  if (specifier === 'next/navigation') {
    return nextResolve(pathToFileURL(path.join(projectRoot, 'node_modules/next/navigation.js')).href, context);
  }

  if (specifier.startsWith('@/')) {
    const relativePart = specifier.slice(2);
    const candidatePath = path.join(srcDir, relativePart);
    const resolved = resolveFile(candidatePath);
    if (resolved) {
      return nextResolve(pathToFileURL(resolved).href, context);
    }
  }

  // Also handle relative imports without extension in ts files
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    if (context.parentURL && context.parentURL.startsWith('file:')) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const candidatePath = path.resolve(parentDir, specifier);
      const resolved = resolveFile(candidatePath);
      if (resolved) {
        return nextResolve(pathToFileURL(resolved).href, context);
      }
    }
  }

  return nextResolve(specifier, context);
}
