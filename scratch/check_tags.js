import fs from 'fs';
const html = fs.readFileSync('C:\\Users\\a2chi\\.gemini\\antigravity\\scratch\\ai-wellness-care-center\\index.html', 'utf8');

const regex = /<\/?([a-zA-Z0-9:-]+)(?:\s+[^>]*?)?>/g;
let match;
const stack = [];
const selfClosing = ['meta', 'link', 'br', 'hr', 'img', 'input', 'doctype'];

while ((match = regex.exec(html)) !== null) {
  const tag = match[1].toLowerCase();
  const isClose = match[0].startsWith('</');
  const isSelfClosing = match[0].endsWith('/>') || selfClosing.includes(tag);
  
  if (isSelfClosing) continue;
  
  if (isClose) {
    if (stack.length === 0) {
      console.log(`Mismatched close tag: </${tag}> at index ${match.index}`);
    } else {
      const last = stack.pop();
      if (last.tag !== tag) {
        console.log(`Mismatched tags: open <${last.tag}> (index ${last.index}) closed by </${tag}> (index ${match.index})`);
      }
    }
  } else {
    stack.push({ tag, index: match.index });
  }
}

console.log('Remaining open tags in stack:', stack.map(s => s.tag));
