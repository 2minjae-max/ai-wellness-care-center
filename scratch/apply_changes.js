import fs from 'fs';

const file = 'src/main.tsx';
let content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

// 1. 2875라인부터 3033라인까지 치환 (index 2874 to 3032)
const part1Start = 2874;
const part1End = 3032;

const part1Replacement = `function updateCategoryUI(key: string, index: number, records: any[]) {
  // 인라인 년도 탭 구성으로 개별 UI 갱신은 필요 없어졌으나, 기존 코드 호환성을 위해 깡통 함수로 유지합니다.
}

(window as any).slideCategory = (key: string, direction: number) => {
  // 인라인 년도 탭 구성으로 개별 캐러셀 이동은 필요 없어졌으나, 기존 코드 호환성을 위해 깡통 함수로 유지합니다.
};

function bindCategoryScrollEvents() {
  // 인라인 년도 탭 구성으로 캐러셀 스크롤 이벤트 바인딩은 필요 없어졌으나, 기존 코드 호환성을 위해 깡통 함수로 유지합니다.
}

function switchYearSlide(index: number, pauseAuto = false) {
  const records = [...nhisRecords].sort((a, b) => b.year - a.year);
  const recordsCount = records.length;
  if (recordsCount === 0) return;

  let targetIndex = index;
  if (targetIndex < 0) {
    targetIndex = 0;
  } else if (targetIndex >= recordsCount) {
    targetIndex = recordsCount - 1;
  }

  currentYearSlideIndex = targetIndex;

  // 전체 트렌드 UI를 새롭게 그려 동기화
  renderTimelineChartNew();
  
  // 📈 기어 종합 점수 차트 싱크로 드로잉
  drawWellnessScoreChart();
}

function startYearCarouselAutoRotation() {
  // 개별 캐러셀 구성을 위해 자동 스크롤은 비활성화 처리합니다.
}

function stopYearCarouselAutoRotation() {
  // 개별 캐러셀 구성을 위해 자동 스크롤은 비활성화 처리합니다.
}`;

// 2. 3261라인부터 3703라인까지 치환 (index 3260 to 3702)
const part2Start = 3260;
const part2End = 3702;

const part2Replacement = `function renderTimelineChartNew() {
  const chartContainer = $("dynamic-timeline-chart");
  if (!chartContainer) return;

  // 가용 연도 순서 배치 최신 년도순으로 정렬
  const records = [...nhisRecords].sort((a, b) => b.year - a.year);
  if (records.length === 0) {
    chartContainer.innerHTML = \`
      <div class="w-full flex flex-col items-center justify-center py-12 text-slate-400">
        <svg class="w-12 h-12 mb-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span class="text-sm font-bold">인식된 건강 검진 이력 데이터가 없습니다.</span>
      </div>
    \`;
    return;
  }

  // 데이터가 없으면 다음으로 넘기지 않도록 안전 바운더리 클램핑
  if (currentYearSlideIndex >= records.length) {
    currentYearSlideIndex = records.length - 1;
  }
  if (currentYearSlideIndex < 0) {
    currentYearSlideIndex = 0;
  }

  // 델타 표시용 헬퍼 함수
  function renderDeltaPill(diff: number, isLowerBetter: boolean, unit: string = "") {
    if (diff > 0) {
      if (isLowerBetter) {
        return \`
          <span class="inline-flex items-center gap-0.5 text-[11px] font-black text-red-650 bg-red-55 border border-red-200 px-2 py-0.5 rounded leading-none">
            ▲ +\${diff.toFixed(1)}\${unit}
          </span>
        \`;
      } else {
        return \`
          <span class="inline-flex items-center gap-0.5 text-[11px] font-black text-emerald-600 bg-emerald-55 border border-emerald-250 px-2 py-0.5 rounded leading-none">
            ▲ +\${diff.toFixed(1)}\${unit}
          </span>
        \`;
      }
    } else if (diff < 0) {
      const absVal = Math.abs(diff);
      if (isLowerBetter) {
        return \`
          <span class="inline-flex items-center gap-0.5 text-[11px] font-black text-emerald-600 bg-emerald-55 border border-emerald-250 px-2 py-0.5 rounded leading-none">
            ▼ -\${absVal.toFixed(1)}\${unit}
          </span>
        \`;
      } else {
        return \`
          <span class="inline-flex items-center gap-0.5 text-[11px] font-black text-red-650 bg-red-55 border border-red-200 px-2 py-0.5 rounded leading-none">
            ▼ -\${absVal.toFixed(1)}\${unit}
          </span>
        \`;
      }
    } else {
      return \`
        <span class="inline-flex items-center text-[11px] font-bold text-slate-405 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded leading-none">
          ● 유지
        </span>
      \`;
    }
  }

  // 건강 등급 헬퍼
  function getStatusBadge(level: 1 | 2 | 3, label: string) {
    if (level === 1) {
      return \`<span class="text-[12px] sm:text-[13px] font-black bg-emerald-50 text-emerald-600 border border-emerald-100 px-2 py-1 rounded-md leading-none shadow-3xs">정상 (\${label})</span>\`;
    } else if (level === 2) {
      return \`<span class="text-[12px] sm:text-[13px] font-black bg-amber-50 text-amber-500 border border-amber-100 px-2 py-1 rounded-md leading-none shadow-3xs">주의 (\${label})</span>\`;
    } else {
      return \`<span class="text-[12px] sm:text-[13px] font-black bg-red-500 text-white border border-red-100 px-2 py-1 rounded-md animate-pulse leading-none shadow-3xs">경고 (\${label})</span>\`;
    }
  }

  // 5대 카테고리 정의
  const categories = [
    { key: "lipid", name: "🩸 혈액 지질 지표 (mg/dL)", border: "border-slate-200", bg: "bg-white", tip: "혈당 및 지질성 지표 총괄 관리", tipColor: "text-slate-500 bg-slate-50 border-slate-200/50" },
    { key: "bp", name: "💓 순환기 혈압 (mmHg)", border: "border-[#f37321]/45 ring-1 ring-[#f37321]/8", bg: "bg-[#fffdfb]/80", tip: "심장 압력 및 혈관계 부하 경감 유도", tipColor: "text-[#f37321] bg-orange-55 border-orange-100/50" },
    { key: "liver", name: "🧪 간세포 효소 수치 (U/L)", border: "border-slate-200", bg: "bg-white", tip: "아미노산 대사 지수 및 피로도 제어", tipColor: "text-emerald-600 bg-emerald-50 border-emerald-100/50" },
    { key: "body", name: "⚖️ 신체 계측 및 비율", border: "border-slate-200", bg: "bg-white", tip: "실질적 복부 지방도 분포 체크", tipColor: "text-amber-600 bg-amber-50 border-amber-100/50" },
    { key: "kidney", name: "🫁 신장 및 장기 핵심 안전망", border: "border-slate-200", bg: "bg-white", tip: "신장의 필터링 및 배설 원활도 지수", tipColor: "text-purple-600 bg-purple-50 border-purple-100/50" }
  ];

  let categoriesHtml = "";

  categories.forEach(cat => {
    const r = records[currentYearSlideIndex];
    const prevRecord = records[currentYearSlideIndex + 1];
    let metricContent = "";

    if (cat.key === "lipid") {
      const gVal = r.fastingGlucose ?? 95;
      const tcVal = r.totalCholesterol ?? 190;
      const tgVal = r.triglycerides ?? 130;
      const ldlVal = r.ldlcholesterol ?? 110;
      const hdlVal = r.hdlcholesterol ?? 50;

      const prevG = prevRecord ? (prevRecord.fastingGlucose ?? 95) : gVal;
      const prevTc = prevRecord ? (prevRecord.totalCholesterol ?? 190) : tcVal;
      const prevTg = prevRecord ? (prevRecord.triglycerides ?? 130) : tgVal;
      const prevLdl = prevRecord ? (prevRecord.ldlcholesterol ?? 110) : ldlVal;
      const prevHdl = prevRecord ? (prevRecord.hdlcholesterol ?? 50) : hdlVal;

      const getGlucoseStatus = (v: number) => {
        if (v < 100) return { label: "정상", level: 1 as const };
        if (v < 126) return { label: "전단계", level: 2 as const };
        return { label: "고혈당", level: 3 as const };
      };
      const getTcStatus = (v: number) => {
        if (v < 200) return { label: "적정", level: 1 as const };
        if (v < 240) return { label: "경계", level: 2 as const };
        return { label: "고콜레", level: 3 as const };
      };
      const getTgStatus = (v: number) => {
        if (v < 150) return { label: "적정", level: 1 as const };
        if (v < 200) return { label: "경계", level: 2 as const };
        return { label: "고중성", level: 3 as const };
      };

      const gStat = getGlucoseStatus(gVal);
      const tcStat = getTcStatus(tcVal);
      const tgStat = getTgStatus(tgVal);

      metricContent = \`
        <div class="divide-y divide-slate-100">
          <div class="flex items-center justify-between py-2">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">공복 혈당</span>
              <span class="text-base sm:text-lg font-black text-slate-800 font-mono tracking-tight mt-0.5">\${gVal} <span class="text-[10px] text-slate-400 font-normal">mg/dL</span></span>
            </div>
            <div class="flex items-center gap-1">
              \${prevRecord ? renderDeltaPill(gVal - prevG, true, "") : ""}
              \${getStatusBadge(gStat.level, gStat.label)}
            </div>
          </div>
          <div class="flex items-center justify-between py-2">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">총 콜레스테롤</span>
              <span class="text-sm sm:text-base font-bold text-slate-700 font-mono mt-0.5">\${tcVal} <span class="text-[10px] text-slate-400 font-normal">mg/dL</span></span>
            </div>
            <div class="flex items-center gap-1">
              \${prevRecord ? renderDeltaPill(tcVal - prevTc, true, "") : ""}
              \${getStatusBadge(tcStat.level, tcStat.label)}
            </div>
          </div>
          <div class="flex items-center justify-between py-2">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">중성 지방</span>
              <span class="text-sm sm:text-base font-bold text-slate-700 font-mono mt-0.5">\${tgVal} <span class="text-[10px] text-slate-400 font-normal">mg/dL</span></span>
            </div>
            <div class="flex items-center gap-1">
              \${prevRecord ? renderDeltaPill(tgVal - prevTg, true, "") : ""}
              \${getStatusBadge(tgStat.level, tgStat.label)}
            </div>
          </div>
          <div class="flex items-center justify-between py-2">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">LDL 콜레스테롤</span>
              <span class="text-xs sm:text-sm font-semibold text-slate-600 font-mono mt-0.5">\${ldlVal} mg/dL</span>
            </div>
            <div class="flex items-center">
              \${prevRecord ? renderDeltaPill(ldlVal - prevLdl, true, "") : ""}
            </div>
          </div>
          <div class="flex items-center justify-between py-2">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">HDL 콜레스테롤</span>
              <span class="text-xs sm:text-sm font-semibold text-slate-600 font-mono mt-0.5">\${hdlVal} mg/dL</span>
            </div>
            <div class="flex items-center">
              \${prevRecord ? renderDeltaPill(hdlVal - prevHdl, false, "") : ""}
            </div>
          </div>
        </div>
      \`;
    } else if (cat.key === "bp") {
      const sbpVal = r.systolicBP ?? 120;
      const dbpVal = r.diastolicBP ?? 80;
      const prevSbp = prevRecord ? (prevRecord.systolicBP ?? 120) : sbpVal;
      const prevDbp = prevRecord ? (prevRecord.diastolicBP ?? 80) : dbpVal;

      const getBPStatus = (s: number, d: number) => {
        if (s < 120 && d < 80) return { label: "정상 혈압", level: 1 as const };
        if (s < 140 || d < 90) return { label: "전고혈압", level: 2 as const };
        return { label: "고혈압", level: 3 as const };
      };
      const bpStat = getBPStatus(sbpVal, dbpVal);

      metricContent = \`
        <div class="divide-y divide-slate-100">
          <div class="flex items-center justify-between py-2.5">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">수축기/이완기 혈압</span>
              <span class="text-xl sm:text-2xl font-black text-slate-800 font-mono tracking-tight mt-0.5">\${sbpVal}/\${dbpVal} <span class="text-[10px] text-slate-400 font-normal">mmHg</span></span>
            </div>
            <div class="flex items-center">
              \${getStatusBadge(bpStat.level, bpStat.label)}
            </div>
          </div>
          <div class="flex items-center justify-between py-2">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">수축기 (최고혈압)</span>
              <span class="text-sm font-bold text-slate-700 font-mono mt-0.5">\${sbpVal} mmHg</span>
            </div>
            <div class="flex items-center">
              \${prevRecord ? renderDeltaPill(sbpVal - prevSbp, true, "") : ""}
            </div>
          </div>
          <div class="flex items-center justify-between py-2">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">이완기 (최저혈압)</span>
              <span class="text-sm font-bold text-slate-700 font-mono mt-0.5">\${dbpVal} mmHg</span>
            </div>
            <div class="flex items-center">
              \${prevRecord ? renderDeltaPill(dbpVal - prevDbp, true, "") : ""}
            </div>
          </div>
        </div>
      \`;
    } else if (cat.key === "liver") {
      const astVal = r.ast ?? 25;
      const altVal = r.alt ?? 25;
      const rgtpVal = r.rGtp ?? 30;
      const prevAst = prevRecord ? (prevRecord.ast ?? 25) : astVal;
      const prevAlt = prevRecord ? (prevRecord.alt ?? 25) : altVal;
      const prevRgtp = prevRecord ? (prevRecord.rGtp ?? 30) : rgtpVal;

      const getLiverStatus = (ast: number, alt: number, rgtp: number) => {
        const max = Math.max(ast, alt);
        if (max <= 40 && rgtp <= 64) return { label: "정상", level: 1 as const };
        if (max <= 60 || rgtp <= 100) return { label: "주의", level: 2 as const };
        return { label: "경고", level: 3 as const };
      };
      const liverStat = getLiverStatus(astVal, altVal, rgtpVal);

      metricContent = \`
        <div class="divide-y divide-slate-100">
          <div class="flex items-center justify-between py-2.5">
            <span class="text-xs sm:text-[13px] font-bold text-slate-500">간상태 분류</span>
            \${getStatusBadge(liverStat.level, liverStat.label)}
          </div>
          <div class="flex items-center justify-between py-2">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">AST</span>
              <span class="text-base sm:text-lg font-black text-slate-800 font-mono tracking-tight mt-0.5">\${astVal} <span class="text-[10px] text-slate-400 font-normal">U/L</span></span>
            </div>
            <div class="flex items-center">
              \${prevRecord ? renderDeltaPill(astVal - prevAst, true, "") : ""}
            </div>
          </div>
          <div class="flex items-center justify-between py-2">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">ALT (대사효소)</span>
              <span class="text-base sm:text-lg font-black text-slate-800 font-mono tracking-tight mt-0.5">\${altVal} <span class="text-[10px] text-slate-400 font-normal">U/L</span></span>
            </div>
            <div class="flex items-center">
              \${prevRecord ? renderDeltaPill(altVal - prevAlt, true, "") : ""}
            </div>
          </div>
          <div class="flex items-center justify-between py-2">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">r-GTP</span>
              <span class="text-sm font-semibold text-slate-700 font-mono mt-0.5">\${rgtpVal} U/L</span>
            </div>
            <div class="flex items-center">
              \${prevRecord ? renderDeltaPill(rgtpVal - prevRgtp, true, "") : ""}
            </div>
          </div>
        </div>
      \`;
    } else if (cat.key === "body") {
      const wtVal = r.weight ?? 68;
      const bmiVal = r.bmi ?? 22.5;
      const waistVal = r.waist ?? 82;
      const prevWt = prevRecord ? (prevRecord.weight ?? 68) : wtVal;
      const prevBmi = prevRecord ? (prevRecord.bmi ?? 22.5) : bmiVal;
      const prevWaist = prevRecord ? (prevRecord.waist ?? 82) : waistVal;

      const getBmiStatus = (bmi: number) => {
        if (bmi < 18.5) return { label: "저체중", level: 2 as const };
        if (bmi < 23.0) return { label: "정상", level: 1 as const };
        if (bmi < 25.0) return { label: "과체중", level: 2 as const };
        return { label: "비만", level: 3 as const };
      };
      const bmiStat = getBmiStatus(bmiVal);

      metricContent = \`
        <div class="divide-y divide-slate-100">
          <div class="flex items-center justify-between py-2.5">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">BMI 비만지수</span>
              <span class="text-lg sm:text-xl font-black text-slate-800 font-mono tracking-tight mt-0.5">\${bmiVal.toFixed(1)} <span class="text-[10px] text-slate-400 font-normal">kg/m²</span></span>
            </div>
            <div class="flex items-center">
              \${getStatusBadge(bmiStat.level, bmiStat.label)}
            </div>
          </div>
          <div class="flex items-center justify-between py-2">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">체중</span>
              <span class="text-base sm:text-lg font-black text-slate-800 font-mono tracking-tight mt-0.5">\${wtVal} <span class="text-[10px] text-slate-400 font-normal">kg</span></span>
            </div>
            <div class="flex items-center">
              \${prevRecord ? renderDeltaPill(wtVal - prevWt, true, "kg") : ""}
            </div>
          </div>
          <div class="flex items-center justify-between py-2">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">허리 둘레</span>
              <span class="text-sm font-semibold text-slate-700 font-mono mt-0.5">\${waistVal} cm</span>
            </div>
            <div class="flex items-center">
              \${prevRecord ? renderDeltaPill(waistVal - prevWaist, true, "") : ""}
            </div>
          </div>
        </div>
      \`;
    } else if (cat.key === "kidney") {
      const hbVal = r.hba1c ?? 5.4;
      const crVal = r.creatinine ?? 0.9;
      const egfrVal = r.egfr ?? 90;
      const prevHb = prevRecord ? (prevRecord.hba1c ?? 5.4) : hbVal;
      const prevCr = prevRecord ? (prevRecord.creatinine ?? 0.9) : crVal;
      const prevEgfr = prevRecord ? (prevRecord.egfr ?? 90) : egfrVal;

      const getKidneyStatus = (cr: number, egfr: number) => {
        if (cr <= 1.2 && egfr >= 90) return { label: "정상", level: 1 as const };
        if (cr <= 1.5 || egfr >= 60) return { label: "주의 요망", level: 2 as const };
        return { label: "저하", level: 3 as const };
      };
      const kidneyStat = getKidneyStatus(crVal, egfrVal);

      metricContent = \`
        <div class="divide-y divide-slate-100">
          <div class="flex items-center justify-between py-2">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">당화혈색소 (HbA1c)</span>
              <span class="text-base sm:text-lg font-black text-slate-800 font-mono tracking-tight mt-0.5">\key\${hbVal.toFixed(1)}%</span>
            </div>
            <div class="flex items-center">
              \${prevRecord ? renderDeltaPill(hbVal - prevHb, true, "%") : ""}
            </div>
          </div>
          <div class="flex items-center justify-between py-2">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">사구체여과율 (eGFR)</span>
              <span class="text-base sm:text-lg font-black text-slate-800 font-mono tracking-tight mt-0.5">\${egfrVal.toFixed(0)} <span class="text-[10px] text-slate-400 font-normal">mL/min</span></span>
            </div>
            <div class="flex items-center">
              \${prevRecord ? renderDeltaPill(egfrVal - prevEgfr, false, "") : ""}
            </div>
          </div>
          <div class="flex items-center justify-between py-2">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">크레아티닌</span>
              <span class="text-sm font-semibold text-slate-700 font-mono mt-0.5">\${crVal.toFixed(2)} mg/dL</span>
            </div>
            <div class="flex items-center">
              \${prevRecord ? renderDeltaPill(crVal - prevCr, true, "") : ""}
            </div>
          </div>
        </div>
      \`;
    }

    const miniTabsHtml = records.map((rec, idx) => {
      const isSelected = idx === currentYearSlideIndex;
      const activeClass = isSelected 
        ? "bg-[#f37321] text-white font-black shadow-3xs" 
        : "bg-slate-100 text-slate-500 hover:bg-slate-200";
      const yr = String(rec.year).slice(-2);
      return '<button type="button" class="shrink-0 whitespace-nowrap px-2 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ' + activeClass + '" onclick="window.switchYearSlideByScore(' + idx + ')">' + yr + '년</button>';
    }).join("");

    categoriesHtml += \`
      <!-- [\${cat.name}] 독자적 플랫 카드 -->
      <div id="carousel-\${cat.key}-card" class="rounded-2xl border \${cat.border} \${cat.bg} p-4 flex flex-col justify-between shadow-xs hover:shadow-sm transition-all space-y-3" style="box-sizing: border-box;">
        <div>
          <!-- 카드 헤더 및 개별 연도 표시 탭 -->
          <div class="flex items-center justify-between mb-3 pb-2 border-b border-slate-100 select-none gap-2 flex-wrap sm:flex-nowrap">
            <span class="text-xs sm:text-[13px] font-extrabold text-slate-800 shrink-0">
              \${cat.name}
            </span>
            <div class="flex items-center gap-1 overflow-x-auto scrollbar-none flex-nowrap shrink-0">
              \${miniTabsHtml}
            </div>
          </div>

          <!-- 플랫 지표 컨텐츠 -->
          <div class="w-full select-none py-1">
            \${metricContent}
          </div>
        </div>

        <!-- 하단 간편 팁 영역 -->
        <div class="pt-2 text-[10.5px] text-slate-400 font-medium flex items-start gap-1 select-none leading-relaxed border-t border-slate-100/60">
          <span class="shrink-0 text-[#f37321]">💡</span>
          <span class="break-keep text-slate-500">\${cat.tip}</span>
        </div>
      </div>
    \`;
  });

  chartContainer.className = "grid grid-cols-1 gap-4 w-full py-1";
  chartContainer.innerHTML = categoriesHtml;
  chartContainer.style.transform = "";

  // 상단 글로벌 캡슐 연도 버튼들 업데이트
  const indicatorsContainer = $("year-carousel-indicators-container");
  if (indicatorsContainer) {
    indicatorsContainer.innerHTML = records.map((r, idx) => {
      const isSelected = idx === currentYearSlideIndex;
      const activeClass = isSelected 
        ? "bg-gradient-to-r from-[#f37321] to-amber-500 text-white border border-transparent shadow-xs" 
        : "bg-white hover:bg-slate-100 text-slate-600 border border-slate-200";
      const yr = String(r.year).slice(-2);
      return '<button type="button" class="shrink-0 whitespace-nowrap text-center cursor-pointer transition-all duration-355 py-1.5 px-3.5 text-[11.5px] sm:text-[13px] font-black rounded-xl ' + activeClass + '" onclick="window.switchYearSlideByScore(' + idx + ')">' + yr + '년</button>';
    }).join("");
  }
}`;

// 치환 실행
const newLines = [
  ...lines.slice(0, part1Start),
  part1Replacement,
  ...lines.slice(part1End + 1, part2Start),
  part2Replacement,
  ...lines.slice(part2End + 1)
];

// 템플릿 치환 시 발생할 수 있는 \key 오타 등도 제거
let resultText = newLines.join('\n');
resultText = resultText.replace('\\key\\${hbVal.toFixed(1)}%', '${hbVal.toFixed(1)}%');

fs.writeFileSync(file, resultText, 'utf8');
console.log('src/main.tsx successfully refactored and flat-rendered!');
