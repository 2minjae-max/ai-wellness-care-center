import fs from 'fs';

// 1. index.html 치환
const htmlFile = 'index.html';
const htmlContent = fs.readFileSync(htmlFile, 'utf8');
const htmlLines = htmlContent.split('\n');

const htmlStart = 1570; // Line 1571 (index 1570)
const htmlEnd = 1775;   // Line 1776 (index 1775)

const htmlReplacement = `    <!-- 📄 보험료 산출 및 특약 적정성 근거 팝업 모달 (전체화면 가독성 극대화 팝업) -->
    <div id="premium-basis-modal" class="hidden fixed inset-0 z-50 flex flex-col bg-white">
      <!-- 헤더 -->
      <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3 shrink-0">
        <div class="flex items-center gap-2">
          <div class="w-7 h-7 bg-[#fff5ee] rounded-lg text-[#f37321] flex items-center justify-center shrink-0">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 class="font-extrabold text-[#f37321] text-xs sm:text-sm truncate">보험료 산출 및 특약 가입적정성 근거</h3>
        </div>
        <button type="button" id="btn-close-premium-basis" class="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-lg transition-all cursor-pointer">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- 스크롤 가능한 본문 내용 (전체화면 확보를 위해 flex-1 overflow-y-auto 적용) -->
      <div class="flex-1 overflow-y-auto p-4 space-y-4 text-xs sm:text-sm text-slate-700">
        <div class="bg-[#fff5ee]/30 rounded-xl p-3 border border-[#f37321]/15 space-y-1">
          <div class="font-bold text-slate-900 text-xs">피보험자 맞춤 지표 기반 설계</div>
          <p class="text-[10px] text-slate-500 leading-relaxed break-keep" id="modal-premium-basis-intro">
            고객님의 최근 5개년 누적 검진 지표와 패밀리 유전 병력을 매칭하여 산출한 예방적 특약 비중입니다.
          </p>
        </div>

        <!-- 탭 버튼바 -->
        <div class="flex border border-slate-150 text-slate-505 text-[11px] font-bold bg-slate-50 p-0.5 rounded-lg mb-2 select-none">
          <button type="button" id="tab-btn-basis-coverages" class="flex-1 py-1.5 text-center rounded-md bg-white text-slate-900 shadow-3xs cursor-pointer basis-tab-btn active">담보별 사유</button>
          <button type="button" id="tab-btn-basis-formula" class="flex-1 py-1.5 text-center rounded-md hover:text-slate-800 cursor-pointer basis-tab-btn">산출 공식</button>
          <button type="button" id="tab-btn-basis-adequacy" class="flex-1 py-1.5 text-center rounded-md hover:text-slate-800 cursor-pointer basis-tab-btn">납입 적정성</button>
        </div>

        <!-- [탭 1] 담보별 사유 -->
        <div id="basis-content-coverages" class="space-y-3">
          <div class="space-y-3" id="modal-premium-basis-details">
            <!-- JS dynamic inject -->
          </div>
        </div>

        <!-- [탭 2] 산출 공식 및 계리요율 -->
        <div id="basis-content-formula" class="hidden space-y-3">
          <div class="bg-slate-50 border border-slate-150 rounded-xl p-3.5 space-y-2 text-left">
            <div class="font-bold text-slate-900 text-[11px]">⚙️ 공식 계리적 산출 공식</div>
            <div class="bg-white border border-slate-100 p-2.5 rounded-lg text-center font-mono text-[10px] text-slate-700 leading-normal">
              <div class="font-bold text-slate-900 mb-1">월 보험료 = 합계 (가입금액 × 요율)</div>
              <div class="text-[9px] text-slate-400">
                [기저 요율(40세)] × [연령지수] × [위험할증률] × [간편인수할증]
              </div>
            </div>
            
            <div class="text-[10px] text-slate-500 leading-relaxed font-medium space-y-1.5">
              <div>• <b>연령지수 (Age Factor):</b> 40세 기준(1.0)으로 매년 4.5%씩 복리 가중 적용됩니다. (30세는 약 0.55배, 50세는 약 1.45배)</div>
              <div>• <b>위험할증률 (Risk Surcharge):</b> 임상 검진 지표상 위험 수치 또는 직계 가족력 발견 시 15%~25%의 리스크 보장 할증이 산식에 가산됩니다.</div>
              <div>• <b>간편인수할증 (Simplified Surcharge):</b> 만성질환 정기 복약자(유병자)의 경우 가입조건 완화에 맞춰 약 +25% 할증률이 적용됩니다.</div>
            </div>
          </div>

          <!-- 공식 요율표 안내 -->
          <div class="border border-slate-150 rounded-xl overflow-hidden text-[10px] font-semibold text-slate-650">
            <table class="w-full text-center border-collapse">
              <thead>
                <tr class="bg-slate-50 border-b border-slate-200 text-slate-450 font-bold text-[9px]">
                  <th class="py-1.5 px-1 text-left pl-2.5">담보명</th>
                  <th class="py-1.5 px-1">남성(40세)</th>
                  <th class="py-1.5 px-1">여성(40세)</th>
                  <th class="py-1.5 px-1">할증조건</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 text-slate-600 bg-white">
                <tr>
                  <td class="py-1.5 px-1 text-left pl-2.5 font-bold text-slate-700">암 진단비 (1천만)</td>
                  <td class="py-1.5 px-1">6,800 원</td>
                  <td class="py-1.5 px-1">6,100 원</td>
                  <td class="py-1.5 px-1">가족력 또는 혈당 경계치</td>
                </tr>
                <tr>
                  <td class="py-1.5 px-1 text-left pl-2.5 font-bold text-slate-700">뇌관련 진단비 (1천만)</td>
                  <td class="py-1.5 px-1">4,800 원</td>
                  <td class="py-1.5 px-1">4,200 원</td>
                  <td class="py-1.5 px-1">가족력 또는 혈압 위험도</td>
                </tr>
                <tr>
                  <td class="py-1.5 px-1 text-left pl-2.5 font-bold text-slate-700">허혈성 진단비 (1천만)</td>
                  <td class="py-1.5 px-1">3,200 원</td>
                  <td class="py-1.5 px-1">2,800 원</td>
                  <td class="py-1.5 px-1">가족력 또는 혈압/고콜레</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- [탭 3] 가입 적정성 평가 -->
        <div id="basis-content-adequacy" class="hidden space-y-3">
          <div class="bg-slate-50 border border-slate-150 rounded-xl p-3.5 space-y-3.5 text-left">
            <div class="space-y-1">
              <div class="font-bold text-slate-900 text-[11px]">💳 가입 보험료의 재무적 적정성 검증</div>
              <p class="text-[10px] text-slate-450 leading-relaxed font-semibold">
                한국재무설계학회 및 금융감독원 권고 기준에 따르면, 전체 월 보험료는 가구 월 평균 실소득의 <b>5% ~ 8% 이내</b>로 포지셔닝해야 자금 사정의 제약 없이 장기 유지가 가능합니다.
              </p>
            </div>

            <!-- 가입 적정 게이지 그래프 -->
            <div class="space-y-1.5 bg-white p-3 rounded-lg border border-slate-100">
              <div class="flex justify-between items-center text-[10px] font-extrabold text-slate-600">
                <span>가구 소득 대비 추천 보험료 비중</span>
                <span id="adequacy-ratio-text" class="text-[#f37321]">약 1.8% (매우 안전)</span>
              </div>
              <!-- Progress bar -->
              <div class="w-full h-2 rounded-full bg-slate-100 overflow-hidden flex">
                <div id="adequacy-ratio-bar" class="h-full bg-emerald-500 rounded-full" style="width: 25%"></div>
              </div>
              <div class="flex justify-between items-center text-[8px] text-slate-400 font-bold px-0.5">
                <span>0%</span>
                <span>적정선 (5%~8%)</span>
                <span>초과 (10%+)</span>
              </div>
            </div>

            <div class="text-[10px] text-slate-500 leading-relaxed space-y-1 font-semibold">
              <div>• <b>보장 설계 수준:</b> 통상 3대 질병 진단비는 환자 본인 및 외벌이 기준 1.5년치 연봉 수준을 확보해야 완치 후 복귀 기간 동안 생계비 보전이 가능하여 <b>가입금액 3,000만원~5,000만원</b> 수준이 안전 기준선으로 평가됩니다.</div>
              <div>• <b>결론:</b> 현재 고객님의 추천 포트폴리오는 소득 대비 비중이 매우 낮아 <b>가입 유지에 따른 해지 리스크가 극히 최소화</b>된 우량한 적정 설계 포지셔닝입니다.</div>
            </div>
          </div>

          <!-- 건강 스코어 우량체 할인표 재배치 -->
          <div class="space-y-2">
            <div class="font-bold text-slate-900 text-xs flex items-center gap-1.5 pl-0.5">
              <span>🩺 한화손보 건강지표 우량체 할인 제도</span>
              <span id="modal-discount-badge" class="bg-emerald-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow-3xs">할인 미적용</span>
            </div>
            <table class="w-full text-center border-collapse text-[10px] font-semibold text-slate-650">
              <thead>
                <tr class="bg-slate-50 border-b border-slate-150 font-bold text-slate-400 text-[9px]">
                  <th class="py-1">종합 건강점수</th>
                  <th class="py-1">우량등급 구분</th>
                  <th class="py-1">특별 할인율</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 bg-white">
                <tr id="row-super-health" class="bg-white">
                  <td class="py-1.5 font-mono">90점 이상</td>
                  <td class="py-1.5">슈퍼 우량건강체</td>
                  <td class="py-1.5 text-emerald-600 font-bold">20% 할인 적용</td>
                </tr>
                <tr id="row-good-health" class="bg-white">
                  <td class="py-1.5 font-mono">80점 ~ 89점</td>
                  <td class="py-1.5">일반 우량건강체</td>
                  <td class="py-1.5 text-emerald-600 font-bold">10% 할인 적용</td>
                </tr>
                <tr id="row-fair-health" class="bg-white">
                  <td class="py-1.5 font-mono">70점 ~ 79점</td>
                  <td class="py-1.5">준우량건강체</td>
                  <td class="py-1.5 text-emerald-600 font-bold">5% 할인 적용</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 🔗 하단 공식 링크 바로가기 카드 배너 -->
        <div class="bg-indigo-50/40 border border-indigo-100 rounded-2xl p-3.5 space-y-2 text-left relative overflow-hidden">
          <div class="font-bold text-indigo-900 text-xs flex items-center gap-1.5">
            <svg class="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            한화손보 공식 공시실 약관 다운로드
          </div>
          <p class="text-[9px] text-slate-450 leading-relaxed font-semibold break-keep">
            아래 링크를 클릭하시면 해당 추천 상품의 상세 보장 범위, 제외 질병 규정, 해약환급금 및 약관 전문을 다운로드하여 법적 약관의 효력을 직접 조회할 수 있습니다.
          </p>
          <div class="grid grid-cols-2 gap-2 pt-1 relative z-10">
            <a id="modal-link-official-site" href="#" target="_blank" rel="noopener noreferrer" class="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg border border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-50 font-bold text-[10px] transition-all tracking-tight cursor-pointer text-center no-underline">
              공식 상품공시 정보
            </a>
            <a id="modal-link-pdf-guide" href="#" target="_blank" download class="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-bold text-[10px] transition-all tracking-tight cursor-pointer text-center no-underline">
              공식 약관 PDF
            </a>
          </div>
        </div>
      </div>

      <!-- 하단 확인 버튼 (하단 고정) -->
      <div class="p-4 border-t border-slate-100 shrink-0">
        <button type="button" id="btn-confirm-premium-basis" class="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl py-3 text-xs font-bold leading-none tracking-wide transition-all shadow-xs cursor-pointer">
          확인
        </button>
      </div>
    </div>`;

const newHtmlLines = [
  ...htmlLines.slice(0, htmlStart),
  htmlReplacement,
  ...htmlLines.slice(htmlEnd + 1)
];

fs.writeFileSync(htmlFile, newHtmlLines.join('\n'), 'utf8');
console.log('index.html updated successfully with fullscreen popup!');


// 2. main.tsx 치환 (scrollIntoView의 block: "start"를 block: "nearest"로)
const jsFile = 'src/main.tsx';
const jsContent = fs.readFileSync(jsFile, 'utf8');
const jsLines = jsContent.split('\n');

const jsStart = 3930; // Line 3931 (index 3930)
const jsEnd = 3936;   // Line 3937 (index 3936)

// 정확한 라인 매칭 검증
if (jsLines[3934].includes('chatHeader.scrollIntoView')) {
  const jsReplacement = `        // 💬 챗봇 탭 선택 시 상단 여백 보장을 위해 block: "nearest" 옵션으로 부드러운 스크롤 정렬
        setTimeout(() => {
          const chatHeader = $("section-chat-standalone");
          if (chatHeader) {
            chatHeader.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        }, 80);`;

  const newJsLines = [
    ...jsLines.slice(0, jsStart),
    jsReplacement,
    ...jsLines.slice(jsEnd + 1)
  ];

  fs.writeFileSync(jsFile, newJsLines.join('\n'), 'utf8');
  console.log('src/main.tsx updated successfully with block: "nearest" scroll!');
} else {
  console.error('Line mismatch in main.tsx! Finding scrollIntoView dynamically...');
  // 라인이 어긋났을 때 동적 매칭 치환
  jsLines.forEach((l, i) => {
    if (l.includes('chatHeader.scrollIntoView')) {
      // 해당 라인을 scrollIntoView block: nearest 로 바꿉니다.
      jsLines[i] = "            chatHeader.scrollIntoView({ behavior: 'smooth', block: 'nearest' });";
    }
  });
  fs.writeFileSync(jsFile, jsLines.join('\n'), 'utf8');
  console.log('src/main.tsx successfully refactored dynamically!');
}
