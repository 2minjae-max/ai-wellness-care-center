import fs from 'fs';

const file = 'index.html';
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

// index.html의 867라인(index 866)부터 954라인(index 953)까지 치환
const partStart = 866;
const partEnd = 953;

const replacement = `        <div id="section-trends" class="tab-section bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="space-y-1">
              <h3 class="font-extrabold text-slate-900 text-base">연도별 정밀 건강 지표 추이</h3>
              <p class="text-[#767676] text-xs">최근 5개년간의 국민건강보험 주요 지표들을 동일 단위 및 영역별로 일목요연하게 확인하세요.</p>
            </div>
          </div>

          <!-- 📊 연도별 종합 건강 점수 트렌드 차트 (SVG 기반 무결성 인라인 드로잉 영역) -->
          <div class="bg-gradient-to-br from-[#f8fafc] via-white to-[#f1f5f9] rounded-2xl p-4 shadow-xs space-y-3.5 border border-slate-200/80">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-slate-100">
              <div class="space-y-1">
                <h4 class="font-black text-slate-800 text-sm sm:text-base tracking-tight">종합 건강 점수 추이</h4>
                <p class="text-slate-500 text-[10px] sm:text-[11px] leading-relaxed break-keep">주요 6대 핵심 신체 지표들을 종합 분석한 연도별 건강 점수입니다.</p>
              </div>
              <div class="flex items-center justify-between sm:justify-end gap-2 bg-slate-100/75 sm:bg-transparent px-3 py-1.5 sm:p-0 rounded-xl w-full sm:w-auto self-stretch sm:self-auto shrink-0">
                <span class="text-slate-500 text-[10.5px] sm:text-[11.5px] font-bold">평균 건강 점수</span>
                <span id="trends-overall-score-indicator" class="text-xl sm:text-lg font-black text-[#f37321] font-mono leading-none">95점</span>
              </div>
            </div>
            
            <!-- SVG 차트 박스 (완벽 가변 너비 무결성 실시간 차트) -->
            <div class="relative w-full h-[155px] sm:h-[185px]" id="trends-score-chart-container">
              <svg id="trends-score-svg" class="w-full h-full overflow-visible" viewBox="0 0 500 150" preserveAspectRatio="xMidYMid meet">
                <!-- Javascript will draw line, glow, dots, texts dynamically -->
              </svg>
            </div>

            <!-- 하단 간략 분석 팁 -->
            <div class="bg-slate-100/60 border border-slate-200/60 rounded-xl p-2.5 flex items-start gap-2">
              <span class="text-xs shrink-0 mt-0.5">💡</span>
              <p class="text-slate-600 text-[11px] sm:text-xs leading-relaxed break-keep leading-snug">
                <span class="font-extrabold text-amber-500 font-bold">종합 진단 점수 의견:</span> 고객님의 건강 지표를 통합 산출한 결과, 최근 검진에서는 종합 <strong id="trends-current-score-text" class="text-[#f37321] font-extrabold">90점</strong>을 기록하셨습니다.
              </p>
            </div>
          </div>

          <!-- 📈 다이나믹 년도별 건강검진 카드 컨테이너 (이중 테두리/패딩 걷어내고 여백 정렬 일치) -->
          <div class="w-full space-y-4" id="trends-cards-flat-container">
            <div id="dynamic-timeline-chart" class="grid grid-cols-1 gap-4 w-full py-1">
              <!-- 각 지표별 독자적 플랫 카드가 동적으로 이식됩니다 -->
            </div>
          </div>
        </div>`;

const newLines = [
  ...lines.slice(0, partStart),
  replacement,
  ...lines.slice(partEnd + 1)
];

fs.writeFileSync(file, newLines.join('\n'), 'utf8');
console.log('index.html successfully updated to remove year selector and optimize paddings!');
