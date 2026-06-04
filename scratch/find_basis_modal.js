import fs from 'fs';

const content = fs.readFileSync('index.html', 'utf8');
const lines = content.split('\n');
lines.forEach((l, i) => {
  if (l.includes('premium-basis-modal') || l.includes('보험료 산출 및 특약')) {
    console.log(`Line ${i + 1}: ${l.trim()}`);
  }
});
