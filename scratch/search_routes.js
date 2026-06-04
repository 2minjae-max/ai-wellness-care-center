import fs from 'fs';

const content = fs.readFileSync('C:\\Users\\a2chi\\.gemini\\antigravity\\scratch\\ai-wellness-care-center\\server.ts', 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
  if (line.includes('nhis-sync-request') || line.includes('nhis-sync-confirm')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
