import fs from 'fs';

const content = fs.readFileSync('src/main.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((l, i) => {
  if (l.includes('sub-tab-btn') || l.includes('scrollIntoView') || l.includes('scroll') || l.includes('tab-btn')) {
    console.log(`Line ${i + 1}: ${l.trim()}`);
  }
});
