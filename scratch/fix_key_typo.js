import fs from 'fs';

const file = 'src/main.tsx';
let content = fs.readFileSync(file, 'utf8');
content = content.replace('key${hbVal.toFixed(1)}%', '${hbVal.toFixed(1)}%');
fs.writeFileSync(file, content, 'utf8');
console.log('Typo fixed successfully!');
