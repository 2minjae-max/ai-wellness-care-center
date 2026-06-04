import fs from 'fs';

const file = 'C:\\Users\\a2chi\\.gemini\\antigravity\\scratch\\ai-wellness-care-center\\src\\main.tsx';
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
  if (line.includes('nhis-sync-request') || line.includes('nhis-sync-confirm') || line.includes('도메인/IP 차단')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
