import fs from 'fs';

const content = fs.readFileSync('src/main.tsx', 'utf8');
const lines = content.split('\n');

let startLine = -1;
let endLine = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('function switchYearSlide(')) {
    startLine = i + 1;
  }
  if (startLine !== -1 && lines[i].includes('function calculateHealthScore(')) {
    endLine = i; // calculateHealthScore의 바로 전 라인까지
    break;
  }
}

console.log(`switchYearSlide StartLine: ${startLine}`);
console.log(`switchYearSlide EndLine: ${endLine}`);
