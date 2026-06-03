import fs from "fs";
import path from "path";

const logDir = path.join("C:\\Users\\a2chi\\.gemini\\antigravity\\brain\\7977b00c-8c3e-48d1-a1bc-3b994bc69554\\.system_generated\\tasks");
console.log(`[Log-Monitor] Initializing log directory scan at: ${logDir}`);

let currentLogFile: string | null = null;
let lastSize = 0;

function findLatestLogFile(): string | null {
  try {
    if (!fs.existsSync(logDir)) return null;
    const files = fs.readdirSync(logDir)
      .filter(f => f.startsWith("task-") && f.endsWith(".log"))
      .map(f => ({
        name: f,
        time: fs.statSync(path.join(logDir, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);

    return files.length > 0 ? path.join(logDir, files[0].name) : null;
  } catch (e) {
    return null;
  }
}

function scanLog() {
  const latestFile = findLatestLogFile();
  if (!latestFile) return;

  if (latestFile !== currentLogFile) {
    currentLogFile = latestFile;
    lastSize = 0;
    console.log(`\n🔍 [Log-Monitor] Now monitoring new log file: ${path.basename(latestFile)}`);
  }

  try {
    const stats = fs.statSync(latestFile);
    if (stats.size > lastSize) {
      const fd = fs.openSync(latestFile, "r");
      const buffer = Buffer.alloc(stats.size - lastSize);
      fs.readSync(fd, buffer, 0, stats.size - lastSize, lastSize);
      fs.closeSync(fd);

      const newContent = buffer.toString("utf8");
      lastSize = stats.size;

      // 에러 패턴 감지 및 즉시 경고 출력
      const lines = newContent.split("\n");
      lines.forEach(line => {
        if (!line.trim()) return;
        
        let hasAlert = false;
        let alertMessage = "";

        if (line.includes("Error:") || line.includes("Exception") || line.includes("fail")) {
          hasAlert = true;
          alertMessage = "❌ [CRITICAL ERROR] 시스템 에러가 발생했습니다.";
        } else if (line.includes("redirect count exceeded") || line.includes("허용된 아이피가 아닙니다")) {
          hasAlert = true;
          alertMessage = "🔒 [IP WHITE-LIST BLOCK] CODEF 계정에서 현재 아이피가 차단되었습니다. 허용 아이피를 등록하세요.";
        } else if (line.includes("Automatically falling back to simulation mode")) {
          hasAlert = true;
          alertMessage = "⚠️ [AUTO-BYPASS] CODEF API 호출 장애로 인해 시뮬레이션 모드로 자동 우회되었습니다.";
        }

        if (hasAlert) {
          console.log("\n" + "=" .repeat(80));
          console.log(alertMessage);
          console.log(`상세 로그: ${line.trim()}`);
          console.log("=" .repeat(80) + "\n");
        } else {
          // 일반 로그는 작게 표시
          console.log(`[Server-Log] ${line.trim()}`);
        }
      });
    }
  } catch (err: any) {
    console.error(`[Log-Monitor] Error reading log file: ${err.message}`);
  }
}

// 2초마다 로그 스캔 진행
setInterval(scanLog, 2000);
scanLog();
