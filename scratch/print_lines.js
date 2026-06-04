import fs from 'fs';
const html = fs.readFileSync('C:\\Users\\a2chi\\.gemini\\antigravity\\scratch\\ai-wellness-care-center\\index.html', 'utf8');

const indexes = [4457, 4562, 35136, 35150, 45994, 77598, 118725, 119001];

for (const idx of indexes) {
  const lineNo = html.substring(0, idx).split('\n').length;
  const line = html.split('\n')[lineNo - 1];
  console.log(`Index ${idx} is on line ${lineNo}: ${line.trim()}`);
}
