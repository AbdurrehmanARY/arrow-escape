import { readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const awardsDir = join(process.cwd(), 'assets', 'awards');
const files = readdirSync(awardsDir);

for (const file of files) {
  if (file.endsWith('.JPG')) {
    const oldPath = join(awardsDir, file);
    const newPath = join(awardsDir, file.replace(/\.JPG$/, '.jpg'));
    renameSync(oldPath, newPath);
    console.log(`Renamed ${file} -> ${file.replace(/\.JPG$/, '.jpg')}`);
  }
}
