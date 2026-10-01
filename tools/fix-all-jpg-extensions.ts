import { readdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

function fixDir(dirPath: string) {
  const entries = readdirSync(dirPath);
  for (const entry of entries) {
    const fullPath = join(dirPath, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      fixDir(fullPath);
    } else if (/\.(JPG|JPEG|PNG)$/.test(entry)) {
      const newName = entry.replace(/\.JPG$/, '.jpg').replace(/\.JPEG$/, '.jpeg').replace(/\.PNG$/, '.png');
      if (newName !== entry) {
        const newPath = join(dirPath, newName);
        renameSync(fullPath, newPath);
        console.log(`Renamed ${entry} -> ${newName}`);
      }
    }
  }
}

fixDir(join(process.cwd(), 'assets'));
