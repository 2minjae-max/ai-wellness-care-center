/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NHISData, AIAnalysisResult, ChatMessage } from "../types";
import { $, $$, drawSparkline } from "../utils/chartHelper";

/**
 * 대시보드 및 챗봇 모듈이 전역 상태에 접근하고 상태를 변경할 수 있도록 돕는
 * 느슨한 결합(Loose Coupling)을 위한 Context 인터페이스 정의입니다.
 * 이 컨텍스트를 통해 main.tsx의 상태 값을 간접적으로 읽거나 업데이트합니다.
 */
export interface DashboardContext {
  getNhisRecords: () => any[];
  getUserName: () => string;
  getChatMessages: () => ChatMessage[];
  setChatMessages: (msgs: ChatMessage[]) => void;
  isChatLoading: () => boolean;
  setChatLoading: (loading: boolean) => void;
  getAccumulatedChatCostKrw: () => number;
  setAccumulatedChatCostKrw: (cost: number) => void;
  getAccumulatedChatTokens: () => number;
  setAccumulatedChatTokens: (tokens: number) => void;
  getUploadedFiles: () => any[];
  getAnalysisResult: () => AIAnalysisResult | null;
  isStep1Completed: () => boolean;
  isStep2Completed: () => boolean;
  getPrescriptionData: () => any;
  setPrescriptionData: (data: any) => void;
  uploadPrescriptionImage: (file: File) => Promise<any>;
  triggerRecalculateAnalysis: () => void;
}

/**
 * 1. CODEF 검진 데이터의 연도별 시계열 지표 및 종합 건강점수 렌더러
 * - 최근 5개년 건강검진 기록(nhisRecords)을 기반으로 점수를 환산합니다.
 * - 주요 4개 지표(혈압, 공복혈당, 총콜레스테롤, BMI)의 추이를 SVG 스파크라인 그래프로 드로잉합니다.
 * - 최근 대비 건강 상태의 시계열 브리핑 메시지를 자동 생성하여 화면에 표시합니다.
 */
export function renderCodefSummary(ctx: DashboardContext): void {
  const section = $("codef-summary-section");
  if (!section) return;

  const ownerEl = $("codef-summary-owner");
  if (ownerEl) {
    ownerEl.innerText = ctx.getUserName() || "고객";
  }

  const metricsList = $("codef-summary-metrics-list");
  const tableBody = $("codef-summary-table-body");
  const nhisRecords = ctx.getNhisRecords();

  if (!nhisRecords || nhisRecords.length === 0) {
    section.classList.add("hidden");
    return;
  }

  // 데이터 정조율: 연도 내림차순 (최신 정보가 맨 처음에 오도록 정렬)
  const sortedRecords = [...nhisRecords].sort((a, b) => b.year - a.year);
  const latest = sortedRecords[0];

  // [지표 1] 혈압 (Systolic/Diastolic BP) 기준 판별
  let bpLevel = "정상";
  let bpColor = "bg-emerald-50 text-emerald-700 border-emerald-200/60";
  let bpDesc = "혈압 수치가 안전 기준 내부 범위로 대폭 양호하며, 혈관 탄성도가 보장된 안정 상태입니다.";
  const sys = latest.systolicBP ?? 120;
  const dia = latest.diastolicBP ?? 80;
  if (sys >= 140 || dia >= 90) {
    bpLevel = "고혈압 의심";
    bpColor = "bg-rose-50 text-rose-700 border-rose-200/60";
    bpDesc = "연동된 연도 기준 고혈압 소견이 발견되었습니다. 한화손보 만성 합병 보장 설정을 함께 정진해보십시오.";
  } else if (sys >= 120 || dia >= 80) {
    bpLevel = "고혈압 전단계";
    bpColor = "bg-amber-50 text-amber-700 border-amber-200/60";
    bpDesc = "경계 신축 영역입니다. 일일 나트륨 권장량 제한(2,000mg 이하)식단과 웰니스 유산소가 수반됩니다.";
  }

  // [지표 2] 공복 식전혈당 (Fasting Glucose) 기준 판별
  let glLevel = "정상";
  let glColor = "bg-emerald-50 text-emerald-700 border-emerald-200/60";
  let glDesc = "당류 대사실행 능력이 견조하며, 인슐린 감수성이 지극히 정상 단계로 판단됩니다.";
  const gl = latest.fastingGlucose ?? 95;
  if (gl >= 126) {
    glLevel = "당뇨 의심";
    glColor = "bg-rose-50 text-rose-700 border-rose-200/60";
    glDesc = "식전 혈당 한계치를 초과하였습니다. 한화손보 요당/당뇨 맞춤 안심 보장 라인업으로 방어력을 정렬하십시오.";
  } else if (gl >= 100) {
    glLevel = "공복혈당장애 경계";
    glColor = "bg-amber-50 text-amber-700 border-amber-200/60";
    glDesc = "당뇨 전 단계 소견이 파싱되었습니다. 탄수화물 절식과 근력 트레이닝을 통한 체외 포도당 자원을 소급하십시오.";
  }

  // [지표 3] 총 콜레스테롤 (Total Cholesterol) 기준 판별
  let cholLevel = "정상";
  let cholColor = "bg-emerald-50 text-emerald-700 border-emerald-200/60";
  let cholDesc = "이상지질혈증 소요 리스크가 없는 맑고 투명한 혈행 탄력 조건이 지속되고 있습니다.";
  const chol = latest.totalCholesterol ?? 180;
  if (chol >= 240) {
    cholLevel = "고콜레스테롤";
    cholColor = "bg-rose-50 text-rose-700 border-rose-200/60";
    cholDesc = "고지혈 가속도가 염려됩니다. 불포화 지방 위주의 식단 교정 및 오메가 보조 인덱스 투여를 시작하세요.";
  } else if (chol >= 200) {
    cholLevel = "경계선 이상";
    cholColor = "bg-amber-50 text-amber-700 border-amber-200/60";
    cholDesc = "관상동맥 예방주의 단계입니다. 육류 섭취 제한 및 야채 위주 섬유질 공급율을 점차 늘려보시기 바랍니다.";
  }

  // [지표 4] 체질량 지수 (BMI) 기준 판별
  let bmiLevel = "정상";
  let bmiColor = "bg-emerald-50 text-emerald-700 border-emerald-200/60";
  let bmiDesc = "키 대비 몸무게 상관관계가 건강 표준 영역에 분포하며, 탁월한 기초 생리학적 골격을 대조 유지 중입니다.";
  const bmiVal = latest.bmi ?? 22.5;
  if (bmiVal >= 25) {
    bmiLevel = "비만군 분포";
    bmiColor = "bg-rose-50 text-rose-700 border-rose-200/60";
    bmiDesc = "비만형 대사 저하 주의 단계입니다. 주 150분 이상의 활동 지표 유입과 규칙적인 수면 스케줄을 유지하세요.";
  } else if (bmiVal >= 23) {
    bmiLevel = "과체중 주의";
    bmiColor = "bg-amber-50 text-amber-700 border-amber-200/60";
    bmiDesc = "조금 과중한 수치입니다. 유산소 스포츠 매개 활용 및 점진적인 섭취 칼로리 차단을 진행하십시오.";
  }

  // ----------------------------------------------------
  // 종합 건강 점수(Health Score) 계산 및 감점 사유 수집
  // ----------------------------------------------------
  let score = 100;
  const deductions: string[] = [];
  
  if (sys >= 140 || dia >= 90) {
    score -= 10;
    deductions.push("혈압 고혈압 의심(-10점)");
  } else if (sys >= 120 || dia >= 80) {
    score -= 4;
    deductions.push("혈압 경계(-4점)");
  }

  if (gl >= 126) {
    score -= 10;
    deductions.push("당뇨 의심(-10점)");
  } else if (gl >= 100) {
    score -= 4;
    deductions.push("공복혈당 경계(-4점)");
  }

  if (latest.hba1c !== undefined && latest.hba1c !== null) {
    if (latest.hba1c >= 6.5) {
      score -= 10;
      deductions.push("당화혈색소 고위험(-10점)");
    } else if (latest.hba1c >= 5.7) {
      score -= 4;
      deductions.push("당화혈색소 경계(-4점)");
    }
  }

  if (chol >= 240) {
    score -= 8;
    deductions.push("고콜레스테롤(-8점)");
  } else if (chol >= 200) {
    score -= 3;
    deductions.push("콜레스테롤 경계(-3점)");
  }

  if (latest.ldlcholesterol !== undefined && latest.ldlcholesterol !== null && latest.ldlcholesterol >= 160) {
    score -= 6;
    deductions.push("LDL콜레스테롤 높음(-6점)");
  }
  if (latest.triglycerides !== undefined && latest.triglycerides !== null && latest.triglycerides >= 200) {
    score -= 5;
    deductions.push("중성지방 높음(-5점)");
  }

  if (bmiVal >= 25) {
    score -= 7;
    deductions.push("비만(-7점)");
  } else if (bmiVal >= 23) {
    score -= 3;
    deductions.push("과체중 주의(-3점)");
  }

  if (latest.urineProtein && latest.urineProtein !== "음성" && latest.urineProtein !== "양성(-)") {
    score -= 10;
    deductions.push("요단백 이상(-10점)");
  }
  if (latest.egfr !== undefined && latest.egfr !== null && latest.egfr < 60) {
    score -= 8;
    deductions.push("신장기능 저하(-8점)");
  }
  if (latest.ast !== undefined && latest.ast !== null && (latest.ast >= 40 || (latest.alt ?? 0) >= 40)) {
    score -= 6;
    deductions.push("간수치 상승(-6점)");
  }

  if (score < 55) score = 55;

  let gradeText = "양호 (정상 범위 보존)";
  let gradeColor = "text-[#10b981]";
  if (score >= 90) {
    gradeText = "최상 (우수한 건강 관리)";
    gradeColor = "text-[#10b981]";
  } else if (score >= 80) {
    gradeText = "양호 (정상 범위 보존)";
    gradeColor = "text-amber-500";
  } else if (score >= 70) {
    gradeText = "주의 (생활 습관 교정 필요)";
    gradeColor = "text-orange-500";
  } else {
    gradeText = "집중 관리 (전문의 상담 권장)";
    gradeColor = "text-rose-500";
  }

  const scoreNumEl = $("codef-score-num");
  const scoreCircleEl = $("codef-score-circle");
  const gradeEl = $("codef-health-grade");
  const reasonSummaryEl = $("codef-score-reason-summary");

  if (scoreNumEl) scoreNumEl.innerText = score.toString();
  if (scoreCircleEl) {
    scoreCircleEl.setAttribute("stroke-dasharray", `${score}, 100`);
    if (score < 70) {
      scoreCircleEl.setAttribute("class", "text-rose-500 transition-all duration-1000 ease-out");
    } else if (score < 80) {
      scoreCircleEl.setAttribute("class", "text-orange-500 transition-all duration-1000 ease-out");
    } else if (score < 90) {
      scoreCircleEl.setAttribute("class", "text-amber-500 transition-all duration-1000 ease-out");
    } else {
      scoreCircleEl.setAttribute("class", "text-[#10b981] transition-all duration-1000 ease-out");
    }
  }
  if (gradeEl) {
    gradeEl.innerText = gradeText;
    gradeEl.className = `text-xs font-black ${gradeColor}`;
  }
  if (reasonSummaryEl) {
    if (deductions.length > 0) {
      reasonSummaryEl.innerText = `⚠️ 반영 요인: ${deductions.join(", ")}`;
      reasonSummaryEl.classList.remove("hidden");
    } else {
      reasonSummaryEl.innerText = "✨ 모든 검진 지표가 완전한 안전 범위 내에 조율되어 있습니다.";
      reasonSummaryEl.classList.remove("hidden");
    }
  }

  // ----------------------------------------------------
  // 실시간 시계열 건강 브리핑 빌더
  // ----------------------------------------------------
  let briefing = "";
  if (sortedRecords.length >= 2) {
    const oldest = sortedRecords[sortedRecords.length - 1];
    
    const bmiDiff = bmiVal - (oldest.bmi ?? bmiVal);
    let bmiTrendStr = "";
    if (bmiDiff > 0.5) {
      bmiTrendStr = `체중(BMI)이 과거 대비 증가 추세(현재 ${bmiVal.toFixed(1)})를 보여 식단과 활동량 관리가 필요합니다. `;
    } else if (bmiDiff < -0.5) {
      bmiTrendStr = `과거 대비 체중(BMI)이 ${Math.abs(bmiDiff).toFixed(1)} 감소하여 건강하게 조절되고 있습니다. `;
    } else {
      bmiTrendStr = `체중과 체질량지수(BMI)는 일정한 추이를 양호하게 유지하고 있습니다. `;
    }

    const oldGl = oldest.fastingGlucose ?? 95;
    let glTrendStr = "";
    if (gl >= 100) {
      if (gl > oldGl + 5) {
        glTrendStr = `공복혈당(${gl} mg/dL)이 과거(${oldGl} mg/dL)에 비해 뚜렷하게 상승하여 당대사 주의가 요망됩니다. `;
      } else {
        glTrendStr = `공복혈당(${gl} mg/dL)이 대사 경계에 머물러 있으므로 정제 탄수화물 절식이 필요합니다. `;
      }
    } else {
      glTrendStr = `공복혈당은 ${gl} mg/dL로 아주 안정적으로 인슐린 대사가 진행되고 있습니다. `;
    }

    let bpTrendStr = "";
    if (sys >= 130 || dia >= 85) {
      bpTrendStr = `혈압이 전단계 또는 고혈압 경계 범위로 측정되어 일상적인 나트륨 섭취 관리가 동반되어야 합니다.`;
    } else {
      bpTrendStr = `혈압 수치(${sys}/${dia} mmHg) 역시 정상 범위에 들어와 있습니다.`;
    }

    briefing = `${bmiTrendStr}${glTrendStr}${bpTrendStr}`;
  } else {
    let singleBrief = "";
    if (gl >= 100 || sys >= 130 || bmiVal >= 23) {
      singleBrief = `공복 식전혈당(${gl} mg/dL) 및 혈압(${sys}/${dia} mmHg) 등 일부 지표가 관리 주의 영역에 분포합니다. 식이 섬유 섭취를 늘리고 주 3회 이상의 유산소 활동을 시작해 보세요.`;
    } else {
      singleBrief = `대부분의 만성질환 기초 성적 지표가 이상적인 정상 수치 이내를 잘 충족하고 있습니다. 꾸준한 웰니스 식습관을 통해 현 상태를 잘 보존하십시오.`;
    }
    briefing = singleBrief;
  }

  const briefingEl = $("codef-health-briefing");
  if (briefingEl) {
    briefingEl.innerText = briefing;
  }

  if (metricsList) {
    metricsList.innerHTML = `
      <!-- 1. 혈압 -->
      <div class="bg-white border border-slate-100/80 rounded-xl p-3 flex flex-row justify-between items-center gap-2 shadow-xs transition-all hover:border-[#f37321]/20">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center shrink-0">
            <svg class="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <div>
            <div class="text-[11px] font-extrabold text-slate-800">최수 혈압 수치</div>
            <div class="text-[9px] text-[#767676] mt-0.5">${sys}/${dia} mmHg 기재 데이터 파싱 완료</div>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <div class="text-right">
            <span class="text-xs font-black text-slate-800">${sys}/${dia}</span>
            <span class="text-[9px] text-slate-400">mmHg</span>
          </div>
          <span class="inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${bpColor}">${bpLevel}</span>
        </div>
      </div>
      <p class="text-[10px] text-[#767676] pl-4 border-l-2 border-slate-200 leading-normal -mt-2.5 break-keep mb-3 font-semibold">${bpDesc}</p>

      <!-- 2. 혈당 -->
      <div class="bg-white border border-slate-100/80 rounded-xl p-3 flex flex-row justify-between items-center gap-2 shadow-xs transition-all hover:border-[#f37321]/20">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-orange-50 text-orange-500 flex items-center justify-center shrink-0">
            <svg class="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </div>
          <div>
            <div class="text-[11px] font-extrabold text-slate-800">공복 식전 혈당</div>
            <div class="text-[9px] text-[#767676] mt-0.5">${gl} mg/dL 인슐린 대조 유입 분석 완료</div>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <div class="text-right">
            <span class="text-xs font-black text-slate-800">${gl}</span>
            <span class="text-[9px] text-slate-400">mg/dL</span>
          </div>
          <span class="inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${glColor}">${glLevel}</span>
        </div>
      </div>
      <p class="text-[10px] text-[#767676] pl-4 border-l-2 border-slate-200 leading-normal -mt-2.5 break-keep mb-3 font-semibold">${glDesc}</p>

      <!-- 3. 콜레스테롤 -->
      <div class="bg-white border border-slate-100/80 rounded-xl p-3 flex flex-row justify-between items-center gap-2 shadow-xs transition-all hover:border-[#f37321]/20">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center shrink-0">
            <svg class="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
            </svg>
          </div>
          <div>
            <div class="text-[11px] font-extrabold text-slate-800">총 콜레스테롤</div>
            <div class="text-[9px] text-[#767676] mt-0.5">${chol} mg/dL 고화 지질 농도 안전 측정 연동</div>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <div class="text-right">
            <span class="text-xs font-black text-slate-800">${chol}</span>
            <span class="text-[9px] text-slate-400">mg/dL</span>
          </div>
          <span class="inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${cholColor}">${cholLevel}</span>
        </div>
      </div>
      <p class="text-[10px] text-[#767676] pl-4 border-l-2 border-slate-200 leading-normal -mt-2.5 break-keep mb-3 font-semibold">${cholDesc}</p>

      <!-- 4. 체질량지수 (BMI) -->
      <div class="bg-white border border-slate-100/80 rounded-xl p-3 flex flex-row justify-between items-center gap-2 shadow-xs transition-all hover:border-[#f37321]/20">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center shrink-0">
            <svg class="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
            </svg>
          </div>
          <div>
            <div class="text-[11px] font-extrabold text-slate-800">체질량 지수 (BMI)</div>
            <div class="text-[9px] text-[#767676] mt-0.5">${bmiVal.toFixed(1)} kg/㎡ 신장 대비 고유 비만 비율 대조</div>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <div class="text-right">
            <span class="text-xs font-black text-slate-800">${bmiVal.toFixed(1)}</span>
            <span class="text-[9px] text-slate-400">kg/㎡</span>
          </div>
          <span class="inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${bmiColor}">${bmiLevel}</span>
        </div>
      </div>
      <p class="text-[10px] text-[#767676] pl-4 border-l-2 border-slate-200 leading-normal -mt-2.5 break-keep mb-1.5 font-semibold">${bmiDesc}</p>
    `;
  }

  // 연도별 테이블 렌더러 (BMI 및 요단백 칼럼 결합 복구)
  if (tableBody) {
    tableBody.innerHTML = sortedRecords.map((rec) => {
      const bpStr = (rec.systolicBP && rec.diastolicBP)
        ? `<span class="whitespace-nowrap font-mono tracking-tighter text-[11px] text-slate-800">${rec.systolicBP}</span><span class="text-slate-400 text-[9px] font-semibold whitespace-nowrap">/${rec.diastolicBP} mmHg</span>`
        : `<span class="text-slate-300">-</span>`;
      const glucoseStr = rec.fastingGlucose 
        ? `${rec.fastingGlucose} <span class="text-slate-400 text-[9px] font-semibold">mg/dL</span>`
        : `<span class="text-slate-300">-</span>`;
      const cholStr = rec.totalCholesterol 
        ? `${rec.totalCholesterol} <span class="text-[#f37321]/60 text-[9px] font-semibold">mg/dL</span>`
        : `<span class="text-slate-300">-</span>`;
      const bmiStr = rec.bmi 
        ? `${rec.bmi.toFixed(1)} <span class="text-slate-400 text-[9px] font-semibold">kg/㎡</span>`
        : `<span class="text-slate-300">-</span>`;
      const urineStr = rec.urineProtein || `<span class="text-slate-300">-</span>`;

      return `
        <tr class="hover:bg-[#fff5ee]/40 transition-all font-semibold border-b border-slate-100 text-slate-700">
          <td class="py-3 font-extrabold text-[#767676]">${rec.year}년</td>
          <td class="py-3 px-1 text-center font-bold text-slate-800 whitespace-nowrap">${bpStr}</td>
          <td class="py-3 px-1 text-center font-bold text-slate-800">${glucoseStr}</td>
          <td class="py-3 px-1 text-center font-bold text-[#f37321]">${cholStr}</td>
          <td class="py-3 px-1 text-center font-bold text-slate-800">${bmiStr}</td>
          <td class="py-3 px-1 text-center font-bold text-slate-800">${urineStr}</td>
        </tr>
      `;
    }).join("");
  }

  // 📊 5개년 핵심 지표 스파크라인 차트 드로잉 연동
  drawSparkline("codef-chart-bp", "codef-chart-bp-val", sortedRecords.map(r => ({ year: r.year, value: r.systolicBP })), "#ef4444");
  drawSparkline("codef-chart-glucose", "codef-chart-glucose-val", sortedRecords.map(r => ({ year: r.year, value: r.fastingGlucose })), "#f97316");
  drawSparkline("codef-chart-cholesterol", "codef-chart-cholesterol-val", sortedRecords.map(r => ({ year: r.year, value: r.totalCholesterol })), "#eab308");
  drawSparkline("codef-chart-bmi", "codef-chart-bmi-val", sortedRecords.map(r => ({ year: r.year, value: r.bmi })), "#3b82f6");

  // 🎠 모바일 스파크라인 캐러샐 활성화
  initSparklineCarousels();

  section.classList.remove("hidden");
}

/**
 * 2. 업로드한 건강검진 임상 결과 리포트(PDF/소견서) 정밀 스캐닝 결과 요약
 * - 파싱 결과에 따라 지표별로 상세 정상/경계/경고 정보와 맞춤 가이드라인을 출력합니다.
 * - 파싱에 실패했을 경우, 체험 가이드라인과 예외 에러 상세창을 띄워 초보 사용자들의 동선을 보살핍니다.
 */
export function renderParsedFileSummary(ctx: DashboardContext): void {
  const metricsList = $("parsed-file-metrics-list");
  const tableBody = $("parsed-file-table-body");
  const ownerEl = $("parsed-file-summary-owner");

  if (ownerEl) {
    ownerEl.innerText = ctx.getUserName() || "이민재";
  }

  const uploadedFiles = ctx.getUploadedFiles();

  // 1. 모든 파일들 중 파싱 완료된 데이터 확인
  const parsedFiles = uploadedFiles.filter(f => !f.isParsing && f.metrics && !f.parseFailed);
  const isAllFailed = uploadedFiles.length > 0 && parsedFiles.length === 0;

  // 2. 만약 모든 파일이 파싱 실패했거나 검출 수치가 부재한 경우 에러 예외 화면 렌더링
  if (isAllFailed) {
    if (metricsList) {
      metricsList.innerHTML = `
        <div class="bg-red-50/70 border border-red-200/80 rounded-2xl p-5 text-center flex flex-col items-center justify-center gap-3 shadow-xs">
          <div class="w-12 h-12 rounded-full bg-red-100 text-red-500 flex items-center justify-center">
            <svg class="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div class="space-y-1.5 max-w-lg">
            <h4 class="text-sm font-extrabold text-red-900">⚠️ 실제 건강성적표 데이터 파싱 실패</h4>
            <p class="text-xs text-red-700 leading-relaxed break-keep font-medium">
              업로드하신 <b>${uploadedFiles.map(f => f.name).join(", ")}</b> 문서에서 혈압, 공복혈당, 총콜레스테롤, BMI 등 핵심 표준 검진 지표를 가독/추출하지 못했습니다.
            </p>
            <div class="text-[10px] text-red-500/90 text-left bg-white/70 border border-red-100 p-3 rounded-lg mt-2 font-mono whitespace-pre-wrap max-h-36 overflow-y-auto w-full">
<b>[추출 불가 상세 이유]</b>
${uploadedFiles.map(f => `• ${f.name}: ${f.parseErrorMessage || "국민건강보험 표준 검진 수치 포맷이 발견되지 않았습니다. (텍스트 미검출 혹은 이미지 파일)"}`).join("\n")}
            </div>
          </div>
        </div>

        <div class="bg-[#fff9f4] border border-orange-100 rounded-xl p-4 mt-2">
          <h4 class="text-[11px] font-bold text-[#f37321] flex items-center gap-1.5">
            💡 체험을 진행하기 위한 가이드라인
          </h4>
          <ul class="text-[10px] text-[#767676] mt-1.5 space-y-1 leading-relaxed pl-4 list-disc font-semibold">
            <li>우측 상단의 <b>[가이드라인 프리셋]</b>에서 '추가 처방지'나 '초음파 판독서' 등의 가주 종합 프리셋을 선택해 보세요. 즉시 파싱 플로우를 체험할 수 있습니다.</li>
            <li>혈압(예: <b>120/80</b>), 당(예: <b>공복혈당 115</b>), 콜레스테롤(예: <b>총콜레스테롤 210</b>) 텍스트가 인쇄된 PDF/텍스트 파일을 직접 업로드해주시면 자동 문자 스캐닝 가독 분석이 활성화됩니다.</li>
            <li>수치가 없으시더라도 하단의 <b>'Wellness Care AI Agent 융합 정밀 분석'</b> 버튼을 누르시면, 인공지능이 PDF 원장 본문 전문을 정밀 분석하여 맞춤 보고서 생성을 소생해냅니다!</li>
          </ul>
        </div>
      `;
    }

    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="4" class="py-8 text-center text-xs font-semibold text-slate-400 bg-slate-50/50 rounded-b-xl border-dashed border-2 border-slate-100">
            수집 가능한 검진 수치 텍스트가 발췌되지 않아 5개년 성적 시계열 추이 표를 그릴 수 없습니다.
          </td>
        </tr>
      `;
    }
    return;
  }

  // 3. 만약 파싱에 성공한 하나 이상의 검정 데이터가 있는 경우, 실제 해당 실합산 수치를 융합 렌더링
  let systolic = 120;
  let diastolic = 80;
  let glucose = 95;
  let cholesterol = 180;
  let bmiVal = 22.0;

  let isBPParsed = false;
  let isGlucoseParsed = false;
  let isCholesterolParsed = false;
  let isBmiParsed = false;

  parsedFiles.forEach(file => {
    if (file.metrics) {
      if (file.metrics.systolicBP && file.metrics.diastolicBP) {
        systolic = file.metrics.systolicBP;
        diastolic = file.metrics.diastolicBP;
        isBPParsed = true;
      }
      if (file.metrics.fastingGlucose) {
        glucose = file.metrics.fastingGlucose;
        isGlucoseParsed = true;
      }
      if (file.metrics.totalCholesterol) {
        cholesterol = file.metrics.totalCholesterol;
        isCholesterolParsed = true;
      }
      if (file.metrics.bmi) {
        bmiVal = file.metrics.bmi;
        isBmiParsed = true;
      }
    }
  });

  // 혈압 판별 소견
  let bpStatus = "정상 혈압";
  let bpBadgeClass = "bg-emerald-50 text-emerald-700 border-emerald-200/60";
  let bpMsg = "혈관 긴장도 및 압박 저항 수준이 아주 안정적입니다. 일상의 소금 섭취 조절과 유산소를 지속하세요.";

  if (systolic >= 140 || diastolic >= 90) {
    bpStatus = "고혈압 (2기/경고)";
    bpBadgeClass = "bg-red-50 text-red-700 border-red-200/60";
    bpMsg = "혈관 벽에 높은 압력이 가해지고 있어 집중 케어가 시급합니다. 즉시 정밀 약품 진단과 저나트륨 영양 수식을 배려하세요.";
  } else if (systolic >= 130 || diastolic >= 80) {
    bpStatus = "고혈압 (1기)";
    bpBadgeClass = "bg-orange-50 text-orange-700 border-orange-200/60";
    bpMsg = "혈관 긴장이 지속 누적된 기저 수치입니다. 매일 30분의 조깅과 저염 배식 습관을 전면 정착시켜 주십시오.";
  } else if (systolic >= 120) {
    bpStatus = "고혈압 전단계";
    bpBadgeClass = "bg-amber-50 text-amber-700 border-amber-200/50";
    bpMsg = "경계 신축 영역입니다. 일일 나트륨 권장량 제한(2,000mg 이하) 식단과 웰니스 유산소가 수반됩니다.";
  }

  // 혈당 판별 소견
  let glucoseStatus = "정상 혈당";
  let glucoseBadgeClass = "bg-emerald-50 text-emerald-700 border-emerald-200/60";
  let glucoseMsg = "췌장 인슐린 작용 및 혈관 속 혈당 흡수 효율이 매우 좋습니다. 현재의 클린 잡곡 배식을 유지하세요.";

  if (glucose >= 126) {
    glucoseStatus = "공복 고혈당 위험";
    glucoseBadgeClass = "bg-red-50 text-red-700 border-red-200/60";
    glucoseMsg = "만성 인슐린 저항성이 심화되어 정밀 가료가 제안되는 당 수치입니다. 당화혈색소 3개월 추이 점검을 병행하십시오.";
  } else if (glucose >= 100) {
    glucoseStatus = "공복혈당장애 경계";
    glucoseBadgeClass = "bg-amber-50 text-amber-700 border-amber-200/60";
    glucoseMsg = "당뇨 전 단계 소견이 파싱되었습니다. 탄수화물 절식과 근력 트레이닝을 통한 체외 포도당 자원을 소급하십시오.";
  }

  // 콜레스테롤 판별 소견
  let cholStatus = "정상 지질";
  let cholBadgeClass = "bg-emerald-50 text-emerald-700 border-emerald-200/60";
  let cholMsg = "이상지질혈증 소요 리스크가 없는 맑고 투명한 혈행 탄력 조건이 지속되고 있습니다.";

  if (cholesterol >= 240) {
    cholStatus = "고콜레스테롤 위험";
    cholBadgeClass = "bg-red-50 text-red-700 border-red-200/60";
    cholMsg = "중성 유리지질 과밀 상태로 동맥 경화 예방을 위해 포화지방 절제 및 불포화지방산 주입이 간절히 요망됩니다.";
  } else if (cholesterol >= 200) {
    cholStatus = "경계성 이상지질";
    cholBadgeClass = "bg-amber-50 text-amber-700 border-amber-200/60";
    cholMsg = "총지질 수치가 안전기준 상단을 야금야금 터치 중입니다. 등푸른 생선, 아보카도 등 오메가3 영양이 보약보다 우세합니다.";
  }

  // BMI 판별 소견
  let bmiStatus = "정상 체중";
  let bmiBadgeClass = "bg-emerald-50 text-emerald-700 border-emerald-200/60";
  let bmiMsg = "신장 대비 근골격 및 지방 대사가 매우 조화로운 정상 체중 범위가 연계되고 있습니다.";

  if (bmiVal >= 25.0) {
    bmiStatus = "비만 경고";
    bmiBadgeClass = "bg-red-50 text-red-700 border-[#ffccd5]";
    bmiMsg = "기저 대사를 위협하는 비만형 체중 범위입니다. 탄수화물 제한 배합과 고강도 유산소 훈련을 전격 추진하십시오.";
  } else if (bmiVal >= 23.0) {
    bmiStatus = "과체중 주의";
    bmiBadgeClass = "bg-amber-50 text-amber-700 border-amber-200/60";
    bmiMsg = "조금 과중한 수치입니다. 유산소 스포츠 매개 활용 및 점진적인 섭취 칼로리 차단을 진행하십시오.";
  } else if (bmiVal < 18.5) {
    bmiStatus = "저체중 관리";
    bmiBadgeClass = "bg-amber-50 text-amber-700 border-amber-200/60";
    bmiMsg = "기저 체중 미달선 관리 영역입니다. 양질의 단백질 대사의 점진 보강 요망.";
  }

  if (metricsList) {
    let cardsContent = "";
    
    // 이 검진에 혈압이 실시간 통과된 경우에만 출력
    if (isBPParsed) {
      cardsContent += `
        <!-- 지표 1: 최고/최저 혈압 수치 -->
        <div class="bg-white border border-slate-100 rounded-2xl p-4 flex flex-row justify-between items-center gap-3 shadow-xs hover:border-[#f37321]/20 transition-all font-semibold">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-red-50 text-[#f37321] flex items-center justify-center shrink-0 shadow-inner overflow-hidden">
              <svg class="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <div>
              <div class="text-xs font-black text-slate-800">최고/최저 혈압 수치 <span class='text-emerald-500 font-extrabold text-[10px] ml-1 bg-emerald-50 px-1 py-0.2 rounded'>🟢 가독성공</span></div>
              <div class="text-[10px] text-slate-400 mt-0.5">${systolic}/${diastolic} mmHg 기재 데이터 실시간 매칭 완료</div>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <div class="text-right">
              <span class="text-base font-black text-slate-900">${systolic}/${diastolic}</span>
              <span class="text-[10px] text-slate-400">mmHg</span>
            </div>
            <span class="inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${bpBadgeClass}">${bpStatus}</span>
          </div>
        </div>
        <p class="text-[10px] text-[#767676] pl-4 border-l-2 border-slate-200 leading-normal -mt-2.5 break-keep mb-3 font-semibold">${bpMsg}</p>
      `;
    }

    // 이 검진에 공복 식전 혈당이 실시간 통과된 경우에만 출력
    if (isGlucoseParsed) {
      cardsContent += `
        <!-- 지표 2: 공복 식전 혈당 -->
        <div class="bg-white border border-slate-100 rounded-2xl p-4 flex flex-row justify-between items-center gap-3 shadow-xs hover:border-[#f37321]/20 transition-all font-semibold">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center shrink-0 shadow-inner overflow-hidden">
              <svg class="w-5 h-5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <div>
              <div class="text-xs font-black text-slate-800">공복 식전 혈당 <span class='text-emerald-500 font-extrabold text-[10px] ml-1 bg-emerald-50 px-1 py-0.2 rounded'>🟢 가독성공</span></div>
              <div class="text-[10px] text-slate-400 mt-0.5">${glucose} mg/dL 인슐린 분비 대조 조율 검경</div>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <div class="text-right">
              <span class="text-base font-black text-slate-900">${glucose}</span>
              <span class="text-[10px] text-slate-400">mg/dL</span>
            </div>
            <span class="inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${glucoseBadgeClass}">${glucoseStatus}</span>
          </div>
        </div>
        <p class="text-[10px] text-[#767676] pl-4 border-l-2 border-slate-200 leading-normal -mt-2.5 break-keep mb-3 font-semibold">${glucoseMsg}</p>
      `;
    }

    // 이 검진에 총 콜레스테롤이 실시간 통과된 경우에만 출력
    if (isCholesterolParsed) {
      cardsContent += `
        <!-- 지표 3: 총 콜레스테롤 -->
        <div class="bg-white border border-slate-100 rounded-2xl p-4 flex flex-row justify-between items-center gap-3 shadow-xs hover:border-[#f37321]/20 transition-all font-semibold">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center shrink-0 shadow-inner overflow-hidden">
              <svg class="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div class="text-xs font-black text-slate-800">총 콜레스테롤 <span class='text-emerald-500 font-extrabold text-[10px] ml-1 bg-emerald-50 px-1 py-0.2 rounded'>🟢 가독성공</span></div>
              <div class="text-[10px] text-slate-400 mt-0.5">${cholesterol} mg/dL 고화 지질 누적 비례 대조</div>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <div class="text-right">
              <span class="text-base font-black text-slate-900">${cholesterol}</span>
              <span class="text-[10px] text-slate-400">mg/dL</span>
            </div>
            <span class="inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${cholBadgeClass}">${cholStatus}</span>
          </div>
        </div>
        <p class="text-[10px] text-[#767676] pl-4 border-l-2 border-slate-200 leading-normal -mt-2.5 break-keep mb-3 font-semibold">${cholMsg}</p>
      `;
    }

    // 이 검진에 체질량지수(BMI)가 실시간 통과된 경우에만 출력
    if (isBmiParsed) {
      cardsContent += `
        <!-- 지표 4: 체질량 지수 (BMI) -->
        <div class="bg-white border border-slate-100 rounded-2xl p-4 flex flex-row justify-between items-center gap-3 shadow-xs hover:border-[#f37321]/20 transition-all font-semibold">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center shrink-0 shadow-inner overflow-hidden">
              <svg class="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7H1.5M12 3v18m-6-3h12m-3-12l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9H13.5" />
              </svg>
            </div>
            <div>
              <div class="text-xs font-black text-slate-800">체질량 지수 (BMI) <span class='text-emerald-500 font-extrabold text-[10px] ml-1 bg-emerald-50 px-1 py-0.2 rounded'>🟢 가독성공</span></div>
              <div class="text-[10px] text-slate-400 mt-0.5">${bmiVal} kg/m² 고유 비만 비율 대시</div>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0 font-semibold">
            <div class="text-right">
              <span class="text-base font-black text-slate-900">${bmiVal}</span>
              <span class="text-[9px] text-[#767676]">kg/m²</span>
            </div>
            <span class="inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${bmiBadgeClass}">${bmiStatus}</span>
          </div>
        </div>
        <p class="text-[10px] text-[#767676] pl-4 border-l-2 border-slate-200 leading-normal -mt-2.5 break-keep mb-3 font-semibold">${bmiMsg}</p>
      `;
    }

    // 부가적인 지표 추가 렌더링 (지방간, HbA1c, C/D ratio 등)
    parsedFiles.forEach(file => {
      if (file.metrics) {
        if (file.metrics.fattyLiver && !cardsContent.includes("지방간 소견")) {
          cardsContent += `
            <div class="bg-white border border-slate-100 rounded-2xl p-4 flex flex-row justify-between items-center gap-3 shadow-xs hover:border-[#f37321]/20 transition-all font-semibold">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-orange-50 text-[#f37321] flex items-center justify-center shrink-0 shadow-inner overflow-hidden">
                  <svg class="w-5 h-5 text-[#f37321]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <div class="text-xs font-black text-slate-800">지방간 소견 (초음파) <span class='text-emerald-500 font-extrabold text-[10px] ml-1 bg-emerald-50 px-1 py-0.2 rounded'>🟢 가독성공</span></div>
                  <div class="text-[10px] text-slate-400 mt-0.5">상복부 초음파 검출 지방 관택 배합</div>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0 font-semibold">
                <span class="inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold border bg-amber-50 text-amber-700 border-amber-200/60 font-semibold">지방간 소견</span>
              </div>
            </div>
            <p class="text-[10px] text-[#767676] pl-4 border-l-2 border-slate-200 leading-normal -mt-2.5 break-keep mb-3 font-semibold font-semibold">상복부 간 초음파 상 경미한 지방간 음영이 매칭되었습니다. 식이량 정량화와 가벼운 조깅이 권유됩니다.</p>
          `;
        }
        if (file.metrics.hba1c && !cardsContent.includes("당화혈색소")) {
          cardsContent += `
            <div class="bg-white border border-slate-100 rounded-2xl p-4 flex flex-row justify-between items-center gap-3 shadow-xs hover:border-[#f37321]/20 transition-all font-semibold">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center shrink-0 shadow-inner overflow-hidden">
                  <svg class="w-5 h-5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <div>
                  <div class="text-xs font-black text-slate-800">당화혈색소 (HbA1c) <span class='text-emerald-500 font-extrabold text-[10px] ml-1 bg-emerald-50 px-1 py-0.2 rounded'>🟢 가독성공</span></div>
                  <div class="text-[10px] text-slate-400 mt-0.5">최근 3개월간 평균 혈당 누적지 기준</div>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0 font-semibold">
                <div class="text-right">
                  <span class="text-base font-black text-slate-900">${file.metrics.hba1c}</span>
                  <span class="text-[10px] text-slate-400">%</span>
                </div>
                <span class="inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold border bg-amber-50 text-amber-700 border-amber-200/60">${file.metrics.hba1c >= 5.7 ? "당뇨 전단계" : "기준내 정상"}</span>
              </div>
            </div>
            <p class="text-[10px] text-[#767676] pl-4 border-l-2 border-slate-200 leading-normal -mt-2.5 break-keep mb-3 font-semibold">장기 누적 혈색소 값이 ${file.metrics.hba1c}%로 관청됩니다. 단순 정제당과 당 탄수화물 과섭취 시비를 배려하십시오.</p>
          `;
        }
        if (file.metrics.cdRatio && !cardsContent.includes("시신경 안저 함몰비")) {
          cardsContent += `
            <div class="bg-white border border-slate-100 rounded-2xl p-4 flex flex-row justify-between items-center gap-3 shadow-xs hover:border-[#f37321]/20 transition-all font-semibold">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0 shadow-inner overflow-hidden">
                  <svg class="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </div>
                <div>
                  <div class="text-xs font-black text-slate-800">시신경 안저 함몰비 (C/D Ratio) <span class='text-emerald-500 font-extrabold text-[10px] ml-1 bg-emerald-50 px-1 py-0.2 rounded'>🟢 가독성공</span></div>
                  <div class="text-[10px] text-slate-400 mt-0.5">안저 촬영 소견 상 유두 시경 함몰 비율</div>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0 font-semibold">
                <div class="text-right">
                  <span class="text-base font-black text-slate-900">${file.metrics.cdRatio}</span>
                </div>
                <span class="inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold border bg-emerald-50 text-emerald-700 border-emerald-200/60 font-semibold">정상</span>
              </div>
            </div>
            <p class="text-[10px] text-[#767676] pl-4 border-l-2 border-slate-200 leading-normal -mt-2.5 break-keep mb-3 font-semibold">함몰비가 ${file.metrics.cdRatio} 수준으로 시신경 보종이 조절 하우 영역으로 지지됩니다.</p>
          `;
        }

        // ── 신규 추가 지표들 카드 렌더링 ──

        // 5-6. 간기능 AST
        if (file.metrics.ast !== undefined && !cardsContent.includes("간기능 AST")) {
          const astStatus = file.metrics.ast > 40 ? "주의" : "정상";
          const astBadge = file.metrics.ast > 40 ? "bg-amber-50 text-amber-700 border-amber-200/60" : "bg-emerald-50 text-emerald-700 border-emerald-200/60";
          cardsContent += `
            <div class="bg-white border border-slate-100 rounded-2xl p-4 flex flex-row justify-between items-center gap-3 shadow-xs hover:border-[#f37321]/20 transition-all font-semibold">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-purple-50 text-purple-500 flex items-center justify-center shrink-0 shadow-inner overflow-hidden">🧪</div>
                <div>
                  <div class="text-xs font-black text-slate-800">간기능 AST (SGOT) <span class='text-emerald-500 font-extrabold text-[10px] ml-1 bg-emerald-50 px-1 py-0.2 rounded'>🟢 가독성공</span></div>
                  <div class="text-[10px] text-slate-400 mt-0.5">간세포 손상 지표 (기준: 0~40 IU/L)</div>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0 font-semibold">
                <span class="text-base font-black text-slate-900">${file.metrics.ast}</span>
                <span class="text-[10px] text-slate-400">IU/L</span>
                <span class="inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${astBadge}">${astStatus}</span>
              </div>
            </div>
          `;
        }

        // 5-7. 간기능 ALT
        if (file.metrics.alt !== undefined && !cardsContent.includes("간기능 ALT")) {
          const altStatus = file.metrics.alt > 35 ? "주의" : "정상";
          const altBadge = file.metrics.alt > 35 ? "bg-amber-50 text-amber-700 border-amber-200/60" : "bg-emerald-50 text-emerald-700 border-emerald-200/60";
          cardsContent += `
            <div class="bg-white border border-slate-100 rounded-2xl p-4 flex flex-row justify-between items-center gap-3 shadow-xs hover:border-[#f37321]/20 transition-all font-semibold">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-purple-50 text-purple-500 flex items-center justify-center shrink-0 shadow-inner overflow-hidden">🧪</div>
                <div>
                  <div class="text-xs font-black text-slate-800">간기능 ALT (SGPT) <span class='text-emerald-500 font-extrabold text-[10px] ml-1 bg-emerald-50 px-1 py-0.2 rounded'>🟢 가독성공</span></div>
                  <div class="text-[10px] text-slate-400 mt-0.5">간세포 손상 지표 (기준: 0~35 IU/L)</div>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0 font-semibold">
                <span class="text-base font-black text-slate-900">${file.metrics.alt}</span>
                <span class="text-[10px] text-slate-400">IU/L</span>
                <span class="inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${altBadge}">${altStatus}</span>
              </div>
            </div>
          `;
        }

        // 5-8. r-GTP
        if (file.metrics.rGtp !== undefined && !cardsContent.includes("감마 GTP")) {
          const rgtpStatus = file.metrics.rGtp > 63 ? "주의" : "정상";
          const rgtpBadge = file.metrics.rGtp > 63 ? "bg-amber-50 text-amber-700 border-amber-200/60" : "bg-emerald-50 text-emerald-700 border-emerald-200/60";
          cardsContent += `
            <div class="bg-white border border-slate-100 rounded-2xl p-4 flex flex-row justify-between items-center gap-3 shadow-xs hover:border-[#f37321]/20 transition-all font-semibold">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-violet-50 text-violet-500 flex items-center justify-center shrink-0 shadow-inner overflow-hidden">🍷</div>
                <div>
                  <div class="text-xs font-black text-slate-800">감마 GTP (γ-GTP) <span class='text-emerald-500 font-extrabold text-[10px] ml-1 bg-emerald-50 px-1 py-0.2 rounded'>🟢 가독성공</span></div>
                  <div class="text-[10px] text-slate-400 mt-0.5">간/담도 알코올 대사 지표 (기준: 남 11~63 IU/L)</div>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0 font-semibold">
                <span class="text-base font-black text-slate-900">${file.metrics.rGtp}</span>
                <span class="text-[10px] text-slate-400">IU/L</span>
                <span class="inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${rgtpBadge}">${rgtpStatus}</span>
              </div>
            </div>
          `;
        }

        // 5-9~10. 크레아티닌 & eGFR
        if (file.metrics.creatinine !== undefined && !cardsContent.includes("크레아티닌")) {
          const crStatus = file.metrics.creatinine > 1.2 ? "주의" : "정상";
          const crBadge = file.metrics.creatinine > 1.2 ? "bg-amber-50 text-amber-700 border-amber-200/60" : "bg-emerald-50 text-emerald-700 border-emerald-200/60";
          cardsContent += `
            <div class="bg-white border border-slate-100 rounded-2xl p-4 flex flex-row justify-between items-center gap-3 shadow-xs hover:border-[#f37321]/20 transition-all font-semibold">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0 shadow-inner overflow-hidden">🫘</div>
                <div>
                  <div class="text-xs font-black text-slate-800">신장 크레아티닌 <span class='text-emerald-500 font-extrabold text-[10px] ml-1 bg-emerald-50 px-1 py-0.2 rounded'>🟢 가독성공</span></div>
                  <div class="text-[10px] text-slate-400 mt-0.5">신장 기능 대사 척도 (기준: 0.5~1.2 mg/dL)${file.metrics.egfr !== undefined ? ` · eGFR ${file.metrics.egfr} mL/min` : ""}</div>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0 font-semibold">
                <span class="text-base font-black text-slate-900">${file.metrics.creatinine}</span>
                <span class="text-[10px] text-slate-400">mg/dL</span>
                <span class="inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${crBadge}">${crStatus}</span>
              </div>
            </div>
          `;
        }

        // 5-11. 혈색소 (헤모글로빈)
        if (file.metrics.hemoglobin !== undefined && !cardsContent.includes("혈색소")) {
          const hbStatus = file.metrics.hemoglobin < 13.0 ? "빈혈 주의" : "정상";
          const hbBadge = file.metrics.hemoglobin < 13.0 ? "bg-amber-50 text-amber-700 border-amber-200/60" : "bg-emerald-50 text-emerald-700 border-emerald-200/60";
          cardsContent += `
            <div class="bg-white border border-slate-100 rounded-2xl p-4 flex flex-row justify-between items-center gap-3 shadow-xs hover:border-[#f37321]/20 transition-all font-semibold">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center shrink-0 shadow-inner overflow-hidden">🩸</div>
                <div>
                  <div class="text-xs font-black text-slate-800">혈색소 (Hemoglobin) <span class='text-emerald-500 font-extrabold text-[10px] ml-1 bg-emerald-50 px-1 py-0.2 rounded'>🟢 가독성공</span></div>
                  <div class="text-[10px] text-slate-400 mt-0.5">빈혈 여부 판단 기준 (남 13~17, 여 12~16 g/dL)</div>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0 font-semibold">
                <span class="text-base font-black text-slate-900">${file.metrics.hemoglobin}</span>
                <span class="text-[10px] text-slate-400">g/dL</span>
                <span class="inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${hbBadge}">${hbStatus}</span>
              </div>
            </div>
          `;
        }

        // 5-12~14. HDL, LDL, 중성지방 (지질 패널)
        if (file.metrics.hdlCholesterol !== undefined && !cardsContent.includes("HDL 콜레스테롤")) {
          cardsContent += `
            <div class="bg-white border border-slate-100 rounded-2xl p-4 flex flex-row justify-between items-center gap-3 shadow-xs hover:border-[#f37321]/20 transition-all font-semibold">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-green-50 text-green-500 flex items-center justify-center shrink-0 shadow-inner overflow-hidden">💚</div>
                <div>
                  <div class="text-xs font-black text-slate-800">HDL 콜레스테롤 <span class='text-emerald-500 font-extrabold text-[10px] ml-1 bg-emerald-50 px-1 py-0.2 rounded'>🟢 가독성공</span></div>
                  <div class="text-[10px] text-slate-400 mt-0.5">좋은 콜레스테롤 (기준: 60 이상 양호)</div>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0 font-semibold">
                <span class="text-base font-black text-slate-900">${file.metrics.hdlCholesterol}</span>
                <span class="text-[10px] text-slate-400">mg/dL</span>
                <span class="inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${file.metrics.hdlCholesterol >= 60 ? "bg-emerald-50 text-emerald-700 border-emerald-200/60" : "bg-amber-50 text-amber-700 border-amber-200/60"}">${file.metrics.hdlCholesterol >= 60 ? "양호" : "낮음 주의"}</span>
              </div>
            </div>
          `;
        }

        if (file.metrics.ldlCholesterol !== undefined && !cardsContent.includes("LDL 콜레스테롤")) {
          cardsContent += `
            <div class="bg-white border border-slate-100 rounded-2xl p-4 flex flex-row justify-between items-center gap-3 shadow-xs hover:border-[#f37321]/20 transition-all font-semibold">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center shrink-0 shadow-inner overflow-hidden">🧡</div>
                <div>
                  <div class="text-xs font-black text-slate-800">LDL 콜레스테롤 <span class='text-emerald-500 font-extrabold text-[10px] ml-1 bg-emerald-50 px-1 py-0.2 rounded'>🟢 가독성공</span></div>
                  <div class="text-[10px] text-slate-400 mt-0.5">나쁜 콜레스테롤 (기준: 130 이하 양호)</div>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0 font-semibold">
                <span class="text-base font-black text-slate-900">${file.metrics.ldlCholesterol}</span>
                <span class="text-[10px] text-slate-400">mg/dL</span>
                <span class="inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${file.metrics.ldlCholesterol <= 130 ? "bg-emerald-50 text-emerald-700 border-emerald-200/60" : "bg-red-50 text-red-700 border-red-200/60"}">${file.metrics.ldlCholesterol <= 130 ? "정상" : "위험"}</span>
              </div>
            </div>
          `;
        }

        if (file.metrics.triglycerides !== undefined && !cardsContent.includes("중성지방")) {
          cardsContent += `
            <div class="bg-white border border-slate-100 rounded-2xl p-4 flex flex-row justify-between items-center gap-3 shadow-xs hover:border-[#f37321]/20 transition-all font-semibold">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-yellow-50 text-yellow-600 flex items-center justify-center shrink-0 shadow-inner overflow-hidden">🫧</div>
                <div>
                  <div class="text-xs font-black text-slate-800">중성지방 (TG) <span class='text-emerald-500 font-extrabold text-[10px] ml-1 bg-emerald-50 px-1 py-0.2 rounded'>🟢 가독성공</span></div>
                  <div class="text-[10px] text-slate-400 mt-0.5">이상지질혈증 판정 (기준: 150 이하 정상)</div>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0 font-semibold">
                <span class="text-base font-black text-slate-900">${file.metrics.triglycerides}</span>
                <span class="text-[10px] text-slate-400">mg/dL</span>
                <span class="inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${file.metrics.triglycerides <= 150 ? "bg-emerald-50 text-emerald-700 border-emerald-200/60" : "bg-amber-50 text-amber-700 border-amber-200/60"}">${file.metrics.triglycerides <= 150 ? "정상" : "경계"}</span>
              </div>
            </div>
          `;
        }
      }
    });

    metricsList.innerHTML = cardsContent || `
      <div class="bg-amber-50/70 border border-amber-200 rounded-xl p-4 text-center">
        <p class="text-xs text-amber-800 font-bold">⚠️ 파싱된 핵심 혈압, 혈당, 콜레스테롤 등의 공단 수치가 발견되지 않았습니다. 프리셋을 선택하시거나 수치가 명기된 다른 성적서 PDF를 올려주십시오.</p>
      </div>
    `;
  }

  // 5. 연도별 실제 파싱한 데이터로만 Table Body 구성 (더미 지표 완전 배제 및 실제 파싱 파일들 정합)
  if (tableBody) {
    let rowsHtml = "";
    
    // Sort parsed files by their resolved checkup year descending
    const sortedParsedFiles = [...parsedFiles].sort((a, b) => {
      const yearA = a.metrics?.year || 2025;
      const yearB = b.metrics?.year || 2025;
      return yearB - yearA;
    });

    if (sortedParsedFiles.length === 0) {
      rowsHtml = `
        <tr>
          <td colspan="4" class="py-8 text-center text-xs font-semibold text-slate-400 bg-slate-50/50 rounded-b-xl border-dashed border-2 border-slate-100">
            실제로 성공적으로 파싱된 건강 성적표 데이터가 부재합니다.
          </td>
        </tr>
      `;
    } else {
      sortedParsedFiles.forEach(file => {
        const yrVal = file.metrics?.year || 2025;
        const bpStr = (file.metrics?.systolicBP && file.metrics?.diastolicBP)
          ? `${file.metrics.systolicBP} <span class="text-slate-400 text-[9px] font-semibold">/ ${file.metrics.diastolicBP} mmHg</span>`
          : `<span class="text-slate-300">-</span>`;
        const glucoseStr = file.metrics?.fastingGlucose 
          ? `${file.metrics.fastingGlucose} <span class="text-slate-400 text-[9px] font-semibold">mg/dL</span>`
          : `<span class="text-slate-300">-</span>`;
        const cholStr = file.metrics?.totalCholesterol 
          ? `${file.metrics.totalCholesterol} <span class="text-[#f37321]/60 text-[9px] font-semibold">mg/dL</span>`
          : `<span class="text-slate-300">-</span>`;
          
        rowsHtml += `
          <tr class="hover:bg-[#fff5ee]/40 transition-all font-semibold border-b border-slate-100 text-slate-700">
            <td class="py-3 font-extrabold text-[#767676]">${yrVal}년</td>
            <td class="py-3 text-center font-bold text-slate-800">${bpStr}</td>
            <td class="py-3 text-center font-bold text-slate-800">${glucoseStr}</td>
            <td class="py-3 text-center font-bold text-[#f37321]">${cholStr}</td>
          </tr>
        `;
      });
    }
    
    tableBody.innerHTML = rowsHtml;
  }

  // ----------------------------------------------------
  // 종합 건강 점수(Health Score) 계산 및 감점 사유 수집 (수동 파일 분석용)
  // ----------------------------------------------------
  let fileScore = 100;
  const fileDeductions: string[] = [];

  if (systolic >= 140 || diastolic >= 90) {
    fileScore -= 10;
    fileDeductions.push("혈압 고혈압 의심(-10점)");
  } else if (systolic >= 120 || diastolic >= 80) {
    fileScore -= 4;
    fileDeductions.push("혈압 경계(-4점)");
  }

  if (glucose >= 126) {
    fileScore -= 10;
    fileDeductions.push("당뇨 의심(-10점)");
  } else if (glucose >= 100) {
    fileScore -= 4;
    fileDeductions.push("공복혈당 경계(-4점)");
  }

  if (cholesterol >= 240) {
    fileScore -= 8;
    fileDeductions.push("고콜레스테롤(-8점)");
  } else if (cholesterol >= 200) {
    fileScore -= 3;
    fileDeductions.push("콜레스테롤 경계(-3점)");
  }

  if (bmiVal >= 25.0) {
    fileScore -= 7;
    fileDeductions.push("비만(-7점)");
  } else if (bmiVal >= 23.0) {
    fileScore -= 3;
    fileDeductions.push("과체중 주의(-3점)");
  }

  parsedFiles.forEach(file => {
    if (file.metrics) {
      if (file.metrics.hba1c !== undefined && file.metrics.hba1c !== null) {
        if (file.metrics.hba1c >= 6.5 && !fileDeductions.includes("당화혈색소 고위험(-10점)")) {
          fileScore -= 10;
          fileDeductions.push("당화혈색소 고위험(-10점)");
        } else if (file.metrics.hba1c >= 5.7 && !fileDeductions.includes("당화혈색소 경계(-4점)")) {
          fileScore -= 4;
          fileDeductions.push("당화혈색소 경계(-4점)");
        }
      }
      if (file.metrics.ldlCholesterol !== undefined && file.metrics.ldlCholesterol !== null && file.metrics.ldlCholesterol >= 160 && !fileDeductions.includes("LDL콜레스테롤 높음(-6점)")) {
        fileScore -= 6;
        fileDeductions.push("LDL콜레스테롤 높음(-6점)");
      }
      if (file.metrics.triglycerides !== undefined && file.metrics.triglycerides !== null && file.metrics.triglycerides >= 200 && !fileDeductions.includes("중성지방 높음(-5점)")) {
        fileScore -= 5;
        fileDeductions.push("중성지방 높음(-5점)");
      }
      if (file.metrics.urineProtein && file.metrics.urineProtein !== "음성" && file.metrics.urineProtein !== "양성(-)" && !fileDeductions.includes("요단백 이상(-10점)")) {
        fileScore -= 10;
        fileDeductions.push("요단백 이상(-10점)");
      }
      if (file.metrics.egfr !== undefined && file.metrics.egfr !== null && file.metrics.egfr < 60 && !fileDeductions.includes("신장기능 저하(-8점)")) {
        fileScore -= 8;
        fileDeductions.push("신장기능 저하(-8점)");
      }
      if (file.metrics.ast !== undefined && file.metrics.ast !== null && (file.metrics.ast >= 40 || (file.metrics.alt ?? 0) >= 40) && !fileDeductions.includes("간수치 상승(-6점)")) {
        fileScore -= 6;
        fileDeductions.push("간수치 상승(-6점)");
      }
    }
  });

  if (fileScore < 55) fileScore = 55;

  let fileGradeText = "양호 (정상 범위 보존)";
  let fileGradeColor = "text-[#10b981]";
  if (fileScore >= 90) {
    fileGradeText = "최상 (우수한 건강 관리)";
    fileGradeColor = "text-[#10b981]";
  } else if (fileScore >= 80) {
    fileGradeText = "양호 (정상 범위 보존)";
    fileGradeColor = "text-amber-500";
  } else if (fileScore >= 70) {
    fileGradeText = "주의 (생활 습관 교정 필요)";
    fileGradeColor = "text-orange-500";
  } else {
    fileGradeText = "집중 관리 (전문의 상담 권장)";
    fileGradeColor = "text-rose-500";
  }

  const fileScoreNumEl = $("parsed-file-score-num");
  const fileScoreCircleEl = $("parsed-file-score-circle");
  const fileGradeEl = $("parsed-file-health-grade");
  const fileReasonSummaryEl = $("parsed-file-score-reason-summary");
  const fileBriefingEl = $("parsed-file-health-briefing");

  if (fileScoreNumEl) fileScoreNumEl.innerText = fileScore.toString();
  if (fileScoreCircleEl) {
    fileScoreCircleEl.setAttribute("stroke-dasharray", `${fileScore}, 100`);
    if (fileScore < 70) {
      fileScoreCircleEl.setAttribute("class", "text-rose-500 transition-all duration-1000 ease-out");
    } else if (fileScore < 80) {
      fileScoreCircleEl.setAttribute("class", "text-orange-500 transition-all duration-1000 ease-out");
    } else if (fileScore < 90) {
      fileScoreCircleEl.setAttribute("class", "text-amber-500 transition-all duration-1000 ease-out");
    } else {
      fileScoreCircleEl.setAttribute("class", "text-[#10b981] transition-all duration-1000 ease-out");
    }
  }
  if (fileGradeEl) {
    fileGradeEl.innerText = fileGradeText;
    fileGradeEl.className = `text-xs font-black ${fileGradeColor}`;
  }
  if (fileReasonSummaryEl) {
    if (fileDeductions.length > 0) {
      fileReasonSummaryEl.innerText = `⚠️ 반영 요인: ${fileDeductions.join(", ")}`;
      fileReasonSummaryEl.classList.remove("hidden");
    } else {
      fileReasonSummaryEl.innerText = "✨ 모든 검진 지표가 완전한 안전 범위 내에 조율되어 있습니다.";
      fileReasonSummaryEl.classList.remove("hidden");
    }
  }
  if (fileBriefingEl) {
    let brief = "";
    if (glucose >= 100) brief += `공복 혈당(${glucose} mg/dL)이 경계 이상이므로 정제당 식습관 개선이 권고됩니다. `;
    else brief += `공복 식전 혈당은 ${glucose} mg/dL로 정상 안정 대사 진행 중입니다. `;
    
    if (systolic >= 130 || diastolic >= 85) brief += `혈압 수치(${systolic}/${diastolic} mmHg) 관리를 위해 나트륨 제한이 수반되어야 합니다. `;
    else brief += `혈압(${systolic}/${diastolic} mmHg)도 매우 안전한 구간입니다. `;

    if (bmiVal >= 23.0) brief += `체질량지수(BMI ${bmiVal.toFixed(1)}) 과체중 요인이 포착되어 점진적 체외 지방 연소가 제안됩니다.`;
    else brief += `BMI(${bmiVal.toFixed(1)}) 역시 균형 잡힌 표준 범위입니다.`;

    fileBriefingEl.innerText = brief;
  }

  // 🎠 모바일 스파크라인 캐러샐 활성화
  initSparklineCarousels();
}

/**
 * 3. AI 예방 주치의 상담 탭 렌더링 제어
 * - 대화 리스트(chatMessages)가 비어 있는 경우 웰컴 메시지를 통해 주치의 대화방을 초기화합니다.
 * - 대화 리스트가 존재하면 이전 대화 기록을 화면에 모두 출력(paintChatMessages)합니다.
 */
export function renderChatTab(ctx: DashboardContext): void {
  const chatMessages = ctx.getChatMessages();
  if (chatMessages.length === 0) {
    initializeChatRoom(ctx);
  } else {
    paintChatMessages(ctx);
  }
}

/**
 * 4. AI 예방 주치의 상담방 초기화
 * - 누적 토큰 및 비용 정보를 리셋하고 UI를 업데이트합니다.
 * - 사용자의 현재 대사 지표(공복혈당, 혈압)를 바탕으로 맞춤형 첫 인사(웰컴 메시지)를 생성하여 주입합니다.
 */
export function initializeChatRoom(ctx: DashboardContext): void {
  const nhisRecords = ctx.getNhisRecords();
  const fastingGl = nhisRecords[0]?.fastingGlucose ?? 95;
  const sysBp = nhisRecords[0]?.systolicBP ?? 120;

  ctx.setAccumulatedChatCostKrw(0);
  ctx.setAccumulatedChatTokens(0);
  updateChatCostUI(ctx);

  const initialMsgs: ChatMessage[] = [
    {
      id: "msg-welcome-init",
      role: "assistant",
      content: `반갑습니다, ${ctx.getUserName()}님! 한화손보의 AI Wellness Care Center AI 주치의 3.1 상담방에 오신 것을 환영합니다. \n\n연동 완료하신 이력 중 공복혈당 **${fastingGl} mg/dL**, 수축기 혈압 **${sysBp} mmHg** 수치를 포함한 복합 데이터를 확인하고 식습관 교정전략을 마련해 두었습니다. 당뇨 전단계 조율 수칙, 맞춤 운동 강도, 약제 처방 동향 등 궁금한 사항을 편하게 질문해 주십시오.`,
      timestamp: formatTime(new Date())
    }
  ];

  ctx.setChatMessages(initialMsgs);
  paintChatMessages(ctx);
}

/**
 * 5. 누적 대화 리스트를 화면 DOM에 렌더링
 * - 사용자 메시지는 우측 주황색 말풍선, 주치의 메시지는 좌측 흰색 말풍선으로 배치합니다.
 * - 개행 문자(\n)는 HTML 단락 구성을 위해 <br/> 태그로 변환합니다.
 * - AI가 응답을 생성 중일 때는 로딩 인디케이터(점 3개 튕김 효과)를 표시합니다.
 * - 메시지 출력 후 스크롤을 컨테이너 하단으로 밀착시킵니다.
 */
export function paintChatMessages(ctx: DashboardContext): void {
  const container = $("chat-messages-container");
  if (!container) return;

  const chatMessages = ctx.getChatMessages();
  const isChatLoading = ctx.isChatLoading();

  let html = chatMessages.map((msg) => {
    const isBot = msg.role === "assistant";
    const bgCls = isBot ? "bg-white text-slate-800 border-slate-150 shadow-2xs" : "bg-[#f37321] text-white self-end ml-12";
    const flexCls = isBot ? "justify-start" : "justify-end";
    const avatar = isBot 
      ? `
        <div class="w-8 h-8 rounded-full bg-[#fff5ee] border border-orange-200 text-[#f37321] flex items-center justify-center shrink-0">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 113.536 0V21h2v-2.243a5 5 0 013.536 0V21h2v-5.071" />
          </svg>
        </div>
      ` : "";

    // 개행문자를 br 태그로 치환하여 단락 구성
    const textFormatted = msg.content.replace(/\n/g, "<br/>");

    return `
      <div class="flex gap-2.5 max-w-full ${flexCls}">
        ${avatar}
        <div class="flex flex-col space-y-1">
          <div class="rounded-2xl px-4 py-2.5 text-xs sm:text-sm leading-relaxed border break-keep ${bgCls}">
            ${textFormatted}
          </div>
          <div class="flex items-center self-start leading-none">
            <span class="text-[10px] text-slate-400 font-medium tracking-tight">${msg.timestamp}</span>
          </div>
        </div>
      </div>
    `;
  }).join("");

  // 타이핑 인디케이터 삽입 (로딩 중일 때)
  if (isChatLoading) {
    html += `
      <div class="flex gap-2.5 justify-start">
        <div class="w-8 h-8 rounded-full bg-[#fff5ee] border border-orange-200 text-[#f37321] flex items-center justify-center shrink-0">
          <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.2 8H18.2" />
          </svg>
        </div>
        <div class="rounded-2xl px-4 py-2.5 text-xs bg-white text-slate-400 border border-slate-150 shadow-2xs flex items-center gap-1.5 shrink-0 self-start">
          <span class="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce"></span>
          <span class="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style="animation-delay: 0.2s"></span>
          <span class="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style="animation-delay: 0.4s"></span>
        </div>
      </div>
    `;
  }

  // 자동 스크롤 하단 안착용 앵커 추가
  html += `<div id="chat-messages-end"></div>`;
  container.innerHTML = html;

  // 윈도우 전체를 함께 스크롤시키는 scrollIntoView 대신, 오직 채팅 메시지 전용 스크롤뷰 내 scrollTop만 하단 밀착시킵니다.
  container.scrollTop = container.scrollHeight;
}

/**
 * 6. 사용자 메시지 전송 및 API 연동
 * - 입력 필드의 질문 텍스트를 읽고 대화 내역에 어펜드합니다.
 * - `/api/health/chat` 백엔드 서버 라우터에 대화 내역과 기 추출된 분석 결과(analysisResult) 컨텍스트를 동봉하여 전송합니다.
 * - API 호출로부터 대답(Gemini)과 토큰 단가 정보(costInfo)를 받아 누적 세션 비용을 갱신합니다.
 */
export async function handleChatSubmit(ctx: DashboardContext): Promise<void> {
  const input = $("chat-user-message-input") as HTMLInputElement;
  const userText = input ? input.value.trim() : "";
  if (!userText || ctx.isChatLoading()) return;

  // 인풋 초기화
  if (input) input.value = "";

  // 사용자 메시지 어펜드
  const chatMessages = ctx.getChatMessages();
  const userMsg: ChatMessage = {
    id: `msg-user-${Date.now()}`,
    role: "user",
    content: userText,
    timestamp: formatTime(new Date())
  };
  
  const updatedMsgs = [...chatMessages, userMsg];
  ctx.setChatMessages(updatedMsgs);
  ctx.setChatLoading(true);
  paintChatMessages(ctx);

  // API 호출 개시
  const payload = {
    messages: updatedMsgs,
    analysisContext: ctx.getAnalysisResult()
  };

  try {
    const res = await fetch("/api/health/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || "상담사가 응답에 딜레이를 빚고 있습니다.");
    }

    const data = await res.json();
    
    // 실시간 대화 누적 비용 합산 및 헤더 갱신
    if (data.costInfo) {
      ctx.setAccumulatedChatCostKrw(ctx.getAccumulatedChatCostKrw() + data.costInfo.costKrw);
      ctx.setAccumulatedChatTokens(ctx.getAccumulatedChatTokens() + data.costInfo.totalTokens);
      updateChatCostUI(ctx);
    }

    // AI 답변 어펜드
    const systemMsg: ChatMessage = {
      id: `msg-system-${Date.now()}`,
      role: "assistant",
      content: data.text,
      timestamp: formatTime(new Date()),
      costInfo: data.costInfo
    };
    
    ctx.setChatMessages([...ctx.getChatMessages(), systemMsg]);

  } catch (err: any) {
    console.error(err);
    ctx.setChatMessages([...ctx.getChatMessages(), {
      id: `msg-err-${Date.now()}`,
      role: "assistant",
      content: err.message || "죄송합니다, 잠시 스마트 주치의 대화선이 혼잡합니다. 잠시 후에 다시 글을 남겨 주십시오.",
      timestamp: formatTime(new Date())
    }]);
  } finally {
    ctx.setChatLoading(false);
    paintChatMessages(ctx);
  }
}

/**
 * 7. 실시간 AI 챗봇 세션 누적 단가(KRW 및 Tokens) 헤더 UI 갱신 유틸
 */
export function updateChatCostUI(ctx: DashboardContext): void {
  const krw = $("chat-accumulated-cost-krw");
  const tokens = $("chat-accumulated-tokens");
  if (krw) {
    krw.innerText = ctx.getAccumulatedChatCostKrw().toLocaleString(undefined, { 
      minimumFractionDigits: 4, 
      maximumFractionDigits: 4 
    });
  }
  if (tokens) {
    tokens.innerText = ctx.getAccumulatedChatTokens().toLocaleString();
  }
}

/**
 * 8. 챗봇 이벤트 리스너 통합 바인딩
 * - 전송 폼 전송, 추천 질문 칩 클릭, 상담 리셋 이벤트 리스너를 한눈에 관리하고 등록합니다.
 */
export function bindChatEvents(ctx: DashboardContext): void {
  // 챗봇 입력 폼 SUBMIT 연동
  $("chat-input-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    handleChatSubmit(ctx);
  });

  // 추천 문구 칩 클릭 이벤트 연동
  $("section-action")?.addEventListener("click", (e) => {
    const chip = (e.target as HTMLElement).closest(".chat-chip");
    if (chip) {
      const query = chip.getAttribute("data-query");
      if (query) {
        const input = $("chat-user-message-input") as HTMLInputElement;
        if (input) {
          input.value = query;
          handleChatSubmit(ctx);
        }
      }
    }
  });

  // 챗봇 대화 초기화
  $("btn-reset-chat")?.addEventListener("click", () => {
    initializeChatRoom(ctx);
  });
}

/**
 * 헬퍼: 현재 한국 시간대 기준 시분 포맷터
 * 예: "오후 02:30"
 */
function formatTime(date: Date): string {
  return date.toLocaleTimeString("ko-KR", { 
    timeZone: "Asia/Seoul",
    hour: "2-digit", 
    minute: "2-digit"
  });
}

/**
 * 3. 처방전 / 약봉투 이미지 비전 분석 영역 렌더링 및 업로드 처리
 * - 사용자가 올린 약 이미지를 Gemini Vision으로 분석하여 대시보드에 약물 목록을 카드로 구성합니다.
 * - 복용 약물이 추가되면 종합 보고서 융합 재분석(recalculate)을 트리거할 수 있는 장치를 노출합니다.
 */
export function renderPrescriptionSection(ctx: DashboardContext): void {
  const badge = $("prescription-status-badge");
  const uploadZone = $("prescription-upload-zone");
  const fileInput = $("prescription-file-input") as HTMLInputElement | null;
  const loadingBar = $("prescription-loading-bar");
  const resultContainer = $("prescription-result-container");
  const summaryText = $("prescription-summary-text");
  const cardsGrid = $("medication-cards-grid");

  if (!uploadZone || !loadingBar || !resultContainer || !cardsGrid) return;

  const data = ctx.getPrescriptionData();

  // 1. 이미 분석된 처방 정보가 존재하는 경우
  if (data && data.medications && data.medications.length > 0) {
    if (badge) {
      badge.innerText = "분석 완료";
      badge.className = "bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-md border border-emerald-200";
    }

    uploadZone.classList.add("hidden");
    loadingBar.classList.add("hidden");
    resultContainer.classList.remove("hidden");

    if (summaryText) {
      summaryText.innerText = data.rawTextSummary || "처방전 분석이 성공적으로 완료되었습니다.";
    }

    // 약물 개별 카드 그리기
    cardsGrid.innerHTML = data.medications.map((med: any) => `
      <div class="bg-white border border-slate-100 hover:border-teal-500/25 rounded-2xl p-4.5 shadow-3xs transition-all flex flex-col justify-between space-y-2.5">
        <div>
          <div class="flex items-center gap-1.5 mb-1.5">
            <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal-50 text-teal-600 text-[10px] font-black">💊</span>
            <h4 class="font-extrabold text-slate-800 text-xs sm:text-sm break-all">${med.name}</h4>
          </div>
          <div class="space-y-1 pl-6.5 text-slate-500 text-[11px] leading-relaxed">
            <div><span class="font-bold text-slate-700">효능:</span> ${med.efficacy}</div>
            <div><span class="font-bold text-slate-700">복용:</span> ${med.dosage}</div>
          </div>
        </div>
        <div class="bg-rose-50/50 border border-rose-100/50 rounded-xl p-2.5 mt-1 text-[10px] leading-normal text-rose-800 font-medium pl-3 border-l-2 border-l-rose-500">
          <span class="font-bold block text-rose-900 mb-0.5">⚠️ 주의사항/부작용</span>
          ${med.sideEffects}
        </div>
      </div>
    `).join("");
  } else {
    // 2. 처방전이 아직 등록되지 않은 초기 상태
    if (badge) {
      badge.innerText = "미등록";
      badge.className = "bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-md border border-slate-200";
    }

    uploadZone.classList.remove("hidden");
    loadingBar.classList.add("hidden");
    resultContainer.classList.add("hidden");

    // 드롭존 클릭 시 파일선택기 호출 연동
    uploadZone.onclick = () => {
      fileInput?.click();
    };

    if (fileInput) {
      fileInput.onchange = async () => {
        const file = fileInput.files?.[0];
        if (!file) return;

        // 드롭존 숨기고 로딩바 활성화
        uploadZone.classList.add("hidden");
        loadingBar.classList.remove("hidden");

        try {
          const result = await ctx.uploadPrescriptionImage(file);
          ctx.setPrescriptionData(result);
          // 렌더링 갱신
          renderPrescriptionSection(ctx);
        } catch (err: any) {
          console.error(err);
          alert(err.message || "처방전 사진 분석 중 문제가 생겼습니다. 이미지 텍스트 가독성을 확인해 주세요.");
          // 복원
          loadingBar.classList.add("hidden");
          uploadZone.classList.remove("hidden");
        } finally {
          fileInput.value = ""; // 리셋
        }
      };
    }
  }
}

/**
 * 🎠 모바일 5개년 건강 추세 트랙 스파크라인 캐러샐 제어 로직 (Task 3)
 */
export function initSparklineCarousels() {
  const setupCarousel = (carouselId: string, indicatorsId: string) => {
    const carousel = document.getElementById(carouselId);
    const indicators = document.querySelectorAll(`#${indicatorsId} button`);
    if (!carousel || indicators.length === 0) return;

    let activeIndex = 0;
    let autoSlideTimer: any = null;

    const updateDots = (index: number) => {
      indicators.forEach((dot, i) => {
        if (i === index) {
          dot.classList.remove("bg-slate-200");
          dot.classList.add("bg-[#f37321]");
        } else {
          dot.classList.remove("bg-[#f37321]");
          dot.classList.add("bg-slate-200");
        }
      });
    };

    // 스크롤 시 도트 싱크 업데이트
    const handleScroll = () => {
      const width = carousel.clientWidth;
      if (width <= 0) return;
      const scrollLeft = carousel.scrollLeft;
      const index = Math.round(scrollLeft / width);
      if (index !== activeIndex && index >= 0 && index < indicators.length) {
        activeIndex = index;
        updateDots(activeIndex);
      }
    };

    carousel.removeEventListener("scroll", handleScroll);
    carousel.addEventListener("scroll", handleScroll);

    // 자동 롤링 기동 (3초 간격)
    const startAutoSlide = () => {
      stopAutoSlide();
      autoSlideTimer = setInterval(() => {
        const width = carousel.clientWidth;
        if (width <= 0) return;
        activeIndex = (activeIndex + 1) % indicators.length;
        carousel.scrollTo({
          left: width * activeIndex,
          behavior: "smooth"
        });
        updateDots(activeIndex);
      }, 3000);
    };

    const stopAutoSlide = () => {
      if (autoSlideTimer) {
        clearInterval(autoSlideTimer);
        autoSlideTimer = null;
      }
    };

    // 자동 롤링 개시
    startAutoSlide();

    // 사용자 조작 터치/드래그 감지 시 자동 롤링 일시 정지
    carousel.addEventListener("touchstart", stopAutoSlide, { passive: true });
    carousel.addEventListener("mousedown", stopAutoSlide);

    // 인디케이터 도트 클릭 시 수동 이동
    indicators.forEach((dot, i) => {
      dot.addEventListener("click", () => {
        stopAutoSlide();
        activeIndex = i;
        const width = carousel.clientWidth;
        carousel.scrollTo({
          left: width * activeIndex,
          behavior: "smooth"
        });
        updateDots(activeIndex);
      });
    });
  };

  // 국민건강보험공단 5개년 스파크라인 캐러샐 기동
  setupCarousel("sparkline-carousel", "sparkline-carousel-indicators");
  // PDF 파싱 데이터 5개년 스파크라인 캐러샐 기동
  setupCarousel("parsed-file-sparkline-carousel", "parsed-file-sparkline-carousel-indicators");
}
