import { execSync } from 'child_process';

const options = {
  cwd: 'C:\\Users\\a2chi\\..gemini\\antigravity\\scratch\\ai-wellness-care-center',
  env: {
    ...process.env,
    PATH: `C:\\Program Files\\Git\\cmd;${process.env.PATH}`
  },
  stdio: 'inherit'
};

try {
  console.log('Running git commit...');
  execSync('git commit -m "fix: resolved footer layout, CODEF exception bypass, and built diagnostic HTML center"', {
    cwd: 'C:\\Users\\a2chi\\.gemini\\antigravity\\scratch\\ai-wellness-care-center',
    env: {
      ...process.env,
      PATH: `C:\\Program Files\\Git\\cmd;${process.env.PATH}`
    },
    stdio: 'inherit'
  });
  console.log('Running git push...');
  execSync('git push origin main', {
    cwd: 'C:\\Users\\a2chi\\.gemini\\antigravity\\scratch\\ai-wellness-care-center',
    env: {
      ...process.env,
      PATH: `C:\\Program Files\\Git\\cmd;${process.env.PATH}`
    },
    stdio: 'inherit'
  });
  console.log('Git commit and push completed successfully!');
} catch (err) {
  console.error('Git command failed:', err.message);
}
