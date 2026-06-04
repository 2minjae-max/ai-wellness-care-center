import fs from 'fs';

const filePath = 'C:\\Users\\a2chi\\.gemini\\antigravity\\scratch\\ai-wellness-care-center\\index.html';
let html = fs.readFileSync(filePath, 'utf8');

// We want to remove line 443: "            </div>\n"
// And line 463: "      </section>\n"
// Let's split by lines, remove the specific lines, and run the validator.
const lines = html.split('\n');

console.log('Original line 443:', lines[442]); // 0-indexed is 442
console.log('Original line 463:', lines[462]); // 0-indexed is 462

// Remove line 443
lines.splice(442, 1); // lines[442] is line 443

// Note: since we spliced, the old line 463 is now at 461
console.log('New line 462 (which was 463):', lines[461]);
lines.splice(461, 1); // remove it

const modifiedHtml = lines.join('\n');

// Now run the validation stack
const regex = /<\/?([a-zA-Z0-9:-]+)(?:\s+[^>]*?)?>/g;
let match;
const stack = [];
const selfClosing = ['meta', 'link', 'br', 'hr', 'img', 'input', 'doctype'];

let mismatches = 0;
while ((match = regex.exec(modifiedHtml)) !== null) {
  const tag = match[1].toLowerCase();
  const isClose = match[0].startsWith('</');
  const isSelfClosing = match[0].endsWith('/>') || selfClosing.includes(tag);
  
  if (isSelfClosing) continue;
  
  const lineNo = modifiedHtml.substring(0, match.index).split('\n').length;
  
  if (isClose) {
    if (stack.length === 0) {
      console.log(`Dangling close tag </${tag}> on line ${lineNo}`);
      mismatches++;
    } else {
      const last = stack.pop();
      if (last.tag !== tag) {
        console.log(`Mismatch at line ${lineNo}: expected </${last.tag}> (from line ${last.lineNo}), got </${tag}>`);
        mismatches++;
      }
    }
  } else {
    stack.push({ tag, lineNo });
  }
}

console.log(`Validation complete. Total mismatches: ${mismatches}`);
