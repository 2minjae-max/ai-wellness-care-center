import fs from 'fs';

const content = fs.readFileSync('C:\\Users\\a2chi\\.gemini\\antigravity\\scratch\\ai-wellness-care-center\\index.html', 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
  if (line.includes('간편본인인증') || line.includes('본인 정보 인증')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
