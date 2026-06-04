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
  
  const lineNo = html.substring(0, match.index).split('\n').length;
  
  if (isClose) {
    if (stack.length === 0) {
      console.log(`Dangling close tag </${tag}> on line ${lineNo}`);
    } else {
      const last = stack.pop();
      if (last.tag !== tag) {
        console.log(`Mismatch at line ${lineNo}: expected </${last.tag}> (from line ${last.lineNo}), got </${tag}>`);
      }
    }
  } else {
    stack.push({ tag, lineNo });
  }
}
