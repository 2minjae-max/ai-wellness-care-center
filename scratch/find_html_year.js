import fs from 'fs';

const content = fs.readFileSync('index.html', 'utf8');
const lines = content.split('\n');
lines.forEach((l, i) => {
  if (l.includes('trends-score-svg') || l.includes('trends-overall-score-indicator')) {
    console.log(`Line ${i + 1}: ${l.trim()}`);
  }
});
