/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as step1Info from "./views/step1Info";
import * as step2Family from "./views/step2Family";
import * as step3Auth from "./views/step3Auth";
import * as step4Dashboard from "./views/step4Dashboard";
import { Step1Context } from "./views/step1Info";
import { Step2Context } from "./views/step2Family";
import { Step3Context } from "./views/step3Auth";
import { DashboardContext } from "./views/step4Dashboard";
import "./index.css";
import { samplePersonas, samplePDFPresets } from "./data";
import { NHISData, UploadedPDFReport, AIAnalysisResult, ChatMessage } from "./types";
import { drawSparkline } from "./utils/chartHelper";
import { validateBirthDate as validateBirthDateHelper, clearInputErrors as clearInputErrorsHelper, triggerInputError as triggerInputErrorHelper } from "./utils/formHelper";

// --- 글로벌 애플리케이션 상태 관리 (Vanilla State) ---
let currentStep: "auth" | "loading" | "dashboard" = "auth";
let userName = "";
let birthDate = "";
let gender: "M" | "F" = "M";
let authProvider = "kakao";

// 가족력 팩터 저장용 글로벌 상태 변수
let fatherFactors: string[] = ["없음"];
let motherFactors: string[] = ["없음"];

// 검진 수치 및 PDF 동기화 수치 보관
let nhisRecords: any[] = samplePersonas[0].nhisData.records;
let selectedPDFPresetId = "";
let customPDFText = "";
let uploadedFile: { name: string; size: string } | null = null;
let uploadedFiles: Array<{ 
  name: string; 
  size: string; 
  customText?: string; 
  isParsing?: boolean; 
  parseFailed?: boolean; 
  parseErrorMessage?: string; 
  metrics?: { 
    systolicBP?: number; 
    diastolicBP?: number; 
    fastingGlucose?: number; 
    totalCholesterol?: number; 
    bmi?: number; 
    fattyLiver?: string; 
    hba1c?: number; 
    homaIr?: number; 
    cdRatio?: number; 
    retinaMsg?: string; 
    year?: number;
    // 신규 추가 지표들 (개선된 파서에서 추출)
    ast?: number;         // 간기능 AST (SGOT)
    alt?: number;         // 간기능 ALT (SGPT)
    rGtp?: number;        // 감마 GTP
    creatinine?: number;  // 크레아티닌
    egfr?: number;        // 사구체여과율
    hemoglobin?: number;  // 혈색소
    hdlCholesterol?: number; // HDL 콜레스테롤
    ldlCholesterol?: number; // LDL 콜레스테롤
    triglycerides?: number;  // 중성지방
    height?: number;      // 신장(키)
    weight?: number;      // 체중
    waist?: number;       // 허리둘레
    urineProtein?: string; // 요단백
  } | null; 
}> = [];
let isStep1Completed = false;
let isStep2Completed = false;

// --- [신규 추가] 사용자가 기존에 가입한 보험 계약 및 담보 한도 정보 (시뮬레이션 기본 데이터) ---
// 실제 CODEF API 연동 전/후에 연동된 데이터를 보관하며, 컨설팅 탭에서 보장 격차를 비교할 때 사용됩니다.
let existingInsurances: Array<{
  company: string;       // 보험회사 이름
  productName: string;   // 가입된 보험 상품명
  status: string;        // 계약 유지 상태 (유지, 실효 등)
  premium: number;       // 매월 납입 중인 보험료
}> = [];

// 가입되어 있는 주요 5대 담보별 기존 보장 한도 금액 (원 단위)
let existingCoverages: Record<string, number> = {
  "cov-cancer": 0,    // 암 진단비
  "cov-brain": 0,     // 뇌혈관질환 진단비
  "cov-heart": 0,     // 허혈성심장질환 진단비
  "cov-metabolic": 0, // 대사성 만성질환 특별보완 특약
  "cov-surgery": 0    // 일반 질병 및 다빈도 수술비
};

// 결과 분석 데이터 보관
let analysisResult: AIAnalysisResult | null = null;
let isSimulated = true;
let prescriptionData: any = null; // 처방전 비전 분석 데이터 글로벌 상태 보관
let lastRecommendedProduct = "";

// 다른 설계서 비교 분석 상태 보관 및 캐싱
let isComparisonCompleted = false;
let comparisonResultHtml = "";

// 챗보 대화 상태 보관
let chatMessages: ChatMessage[] = [];
let isChatLoading = false;
let accumulatedChatCostKrw = 0;
let accumulatedChatTokens = 0;

// 모달 및 타이머 제어
let authTimerInterval: any = null;
let authTimerSeconds = 180;
let codefJti = "";
let codefTwoWayInfo: any = null;

// 실습 수식 도출용 체크 상태
let checklistState = {
  diet: [false, false, false],
  exercise: [false, false, false],
  lifestyle: [false, false, false]
};

// 로딩 화면 단계 구성
const loadingSteps = [
  { text: "🔒 간편인증 보안 토큰 발급 및 신원인증 완료...", duration: 800 },
  { text: "📥 국민건강보험공단 DB에서 최근 국민검진 이력 동기화 중...", duration: 800 },
  { text: "📊 최근 5개년 건강 메트릭 시계열 지표 분석 적용 중...", duration: 700 },
  { text: "📁 업로드된 정밀 임상 소견서(PDF) 자연어 추출 진행 중...", duration: 800 },
  { text: "🧠 공단 건강검진 및 정밀 임상 수치 유기적 융합 분석 중...", duration: 900 },
  { text: "💡 가이드라인 반영: 생활 조치 및 미래 추천 스키마 도출 완료!", duration: 600 }
];

// --- 편리한 DOM 셀렉터 및 매핑 가속화 유틸 ---
const $ = (id: string) => document.getElementById(id);
const $$ = (selector: string) => document.querySelectorAll(selector);

// 범용 접속이력 및 액션 로깅 헬퍼 함수
async function logAccessEvent(actionType: string, details?: any) {
  try {
    const payloadUserName = (details && details.userName) !== undefined ? details.userName : userName;
    const payloadBirthDate = (details && details.birthDate) !== undefined ? details.birthDate : birthDate;
    await fetch("/api/log-access", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        userName: payloadUserName,
        birthDate: payloadBirthDate,
        actionType,
        details: details || {}
      })
    });
  } catch (err) {
    console.error("[AccessLog] Failed to log event:", err);
  }
}

// 기동 시 바인딩 수행
function bootstrap() {
  // 모바일 디바이스 감지 및 URL 내 embedded=true 파라미터 혹은 화면 너비가 768px 미만인지 체크
  const isMobileDevice = /Mobi|Android|iPhone|iPad|Macintosh/i.test(navigator.userAgent) && window.innerWidth < 1024;
  const isEmbedded = window.location.search.includes("embedded=true") || isMobileDevice || window.innerWidth < 768;

  if (isEmbedded) {
    // 1. 임베디드 모드 (진짜 모바일 및 시뮬레이터 내부 본 콘텐츠 실행)
    // 시뮬레이터 툴바, 백드롭 그라데이션 장식 및 스마트폰 껍데기 레이아웃을 DOM에서 깨끗하게 제거
    const toolbar = document.querySelector("body > div.fixed.top-4.right-4");
    const backdrop = document.querySelector("body > div.hidden.sm\\:block.absolute:not(.top-\\[20\\%\\])");
    const backdropPulse = document.querySelector("body > div.hidden.sm\\:block.absolute.top-\\[20\\%\\]");
    
    toolbar?.remove();
    backdrop?.remove();
    backdropPulse?.remove();

    const notch = document.getElementById("simulator-notch");
    const statusbar = document.getElementById("simulator-statusbar");
    const homebar = document.getElementById("simulator-homebar");
    
    notch?.remove();
    statusbar?.remove();
    homebar?.remove();

    const container = document.getElementById("device-simulator-container");
    const appViewport = document.getElementById("app-viewport");

    if (container && appViewport) {
      document.body.appendChild(appViewport);
      container.remove();
    }

    // [교육용 주석] 자식 iframe 내부(또는 진짜 모바일 단독 기동 상황)에서 appViewport가 
    // 브라우저 뷰포트 영역(100vh)을 꽉 채운 채 내부에서 자체 스크롤(overflow-y: auto)되도록 강제 설정합니다.
    // 이 처리를 통해 PC 대화면 모드로 변경 시 높이 축소로 인한 탭바 이하 컨텐츠의 짤림 현상을 완전히 해결합니다.
    if (appViewport) {
      appViewport.style.height = "100vh";
      appViewport.style.overflowY = "auto";
    }

    // body의 flex 및 디바이스 시뮬레이터용 프레임 정렬을 제거하여 100% 모바일 전체 화면 복원
    document.body.className = "h-full text-slate-900 antialiased bg-[#efeee8]";

    // 순정 앱 초기화 기동
    initApp();
  } else {
    // 2. 부모 시뮬레이터 껍데기 모드
    // 부모 창에서는 실제 콘텐츠 영역(#app-viewport)을 렌더링하지 않고 제거
    const appViewport = document.getElementById("app-viewport");
    appViewport?.remove();

    const container = document.getElementById("device-simulator-container");
    const homebar = document.getElementById("simulator-homebar");

    if (container) {
      // 그라데이션 스마트폰 프레임 안에 진짜 뷰포트를 갖는 iframe 동적 주입
      const iframe = document.createElement("iframe");
      iframe.id = "simulator-iframe";
      iframe.src = window.location.pathname + "?embedded=true" + window.location.hash;
      iframe.className = "flex-1 w-full h-full border-0";
      
      if (homebar) {
        container.insertBefore(iframe, homebar);
      } else {
        container.appendChild(iframe);
      }
    }

    // 시뮬레이터 선택 버튼 클릭 바인딩 활성화
    setupDeviceSimulator();
  }
}

if (document.readyState === "complete" || document.readyState === "interactive") {
  bootstrap();
} else {
  window.addEventListener("DOMContentLoaded", bootstrap);
}

// --- Step 1과 상호작용하기 위한 상태 제어 컨텍스트 객체 정의 ---
const step1Ctx: Step1Context = {
  getUserName: () => userName,
  setUserName: (name) => { userName = name; },
  getBirthDate: () => birthDate,
  setBirthDate: (birth) => { birthDate = birth; },
  getGender: () => gender,
  setGender: (g) => { gender = g; },
  setNhisRecords: (records) => { nhisRecords = records; },
  setFatherFactors: (factors) => { fatherFactors = factors; },
  setMotherFactors: (factors) => { motherFactors = factors; },
  logAccessEvent: (action, details) => { logAccessEvent(action, details); }
};

// --- Step 2와 상호작용하기 위한 상태 제어 컨텍스트 객체 정의 ---
const step2Ctx: Step2Context = {
  getFatherFactors: () => fatherFactors,
  setFatherFactors: (factors) => { fatherFactors = factors; },
  getMotherFactors: () => motherFactors,
  setMotherFactors: (factors) => { motherFactors = factors; }
};

// --- Step 3과 상호작용하기 위한 상태 제어 컨텍스트 객체 정의 ---
const step3Ctx: Step3Context = {
  getUserName: () => userName,
  getBirthDate: () => birthDate,
  getAuthProvider: () => authProvider,
  getCodefJti: () => codefJti,
  setCodefJti: (jti) => { codefJti = jti; },
  getCodefTwoWayInfo: () => codefTwoWayInfo,
  setCodefTwoWayInfo: (info) => { codefTwoWayInfo = info; },
  getNhisRecords: () => nhisRecords,
  setNhisRecords: (records) => { nhisRecords = records; },
  setIsStep1Completed: (completed) => { isStep1Completed = completed; },
  updateAuthProgress: () => { updateAuthProgress(); },
  logAccessEvent: (action, details) => { logAccessEvent(action, details); },
  setSyncedInsurances: (insurances) => {
    existingInsurances = insurances;
    // 연동된 실보험을 바탕으로 보장 한도를 지능적으로 자동 맵핑 업데이트
    existingCoverages = {
      "cov-cancer": 0,
      "cov-brain": 0,
      "cov-heart": 0,
      "cov-metabolic": 0,
      "cov-surgery": 0
    };
    insurances.forEach(ins => {
      const pName = ins.productName || "";
      if (pName.includes("암") || pName.includes("종양")) {
        existingCoverages["cov-cancer"] += 20000000;
      }
      if (pName.includes("뇌") || pName.includes("졸중") || pName.includes("혈관")) {
        existingCoverages["cov-brain"] += 10000000;
      }
      if (pName.includes("심장") || pName.includes("협심") || pName.includes("혈관") || pName.includes("건강")) {
        existingCoverages["cov-heart"] += 10000000;
      }
      if (pName.includes("당뇨") || pName.includes("대사") || pName.includes("만성")) {
        existingCoverages["cov-metabolic"] += 5000000;
      }
      if (pName.includes("수술") || pName.includes("종합")) {
        existingCoverages["cov-surgery"] += 2000000;
      }
    });
    // 기본값 설정 (만약 다 미가입으로 판정되면 최소 보장 보정)
    if (existingCoverages["cov-cancer"] === 0) existingCoverages["cov-cancer"] = 10000000;
    if (existingCoverages["cov-brain"] === 0) existingCoverages["cov-brain"] = 10000000;
    if (existingCoverages["cov-heart"] === 0) existingCoverages["cov-heart"] = 10000000;
    if (existingCoverages["cov-surgery"] === 0) existingCoverages["cov-surgery"] = 1000000;
  },
  renderConsultingTab: () => {
    renderConsultingTab();
  }
};

// --- Step 4(대시보드/챗봇)와 상호작용하기 위한 상태 제어 컨텍스트 객체 정의 ---
const dashboardCtx: DashboardContext = {
  getNhisRecords: () => nhisRecords,
  getUserName: () => userName,
  getChatMessages: () => chatMessages,
  setChatMessages: (msgs) => { chatMessages = msgs; },
  isChatLoading: () => isChatLoading,
  setChatLoading: (loading) => { isChatLoading = loading; },
  getAccumulatedChatCostKrw: () => accumulatedChatCostKrw,
  setAccumulatedChatCostKrw: (cost) => { accumulatedChatCostKrw = cost; },
  getAccumulatedChatTokens: () => accumulatedChatTokens,
  setAccumulatedChatTokens: (tokens) => { accumulatedChatTokens = tokens; },
  getUploadedFiles: () => uploadedFiles,
  getAnalysisResult: () => analysisResult,
  isStep1Completed: () => isStep1Completed,
  isStep2Completed: () => isStep2Completed,
  getPrescriptionData: () => prescriptionData,
  setPrescriptionData: (data) => { prescriptionData = data; },
  uploadPrescriptionImage: async (file: File) => {
    const formData = new FormData();
    formData.append("prescriptionImage", file);
    const res = await fetch("/api/health/analyze-prescription", {
      method: "POST",
      body: formData
    });
    if (!res.ok) {
      // [교육용 주석] 서버가 세부 분석한 JSON 에러 응답({ error, detail })을 취득합니다.
      const err = await res.json().catch(() => ({}));
      
      // 만약 에러의 상세 조치 제안(detail)이 있으면, 함께 줄바꿈을 주어 보기 좋게 결합하여 에러를 상위로 전파합니다.
      const detailInfo = err.detail ? `\n\n[진단 및 해결 제안]:\n${err.detail}` : "";
      throw new Error((err.error || "처방전 이미지 분석에 실패했습니다.") + detailInfo);
    }
    return res.json();
  },
  triggerRecalculateAnalysis: () => {
    triggerAIAnalysis();
  }
};

function initApp() {
  step1Info.renderPersonaPresets(step1Ctx);
  renderPDFPresets();
  setupEventListeners();
  step1Info.updateGenderButtons(step1Ctx);
  updateStepView();
  updateAuthProgress();
  setupProviderDetailsHandlers();
  setupConsentDetailsHandlers();
  setupConsentCheckboxes();

  // 🕒 한국 표준시(KST) 기반으로 현재 일시 렌더링
  const dDate = $("rendered-current-date");
  if (dDate) {
    const now = new Date();
    dDate.innerText = "분석 일시: " + now.toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });
  }

  // 첫 진입 시 랜딩 접속 로그 기록
  logAccessEvent("landing");

  // 상담 예약 완료 모달 닫기
  $("btn-close-consultation-success")?.addEventListener("click", () => {
    $("consultation-success-modal")?.classList.add("hidden");
  });
  setupPremiumBasisModal();
  setupDeviceSimulator();
}

// ========================================================
// 1. 프리셋 데이터 렌더링 및 프로필 바인딩
// ========================================================
function renderPersonaPresets() {
  const container = $("persona-presets-container");
  if (!container) return;

  container.innerHTML = samplePersonas.map((persona) => {
    const isSelected = persona.name === userName;
    return `
      <div class="preset-card p-3 rounded-xl border border-slate-200 hover:border-[#f37321] hover:bg-[#fff5ee] bg-white cursor-pointer transition-all flex items-center justify-between group" data-id="${persona.id}">
        <div class="flex items-center gap-2.5">
          <span class="text-xl">${persona.icon}</span>
          <div class="text-left">
            <span class="text-xs font-extrabold text-[#231f20] group-hover:text-[#f37321] block">${persona.name} (${persona.genderText}, ${persona.age}세)</span>
            <span class="text-[10px] text-slate-400 block mt-0.5 max-w-[190px] truncate leading-tight">${persona.diseaseHint}</span>
          </div>
        </div>
        <svg class="w-3.5 h-3.5 text-slate-300 group-hover:text-[#f37321]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    `;
  }).join("");

  // 프리셋 클릭 이벤트 리스너 배정
  $$(".preset-card").forEach((card) => {
    card.addEventListener("click", () => {
      const personaId = card.getAttribute("data-id");
      const persona = samplePersonas.find(p => p.id === personaId);
      if (persona) {
        userName = persona.name;
        birthDate = persona.nhisData.birthDate;
        gender = persona.nhisData.gender;
        nhisRecords = persona.nhisData.records;

        // UI 인풋 엘리먼트 갱신
        const nameInput = $("input-username") as HTMLInputElement;
        const birthInput = $("input-birth") as HTMLInputElement;
        if (nameInput) nameInput.value = userName;
        if (birthInput) birthInput.value = birthDate;

        updateGenderButtons();
        highlightActivePreset(personaId || "");

        // 프리셋별 맞춤 가족력 자동 매핑 세팅
        fatherFactors = [];
        motherFactors = [];
        if (personaId === "persona-1") {
          fatherFactors = ["고혈압", "당뇨병"];
          motherFactors = ["치매"];
        } else if (personaId === "persona-2") {
          fatherFactors = ["뇌졸중/뇌혈관"];
          motherFactors = ["당뇨병", "위암/대장암"];
        } else if (personaId === "persona-3") {
          fatherFactors = ["심장질환"];
          motherFactors = ["고혈압"];
        }

        // 가족력 버튼 UI 선택 상태 업데이트
        $$(".family-factor-btn").forEach((btn) => {
          const rel = btn.getAttribute("data-relation");
          const fac = btn.getAttribute("data-factor");
          if (!rel || !fac) return;

          const isSelected = (rel === "father" && fatherFactors.includes(fac)) || 
                             (rel === "mother" && motherFactors.includes(fac));
          if (isSelected) {
            btn.classList.remove("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
            btn.classList.add("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
          } else {
            btn.classList.remove("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
            btn.classList.add("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
          }
        });
      }
    });
  });
}

function highlightActivePreset(selectedId: string) {
  $$(".preset-card").forEach((card) => {
    const cardId = card.getAttribute("data-id");
    if (cardId === selectedId) {
      card.classList.add("border-[#f37321]", "bg-[#fff5ee]", "ring-1", "ring-[#f37321]");
    } else {
      card.classList.remove("border-[#f37321]", "bg-[#fff5ee]", "ring-1", "ring-[#f37321]");
    }
  });
}

function renderPDFPresets() {
  const select = $("select-pdf-preset") as HTMLSelectElement | null;
  if (!select) return;

  samplePDFPresets.forEach((preset) => {
    const opt = document.createElement("option");
    opt.value = preset.id;
    opt.innerText = preset.title;
    select.appendChild(opt);
  });
}

function updateGenderButtons() {
  const btnM = $("btn-gender-m");
  const btnF = $("btn-gender-f");
  if (!btnM || !btnF) return;

  if (gender === "M") {
    btnM.classList.remove("opacity-60", "border-slate-200");
    btnM.classList.add("border-[#f37321]", "text-[#f37321]", "bg-[#fff5ee]");
    btnF.classList.add("opacity-60", "border-slate-200");
    btnF.classList.remove("border-[#f37321]", "text-[#f37321]", "bg-[#fff5ee]");
  } else {
    btnF.classList.remove("opacity-60", "border-slate-200");
    btnF.classList.add("border-[#f37321]", "text-[#f37321]", "bg-[#fff5ee]");
    btnM.classList.add("opacity-60", "border-slate-200");
    btnM.classList.remove("border-[#f37321]", "text-[#f37321]", "bg-[#fff5ee]");
  }
}

// ========================================================
// 2. 이벤트 리스너 설계 및 바인딩
// ========================================================
// 생년월일 (YYMMDD) 디테일 유효성 체크 함수
function validateBirthDate(birth: string): { valid: boolean; errorMsg?: string } {
  return validateBirthDateHelper(birth);
}

// 에러 스타일 및 애니메이션 초기화용 헬퍼
function clearInputErrors() {
  clearInputErrorsHelper();
}

// 개별 필드 에러 효과 및 텍스트박스 흔들림 트리거 헬퍼
function triggerInputError(inputEl: HTMLInputElement, errorEl: HTMLElement, message: string) {
  triggerInputErrorHelper(inputEl, errorEl, message);
}

function setupEventListeners() {
  // 성별 변경 버튼
  $("btn-gender-m")?.addEventListener("click", () => {
    gender = "M";
    updateGenderButtons();
  });
  $("btn-gender-f")?.addEventListener("click", () => {
    gender = "F";
    updateGenderButtons();
  });

  // 이름 및 생년월일 수동 입력 연동
  $("input-username")?.addEventListener("input", (e) => {
    userName = (e.target as HTMLInputElement).value;
    clearInputErrors(); // 입력 시작하면 에러 클리어
  });
  $("input-birth")?.addEventListener("input", (e) => {
    birthDate = (e.target as HTMLInputElement).value;
    clearInputErrors(); // 입력 시작하면 에러 클리어
  });
  $("modal-input-phone")?.addEventListener("input", (e) => {
    clearInputErrors(); // 입력 시작하면 에러 클리어
    const phoneVal = (e.target as HTMLInputElement).value;
    const cleaned = phoneVal.replace(/[^0-9]/g, "");
    const isValid = cleaned.startsWith("01") && (cleaned.length === 10 || cleaned.length === 11);
    const disclaimer = $("modal-bypass-disclaimer");
    if (disclaimer) {
      if (isValid) {
        disclaimer.classList.remove("hidden");
      } else {
        disclaimer.classList.add("hidden");
      }
    }
  });

  // Step 1 입력 버튼 누르면 Step 2 보이고 포커스(앵커) 이동
  $("btn-submit-step1")?.addEventListener("click", () => {
    const nameInput = $("input-username") as HTMLInputElement;
    const birthInput = $("input-birth") as HTMLInputElement;
    const nameError = $("error-username");
    const birthError = $("error-birth");
    
    if (nameInput) userName = nameInput.value;
    if (birthInput) birthDate = birthInput.value;

    if (!userName.trim()) {
      if (nameInput && nameError) {
        triggerInputError(nameInput, nameError as HTMLElement, "이름을 입력해주세요.");
      }
      logAccessEvent("validation_failure", {
        context: "step1_form_submit",
        field: "userName",
        error: "이름 누락",
        userName: "",
        birthDate: birthDate
      });
      return;
    }
    const birthVal = validateBirthDate(birthDate);
    if (!birthVal.valid) {
      if (birthInput && birthError) {
        triggerInputError(birthInput, birthError as HTMLElement, birthVal.errorMsg || "생년월일을 입력해주세요.");
      }
      logAccessEvent("validation_failure", {
        context: "step1_form_submit",
        field: "birthDate",
        error: birthVal.errorMsg || "생년월일 유효성 실패",
        userName: userName,
        birthDate: birthDate
      });
      return;
    }

    // 성공했으므로 에러 클리어
    clearInputErrors();

    // Step 1 입력이 성공했음을 Supabase 로그에 기록
    logAccessEvent("step1_form_submit", { gender });

    // Step 2 보이기 & 앵커 이동
    const connector1 = $("step-1-2-connector");
    const card2 = $("step-2-card");
    if (connector1 && card2) {
      connector1.classList.remove("hidden");
      card2.classList.remove("hidden");
      card2.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  // 간편인증 선택처 다이나믹 전환
  $$(".auth-provider-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".auth-provider-btn").forEach(b => b.classList.add("opacity-60", "border-slate-200"));
      $$(".auth-provider-btn").forEach(b => b.classList.remove("border-[#f37321]", "bg-[#fff5ee]", "text-[#f37321]"));
      
      btn.classList.remove("opacity-60", "border-slate-200");
      btn.classList.add("border-[#f37321]", "bg-[#fff5ee]", "text-[#f37321]");
      authProvider = btn.getAttribute("data-provider") || "kakao";
    });
  });

  // PDF 스캔 프리셋 셀렉터 변경 연동
  $("select-pdf-preset")?.addEventListener("change", (e) => {
    const presetId = (e.target as HTMLSelectElement).value;
    selectedPDFPresetId = presetId;
    const preset = samplePDFPresets.find(p => p.id === presetId);
    
    if (preset) {
      let metrics: any = null;
      if (preset.id === "pdf-1") {
        metrics = { fattyLiver: "Mild", year: 2025 };
      } else if (preset.id === "pdf-2") {
        metrics = { cdRatio: 0.3, retinaMsg: "미세혈관 확장", year: 2025 };
      } else if (preset.id === "pdf-3") {
        metrics = { fastingGlucose: 107, hba1c: 5.9, homaIr: 2.9, totalCholesterol: 198, systolicBP: 129, diastolicBP: 84, bmi: 23.7, year: 2025 };
      }
      
      // 프리셋 선택 시 기존 목록을 클리어하고 해당 프리셋을 담아줍니다
      uploadedFiles = [{
        name: preset.title + ".pdf",
        size: "1.4 MB",
        customText: preset.text,
        metrics: metrics,
        parseFailed: false,
        isParsing: false
      }];
      // 프리셋 선택 로그 기록
      logAccessEvent("step2_preset_select", { presetId, presetName: preset.title });
    } else {
      uploadedFiles = [];
    }
    renderUploadedFilesList();
    updateAuthProgress();
  });

  // 드래그앤드롭 및 실제 파일 업로드 구현
  const dragZone = $("pdf-drag-zone");
  const fileInputPdf = $("file-input-pdf") as HTMLInputElement | null;
  const fileInputCamera = $("file-input-camera") as HTMLInputElement | null;

  // 업로드 방식 선택 모달 제어
  const choiceModal = $("upload-choice-modal");
  const closeChoiceBtn = $("btn-close-upload-modal");
  const choiceOverlay = $("upload-choice-overlay");

  const openChoiceModal = () => {
    choiceModal?.classList.remove("hidden");
  };
  const closeChoiceModal = () => {
    choiceModal?.classList.add("hidden");
  };

  closeChoiceBtn?.addEventListener("click", closeChoiceModal);
  choiceOverlay?.addEventListener("click", closeChoiceModal);

  $("btn-choose-file")?.addEventListener("click", () => {
    closeChoiceModal();
    fileInputPdf?.click();
  });

  $("btn-choose-camera")?.addEventListener("click", () => {
    closeChoiceModal();
    fileInputCamera?.click();
  });

  let isPdfJsLoaded = false;
  function loadPdfJs(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (isPdfJsLoaded || (window as any).pdfjsLib) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      script.onload = () => {
        isPdfJsLoaded = true;
        // workerSrc 설정
        (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        resolve();
      };
      script.onerror = () => reject(new Error("PDF 디코딩 엔진(pdf.js) 라이브러리를 로드할 수 없습니다. 오프라인 상태이거나 네트워크 연결을 검출하십시오."));
      document.head.appendChild(script);
    });
  }

  /**
   * PDF에서 텍스트를 추출하는 함수 (좌표 기반 정렬 + 암호 해제 지원)
   * ──────────────────────────────────────────────────────────────
   * 
   * [암호화된 PDF 자동 해제 로직]
   *   1단계: 암호 없이 열기 시도
   *   2단계: 실패 시 → 전역 birthDate에서 6자리/8자리 등 여러 포맷으로 자동 시도
   *         (국민건강보험 검진 결과 PDF는 생년월일 6자리로 암호 보호)
   *   3단계: 그래도 실패 → 사용자에게 비밀번호 입력 안내 (prompt)
   * 
   * [좌표 기반 텍스트 정렬]
   *   - 각 텍스트 아이템의 y좌표(transform[5])를 기준으로 같은 행을 그룹화
   *   - 같은 행 내에서 x좌표(transform[4]) 순서로 정렬
   *   - 인접 텍스트 아이템 간의 x좌표 간격이 크면 탭(구분자) 삽입
   *   → 실제 PDF 테이블 레이아웃이 텍스트로 충실히 복원됩니다.
   */
  async function extractTextFromPdf(file: File): Promise<string> {
    await loadPdfJs();
    const pdfjsLib = (window as any).pdfjsLib;
    const arrayBuffer = await file.arrayBuffer();

    // ────────────────────────────────────────────────────
    // PDF 문서 열기 (암호 해제 자동 시도 포함)
    // ────────────────────────────────────────────────────
    let pdf: any = null;

    /**
     * 생년월일로부터 가능한 비밀번호 후보 목록을 생성합니다.
     * 예: birthDate = "19900101" 또는 "900101"
     * → ["900101", "19900101", "0101"] 등 다양한 포맷 시도
     */
    function generateBirthPasswordCandidates(birth: string): string[] {
      const candidates: string[] = [];
      // 원본 값 그대로
      if (birth) candidates.push(birth);

      // 숫자만 추출 (하이픈, 점 등 제거)
      const digits = birth.replace(/\D/g, "");
      if (digits && !candidates.includes(digits)) candidates.push(digits);

      if (digits.length === 8) {
        // "19900101" → "900101" (뒤 6자리)
        const sixDigit = digits.substring(2);
        if (!candidates.includes(sixDigit)) candidates.push(sixDigit);
        // "19900101" → "0101" (월일 4자리)
        const fourDigit = digits.substring(4);
        if (!candidates.includes(fourDigit)) candidates.push(fourDigit);
      } else if (digits.length === 6) {
        // "900101" → 그대로 사용 (이미 추가됨)
        // "900101" → "19900101" (앞에 19 추가 시도)
        const expanded = (parseInt(digits.substring(0, 2)) >= 50 ? "19" : "20") + digits;
        if (!candidates.includes(expanded)) candidates.push(expanded);
      }
      return candidates;
    }

    /**
     * 특정 암호로 PDF를 열기 시도하는 내부 함수
     * 성공 시 PDF 객체 반환, 실패 시 null 반환
     */
    async function tryOpenPdf(password?: string): Promise<any> {
      try {
        const options: any = { data: arrayBuffer.slice(0) };
        if (password !== undefined) options.password = password;
        const loadingTask = pdfjsLib.getDocument(options);
        return await loadingTask.promise;
      } catch (err: any) {
        // 암호 관련 에러인지 확인
        if (err?.name === "PasswordException" || 
            err?.message?.includes("password") || 
            err?.message?.includes("Password")) {
          return null; // 암호 에러 → null 반환 (재시도 가능)
        }
        throw err; // 다른 에러는 그대로 throw
      }
    }

    // 1단계: 암호 없이 시도
    pdf = await tryOpenPdf();

    // 2단계: 실패 시 → 생년월일 기반 비밀번호 자동 시도
    if (!pdf && birthDate) {
      const candidates = generateBirthPasswordCandidates(birthDate);
      console.log(`[PDF] 암호화 PDF 감지 → 생년월일 기반 ${candidates.length}개 비밀번호 자동 시도 중...`);
      
      for (const pwd of candidates) {
        pdf = await tryOpenPdf(pwd);
        if (pdf) {
          console.log(`[PDF] ✅ 생년월일 기반 비밀번호(${pwd.substring(0, 2)}****)로 PDF 잠금 해제 성공!`);
          break;
        }
      }
    }

    // 3단계: 여전히 실패 → 사용자에게 비밀번호 직접 입력 요청
    if (!pdf) {
      let userAttempts = 0;
      const MAX_ATTEMPTS = 3;

      while (!pdf && userAttempts < MAX_ATTEMPTS) {
        userAttempts++;
        const userPassword = prompt(
          `🔒 암호화된 PDF 파일입니다.\n\n` +
          `국민건강보험 건강검진 결과 통보서는 보통\n` +
          `생년월일 6자리(예: 900101)로 암호가 설정되어 있습니다.\n\n` +
          `비밀번호를 입력해 주세요 (${userAttempts}/${MAX_ATTEMPTS} 시도):`
        );

        if (userPassword === null) {
          // 사용자가 취소 버튼 클릭
          throw new Error("PDF 비밀번호 입력이 취소되었습니다. 암호가 해제된 PDF를 다시 업로드해 주세요.");
        }

        if (userPassword.trim()) {
          pdf = await tryOpenPdf(userPassword.trim());
          if (pdf) {
            console.log(`[PDF] ✅ 사용자 입력 비밀번호로 PDF 잠금 해제 성공!`);
          } else if (userAttempts < MAX_ATTEMPTS) {
            alert(`❌ 비밀번호가 일치하지 않습니다. 다시 시도해 주세요. (${MAX_ATTEMPTS - userAttempts}회 남음)`);
          }
        }
      }

      if (!pdf) {
        throw new Error(
          "PDF 비밀번호 해제에 실패했습니다 (3회 초과).\n" +
          "① 생년월일 6자리를 정확히 입력했는지 확인하세요.\n" +
          "② 건강보험공단 앱에서 '비밀번호 없이 저장'으로 다시 다운로드해 보세요."
        );
      }
    }

    // ────────────────────────────────────────────────────
    // PDF 텍스트 좌표 기반 추출 (기존 로직)
    // ────────────────────────────────────────────────────
    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      // 1단계: 빈 문자열이 아닌 텍스트 아이템만 추출하고 좌표를 보존
      const items: Array<{ str: string; x: number; y: number; width: number }> = [];
      for (const item of textContent.items) {
        if (!item.str || item.str.trim() === "") continue;
        // transform 배열: [scaleX, skewX, skewY, scaleY, translateX, translateY]
        const x = item.transform ? item.transform[4] : 0;
        const y = item.transform ? item.transform[5] : 0;
        const width = item.width || item.str.length * 5; // 폭 추정
        items.push({ str: item.str, x, y, width });
      }

      // 2단계: y좌표 기준으로 같은 행 그룹화 (y좌표 차이 3pt 이하 = 같은 행)
      const ROW_TOLERANCE = 3;
      const rows: Map<number, typeof items> = new Map();

      for (const item of items) {
        let matchedRowY: number | null = null;
        for (const rowY of rows.keys()) {
          if (Math.abs(rowY - item.y) <= ROW_TOLERANCE) {
            matchedRowY = rowY;
            break;
          }
        }
        if (matchedRowY !== null) {
          rows.get(matchedRowY)!.push(item);
        } else {
          rows.set(item.y, [item]);
        }
      }

      // 3단계: 행을 y좌표 내림차순(위에서 아래로)으로 정렬
      const sortedRowKeys = Array.from(rows.keys()).sort((a, b) => b - a);

      // 4단계: 각 행 내 아이템을 x좌표 오름차순으로 정렬 후 텍스트 조합
      const GAP_THRESHOLD = 15;
      for (const rowY of sortedRowKeys) {
        const rowItems = rows.get(rowY)!;
        rowItems.sort((a, b) => a.x - b.x);

        let lineText = "";
        for (let j = 0; j < rowItems.length; j++) {
          if (j > 0) {
            const prevEnd = rowItems[j - 1].x + rowItems[j - 1].width;
            const gap = rowItems[j].x - prevEnd;
            lineText += gap > GAP_THRESHOLD ? "\t" : (gap > 1 ? " " : "");
          }
          lineText += rowItems[j].str;
        }
        fullText += lineText.trim() + "\n";
      }
      fullText += "\n"; // 페이지 구분
    }
    return fullText;
  }

  /**
   * PDF/텍스트에서 건강 검진 지표를 정규식으로 추출하는 핵심 파서
   * ──────────────────────────────────────────────────────────
   * 
   * [개선 포인트]
   * 1. 줄 단위 매칭 우선 → 좌표 기반 텍스트 추출(extractTextFromPdf 개선)과 시너지
   * 2. 혈압 패턴: 날짜(2025/01), 페이지(1/3) 오매칭 방지
   * 3. 총콜레스테롤: HDL/LDL 앞에 있으면 제외
   * 4. 혈당: "당뇨"/"혈당" 단독 키워드 제거 → "공복혈당", "식전혈당" 등 정밀 매칭
   * 5. 추가 지표(AST, ALT, r-GTP, 크레아티닌, eGFR, 헤모글로빈, HDL, LDL, 중성지방, 신장, 체중, 허리둘레)
   * 6. hasAnyMetric → !== undefined 방식으로 0값 누락 방지
   */
  function parseHealthMetrics(text: string, filename: string): { 
    systolicBP?: number; 
    diastolicBP?: number; 
    fastingGlucose?: number; 
    totalCholesterol?: number; 
    bmi?: number;
    fattyLiver?: string;
    hba1c?: number;
    homaIr?: number;
    cdRatio?: number;
    retinaMsg?: string;
    year?: number;
  } | null {
    if (!text) return null;
    const norm = text.toLowerCase();
    const metrics: any = {};

    // ────────────────────────────────────────────────────
    // 유틸: 줄 단위 분리 (좌표 기반 추출의 각 행이 하나의 줄)
    // ────────────────────────────────────────────────────
    const lines = text.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
    
    // 전체 텍스트를 공백 정규화한 버전 (폴백 매칭용)
    const cleanText = text.replace(/\s+/g, " ");

    // ────────────────────────────────────────────────────
    // 유틸: 줄에서 숫자 추출하는 헬퍼 함수
    // ────────────────────────────────────────────────────
    function findValueInLine(line: string, pattern: RegExp): number | null {
      const m = pattern.exec(line);
      if (m) return parseFloat(m[1]);
      return null;
    }

    // 특정 키워드가 포함된 줄을 찾아 수치를 추출하는 헬퍼
    function findMetricByKeyword(keywords: string[], valuePattern: RegExp, min: number, max: number): number | null {
      // 1차: 줄 단위 매칭 (좌표 기반 추출에서 같은 행에 키워드+수치가 있는 경우)
      for (const line of lines) {
        const lineLower = line.toLowerCase().replace(/\s+/g, "");
        const matched = keywords.some(kw => lineLower.includes(kw.replace(/\s+/g, "")));
        if (matched) {
          const val = findValueInLine(line, valuePattern);
          if (val !== null && val >= min && val <= max) return val;
        }
      }
      // 2차: 전체 텍스트에서 정규식 매칭 (줄 구분 없이 폴백)
      return null;
    }

    // ────────────────────────────────────────────────────
    // 0. 연도 추출
    // ────────────────────────────────────────────────────
    let year = new Date().getFullYear();
    const fileYearMatch = filename.match(/(20\d{2})/);
    if (fileYearMatch) {
      year = parseInt(fileYearMatch[1]);
    } else {
      // 텍스트에서 "검진일", "검사일", "발급일" 근처 연도 우선
      for (const line of lines) {
        if (/검진일|검사일|발급일|검진.*일자|수검일/.test(line)) {
          const ym = line.match(/(20\d{2})/);
          if (ym) { year = parseInt(ym[1]); break; }
        }
      }
      // 못 찾았으면 텍스트 전체에서 찾기
      if (year === new Date().getFullYear()) {
        const textYears = text.match(/(20[12]\d)/g);
        if (textYears && textYears.length > 0) {
          const validYears = textYears.map(y => parseInt(y)).filter(y => y >= 2010 && y <= new Date().getFullYear() + 2);
          if (validYears.length > 0) year = validYears[0];
        }
      }
    }
    metrics.year = year;

    // ────────────────────────────────────────────────────
    // 1. 혈압 매칭 (수축기 / 이완기) — 개선된 로직
    // ────────────────────────────────────────────────────

    // 1-A: 줄 단위로 "혈압" 관련 키워드가 있는 줄에서 "수축기/이완기" 또는 "숫자/숫자" 패턴 찾기
    const bpKeywords = ["혈압", "blood pressure", "bp"];
    for (const line of lines) {
      const lineLower = line.toLowerCase().replace(/\s+/g, "");
      if (!bpKeywords.some(kw => lineLower.includes(kw.replace(/\s+/g, "")))) continue;

      // "135/85" 또는 "135 / 85" 패턴 (혈압 키워드가 있는 줄에서만!)
      const bpSlashMatch = /(\d{2,3})\s*[\/]\s*(\d{2,3})/.exec(line);
      if (bpSlashMatch) {
        const s = parseInt(bpSlashMatch[1]), d = parseInt(bpSlashMatch[2]);
        if (s >= 80 && s <= 210 && d >= 40 && d <= 130) {
          metrics.systolicBP = s;
          metrics.diastolicBP = d;
          break;
        }
      }
    }

    // 1-B: "수축기" / "이완기" 개별 키워드 줄 단위 매칭
    if (metrics.systolicBP === undefined) {
      const sysVal = findMetricByKeyword(
        ["수축기", "최고혈압", "수축기혈압", "systolic"],
        /(\d{2,3})/,
        80, 210
      );
      if (sysVal !== null) metrics.systolicBP = sysVal;
    }
    if (metrics.diastolicBP === undefined) {
      const diaVal = findMetricByKeyword(
        ["이완기", "최저혈압", "이완기혈압", "diastolic"],
        /(\d{2,3})/,
        40, 130
      );
      if (diaVal !== null) metrics.diastolicBP = diaVal;
    }

    // 1-C: 폴백 — 전체 텍스트에서 "혈압" 키워드 근처의 숫자/숫자 패턴
    if (metrics.systolicBP === undefined) {
      const sysMatch = /(?:수\s*축\s*기|최\s*고\s*혈\s*압)\s*(?:혈\s*압)?\s*[:\s\-=\t]*\s*(\d{2,3})/i.exec(cleanText);
      if (sysMatch) {
        const v = parseInt(sysMatch[1]);
        if (v >= 80 && v <= 210) metrics.systolicBP = v;
      }
    }
    if (metrics.diastolicBP === undefined) {
      const diaMatch = /(?:이\s*완\s*기|최\s*저\s*혈\s*압)\s*(?:혈\s*압)?\s*[:\s\-=\t]*\s*(\d{2,3})/i.exec(cleanText);
      if (diaMatch) {
        const v = parseInt(diaMatch[1]);
        if (v >= 40 && v <= 130) metrics.diastolicBP = v;
      }
    }

    // ────────────────────────────────────────────────────
    // 2. 공복 혈당 — "공복", "식전" 키워드 필수
    // ────────────────────────────────────────────────────
    const glucoseVal = findMetricByKeyword(
      ["공복혈당", "공복 혈당", "식전혈당", "식전 혈당", "공복 식전", "fasting glucose", "fasting blood sugar"],
      /(\d{2,3})/,
      40, 400
    );
    if (glucoseVal !== null) {
      metrics.fastingGlucose = glucoseVal;
    } else {
      // 폴백: 전체 텍스트에서 정밀 매칭 (공복/식전 키워드 필수)
      const gm = /(?:공\s*복\s*(?:식\s*전)?\s*혈\s*당|식\s*전\s*혈\s*당|fasting\s*(?:blood\s*)?(?:glucose|sugar))\s*[:\s\-=\t]*\s*(\d{2,3})/i.exec(cleanText);
      if (gm) {
        const v = parseInt(gm[1]);
        if (v >= 40 && v <= 400) metrics.fastingGlucose = v;
      }
    }

    // ────────────────────────────────────────────────────
    // 3. 총 콜레스테롤 — HDL/LDL/중성지방 구분
    // ────────────────────────────────────────────────────
    // 줄 단위: "총콜레스테롤" 또는 "total cholesterol"이 있는 줄 우선
    const cholVal = findMetricByKeyword(
      ["총콜레스테롤", "총 콜레스테롤", "total cholesterol", "t-cholesterol", "t-chol"],
      /(\d{2,3})/,
      80, 500
    );
    if (cholVal !== null) {
      metrics.totalCholesterol = cholVal;
    } else {
      // 폴백: "총" 키워드가 있으면서 "콜레스테롤" 매칭 (HDL/LDL 제외)
      // "총콜레스테롤" 또는 "(총)콜레스테롤" 패턴
      const cm = /(?:총\s*)콜\s*레\s*스\s*테\s*롤\s*[:\s\-=\t]*\s*(\d{2,3})/i.exec(cleanText);
      if (cm) {
        const v = parseInt(cm[1]);
        if (v >= 80 && v <= 500) metrics.totalCholesterol = v;
      }
      // 그래도 못 찾으면 "콜레스테롤" 단독 (단, HDL/LDL이 아닌 것만)
      if (metrics.totalCholesterol === undefined) {
        for (const line of lines) {
          const ll = line.toLowerCase();
          if (ll.includes("콜레스테롤") && !ll.includes("hdl") && !ll.includes("ldl") && !ll.includes("중성")) {
            const vm = /(\d{2,3})/.exec(line);
            if (vm) {
              const v = parseInt(vm[1]);
              if (v >= 80 && v <= 500) { metrics.totalCholesterol = v; break; }
            }
          }
        }
      }
    }

    // ────────────────────────────────────────────────────
    // 4. 체질량지수 (BMI)
    // ────────────────────────────────────────────────────
    const bmiVal2 = findMetricByKeyword(
      ["bmi", "체질량지수", "체질량 지수", "체질량"],
      /(\d{1,2}(?:\.\d+)?)/, 10, 50
    );
    if (bmiVal2 !== null) {
      metrics.bmi = bmiVal2;
    } else {
      const bm = /(?:b\s*m\s*i|체\s*질\s*량\s*(?:지\s*수)?)\s*[:\s\-=\t]*\s*(\d{1,2}(?:\.\d+)?)/i.exec(cleanText);
      if (bm) {
        const v = parseFloat(bm[1]);
        if (v >= 10 && v <= 50) metrics.bmi = v;
      }
    }

    // ────────────────────────────────────────────────────
    // 5. 추가 핵심 지표들 (기존 + 신규)
    // ────────────────────────────────────────────────────

    // 5-1. 지방간 소견
    if (norm.includes("지방간") || norm.includes("fatty liver") || norm.includes("bright liver")) {
      metrics.fattyLiver = norm.includes("중등도") || norm.includes("moderate") ? "Moderate" : "Mild";
    }

    // 5-2. 당화혈색소(HbA1c)
    const hba1cVal = findMetricByKeyword(
      ["당화혈색소", "hba1c", "hemoglobin a1c", "glycated"],
      /(\d+(?:\.\d+)?)/, 3.0, 15.0
    );
    if (hba1cVal !== null) {
      metrics.hba1c = hba1cVal;
    } else {
      const hm = /(?:당\s*화\s*혈\s*색\s*소|hba1c)\s*[:\s\-=\t]*\s*(\d+(?:\.\d+)?)/i.exec(cleanText);
      if (hm) metrics.hba1c = parseFloat(hm[1]);
    }

    // 5-3. HOMA-IR 인슐린저항성
    const homaVal = findMetricByKeyword(
      ["homa-ir", "homa ir", "인슐린저항성", "인슐린 저항성"],
      /(\d+(?:\.\d+)?)/, 0.1, 20.0
    );
    if (homaVal !== null) {
      metrics.homaIr = homaVal;
    } else {
      const hom = /homa[-_\s]*ir\s*[:\s\-=\t]*\s*(\d+(?:\.\d+)?)/i.exec(cleanText);
      if (hom) metrics.homaIr = parseFloat(hom[1]);
    }

    // 5-4. C/D Ratio (함몰비)
    const cdVal = findMetricByKeyword(
      ["함몰비", "c/d ratio", "c/d"],
      /(\d+(?:\.\d+)?)/, 0.01, 1.0
    );
    if (cdVal !== null) {
      metrics.cdRatio = cdVal;
    } else {
      const cdm = /(?:함\s*몰\s*비|c\/d\s*ratio)\s*[:\s\-=\t]*\s*(\d+(?:\.\d+)?)/i.exec(cleanText);
      if (cdm) metrics.cdRatio = parseFloat(cdm[1]);
    }

    // 5-5. 안저/망막 소견
    if (norm.includes("망막") || norm.includes("황반") || norm.includes("안저") || norm.includes("fundus")) {
      metrics.retinaMsg = "주의";
    }

    // 5-6. 간기능 AST (SGOT)
    const astVal = findMetricByKeyword(
      ["ast", "sgot", "ast(got)", "ast (got)"],
      /(\d{1,4})/, 1, 2000
    );
    if (astVal !== null) metrics.ast = astVal;

    // 5-7. 간기능 ALT (SGPT)
    const altVal = findMetricByKeyword(
      ["alt", "sgpt", "alt(gpt)", "alt (gpt)"],
      /(\d{1,4})/, 1, 2000
    );
    if (altVal !== null) metrics.alt = altVal;

    // 5-8. 감마 GTP (r-GTP)
    const rgtpVal = findMetricByKeyword(
      ["r-gtp", "γ-gtp", "감마gtp", "감마 gtp", "ggt"],
      /(\d{1,4})/, 1, 2000
    );
    if (rgtpVal !== null) metrics.rGtp = rgtpVal;

    // 5-9. 크레아티닌
    const crVal = findMetricByKeyword(
      ["크레아티닌", "creatinine"],
      /(\d+(?:\.\d+)?)/, 0.1, 20.0
    );
    if (crVal !== null) metrics.creatinine = crVal;

    // 5-10. 사구체여과율 (eGFR)
    const egfrVal = findMetricByKeyword(
      ["사구체여과율", "egfr", "gfr"],
      /(\d{1,3})/, 5, 200
    );
    if (egfrVal !== null) metrics.egfr = egfrVal;

    // 5-11. 혈색소 (헤모글로빈)
    const hbVal = findMetricByKeyword(
      ["혈색소", "헤모글로빈", "hemoglobin"],
      /(\d+(?:\.\d+)?)/, 3.0, 25.0
    );
    if (hbVal !== null) metrics.hemoglobin = hbVal;

    // 5-12. HDL 콜레스테롤
    const hdlVal = findMetricByKeyword(
      ["hdl콜레스테롤", "hdl 콜레스테롤", "hdl-c", "hdl"],
      /(\d{2,3})/, 10, 150
    );
    if (hdlVal !== null) metrics.hdlCholesterol = hdlVal;

    // 5-13. LDL 콜레스테롤
    const ldlVal = findMetricByKeyword(
      ["ldl콜레스테롤", "ldl 콜레스테롤", "ldl-c", "ldl"],
      /(\d{2,3})/, 20, 400
    );
    if (ldlVal !== null) metrics.ldlCholesterol = ldlVal;

    // 5-14. 중성지방 (트리글리세리드)
    const tgVal = findMetricByKeyword(
      ["중성지방", "triglyceride", "트리글리세리드", "tg"],
      /(\d{2,4})/, 20, 2000
    );
    if (tgVal !== null) metrics.triglycerides = tgVal;

    // 5-15. 신장 (키)
    const heightVal = findMetricByKeyword(
      ["신장", "키", "height"],
      /(\d{2,3}(?:\.\d+)?)/, 100, 250
    );
    if (heightVal !== null) metrics.height = heightVal;

    // 5-16. 체중
    const weightVal = findMetricByKeyword(
      ["체중", "몸무게", "weight"],
      /(\d{2,3}(?:\.\d+)?)/, 20, 300
    );
    if (weightVal !== null) metrics.weight = weightVal;

    // 5-17. 허리둘레
    const waistVal = findMetricByKeyword(
      ["허리둘레", "복부둘레", "waist"],
      /(\d{2,3}(?:\.\d+)?)/, 40, 200
    );
    if (waistVal !== null) metrics.waist = waistVal;

    // 5-18. 요단백
    for (const line of lines) {
      const ll = line.toLowerCase();
      if (ll.includes("요단백") || ll.includes("urine protein") || ll.includes("소변단백")) {
        if (ll.includes("양성") || /\(\+\)|\+\s/.test(line)) {
          metrics.urineProtein = "양성(+)";
        } else if (ll.includes("음성") || /\(-\)|\-\s/.test(line)) {
          metrics.urineProtein = "음성(-)";
        } else {
          metrics.urineProtein = "확인필요";
        }
        break;
      }
    }

    // ────────────────────────────────────────────────────
    // 6. 최소 1개 이상의 유효 지표가 있는지 판단 (0도 유효한 값으로 인정)
    // ────────────────────────────────────────────────────
    const metricKeys = [
      "systolicBP", "diastolicBP", "fastingGlucose", "totalCholesterol", "bmi",
      "fattyLiver", "hba1c", "homaIr", "cdRatio", "retinaMsg",
      "ast", "alt", "rGtp", "creatinine", "egfr", "hemoglobin",
      "hdlCholesterol", "ldlCholesterol", "triglycerides",
      "height", "weight", "waist", "urineProtein"
    ];
    const hasAnyMetric = metricKeys.some(k => metrics[k] !== undefined);
    
    if (!hasAnyMetric) {
      return null;
    }
    return metrics;
  }

  async function processSelectedFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    
    // 프리셋 선택은 해제
    const select = $("select-pdf-preset") as HTMLSelectElement | null;
    if (select) select.value = "";

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const sizeStr = formatBytes(file.size);
      
      const fileIndex = uploadedFiles.length;
      uploadedFiles.push({
        name: file.name,
        size: sizeStr,
        customText: "",
        isParsing: true,
        parseFailed: false,
        metrics: null
      });

      renderUploadedFilesList();
      updateAuthProgress();

      // 파일 업로드 시작 로그
      logAccessEvent("step2_file_upload_start", { fileName: file.name, fileSize: sizeStr, fileType: file.type });

      try {
        let extractedText = "";
        
        if (file.type === "text/plain") {
          extractedText = await file.text();
        } else if (file.name.endsWith(".pdf") || file.type === "application/pdf") {
          extractedText = await extractTextFromPdf(file);
        } else if (file.type.startsWith("image/")) {
          throw new Error("이미지 파일 형식은 클라이언트 브라우저 로컬 파싱이 불가능합니다. 'AI 웰니스 정밀 분석' 버튼을 누르시면 클라우드 서버 OCR 엔진을 연동하여 정확한 지표 인덱싱이 정상 실행됩니다.");
        } else {
          throw new Error("미지원 파일 확장자입니다. 검안 지명서 혹은 PDF/텍스트 형식의 건강검진 성적표를 업로드해 주세요.");
        }

        if (!extractedText.trim()) {
          throw new Error("파일 내부에서 추출 가능한 인쇄 텍스트 문단을 발견하지 못했습니다. 파일 내용이 유효한지 검인하십시오.");
        }

        const metricsResult = parseHealthMetrics(extractedText, file.name);
        
        uploadedFiles[fileIndex].customText = extractedText;
        uploadedFiles[fileIndex].metrics = metricsResult;
        uploadedFiles[fileIndex].isParsing = false;
        
        if (!metricsResult) {
          uploadedFiles[fileIndex].parseFailed = true;
          uploadedFiles[fileIndex].parseErrorMessage = "핵심 NHIS 대사항목(혈압, 혈당, 콜레스테롤, BMI 중 하나)이 가독 한도를 초과하거나 누락되었습니다. 실제 공단 표준 건강검진 PDF 양식을 업로드하십시오.";
          logAccessEvent("step2_file_parse_partial", { fileName: file.name, reason: "No metrics matched on text analysis" });
        } else {
          logAccessEvent("step2_file_parse_success", { fileName: file.name, metrics: metricsResult });
        }
      } catch (err: any) {
        uploadedFiles[fileIndex].customText = `[가독오류 발령]\n파일명: ${file.name}\n사유: ${err.message || err}`;
        uploadedFiles[fileIndex].isParsing = false;
        uploadedFiles[fileIndex].parseFailed = true;
        uploadedFiles[fileIndex].parseErrorMessage = err.message || "파일을 텍스트로 읽는 데 실패했습니다.";
        logAccessEvent("step2_file_parse_error", { fileName: file.name, error: err.message || err });
      }

      renderUploadedFilesList();
      updateAuthProgress();
    }
  }

  // 실제 파일 선택 이벤트 연동
  fileInputPdf?.addEventListener("change", (e) => {
    const input = e.target as HTMLInputElement;
    processSelectedFiles(input.files);
    input.value = ""; // 초기화하여 동일 파일 재선택 허용
  });

  fileInputCamera?.addEventListener("change", (e) => {
    const input = e.target as HTMLInputElement;
    processSelectedFiles(input.files);
    input.value = "";
  });

  if (dragZone) {
    dragZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dragZone.classList.add("border-[#f37321]", "bg-[#fff5ee]");
    });
    dragZone.addEventListener("dragleave", () => {
      if (uploadedFiles.length === 0) {
        dragZone.classList.remove("border-[#f37321]", "bg-[#fff5ee]");
      }
    });
    dragZone.addEventListener("drop", (e) => {
      e.preventDefault();
      const nameInput = $("input-username") as HTMLInputElement;
      const birthInput = $("input-birth") as HTMLInputElement;
      const curName = nameInput ? nameInput.value.trim() : "";
      const curBirth = birthInput ? birthInput.value.trim() : "";

      if (!curName) {
        alert("이름을 기재해 하십시오.");
        nameInput?.focus();
        logAccessEvent("validation_failure", {
          context: "file_drag_drop",
          field: "userName",
          error: "이름 누락",
          userName: "",
          birthDate: curBirth
        });
        return;
      }
      const birthVal = validateBirthDate(curBirth);
      if (!birthVal.valid) {
        alert(birthVal.errorMsg || "생년월일을 정확하게 입력하세요.");
        birthInput?.focus();
        logAccessEvent("validation_failure", {
          context: "file_drag_drop",
          field: "birthDate",
          error: birthVal.errorMsg || "생년월일 유효성 실패",
          userName: curName,
          birthDate: curBirth
        });
        return;
      }

      processSelectedFiles(e.dataTransfer?.files || null);
    });
    dragZone.addEventListener("click", (e) => {
      const nameInput = $("input-username") as HTMLInputElement;
      const birthInput = $("input-birth") as HTMLInputElement;
      const curName = nameInput ? nameInput.value.trim() : "";
      const curBirth = birthInput ? birthInput.value.trim() : "";

      if (!curName) {
        alert("이름을 기재해 하십시오.");
        nameInput?.focus();
        logAccessEvent("validation_failure", {
          context: "file_click_upload",
          field: "userName",
          error: "이름 누락",
          userName: "",
          birthDate: curBirth
        });
        e.preventDefault();
        return;
      }
      const birthVal = validateBirthDate(curBirth);
      if (!birthVal.valid) {
        alert(birthVal.errorMsg || "생년월일을 정확하게 입력하세요.");
        birthInput?.focus();
        logAccessEvent("validation_failure", {
          context: "file_click_upload",
          field: "birthDate",
          error: birthVal.errorMsg || "생년월일 유효성 실패",
          userName: curName,
          birthDate: curBirth
        });
        e.preventDefault();
        return;
      }

      // 모바일 환경 체크 (화면 너비 768px 미만 혹은 모바일 User Agent 감지)
      const isMobile = window.innerWidth < 768 || 
                       /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile) {
        openChoiceModal();
      } else {
        fileInputPdf?.click();
      }
    });
  }

  // 건강검진 기록 제출 제어
  $("btn-submit-health-record")?.addEventListener("click", () => {
    const nameInput = $("input-username") as HTMLInputElement;
    const birthInput = $("input-birth") as HTMLInputElement;
    if (nameInput) userName = nameInput.value;
    if (birthInput) birthDate = birthInput.value;

    if (!userName.trim()) {
      alert("이름을 기재해 하십시오.");
      nameInput?.focus();
      logAccessEvent("validation_failure", {
        context: "submit_health_record",
        field: "userName",
        error: "이름 누락",
        userName: "",
        birthDate: birthDate
      });
      return;
    }
    const birthVal = validateBirthDate(birthDate);
    if (!birthVal.valid) {
      alert(birthVal.errorMsg || "생년월일을 정확하게 입력하세요.");
      birthInput?.focus();
      logAccessEvent("validation_failure", {
        context: "submit_health_record",
        field: "birthDate",
        error: birthVal.errorMsg || "생년월일 유효성 실패",
        userName: userName,
        birthDate: birthDate
      });
      return;
    }
    if (uploadedFiles.length === 0) {
      alert("건강검진 결과서 파일을 업로드하거나 사진 촬영을 완료해주세요.");
      logAccessEvent("validation_failure", {
        context: "submit_health_record",
        field: "uploadedFiles",
        error: "업로드 결과서 없음",
        userName: userName,
        birthDate: birthDate
      });
      return;
    }
    isStep2Completed = true;
    updateAuthProgress();
  });

  // 하단 전면 CTA: Wellness Care AI Agent 분석 제어
  $("btn-final-analysis")?.addEventListener("click", () => {
    const nameInput = $("input-username") as HTMLInputElement;
    const birthInput = $("input-birth") as HTMLInputElement;
    if (nameInput) userName = nameInput.value;
    if (birthInput) birthDate = birthInput.value;

    if (!userName.trim()) {
      alert("이름을 기재해 하십시오.");
      nameInput?.focus();
      logAccessEvent("validation_failure", {
        context: "final_analysis",
        field: "userName",
        error: "이름 누락",
        userName: "",
        birthDate: birthDate
      });
      return;
    }
    const birthVal = validateBirthDate(birthDate);
    if (!birthVal.valid) {
      alert(birthVal.errorMsg || "생년월일을 정확하게 입력하세요.");
      birthInput?.focus();
      logAccessEvent("validation_failure", {
        context: "final_analysis",
        field: "birthDate",
        error: birthVal.errorMsg || "생년월일 유효성 실패",
        userName: userName,
        birthDate: birthDate
      });
      return;
    }
    if (!isStep1Completed && !isStep2Completed) {
      alert("건강검진공단 기록을 가져오거나 건강검진 기록을 직접 업로드 하시면 분석이 가능합니다.");
      logAccessEvent("validation_failure", {
        context: "final_analysis",
        field: "analysis_data_missing",
        error: "공단 동기화 및 파일 업로드 모두 미처리 상태에서 분석 요청",
        userName: userName,
        birthDate: birthDate
      });
      return;
    }
    triggerAIAnalysis();
  });

  // CODEF 모달 열기 제어
  $("btn-open-sync-modal")?.addEventListener("click", () => {
    const nameInput = $("input-username") as HTMLInputElement;
    const birthInput = $("input-birth") as HTMLInputElement;
    if (nameInput) userName = nameInput.value;
    if (birthInput) birthDate = birthInput.value;

    if (!userName.trim()) {
      alert("이름을 기재해 하십시오.");
      nameInput?.focus();
      logAccessEvent("validation_failure", {
        context: "open_sync_modal",
        field: "userName",
        error: "이름 누락",
        userName: "",
        birthDate: birthDate
      });
      return;
    }
    const birthVal = validateBirthDate(birthDate);
    if (!birthVal.valid) {
      alert(birthVal.errorMsg || "생년월일을 정확하게 입력하세요.");
      birthInput?.focus();
      logAccessEvent("validation_failure", {
        context: "open_sync_modal",
        field: "birthDate",
        error: birthVal.errorMsg || "생년월일 유효성 실패",
        userName: userName,
        birthDate: birthDate
      });
      return;
    }
    step3Auth.openSyncModal();
  });

  // 🔒 본인인증 모달 닫기 및 이벤트 바인딩 위임
  $("btn-close-modal")?.addEventListener("click", () => {
    step3Auth.closeSyncModal();
  });
  step3Auth.bindAuthModalEvents(step3Ctx);

  // 다시 동기화버튼 (초기 단계로 원복)
  $("btn-re-sync")?.addEventListener("click", () => {
    currentStep = "auth";
    updateStepView();
    // 상단 요약 배지 숨김
    $("top-user-badge")?.classList.add("hidden");
    resetAuthStates();
  });

  // 📊 CODEF 동기화 결과 모달 팝업 컨트롤
  $("link-open-codef-summary")?.addEventListener("click", () => {
    $("codef-summary-modal-wrapper")?.classList.remove("hidden");
  });

  $("btn-close-codef-summary")?.addEventListener("click", () => {
    $("codef-summary-modal-wrapper")?.classList.add("hidden");
  });

  $("codef-summary-overlay")?.addEventListener("click", () => {
    $("codef-summary-modal-wrapper")?.classList.add("hidden");
  });

  // 📁 파일 업로드 파싱 결과 모달 팝업 컨트롤
  $("link-open-parsed-file")?.addEventListener("click", () => {
    $("parsed-file-summary-modal-wrapper")?.classList.remove("hidden");
  });

  $("btn-close-parsed-file-summary")?.addEventListener("click", () => {
    $("parsed-file-summary-modal-wrapper")?.classList.add("hidden");
  });

  $("parsed-file-summary-overlay")?.addEventListener("click", () => {
    $("parsed-file-summary-modal-wrapper")?.classList.add("hidden");
  });

  // 대시보드 탭 스위치
  $$(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab") as "report" | "trends" | "action" | "chat" | null;
      if (tab) {
        switchTab(tab);
      }
    });
  });

  // 차트 시계열 지표 스위치 (전체 디바이스 스크롤링 알약형 탭 버튼 바)
  $$(".metric-select-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const metric = btn.getAttribute("data-metric");
      if (metric) {
        switchMetric(metric); // 수동 지정형 지표 전환
      }
    });
  });

  // 🎠 년도별 검진이력 카드 캐러샐 이전 버튼 클릭
  $("btn-year-carousel-prev")?.addEventListener("click", () => {
    switchYearSlide(currentYearSlideIndex - 1, true); // 수동 기동
  });

  // 🎠 년도별 검진이력 카드 캐러샐 다음 버튼 클릭
  $("btn-year-carousel-next")?.addEventListener("click", () => {
    switchYearSlide(currentYearSlideIndex + 1, true); // 수동 기동
  });

  // 🎠 년도별 검진이력 카드 캐러샐 하단 도트 인디케이터 사건 위임 처리
  $("year-carousel-indicators-container")?.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest(".year-carousel-dot");
    if (target) {
      const idxStr = target.getAttribute("data-slide-index");
      if (idxStr !== null) {
        const idx = parseInt(idxStr, 10);
        if (!isNaN(idx)) {
          switchYearSlide(idx, true); // 특정 슬라이드로 수동 전환
        }
      }
    }
  });

  // 🎠 년도별 건강검진 요약 카드 캐러샐 손가락 터치 & 마우스 드래그 제스처 기능 (터치 스와이프 완벽 매칭)
  const carouselViewport = null; // $("year-carousel-viewport") - Disabled to allow individual category carousels to snap scroll independently
  if (carouselViewport) {
    let startX = 0;
    let currentX = 0;
    let isSwiping = false;

    // 터치 이벤트 지원 (모바일 극단적 쫀득함 튜닝)
    carouselViewport.addEventListener("touchstart", (e: any) => {
      if (e.touches && e.touches.length > 0) {
        startX = e.touches[0].clientX;
        currentX = startX;
        isSwiping = true;
      }
    }, { passive: true });

    carouselViewport.addEventListener("touchmove", (e: any) => {
      if (!isSwiping || !e.touches || e.touches.length === 0) return;
      currentX = e.touches[0].clientX;
    }, { passive: true });

    carouselViewport.addEventListener("touchend", () => {
      if (!isSwiping) return;
      isSwiping = false;
      const diffX = startX - currentX;
      
      // 반응성 극대화: 최소 핑거 스와이프 판정 값을 20px로 조율하여 미세 스와이프로도 물흐르듯 이동
      if (Math.abs(diffX) > 20 && currentX !== 0) {
        const recordsCount = nhisRecords.length;
        if (diffX > 0) {
          // 왼쪽 스와이프 (손가락을 왼쪽으로 밀기) -> 다음 과거 카드로 넘김
          if (currentYearSlideIndex < recordsCount - 1) {
            switchYearSlide(currentYearSlideIndex + 1, true);
          }
        } else {
          // 오른쪽 스와이프 (손가락을 오른쪽으로 밀기) -> 최신 방향 카드로 보냄
          if (currentYearSlideIndex > 0) {
            switchYearSlide(currentYearSlideIndex - 1, true);
          }
        }
      }
      startX = 0;
      currentX = 0;
    }, { passive: true });

    // 마우스 드래그 스와이프도 완벽하게 지원 (PC 브라우저 사용자 편의극대화)
    carouselViewport.style.cursor = "grab";
    carouselViewport.addEventListener("mousedown", (e: MouseEvent) => {
      startX = e.clientX;
      currentX = startX;
      isSwiping = true;
      carouselViewport.style.cursor = "grabbing";
    });

    window.addEventListener("mousemove", (e: MouseEvent) => {
      if (!isSwiping) return;
      currentX = e.clientX;
    });

    window.addEventListener("mouseup", () => {
      if (!isSwiping) return;
      isSwiping = false;
      carouselViewport.style.cursor = "grab";
      const diffX = startX - currentX;
      
      if (Math.abs(diffX) > 40 && currentX !== 0) {
        const recordsCount = nhisRecords.length;
        if (diffX > 0) {
          if (currentYearSlideIndex < recordsCount - 1) {
            switchYearSlide(currentYearSlideIndex + 1, true);
          }
        } else {
          if (currentYearSlideIndex > 0) {
            switchYearSlide(currentYearSlideIndex - 1, true);
          }
        }
      }
      startX = 0;
      currentX = 0;
    });
  }

  // 💬 챗봇 이벤트 리스너 통합 바인딩 등록 위임
  step4Dashboard.bindChatEvents(dashboardCtx);

  // 👪 가족력 선택(토글) 이벤트 리스너 배정
  $$(".family-factor-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const relation = btn.getAttribute("data-relation");
      const factor = btn.getAttribute("data-factor");
      if (!relation || !factor) return;

      if (relation === "father") {
        if (factor === "없음") {
          fatherFactors = ["없음"];
          $$(".family-factor-btn[data-relation='father']").forEach(b => {
            const f = b.getAttribute("data-factor");
            if (f === "없음") {
              b.classList.remove("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
              b.classList.add("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
            } else {
              b.classList.remove("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
              b.classList.add("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
            }
          });
        } else {
          fatherFactors = fatherFactors.filter(f => f !== "없음");
          const noneBtn = document.querySelector(".family-factor-btn[data-relation='father'][data-factor='없음']");
          if (noneBtn) {
            noneBtn.classList.remove("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
            noneBtn.classList.add("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
          }

          if (fatherFactors.includes(factor)) {
            fatherFactors = fatherFactors.filter(f => f !== factor);
            btn.classList.remove("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
            btn.classList.add("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
          } else {
            fatherFactors.push(factor);
            btn.classList.remove("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
            btn.classList.add("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
          }

          if (fatherFactors.length === 0) {
            fatherFactors = ["없음"];
            if (noneBtn) {
              noneBtn.classList.remove("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
              noneBtn.classList.add("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
            }
          }
        }
      } else if (relation === "mother") {
        if (factor === "없음") {
          motherFactors = ["없음"];
          $$(".family-factor-btn[data-relation='mother']").forEach(b => {
            const f = b.getAttribute("data-factor");
            if (f === "없음") {
              b.classList.remove("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
              b.classList.add("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
            } else {
              b.classList.remove("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
              b.classList.add("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
            }
          });
        } else {
          motherFactors = motherFactors.filter(f => f !== "없음");
          const noneBtn = document.querySelector(".family-factor-btn[data-relation='mother'][data-factor='없음']");
          if (noneBtn) {
            noneBtn.classList.remove("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
            noneBtn.classList.add("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
          }

          if (motherFactors.includes(factor)) {
            motherFactors = motherFactors.filter(f => f !== factor);
            btn.classList.remove("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
            btn.classList.add("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
          } else {
            motherFactors.push(factor);
            btn.classList.remove("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
            btn.classList.add("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
          }

          if (motherFactors.length === 0) {
            motherFactors = ["없음"];
            if (noneBtn) {
              noneBtn.classList.remove("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
              noneBtn.classList.add("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
            }
          }
        }
      }
    });
  });

  // 가족력 저장 및 Step 3 (공단 건강검진 가져오기) 오픈
  $("btn-submit-step2")?.addEventListener("click", () => {
    logAccessEvent("step2_family_history_submit", { father: fatherFactors, mother: motherFactors });

    const connector2 = $("step-2-3-connector");
    const card3 = $("step-3-card");
    if (connector2 && card3) {
      connector2.classList.remove("hidden");
      card3.classList.remove("hidden");
      card3.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
}

function showModalError(msg: string) {
  const banner = $("modal-error-banner");
  if (banner) {
    banner.innerText = msg;
    banner.classList.remove("hidden");
  }
}

// ========================================================
// 3. 모달 제어 및 카운트다운 타이머
// ========================================================
// (레거시 간편인증 제어 함수들은 step3Auth 뷰 모듈로 완전 이관되어 비활성화/삭제되었습니다.)

// ========================================================
// 5. AI 융합분석 파이프라인 기동 (analyze)
// ========================================================
function triggerAIAnalysis() {
  currentStep = "loading";
  updateStepView();

  const loadingFill = $("loading-bar-fill");
  const loadingPct = $("loading-bar-percent");
  const loadingText = $("loading-step-text");

  let stepIdx = 0;
  function animateLoader() {
    if (stepIdx < loadingSteps.length) {
      const step = loadingSteps[stepIdx];
      if (loadingText) loadingText.innerText = step.text;
      const pct = Math.min(100, Math.floor(((stepIdx + 1) / loadingSteps.length) * 100));
      if (loadingFill) loadingFill.style.width = `${pct}%`;
      if (loadingPct) loadingPct.innerText = `${pct}%`;

      setTimeout(() => {
        stepIdx++;
        animateLoader();
      }, step.duration);
    } else {
      executeAIReportFetch();
    }
  }
  animateLoader();
}

async function executeAIReportFetch() {
  const presetSelect = $("select-pdf-preset") as HTMLSelectElement | null;
  const selectPresetId = presetSelect ? presetSelect.value : "";
  const matchedPreset = samplePDFPresets.find(p => p.id === selectPresetId);

  const payload = {
    nhisData: {
      userName,
      gender,
      birthYear: birthDate ? "19" + birthDate.substring(0,2) : "1985",
      records: nhisRecords
    },
    uploadedPDF: uploadedFile ? {
      reportDate: "2025-05-15",
      institution: matchedPreset ? matchedPreset.institution : "사용자 업로드 소견서",
      fileName: uploadedFile.name,
      fileSize: uploadedFile.size,
      extractedHeadline: matchedPreset ? matchedPreset.headline : "전신 계통 추가 소견서 발견",
      extractedText: customPDFText
    } : null,
    familyHistory: {
      father: fatherFactors,
      mother: motherFactors
    },
    prescriptionData: prescriptionData
  };

  try {
    const res = await fetch("/api/health/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || "서버에서 결과 분석서를 제작하지 못했습니다.");
    }

    const data = await res.json();
    analysisResult = data;
    isSimulated = !!data.isSimulated;

    // 대시보드 화면 전개 및 렌더링
    currentStep = "dashboard";
    updateStepView();

    // 상단 세션 관리용 배지 노출
    const topBadge = $("top-user-badge");
    const topUser = $("top-username");
    if (topBadge && topUser) {
      topUser.innerText = `${userName}님`;
      topBadge.classList.remove("hidden");
    }

    // 탭 및 대화 초기화 후 대시보드 페인팅
    switchTab("trends");

  } catch (err: any) {
    console.error(err);
    alert(err.message || "AI 분석 도중 예기치 못한 에러가 초래되었습니다.");
    currentStep = "auth";
    updateStepView();
  }
}

// ========================================================
// 6. 스크린 뷰 동적 갱신 제어 (HTML hidden toggle)
// ========================================================
function updateStepView() {
  const sAuth = $("auth-container");
  const sLoad = $("loading-container");
  const sDash = $("dashboard-container");

  if (sAuth) sAuth.classList.add("hidden");
  if (sLoad) sLoad.classList.add("hidden");
  if (sDash) sDash.classList.add("hidden");

  // 스크린 전환 시 스크롤 포커스를 최상단으로 강제 초기화 (상 Sticky 헤더 가림 방지)
  window.scrollTo(0, 0);
  const viewport = $("app-viewport");
  if (viewport) {
    viewport.scrollTop = 0;
  }

  if (currentStep === "auth") {
    if (sAuth) sAuth.classList.remove("hidden");
  } else if (currentStep === "loading") {
    if (sLoad) sLoad.classList.remove("hidden");
    $("final-analysis-cta-container")?.classList.add("hidden");
  } else if (currentStep === "dashboard") {
    if (sDash) sDash.classList.remove("hidden");
    $("final-analysis-cta-container")?.classList.add("hidden");
    updateDashboardHeaderMeta();
  }
}

let isSwipeGuideShown = false;

function switchTab(tabName: "report" | "trends" | "action" | "chat" | "consulting") {
  // 탭 헤더 버튼 토글
  $$(".tab-btn").forEach((btn) => {
    const t = btn.getAttribute("data-tab");
    if (t === tabName) {
      btn.classList.remove("text-slate-600", "hover:bg-slate-50");
      btn.classList.add("bg-[#f37321]", "text-white");
    } else {
      btn.classList.add("text-slate-600", "hover:bg-slate-50");
      btn.classList.remove("bg-[#f37321]", "text-white");
    }
  });

  // 콘텐츠 디스플레이 토글
  $$(".tab-section").forEach((sec) => {
    sec.classList.add("hidden");
  });
  $(`section-${tabName}`)?.classList.remove("hidden");

  // 🔄 년도별 건강검진 카드 자동 캐러샐 회전 타이머 조율
  if (tabName === "trends") {
    startYearCarouselAutoRotation();

    // 💡 최초 진입 시 스와이프 안내 딤 오버레이 기동 (Task 5)
    const overlay = $("swipe-guide-overlay");
    if (overlay && !isSwipeGuideShown) {
      isSwipeGuideShown = true;
      overlay.classList.remove("hidden");

      const hideOverlay = () => {
        overlay.classList.add("opacity-0");
        setTimeout(() => {
          overlay.classList.add("hidden");
        }, 500);
      };

      overlay.addEventListener("click", hideOverlay);
      overlay.addEventListener("touchstart", hideOverlay, { passive: true });

      // 3초 후 자동 소거
      setTimeout(hideOverlay, 3000);
    }
  } else {
    stopYearCarouselAutoRotation();
  }

  // 각 탭별 전용 렌더링 파이프라인 연결
  if (tabName === "report") {
    renderReportTab();
  } else if (tabName === "trends") {
    renderTrendsTab();
  } else if (tabName === "action") {
    renderActionTab();
  } else if (tabName === "consulting") {
    renderConsultingTab();
  }
}

let selectedConsultingIds: string[] = ["cov-cancer", "cov-brain", "cov-heart", "cov-metabolic"];

function renderConsultingTab() {
  const container = $("section-consulting");
  if (!container) return;                
  
  // 1. 고객의 최신 건강 검진 데이터와 가족력 정보 로드
  const sortedRecs = [...nhisRecords].sort((a, b) => b.year - a.year);
  const latestRec = sortedRecs[0];
  const sysBp = latestRec?.systolicBP ?? 120;
  const glucose = latestRec?.fastingGlucose ?? 95;
  const bmiVal = latestRec?.bmi ?? 22.5;
  const altVal = latestRec?.alt ?? 25;
  const cholVal = latestRec?.totalCholesterol ?? 180;
  
  // 만성질환 기왕력자/복용약물 여부 판별 (간편심사 유병자형 적용 대상)
  const hasPrescriptionMed = !!(prescriptionData && prescriptionData.medications && prescriptionData.medications.length > 0);
  const hasChronicHighMetrics = (glucose >= 126 || sysBp >= 140 || altVal >= 60 || cholVal >= 240);
  const isSimplifiedTarget = hasPrescriptionMed || hasChronicHighMetrics;

  const isFemale = (gender === "F");
  const userAge = calculateAge(birthDate);

  // 2. 피보험자 건강상태에 따른 최적 추천 상품명 매핑 (표준체 vs 간편유병자형 분기)
  let productName = "";
  let productDescription = "";
  let productUrl = "";
  let guidePdfUrl = "";

  if (isFemale) {
    if (isSimplifiedTarget) {
      productName = "한화 시그니처 여성 간편 건강보험";
      productDescription = "고혈압, 당뇨 등 만성 대사 질환 약물을 복용 중이거나 치료 기왕력이 있어도 간편 고지(3.5.5)를 통해 복잡한 서류 없이 가입 가능하며, 유방/자궁 등 핵심 여성 특화 담보를 맞춤 제공하는 여성 유병자 전용 시그니처 건강보험입니다.";
      productUrl = "https://www.hwgeneralins.com/product/catalog/product-info.do?insGdcd=LA01988003";
      guidePdfUrl = "https://www.hwgeneralins.com/upload/hmpag_upload/product/woman_simple(2604)_01.pdf";
    } else {
      productName = "한화 시그니처 여성 건강보험4.0[HOT]";
      productDescription = "여성의 생애 주기별 특화 보장(유방암, 갑상선암, 자궁암, 생식기암) 및 난임/출산/산후조리 집중 케어와 AMH 등급 할인을 융합한 한화의 대표 여성 시그니처 건강보험 상품입니다.";
      productUrl = "https://www.hwgeneralins.com/product/catalog/product-info.do?insGdcd=LA01988002";
      guidePdfUrl = "https://www.hwgeneralins.com/upload/hmpag_upload/product/woman_cm(2604)_01.pdf";
    }
  } else {
    if (isSimplifiedTarget) {
      productName = "한화 간편가입 3N5 건강보험";
      productDescription = "고혈압, 당뇨 등의 정기 약물을 장기 복용 중인 만성 유병자도 3가지 핵심 질문(3개월 내 검사, N년 내 입원/수술, 5년 내 중증진단) 통과 시 서류 간편 고지로 무심사 가입 및 핵심 3대 만성 질환을 든든하게 보장받을 수 있는 대표 간편 유병자형 상품입니다.";
      productUrl = "https://www.hwgeneralins.com/product/catalog/product-info.do?insGdcd=LA01358001";
      guidePdfUrl = "https://www.hwgeneralins.com/upload/hmpag_upload/product/simple_3n5(2604)_01.pdf";
    } else {
      productName = "한화 더건강한 한아름종합보험 무배당[NEW]";
      productDescription = "3대 만성 질환(암, 뇌혈관, 허혈성 심장질환)과 수술비를 폭넓게 보장하며 3N5 무사고 할인 특약을 통해 가입 장벽과 보험료를 혁신적으로 낮춘 대표 종합 건강보험입니다.";
      productUrl = "https://www.hwgeneralins.com/product/catalog/product-info.do?insGdcd=LA01381001";
      guidePdfUrl = "https://www.hwgeneralins.com/upload/hmpag_upload/product/hw_thehan(2604)_01.pdf";
    }
  }
  
  lastRecommendedProduct = productName;
     
  // 3. 가족력 & 건강 수치 분석 기반의 구체적 의학/보험 공학 사유 조립
  let reasonList: string[] = [];
  
  let isMetabolicRisk = false;
  let isHypertensionRisk = false;
  let isCancerRisk = false;
 
  // 암 가족력 + 성별 맞춤 상품 연계
  const hasCancerFamily = fatherFactors.some(f => f.includes("암")) || motherFactors.some(m => m.includes("암"));
  if (hasCancerFamily) {
    isCancerRisk = true;
    let addedSpecificCancer = false;
    
    if (fatherFactors.includes("갑상선암") || motherFactors.includes("갑상선암")) {
      addedSpecificCancer = true;
      if (isFemale) {
        reasonList.push("• <b>[갑상선암 가족력 & 여성 특화 암 연계]</b> 모친/부친의 갑상선암 병력이 확인되어, 여성 발생률 1위인 갑상선암(소액암) 및 유사암 진단비를 최대 2,000만원까지 보강하고 표적치료를 강화한 설계로 유전적 취약성을 보완했습니다.");
      } else {
        reasonList.push("• <b>[갑상선암 가족력 대응]</b> 가족력 중 갑상선암 이력이 확인되어, 소액암/유사암 보장 한도를 증액하고 갑상선암 수술 및 치료 특약을 보강하였습니다.");
      }
    }
    
    if (fatherFactors.includes("유방암/자궁암") || motherFactors.includes("유방암/자궁암")) {
      addedSpecificCancer = true;
      if (isFemale) {
        reasonList.push("• <b>[여성특화 암 가족력 & 여성 시그니처 연계]</b> 가족력상 유방암/자궁암 이력이 확인되어, 여성 특화 암 진단비를 일반암 대비 최대 150% 수준으로 상향 보장하는 <b>'한화 시그니처 여성 건강보험'</b>을 추천하여 암 예방 및 치료 체계를 정밀 강화했습니다.");
      } else {
        reasonList.push("• <b>[유방암/자궁암 가족력 대응]</b> 모계 가족력 중 여성 암 이력이 존재하여, 남성 발생 가능한 관련 암 및 일반암 보장 설계의 기초 한도를 상향 조정했습니다.");
      }
    }

    if (!addedSpecificCancer) {
      if (isFemale) {
        reasonList.push("• <b>[암 가족력 & 여성 특화 연계]</b> 가족력상 암 이력이 확인되어, 유방/자궁 등 여성 특화 다빈도 암을 일반 암 대비 최대 150% 수준으로 크게 상향 보장하는 여성 특화 다빈도 암 집중 특약이 탑재된 <b>'한화 시그니처 여성 건강보험'</b>을 맞춤 추천했습니다.");
      } else {
        reasonList.push("• <b>[암 유전 성향 예방]</b> 가족력 내 암 이력에 대응하여, 암 진단비 5,000만원 설계와 더불어 값비싼 표적항암 허가치료 특약을 결합한 <b>'한화 더건강한 한아름종합보험'</b>의 든든한 종합 암 처방을 적용했습니다.");
      }
    }
  }
 
  // 고혈압 가족력 + 혈압 수치 연계
  if (fatherFactors.includes("고혈압") || motherFactors.includes("고혈압")) {
    if (sysBp >= 130) {
      isHypertensionRisk = true;
      reasonList.push("• <b>[고혈압 가족력 & 혈행 압력 연동]</b> 고혈압 유전 소인과 함께 수축기 혈압(" + sysBp + " mmHg)의 고혈압 경계선 진입이 확인됨에 따라, 심뇌혈관 상속성 위험 방어를 위해 <b>'뇌혈관질환 및 허혈성심장질환 진단비'를 각 3,000만원씩 정밀 보강</b> 처방했습니다.");
    } else {
      reasonList.push("• <b>[고혈압 유전 위험 대비]</b> 부모님의 고혈압 이력이 확인되어, 향후 나이 누적에 따른 뇌/심장 2대 진단비 기본 설계를 탄탄하게 메웠습니다.");
    }
  }
 
  // 뇌졸중/심장질환/협심증/심근경색 가족력
  if (fatherFactors.includes("뇌졸중/뇌혈관") || motherFactors.includes("뇌졸중/뇌혈관") || 
      fatherFactors.includes("심장질환") || motherFactors.includes("심장질환") ||
      fatherFactors.includes("협심증/심근경색") || motherFactors.includes("협심증/심근경색")) {
    isHypertensionRisk = true;
    if (fatherFactors.includes("협심증/심근경색") || motherFactors.includes("협심증/심근경색")) {
      reasonList.push("• <b>[심장질환 가족력 & 허혈성 심장 연동]</b> 가족력 내 협심증/심근경색 이력이 확인되어, 급성 심근경색증뿐만 아니라 협심증까지 보장 범위가 가장 넓은 <b>'허혈성심장질환 진단비' 3,000만원</b>을 든든하게 보강했습니다.");
    } else {
      reasonList.push("• <b>[뇌/심혈관 가족력 대비]</b> 부모님의 뇌혈관 및 심장 병력이 기재되어, 급성 혈관 파열/막힘 사고를 보상하는 한화손보의 <b>'2대 주요 만성 혈관질환 진단비'</b> 보장 한도를 보강했습니다.");
    }
  }
 
  // 당뇨 가족력 + 식전혈당 연계
  if (fatherFactors.includes("당뇨병") || motherFactors.includes("당뇨병")) {
    if (glucose >= 100) {
      isMetabolicRisk = true;
      reasonList.push("• <b>[당뇨 가족력 & 당대사 위험 연동]</b> 유전적 당뇨 위험군에 속하며 최근 공복혈당(" + glucose + " mg/dL) 경계성 상승이 확인되어, <b>'대사성 만성질환 특별보완 특약' 1,000만원</b>을 최우선 장착하여 향후 합병증 리스크에 대응했습니다.");
    } else {
      reasonList.push("• <b>[당뇨 유전 위험 대비]</b> 부모님 중 당뇨 병력이 검출되어, 현재 혈당 수치(" + glucose + " mg/dL)는 안전 상태이나 장기적 혈당 상승 시의 대사 합병증에 안심할 수 있도록 예방 보장을 추가 조율했습니다.");
    }
  }

  // 고지혈증 / 만성신장질환 가족력 연계
  if (fatherFactors.includes("고지혈증") || motherFactors.includes("고지혈증") ||
      fatherFactors.includes("만성신장질환") || motherFactors.includes("만성신장질환")) {
    isMetabolicRisk = true;
    if (fatherFactors.includes("고지혈증") || motherFactors.includes("고지혈증")) {
      reasonList.push("• <b>[고지혈증 가족력 & 대사 관리 연계]</b> 가족력 내 고지혈증 이력이 감지되어, 혈중 콜레스테롤 상승으로 발생할 수 있는 이상지질혈증 및 혈관 내 플라크 축적 방어 목적의 대사 질환 케어를 보강하였습니다.");
    }
    if (fatherFactors.includes("만성신장질환") || motherFactors.includes("만성신장질환")) {
      reasonList.push("• <b>[신장질환 가족력 & 만성신장질환 보완]</b> 가족력 내 만성신장질환 이력이 기재되어, 만성 신부전증 및 혈액 투석 등 고액 치료비가 유발되는 중증 신장 질환에 대비한 신장 케어 보장을 강화하였습니다.");
    }
  }
 
  // 가족력 선택이 없는 경우의 지표 기반 기본 분석 사유 조립
  if (reasonList.length === 0) {
    if (glucose >= 100 || sysBp >= 130 || bmiVal >= 25) {
      if (glucose >= 100) isMetabolicRisk = true;
      if (sysBp >= 130) isHypertensionRisk = true;
      reasonList.push("• <b>[검진 대사항목 집중 보완]</b> 현재 공복식전혈당(" + glucose + " mg/dL) 또는 혈압(" + sysBp + " mmHg) 등의 기초 대사 지표가 주의 경계 영역에 분포해 있으므로, 만성질환으로의 발전을 사전에 상쇄하고 향후 합병증 치료비를 예방 적립할 수 있도록 만성질약 특별보완과 3대 주요 진단비를 결합했습니다.");
    } else {
      if (isFemale) {
        reasonList.push("• <b>[기초 웰니스 보장 적립]</b> 현재 5개년 건강 검진 수치는 대단히 훌륭한 수준으로 잘 보존되고 있습니다. 다만, 현 시점의 건강함을 기반으로 한화손보의 웰니스 케어 첫해 월 보험료 최대 10% 우대 할인 제도(AMH 난소 기능 2.0 이상 할인 등)를 적용받아 가장 최저의 월 납입액으로 장기 안심 포트폴리오를 마련하도록 추천했습니다.");
      } else {
        reasonList.push("• <b>[기초 웰니스 보장 적립]</b> 현재 5개년 건강 검진 수치는 대단히 훌륭한 수준으로 잘 보존되고 있습니다. 다만, 현 시점의 건강함을 기반으로 한화손보의 3N5 무사고 할인 혜택 등을 활용하여 가장 합리적인 월 납입액으로 장기 안심 종합 포트폴리오를 마련하도록 추천했습니다.");
      }
    }
  }
 
  const reasonHtml = reasonList.map(r => '<div class="text-slate-700 text-xs sm:text-xs font-semibold leading-relaxed break-keep">' + r + '</div>').join("<div class='h-2.5'></div>");
 
  // 4. 동적 계리적 보험료 산출 프로세스 시작
  // 만성질환자용 유병자 간편 요율 할증인자
  const simplifiedSurcharge = isSimplifiedTarget ? 1.25 : 1.0;
  
  // 연령 지수 (40세를 1.0 기준으로 하여 매년 4.5% 비율로 증감 계산)
  const ageFactor = Math.max(0.35, Math.min(2.2, 1.0 + (userAge - 40) * 0.045));

  // --- [신규 구현] 기존 가입 담보 한도액을 만 원 단위로 맵핑 ---
  const existCancerVal = Math.round((existingCoverages["cov-cancer"] || 0) / 10000);
  const existBrainVal = Math.round((existingCoverages["cov-brain"] || 0) / 10000);
  const existHeartVal = Math.round((existingCoverages["cov-heart"] || 0) / 10000);
  const existMetabolicVal = Math.round((existingCoverages["cov-metabolic"] || 0) / 10000);
  const existSurgeryVal = Math.round((existingCoverages["cov-surgery"] || 0) / 10000);

  // 각 담보별 권장 가입금액 설정 (만 원 단위)
  const cancerCoverageVal = isCancerRisk ? 5000 : 3000;
  const brainCoverageVal = isHypertensionRisk ? 3000 : 2000;
  const heartCoverageVal = isHypertensionRisk ? 3000 : 2000;
  const metabolicCoverageVal = isMetabolicRisk ? 1000 : 500;
  const surgeryCoverageVal = 500;

  // --- [신규 구현] 보장 격차(Gap) 분석 (추천금액 - 기존 가입금액) ---
  const cancerGapVal = Math.max(0, cancerCoverageVal - existCancerVal);
  const brainGapVal = Math.max(0, brainCoverageVal - existBrainVal);
  const heartGapVal = Math.max(0, heartCoverageVal - existHeartVal);
  const metabolicGapVal = Math.max(0, metabolicCoverageVal - existMetabolicVal);
  const surgeryGapVal = Math.max(0, surgeryCoverageVal - existSurgeryVal);

  // [중요] 사용자의 보장 격차(부족 금액)에 대해서만 비율적으로 추천 월 보험료를 정밀 계산합니다.
  let cancerBaseRate = isFemale ? 6100 : 6800; // 1,000만원당 기본 보험료 (40세 기준)
  let cancerSurcharge = isCancerRisk ? 1.15 : 1.0;
  const cancerPremium = Math.round(cancerBaseRate * (cancerGapVal / 1000) * ageFactor * cancerSurcharge * simplifiedSurcharge);
 
  let brainBaseRate = isFemale ? 4900 : 5600; // 1,000만원당 기본 보험료
  let brainSurcharge = isHypertensionRisk ? 1.20 : 1.0;
  const brainPremium = Math.round(brainBaseRate * (brainGapVal / 1000) * ageFactor * brainSurcharge * simplifiedSurcharge);
 
  let heartBaseRate = isFemale ? 3400 : 4450; // 1,000만원당 기본 보험료
  let heartSurcharge = isHypertensionRisk ? 1.15 : 1.0;
  const heartPremium = Math.round(heartBaseRate * (heartGapVal / 1000) * ageFactor * heartSurcharge * simplifiedSurcharge);
 
  let metabolicBaseRate = isFemale ? 780 : 980; // 100만원당 기본 보험료
  let metabolicSurcharge = isMetabolicRisk ? 1.25 : 1.0;
  const metabolicPremium = Math.round(metabolicBaseRate * (metabolicGapVal / 100) * ageFactor * metabolicSurcharge * simplifiedSurcharge);
 
  const surgeryBaseRate = isFemale ? 1380 : 1540; // 100만원당 기본 보험료
  const surgeryPremium = Math.round(surgeryBaseRate * (surgeryGapVal / 100) * ageFactor * simplifiedSurcharge);
 
  // 화면에 그릴 5대 주요 담보 정보 객체 배열 재구성
  const coverages = [
    { id: "cov-cancer", name: isFemale ? "여성특화 암 진단비 (표적치료 포함)" : "일반암 진단비 (표적치료 포함)", recommendedAmount: cancerCoverageVal * 10000, existingAmount: existingCoverages["cov-cancer"] || 0, gapAmount: cancerGapVal * 10000, premium: cancerPremium, basis: isCancerRisk ? "가족력 또는 병력 반영 및 권장 한도 5,000만원 집중 보강" : "가족력 또는 병력 없음 반영, 기본형 3,000만원 적정 유지" },
    { id: "cov-brain", name: "뇌혈관질환 진단비 (2대 고위험 혈관 보강)", recommendedAmount: brainCoverageVal * 10000, existingAmount: existingCoverages["cov-brain"] || 0, gapAmount: brainGapVal * 10000, premium: brainPremium, basis: isHypertensionRisk ? "고혈압/뇌혈관 가족력 또는 수축기혈압(" + sysBp + " mmHg) 경계 단계를 반영한 권장 한도 3,000만원 특별 증액" : "가족력 및 혈압 안전 상태 반영, 기본형 2,000만원 보장 배정" },
    { id: "cov-heart", name: "허혈성심장질환 진단비 (협심증 진단 케어)", recommendedAmount: heartCoverageVal * 10000, existingAmount: existingCoverages["cov-heart"] || 0, gapAmount: heartGapVal * 10000, premium: heartPremium, basis: isHypertensionRisk ? "심장질환 가족력 및 혈압 수치(" + sysBp + " mmHg) 경계 연동에 따른 3,000만원 집중 처방" : "심장 유전 리스크 없음 반영, 기본형 2,000만원 일반 처방" },
    { id: "cov-metabolic", name: "대사성 만성질환(당뇨/고혈압 등) 특별보완 특약", recommendedAmount: metabolicCoverageVal * 10000, existingAmount: existingCoverages["cov-metabolic"] || 0, gapAmount: metabolicGapVal * 10000, premium: metabolicPremium, basis: isMetabolicRisk ? "당뇨/대사 가족력 또는 식전혈당(" + glucose + " mg/dL) 주의 단계를 연계한 권장 한도 1,000만원 특별 탑재" : "당뇨/대사 지표 안전 상태 반영, 기본형 500만원 배정" },
    { id: "cov-surgery", name: "일반 질병 수술비 및 120대 다빈도 수술비", recommendedAmount: surgeryCoverageVal * 10000, existingAmount: existingCoverages["cov-surgery"] || 0, gapAmount: surgeryGapVal * 10000, premium: surgeryPremium, basis: "기본 종합 수술 치료비 보장 플랜 (500만원 한도 권장)" }
  ];
 
  // 5. 건강 점수별 우량체 할인 설정 (간편인수 적용 유병자는 우량체 할인 대상 제외하되 매년 무사고 시 3N5 할인 전환안내문 표시)
  const score = analysisResult ? analysisResult.overallScore : 84;
  let discountRate = 0;
  let discountGrade = "";
  
  if (isSimplifiedTarget) {
    discountRate = 0;
    discountGrade = "유병자 간편보험 가입 (건강 할인 미적용 - 매년 무사고 시 3N5 할인 전환 대상)";
  } else {
    if (score >= 90) {
      discountRate = 0.20;
      discountGrade = "슈퍼 건강체 등급 (20% 보험료 감면 적용)";
    } else if (score >= 80) {
      discountRate = 0.10;
      discountGrade = "우량 건강체 등급 (10% 보험료 감면 적용)";
    } else if (score >= 70) {
      discountRate = 0.05;
      discountGrade = "준우량 건강체 등급 (5% 보험료 감면 적용)";
    } else {
      discountGrade = "일반체 승인 (할인 미적용)";
    }
  }
 
  let totalBasePremium = 0;
  coverages.forEach((c) => totalBasePremium += c.premium);
  const discountAmount = Math.round(totalBasePremium * discountRate);
  const finalTotalPremium = totalBasePremium - discountAmount;
 
  const formattedTotal = finalTotalPremium.toLocaleString();
 
  // --- [신규 구현] AI 추천 보장 한도액을 만 원 단위로 맵핑하여 표 행(row) HTML 템플릿 빌드 ---
  const coveragesHtml = coverages.map((cov) => {
    const recVal = cov.recommendedAmount / 10000;
    const formattedRecAmount = recVal.toLocaleString() + "만원";
    const formattedPremium = cov.premium.toLocaleString();
    return `
      <tr class="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors">
        <td class="py-3.5 px-3 align-middle">
          <div class="font-bold text-slate-800 text-xs sm:text-sm leading-snug">${cov.name}</div>
          <div class="text-[9.5px] sm:text-[10px] text-slate-450 mt-1 font-medium leading-relaxed break-keep">${cov.basis}</div>
        </td>
        <td class="py-3.5 px-2 align-middle text-right font-bold text-slate-700 text-xs sm:text-sm whitespace-nowrap">
          ${formattedRecAmount}
        </td>
        <td class="py-3.5 px-3 align-middle text-right font-black text-[#f37321] text-xs sm:text-sm whitespace-nowrap">
          ${cov.premium > 0 ? `+${formattedPremium} 원` : "0 원"}
        </td>
      </tr>
    `;
  }).join("");
 
  // 기존 가입 보험 총 월 보험료 합산액 계산
  const totalExistingPremium = existingInsurances.reduce((acc, cur) => acc + cur.premium, 0);

  container.innerHTML = `
    <div class="bg-white p-5 sm:p-8 shadow-xs space-y-6 animate-fade-in text-left">
        <!-- Header -->
        <div class="border-b border-slate-150 pb-4">
          <span class="text-xs font-black text-[#f37321] tracking-wider uppercase">Hanwha General Insurance Custom Consulting</span>
          <h3 class="font-black text-slate-900 text-xl sm:text-2xl mt-1 flex items-center gap-1.5">
            <svg class="w-6 h-6 text-[#f37321] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            AI 건강 맞춤형 컨설팅
          </h3>
          <p class="text-slate-500 text-xs sm:text-sm mt-2 leading-relaxed">
            고객님의 최근 건강검진 종합 지표(<span id="consulting-score-badge" class="font-bold text-slate-800">${analysisResult?.overallScore || 84}점</span>), 만 연령(<strong>만 ${userAge}세</strong>) 및 기재해주신 건강 상태를 토대로 <strong class="text-slate-800 font-extrabold">한화손해보험 상품공시실 지식 위키</strong>에 현재 정식 판매 중인 건강보장형 상품들을 대조 분석하여, 고객님께 가장 완벽하게 보완된 비대면 맞춤 포트폴리오를 제공합니다.
          </p>
        </div>


        
        <!-- Product Box -->
        <div class="bg-[#fffdfb] p-5 rounded-2xl border border-[#f37321]/20 space-y-4.5 relative overflow-hidden">
            <div class="absolute -right-6 -bottom-6 text-[#f37321] opacity-5">
              <svg class="w-24 h-24" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 21.622c5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016L12 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622z"/>
              </svg>
            </div>
            <div class="space-y-2">
                <div class="flex flex-col gap-1 items-start">
                    <span class="text-[10px] px-2 py-0.5 rounded-md bg-[#f37321] text-white font-black">${isSimplifiedTarget ? "AI 유병자 간편 맞춤설계" : "AI 추천 최적상품 (공시실 위키 연동)"}</span>
                    <h4 class="font-black text-slate-900 text-sm sm:text-base">${productName}</h4>
                </div>
                <p class="text-slate-600 text-xs sm:text-sm leading-relaxed break-keep">${productDescription}</p>
            </div>
            
            <!-- 🔗 상품 보러가기 / 설명서 다운로드 버튼 (모바일 한 손 조작 최적화) -->
            <div class="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100 relative z-10">
              <a href="${productUrl}" target="_blank" rel="noopener noreferrer" class="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-[#f37321] bg-white text-[#f37321] hover:bg-[#fff5ee] font-black text-xs transition-all tracking-tight cursor-pointer text-center no-underline">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                   <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                공식 상품 정보
              </a>
              <a href="${guidePdfUrl}" target="_blank" download class="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-[#f37321] text-white hover:bg-[#dd6216] font-black text-xs transition-all tracking-tight cursor-pointer text-center no-underline">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                   <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                설명서 PDF 받기
              </a>
            </div>
        </div>
        
        <!-- Recommended Coverages -->
        <div class="space-y-3.5">
            <h4 class="font-extrabold text-slate-800 text-sm sm:text-base flex items-center gap-1.5">
              <svg class="w-4 h-4 text-[#f37321]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              가족력 및 검진 기반 보장 공백(Gap) 대조 분석
            </h4>

            <div class="border border-slate-200 bg-white rounded-2xl shadow-xs overflow-hidden">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-[10.5px]">
                    <th class="py-3 px-3 font-black w-[58%]">담보명 및 분석 근거</th>
                    <th class="py-3 px-2 text-right font-black w-[24%] whitespace-nowrap">추천 가입금액</th>
                    <th class="py-3 px-3 text-right font-black w-[18%] whitespace-nowrap">추천 월보험료</th>
                  </tr>
                </thead>
                <tbody class="text-xs text-slate-700">
                  ${coveragesHtml}
                </tbody>
              </table>
            </div>
        </div>

        <!-- 💡 가족력 및 검진 기반 융합 사유 카드 -->
        <div class="bg-gradient-to-br from-indigo-50/20 to-[#f5f7ff]/40 border border-indigo-200/50 rounded-2xl p-5 space-y-3 text-left">
          <h4 class="font-extrabold text-slate-800 text-sm flex items-center gap-1.5 text-indigo-700">
            <svg class="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            가족력 및 검진 지표 융합 분석 사유
          </h4>
          <div class="space-y-3 pl-0.5">
            ${reasonHtml}
          </div>
        </div>

        <!-- Monthly Premium -->
        <div class="bg-gradient-to-r from-slate-50 to-[#fff8f2] p-5 sm:p-6 rounded-2xl border border-dashed border-[#f37321]/30 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div class="space-y-0.5 text-center sm:text-left">
            <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Calculated Monthly Premium</span>
            <h5 class="text-xs sm:text-sm font-black text-slate-750 block sm:inline">격차 보강용 신규 추천 월 보험료</h5>
            <p class="text-2xl sm:text-3.5xl font-black text-[#f37321] tracking-tight mt-1">
              <span id="consulting-display-bold-total" class="font-extrabold text-3xl sm:text-4xl text-[#f37321]">${formattedTotal}</span> 원
            </p>
            ${discountRate > 0 ? `<p class="text-[10px] text-emerald-600 font-extrabold mt-1">✓ 건강등급 우량체 특별 할인 완료 (-${discountAmount.toLocaleString()}원)</p>` : ""}
            ${isSimplifiedTarget ? `<p class="text-[10px] text-[#f37321] font-extrabold mt-1">✓ 만성질환 보장 우대 유병자형 간편인수 적용</p>` : ""}
            <p class="text-[9.5px] text-slate-450 mt-1 leading-none">*기존에 이미 가입된 보장 한도는 제외하고, **부족한 격차 보강액**에 대해서만 실속 산출된 보험료입니다.</p>
          </div>
          <button type="button" id="btn-open-premium-basis" class="w-full sm:w-auto bg-[#353968] hover:bg-[#24274d] text-white rounded-xl py-3 px-4 font-bold text-xs tracking-wide flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            산출 및 가입 적정성 근거 보기
          </button>
        </div>

        <!-- 🛡️ 내 보험 정보와 비교 분석 섹션 -->
        <div class="mt-8 pt-8 border-t border-slate-200 space-y-4">
            <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 text-left">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2 text-slate-800">
                        <svg class="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                           <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                        <h3 class="font-extrabold text-base sm:text-lg text-slate-900">내 보험 정보와 비교 분석</h3>
                    </div>
                    ${existingInsurances.length > 0 ? `
                        <button type="button" id="btn-sync-my-insurance-retry" class="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors bg-transparent border-0 cursor-pointer">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H17" />
                            </svg>
                            다시 불러오기
                        </button>
                    ` : ""}
                </div>

                ${existingInsurances.length === 0 ? `
                    <!-- 불러오기 전 상태 -->
                    <div class="bg-slate-50/70 border border-slate-150 rounded-2xl p-6 text-center space-y-4 flex flex-col items-center justify-center">
                        <div class="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <div class="space-y-1 max-w-md mx-auto">
                            <h4 class="text-sm font-bold text-slate-800">나의 실제 가입 보험 정보를 가져와 비교해 보세요</h4>
                            <p class="text-xs text-slate-500 leading-relaxed">한국신용정보원(보험다모아) 인증을 통해 현재 가입 중인 보험 상품 및 담보별 한도를 자동으로 가져와 AI 추천 설계서와 1:1로 비교해 드립니다.</p>
                        </div>
                        <button type="button" id="btn-sync-my-insurance" class="w-full sm:w-auto bg-gradient-to-r from-indigo-600 to-[#353968] hover:from-indigo-700 hover:to-[#24274d] text-white rounded-xl py-3 px-6 font-extrabold text-xs tracking-wide flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm">
                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                            </svg>
                            내 보험 정보 불러오기 (보험다모아)
                        </button>
                    </div>
                ` : `
                    <!-- 불러온 이후 상태: 추천 담보 vs 가입 담보 대조 분석 -->
                    <p class="text-slate-500 text-xs sm:text-sm leading-relaxed">
                        고객님이 보유하신 기가입 보험 계약 내역을 토대로 분석된 <strong>가입 담보 한도</strong>와 AI가 처방한 <strong>추천 담보 한도</strong>의 세부 격차를 비교 분석한 내용입니다.
                    </p>

                    <div class="border border-slate-200 bg-white rounded-2xl shadow-xs overflow-hidden">
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-[10.5px]">
                                    <th class="py-3 px-3 font-black w-[34%]">분석 담보 영역</th>
                                    <th class="py-3 px-2 text-right font-black w-[22%] whitespace-nowrap">AI 추천한도</th>
                                    <th class="py-3 px-2 text-right font-black w-[22%] whitespace-nowrap">내가 가입한도</th>
                                    <th class="py-3 px-3 text-right font-black w-[22%] whitespace-nowrap">과부족 격차</th>
                                </tr>
                            </thead>
                            <tbody class="text-xs text-slate-700">
                                ${
                                    [
                                        { name: "암 진단비", rec: cancerCoverageVal, exist: existCancerVal, desc: isFemale ? "여성특화 암 진단비" : "일반암 진단비" },
                                        { name: "뇌혈관 진단비", rec: brainCoverageVal, exist: existBrainVal, desc: "뇌혈관질환 진단비" },
                                        { name: "심장질환 진단비", rec: heartCoverageVal, exist: existHeartVal, desc: "허혈성심장질환 진단비" },
                                        { name: "대사성 만성질환", rec: metabolicCoverageVal, exist: existMetabolicVal, desc: "당뇨/고혈압 등 특별보완" },
                                        { name: "수술비 보장", rec: surgeryCoverageVal, exist: existSurgeryVal, desc: "일반 질병 및 다빈도 수술비" }
                                    ].map(item => {
                                        const gap = item.rec - item.exist;
                                        const isDeficient = gap > 0;
                                        const absGap = Math.abs(gap);
                                        const formattedGap = gap === 0 ? "0원" : (isDeficient ? `-${absGap.toLocaleString()}만원` : `+${absGap.toLocaleString()}만원`);
                                        const gapClass = gap === 0 ? "text-slate-500 font-semibold" : (isDeficient ? "text-rose-600 font-black" : "text-emerald-600 font-black");

                                        return `
                                            <tr class="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors">
                                                <td class="py-3.5 px-3 align-middle">
                                                    <div class="font-bold text-slate-800 text-xs sm:text-sm leading-snug">${item.name}</div>
                                                    <div class="text-[9.5px] sm:text-[10px] text-slate-400 mt-0.5 leading-none font-medium">${item.desc}</div>
                                                </td>
                                                <td class="py-3.5 px-2 align-middle text-right font-semibold text-slate-700 font-mono whitespace-nowrap">${item.rec.toLocaleString()}만원</td>
                                                <td class="py-3.5 px-2 align-middle text-right font-semibold text-slate-700 font-mono whitespace-nowrap">${item.exist.toLocaleString()}만원</td>
                                                <td class="py-3.5 px-3 align-middle text-right ${gapClass} font-mono whitespace-nowrap">
                                                    <span class="text-[9.5px] font-sans mr-1 whitespace-nowrap">${gap === 0 ? '충분' : (isDeficient ? '부족' : '초과')}</span><span class="whitespace-nowrap">${formattedGap}</span>
                                                </td>
                                            </tr>
                                        `;
                                    }).join("")
                                }
                            </tbody>
                        </table>
                    </div>

                    <!-- 동기화된 기존 보험 리스트 요약 카드 -->
                    <div class="space-y-2.5 pt-2">
                        <h4 class="font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                            <svg class="w-3.5 h-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 01-2-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                            동기화된 나의 가입 보험 계약 (${existingInsurances.length}건)
                        </h4>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            ${existingInsurances.map(ins => `
                                <div class="bg-slate-50/70 border border-slate-150 p-3.5 rounded-xl flex items-center justify-between text-left transition-all hover:bg-slate-50">
                                    <div class="space-y-1">
                                        <div class="flex items-center gap-1.5">
                                            <span class="text-[9.5px] px-1.5 py-0.5 rounded-md bg-[#e3e6fc] text-indigo-700 font-extrabold">${ins.status || "유지"}</span>
                                            <span class="text-[10px] text-slate-400 font-bold">${ins.company}</span>
                                        </div>
                                        <div class="text-xs font-bold text-slate-800 truncate max-w-[180px]">${ins.productName}</div>
                                    </div>
                                    <div class="text-right">
                                        <div class="text-xs font-black text-slate-900">${ins.premium.toLocaleString()}원</div>
                                        <div class="text-[9px] text-slate-400 font-medium leading-none">월 보험료</div>
                                    </div>
                                </div>
                            `).join("")}
                        </div>
                        <div class="bg-indigo-50/40 border border-indigo-100 rounded-xl p-3.5 mt-2 flex items-center justify-between">
                            <span class="text-xs font-bold text-slate-700">기가입 보험 월 보험료 합산</span>
                            <span class="text-sm font-black text-indigo-700">${totalExistingPremium.toLocaleString()}원 / 월</span>
                        </div>
                    </div>
                `}
            </div>
        </div>
        
        <!-- 📂 다른 설계서와 비교 분석 섹션 (독립 하단 섹션으로 분리) -->
        <div class="mt-8 pt-8 border-t border-slate-200 space-y-4">
            <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div class="flex items-center gap-2 text-slate-800">
                    <svg class="w-5 h-5 text-[#f37321]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                       <path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2" />
                    </svg>
                    <h3 class="font-extrabold text-base sm:text-lg text-slate-900">다른 설계서와 비교 분석</h3>
                </div>
                <p class="text-slate-500 text-xs sm:text-sm leading-relaxed">기존에 설계받은 보험 설계서를 업로드하거나 사진을 찍어 올려주시면, 현재 추천 상품과 비교하여 보장 차이점을 분석해 드립니다.</p>
                <input type="file" id="existing-plan-file" class="hidden" accept="image/*,application/pdf" />
                <div id="upload-zone" class="border-2 border-dashed border-slate-200 hover:border-[#f37321] bg-slate-50/70 hover:bg-[#fff5ee] rounded-2xl p-8 text-center cursor-pointer transition-all space-y-2.5 flex flex-col items-center justify-center">
                   <div class="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-3xs border border-slate-100 text-[#f37321]">
                     <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                     </svg>
                   </div>
                   <div class="space-y-1">
                     <span class="text-xs sm:text-sm font-bold text-slate-700 block">설계서 파일 선택 / 사진 촬영</span>
                     <span class="text-[10px] text-slate-400 block font-medium">보험 증권이나 가입 설계서 이미지를 업로드해 주세요.</span>
                   </div>
                </div>
            </div>
        </div>

        <!-- 비교분석 결과 테이블 영역 (상태 유지용 캐시 HTML 또는 기본 hidden) -->
        <div id="analysis-result" class="${isComparisonCompleted ? '' : 'hidden'} w-full bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 mt-4 shadow-sm text-left">
            ${isComparisonCompleted ? comparisonResultHtml : ""}
        </div>

        <!-- 💬 상담 신청하기 버튼 (비교분석이 완료되었을 때만 노출) -->
        <button id="btn-consulting-consult-submit" class="${isComparisonCompleted ? '' : 'hidden'} w-full bg-[#f37321] hover:bg-[#dd6216] text-white font-extrabold text-sm sm:text-base px-6 py-4 rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer mt-4">
            <svg class="w-5 h-5 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
            </svg>
            상담 신청하기
        </button>
    </div>
  `;

  // Attach consultation request button event listener
  const submitBtn = $("btn-consulting-consult-submit") as HTMLButtonElement | null;
  if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
      const originalText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerText = "상담 접수 중...";

      const sortedRecs = [...nhisRecords].sort((a, b) => b.year - a.year);
      const latestRec = sortedRecs[0] || {};
      const heightVal = latestRec.weight && latestRec.bmi ? Math.round(Math.sqrt(latestRec.weight / latestRec.bmi) * 100) : null;
      const weightVal = latestRec.weight || null;

      const payload = {
        userName,
        birthDate,
        gender,
        height: heightVal,
        weight: weightVal,
        healthRecords: nhisRecords,
        existingInsurances,
        recommendedProduct: lastRecommendedProduct,
        details: {
          overallScore: analysisResult?.overallScore || null,
          consultationRequestedAt: new Date().toISOString()
        }
      };

      try {
        const res = await fetch("/api/consultation/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          throw new Error("서버 응답 오류");
        }

        $("consultation-success-modal")?.classList.remove("hidden");
      } catch (err: any) {
        console.error("상담 접수 예외:", err);
        alert("상담 접수 중 오류가 발생했습니다. 다시 시도해 주세요. (" + err.message + ")");
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });
  }

  // 실시간 보험 연동 버튼 리스너 바인딩 (새 비교분석 섹션 내 버튼들)
  const syncMyInsuBtn = $("btn-sync-my-insurance");
  if (syncMyInsuBtn) {
    syncMyInsuBtn.addEventListener("click", () => {
      if (!userName.trim() || !birthDate.trim()) {
        alert("기본 인적사항(이름, 생년월일)이 있어야 기존 보험을 조회할 수 있습니다. 1단계로 이동하여 인풋값을 체크해 주세요.");
        return;
      }
      step3Auth.openSyncModal("insurance");
    });
  }

  const syncMyInsuRetryBtn = $("btn-sync-my-insurance-retry");
  if (syncMyInsuRetryBtn) {
    syncMyInsuRetryBtn.addEventListener("click", () => {
      if (!userName.trim() || !birthDate.trim()) {
        alert("기본 인적사항(이름, 생년월일)이 있어야 기존 보험을 조회할 수 있습니다. 1단계로 이동하여 인풋값을 체크해 주세요.");
        return;
      }
      step3Auth.openSyncModal("insurance");
    });
  }

  // ✍️ [내 보험 직접 관리] 수동 보험 관리 모달 제어 로직 추가
  let tempInsurancesCopy: Array<{
    company: string;
    productName: string;
    status: string;
    premium: number;
  }> = [];

  function renderManualInsuranceList() {
    const listContainer = $("manual-insurance-list");
    if (!listContainer) return;
    
    if (tempInsurancesCopy.length === 0) {
      listContainer.innerHTML = `
        <div class="text-center py-6 text-xs text-slate-400 font-medium">
          등록된 보험 내역이 없습니다. 아래에서 새 보험을 추가해 주세요.
        </div>
      `;
      return;
    }

    listContainer.innerHTML = tempInsurancesCopy.map((ins, index) => `
      <div class="bg-slate-50 border border-slate-200/85 rounded-xl p-3 flex justify-between items-center shadow-3xs mb-2 last:mb-0">
        <div class="space-y-0.5">
          <div class="font-bold text-slate-800 text-[11px] sm:text-xs">${ins.productName}</div>
          <div class="text-[9.5px] text-slate-500 font-medium">${ins.company} <span class="text-emerald-600 font-bold ml-1">${ins.status}</span></div>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          <span class="font-extrabold text-slate-900 text-xs">${ins.premium.toLocaleString()}원</span>
          <button type="button" class="btn-delete-manual-ins text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg transition-all cursor-pointer" data-index="${index}">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    `).join("");

    // 각 삭제 버튼에 이벤트 등록
    const deleteBtns = listContainer.querySelectorAll(".btn-delete-manual-ins");
    deleteBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const index = parseInt(btn.getAttribute("data-index") || "0", 10);
        tempInsurancesCopy.splice(index, 1);
        renderManualInsuranceList();
      });
    });
  }

  // 모달 열기
  function openManageInsuranceModal() {
    const modal = $("manage-insurance-modal");
    if (!modal) return;
    
    // 현재의 기존 가입 보험을 깊은 복사하여 임시 카피본 저장
    tempInsurancesCopy = JSON.parse(JSON.stringify(existingInsurances));
    
    // 목록 렌더링 및 모달 노출
    renderManualInsuranceList();
    modal.classList.remove("hidden");
    
    // 입력 필드 초기화
    const compInput = $("input-manual-company") as HTMLInputElement;
    const premInput = $("input-manual-premium") as HTMLInputElement;
    const prodInput = $("input-manual-product") as HTMLInputElement;
    if (compInput) compInput.value = "";
    if (premInput) premInput.value = "";
    if (prodInput) prodInput.value = "";
  }

  // 모달 닫기
  function closeManageInsuranceModal() {
    $("manage-insurance-modal")?.classList.add("hidden");
  }

  // 모달 이벤트 바인딩
  $("btn-close-manage-insurance-modal")?.addEventListener("click", closeManageInsuranceModal);
  
  // 보험 추가 버튼 이벤트
  $("btn-add-manual-insurance")?.addEventListener("click", () => {
    const compInput = $("input-manual-company") as HTMLInputElement;
    const premInput = $("input-manual-premium") as HTMLInputElement;
    const prodInput = $("input-manual-product") as HTMLInputElement;
    
    const company = compInput ? compInput.value.trim() : "";
    const premiumVal = premInput ? parseInt(premInput.value, 10) : 0;
    const productName = prodInput ? prodInput.value.trim() : "";

    if (!company) {
      alert("보험회사 이름을 입력해 주세요.");
      compInput?.focus();
      return;
    }
    if (!productName) {
      alert("보험 상품명을 입력해 주세요.");
      prodInput?.focus();
      return;
    }
    if (isNaN(premiumVal) || premiumVal <= 0) {
      alert("올바른 납입 보험료(숫자)를 입력해 주세요.");
      premInput?.focus();
      return;
    }

    // 목록에 추가
    tempInsurancesCopy.push({
      company,
      productName,
      status: "유지",
      premium: premiumVal
    });

    // 화면 갱신 및 인풋 초기화
    renderManualInsuranceList();
    compInput.value = "";
    premInput.value = "";
    prodInput.value = "";
  });

  // 기본값 리셋 버튼 이벤트
  $("btn-reset-insurance-modal")?.addEventListener("click", () => {
    if (confirm("보험 내역을 시뮬레이션 기본값(삼성화재, 메리츠화재)으로 리셋하시겠습니까?")) {
      tempInsurancesCopy = [
        { company: "삼성화재", productName: "무배당 삼성 든든 건강보험", status: "유지", premium: 45000 },
        { company: "메리츠화재", productName: "무배당 메리츠 실손의료보험", status: "유지", premium: 12000 }
      ];
      renderManualInsuranceList();
    }
  });

  // 저장 및 분석 반영 버튼 이벤트
  $("btn-save-insurance-modal")?.addEventListener("click", () => {
    // 1. 전역 변수에 업데이트
    existingInsurances = tempInsurancesCopy;
    
    // 2. 가입 한도(existingCoverages)를 지능적으로 동기화 맵핑 갱신
    existingCoverages = {
      "cov-cancer": 0,
      "cov-brain": 0,
      "cov-heart": 0,
      "cov-metabolic": 0,
      "cov-surgery": 0
    };
    
    existingInsurances.forEach(ins => {
      const pName = ins.productName || "";
      if (pName.includes("암") || pName.includes("종양")) {
        existingCoverages["cov-cancer"] += 20000000;
      }
      if (pName.includes("뇌") || pName.includes("졸중") || pName.includes("혈관")) {
        existingCoverages["cov-brain"] += 10000000;
      }
      if (pName.includes("심장") || pName.includes("협심") || pName.includes("혈관") || pName.includes("건강")) {
        existingCoverages["cov-heart"] += 10000000;
      }
      if (pName.includes("당뇨") || pName.includes("대사") || pName.includes("만성")) {
        existingCoverages["cov-metabolic"] += 5000000;
      }
      if (pName.includes("수술") || pName.includes("종합")) {
        existingCoverages["cov-surgery"] += 2000000;
      }
    });

    // 기본 보정
    if (existingCoverages["cov-cancer"] === 0) existingCoverages["cov-cancer"] = 10000000;
    if (existingCoverages["cov-brain"] === 0) existingCoverages["cov-brain"] = 10000000;
    if (existingCoverages["cov-heart"] === 0) existingCoverages["cov-heart"] = 10000000;
    if (existingCoverages["cov-surgery"] === 0) existingCoverages["cov-surgery"] = 1000000;

    // 3. 모달 닫기 및 컨설팅 화면 강제 리렌더링
    closeManageInsuranceModal();
    renderConsultingTab();
    
    // 이력 로깅
    logAccessEvent("insurance_manual_management_save", { count: existingInsurances.length });
  });

  // 수동 보험 관리 버튼 리스너 바인딩
  const manageInsuranceBtn = $("btn-manage-insurance-manual");
  if (manageInsuranceBtn) {
    manageInsuranceBtn.addEventListener("click", () => {
      openManageInsuranceModal();
    });
  }

  // Attach opening event listener for the premium basis modal
  const btnOpenBasis = $("btn-open-premium-basis");
  const modalBasis = $("premium-basis-modal");

  if (btnOpenBasis && modalBasis) {
    btnOpenBasis.addEventListener("click", () => {
      // 1. 상세 담보별 보장 공백 및 격차 보험료 상세 데이터 주입
      const detailsContainer = $("modal-premium-basis-details");
      if (detailsContainer) {
        detailsContainer.innerHTML = coverages.map(cov => {
          // 격차 유무에 따라 모달에 출력할 가입/보강 상태 텍스트 분기
          const formattedAmountStr = cov.gapAmount > 0 
            ? `${(cov.gapAmount / 10000).toLocaleString()}만원 보강` 
            : "보장 충분 (보강 불필요)";
          const formattedPremium = cov.premium.toLocaleString();
          
          return `
            <div class="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-1 text-left shadow-3xs">
              <div class="flex justify-between items-center gap-1.5">
                <!-- 담보명 출력 -->
                <span class="font-extrabold text-slate-800 text-xs flex-1 min-w-0 break-keep">${cov.name}</span>
                <!-- 보강이 필요할 때만 금액 및 월 납입료 출력 -->
                <span class="text-[10px] text-[#f37321] font-black shrink-0 ml-auto" style="white-space: nowrap; word-break: keep-all;">
                  ${formattedAmountStr} ${cov.premium > 0 ? `(월 ${formattedPremium}원)` : ""}
                </span>
              </div>
              <p class="text-[10px] text-slate-500 leading-relaxed font-semibold break-keep">${cov.basis}</p>
            </div>
          `;
        }).join("");
      }

      // 2. Populate intro text with metrics
      const introText = $("modal-premium-basis-intro");
      if (introText) {
        introText.innerHTML = `고객님의 최근 5개년 누적 검진 지표와 패밀리 유전 병력을 매칭하여 산출된 예방 특약 비중입니다. (공복혈당: ${glucose} mg/dL, 수축기혈압: ${sysBp} mmHg)`;
      }

      // 3. Populate discount badge
      const discountBadge = $("modal-discount-badge");
      if (discountBadge) {
        if (isSimplifiedTarget) {
          discountBadge.innerText = "간편가입 (할인 제외)";
          discountBadge.className = "bg-slate-400 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow-3xs";
        } else {
          discountBadge.innerText = discountRate > 0 ? `${Math.round(discountRate * 100)}% 할인 적용` : "할인 미적용";
          discountBadge.className = "bg-emerald-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow-3xs";
        }
      }

      // 4. Highlight rows in discount table
      const rowSuper = $("row-super-health");
      const rowGood = $("row-good-health");
      const rowFair = $("row-fair-health");
      if (rowSuper) rowSuper.style.backgroundColor = "transparent";
      if (rowGood) rowGood.style.backgroundColor = "transparent";
      if (rowFair) rowFair.style.backgroundColor = "transparent";

      if (!isSimplifiedTarget) {
        if (discountRate === 0.20 && rowSuper) rowSuper.style.backgroundColor = "#ecfdf5";
        else if (discountRate === 0.10 && rowGood) rowGood.style.backgroundColor = "#ecfdf5";
        else if (discountRate === 0.05 && rowFair) rowFair.style.backgroundColor = "#ecfdf5";
      }

      // 5. Populate appropriateness ratio gauge
      const estimatedMonthlyIncome = 3000000 + Math.max(0, (userAge - 25)) * 100000;
      const ratio = (finalTotalPremium / estimatedMonthlyIncome) * 100;
      const ratioText = $("adequacy-ratio-text");
      const ratioBar = $("adequacy-ratio-bar");

      if (ratioText) {
        ratioText.innerText = `월 ${ratio.toFixed(1)}% (${ratio <= 3 ? "매우 안전" : ratio <= 6 ? "안전" : "적정"})`;
      }
      if (ratioBar) {
        ratioBar.style.width = `${Math.min(100, (ratio / 8) * 100)}%`;
        if (ratio <= 6) {
          ratioBar.className = "h-full bg-emerald-500 rounded-full";
        } else if (ratio <= 8) {
          ratioBar.className = "h-full bg-amber-500 rounded-full";
        } else {
          ratioBar.className = "h-full bg-rose-500 rounded-full";
        }
      }

      // 6. Set official prospectus / term links
      const linkOfficial = $("modal-link-official-site") as HTMLAnchorElement | null;
      const linkPdf = $("modal-link-pdf-guide") as HTMLAnchorElement | null;
      if (linkOfficial) linkOfficial.href = productUrl;
      if (linkPdf) linkPdf.href = guidePdfUrl;

      // 7. Show modal
      modalBasis.classList.remove("hidden");
    });
  }

  // Upload handlers
  $("upload-zone")?.addEventListener("click", () => {
    $("existing-plan-file")?.click();
  });

  $("existing-plan-file")?.addEventListener("change", async (e) => {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }
    
    const file = input.files[0];
    const span = $("upload-zone")?.querySelector("span");
    if (span) span.innerText = file.name;
    
    // Show AI loading overlay
    const overlay = $("ai-analysis-overlay");
    const bar = $("ai-loading-bar");
    const percentText = $("ai-loading-percent");
    const stepText = $("ai-loading-step");
    
    if (overlay) overlay.classList.remove("hidden");
    if (bar) bar.style.width = "0%";
    if (percentText) percentText.innerText = "0%";
    if (stepText) stepText.innerText = "설계서 파일에서 데이터를 추출하고 있습니다...";

    let progress = 0;
    const progressInterval = setInterval(() => {
      if (progress < 92) {
        progress += Math.floor(Math.random() * 4) + 2; // 2%~5% increment
        if (progress > 92) progress = 92;
        if (bar) bar.style.width = `${progress}%`;
        if (percentText) percentText.innerText = `${progress}%`;
        
        if (progress < 25) {
          if (stepText) stepText.innerText = "설계서 파일에서 데이터 및 보장 내역을 해독하고 있습니다...";
        } else if (progress < 50) {
          if (stepText) stepText.innerText = "한화손보 맞춤 건강 지표와의 보장 매핑을 수행하고 있습니다...";
        } else if (progress < 75) {
          if (stepText) stepText.innerText = "과다 보장 및 부족한 담보 영역의 재설계 타당성을 시뮬레이션하고 있습니다...";
        } else {
          if (stepText) stepText.innerText = "초정밀 인공지능 분석 리포트를 조립 및 조율하는 중입니다...";
        }
      }
    }, 150);

    const resultDiv = $("analysis-result");
    if (resultDiv) {
      resultDiv.classList.remove("hidden");
      resultDiv.innerHTML = `<div class="text-slate-500 font-bold text-xs sm:text-sm animate-pulse">상세한 보장 차이점을 비교 분석 중입니다. 잠시만 기다려주세요...</div>`;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("productName", productName);

    try {
        const response = await fetch("/api/health/compare-plan", {
            method: "POST",
            body: formData
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            let errorMsg = "서버 에러가 발생했습니다.";
            try {
                const errData = JSON.parse(errorText);
                errorMsg = errData.error || errData.message || errorMsg;
            } catch (e) {
                errorMsg = errorText || errorMsg;
            }
            throw new Error(errorMsg);
        }

        const data = await response.json();
        if (data.error) {
            throw new Error(data.error);
        }

        const comparison = data.comparison;
        if (!comparison || !Array.isArray(comparison)) {
            throw new Error("비교 분석 데이터를 올바르게 로드하지 못했습니다.");
        }
        
        if (resultDiv) {
            const cardsHtml = comparison.map((item: any) => {
                let statusClass = "";
                if (item.status === "적정" || item.status === "우수") {
                    statusClass = "text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-bold";
                } else if (item.status === "과다") {
                    statusClass = "text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-bold";
                } else {
                    statusClass = "text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded font-bold";
                }
                return `
                    <div class="bg-slate-50 border border-slate-200/50 rounded-xl p-3.5 space-y-2.5 text-left shadow-3xs">
                        <div class="flex justify-between items-center border-b border-slate-100 pb-2">
                            <span class="font-extrabold text-slate-800 text-xs sm:text-sm">${item.category || item.item || ""}</span>
                            <span class="${statusClass} text-[10px]">${item.status || ""}</span>
                        </div>
                        <div class="grid grid-cols-2 gap-2 text-xs">
                            <div class="bg-white rounded-lg p-2 border border-slate-100">
                                <span class="text-[9px] text-slate-400 block mb-0.5 font-bold">기존 보장</span>
                                <span class="font-bold text-slate-600">${item.existing || item.old || ""}</span>
                            </div>
                            <div class="bg-orange-50/30 rounded-lg p-2 border border-orange-100/30">
                                <span class="text-[9px] text-orange-400 block mb-0.5 font-bold">한화 추천</span>
                                <span class="font-black text-[#f37321]">${item.recommended || item.new || ""}</span>
                            </div>
                        </div>
                        <div class="text-[11px] text-slate-600 leading-relaxed pt-1 break-keep">
                            <span class="font-bold text-slate-700">★ 분석 소견:</span> ${item.opinion || item.reason || ""}
                        </div>
                    </div>
                `;
            }).join("");

            const tableHtml = `
                <!-- 모바일용 카드 리스트 (모바일 전용, 횡스크롤 방지) -->
                <div class="block sm:hidden space-y-3">
                    ${cardsHtml}
                </div>

                <!-- 태블릿/데스크톱용 테이블 뷰 (sm 이상 해상도에서 노출) -->
                <div class="hidden sm:block overflow-x-auto w-full">
                    <table class="w-full text-xs sm:text-sm text-left border-collapse min-w-[450px]">
                        <thead>
                            <tr class="border-b border-slate-200 text-slate-505 font-bold text-[11px] sm:text-xs">
                                <th class="py-3 pr-2 w-[18%] min-w-[70px]">보장항목</th>
                                <th class="py-3 pr-2 w-[18%] min-w-[70px] whitespace-nowrap">기존</th>
                                <th class="py-3 pr-2 w-[18%] min-w-[70px] whitespace-nowrap">AI추천</th>
                                <th class="py-3 pr-2 w-[18%] min-w-[70px] whitespace-nowrap">적합여부</th>
                                <th class="py-3 w-[28%] min-w-[120px]">상세 의견</th>
                            </tr>
                        </thead>
                        <tbody class="text-slate-700 font-medium">
                            ${comparison.map((item: any) => {
                                let statusClass = "";
                                if (item.status === "적정" || item.status === "우수") {
                                    statusClass = "text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-bold";
                                } else if (item.status === "과다") {
                                    statusClass = "text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-bold";
                                } else {
                                    statusClass = "text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded font-bold";
                                }
                                return `
                                    <tr class="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                                        <td class="py-3 pr-2 font-bold text-slate-900">${item.category || item.item || ""}</td>
                                        <td class="py-3 pr-2 text-slate-500 whitespace-nowrap">${item.existing || item.old || ""}</td>
                                        <td class="py-3 pr-2 text-[#f37321] font-bold whitespace-nowrap">${item.recommended || item.new || ""}</td>
                                        <td class="py-3 pr-2"><span class="${statusClass}">${item.status || ""}</span></td>
                                        <td class="py-3 text-slate-600 leading-relaxed break-keep">${item.opinion || item.reason || ""}</td>
                                    </tr>
                                `;
                            }).join("")}
                        </tbody>
                    </table>
                </div>
            `;
            
            resultDiv.innerHTML = `
                <div class="space-y-4">
                    <div class="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                        <span class="w-2.5 h-2.5 rounded-full bg-[#f37321]"></span>
                        <h4 class="font-extrabold text-slate-800 text-xs sm:text-sm">보장 분석 비교 결과</h4>
                    </div>
                    ${tableHtml}
                    <div class="bg-[#fffcf7] border border-[#f37321]/20 rounded-xl p-3.5 text-[11px] sm:text-xs leading-relaxed font-semibold text-slate-700 break-keep">
                        <span class="text-[#f37321] font-black">★ AI 융합 분석 리포트 요약:</span> ${data.summary || '기존 설계서 분석 요약 정보가 존재하지 않습니다.'}
                    </div>
                </div>
            `;
            
            isComparisonCompleted = true;
            comparisonResultHtml = resultDiv.innerHTML;
            
            // 상담 신청 버튼 노출
            $("btn-consulting-consult-submit")?.classList.remove("hidden");
        }

        // Completion animation of loading overlay
        clearInterval(progressInterval);
        if (bar) bar.style.width = "100%";
        if (percentText) percentText.innerText = "100%";
        if (stepText) stepText.innerText = "분석 완료!";
        await new Promise(resolve => setTimeout(resolve, 500));
        if (overlay) overlay.classList.add("hidden");

    } catch (err: any) {
        console.error(err);
        clearInterval(progressInterval);
        if (overlay) overlay.classList.add("hidden");
        if (resultDiv) {
            resultDiv.innerHTML = `<div class="text-rose-500 font-bold text-xs sm:text-sm">분석 중 에러가 발생했습니다: ${err.message || 'Unknown error'}</div>`;
        }
    }
  });
}


function updateDashboardHeaderMeta() {
  const dUsername = $("dashboard-user-name");
  const bBirth = $("badge-birth");
  const bGender = $("badge-gender");
  
  const inputName = $("input-username") as HTMLInputElement | null;
  const displayName = userName && userName.trim() ? userName : (inputName && inputName.value ? inputName.value : "고객");
  
  if (dUsername) dUsername.innerText = displayName;
  
  if (bBirth && birthDate) {
    const cleanBirth = birthDate.replace(/[^0-9]/g, "");
    if (cleanBirth.length === 6) {
      bBirth.innerText = cleanBirth.substring(0,2) + "." + cleanBirth.substring(2,4) + "." + cleanBirth.substring(4,6) + " 출생";
    } else if (cleanBirth.length === 8) {
      bBirth.innerText = cleanBirth.substring(2,4) + "." + cleanBirth.substring(4,6) + "." + cleanBirth.substring(6,8) + " 출생";
    } else {
      bBirth.innerText = birthDate + " 출생";
    }
  }
  if (bGender) {
    bGender.innerText = gender === "M" ? "남성 고객" : "여성 고객";
  }
}

// ========================================================
// 7. [종합 AI 보고서 탭] 렌더링
// ========================================================
function renderReportTab() {
  if (!analysisResult) return;

  // 1. 점수 서클 회전각 설정 (건강시계열의 최신 연도 점수와 완벽 싱크 동기화 기산)
  const sortedRecords = [...nhisRecords].sort((a, b) => a.year - b.year);
  const score = sortedRecords.length > 0 ? calculateHealthScore(sortedRecords[sortedRecords.length - 1]) : analysisResult.overallScore;
  
  const arc = $("score-circle-arc");
  if (arc) {
    const r = 42;
    const circ = 2 * Math.PI * r; // 263.8
    const offset = circ * (1 - score / 100);
    arc.style.strokeDasharray = `${circ}`;
    arc.style.strokeDashoffset = `${offset}`;
    
    // 종합 점수 색상 동적 치환
    if (score >= 90) arc.style.stroke = "#10b981"; // 에메랄드
    else if (score >= 75) arc.style.stroke = "#f37321"; // 한화오렌지
    else arc.style.stroke = "#ef4444"; // 장미색
  }

  const scoreNum = $("rendered-score-num");
  if (scoreNum) scoreNum.innerText = String(score);

  // 생체 나이 및 점수 배지 연계
  const ageText = $("rendered-age-diff-text");
  const ageWrapper = $("wrapper-age-diff");
  const diff = analysisResult.biologicalAgeDiff;
  if (ageText && ageWrapper) {
    if (diff < 0) {
      ageText.innerText = `실제 나이 대비 ${Math.abs(diff)}년 젊음`;
      ageWrapper.className = "mt-4 px-3.5 py-1.5 rounded-full text-xs font-bold leading-none bg-emerald-50 text-emerald-700 border border-emerald-200";
    } else if (diff > 0) {
      ageText.innerText = `실제 나이 대비 ${diff}년 노화 우려`;
      ageWrapper.className = "mt-4 px-3.5 py-1.5 rounded-full text-xs font-bold leading-none bg-rose-50 text-rose-700 border border-rose-200";
    } else {
      ageText.innerText = "실제 나이 수준 및 평균 유지";
      ageWrapper.className = "mt-4 px-3.5 py-1.5 rounded-full text-xs font-bold leading-none bg-slate-100 text-slate-700 border border-slate-200";
    }
  }

  // 2. 고객 신형 뱃지 동기화
  updateDashboardHeaderMeta();

  // 날짜 설정
  const dDate = $("rendered-current-date");
  if (dDate) {
    const now = new Date();
    dDate.innerText = "분석 일시: " + now.toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });
  }

  // 3. 종합 소견 말풍선 갱신
  const summaryBlock = $("rendered-summary");
  if (summaryBlock) summaryBlock.innerText = analysisResult.summary;

  // 시뮬레이션 배지 설정
  const simStamp = $("rendered-simulation-stamp");
  if (simStamp) {
    if (isSimulated) {
      simStamp.innerText = "시뮬레이션 체험모드";
      simStamp.className = "bg-amber-100 text-amber-700 border border-amber-200 font-bold px-2 py-0.5 rounded text-[9px]";
    } else {
      simStamp.innerText = "실시간 인공지능 매핑";
      simStamp.className = "bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold px-2 py-0.5 rounded text-[9px]";
    }
  }

  // 4. 유해 경보 지표 목록 빌드
  const warningsContainer = $("rendered-warnings-list");
  if (warningsContainer) {
    if (analysisResult.warnings.length === 0) {
      warningsContainer.innerHTML = `
        <div class="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center text-slate-500 text-xs">
          현재 비정상 범위의 이상 지표가 검출되지 않은 최고의 웰빙 상태입니다.
        </div>
      `;
    } else {
      warningsContainer.innerHTML = analysisResult.warnings.map((w) => {
        let cardBg = "bg-amber-50/50 border-amber-100";
        let statusTag = `<span class="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 whitespace-nowrap">주의단계</span>`;
        
        if (w.status === "RED") {
          cardBg = "bg-rose-50/50 border-rose-100";
          statusTag = `<span class="bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 whitespace-nowrap">🚨 즉각관리</span>`;
        } else if (w.status === "GREEN") {
          cardBg = "bg-emerald-50/50 border-emerald-100";
          statusTag = `<span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 whitespace-nowrap">✅ 유지관리</span>`;
        }

        return `
          <div class="p-5 ${cardBg} border rounded-2xl flex flex-col sm:flex-row justify-between items-start gap-4">
            <div class="space-y-2 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                ${statusTag}
                <span class="font-bold text-[#231f20] text-sm">${w.item}</span>
                <span class="text-xs font-mono font-bold text-slate-500 bg-white shadow-3xs px-2 py-0.5 rounded border border-slate-100 whitespace-nowrap">${w.value}</span>
              </div>
              <p class="text-slate-600 text-xs sm:text-sm leading-relaxed break-keep">${w.analysis}</p>
            </div>
            <div class="bg-white/80 backdrop-blur-3xs rounded-xl p-3 border border-slate-100 w-full sm:max-w-[240px] shrink-0">
              <span class="text-[9px] font-extrabold uppercase text-[#f37321] block tracking-wider mb-1">한화손보 건강처방</span>
              <span class="text-xs text-slate-700 font-semibold leading-relaxed block break-keep">${w.action}</span>
            </div>
          </div>
        `;
      }).join("");
    }
  }

  // 5. 내년도 추천 정밀 검사 목록 빌드 (추가 기획 보장 공백 및 재검 타이머 융합)
  const recommendedContainer = $("rendered-recommended-checks");
  if (recommendedContainer) {
    let checksCardsHtml = analysisResult.recommendedChecks.map((item) => {
      const isHigh = item.priority === "HIGH";
      const badgeCls = isHigh ? "bg-red-50 text-red-700 border-red-100" : "bg-indigo-50 text-indigo-700 border-indigo-100";
      
      return `
        <div class="bg-white hover:bg-[#fff5ee]/10 p-5 rounded-2xl border border-slate-200 flex flex-col justify-between space-y-4 shadow-3xs transition-all hover:scale-[1.01]">
          <div class="space-y-2.5">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-extrabold text-slate-400 font-mono uppercase">${item.category}</span>
              <span class="text-[9px] font-bold px-2 py-0.5 rounded-md border ${badgeCls}">${isHigh ? "강력 권장" : "예방 권장"}</span>
            </div>
            <h4 class="font-extrabold text-slate-800 text-sm tracking-tight break-keep">${item.checkItem}</h4>
            <p class="text-[#767676] text-xs leading-relaxed min-h-[50px] break-keep">${item.reason}</p>
          </div>
          <div class="border-t border-slate-100 pt-3 flex items-center justify-between">
            <span class="text-[10px] text-slate-400 font-medium pb-px">검사 권장 기한 : 내년 상반기</span>
            <div class="w-2.5 h-2.5 rounded-full bg-[#f37321]"></div>
          </div>
        </div>
      `;
    }).join("");

    // ⏱️ 추가 기획 1: 다음 추천 검진 리마인더 카드 동적 생성
    const sortedRecords = [...nhisRecords].sort((a, b) => b.year - a.year);
    const latestGl = sortedRecords[0]?.fastingGlucose ?? 95;
    const latestBmi = sortedRecords[0]?.bmi ?? 22.5;
    
    let checkupTimerText = "고객님은 현재 전반적인 대사 지표가 정상 범위에 속해 있으므로 내년도 국민건강보험 정기 검진을 계획대로 받으셔도 안전합니다.";
    let checkupTimerIcon = "🟢";
    if (latestGl >= 100 || latestBmi >= 25) {
      // 3개월 뒤 재검사 기한 날짜 계산
      const targetDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      const formattedDate = targetDate.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
      checkupTimerText = `공복 식전혈당(${latestGl} mg/dL) 또는 체중 지표가 다소 높아, <b>3개월 뒤인 ${formattedDate}경</b> 자가혈당 측정 및 복부 대사지표 재추적 검사를 추천합니다.`;
      checkupTimerIcon = "⏳";
    }

    checksCardsHtml += `
      <div class="bg-gradient-to-br from-[#fffdfb] to-[#fff5ee] p-5 rounded-2xl border border-orange-200/40 flex flex-col justify-between space-y-4 shadow-3xs transition-all hover:scale-[1.01] text-left">
        <div class="space-y-2.5">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-extrabold text-orange-400 font-mono uppercase">NEXT CHECKUP TIMER</span>
            <span class="text-[9px] font-bold px-2 py-0.5 rounded-md border bg-orange-50 text-[#f37321] border-orange-100 flex items-center gap-1">${checkupTimerIcon} 정밀 추적</span>
          </div>
          <h4 class="font-extrabold text-slate-800 text-sm tracking-tight break-keep">대사 연동 차기 검진 권장 리마인더</h4>
          <p class="text-slate-600 text-xs leading-relaxed min-h-[50px] break-keep">${checkupTimerText}</p>
        </div>
        <div class="border-t border-orange-100/60 pt-3 flex items-center justify-between">
          <span class="text-[10px] text-orange-500 font-bold pb-px">건강 신호 리마인더 활성화 중</span>
          <div class="w-2.5 h-2.5 rounded-full bg-[#f37321] animate-ping"></div>
        </div>
      </div>
    `;

    // 🛡️ 추가 기획 2: 한화손보 AI 보장 격차(Gap) 가이드 카드 동적 생성
    let gapAnalysisText = "현재 주요 대사증후군 위험도가 비교적 건강 표준치 내에 있으므로, 기존에 가입해두신 안심 실손 보장을 탄탄하게 유지하시면 충분합니다.";
    let hasGap = false;
    if (latestGl >= 100 || latestBmi >= 23) {
      gapAnalysisText = "당뇨 경계 및 과체중 소견이 감지되었습니다. <b>만성질환 합병증(뇌혈관/허혈성 심장질환 등) 진단비 보장 특약</b>의 공백이 없는지 한화손보 AI 진단을 통해 기가입 보장 대조표를 확인해보세요.";
      hasGap = true;
    }

    checksCardsHtml += `
      <div class="bg-gradient-to-br from-[#f5f7ff] to-[#edf0ff] p-5 rounded-2xl border border-indigo-200/40 flex flex-col justify-between space-y-4 shadow-3xs transition-all hover:scale-[1.01] text-left">
        <div class="space-y-2.5">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-extrabold text-indigo-400 font-mono uppercase">AI INSURANCE GAP</span>
            <span class="text-[9px] font-bold px-2 py-0.5 rounded-md border ${hasGap ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-indigo-50 text-indigo-700 border-indigo-100'}">${hasGap ? '보장공백 위험' : '안정 상태'}</span>
          </div>
          <h4 class="font-extrabold text-slate-800 text-sm tracking-tight break-keep">한화손보 AI 보장 격차(Gap) 가이드</h4>
          <p class="text-slate-600 text-xs leading-relaxed min-h-[50px] break-keep">${gapAnalysisText}</p>
        </div>
        <div class="border-t border-indigo-100/60 pt-3 flex items-center justify-between">
          <button type="button" onclick="document.querySelector('.tab-btn[data-tab=\\'consulting\\']')?.click();" class="text-[10px] text-indigo-600 font-bold hover:underline transition-all cursor-pointer flex items-center gap-1 bg-transparent border-0 outline-none">
            <span>🛡️ AI 맞춤 설계 비교하러 가기</span>
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
          </button>
        </div>
      </div>
    `;

    recommendedContainer.innerHTML = checksCardsHtml;
  }

  // 💊 처방전 및 약물 분석 섹션 렌더링 추가
  step4Dashboard.renderPrescriptionSection(dashboardCtx);
}

// ========================================================
// 🔄 건강 메트릭 지표 선택 및 연도별 카드 캐러샐(Carousel) 인프라 설계
const metricsOrder = ["glucose", "bp", "liver", "cholesterol", "bmi"];
const metricNames: { [key: string]: string } = {
  glucose: "공복혈당",
  bp: "혈압",
  liver: "AST/ALT 간수치",
  cholesterol: "콜레스테롤",
  bmi: "체중/BMI"
};
let currentMetricIndex = 0; // 현재 활성화된 주 메트릭 지표

// 🎠 년도별 검진 이력 카드 슬라이드 전역 기어
let currentYearSlideIndex = 0; // 역순 정렬(최신순)에 맞춰 0번째(가장 최근)를 디폴트 전면 배치
let yearCarouselTimer: any = null;

function switchMetric(metric: string) {
  // 메트릭 스위치는 통합 뷰 구성으로 인해 더이상 개별 전환을 필요로 하지 않지만, 기존 코드 구조 호환성을 위해 남겨둡니다.
}

// 🎠 년도별 검진카드 슬라이딩 캐러샐 제어 로직 (데이터 한계 방어 및 공백 예방)
function updateCategoryUI(key: string, index: number, records: any[]) {
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
}
function calculateHealthScore(record: any): number {
  let score = 100;
  
  // 1. 공복혈당
  const gl = record.fastingGlucose ?? 95;
  if (gl >= 126) score -= 15;
  else if (gl >= 100) score -= 7;

  // 2. 혈압
  const sbp = record.systolicBP ?? 120;
  const dbp = record.diastolicBP ?? 80;
  if (sbp >= 140 || dbp >= 90) score -= 15;
  else if (sbp > 120 || dbp > 80) score -= 6;

  // 3. 간수치
  const ast = record.ast ?? 25;
  const alt = record.alt ?? 25;
  const rGtp = record.rGtp ?? record.rgtp ?? 30;
  if (ast > 40) score -= 5;
  if (alt > 40) score -= 5;
  if (rGtp > 50) score -= 4;

  // 4. 신장
  const egfr = record.egfr ?? 95;
  if (egfr < 60) score -= 15;
  else if (egfr < 90) score -= 5;

  // 5. 비만도
  const bmi = record.bmi ?? 22.5;
  if (bmi >= 25 || bmi < 18.5) score -= 8;
  else if (bmi >= 23) score -= 3;

  // 6. 이상지질혈증
  const ldl = record.ldlcholesterol ?? 110;
  const tg = record.triglycerides ?? 130;
  if (ldl >= 160) score -= 8;
  else if (ldl >= 130) score -= 3;
  if (tg >= 200) score -= 8;
  else if (tg >= 150) score -= 3;

  return Math.max(60, Math.min(100, score));
}

function drawWellnessScoreChart() {
  const svg = $("trends-score-svg") as unknown as SVGSVGElement | null;
  if (!svg) return;

  const records = [...nhisRecords].sort((a, b) => a.year - b.year);
  if (records.length === 0) {
    svg.innerHTML = `<text x="250" y="75" fill="#64748b" text-anchor="middle" font-size="12px" class="font-bold">데이터가 존재하지 않습니다</text>`;
    return;
  }

  // Calculate scores and years
  const scores = records.map(r => calculateHealthScore(r));
  const latestScore = scores[scores.length - 1];
  const avgScore = scores.length > 0 
    ? Math.round(scores.reduce((sum, curr) => sum + curr, 0) / scores.length)
    : 0;

  // Update indicators
  const indicator = $("trends-overall-score-indicator");
  if (indicator) {
    indicator.textContent = `${avgScore}점`;
  }
  const currentText = $("trends-current-score-text");
  if (currentText) {
    currentText.textContent = `${latestScore}점`;
  }

  // Layout parameters (Taller and wider casual graph)
  const width = 500;
  const height = 150;
  const paddingX = 42;
  const paddingY = 32;

  // Determine current active year to highlight
  const descRecords = [...nhisRecords].sort((a, b) => b.year - a.year);
  const activeYear = descRecords[currentYearSlideIndex]?.year || 0;

  // Render horizontal grid lines
  let gridLinesHtml = "";
  const gridLevels = [60, 80, 100];
  gridLevels.forEach(scoreLevel => {
    const yVal = height - paddingY - ((scoreLevel - 50) / 50) * (height - 2 * paddingY);
    gridLinesHtml += `
      <line x1="${paddingX - 10}" y1="${yVal}" x2="${width - paddingX + 10}" y2="${yVal}" stroke="#cbd5e1" stroke-opacity="0.65" stroke-dasharray="3,3" stroke-width="1.2" />
      <text x="${paddingX - 16}" y="${yVal + 3.5}" fill="#475569" font-size="10px" font-weight="black" font-family="monospace" text-anchor="end">${scoreLevel}</text>
    `;
  });

  // Calculate coordinates
  const coords = records.map((r, i) => {
    const xVal = records.length > 1 
      ? paddingX + (i / (records.length - 1)) * (width - 2 * paddingX)
      : width / 2;
    const scoreVal = scores[i];
    const yVal = height - paddingY - ((scoreVal - 50) / 50) * (height - 2 * paddingY);
    return { x: xVal, y: yVal, year: r.year, score: scoreVal, rawIndex: i };
  });

  // Cubic Bezier interpolation for extra casual, smooth & gorgeous curves
  const getCurvePath = (points: {x: number, y: number}[]) => {
    if (points.length < 2) return "";
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cpX1 = p0.x + (p1.x - p0.x) / 2.5;
      const cpY1 = p0.y;
      const cpX2 = p0.x + 1.5 * (p1.x - p0.x) / 2.5;
      const cpY2 = p1.y;
      path += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p1.x} ${p1.y}`;
    }
    return path;
  };

  const smoothLinePath = getCurvePath(coords);
  
  // Render Area Gradient Fill Path
  let areaPathD = "";
  if (coords.length > 1 && smoothLinePath) {
    areaPathD = `${smoothLinePath} L ${coords[coords.length - 1].x} ${height - paddingY + 12} L ${coords[0].x} ${height - paddingY + 12} Z`;
  }

  // Render HTML elements inside SVG
  let pointsHtml = "";
  coords.forEach((pt, i) => {
    const isSelected = pt.year === activeYear;
    const slideIdxInCarousel = descRecords.findIndex(r => r.year === pt.year);

    pointsHtml += `
      <!-- Connection vertical drop line to base for the selected active year -->
      ${isSelected ? `
        <line x1="${pt.x}" y1="${pt.y}" x2="${pt.x}" y2="${height - paddingY + 12}" stroke="#f37321" stroke-opacity="0.32" stroke-dasharray="3,3" stroke-width="2.2" />
      ` : ''}

      <!-- Year text (with cursor feedback and reliable contrasts) -->
      <text x="${pt.x}" y="${height - 8}" fill="${isSelected ? '#e05a00' : '#475569'}" font-size="12px" font-weight="${isSelected ? '900' : '900'}" text-anchor="middle" class="cursor-pointer transition-all select-none hover:fill-amber-500" onclick="window.switchYearSlideByScore(${slideIdxInCarousel})">
        ${pt.year}년
      </text>
      
      <!-- Casual Speech Bubble Tooltip for selected / Standard plain score label for inactive -->
      ${isSelected ? `
        <!-- SVG Tooltip background pill -->
        <g class="cursor-pointer" onclick="window.switchYearSlideByScore(${slideIdxInCarousel})">
          <rect x="${pt.x - 24}" y="${pt.y - 31}" width="48" height="21" rx="6" fill="#f37321" />
          <path d="M ${pt.x - 4} ${pt.y - 10} L ${pt.x} ${pt.y - 6} L ${pt.x + 4} ${pt.y - 10} Z" fill="#f37321" />
          <text x="${pt.x}" y="${pt.y - 16}" fill="#ffffff" font-size="12.5px" font-weight="900" font-family="monospace" text-anchor="middle" class="select-none">${pt.score}점</text>
        </g>
      ` : `
        <!-- Plain score text label -->
        <text x="${pt.x}" y="${pt.y - 13}" fill="#334155" font-size="11.5px" font-weight="900" font-family="monospace" text-anchor="middle" class="cursor-pointer transition-all select-none hover:fill-[#e05a00]" onclick="window.switchYearSlideByScore(${slideIdxInCarousel})">
          ${pt.score}점
        </text>
      `}

      <!-- Active indicator dot / interactive node -->
      <g class="cursor-pointer" onclick="window.switchYearSlideByScore(${slideIdxInCarousel})">
        <!-- Enlarged touch target -->
        <circle cx="${pt.x}" cy="${pt.y}" r="20" fill="transparent" />
        ${isSelected ? `
          <circle cx="${pt.x}" cy="${pt.y}" r="12" fill="#f37321" fill-opacity="0.25" class="animate-pulse" />
          <circle cx="${pt.x}" cy="${pt.y}" r="7.5" fill="#f37321" stroke="#ffffff" stroke-width="2.5" />
        ` : `
          <circle cx="${pt.x}" cy="${pt.y}" r="6" fill="#ffffff" stroke="#ffaa66" stroke-width="2.5" class="hover:stroke-[#e05a00] transition-all" />
        `}
      </g>
    `;
  });

  svg.innerHTML = `
    <defs>
      <linearGradient id="score-chart-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#f37321" stop-opacity="0.18" />
        <stop offset="100%" stop-color="#f37321" stop-opacity="0.01" />
      </linearGradient>
      
      <!-- Casual Soft Glow Filter for the main trendline -->
      <filter id="casual-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3.5" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    
    <!-- Grids -->
    ${gridLinesHtml}
    
    <!-- Area gradient beneath line -->
    ${areaPathD ? `<path d="${areaPathD}" fill="url(#score-chart-grad)" />` : ''}
    
    <!-- Smooth casual connection line with a stylish filter look & soft orange stroke -->
    ${smoothLinePath ? `
      <path d="${smoothLinePath}" stroke="#ffaa66" stroke-width="5" stroke-opacity="0.2" fill="none" stroke-linecap="round" stroke-linejoin="round" filter="url(#casual-glow)" />
      <path d="${smoothLinePath}" stroke="#f37321" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
    ` : ''}
    
    <!-- Score point markers & labels -->
    ${pointsHtml}
  `;
}

// Bind to global window so SVG onclick works cleanly
(window as any).switchYearSlideByScore = (index: number) => {
  switchYearSlide(index, true);
};

function renderTrendsTab() {
  const records = [...nhisRecords].sort((a, b) => b.year - a.year);
  if (records.length > 0) {
    if (currentYearSlideIndex < 0 || currentYearSlideIndex >= records.length) {
      currentYearSlideIndex = 0;
    }
  } else {
    currentYearSlideIndex = 0;
  }

  // 통합 기어 타임라인 다이나믹 드로잉
  renderTimelineChart();

  // 슬라이드 동적 스냅 기어 동기화 조정
  switchYearSlide(currentYearSlideIndex, false);

  // 연도별 종합 건강 점수 실시간 드로잉
  drawWellnessScoreChart();
}

function renderTimelineChartNew() {
  const chartContainer = $("dynamic-timeline-chart");
  if (!chartContainer) return;

  // 가용 연도 순서 배치 최신 년도순으로 정렬
  const records = [...nhisRecords].sort((a, b) => b.year - a.year);
  if (records.length === 0) {
    chartContainer.innerHTML = `
      <div class="w-full flex flex-col items-center justify-center py-12 text-slate-400">
        <svg class="w-12 h-12 mb-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span class="text-sm font-bold">인식된 건강 검진 이력 데이터가 없습니다.</span>
      </div>
    `;
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
        return `
          <span class="inline-flex items-center gap-0.5 text-[11px] font-black text-red-650 bg-red-55 border border-red-200 px-2 py-0.5 rounded leading-none">
            ▲ +${diff.toFixed(1)}${unit}
          </span>
        `;
      } else {
        return `
          <span class="inline-flex items-center gap-0.5 text-[11px] font-black text-emerald-600 bg-emerald-55 border border-emerald-250 px-2 py-0.5 rounded leading-none">
            ▲ +${diff.toFixed(1)}${unit}
          </span>
        `;
      }
    } else if (diff < 0) {
      const absVal = Math.abs(diff);
      if (isLowerBetter) {
        return `
          <span class="inline-flex items-center gap-0.5 text-[11px] font-black text-emerald-600 bg-emerald-55 border border-emerald-250 px-2 py-0.5 rounded leading-none">
            ▼ -${absVal.toFixed(1)}${unit}
          </span>
        `;
      } else {
        return `
          <span class="inline-flex items-center gap-0.5 text-[11px] font-black text-red-650 bg-red-55 border border-red-200 px-2 py-0.5 rounded leading-none">
            ▼ -${absVal.toFixed(1)}${unit}
          </span>
        `;
      }
    } else {
      return `
        <span class="inline-flex items-center text-[11px] font-bold text-slate-405 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded leading-none">
          ● 유지
        </span>
      `;
    }
  }

  // 건강 등급 헬퍼
  function getStatusBadge(level: 1 | 2 | 3, label: string) {
    if (level === 1) {
      return `<span class="text-[12px] sm:text-[13px] font-black bg-emerald-50 text-emerald-600 border border-emerald-100 px-2 py-1 rounded-md leading-none shadow-3xs">정상 (${label})</span>`;
    } else if (level === 2) {
      return `<span class="text-[12px] sm:text-[13px] font-black bg-amber-50 text-amber-500 border border-amber-100 px-2 py-1 rounded-md leading-none shadow-3xs">주의 (${label})</span>`;
    } else {
      return `<span class="text-[12px] sm:text-[13px] font-black bg-red-500 text-white border border-red-100 px-2 py-1 rounded-md animate-pulse leading-none shadow-3xs">경고 (${label})</span>`;
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

      metricContent = `
        <div class="divide-y divide-slate-100">
          <div class="flex items-center justify-between py-2">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">공복 혈당</span>
              <span class="text-base sm:text-lg font-black text-slate-800 font-mono tracking-tight mt-0.5">${gVal} <span class="text-[10px] text-slate-400 font-normal">mg/dL</span></span>
            </div>
            <div class="flex items-center gap-1">
              ${prevRecord ? renderDeltaPill(gVal - prevG, true, "") : ""}
              ${getStatusBadge(gStat.level, gStat.label)}
            </div>
          </div>
          <div class="flex items-center justify-between py-2">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">총 콜레스테롤</span>
              <span class="text-sm sm:text-base font-bold text-slate-700 font-mono mt-0.5">${tcVal} <span class="text-[10px] text-slate-400 font-normal">mg/dL</span></span>
            </div>
            <div class="flex items-center gap-1">
              ${prevRecord ? renderDeltaPill(tcVal - prevTc, true, "") : ""}
              ${getStatusBadge(tcStat.level, tcStat.label)}
            </div>
          </div>
          <div class="flex items-center justify-between py-2">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">중성 지방</span>
              <span class="text-sm sm:text-base font-bold text-slate-700 font-mono mt-0.5">${tgVal} <span class="text-[10px] text-slate-400 font-normal">mg/dL</span></span>
            </div>
            <div class="flex items-center gap-1">
              ${prevRecord ? renderDeltaPill(tgVal - prevTg, true, "") : ""}
              ${getStatusBadge(tgStat.level, tgStat.label)}
            </div>
          </div>
          <div class="flex items-center justify-between py-2">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">LDL 콜레스테롤</span>
              <span class="text-xs sm:text-sm font-semibold text-slate-600 font-mono mt-0.5">${ldlVal} mg/dL</span>
            </div>
            <div class="flex items-center">
              ${prevRecord ? renderDeltaPill(ldlVal - prevLdl, true, "") : ""}
            </div>
          </div>
          <div class="flex items-center justify-between py-2">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">HDL 콜레스테롤</span>
              <span class="text-xs sm:text-sm font-semibold text-slate-600 font-mono mt-0.5">${hdlVal} mg/dL</span>
            </div>
            <div class="flex items-center">
              ${prevRecord ? renderDeltaPill(hdlVal - prevHdl, false, "") : ""}
            </div>
          </div>
        </div>
      `;
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

      metricContent = `
        <div class="divide-y divide-slate-100">
          <div class="flex items-center justify-between py-2.5">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">수축기/이완기 혈압</span>
              <span class="text-xl sm:text-2xl font-black text-slate-800 font-mono tracking-tight mt-0.5">${sbpVal}/${dbpVal} <span class="text-[10px] text-slate-400 font-normal">mmHg</span></span>
            </div>
            <div class="flex items-center">
              ${getStatusBadge(bpStat.level, bpStat.label)}
            </div>
          </div>
          <div class="flex items-center justify-between py-2">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">수축기 (최고혈압)</span>
              <span class="text-sm font-bold text-slate-700 font-mono mt-0.5">${sbpVal} mmHg</span>
            </div>
            <div class="flex items-center">
              ${prevRecord ? renderDeltaPill(sbpVal - prevSbp, true, "") : ""}
            </div>
          </div>
          <div class="flex items-center justify-between py-2">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">이완기 (최저혈압)</span>
              <span class="text-sm font-bold text-slate-700 font-mono mt-0.5">${dbpVal} mmHg</span>
            </div>
            <div class="flex items-center">
              ${prevRecord ? renderDeltaPill(dbpVal - prevDbp, true, "") : ""}
            </div>
          </div>
        </div>
      `;
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

      metricContent = `
        <div class="divide-y divide-slate-100">
          <div class="flex items-center justify-between py-2.5">
            <span class="text-xs sm:text-[13px] font-bold text-slate-500">간상태 분류</span>
            ${getStatusBadge(liverStat.level, liverStat.label)}
          </div>
          <div class="flex items-center justify-between py-2">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">AST</span>
              <span class="text-base sm:text-lg font-black text-slate-800 font-mono tracking-tight mt-0.5">${astVal} <span class="text-[10px] text-slate-400 font-normal">U/L</span></span>
            </div>
            <div class="flex items-center">
              ${prevRecord ? renderDeltaPill(astVal - prevAst, true, "") : ""}
            </div>
          </div>
          <div class="flex items-center justify-between py-2">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">ALT (대사효소)</span>
              <span class="text-base sm:text-lg font-black text-slate-800 font-mono tracking-tight mt-0.5">${altVal} <span class="text-[10px] text-slate-400 font-normal">U/L</span></span>
            </div>
            <div class="flex items-center">
              ${prevRecord ? renderDeltaPill(altVal - prevAlt, true, "") : ""}
            </div>
          </div>
          <div class="flex items-center justify-between py-2">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">r-GTP</span>
              <span class="text-sm font-semibold text-slate-700 font-mono mt-0.5">${rgtpVal} U/L</span>
            </div>
            <div class="flex items-center">
              ${prevRecord ? renderDeltaPill(rgtpVal - prevRgtp, true, "") : ""}
            </div>
          </div>
        </div>
      `;
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

      metricContent = `
        <div class="divide-y divide-slate-100">
          <div class="flex items-center justify-between py-2.5">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">BMI 비만지수</span>
              <span class="text-lg sm:text-xl font-black text-slate-800 font-mono tracking-tight mt-0.5">${bmiVal.toFixed(1)} <span class="text-[10px] text-slate-400 font-normal">kg/m²</span></span>
            </div>
            <div class="flex items-center">
              ${getStatusBadge(bmiStat.level, bmiStat.label)}
            </div>
          </div>
          <div class="flex items-center justify-between py-2">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">체중</span>
              <span class="text-base sm:text-lg font-black text-slate-800 font-mono tracking-tight mt-0.5">${wtVal} <span class="text-[10px] text-slate-400 font-normal">kg</span></span>
            </div>
            <div class="flex items-center">
              ${prevRecord ? renderDeltaPill(wtVal - prevWt, true, "kg") : ""}
            </div>
          </div>
          <div class="flex items-center justify-between py-2">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">허리 둘레</span>
              <span class="text-sm font-semibold text-slate-700 font-mono mt-0.5">${waistVal} cm</span>
            </div>
            <div class="flex items-center">
              ${prevRecord ? renderDeltaPill(waistVal - prevWaist, true, "") : ""}
            </div>
          </div>
        </div>
      `;
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

      metricContent = `
        <div class="divide-y divide-slate-100">
          <div class="flex items-center justify-between py-2">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">당화혈색소 (HbA1c)</span>
              <span class="text-base sm:text-lg font-black text-slate-800 font-mono tracking-tight mt-0.5">${hbVal.toFixed(1)}%</span>
            </div>
            <div class="flex items-center">
              ${prevRecord ? renderDeltaPill(hbVal - prevHb, true, "%") : ""}
            </div>
          </div>
          <div class="flex items-center justify-between py-2">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">사구체여과율 (eGFR)</span>
              <span class="text-base sm:text-lg font-black text-slate-800 font-mono tracking-tight mt-0.5">${egfrVal.toFixed(0)} <span class="text-[10px] text-slate-400 font-normal">mL/min</span></span>
            </div>
            <div class="flex items-center">
              ${prevRecord ? renderDeltaPill(egfrVal - prevEgfr, false, "") : ""}
            </div>
          </div>
          <div class="flex items-center justify-between py-2">
            <div class="flex flex-col">
              <span class="text-xs sm:text-[13px] font-bold text-slate-500">크레아티닌</span>
              <span class="text-sm font-semibold text-slate-700 font-mono mt-0.5">${crVal.toFixed(2)} mg/dL</span>
            </div>
            <div class="flex items-center">
              ${prevRecord ? renderDeltaPill(crVal - prevCr, true, "") : ""}
            </div>
          </div>
        </div>
      `;
    }

    const miniTabsHtml = records.map((rec, idx) => {
      const isSelected = idx === currentYearSlideIndex;
      const activeClass = isSelected 
        ? "bg-[#f37321] text-white font-black shadow-3xs" 
        : "bg-slate-100 text-slate-500 hover:bg-slate-200";
      const yr = String(rec.year).slice(-2);
      return '<button type="button" class="shrink-0 whitespace-nowrap px-2 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ' + activeClass + '" onclick="window.switchYearSlideByScore(' + idx + ')">' + yr + '년</button>';
    }).join("");

    categoriesHtml += `
      <!-- [${cat.name}] 독자적 플랫 카드 -->
      <div id="carousel-${cat.key}-card" class="rounded-2xl border ${cat.border} ${cat.bg} p-4 flex flex-col justify-between shadow-xs hover:shadow-sm transition-all space-y-3" style="box-sizing: border-box;">
        <div>
          <!-- 카드 헤더 및 개별 연도 표시 탭 -->
          <div class="flex items-center justify-between mb-3 pb-2 border-b border-slate-100 select-none gap-2 flex-wrap sm:flex-nowrap">
            <span class="text-xs sm:text-[13px] font-extrabold text-slate-800 shrink-0">
              ${cat.name}
            </span>
            <div class="flex items-center gap-1 overflow-x-auto scrollbar-none flex-nowrap shrink-0">
              ${miniTabsHtml}
            </div>
          </div>

          <!-- 플랫 지표 컨텐츠 -->
          <div class="w-full select-none py-1">
            ${metricContent}
          </div>
        </div>

        <!-- 하단 간편 팁 영역 -->
        <div class="pt-2 text-[10.5px] text-slate-400 font-medium flex items-start gap-1 select-none leading-relaxed border-t border-slate-100/60">
          <span class="shrink-0 text-[#f37321]">💡</span>
          <span class="break-keep text-slate-500">${cat.tip}</span>
        </div>
      </div>
    `;
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
}
function renderTimelineChart(metric: string = "") {
  renderTimelineChartNew();
}
function dummyOldFunctionUnused(metric: string) {
  const chartContainer = $("dynamic-timeline-chart");
  const legend = $("chart-legend-container");
  const yLabel = $("chart-y-axis-label");
  if (!chartContainer) return;

  // 가용 연도 순서 배치 크로노로지컬 순서로 정렬
  const records = [...nhisRecords].sort((a, b) => a.year - b.year);
  if (records.length === 0) return;

  // Y축 서술 및 범례에 대응하는 변수 및 텍스트 셋 정의
  let label1 = "";
  let label2 = "";
  let unit1 = "";
  let unit2 = "";
  
  // 지표 취득용 헬퍼 함수 정의
  let getVal1: (r: any) => number = () => 0;
  let getVal2: (r: any) => number = () => 0;
  
  // 포맷팅 헬퍼 정의
  let format1: (v: number) => string = (v) => String(v);
  let format2: (v: number) => string = (v) => String(v);

  // 건강 등급 분기 조건 (level 1=정상, 2=주의, 3=위험)
  let status1: (v: number) => { label: string; level: 1 | 2 | 3 } = () => ({ label: "정상", level: 1 });
  let status2: (v: number) => { label: string; level: 1 | 2 | 3 } = () => ({ label: "정상", level: 1 });

  // 개선 방향 (수치가 작아지는 것이 이득인가 여부)
  let isLowerBetter1 = true;
  let isLowerBetter2 = true;

  if (metric === "glucose") {
    label1 = "공복혈당";
    label2 = "당화혈색소";
    unit1 = "mg/dL";
    unit2 = "%";
    getVal1 = (r) => r.fastingGlucose ?? 90;
    getVal2 = (r) => r.hba1c ?? 5.5;
    format1 = (v) => `${v} mg/dL`;
    format2 = (v) => `${v.toFixed(1)}%`;
    status1 = (v) => {
      if (v < 100) return { label: "정상", level: 1 };
      if (v < 126) return { label: "공복혈당장애 (주의)", level: 2 };
      return { label: "당뇨 관리 의심 (위험)", level: 3 };
    };
    status2 = (v) => {
      if (v < 5.7) return { label: "정상", level: 1 };
      if (v < 6.5) return { label: "당뇨 전단계 (주의)", level: 2 };
      return { label: "당뇨 (경보)", level: 3 };
    };
    isLowerBetter1 = true;
    isLowerBetter2 = true;
    if (yLabel) yLabel.innerText = "지표: 공복혈당(정밀) / 당화혈색소";
  } else if (metric === "bp") {
    label1 = "수축기 혈압";
    label2 = "이완기 혈압";
    unit1 = "mmHg";
    unit2 = "mmHg";
    getVal1 = (r) => r.systolicBP ?? 120;
    getVal2 = (r) => r.diastolicBP ?? 80;
    format1 = (v) => `${v} mmHg`;
    format2 = (v) => `${v} mmHg`;
    status1 = (v) => {
      if (v < 120) return { label: "정상", level: 1 };
      if (v < 140) return { label: "상승/고혈압전단계", level: 2 };
      return { label: "고혈압 의심 (위험)", level: 3 };
    };
    status2 = (v) => {
      if (v < 80) return { label: "정상", level: 1 };
      if (v < 90) return { label: "주의", level: 2 };
      return { label: "고혈압 의심 (위험)", level: 3 };
    };
    isLowerBetter1 = true;
    isLowerBetter2 = true;
    if (yLabel) yLabel.innerText = "지표: 수축기 / 이완기 혈압";
  } else if (metric === "liver") {
    label1 = "AST";
    label2 = "ALT";
    unit1 = "U/L";
    unit2 = "U/L";
    getVal1 = (r) => r.ast ?? 25;
    getVal2 = (r) => r.alt ?? 25;
    format1 = (v) => `${v} U/L`;
    format2 = (v) => `${v} U/L`;
    status1 = (v) => {
      if (v <= 40) return { label: "정상", level: 1 };
      if (v <= 60) return { label: "경미 상승 (주의)", level: 2 };
      return { label: "간기능 위험 (경보)", level: 3 };
    };
    status2 = (v) => {
      if (v <= 40) return { label: "정상", level: 1 };
      if (v <= 60) return { label: "경미 상승 (주의)", level: 2 };
      return { label: "간기능 위험 (경보)", level: 3 };
    };
    isLowerBetter1 = true;
    isLowerBetter2 = true;
    if (yLabel) yLabel.innerText = "지표: AST / ALT 수치";
  } else if (metric === "cholesterol") {
    label1 = "총 콜레스테롤";
    label2 = "중성지방";
    unit1 = "mg/dL";
    unit2 = "mg/dL";
    getVal1 = (r) => r.totalCholesterol ?? 180;
    getVal2 = (r) => r.triglycerides ?? 130;
    format1 = (v) => `${v} mg/dL`;
    format2 = (v) => `${v} mg/dL`;
    status1 = (v) => {
      if (v < 200) return { label: "정상", level: 1 };
      if (v < 240) return { label: "경계선 (주의)", level: 2 };
      return { label: "고콜레스테롤 (위험)", level: 3 };
    };
    status2 = (v) => {
      if (v < 150) return { label: "적정", level: 1 };
      if (v < 200) return { label: "경계 (주의)", level: 2 };
      return { label: "높음 (경보)", level: 3 };
    };
    isLowerBetter1 = true;
    isLowerBetter2 = true;
    if (yLabel) yLabel.innerText = "지표: 총 콜레스테롤 / 중성지방";
  } else if (metric === "bmi") {
    label1 = "BMI지수";
    label2 = "체중";
    unit1 = "kg/m²";
    unit2 = "kg";
    getVal1 = (r) => r.bmi ?? 22;
    getVal2 = (r) => r.weight ?? 65;
    format1 = (v) => `${v.toFixed(1)} kg/m²`;
    format2 = (v) => `${v.toFixed(1)} kg`;
    status1 = (v) => {
      if (v < 18.5) return { label: "저체중 (우려)", level: 2 };
      if (v < 23.0) return { label: "정상 (보통)", level: 1 };
      if (v < 25.0) return { label: "과체중 (주의)", level: 2 };
      return { label: "비만 (체중관리 요망)", level: 3 };
    };
    status2 = (v) => ({ label: "체중 추이", level: 1 });
    isLowerBetter1 = true;
    isLowerBetter2 = true;
    if (yLabel) yLabel.innerText = "지표: BMI 체질량지수 / 몸무게";
  }

  // 범례 노출 업데이트
  if (legend) {
    legend.innerHTML = `
      <div class="flex items-center gap-1.5 text-xs font-bold text-slate-700">
        <span class="w-3 h-3 rounded-full bg-[#f37321] inline-block"></span>
        <span>${label1} (주 지표)</span>
      </div>
      <div class="flex items-center gap-1.5 text-xs font-bold text-slate-500">
        <span class="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block"></span>
        <span>${label2} (부 지표)</span>
      </div>
    `;
  }

  // 델타 표시용 헬퍼 함수
  function renderDeltaPill(diff: number, isLowerBetter: boolean, unit: string) {
    if (diff > 0) {
      if (isLowerBetter) {
        // 수치가 증가했는데 낮아야 좋은 지표인 경우 (나빠짐 -> Red)
        return `
          <span class="inline-flex items-center gap-0.5 text-[10px] font-extrabold text-red-600 bg-red-50 border border-red-200/50 px-1.5 py-0.5 rounded-md">
            ▲ +${diff.toFixed(1)}${unit}
          </span>
        `;
      } else {
        // 수치가 증가했는데 커야 좋은 지표인 경우 (좋아짐 -> Emerald)
        return `
          <span class="inline-flex items-center gap-0.5 text-[10px] font-extrabold text-emerald-600 bg-emerald-50 border border-emerald-200/50 px-1.5 py-0.5 rounded-md">
            ▲ +${diff.toFixed(1)}${unit}
          </span>
        `;
      }
    } else if (diff < 0) {
      const absVal = Math.abs(diff);
      if (isLowerBetter) {
        // 수치가 감소했는데 낮아야 좋은 지표인 경우 (개선됨 -> Emerald)
        return `
          <span class="inline-flex items-center gap-0.5 text-[10px] font-extrabold text-emerald-600 bg-emerald-50 border border-emerald-150 px-1.5 py-0.5 rounded-md">
            ▼ -${absVal.toFixed(1)}${unit}
          </span>
        `;
      } else {
        // 수치가 감소했는데 커야 좋은 지표인 경우 (나빠짐 -> Red)
        return `
          <span class="inline-flex items-center gap-0.5 text-[10px] font-extrabold text-red-600 bg-red-50 border border-red-150 px-1.5 py-0.5 rounded-md">
            ▼ -${absVal.toFixed(1)}${unit}
          </span>
        `;
      }
    } else {
      return `
        <span class="inline-flex items-center text-[10px] font-bold text-slate-400 bg-slate-50 border border-slate-150 px-1.5 py-0.5 rounded-md">
          ● 변동없음
        </span>
      `;
    }
  }

  // 타임라인 인프라 빌딩
  let cardsHtml = "";

  records.forEach((r, i) => {
    const val1 = getVal1(r);
    const val2 = getVal2(r);

    const s1 = status1(val1);
    const s2 = status2(val2);

    const prevRecord = records[i - 1];
    let deltaHtml1 = "";
    let deltaHtml2 = "";

    if (prevRecord) {
      const prevVal1 = getVal1(prevRecord);
      const prevVal2 = getVal2(prevRecord);
      deltaHtml1 = renderDeltaPill(val1 - prevVal1, isLowerBetter1, "");
      deltaHtml2 = renderDeltaPill(val2 - prevVal2, isLowerBetter2, "");
    } else {
      deltaHtml1 = `<span class="inline-flex text-[9px] font-extrabold text-slate-400 tracking-wider bg-slate-150 px-1.5 py-0.5 rounded border border-slate-200">기준년도 (BASE)</span>`;
      deltaHtml2 = `<span class="inline-flex text-[9px] font-extrabold text-slate-400 tracking-wider bg-slate-150 px-1.5 py-0.5 rounded border border-slate-200">기준</span>`;
    }

    // 카드 테마 하이라이트 결정
    const isLatest = i === records.length - 1;
    let cardBorderCls = "border-slate-200";
    let cardBgCls = "bg-white";
    let shadowCls = "shadow-xs";
    let latestBadge = "";

    if (isLatest) {
      cardBorderCls = "emerald-glow border-[#f37321] ring-2 ring-[#f37321]/15";
      cardBgCls = "bg-[#fffdfa]";
      shadowCls = "shadow-lg shadow-[#f37321]/5";
      latestBadge = `
        <div class="absolute -top-3 left-4 bg-gradient-to-r from-[#f37321] to-amber-500 text-white text-[9px] font-black px-2.5 py-1 rounded-full shadow-md tracking-wider flex items-center gap-1 border border-[#ffd3b5]">
          <span class="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
          LATEST CHRONICLE
        </div>
      `;
    }

    // 게이지 색상 매핑
    let level1DotColor = "bg-slate-100";
    let level2DotColor = "bg-slate-100";
    let level3DotColor = "bg-slate-100";

    if (s1.level === 1) level1DotColor = "bg-emerald-500 shadow-xs shadow-emerald-250";
    else if (s1.level === 2) level2DotColor = "bg-amber-500 shadow-xs shadow-amber-250";
    else if (s1.level === 3) level3DotColor = "bg-red-500 shadow-xs shadow-red-250";

    cardsHtml += `
      <div class="relative flex flex-col justify-between w-full ${cardBgCls} border ${cardBorderCls} rounded-2xl p-4 sm:p-5 ${shadowCls} transition-all duration-300 hover:shadow-md min-h-[350px]">
        ${latestBadge}
        
        <!-- 연도 마커 및 상단 바 -->
        <div class="flex items-center justify-between mb-4 mt-1">
          <span class="bg-slate-900 text-[#efeee8] font-black text-[11px] px-2.5 py-1 rounded-xl font-mono tracking-wider flex items-center gap-1 shadow-xs">
            ${r.year}년 검진
          </span>
          <div class="flex items-center gap-1.5">
            ${isLatest ? `<span class="w-2 h-2 rounded-full bg-[#f37321] animate-pulse"></span>` : ""}
          </div>
        </div>

        <!-- 주 메트릭 핵심 수치 -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between text-[10px] font-bold text-slate-400">
            <span>${label1} (핵심)</span>
            ${deltaHtml1}
          </div>
          <div class="flex items-baseline justify-between">
            <span class="text-3xl font-black text-slate-900 font-mono tracking-tight shrink-0">${format1(val1).split(' ')[0]}</span>
            <span class="text-xs text-slate-400 font-bold ml-1">${format1(val1).substring(format1(val1).indexOf(' ') + 1)}</span>
          </div>
          
          <!-- 건강 가속 수준 3스텝 인포그래픽 게이지 -->
          <div class="grid grid-cols-3 gap-1.5 pt-1">
            <div class="h-2 rounded-full ${level1DotColor} transition-colors duration-500"></div>
            <div class="h-2 rounded-full ${level2DotColor} transition-colors duration-500"></div>
            <div class="h-2 rounded-full ${level3DotColor} transition-colors duration-500"></div>
          </div>
          <div class="flex justify-between text-[9px] font-bold text-slate-400 px-0.5">
            <span class="${s1.level === 1 ? 'text-emerald-600 font-extrabold' : ''}">정상</span>
            <span class="${s1.level === 2 ? 'text-amber-500 font-extrabold' : ''}">주의</span>
            <span class="${s1.level === 3 ? 'text-red-500 font-extrabold' : ''}">경고</span>
          </div>
        </div>

        <!-- 얇은 격실 구분선 -->
        <div class="h-px bg-slate-100 my-4"></div>

        <!-- 부 메트릭 데이터 영역 -->
        <div class="space-y-2">
          <div class="flex items-center justify-between text-[10px] font-bold text-slate-400">
            <span>${label2}</span>
            ${deltaHtml2}
          </div>
          
          <div class="flex items-center justify-between">
            <span class="text-sm font-extrabold text-slate-700 font-mono">${format2(val2)}</span>
            <span class="text-[9px] font-bold ${s2.level === 1 ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : s2.level === 2 ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-red-50 text-red-600 border border-red-100'} px-2 py-0.5 rounded-md">
              ${s2.label}
            </span>
          </div>
        </div>
      </div>
    `;
  });

  // 그리드 배치로 주사 설계
  chartContainer.className = "grid grid-cols-5 gap-1.5 w-full";
  chartContainer.innerHTML = cardsHtml;
  chartContainer.style.transform = "";
}

// ========================================================
// 9. [생활 수칙 실천방 탭] 렌더링
// ========================================================
function renderActionTab() {
  // 서브 탭 버튼 클릭 리스너 바인딩
  $$(".sub-tab-btn").forEach((btn) => {
    if ((btn as any)._hasSubTabListener) return;
    (btn as any)._hasSubTabListener = true;

    btn.addEventListener("click", () => {
      const subTab = btn.getAttribute("data-sub-tab");
      if (!subTab) return;

      // 1. Sliding highlight pill translation (Task 7)
      const highlight = $("sub-tab-highlight");
      if (highlight) {
        if (subTab === "action-lifestyle") {
          highlight.style.left = "4px";
        } else if (subTab === "action-chat") {
          highlight.style.left = "calc((100% - 8px) / 3 + 4px)";
        } else if (subTab === "action-prescription") {
          highlight.style.left = "calc(2 * (100% - 8px) / 3 + 4px)";
        }
      }

      // 2. 서브 탭 버튼 스타일 업데이트
      $$(".sub-tab-btn").forEach((b) => {
        if (b.getAttribute("data-sub-tab") === subTab) {
          b.classList.remove("text-slate-500", "hover:text-slate-700");
          b.classList.add("text-white");
        } else {
          b.classList.add("text-slate-500", "hover:text-slate-700");
          b.classList.remove("text-white", "bg-white", "shadow-3xs"); // bg-white/shadow-3xs 제거 (Pill로 이동)
        }
      });

      // 서브 탭 콘텐츠 디스플레이
      $$(".sub-tab-content").forEach((c) => {
        c.classList.add("hidden");
      });
      $(`sub-section-${subTab}`)?.classList.remove("hidden");

      // 서브 탭별 렌더링 핸들러 호출
      if (subTab === "action-chat") {
        renderChatTab();

        // 💬 챗봇 탭 선택 시 상단에 포커싱 및 앵커링 스크롤 (Task 8)
        setTimeout(() => {
          const chatHeader = $("section-chat-standalone");
          if (chatHeader) {
            chatHeader.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }, 80);
      } else if (subTab === "action-prescription") {
        step4Dashboard.renderPrescriptionSection(dashboardCtx);
      }
    });
  });

  // 메인 탭 전환 시 항상 첫 번째 서브 탭('action-lifestyle')이 활성화되도록 자동 클릭 트리거
  const activeBtn = document.querySelector(".sub-tab-btn[data-sub-tab='action-lifestyle']") as HTMLButtonElement | null;
  if (activeBtn && !activeBtn.classList.contains("text-white")) {
    activeBtn.click();
  }

  if (!analysisResult) return;

  // 특정 지표 숫자 및 단위를 하이라이트하는 헬퍼 함수
  const highlightMetrics = (text: string): string => {
    if (!text) return "";
    const metricRegex = /(\d+(?:,\d+)?(?:\.\d+)?(?:\/\d+)?\s*(?:mg\/dL|mmHg|U\/L|kg\/㎡|kg\/m2|mg|kg|cm|%|회|분|시간|g|세|점))/g;
    return text.replace(metricRegex, '<strong class="px-1 py-0.5 bg-slate-100 text-slate-900 font-extrabold rounded text-[10px] leading-none font-mono">$1</strong>');
  };

  const dietContainer = $("checklist-diet-container");
  const exerciseContainer = $("checklist-exercise-container");
  const lifestyleContainer = $("checklist-lifestyle-container");

  const dietPlan = analysisResult.managementPlan.diet;
  const exercisePlan = analysisResult.managementPlan.exercise;
  const lifestylePlan = analysisResult.managementPlan.lifestyle;

  if (dietContainer && dietPlan) {
    dietContainer.innerHTML = dietPlan.map((plan) => {
      const text = typeof plan === "object" && plan !== null ? (plan as any).text : plan;
      const evidence = typeof plan === "object" && plan !== null ? (plan as any).evidence : "";
      const reference = typeof plan === "object" && plan !== null ? (plan as any).reference : "";
      return `
        <div class="flex flex-col gap-1.5 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50/40 px-2 rounded-xl transition-colors">
          <div class="flex items-start gap-2.5">
            <div class="w-1.5 h-1.5 rounded-full bg-[#f37321] mt-1.5 shrink-0"></div>
            <span class="text-xs sm:text-sm text-slate-800 leading-relaxed font-bold break-keep">${highlightMetrics(text)}</span>
          </div>
          ${evidence ? `
            <div class="flex items-start gap-1.5 text-[11px] text-slate-500 pl-4 leading-relaxed mt-0.5">
              <span class="inline-block shrink-0 px-1 py-0.5 text-[9px] font-black text-slate-600 bg-slate-150 rounded leading-none">사유</span>
              <span class="break-keep font-medium text-slate-600">${highlightMetrics(evidence)}</span>
            </div>
          ` : ""}
          ${reference ? `
            <div class="flex items-start gap-1.5 text-[10px] pl-4 leading-relaxed mt-0.5">
              <span class="inline-block shrink-0 px-1 py-0.5 text-[8.5px] font-black text-[#e06612] bg-[#f37321]/10 rounded leading-none">문헌</span>
              <span class="break-keep font-bold text-[#e06612]">${reference}</span>
            </div>
          ` : ""}
        </div>
      `;
    }).join("");
  }

  if (exerciseContainer && exercisePlan) {
    exerciseContainer.innerHTML = exercisePlan.map((plan) => {
      const text = typeof plan === "object" && plan !== null ? (plan as any).text : plan;
      const evidence = typeof plan === "object" && plan !== null ? (plan as any).evidence : "";
      const reference = typeof plan === "object" && plan !== null ? (plan as any).reference : "";
      return `
        <div class="flex flex-col gap-1.5 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50/40 px-2 rounded-xl transition-colors">
          <div class="flex items-start gap-2.5">
            <div class="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0"></div>
            <span class="text-xs sm:text-sm text-slate-800 leading-relaxed font-semibold break-keep">${highlightMetrics(text)}</span>
          </div>
          ${evidence ? `
            <div class="flex items-start gap-1.5 text-[11px] text-slate-500 pl-4 leading-relaxed mt-0.5">
              <span class="inline-block shrink-0 px-1 py-0.5 text-[9px] font-black text-slate-600 bg-slate-150 rounded leading-none">사유</span>
              <span class="break-keep font-medium text-slate-600">${highlightMetrics(evidence)}</span>
            </div>
          ` : ""}
          ${reference ? `
            <div class="flex items-start gap-1.5 text-[10px] pl-4 leading-relaxed mt-0.5">
              <span class="inline-block shrink-0 px-1 py-0.5 text-[8.5px] font-black text-indigo-600 bg-indigo-50 rounded leading-none">문헌</span>
              <span class="break-keep font-bold text-indigo-600">${reference}</span>
            </div>
          ` : ""}
        </div>
      `;
    }).join("");
  }

  if (lifestyleContainer && lifestylePlan) {
    lifestyleContainer.innerHTML = lifestylePlan.map((plan) => {
      const text = typeof plan === "object" && plan !== null ? (plan as any).text : plan;
      const evidence = typeof plan === "object" && plan !== null ? (plan as any).evidence : "";
      const reference = typeof plan === "object" && plan !== null ? (plan as any).reference : "";
      return `
        <div class="flex flex-col gap-1.5 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50/40 px-2 rounded-xl transition-colors">
          <div class="flex items-start gap-2.5">
            <div class="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0"></div>
            <span class="text-xs sm:text-sm text-slate-800 leading-relaxed font-semibold break-keep">${highlightMetrics(text)}</span>
          </div>
          ${evidence ? `
            <div class="flex items-start gap-1.5 text-[11px] text-slate-500 pl-4 leading-relaxed mt-0.5">
              <span class="inline-block shrink-0 px-1 py-0.5 text-[9px] font-black text-slate-600 bg-slate-150 rounded leading-none">사유</span>
              <span class="break-keep font-medium text-slate-600">${highlightMetrics(evidence)}</span>
            </div>
          ` : ""}
          ${reference ? `
            <div class="flex items-start gap-1.5 text-[10px] pl-4 leading-relaxed mt-0.5">
              <span class="inline-block shrink-0 px-1 py-0.5 text-[8.5px] font-black text-emerald-600 bg-emerald-50 rounded leading-none">문헌</span>
              <span class="break-keep font-bold text-emerald-600">${reference}</span>
            </div>
          ` : ""}
        </div>
      `;
    }).join("");
  }
}

function calculateActionProgress() {
  // 체크리스트 미사용에 따라 무효화 처리
}

// ========================================================
// 10. [AI 예방 주치의 상담 탭] 렌더링 & 질문
// ========================================================
function renderChatTab() {
  // 메시지가 없으면 웰컴 메시지 주입
  if (chatMessages.length === 0) {
    initializeChatRoom();
  } else {
    paintChatMessages();
  }
}

function initializeChatRoom() {
  const years = nhisRecords.map(r => r.year);
  const fastingGl = nhisRecords[0]?.fastingGlucose ?? 95;
  const sysBp = nhisRecords[0]?.systolicBP ?? 120;

  accumulatedChatCostKrw = 0;
  accumulatedChatTokens = 0;
  updateChatCostUI();

  chatMessages = [
    {
      id: "msg-welcome-init",
      role: "assistant",
      content: `반갑습니다, ${userName}님! 한화손보의 AI Wellness Care Center AI 주치의 3.1 상담방에 오신 것을 환영합니다. \n\n연동 완료하신 이력 중 공복혈당 **${fastingGl} mg/dL**, 수축기 혈압 **${sysBp} mmHg** 수치를 포함한 복합 데이터를 확인하고 식습관 교정전략을 마련해 두었습니다. 당뇨 전단계 조율 수칙, 맞춤 운동 강도, 약제 처방 동향 등 궁금한 사항을 편하게 질문해 주십시오.`,
      timestamp: formatTime(new Date())
    }
  ];
  paintChatMessages();
}

function paintChatMessages() {
  const container = $("chat-messages-container");
  if (!container) return;

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

async function handleChatSubmit() {
  const input = $("chat-user-message-input") as HTMLInputElement;
  const userText = input ? input.value.trim() : "";
  if (!userText || isChatLoading) return;

  // 인풋 초기화
  if (input) input.value = "";

  // 사용자 메시지 어펜드
  const userMsg: ChatMessage = {
    id: `msg-user-${Date.now()}`,
    role: "user",
    content: userText,
    timestamp: formatTime(new Date())
  };
  chatMessages.push(userMsg);
  isChatLoading = true;
  paintChatMessages();

  // API 호출 개시
  const payload = {
    messages: chatMessages,
    analysisContext: analysisResult
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
      accumulatedChatCostKrw += data.costInfo.costKrw;
      accumulatedChatTokens += data.costInfo.totalTokens;
      updateChatCostUI();
    }

    // AI 답변 어펜드
    const systemMsg: ChatMessage = {
      id: `msg-system-${Date.now()}`,
      role: "assistant",
      content: data.text,
      timestamp: formatTime(new Date()),
      costInfo: data.costInfo
    };
    
    chatMessages.push(systemMsg);

  } catch (err: any) {
    console.error(err);
    chatMessages.push({
      id: `msg-err-${Date.now()}`,
      role: "assistant",
      content: err.message || "죄송합니다, 잠시 스마트 주치의 대화선이 혼잡합니다. 잠시 후에 다시 글을 남겨 주십시오.",
      timestamp: formatTime(new Date())
    });
  } finally {
    isChatLoading = false;
    paintChatMessages();
  }
}

// 실시간 챗봇 세션 누적 단가 갱신 유틸
function updateChatCostUI() {
  const krw = $("chat-accumulated-cost-krw");
  const tokens = $("chat-accumulated-tokens");
  if (krw) krw.innerText = accumulatedChatCostKrw.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  if (tokens) tokens.innerText = accumulatedChatTokens.toLocaleString();
}

// 헬퍼: 현재 시분 취득 포맷터
function formatTime(date: Date): string {
  return date.toLocaleTimeString("ko-KR", { 
    timeZone: "Asia/Seoul",
    hour: "2-digit", 
    minute: "2-digit" 
  });
}

// 2단계 스텝 관리 가이드 및 하단 분석 활성화 업데이트 함수
function updateAuthProgress() {
  const btn1 = $("btn-open-sync-modal") as HTMLButtonElement | null;
  const btn2 = $("btn-submit-health-record") as HTMLButtonElement | null;
  const btnFinal = $("btn-final-analysis") as HTMLButtonElement | null;

  if (btn1) {
    if (isStep1Completed) {
      btn1.innerHTML = `
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        공단 기록 연동 완료
      `;
      btn1.disabled = true;
      btn1.className = "w-full bg-emerald-500 text-white rounded-xl py-4 px-4 font-bold text-sm tracking-wide shadow-md flex items-center justify-center gap-2 transition-all cursor-not-allowed opacity-80";
    } else {
      btn1.innerHTML = `
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
        간편인증
      `;
      btn1.disabled = false;
      btn1.className = "w-full bg-[#f37321] hover:bg-[#dd6216] text-white rounded-xl py-4 px-4 font-bold text-sm tracking-wide shadow-md hover:shadow-lg flex items-center justify-center gap-2 transition-all";
    }
  }

  if (btn2) {
    if (isStep2Completed) {
      btn2.innerHTML = `
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.1">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        건강검진 기록 제출 완료
      `;
      btn2.disabled = true;
      btn2.className = "w-full bg-emerald-500 text-white rounded-xl py-4 px-4 font-bold text-sm tracking-wide shadow-md flex items-center justify-center gap-2 transition-all cursor-not-allowed opacity-80";
    } else {
      if (uploadedFiles.length === 0) {
        btn2.innerHTML = `
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.1">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
          건강검진 기록 제출
        `;
        btn2.disabled = true;
        btn2.className = "w-full bg-slate-200 text-slate-400 rounded-xl py-4 px-4 font-bold text-sm tracking-wide flex items-center justify-center gap-2 transition-all opacity-50 cursor-not-allowed";
      } else {
        btn2.innerHTML = `
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.1">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
          건강검진 기록 제출
        `;
        btn2.disabled = false;
        btn2.className = "w-full bg-[#10b981] hover:bg-[#059669] text-white rounded-xl py-4 px-4 font-bold text-sm tracking-wide shadow-md hover:shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer";
      }
    }
  }

  if (btnFinal) {
    if (isStep1Completed || isStep2Completed) {
      btnFinal.disabled = false;
      btnFinal.className = "w-full bg-[#f37321] hover:bg-[#dd6216] text-white rounded-xl py-4 px-6 font-extrabold text-base tracking-wide flex items-center justify-center gap-2.5 transition-all shadow-md hover:shadow-lg active:scale-[0.99] cursor-pointer";
    } else {
      btnFinal.disabled = true;
      btnFinal.className = "w-full bg-slate-200 text-slate-400 rounded-xl py-4 px-6 font-extrabold text-base tracking-wide flex items-center justify-center gap-2.5 transition-all opacity-50 cursor-not-allowed";
    }
  }

  // CODEF 요약 패널 실시간 제어 (전면 노출 방식 변경)
  if (isStep1Completed) {
    step4Dashboard.renderCodefSummary(dashboardCtx);
    $("codef-summary-section")?.classList.remove("hidden");
    $("final-analysis-cta-container")?.classList.remove("hidden");
  } else {
    $("codef-summary-section")?.classList.add("hidden");
    $("final-analysis-cta-container")?.classList.add("hidden");
  }

  // 업로드 파일 파싱 결과 요약 패널 제어
  if (isStep2Completed) {
    step4Dashboard.renderParsedFileSummary(dashboardCtx);
    $("parsed-file-link-container")?.classList.remove("hidden");
  } else {
    $("parsed-file-link-container")?.classList.add("hidden");
    $("parsed-file-summary-modal-wrapper")?.classList.add("hidden");
  }
}

// 업로드 문서들의 파싱 결과를 팝업창용으로 포맷팅 및 주입하는 함수
function renderParsedFileSummary() {
  step4Dashboard.renderParsedFileSummary(dashboardCtx);
}

function renderUploadedFilesList() {
  const container = $("uploaded-files-container");
  const listEl = $("uploaded-files-list");
  const countEl = $("uploaded-files-count");
  const btn2 = $("btn-submit-health-record") as HTMLButtonElement | null;

  if (!container || !listEl) return;

  if (uploadedFiles.length === 0) {
    container.classList.add("hidden");
    uploadedFile = null;
    customPDFText = "";

    // 드래그존 텍스트 및 스타일 복원
    const dragZone = $("pdf-drag-zone");
    const filenameText = $("pdf-filename-text");
    if (dragZone) {
      dragZone.className = "border-2 border-dashed border-slate-200 hover:border-[#f37321] bg-slate-50 hover:bg-[#fff5ee] rounded-xl p-4 text-center cursor-pointer transition-all space-y-2";
    }
    if (filenameText) {
      filenameText.innerText = "PDF 업로드 혹은 사진촬영";
    }
    
    updateAuthProgress();
    return;
  }

  // 리스트 노출
  container.classList.remove("hidden");
  if (countEl) countEl.innerText = `${uploadedFiles.length}개 대기중`;

  // 드래그존 업로드 완료 스타일 부여
  const dragZone = $("pdf-drag-zone");
  const filenameText = $("pdf-filename-text");
  if (dragZone) {
    dragZone.className = "border-2 border-dashed border-emerald-500 bg-emerald-50/50 rounded-xl p-4 text-center cursor-pointer transition-all space-y-2";
  }
  if (filenameText) {
    filenameText.innerText = "추가 업로드 혹은 사진촬영";
  }

  // 단수형 속성 연동 (기존 로직 호환)
  uploadedFile = uploadedFiles[0];
  customPDFText = uploadedFiles.map(f => f.customText || `${f.name} 파일 판독 데이터`).join("\n\n");

  listEl.innerHTML = "";
  uploadedFiles.forEach((file, index) => {
    const item = document.createElement("div");
    item.className = "flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl p-2.5 animate-fade-in gap-3";

    const isImage = file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i);
    const iconHtml = isImage
      ? `<div class="w-8 h-8 rounded-lg bg-amber-50 text-[#f37321] flex items-center justify-center shrink-0">
           <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
             <path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
             <path stroke-linecap="round" stroke-linejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
           </svg>
         </div>`
      : `<div class="w-8 h-8 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
           <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
             <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
           </svg>
         </div>`;

    let statusBadge = "";
    if (file.isParsing) {
      statusBadge = `<span class="inline-flex items-center gap-1 text-[8px] font-extrabold text-[#f37321] bg-[#fff5ee] border border-orange-200/50 px-1.5 py-0.5 rounded-full shrink-0">
        <svg class="animate-spin w-2 h-2 text-[#f37321]" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
        가독 분석중
      </span>`;
    } else if (file.parseFailed) {
      statusBadge = `<span class="text-[8px] font-extrabold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full shrink-0">파싱 실패</span>`;
    } else {
      statusBadge = `<span class="text-[8px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full shrink-0">파싱 완료</span>`;
    }

    item.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0 flex-1">
        ${iconHtml}
        <div class="min-w-0 flex-1">
          <div class="text-[11px] font-bold text-slate-800 truncate flex items-center gap-1.5">
            ${file.name}
            ${statusBadge}
          </div>
          <div class="text-[9px] text-slate-400 font-mono">${file.size}</div>
        </div>
      </div>
      <button type="button" class="btn-delete-file hover:bg-rose-50 text-slate-400 hover:text-rose-500 p-1.5 rounded-lg transition-all shrink-0" data-index="${index}">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    `;

    item.querySelector(".btn-delete-file")?.addEventListener("click", () => {
      uploadedFiles.splice(index, 1);
      renderUploadedFilesList();
      updateAuthProgress();
    });

    listEl.appendChild(item);
  });

  updateAuthProgress();
}

// 파일 바이트 사이즈 가독성 좋게 포맷 변경하는 헬퍼 함수
function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

function resetAuthStates() {
  isStep1Completed = false;
  isStep2Completed = false;
  uploadedFile = null;
  uploadedFiles = [];
  customPDFText = "";
  
  // Dynamic step cards visibility reset
  $("step-1-2-connector")?.classList.add("hidden");
  $("step-2-card")?.classList.add("hidden");
  $("step-2-3-connector")?.classList.add("hidden");
  $("step-3-card")?.classList.add("hidden");
  $("step-3-4-connector")?.classList.add("hidden");
  $("step-4-card")?.classList.add("hidden");

  // 가족력 변수 및 버튼 리셋
  fatherFactors = ["없음"];
  motherFactors = ["없음"];
  $$(".family-factor-btn").forEach(btn => {
    const fac = btn.getAttribute("data-factor");
    if (fac === "없음") {
      btn.classList.remove("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
      btn.classList.add("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
    } else {
      btn.classList.remove("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
      btn.classList.add("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
    }
  });

  // Reset select preset
  const select = $("select-pdf-preset") as HTMLSelectElement | null;
  if (select) select.value = "";
  
  // Reset dragzone styling and text
  const dragZone = $("pdf-drag-zone");
  const filenameText = $("pdf-filename-text");
  const sizeText = $("pdf-size-text");
  if (filenameText) filenameText.innerText = "PDF 업로드 혹은 사진촬영";
  if (sizeText) sizeText.innerText = "가정용 혈액보고 시트 가능";
  if (dragZone) {
    dragZone.className = "border-2 border-dashed border-slate-200 hover:border-[#f37321] bg-slate-50 hover:bg-[#fff5ee] rounded-xl p-4 text-center cursor-pointer transition-all space-y-2";
  }

  renderUploadedFilesList();
  updateAuthProgress();
}

// ========================================================
// 4. 간편인증 제공서 상세보기 모달 제어 및 동적 스키마 렌더러
// ========================================================
const providerDetails: Record<string, Array<{ title: string; content: string }>> = {
  kakao: [
    { title: "인증 기관 및 신뢰도", content: "카카오페이 / KISA 인증 최우수 등급 획득 전자서명 수임기관" },
    { title: "보안 기술 사양", content: "모바일 단말기 기반 고유 생체 키 매핑기술 적용 + 종단간 거래정보 위변조 방지 안전 키 암호화" },
    { title: "주요 공공 채널 안내", content: "국민건강보험공단, 홈택스 연말정산, 정부24 민원발급 등 120여 개 메이저 기관 상시 수임 연동 서비스 지원" },
    { title: "유효 기간 정보", content: "최초 발급 시 3년 동안 안정적으로 소급 사용이 가능하며 간편 갱신이 지원됩니다." },
    { title: "서명 프로세스", content: "기재한 번호로 카카오톡 푸시 도달 -> 실시간 생체인식(지문/안면) 또는 비밀번호 6자리 입력을 통한 최종 연동 서명 승인" }
  ],
  toss: [
    { title: "인증 기관 및 신뢰도", content: "비바리퍼블리카 (토스) / 국가 특수 지정 서명 인증사업자" },
    { title: "보안 기술 사양", content: "분산 암호 원장 구조(BlockChain) 탑재 및 실시간 디바이스 기기고유값 매칭 솔루션 채택" },
    { title: "주요 공공 채널 안내", content: "국민건강보험 공단 자격조회, 전금융 종합 마이데이터 보안 채널 및 가맹 금융거래 서명 자동 정합" },
    { title: "유효 기간 정보", content: "최초 발급일로부터 단절없이 3년 동안 유지 관리됩니다." },
    { title: "서명 프로세스", content: "토스 모바일 앱 전면 팝업 즉시 수신 -> FaceID/TouchID orator 전용 앱 마스터 번호 입력을 통한 전자서명 완료" }
  ],
  pass: [
    { title: "인증 기관 및 신뢰도", content: "대한민국 이동통신 3사(SKT, KT, LGU+) 및 아톤 공용 서명 규격" },
    { title: "보안 기술 사양", content: "스마트폰 USIM 보안 하드웨어 영역 내 암호키 보관 방식(SE) 및 루팅/가료 단말 실시간 하드 차단 필터 수립" },
    { title: "주요 공공 채널 안내", content: "정부공인 모바일 신분증/운전면허증 제휴, 국민건강보험증 모바일 조회 및 전행 오프인 연동망" },
    { title: "유효 기간 정보", content: "발급일 기준 전인적 3개년 동안 정상 호환이 수립됩니다." },
    { title: "서명 프로세스", content: "PASS 스마트 백그라운드 푸시 자동 실행 -> 앱 내 생체인증 확인 또는 전용 등록 핀 수락" }
  ],
  naver: [
    { title: "인증 기관 및 신뢰도", content: "네이버(NAVER) 주식회사 / 과학기술정보통신부 공식 지정 본인인증 위임사" },
    { title: "보안 기술 사양", content: "네이버ID 도용 방지 인공지능 로그인 보호, FIDO 표준 인증 규격 탑재 및 하드웨어 보안 키스토어 결합" },
    { title: "주요 공공 채널 안내", content: "건강보험공단 건강통보서 전자송달 직접 수령, 국가기술자격시험 자격증 원스톱 정합, 네이버페이상 연계보험 연계망" },
    { title: "유효 기간 정보", content: "발급일로부터 유휴 없이 3년 보전 유효" },
    { title: "서명 프로세스", content: "네이버 모바일 앱 백그라운드 푸시 확인 -> 네이버 앱 자체 보안 잠금(지문/패턴) 기화 승인" }
  ]
};

let detailSelectedProvider = "kakao";

function renderProviderDetailContent(providerId: string) {
  const contentEl = $("provider-detail-content");
  if (!contentEl) return;

  const items = providerDetails[providerId] || [];
  contentEl.innerHTML = items.map(item => `
    <div class="bg-slate-50 border border-slate-100/90 rounded-xl p-3.5 space-y-1">
      <div class="text-[10px] font-extrabold text-[#f37321] uppercase tracking-wider">${item.title}</div>
      <p class="text-xs text-slate-700 leading-normal font-semibold break-keep">${item.content}</p>
    </div>
  `).join("");
}

function setupProviderDetailsHandlers() {
  const btnOpenDetail = $("btn-open-provider-detail");
  const modalDetail = $("provider-detail-modal");
  const btnCloseDetail = $("btn-close-provider-detail");
  const overlayDetail = $("provider-detail-overlay");
  const btnConfirmDetail = $("btn-confirm-provider-detail");

  const openDetail = () => {
    detailSelectedProvider = authProvider || "kakao";
    updateDetailTabs();
    renderProviderDetailContent(detailSelectedProvider);
    modalDetail?.classList.remove("hidden");
  };

  const closeDetail = () => {
    modalDetail?.classList.add("hidden");
  };

  btnOpenDetail?.addEventListener("click", openDetail);
  btnCloseDetail?.addEventListener("click", closeDetail);
  overlayDetail?.addEventListener("click", closeDetail);

  $$(".detail-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pId = btn.getAttribute("data-provider");
      if (pId) {
        detailSelectedProvider = pId;
        updateDetailTabs();
        renderProviderDetailContent(detailSelectedProvider);
      }
    });
  });

  function updateDetailTabs() {
    $$(".detail-tab-btn").forEach((btn) => {
      const pId = btn.getAttribute("data-provider");
      if (pId === detailSelectedProvider) {
        btn.className = "detail-tab-btn py-2 text-xs font-bold rounded-lg text-center transition-all bg-white text-[#f37321] shadow-xs cursor-pointer";
      } else {
        btn.className = "detail-tab-btn py-2 text-xs font-bold rounded-lg text-center transition-all text-slate-500 hover:text-[#f37321] hover:font-extrabold cursor-pointer";
      }
    });
  }

  btnConfirmDetail?.addEventListener("click", () => {
    authProvider = detailSelectedProvider;
    
    $$(".auth-provider-btn").forEach((b) => {
      const pId = b.getAttribute("data-provider");
      if (pId === authProvider) {
        b.classList.remove("opacity-60", "border-slate-200");
        b.classList.add("border-[#f37321]", "bg-[#fff5ee]", "text-[#f37321]");
      } else {
        b.classList.add("opacity-60", "border-slate-200");
        b.classList.remove("border-[#f37321]", "bg-[#fff5ee]", "text-[#f37321]");
      }
    });

    closeDetail();
  });
}

// ========================================================
// 5. 수집 및 이용 동의 상세 페이지 모달 제어 및 자동 동의·발송 트리거
// ========================================================
function setupConsentDetailsHandlers() {
  const modal = $("consent-detail-modal");
  const btnClose = $("btn-close-consent-detail");
  const overlay = $("consent-detail-overlay");
  const btnAgreeSend = $("btn-consent-detail-agree-send");
  const scrollArea = $("consent-detail-scroll-area");

  // 상세 보기 버튼들 (약관 우측 > 버튼들)
  $$(".btn-view-consent-detail").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sectionId = btn.getAttribute("data-section");
      modal?.classList.remove("hidden");
      
      // 해당 규약 문서 섹션으로 스크롤 이동 (앵커)
      if (sectionId && scrollArea) {
        updateActiveConsentTab(sectionId);
        setTimeout(() => {
          const targetElement = $(`consent-detail-sec-${sectionId}`);
          if (targetElement) {
            targetElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        }, 120);
      }
    });
  });

  const closeConsentModal = () => {
    modal?.classList.add("hidden");
  };

  btnClose?.addEventListener("click", closeConsentModal);
  overlay?.addEventListener("click", closeConsentModal);

  // 앵커 탭 버튼 클릭 이벤팅
  $$(".consent-anchor-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      if (targetId && scrollArea) {
        updateActiveConsentTab(targetId);
        const targetElement = $(`consent-detail-sec-${targetId}`);
        if (targetElement) {
          targetElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }
    });
  });

  function updateActiveConsentTab(activeId: string) {
    $$(".consent-anchor-btn").forEach((btn) => {
      const tid = btn.getAttribute("data-target");
      if (tid === activeId) {
        btn.className = "consent-anchor-btn flex-1 py-2 text-[10px] font-bold text-[#f37321] transition-all cursor-pointer";
      } else {
        btn.className = "consent-anchor-btn flex-1 py-2 text-[10px] font-bold text-slate-500 hover:text-[#f37321] transition-all cursor-pointer";
      }
    });
  }

  // 동의하고 발송 실행 트리거 버튼 클릭
  btnAgreeSend?.addEventListener("click", () => {
    // 1. 부모 뷰의 필수 동의서 체크박스 3개 모두 체크 처리
    const allChecked = $("check-term-all") as HTMLInputElement;
    if (allChecked) allChecked.checked = true;

    $$(".required-check").forEach((cb) => {
      (cb as HTMLInputElement).checked = true;
    });

    closeConsentModal();

    // 2. 부모 뷰의 `btn-modal-request-auth` ('간편인증 발송') 자동 호출!
    const mainSendBtn = $("btn-modal-request-auth") as HTMLButtonElement | null;
    if (mainSendBtn) {
      mainSendBtn.click();
    }
  });

  // 스크롤 감지를 통한 영리한 탭 동기 활성화
  scrollArea?.addEventListener("scroll", () => {
    const scrollPos = scrollArea.scrollTop;
    const scrollHeight = scrollArea.scrollHeight - scrollArea.clientHeight;

    if (scrollPos > scrollHeight * 0.7) {
      updateActiveConsentTab("3");
    } else if (scrollPos > scrollHeight * 0.3) {
      updateActiveConsentTab("2");
    } else {
      updateActiveConsentTab("1");
    }
  });
}

// ========================================================
// 6. CODEF 검진 동기화 데이터 전 실시간 파싱 및 가이드 요약기
// ========================================================
function renderCodefSummary() {
  step4Dashboard.renderCodefSummary(dashboardCtx);
}

// ========================================================
// 7. 약관 전체동의 및 하위 개별 동의 상호 연동 연쇄 처리 (NEW)
// ========================================================
function setupConsentCheckboxes() {
  const checkAll = $("check-term-all") as HTMLInputElement | null;
  const subChecks = $$(".required-check");

  if (!checkAll || subChecks.length === 0) return;

  // 전체 동의 체크박스 클릭 시 하위 체크박스들을 일괄 변경
  checkAll.addEventListener("change", (e) => {
    const isChecked = (e.target as HTMLInputElement).checked;
    subChecks.forEach((cb) => {
      (cb as HTMLInputElement).checked = isChecked;
    });
  });

  // 개별 체크박스 상태 변경 시 전체 동의 체크박스 상태를 재계산
  subChecks.forEach((cb) => {
    cb.addEventListener("change", () => {
      const allChecked = Array.from(subChecks).every(
        (c) => (c as HTMLInputElement).checked
      );
      checkAll.checked = allChecked;
    });
  });
}

// ========================================================
// 8. 보험료 산출 근거 팝업 모달 제어 및 연령 계산 (NEW)
// ========================================================
function calculateAge(birthStr: string): number {
  if (!birthStr) return 35; // 기본값
  const cleanBirth = birthStr.replace(/[^0-9]/g, "");
  let birthYear = 1990;
  if (cleanBirth.length === 6) {
    const yy = parseInt(cleanBirth.substring(0, 2), 10);
    // 현재 기준 시각이 2026년이므로 26 이하는 20xx년생, 초과는 19xx년생으로 판단
    if (yy <= 26) {
      birthYear = 2000 + yy;
    } else {
      birthYear = 1900 + yy;
    }
  } else if (cleanBirth.length === 8) {
    birthYear = parseInt(cleanBirth.substring(0, 4), 10);
  }
  return 2026 - birthYear;
}

function setupPremiumBasisModal() {
  const modalBasis = $("premium-basis-modal");
  const btnCloseBasis = $("btn-close-premium-basis");
  const btnConfirmBasis = $("btn-confirm-premium-basis");
  const overlayBasis = $("premium-basis-overlay");

  const closeModal = () => {
    modalBasis?.classList.add("hidden");
  };

  btnCloseBasis?.addEventListener("click", closeModal);
  btnConfirmBasis?.addEventListener("click", closeModal);
  overlayBasis?.addEventListener("click", closeModal);

  // Tab switching inside premium-basis-modal
  const tabButtons = [
    $("tab-btn-basis-coverages"),
    $("tab-btn-basis-formula"),
    $("tab-btn-basis-adequacy")
  ];
  const tabContents = [
    $("basis-content-coverages"),
    $("basis-content-formula"),
    $("basis-content-adequacy")
  ];

  tabButtons.forEach((btn, idx) => {
    btn?.addEventListener("click", () => {
      tabButtons.forEach(b => {
        b?.classList.remove("bg-white", "text-slate-900", "shadow-3xs", "active");
        b?.classList.add("text-slate-500", "hover:text-slate-800");
      });
      btn?.classList.add("bg-white", "text-slate-900", "shadow-3xs", "active");
      btn?.classList.remove("text-slate-500", "hover:text-slate-800");

      tabContents.forEach((content, cidx) => {
        if (cidx === idx) {
          content?.classList.remove("hidden");
        } else {
          content?.classList.add("hidden");
        }
      });
    });
  });
}

// ========================================================
// 11. [디바이스 시뮬레이터 툴바 제어] PC | 태블릿 | 모바일 동적 스위칭 (NEW)
// ========================================================
function setupDeviceSimulator() {
  // 상단 시뮬레이션 제어 바의 버튼들을 가져옵니다.
  const btnPc = $("btn-device-pc");
  const btnTablet = $("btn-device-tablet");
  const btnMobile = $("btn-device-mobile");

  // 전체 화면 및 시뮬레이터 구성 요소를 가져옵니다.
  const container = $("device-simulator-container");
  const body = $("root-body");
  const notch = $("simulator-notch"); // 스마트폰 노치 (카메라 영역)
  const statusbar = $("simulator-statusbar"); // 스마트폰 최상단 상태바
  const homebar = $("simulator-homebar"); // 스마트폰 최하단 홈 바 (iOS 홈 바 스타일)

  // 필수 요소가 없으면 스크립트 실행을 종료합니다.
  if (!btnPc || !btnTablet || !btnMobile || !container || !body) return;

  /**
   * 시뮬레이터 모드를 전환하는 핵심 함수입니다.
   * @param mode 'pc' | 'tablet' | 'mobile'
   */
  function updateDeviceMode(mode: "pc" | "tablet" | "mobile") {
    // 1. 모든 버튼의 스타일을 기본(비활성화) 형태로 초기화합니다.
    const btns = [btnPc, btnTablet, btnMobile];
    btns.forEach(btn => {
      btn.className = "px-3.5 py-1.5 rounded-full font-bold transition-all hover:bg-slate-800 cursor-pointer text-slate-400";
    });
    // 2. 선택된 모드에 따라 알맞은 화면 배치 스타일과 가상 장치 요소(노치, 홈 바 등)를 제어합니다.
    if (mode === "pc") {
      // PC 모드 버튼 활성화 색상 지정
      btnPc.className = "px-3.5 py-1.5 rounded-full font-bold bg-[#f37321] text-white cursor-pointer shadow-sm";
      
      // PC 모드 클래스 스위칭:
      // 부모 창의 이중 스크롤 및 짤림을 막기 위해 높이를 h-screen, overflow-hidden으로 제한합니다.
      body.className = "h-screen text-slate-900 antialiased sm:bg-[#efeee8] sm:h-screen sm:overflow-hidden sm:py-0";
      
      // container가 0px 높이로 축소되지 않고 화면 전체 높이(h-screen)를 채우도록 설정하여
      // 내부 iframe이 세로로 짤리지 않고 온전하게 렌더링되게 만듭니다.
      container.className = "w-full h-screen sm:h-screen sm:w-full sm:bg-[#efeee8] sm:rounded-none sm:shadow-none sm:border-0 sm:relative sm:flex sm:flex-col sm:overflow-hidden sm:[transform:none] z-10 transition-all duration-300";
      
      // PC 모드에서는 스마트폰 노치, 상단바, 하단 홈 바를 모두 숨깁니다.
      notch?.classList.add("sm:hidden");
      statusbar?.classList.add("sm:hidden");
      
      // Tailwind의 sm:flex 클래스가 남아 있으면 sm:hidden과 우선순위 충돌이 날 수 있으므로 
      // sm:flex를 제거하고 sm:hidden을 적용하여 완전히 숨깁니다.
      homebar?.classList.remove("sm:flex");
      homebar?.classList.add("sm:hidden");
    } else if (mode === "tablet") {
      // 태블릿 모드 버튼 활성화 색상 지정
      btnTablet.className = "px-3.5 py-1.5 rounded-full font-bold bg-[#f37321] text-white cursor-pointer shadow-sm";

      // 태블릿 모드 클래스 스위칭: 가로 768px의 기기 규격 안에 화면을 맞춰 렌더링합니다.
      body.className = "h-full text-slate-900 antialiased sm:bg-[#111216] sm:flex sm:items-center sm:justify-center sm:min-h-screen sm:overflow-y-auto sm:py-6";
      container.className = "w-full max-w-full h-auto sm:h-[85vh] sm:max-h-[1024px] sm:min-h-[800px] sm:w-[768px] sm:bg-white sm:rounded-[36px] sm:shadow-[0_25px_60px_-10px_rgba(0,0,0,0.8)] sm:border-[14px] sm:border-slate-800 sm:relative sm:flex sm:flex-col sm:overflow-hidden sm:[transform:translate3d(0,0,0)] z-10 transition-all duration-300";

      // 태블릿 모드에서도 스마트폰 전용 요소(노치, 상단바, 하단 홈 바)는 숨깁니다.
      notch?.classList.add("sm:hidden");
      statusbar?.classList.add("sm:hidden");
      
      // 💡 마찬가지로 sm:flex를 제거하고 sm:hidden을 적용합니다.
      homebar?.classList.remove("sm:flex");
      homebar?.classList.add("sm:hidden");
    } else {
      // 모바일 모드 버튼 활성화 색상 지정
      btnMobile.className = "px-3.5 py-1.5 rounded-full font-bold bg-[#f37321] text-white cursor-pointer shadow-sm";

      // 모바일 모드 클래스 스위칭: 가로 420px 스마트폰 프레임으로 감싸서 모바일 뷰를 구현합니다.
      body.className = "h-full text-slate-900 antialiased sm:bg-[#111216] sm:flex sm:items-center sm:justify-center sm:min-h-screen sm:overflow-y-auto sm:py-6";
      container.className = "w-full max-w-full h-auto sm:h-[90vh] sm:max-h-[880px] sm:min-h-[720px] sm:w-[420px] sm:bg-white sm:rounded-[48px] sm:shadow-[0_25px_60px_-10px_rgba(0,0,0,0.8)] sm:border-[12px] sm:border-slate-800 sm:relative sm:flex sm:flex-col sm:overflow-hidden sm:[transform:translate3d(0,0,0)] z-10 transition-all duration-300";

      // 모바일 모드에서는 진짜 스마트폰처럼 보이도록 노치, 상태바, 하단 홈 바를 모두 다시 화면에 보여줍니다.
      notch?.classList.remove("sm:hidden");
      statusbar?.classList.remove("sm:hidden");
      
      // 💡 모바일 모드일 때는 반대로 sm:hidden을 지우고 sm:flex를 활성화시켜 정상 노출되게 합니다.
      homebar?.classList.remove("sm:hidden");
      homebar?.classList.add("sm:flex");
    }
  }

  btnPc.addEventListener("click", () => updateDeviceMode("pc"));
  btnTablet.addEventListener("click", () => updateDeviceMode("tablet"));
  btnMobile.addEventListener("click", () => updateDeviceMode("mobile"));
}
