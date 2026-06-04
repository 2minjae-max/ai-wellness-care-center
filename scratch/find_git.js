import fs from 'fs';
import path from 'path';

const possiblePaths = [
  'C:\\Program Files\\Git\\cmd\\git.exe',
  'C:\\Program Files\\Git\\bin\\git.exe',
  'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
  'C:\\Users\\a2chi\\AppData\\Local\\Programs\\Git\\cmd\\git.exe',
  'C:\\Users\\a2chi\\AppData\\Local\\Programs\\Git\\bin\\git.exe',
];

for (const p of possiblePaths) {
  if (fs.existsSync(p)) {
    console.log(`FOUND: ${p}`);
  }
}
