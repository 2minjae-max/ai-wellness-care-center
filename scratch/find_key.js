import fs from 'fs';

const content = fs.readFileSync('src/main.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((l, i) => {
  if (l.includes('switchYearSlideByScore')) {
    console.log(`Line ${i + 1}: ${l.trim()}`);
    // 그 아래 10줄 출력
    for (let j = i + 1; j < i + 10; j++) {
      console.log(`  Line ${j + 1}: ${lines[j]}`);
    }
  }
});
