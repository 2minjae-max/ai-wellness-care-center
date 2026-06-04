import fs from 'fs';
import path from 'path';

const userHome = process.env.USERPROFILE || process.env.HOME || '';
const brainDir = path.join(userHome, '.gemini/antigravity/brain');
const outputDir = 'docs/conversation_logs';

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch (e) {
    return null;
  }
}

function maskSecrets(text) {
  if (!text) return text;
  // GCP API Key: AIzaSy로 시작하는 39글자 대소문자숫자 및 특수기호
  let masked = text.replace(/AIzaSy[A-Za-z0-9_\-]{33}/g, '[MASKED_GCP_API_KEY]');
  // GCP Service Account Key: AQ.Ab로 시작하는 패턴
  masked = masked.replace(/AQ\.Ab[A-Za-z0-9_\-]{20,80}/g, '[MASKED_GCP_SA_KEY]');
  // JWT / Supabase Key (eyJhbG...)
  masked = masked.replace(/eyJhbGciOi[A-Za-z0-9_\-\.]+/g, '[MASKED_JWT_TOKEN]');
  return masked;
}

function processSession(sessionId) {
  const sessionDir = path.join(brainDir, sessionId);
  const logFile = path.join(sessionDir, '.system_generated', 'logs', 'transcript.jsonl');
  
  if (!fs.existsSync(logFile)) return null;

  console.log(`Processing session: ${sessionId}`);
  const logContent = fs.readFileSync(logFile, 'utf8');
  const lines = logContent.split('\n');
  
  let markdownText = `# Conversation Log: ${sessionId}\n\n`;
  let firstUserQuery = "";
  let messageCount = 0;
  let lastUpdateTime = new Date(0);

  // 세션 디렉토리의 수정시간
  try {
    const stat = fs.statSync(logFile);
    lastUpdateTime = stat.mtime;
  } catch (e) {}

  lines.forEach((line) => {
    const data = parseJsonLine(line);
    if (!data) return;

    const source = data.source;
    const type = data.type;
    const content = data.content;

    if (type === 'USER_INPUT' && content) {
      const cleanContent = content.trim();
      if (!firstUserQuery) {
        firstUserQuery = cleanContent.slice(0, 80).replace(/\n/g, ' ');
      }
      markdownText += `### 👤 USER\n\n${cleanContent}\n\n`;
      messageCount++;
    } else if (source === 'MODEL' && content && type === 'PLANNER_RESPONSE') {
      const cleanContent = content.trim();
      markdownText += `### 🤖 ANTIGRAVITY\n\n${cleanContent}\n\n`;
      messageCount++;
    }
  });

  // 해당 세션에 walkthrough.md나 task.md가 있다면 요약본 뒤에 덧붙여서 가치 극대화
  const walkthroughPath = path.join(sessionDir, 'walkthrough.md');
  if (fs.existsSync(walkthroughPath)) {
    const wtContent = fs.readFileSync(walkthroughPath, 'utf8');
    markdownText += `\n---\n## 📋 작업 완료 내용 (Walkthrough)\n\n${wtContent}\n`;
  }

  // 마스킹 적용
  markdownText = maskSecrets(markdownText);
  const maskedFirstQuery = maskSecrets(firstUserQuery || "(빈 대화 또는 시스템 명령)");

  const outputFilePath = path.join(outputDir, `${sessionId}.md`);
  fs.writeFileSync(outputFilePath, markdownText, 'utf8');

  return {
    id: sessionId,
    firstQuery: maskedFirstQuery,
    messageCount,
    lastUpdate: lastUpdateTime
  };
}

function main() {
  if (!fs.existsSync(brainDir)) {
    console.error(`Brain directory not found at: ${brainDir}`);
    return;
  }

  const dirs = fs.readdirSync(brainDir);
  const sessions = [];

  dirs.forEach(dir => {
    // 36자리 UUID 형식의 폴더들이 대화 세션 폴더입니다.
    if (dir.length === 36 && dir.includes('-')) {
      const info = processSession(dir);
      if (info) {
        sessions.push(info);
      }
    }
  });

  // 최신 업데이트 시간 순으로 정렬
  sessions.sort((a, b) => b.lastUpdate - a.lastUpdate);

  // 통합 summary.md 생성 (에이전트가 캐싱할 가벼운 맥락 인덱스 파일)
  let summaryMd = `# 🧠 Antigravity AI Conversation History Index\n\n`;
  summaryMd += `이 문서는 워크스페이스 내에서 진행된 이전 대화록의 요약 인덱스입니다. 에이전트는 이 요약을 읽고 과거의 맥락과 구현 목표를 신속하게 인지해야 합니다. (자세한 로그는 각 링크를 참조하십시오.)\n\n`;
  summaryMd += `| 마지막 활동일시 | 대화 세션 ID | 대화 메시지 수 | 대표 첫 질문 및 주요 맥락 요약 |\n`;
  summaryMd += `| :--- | :--- | :--- | :--- |\n`;

  sessions.forEach(s => {
    const dateStr = s.lastUpdate.toISOString().replace('T', ' ').substring(0, 19);
    summaryMd += `| \`${dateStr}\` | [${s.id.substring(0, 8)}...](${s.id}.md) | ${s.messageCount} | ${s.firstQuery} |\n`;
  });

  fs.writeFileSync(path.join(outputDir, 'summary.md'), summaryMd, 'utf8');
  console.log(`\nAll conversation logs synchronized successfully!`);
  console.log(`Created docs/conversation_logs/summary.md with ${sessions.length} sessions.`);
}

main();
