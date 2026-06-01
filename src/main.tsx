/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import "./index.css";
import { samplePersonas, samplePDFPresets } from "./data";
import { NHISData, UploadedPDFReport, AIAnalysisResult, ChatMessage } from "./types";

// --- 글로벌 애플리케이션 상태 관리 (Vanilla State) ---
let currentStep: "auth" | "loading" | "dashboard" = "auth";
let userName = "";
let birthDate = "";
let gender: "M" | "F" = "M";
let authProvider = "kakao";

// 가족력 팩터 저장용 글로벌 상태 변수
let fatherFactors: string[] = [];
let motherFactors: string[] = [];

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
  } | null; 
}> = [];
let isStep1Completed = false;
let isStep2Completed = false;

// 결과 분석 데이터 보관
let analysisResult: AIAnalysisResult | null = null;
let isSimulated = true;

// 챗보 대화 상태 보관
let chatMessages: ChatMessage[] = [];
let isChatLoading = false;
let accumulatedChatCostKrw = 0;
let accumulatedChatTokens = 0;

// 모달 및 타이머 제어
let authTimerInterval: any = null;
let authTimerSeconds = 180;

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
window.addEventListener("DOMContentLoaded", () => {
  initApp();
});

function initApp() {
  renderPersonaPresets();
  renderPDFPresets();
  setupEventListeners();
  updateGenderButtons();
  updateStepView();
  updateAuthProgress();
  setupProviderDetailsHandlers();
  setupConsentDetailsHandlers();

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
  if (!birth || birth.trim() === "") {
    return { valid: false, errorMsg: "생년월일을 입력해주세요." };
  }
  if (birth.length !== 6 || isNaN(Number(birth))) {
    return { valid: false, errorMsg: "생년월일 6자리를 정확하게 입력해주세요. (예: 840323)" };
  }

  const yearStr = birth.substring(0, 2);
  const monthStr = birth.substring(2, 4);
  const dayStr = birth.substring(4, 6);

  const yearNum = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (month < 1 || month > 12) {
    return { valid: false, errorMsg: `올바른 월이 아닙니다. (${monthStr}월)` };
  }

  // 가상의 세기 구분 (40년 이상이면 1900년대, 40년 미만이면 2000년대 간주)
  const fullYear = yearNum >= 40 ? 1900 + yearNum : 2000 + yearNum;
  const isLeapYear = (fullYear % 4 === 0 && fullYear % 100 !== 0) || (fullYear % 400 === 0);
  const daysInMonth = [
    31, // 1월
    isLeapYear ? 29 : 28, // 2월
    31, // 3월
    30, // 4월
    31, // 5월
    30, // 6월
    31, // 7월
    31, // 8월
    30, // 9월
    31, // 10월
    30, // 11월
    31  // 12월
  ];

  const maxDay = daysInMonth[month - 1];
  if (day < 1 || day > maxDay) {
    return { valid: false, errorMsg: `존재하지 않는 날짜입니다. (${month}월은 ${maxDay}일까지 존재합니다.)` };
  }

  return { valid: true };
}

// 에러 스타일 및 애니메이션 초기화용 헬퍼
function clearInputErrors() {
  const nameInput = document.getElementById("input-username") as HTMLInputElement | null;
  const birthInput = document.getElementById("input-birth") as HTMLInputElement | null;
  const phoneInput = document.getElementById("modal-input-phone") as HTMLInputElement | null;
  const nameError = document.getElementById("error-username");
  const birthError = document.getElementById("error-birth");
  const phoneError = document.getElementById("error-modal-phone");

  if (nameInput) {
    nameInput.classList.remove("border-red-500", "focus:ring-red-500", "animate-shake");
    nameInput.classList.add("border-slate-200", "focus:ring-[#f37321]");
  }
  if (birthInput) {
    birthInput.classList.remove("border-red-500", "focus:ring-red-500", "animate-shake");
    birthInput.classList.add("border-slate-200", "focus:ring-[#f37321]");
  }
  if (phoneInput) {
    phoneInput.classList.remove("border-red-500", "focus:ring-red-500", "animate-shake");
    phoneInput.classList.add("border-slate-200", "focus:ring-[#f37321]");
  }
  if (nameError) {
    nameError.classList.add("hidden");
    nameError.innerText = "";
  }
  if (birthError) {
    birthError.classList.add("hidden");
    birthError.innerText = "";
  }
  if (phoneError) {
    phoneError.classList.add("hidden");
    phoneError.innerText = "";
  }
}

// 개별 필드 에러 효과 및 텍스트박스 흔들림 트리거 헬퍼
function triggerInputError(inputEl: HTMLInputElement, errorEl: HTMLElement, message: string) {
  clearInputErrors();

  if (errorEl) {
    errorEl.innerText = message;
    errorEl.classList.remove("hidden");
  }

  if (inputEl) {
    inputEl.classList.remove("border-slate-200", "focus:ring-[#f37321]");
    inputEl.classList.add("border-red-500", "focus:ring-red-500");
    
    // 흔들기 애니메이션 트리거 (Reflow 강제)
    inputEl.classList.remove("animate-shake");
    void inputEl.offsetWidth; 
    inputEl.classList.add("animate-shake");

    inputEl.addEventListener("animationend", function handler() {
      inputEl.classList.remove("animate-shake");
      inputEl.removeEventListener("animationend", handler);
    });

    inputEl.focus();
  }
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

  async function extractTextFromPdf(file: File): Promise<string> {
    await loadPdfJs();
    const pdfjsLib = (window as any).pdfjsLib;
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(" ");
      fullText += pageText + "\n";
    }
    return fullText;
  }

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
    const cleanText = text.replace(/\s+/g, " ");
    const metrics: any = {};

    // 0. 연도 추출 (파일명에서 먼저 찾고, 없으면 텍스트 안에서 2010년~2026년 사이의 연도를 자동 발췌)
    let year = new Date().getFullYear();
    const fileYearMatch = filename.match(/(20\d{2})/);
    if (fileYearMatch) {
      year = parseInt(fileYearMatch[1]);
    } else {
      const textYears = text.match(/(20[12]\d)/g);
      if (textYears && textYears.length > 0) {
        const validYears = textYears.map(y => parseInt(y)).filter(y => y >= 2010 && y <= new Date().getFullYear() + 2);
        if (validYears.length > 0) {
          year = validYears[0];
        }
      }
    }
    metrics.year = year;

    // 1. 혈압 매칭 (수축기 / 이완기)
    // 예: 120/80 또는 130 - 85
    const bpMatch = /(\d{2,3})\s*[\/\-]\s*(\d{2,3})/.exec(cleanText);
    if (bpMatch) {
      const sys = parseInt(bpMatch[1]);
      const dia = parseInt(bpMatch[2]);
      if (sys >= 70 && sys <= 210 && dia >= 35 && dia <= 135) {
        metrics.systolicBP = sys;
        metrics.diastolicBP = dia;
      }
    }
    
    // 개별 키워드 매칭 - 공백 문자가 사이사이에 섞여있어도 인덱싱되게 변형
    if (!metrics.systolicBP) {
      const sysMatch = /(?:수\s*축\s*기|최\s*고\s*혈\s*압|최\s*고|s\s*y\s*s|b\s*p\s*[\s_-]*s\s*y\s*s)\s*(?:혈\s*압)?\s*[:=\s\-]*\s*(\d{2,3})/i.exec(cleanText);
      if (sysMatch) {
        metrics.systolicBP = parseInt(sysMatch[1]);
      }
    }
    if (!metrics.diastolicBP) {
      const diaMatch = /(?:이\s*완\s*기|최\s*저\s*혈\s*압|최\s*저|d\s*i\s*a|b\s*p\s*[\s_-]*d\s*i\s*a)\s*(?:혈\s*압)?\s*[:=\s\-]*\s*(\d{2,3})/i.exec(cleanText);
      if (diaMatch) {
        metrics.diastolicBP = parseInt(diaMatch[1]);
      }
    }

    // 2. 공복 식전 혈당
    const glucoseMatch = /(?:공\s*복\s*(?:식\s*전)?\s*혈\s*당|식\s*전\s*혈\s*당|g\s*l\s*u\s*c\s*o\s*s\s*e|당\s*뇨|혈\s*당)\s*[:=\s\-]*\s*(\d{2,3})/i.exec(cleanText);
    if (glucoseMatch) {
      const val = parseInt(glucoseMatch[1]);
      if (val >= 40 && val <= 400) {
        metrics.fastingGlucose = val;
      }
    }

    // 3. 총 콜레스테롤
    const cholValueMatch = /(?:총\s*)?콜\s*레\s*스\s*테\s*롤\s*[:=\s\-]*\s*(\d{2,3})/i.exec(cleanText) || /t(?:otal)?[\s_-]*chol(?:esterol)?\s*[:=\s\-]*\s*(\d{2,3})/i.exec(cleanText);
    if (cholValueMatch) {
      const val = parseInt(cholValueMatch[1]);
      if (val >= 80 && val <= 500) {
        metrics.totalCholesterol = val;
      }
    }

    // 4. 체질량지수 (BMI)
    const bmiMatch = /(?:b\s*m\s*i|체\s*질\s*량\s*지\s*수|체\s*질\s*량)\s*[:=\s\-]*\s*(\d{1,2}(?:\.\d+)?)/i.exec(cleanText);
    if (bmiMatch) {
      const val = parseFloat(bmiMatch[1]);
      if (val >= 10 && val <= 50) {
        metrics.bmi = val;
      }
    }

    // 5. 시그널 추가 파생
    if (norm.includes("지방간") || norm.includes("fatty liver")) {
      metrics.fattyLiver = "Mild";
    }
    const hbaMatch = /(?:당\s*화\s*혈\s*색\s*소)\s*[:=\s\-]*\s*(\d+(?:\.\d+)?)/i.exec(cleanText) || /hba1c\s*[:=\s\-]*\s*(\d+(?:\.\d+)?)/i.exec(cleanText);
    if (hbaMatch) metrics.hba1c = parseFloat(hbaMatch[1]);

    const homaMatch = /homa[-_\s]*ir\s*[:=\s\-]*\s*(\d+(?:\.\d+)?)/i.exec(cleanText) || /(?:인\s*슐\s*린\s*저\s*항\s*성)\s*[:=\s\-]*\s*(\d+(?:\.\d+)?)/i.exec(cleanText);
    if (homaMatch) metrics.homaIr = parseFloat(homaMatch[1]);

    const cdMatch = /(?:함\s*몰\s*비)\s*[:=\s\-]*\s*(\d+(?:\.\d+)?)/i.exec(cleanText) || /c\/d\s*ratio\s*[:=\s\-]*\s*(\d+(?:\.\d+)?)/i.exec(cleanText);
    if (cdMatch) metrics.cdRatio = parseFloat(cdMatch[1]);

    if (norm.includes("망막") || norm.includes("황반") || norm.includes("안저")) {
      metrics.retinaMsg = "주의";
    }

    // 최소 한 개의 의미있는 메트릭이나 추가 메디컬 수치가 관학되었으면 유효 판단 반환
    const hasAnyMetric = metrics.systolicBP || metrics.fastingGlucose || metrics.totalCholesterol || metrics.bmi || metrics.fattyLiver || metrics.hba1c || metrics.homaIr || metrics.cdRatio;
    
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
    openSyncModal();
  });

  // 모달 닫기
  $("btn-close-modal")?.addEventListener("click", closeSyncModal);

  // 약관 전체 체크 동의 연계
  $("check-term-all")?.addEventListener("change", (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    $$(".required-check").forEach((cb) => {
      (cb as HTMLInputElement).checked = checked;
    });
  });

  $$(".required-check").forEach((cb) => {
    cb.addEventListener("change", () => {
      const allChecked = Array.from($$(".required-check")).every(c => (c as HTMLInputElement).checked);
      const mainCheck = $("check-term-all") as HTMLInputElement;
      if (mainCheck) mainCheck.checked = allChecked;
    });
  });

  // 모달 - 간편인증 발송 요청
  $("btn-modal-request-auth")?.addEventListener("click", () => {
    const errorBanner = $("modal-error-banner");
    if (errorBanner) errorBanner.classList.add("hidden");

    const phoneInput = $("modal-input-phone") as HTMLInputElement;
    const phoneError = $("error-modal-phone");
    const phoneNo = phoneInput ? phoneInput.value : "";

    if (!phoneNo.trim()) {
      if (phoneInput && phoneError) {
        triggerInputError(phoneInput, phoneError as HTMLElement, "휴대폰 번호를 입력해주세요.");
      }
      return;
    }

    if (phoneNo.length < 10 || isNaN(Number(phoneNo))) {
      if (phoneInput && phoneError) {
        triggerInputError(phoneInput, phoneError as HTMLElement, "올바른 휴대폰 번호 10~11자리를 입력해주세요.");
      }
      return;
    }

    // 통과했으므로 에러 클리어
    clearInputErrors();

    const allAgreed = Array.from($$(".required-check")).every(c => (c as HTMLInputElement).checked);
    if (!allAgreed) {
      showModalError("국민건강보험 의료정보 연동을 위해 모든 필수 약관 수집에 동의해야 합니다.");
      return;
    }

    startAuthCountdown();
  });

  // 모달 - 인증 요청 취소
  $("btn-modal-cancel-request")?.addEventListener("click", () => {
    stopAuthCountdown();
    $("modal-step-requesting")?.classList.add("hidden");
    $("modal-step-form")?.classList.remove("hidden");
  });

  // 모달 - 인증 승인완료 후 동기화 실시
  $("btn-modal-confirm-sync")?.addEventListener("click", () => {
    stopAuthCountdown();
    executeNhisSync();
  });

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
  const carouselViewport = $("year-carousel-viewport");
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

  // 챗봇 입력 폼 SUBMIT 연동
  $("chat-input-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    handleChatSubmit();
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
          handleChatSubmit();
        }
      }
    }
  });

  // 챗봇 대화 초기화
  $("btn-reset-chat")?.addEventListener("click", () => {
    initializeChatRoom();
  });

  // 👪 가족력 선택(토글) 이벤트 리스너 배정
  $$(".family-factor-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const relation = btn.getAttribute("data-relation");
      const factor = btn.getAttribute("data-factor");
      if (!relation || !factor) return;

      if (relation === "father") {
        if (fatherFactors.includes(factor)) {
          fatherFactors = fatherFactors.filter(f => f !== factor);
          btn.classList.remove("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
          btn.classList.add("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
        } else {
          fatherFactors.push(factor);
          btn.classList.remove("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
          btn.classList.add("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
        }
      } else if (relation === "mother") {
        if (motherFactors.includes(factor)) {
          motherFactors = motherFactors.filter(f => f !== factor);
          btn.classList.remove("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
          btn.classList.add("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
        } else {
          motherFactors.push(factor);
          btn.classList.remove("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
          btn.classList.add("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
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
function openSyncModal() {
  const modal = $("auth-modal");
  if (modal) {
    modal.classList.remove("hidden");
    // 로깅/로그인 진행 중에는 하단 CTA 영역(final-analysis-cta-container)을 보이지 않게 숨김 처리합니다.
    $("final-analysis-cta-container")?.classList.add("hidden");
    // 초기화
    $("modal-step-form")?.classList.remove("hidden");
    $("modal-step-requesting")?.classList.add("hidden");
    $("modal-step-api-loading")?.classList.add("hidden");
    $("modal-error-banner")?.classList.add("hidden");
    
    // 전화번호 입력칸 초기화 및 우회안내 숨김
    const phoneInput = $("modal-input-phone") as HTMLInputElement | null;
    if (phoneInput) {
      phoneInput.value = "";
    }
    const disclaimer = $("modal-bypass-disclaimer");
    if (disclaimer) {
      disclaimer.classList.add("hidden");
    }
    
    const mainCheck = $("check-term-all") as HTMLInputElement;
    if (mainCheck) mainCheck.checked = false;
    $$(".required-check").forEach(c => (c as HTMLInputElement).checked = false);
  }
}

function closeSyncModal() {
  stopAuthCountdown();
  $("auth-modal")?.classList.add("hidden");
  $("final-analysis-cta-container")?.classList.remove("hidden");
}

function startAuthCountdown() {
  $("modal-step-form")?.classList.add("hidden");
  $("modal-step-requesting")?.classList.remove("hidden");
  $("modal-bypass-disclaimer")?.classList.add("hidden");

  authTimerSeconds = 180;
  updateTimerDisplay();

  authTimerInterval = setInterval(() => {
    authTimerSeconds--;
    updateTimerDisplay();

    if (authTimerSeconds <= 0) {
      stopAuthCountdown();
      alert("본인인증 대기 시간이 넘었습니다. 다시 시도해 주십시오.");
      $("modal-step-requesting")?.classList.add("hidden");
      $("modal-step-form")?.classList.remove("hidden");
    }
  }, 1000);
}

function stopAuthCountdown() {
  if (authTimerInterval) {
    clearInterval(authTimerInterval);
    authTimerInterval = null;
  }
}

function updateTimerDisplay() {
  const display = $("modal-timer-text");
  if (!display) return;
  const mins = Math.floor(authTimerSeconds / 60).toString().padStart(2, "0");
  const secs = (authTimerSeconds % 60).toString().padStart(2, "0");
  display.innerText = `${mins}:${secs}`;
}

// ========================================================
// 4. 안전가교 API 호출 동기화 (nhis-sync)
// ========================================================
function executeNhisSync() {
  $("modal-step-requesting")?.classList.add("hidden");
  $("modal-step-api-loading")?.classList.remove("hidden");
  $("modal-bypass-disclaimer")?.classList.add("hidden");
  $("final-analysis-cta-container")?.classList.add("hidden");

  const pFill = $("modal-api-bar-fill");
  const pPercent = $("modal-api-bar-percent");
  const pText = $("modal-api-loading-text");

  // 시각적인 API 파이프라인 연출
  const stages = [
    { text: "🔒 국민건강보험공단 건강검진 내부 가상세션 획득 중...", percent: 25, delay: 600 },
    { text: "✍️ 모바일 서명 검인증 및 전자증명서 무결성 대조 통과...", percent: 50, delay: 600 },
    { text: "📥 최근 5개년치 15대 만성 대사증후군 건강 인덱스 수집 중...", percent: 75, delay: 700 },
    { text: "📊 요합 지표 매핑 최적화 설계 및 클라이언트 암호화 로딩 중...", percent: 95, delay: 600 }
  ];

  let idx = 0;
  function nextStage() {
    if (idx < stages.length) {
      if (pText) pText.innerText = stages[idx].text;
      if (pFill) pFill.style.width = `${stages[idx].percent}%`;
      if (pPercent) pPercent.innerText = `${stages[idx].percent}%`;
      setTimeout(() => {
        idx++;
        nextStage();
      }, stages[idx].delay);
    } else {
      // 실제 API 호출 개시
      sendNhisSyncRequest();
    }
  }
  nextStage();
}

async function sendNhisSyncRequest() {
  const phoneInput = $("modal-input-phone") as HTMLInputElement;
  const phoneNo = phoneInput ? phoneInput.value : "01012345678";
  const telecomSelect = $("modal-input-telecom") as HTMLSelectElement;
  const telecom = telecomSelect ? telecomSelect.value : "skt";

  const payload = {
    userName,
    identity: birthDate,
    phoneNo,
    telecom,
    loginType2: authProvider,
    agree1: true,
    agree2: true,
    agree3: true
  };

  try {
    const res = await fetch("/api/health/nhis-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const body = await res.json();
    if (!res.ok) {
      throw new Error(body.result?.message || "국민건강보험 공공 API를 동기화하는 도중 장애가 일어났습니다.");
    }

    // 성공 처리
    nhisRecords = body.data.syncedRecords;
    
    // 성공 동기화 로그 기록
    logAccessEvent("nhis_sync_success", { recordCount: nhisRecords ? nhisRecords.length : 0 });

    const pFill = $("modal-api-bar-fill");
    const pPercent = $("modal-api-bar-percent");
    const pText = $("modal-api-loading-text");
    if (pText) pText.innerText = "🎉 국민건강보험검진 지표 실시간 로딩 완벽 성공!";
    if (pFill) pFill.style.width = "100%";
    if (pPercent) pPercent.innerText = "100%";

    setTimeout(() => {
      closeSyncModal();
      isStep1Completed = true;
      updateAuthProgress();

      // Step 4 보이기 및 앵커 이동
      const connector3 = $("step-3-4-connector");
      const card4 = $("step-4-card");
      if (connector3 && card4) {
        connector3.classList.remove("hidden");
        card4.classList.remove("hidden");
        card4.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 800);

  } catch (err: any) {
    console.error(err);
    logAccessEvent("nhis_sync_failure", { errorMessage: err.message || err });
    alert(err.message || "서버 통신 중 장애가 생겼습니다.");
    $("modal-step-api-loading")?.classList.add("hidden");
    $("modal-step-form")?.classList.remove("hidden");
    $("final-analysis-cta-container")?.classList.remove("hidden");
  }
}

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
    }
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
    renderChatTab();
  } else if (tabName === "consulting") {
    renderConsultingTab();
  }
}

let selectedConsultingIds: string[] = ["cov-cancer", "cov-brain", "cov-heart", "cov-metabolic"];

function renderConsultingTab() {
  const container = $("section-consulting");
  if (!container) return;                
  
  const isFemale = (gender === "F");
  const productName = isFemale 
    ? "무배당 한화 시그니처 여성 건강보험 2.0"
    : "무배당 한화 H-PLUS 건강보험";
    
  const productDescription = isFemale
    ? "여성의 생애 주기별 특화 보장(유방암, 갑상선암, 난소암 및 여성 특정 임상질환 고액 케어)에 혈압, 당뇨 등 대사증후군 집중 탐지 가이드를 융합한 한화의 여성 시그니처 대표 건강보험 상품입니다."
    : "남성 3대 만성 질환 및 심혈관, 뇌혈관 대사성 고위험군 집중 케정과 건강검진 연계 보장을 안전하게 하나로 합친 남성 맞춤형 고품격 건강보험 보장형 상품입니다.";

  const coverages = [
    { id: "cov-cancer", name: "일반암 진단비 (표적항암 허가치료 포함 보강)", amount: "5,000만원", premium: 22400 },
    { id: "cov-brain", name: "뇌혈관질환 진단비 (2대 고위험 혈관 보강)", amount: "3,000만원", premium: 14800 },
    { id: "cov-heart", name: "허혈성심장질환 진단비 (협심증 진단 케어)", amount: "3,000만원", premium: 11200 },
    { id: "cov-metabolic", name: "대사성 만성질환(당뇨/고혈압 합병증 등) 특별보완 특약", amount: "1,000만원", premium: 6300 },
    { id: "cov-surgery", name: "일반 질병 수술비 및 120대 다빈도 특정질병수술비", amount: "500만원", premium: 5100 }
  ];

  let totalPremium = 0;
  const coveragesHtml = coverages.map((cov) => {
    totalPremium += cov.premium;
    const formattedPremium = cov.premium.toLocaleString();
    return `
      <tr class="border-b border-slate-100 last:border-b-0">
        <td class="py-3 px-2">
          <div class="font-bold text-slate-800 text-xs sm:text-sm">${cov.name}</div>
          <div class="text-[10px] text-slate-400 mt-0.5 font-bold">한화손해보험 최신 맞춤설계특약</div>
        </td>
        <td class="py-3 px-2 text-right font-extrabold text-slate-900 text-xs sm:text-xs">${cov.amount}</td>
        <td class="py-3 px-2 text-right font-mono font-bold text-[#f37321] text-xs sm:text-sm">${formattedPremium} 원</td>
      </tr>
    `;
  }).join("");

  const formattedTotal = totalPremium.toLocaleString();

  container.innerHTML = `
    <div class="bg-white p-5 sm:p-8 shadow-xs space-y-6 animate-fade-in text-left">
        <!-- Header -->
        <div class="border-b border-slate-150 pb-4">
          <span class="text-xs font-black text-[#f37321] tracking-wider uppercase">Hanwha General Insurance Custom Consulting</span>
          <h3 class="font-black text-slate-900 text-xl sm:text-2xl mt-1 flex items-center gap-1.5">
            <svg class="w-6 h-6 text-[#f37321] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            AI 건강 맞춤형 컨설팅
          </h3>
          <p class="text-slate-500 text-xs sm:text-sm mt-2 leading-relaxed">
            고객님의 최근 건강검진 종합 지표(<span id="consulting-score-badge" class="font-bold text-slate-800">${analysisResult?.overallScore || 84}점</span>)와 기재해주신 건강 상태를 토대로 <strong class="text-slate-800 font-extrabold">한화손해보험 상품공시실</strong>에 현재 정식 판매 중인 건강보장형 상품들을 대조 분석하여, 고객님께 가장 완벽하게 보완된 비대면 맞춤 포트폴리오를 제공합니다.
          </p>
        </div>
        
        <!-- Product Box -->
        <div class="bg-[#fffdfb] p-5 rounded-2xl border border-[#f37321]/20 space-y-2 relative overflow-hidden">
            <div class="absolute -right-6 -bottom-6 text-[#f37321] opacity-5">
              <svg class="w-24 h-24" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 21.622c5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016L12 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622z"/>
              </svg>
            </div>
            <div class="flex flex-col gap-1 items-start">
                <span class="text-[10px] px-2 py-0.5 rounded-md bg-[#f37321] text-white font-black">AI 추천 최적상품</span>
                <h4 class="font-black text-slate-900 text-sm sm:text-base">${productName}</h4>
            </div>
            <p class="text-slate-600 text-xs sm:text-sm leading-relaxed">${productDescription}</p>
        </div>
        
        <!-- Recommended Coverages -->
        <div class="space-y-3">
            <h4 class="font-extrabold text-slate-800 text-sm sm:text-base flex items-center gap-1.5">
              <svg class="w-4 h-4 text-[#f37321]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              가족력 및 검진 기반 추천 담보 구성
            </h4>

            <div class="border border-slate-200 bg-white rounded-2xl shadow-xs">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-xs">
                    <th class="py-3 px-2 font-black">담보명</th>
                    <th class="py-3 px-2 text-right font-black">가입금액</th>
                    <th class="py-3 px-2 text-right font-black">월 보험료</th>
                  </tr>
                </thead>
                <tbody class="text-xs text-slate-700">
                  ${coveragesHtml}
                </tbody>
              </table>
            </div>
        </div>

        <!-- Monthly Premium -->
        <div class="bg-gradient-to-r from-slate-50 to-[#fff8f2] p-5 sm:p-6 rounded-2xl border border-dashed border-[#f37321]/30 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div class="space-y-0.5 text-center sm:text-left">
            <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Calculated Monthly Premium</span>
            <h5 class="text-xs sm:text-sm font-black text-slate-750 block sm:inline">최종 월 납입 보험료</h5>
            <p class="text-2xl sm:text-3.5xl font-black text-[#f37321] tracking-tight mt-1">
              <span id="consulting-display-bold-total" class="font-extrabold text-3xl sm:text-4xl text-[#f37321]">${formattedTotal}</span> 원
            </p>
          </div>
        </div>
        
        <!-- File Upload Section -->
        <div class="bg-white p-6 rounded-2xl border border-slate-200 space-y-4">
            <h3 class="font-extrabold text-lg text-slate-900">기존 설계서 분석</h3>
            <p class="text-slate-500 text-sm">기존에 설계받은 보험 설계서를 업로드하거나 사진을 찍어 올려주시면, 현재 추천 상품과 비교하여 보장 차이점을 분석해 드립니다.</p>
            <input type="file" id="existing-plan-file" class="hidden" accept="image/*,application/pdf" />
            <div id="upload-zone" class="border-2 border-dashed border-slate-200 hover:border-[#f37321] bg-slate-50/70 hover:bg-[#fff5ee] rounded-xl p-6 text-center cursor-pointer transition-all">
               <span class="text-xs font-semibold text-slate-700">설계서 파일 / 사진 선택</span>
            </div>
            <button id="btn-analyze-plan" class="w-full bg-[#f37321] text-white rounded-xl py-3.5 font-bold text-sm">비교 분석하기</button>
        </div>

        <div id="analysis-result" class="hidden w-full bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 mt-4 shadow-sm text-left">
        </div>

        <button id="btn-consulting-consult-submit" class="w-full bg-[#f37321] hover:bg-[#dd6216] text-white font-extrabold text-sm sm:text-base px-6 py-4 rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer mt-4">
            <svg class="w-5 h-5 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
            </svg>
            상담 신청하기
        </button>
    </div>
  `;

  // Attach consultation request button event listener
  const submitBtn = $("btn-consulting-consult-submit");
  if (submitBtn) {
    submitBtn.addEventListener("click", () => {
      $("consultation-success-modal")?.classList.remove("hidden");
    });
  }

  // Upload handlers
  $("upload-zone")?.addEventListener("click", () => {
    $("existing-plan-file")?.click();
  });

  $("existing-plan-file")?.addEventListener("change", (e) => {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const span = $("upload-zone")?.querySelector("span");
      if (span) span.innerText = input.files[0].name;
    }
  });

  $("btn-analyze-plan")?.addEventListener("click", async () => {
    const fileInput = $("existing-plan-file") as HTMLInputElement;
    if (!fileInput.files || fileInput.files.length === 0) {
      alert("비교할 설계서 파일을 선택해주세요.");
      return;
    }
    
    const resultDiv = $("analysis-result");
    if (resultDiv) {
      resultDiv.classList.remove("hidden");
      resultDiv.innerText = "분석 중...";
    }

    const formData = new FormData();
    formData.append("file", fileInput.files[0]);
    formData.append("productName", productName);

    try {
        const response = await fetch("/api/health/compare-plan", {
            method: "POST",
            body: formData
        });
        const data = await response.json();
        const comparison = data.comparison;
        
        if (resultDiv) {
            resultDiv.innerHTML = `
                <div class="overflow-x-auto w-full">
                    <table class="w-full text-xs sm:text-sm text-left border-collapse min-w-[450px]">
                        <thead>
                            <tr class="border-b border-slate-200 text-slate-500 font-bold text-[11px] sm:text-xs">
                                <th class="py-3 pr-2 w-[18%] min-w-[70px]">보장항목</th>
                                <th class="py-3 pr-2 w-[18%] min-w-[70px] whitespace-nowrap">기존</th>
                                <th class="py-3 pr-2 w-[18%] min-w-[70px] whitespace-nowrap">AI추천</th>
                                <th class="py-3 pr-2 w-[18%] min-w-[70px] whitespace-nowrap">적합여부</th>
                                <th class="py-3 w-[28%] min-w-[120px]">사유</th>
                            </tr>
                        </thead>
                        <tbody class="text-slate-700">
                            ${comparison.map((row: any) => {
                                const badgeColor = row.status === "매우적합" 
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200/60" 
                                    : "bg-blue-50 text-blue-700 border-blue-200/60";
                                return `
                                    <tr class="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                                        <td class="py-3.5 pr-2 font-bold text-slate-900 whitespace-nowrap">${row.item}</td>
                                        <td class="py-3.5 pr-2 text-slate-500 whitespace-nowrap">${row.old}</td>
                                        <td class="py-3.5 pr-2 font-bold text-[#f37321] whitespace-nowrap">${row.new}</td>
                                        <td class="py-3.5 pr-2 whitespace-nowrap">
                                            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold ${badgeColor} border">
                                                ${row.status}
                                            </span>
                                        </td>
                                        <td class="py-3.5 text-slate-500 text-xs sm:text-sm break-keep leading-relaxed">${row.reason}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }
    } catch(e) {
      if (resultDiv) resultDiv.innerText = "분석 중 오류가 발생했습니다.";
    }
  });
}

// ========================================================
// 6-5. 대시보드 고객명 및 생년월일 동적 메타데이터 동기화
// ========================================================
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
        let statusTag = `<span class="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">주의단계</span>`;
        
        if (w.status === "RED") {
          cardBg = "bg-rose-50/50 border-rose-100";
          statusTag = `<span class="bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">🚨 즉각관리</span>`;
        } else if (w.status === "GREEN") {
          cardBg = "bg-emerald-50/50 border-emerald-100";
          statusTag = `<span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">✅ 유지관리</span>`;
        }

        return `
          <div class="p-5 ${cardBg} border rounded-2xl flex flex-col sm:flex-row justify-between items-start gap-4">
            <div class="space-y-2 flex-1">
              <div class="flex items-center gap-2">
                ${statusTag}
                <span class="font-bold text-[#231f20] text-sm">${w.item}</span>
                <span class="text-xs font-mono font-bold text-slate-500 bg-white shadow-3xs px-2 py-0.5 rounded border border-slate-100">${w.value}</span>
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

  // 5. 내년도 추천 정밀 검사 목록 빌드
  const recommendedContainer = $("rendered-recommended-checks");
  if (recommendedContainer) {
    recommendedContainer.innerHTML = analysisResult.recommendedChecks.map((item) => {
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
  }
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
function switchYearSlide(index: number, pauseAuto = false) {
  const records = [...nhisRecords].sort((a, b) => b.year - a.year);
  const recordsCount = records.length;
  if (recordsCount === 0) return;

  // 데이터가 없는 위치로는 전진 불가능하도록 단단한 제한 범위 설정
  let targetIndex = index;
  if (targetIndex < 0) {
    targetIndex = 0;
  } else if (targetIndex >= recordsCount) {
    targetIndex = recordsCount - 1;
  }

  currentYearSlideIndex = targetIndex;

  // 1. 슬라이더 트랙의 translateX 조작을 통해 매끄러운 단일 스와이프 연출
  const chartContainer = $("dynamic-timeline-chart");
  if (chartContainer) {
    chartContainer.style.transform = `translateX(-${currentYearSlideIndex * 100}%)`;
  }

  // 2. 연도별 캡슐 목록 하이라이트 싱크 (버튼 찌그러짐 차단 및 완성도 배가)
  const dots = $$(".year-carousel-dot");
  dots.forEach((dot, idx) => {
    if (idx === currentYearSlideIndex) {
      dot.className = "year-carousel-dot flex-1 text-center cursor-pointer transition-all duration-355 py-2 px-1 sm:px-3 text-[11px] sm:text-[13px] font-black rounded-xl bg-gradient-to-r from-[#f37321] to-amber-500 text-white border border-transparent shadow-xs";
    } else {
      dot.className = "year-carousel-dot flex-1 text-center cursor-pointer transition-all duration-355 py-2 px-1 sm:px-3 text-[11px] sm:text-[13px] font-black rounded-xl bg-white hover:bg-slate-100 text-slate-600 border border-slate-200";
    }
  });

  // 3. 수축이 불가능하게 한계점의 버튼 비활성화 적용 (공백으로 가는 길 차단)
  const prevBtn = $("btn-year-carousel-prev") as HTMLButtonElement | null;
  const nextBtn = $("btn-year-carousel-next") as HTMLButtonElement | null;
  if (prevBtn) {
    prevBtn.disabled = currentYearSlideIndex === 0;
  }
  if (nextBtn) {
    nextBtn.disabled = currentYearSlideIndex === recordsCount - 1;
  }

  // 🌟 사용자가 손으로 직접 조작했을 경우 자동 기동 타이머 제거하여 안정성 확보
  if (pauseAuto) {
    stopYearCarouselAutoRotation();
  }

  // 📈 기어 종합 점수 차트 싱크로 드로잉
  drawWellnessScoreChart();
}

function startYearCarouselAutoRotation() {
  stopYearCarouselAutoRotation();
  yearCarouselTimer = setInterval(() => {
    const recordsCount = nhisRecords.length;
    if (recordsCount <= 1) return;
    let nextIdx = currentYearSlideIndex + 1;
    if (nextIdx >= recordsCount) {
      nextIdx = 0; // 처음으로 루프 순환
    }
    switchYearSlide(nextIdx, false);
  }, 5000); 
}

function stopYearCarouselAutoRotation() {
  if (yearCarouselTimer) {
    clearInterval(yearCarouselTimer);
    yearCarouselTimer = null;
  }
}

// 8. [건강 트렌드 시계열 탭] 렌더링 & SVG 드로잉
// ========================================================
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

  // 전체 캐러샐 슬라이드 리스트 렌더링
  let slidesHtml = "";

  records.forEach((r, i) => {
    const prevRecord = records[i + 1]; // 역순 정렬이므로 i+1번째 인덱스가 이전 기록입니다
    const isLatest = i === 0;

    // --- 1. [mg/dL 그룹] ---
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
    const getLdlStatus = (v: number) => {
      if (v < 130) return { label: "적정", level: 1 as const };
      if (v < 160) return { label: "경계", level: 2 as const };
      return { label: "고LDL", level: 3 as const };
    };
    const getHdlStatus = (v: number) => {
      if (v >= 60) return { label: "최적", level: 1 as const };
      if (v >= 40) return { label: "보통", level: 1 as const };
      return { label: "낮음", level: 3 as const };
    };

    const gStat = getGlucoseStatus(gVal);
    const tcStat = getTcStatus(tcVal);
    const tgStat = getTgStatus(tgVal);
    const ldlStat = getLdlStatus(ldlVal);
    const hdlStat = getHdlStatus(hdlVal);

    // --- 2. [mmHg 그룹] ---
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

    // --- 3. [U/L 그룹] ---
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

    // --- 4. [신체 계측 그룹] ---
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

    // --- 5. [신장 및 당화 그룹] ---
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

    // 카드 하이라이트 스타일
    let cardWrapperBorder = "border-slate-200";
    let cardWrapperBg = "bg-white";
    if (isLatest) {
      cardWrapperBorder = "border-[#f37321]/45 ring-1 ring-[#f37321]/8";
      cardWrapperBg = "bg-[#fffdfb]/80";
    }

    slidesHtml += `
      <div class="flex-shrink-0 w-full px-0 sm:px-2 flex flex-col space-y-3">
        
        <!-- 연도별 헤더 마크 -->
        <div class="flex items-center justify-between border-b border-dashed border-slate-200 pb-2 px-3 sm:px-0">
          <div class="flex items-center gap-3">
            <span class="bg-slate-900 text-[#efeee8] font-black text-xs sm:text-sm px-3.5 py-1.5 rounded-xl font-mono tracking-wider shadow-sm flex items-center leading-none">
              📅 ${r.year}년 검진보고 요약
            </span>
            ${isLatest ? `
              <span class="bg-gradient-to-r from-[#f37321] to-amber-500 text-white text-[10px] font-black px-2.5 py-1 rounded-full shadow-xs tracking-wider flex items-center gap-1 leading-none">
                LATEST
              </span>
            ` : ""}
          </div>
          <span class="text-xs text-slate-400 font-bold hidden sm:inline">단위 기반 정밀 영역별 요약 정보</span>
        </div>

        <!-- 5영역 계측 가속 지포 보정 보관함 그리드 -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          
          <!-- [그룹 1]: 대사/지질 정밀 지표군 (mg/dL) -->
          <div class="rounded-2xl border ${cardWrapperBorder} ${cardWrapperBg} p-3.5 xs:p-4 sm:p-4.5 flex flex-col justify-between shadow-xs hover:shadow-md transition-all space-y-3">
            <div>
              <div class="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-50">
                <span class="text-xs sm:text-[13px] font-extrabold text-slate-705 flex items-center gap-1">
                  🩸 혈액 지질 지표 (mg/dL)
                </span>
                <span class="text-[9px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-400 font-bold font-mono">mg/dL</span>
              </div>
              
              <ul class="space-y-3">
                <!-- 1. 공복혈당 -->
                <li class="flex flex-col space-y-1">
                  <div class="flex items-center justify-between text-xs sm:text-[13px]">
                    <span class="font-extrabold text-slate-700">공복 혈당</span>
                    <div class="flex items-center gap-1.5 leading-none">
                      ${prevRecord ? renderDeltaPill(gVal - prevG, true, "") : ""}
                      ${getStatusBadge(gStat.level, gStat.label)}
                    </div>
                  </div>
                  <div class="text-[15px] sm:text-[17px] font-black text-slate-900 font-mono tracking-tight leading-normal">${gVal} <span class="text-[10.5px] text-slate-400 font-normal">mg/dL</span></div>
                </li>
                
                <!-- 2. 총 콜레스테롤 -->
                <li class="flex flex-col space-y-1">
                  <div class="flex items-center justify-between text-xs sm:text-[13px]">
                    <span class="font-extrabold text-slate-700">총 콜레스테롤</span>
                    <div class="flex items-center gap-1.5 leading-none">
                      ${prevRecord ? renderDeltaPill(tcVal - prevTc, true, "") : ""}
                      ${getStatusBadge(tcStat.level, tcStat.label)}
                    </div>
                  </div>
                  <div class="text-sm sm:text-[14px] font-bold text-slate-800 font-mono leading-normal">${tcVal} mg/dL</div>
                </li>

                <!-- 3. 중성지방 -->
                <li class="flex flex-col space-y-1">
                  <div class="flex items-center justify-between text-xs sm:text-[13px]">
                    <span class="font-extrabold text-slate-705">중성 지방</span>
                    <div class="flex items-center gap-1.5 leading-none">
                      ${prevRecord ? renderDeltaPill(tgVal - prevTg, true, "") : ""}
                      ${getStatusBadge(tgStat.level, tgStat.label)}
                    </div>
                  </div>
                  <div class="text-sm sm:text-[14px] font-bold text-slate-800 font-mono leading-normal">${tgVal} mg/dL</div>
                </li>

                <!-- 4. LDL 콜레스테롤 -->
                <li class="flex flex-col space-y-1">
                  <div class="flex items-center justify-between text-[11.5px] sm:text-[12px]">
                    <span class="font-bold text-slate-500">LDL 콜레</span>
                    <div class="flex items-center gap-1 leading-none">
                      ${prevRecord ? renderDeltaPill(ldlVal - prevLdl, true, "") : ""}
                    </div>
                  </div>
                  <div class="text-xs sm:text-[13px] font-semibold text-slate-600 font-mono leading-normal">${ldlVal} mg/dL</div>
                </li>

                <!-- 5. HDL 콜레스테롤 -->
                <li class="flex flex-col space-y-1">
                  <div class="flex items-center justify-between text-[11.5px] sm:text-[12px]">
                    <span class="font-bold text-slate-500">HDL 콜레</span>
                    <div class="flex items-center gap-1 leading-none">
                      ${prevRecord ? renderDeltaPill(hdlVal - prevHdl, false, "") : ""}
                    </div>
                  </div>
                  <div class="text-xs sm:text-[13px] font-semibold text-slate-600 font-mono leading-normal">${hdlVal} mg/dL</div>
                </li>
              </ul>
            </div>
            
            <div class="text-xs text-slate-500 font-bold bg-slate-50 p-2 rounded-lg border border-slate-200/50 leading-relaxed text-center">
              💡 혈당 및 지질성 지표 총괄 관리
            </div>
          </div>

          <!-- [그룹 2]: 혈압/순환 계측 지표군 (mmHg) -->
          <div class="rounded-2xl border ${cardWrapperBorder} ${cardWrapperBg} p-3.5 xs:p-4 sm:p-4.5 flex flex-col justify-between shadow-xs hover:shadow-md transition-all space-y-3">
            <div>
              <div class="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-50">
                <span class="text-xs sm:text-[13px] font-extrabold text-[#f37321] flex items-center gap-1">
                  💓 순환기 혈압 (mmHg)
                </span>
                <span class="text-[9px] px-1.5 py-0.5 rounded-md bg-orange-50 text-orange-400 font-bold font-mono">mmHg</span>
              </div>
              
              <ul class="space-y-3.5">
                <!-- 통합 혈압 수치 -->
                <li>
                  <div class="flex items-center justify-between text-xs sm:text-[12px] text-slate-400 font-bold mb-1.5">
                    <span>수축기/이완기 혈압</span>
                    ${getStatusBadge(bpStat.level, bpStat.label)}
                  </div>
                  <div class="flex items-baseline space-x-1.5">
                    <span class="text-3xl font-black text-slate-950 font-mono tracking-tighter leading-none">${sbpVal}/${dbpVal}</span>
                    <span class="text-xs text-slate-400 font-mono leading-none">mmHg</span>
                  </div>
                </li>

                <!-- 수축기 상세 -->
                <li class="flex flex-col space-y-1 p-2 bg-slate-50/80 rounded-lg border border-slate-200/40">
                  <div class="flex items-center justify-between text-xs">
                    <span class="font-extrabold text-slate-700">수축기 (최고혈압)</span>
                    ${prevRecord ? renderDeltaPill(sbpVal - prevSbp, true, "") : ""}
                  </div>
                  <div class="text-xs sm:text-sm font-black text-slate-800 font-mono leading-none">${sbpVal} mmHg</div>
                </li>

                <!-- 이완기 상세 -->
                <li class="flex flex-col space-y-1 p-2 bg-slate-50/80 rounded-lg border border-slate-200/40">
                  <div class="flex items-center justify-between text-xs">
                    <span class="font-extrabold text-slate-700">이완기 (최저혈압)</span>
                    ${prevRecord ? renderDeltaPill(dbpVal - prevDbp, true, "") : ""}
                  </div>
                  <div class="text-xs sm:text-sm font-black text-slate-800 font-mono leading-none">${dbpVal} mmHg</div>
                </li>
              </ul>
            </div>
            
            <div class="text-xs text-[#f37321] font-bold bg-orange-50 p-2 rounded-lg border border-orange-100/50 leading-relaxed text-center">
              💡 심장 압력 및 혈관계 부하 경감 유도
            </div>
          </div>

          <!-- [그룹 3]: 간 건강 지표군 (U/L) -->
          <div class="rounded-2xl border ${cardWrapperBorder} ${cardWrapperBg} p-3.5 xs:p-4 sm:p-4.5 flex flex-col justify-between shadow-xs hover:shadow-md transition-all space-y-3">
            <div>
              <div class="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-50">
                <span class="text-xs sm:text-[13px] font-extrabold text-emerald-600 flex items-center gap-1">
                  🧪 간세포 효소 수치 (U/L)
                </span>
                <span class="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-400 font-bold font-mono">U/L</span>
              </div>
              
              <ul class="space-y-3">
                <li class="flex items-center justify-between text-xs sm:text-[12px] text-slate-400 font-bold">
                  <span>간상태 분류</span>
                  ${getStatusBadge(liverStat.level, liverStat.label)}
                </li>

                <!-- AST -->
                <li class="flex flex-col space-y-1">
                  <div class="flex items-center justify-between text-xs sm:text-[13px]">
                    <span class="font-extrabold text-slate-700">AST</span>
                    ${prevRecord ? renderDeltaPill(astVal - prevAst, true, "") : ""}
                  </div>
                  <div class="text-[15px] sm:text-[17px] font-black text-slate-900 font-mono tracking-tight leading-none">${astVal} <span class="text-[10.5px] text-slate-400 font-normal leading-none">U/L</span></div>
                </li>

                <!-- ALT -->
                <li class="flex flex-col space-y-1">
                  <div class="flex items-center justify-between text-xs sm:text-[13px]">
                    <span class="font-extrabold text-slate-700">ALT (대사효소)</span>
                    ${prevRecord ? renderDeltaPill(altVal - prevAlt, true, "") : ""}
                  </div>
                  <div class="text-[15px] sm:text-[17px] font-black text-slate-900 font-mono tracking-tight leading-none">${altVal} <span class="text-[10.5px] text-slate-400 font-normal leading-none font-mono">U/L</span></div>
                </li>

                <!-- r-GTP -->
                <li class="flex flex-col space-y-1 border-t border-slate-100/70 pt-1.5 pb-0.5">
                  <div class="flex items-center justify-between text-xs sm:text-[13px]">
                    <span class="font-bold text-slate-500">r-GTP</span>
                    ${prevRecord ? renderDeltaPill(rgtpVal - prevRgtp, true, "") : ""}
                  </div>
                  <div class="text-xs sm:text-sm font-semibold text-slate-700 font-mono leading-none">${rgtpVal} U/L</div>
                </li>
              </ul>
            </div>
            
            <div class="text-xs text-emerald-600 font-bold bg-emerald-50 p-2 rounded-lg border border-emerald-100/50 leading-relaxed text-center">
              💡 아미노산 대사 지수 및 피로도 제어
            </div>
          </div>

          <!-- [그룹 4]: 체성분 및 계측 지표군 (kg, cm 등) -->
          <div class="rounded-2xl border ${cardWrapperBorder} ${cardWrapperBg} p-3.5 xs:p-4 sm:p-4.5 flex flex-col justify-between shadow-xs hover:shadow-md transition-all space-y-3">
            <div>
              <div class="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-50">
                <span class="text-xs sm:text-[13px] font-extrabold text-amber-600 flex items-center gap-1">
                  ⚖️ 신체 계측 및 비율
                </span>
                <span class="text-[9px] px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-500 font-bold font-mono">가변</span>
              </div>
              
              <ul class="space-y-3">
                <!-- BMI 핵심 상태 -->
                <li>
                  <div class="flex items-center justify-between text-xs sm:text-[12px] text-slate-400 font-bold mb-1.5">
                    <span>BMI 비만지수</span>
                    ${getStatusBadge(bmiStat.level, bmiStat.label)}
                  </div>
                  <div class="flex items-baseline space-x-1.5">
                    <span class="text-2xl font-black text-slate-900 font-mono tracking-tighter leading-none">${bmiVal.toFixed(1)}</span>
                    <span class="text-xs text-slate-400 font-mono leading-none">kg/m²</span>
                  </div>
                </li>

                <!-- 체중 (Kg) -->
                <li class="flex flex-col space-y-1">
                  <div class="flex items-center justify-between text-xs sm:text-[13px]">
                    <span class="font-extrabold text-slate-700">체중</span>
                    ${prevRecord ? renderDeltaPill(wtVal - prevWt, true, "kg") : ""}
                  </div>
                  <div class="text-[15px] sm:text-[17px] font-black text-slate-900 font-mono tracking-tight leading-none">${wtVal} <span class="text-[10.5px] text-slate-400 font-normal leading-none shadow-xs">kg</span></div>
                </li>

                <!-- 허리둘레 (Waist) -->
                <li class="flex flex-col space-y-1 border-t border-slate-100/70 pt-1.5 pb-0.5">
                  <div class="flex items-center justify-between text-xs sm:text-[13px]">
                    <span class="font-bold text-slate-500">허리 둘레</span>
                    ${prevRecord ? renderDeltaPill(waistVal - prevWaist, true, "") : ""}
                  </div>
                  <div class="text-xs sm:text-sm font-semibold text-slate-700 font-mono leading-none">${waistVal} cm</div>
                </li>
              </ul>
            </div>
            
            <div class="text-xs text-amber-600 font-bold bg-amber-50 p-2 rounded-lg border border-amber-100/50 leading-relaxed text-center">
              💡 실질적 복부 지방도 분포 체크
            </div>
          </div>

          <!-- [그룹 5]: 당화 및 신장 연비 지표군 (%, mg/dL 등) -->
          <div class="rounded-2xl border ${cardWrapperBorder} ${cardWrapperBg} p-3.5 xs:p-4 sm:p-4.5 flex flex-col justify-between shadow-xs hover:shadow-md transition-all space-y-3">
            <div>
              <div class="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-50">
                <span class="text-xs sm:text-[13px] font-extrabold text-purple-600 flex items-center gap-1">
                  신장 및 장기 핵심 안전망
                </span>
                <span class="text-[9px] px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-400 font-bold font-mono">정밀</span>
              </div>
              
              <ul class="space-y-3">
                <!-- 당화혈색소 3개월 평균 혈당 -->
                <li class="flex flex-col space-y-1">
                  <div class="flex items-center justify-between text-xs sm:text-[13px]">
                    <span class="font-extrabold text-slate-700">당화혈색소 (HbA1c)</span>
                    <div class="flex items-center gap-1.5 leading-none">
                      ${prevRecord ? renderDeltaPill(hbVal - prevHb, true, "%") : ""}
                    </div>
                  </div>
                  <div class="text-[15px] sm:text-[17px] font-black text-slate-900 font-mono tracking-tight leading-none">${hbVal.toFixed(1)}%</div>
                </li>

                <!-- 사구체 여과율 eGFR -->
                <li class="flex flex-col space-y-1">
                  <div class="flex items-center justify-between text-xs sm:text-[13px]">
                    <span class="font-extrabold text-slate-700">사구체여과율 (eGFR)</span>
                    <div class="flex items-center gap-1.5 leading-none">
                      ${prevRecord ? renderDeltaPill(egfrVal - prevEgfr, false, "") : ""}
                    </div>
                  </div>
                  <div class="text-[15px] sm:text-[17px] font-black text-slate-950 font-mono tracking-tight leading-none">${egfrVal.toFixed(0)} <span class="text-[10.5px] text-slate-400 font-normal leading-none" style="display:inline;">mL/min</span></div>
                </li>

                <!-- 크레아티닌 -->
                <li class="flex flex-col space-y-1 border-t border-slate-100/70 pt-1.5 pb-0.5">
                  <div class="flex items-center justify-between text-xs sm:text-[13px]">
                    <span class="font-bold text-slate-500">크레아티닌</span>
                    ${prevRecord ? renderDeltaPill(crVal - prevCr, true, "") : ""}
                  </div>
                  <div class="text-xs sm:text-sm font-semibold text-slate-700 font-mono leading-none">${crVal.toFixed(2)} mg/dL</div>
                </li>
              </ul>
            </div>
            
            <div class="text-xs text-purple-600 font-bold bg-purple-50 p-2 rounded-lg border border-purple-100/50 leading-relaxed text-center">
              💡 신장의 필터링 및 배설 원활도 지수
            </div>
          </div>

        </div>
      </div>
    `;
  });

  // Carousel 슬라이드 적용
  chartContainer.className = "flex transition-transform duration-500 ease-out py-1 select-none w-full";
  chartContainer.innerHTML = slidesHtml;

  // 닷 인디케이터 대신 캡슐 버튼 어레인지 배치
  const indicatorsContainer = $("year-carousel-indicators-container");
  if (indicatorsContainer) {
    indicatorsContainer.innerHTML = records.map((r, idx) => {
      const isSelected = idx === currentYearSlideIndex;
      return `
        <button type="button" class="year-carousel-dot flex-1 text-center cursor-pointer transition-all duration-355 py-2 px-1 sm:px-3 text-[11px] sm:text-[13px] font-black rounded-xl ${isSelected ? 'bg-gradient-to-r from-[#f37321] to-amber-500 text-white border border-transparent shadow-xs' : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'}" data-slide-index="${idx}" aria-label="${r.year}년 검진정보">
          ${r.year}년
        </button>
      `;
    }).join("");
  }
}

// 📈 초정밀 반응형 HTML 인포그래픽 타임라인 차트 컴파일 드로잉 함수
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
  chartContainer.className = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4.5 w-full";
  chartContainer.innerHTML = cardsHtml;
  chartContainer.style.transform = "";
}

// ========================================================
// 9. [생활 수칙 실천방 탭] 렌더링
// ========================================================
function renderActionTab() {
  if (!analysisResult) return;

  const dietContainer = $("checklist-diet-container");
  const exerciseContainer = $("checklist-exercise-container");
  const lifestyleContainer = $("checklist-lifestyle-container");

  const dietPlan = analysisResult.managementPlan.diet;
  const exercisePlan = analysisResult.managementPlan.exercise;
  const lifestylePlan = analysisResult.managementPlan.lifestyle;

  if (dietContainer && dietPlan) {
    dietContainer.innerHTML = dietPlan.map((plan) => {
      return `
        <div class="flex items-start gap-2.5 py-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-50/40 px-2 rounded-xl transition-colors">
          <div class="w-1.5 h-1.5 rounded-full bg-[#f37321] mt-1.5 shrink-0"></div>
          <span class="text-xs sm:text-sm text-slate-700 leading-relaxed font-bold break-keep">${plan}</span>
        </div>
      `;
    }).join("");
  }

  if (exerciseContainer && exercisePlan) {
    exerciseContainer.innerHTML = exercisePlan.map((plan) => {
      return `
        <div class="flex items-start gap-2.5 py-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-50/40 px-2 rounded-xl transition-colors">
          <div class="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0"></div>
          <span class="text-xs sm:text-sm text-slate-700 leading-relaxed font-semibold break-keep">${plan}</span>
        </div>
      `;
    }).join("");
  }

  if (lifestyleContainer && lifestylePlan) {
    lifestyleContainer.innerHTML = lifestylePlan.map((plan) => {
      return `
        <div class="flex items-start gap-2.5 py-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-50/40 px-2 rounded-xl transition-colors">
          <div class="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0"></div>
          <span class="text-xs sm:text-sm text-slate-700 leading-relaxed font-semibold break-keep">${plan}</span>
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

  // CODEF 요약 패널 실시간 제어
  if (isStep1Completed) {
    renderCodefSummary();
    $("codef-link-container")?.classList.remove("hidden");
  } else {
    const section = $("codef-summary-section");
    if (section) section.classList.add("hidden");
    $("codef-link-container")?.classList.add("hidden");
    $("codef-summary-modal-wrapper")?.classList.add("hidden");
  }

  // 업로드 파일 파싱 결과 요약 패널 제어
  if (isStep2Completed) {
    renderParsedFileSummary();
    $("parsed-file-link-container")?.classList.remove("hidden");
  } else {
    $("parsed-file-link-container")?.classList.add("hidden");
    $("parsed-file-summary-modal-wrapper")?.classList.add("hidden");
  }
}

// 업로드 문서들의 파싱 결과를 팝업창용으로 포맷팅 및 주입하는 함수
function renderParsedFileSummary() {
  const metricsList = $("parsed-file-metrics-list");
  const tableBody = $("parsed-file-table-body");
  const ownerEl = $("parsed-file-summary-owner");

  if (ownerEl) {
    const inputName = $("input-username") as HTMLInputElement | null;
    ownerEl.innerText = inputName && inputName.value ? inputName.value : "이민재";
  }

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
        <div class="bg-white border border-slate-100 rounded-2xl p-4 flex sm:flex-row flex-col justify-between items-start sm:items-center gap-3 shadow-xs hover:border-[#f37321]/20 transition-all">
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
          <div class="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
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
        <div class="bg-white border border-slate-100 rounded-2xl p-4 flex sm:flex-row flex-col justify-between items-start sm:items-center gap-3 shadow-xs hover:border-[#f37321]/20 transition-all">
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
          <div class="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
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
        <div class="bg-white border border-slate-100 rounded-2xl p-4 flex sm:flex-row flex-col justify-between items-start sm:items-center gap-3 shadow-xs hover:border-[#f37321]/20 transition-all">
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
          <div class="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
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
        <div class="bg-white border border-slate-100 rounded-2xl p-4 flex sm:flex-row flex-col justify-between items-start sm:items-center gap-3 shadow-xs hover:border-[#f37321]/20 transition-all">
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
          <div class="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
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
            <div class="bg-white border border-slate-100 rounded-2xl p-4 flex sm:flex-row flex-col justify-between items-start sm:items-center gap-3 shadow-xs hover:border-[#f37321]/20 transition-all">
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
              <div class="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                <span class="inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold border bg-amber-50 text-amber-700 border-amber-200/60 font-semibold">지방간 소견</span>
              </div>
            </div>
            <p class="text-[10px] text-[#767676] pl-4 border-l-2 border-slate-200 leading-normal -mt-2.5 break-keep mb-3 font-semibold">상복부 간 초음파 상 경미한 지방간 음영이 매칭되었습니다. 식이량 정량화와 가벼운 조깅이 권유됩니다.</p>
          `;
        }
        if (file.metrics.hba1c && !cardsContent.includes("당화혈색소")) {
          cardsContent += `
            <div class="bg-white border border-slate-100 rounded-2xl p-4 flex sm:flex-row flex-col justify-between items-start sm:items-center gap-3 shadow-xs hover:border-[#f37321]/20 transition-all font-semibold">
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
              <div class="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
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
            <div class="bg-white border border-slate-100 rounded-2xl p-4 flex sm:flex-row flex-col justify-between items-start sm:items-center gap-3 shadow-xs hover:border-[#f37321]/20 transition-all font-semibold">
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
              <div class="flex items-center gap-2.5 shrink-0 self-end sm:self-center font-semibold">
                <div class="text-right">
                  <span class="text-base font-black text-slate-900">${file.metrics.cdRatio}</span>
                </div>
                <span class="inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold border bg-emerald-50 text-emerald-700 border-emerald-200/60">정상</span>
              </div>
            </div>
            <p class="text-[10px] text-[#767676] pl-4 border-l-2 border-slate-200 leading-normal -mt-2.5 break-keep mb-3 font-semibold">함몰비가 ${file.metrics.cdRatio} 수준으로 시신경 보종이 조절 하우 영역으로 지지됩니다.</p>
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
}

// 업로드된 파일 리스트를 화면에 표시 및 제어하는 함수
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
  fatherFactors = [];
  motherFactors = [];
  $$(".family-factor-btn").forEach(btn => {
    btn.classList.remove("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
    btn.classList.add("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
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
  const section = $("codef-summary-section");
  if (!section) return;

  const ownerEl = $("codef-summary-owner");
  if (ownerEl) {
    const inputName = $("input-username") as HTMLInputElement | null;
    ownerEl.innerText = inputName ? inputName.value : "고객";
  }

  const metricsList = $("codef-summary-metrics-list");
  const tableBody = $("codef-summary-table-body");

  if (!nhisRecords || nhisRecords.length === 0) {
    section.classList.add("hidden");
    return;
  }

  // 데이터 정조율: 연도 내림차순 (최신 정보가 맨 처음에 오도록 정렬)
  const sortedRecords = [...nhisRecords].sort((a, b) => b.year - a.year);
  const latest = sortedRecords[0];

  // 지표 1: 혈압 (Systolic/Diastolic BP)
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

  // 지표 2: 공복 식전혈당 (Fasting Glucose)
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

  // 지표 3: 총 콜레스테롤 (Total Cholesterol)
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

  // 지표 4: 체질량 지수 (BMI)
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

  if (metricsList) {
    metricsList.innerHTML = `
      <!-- 1. 혈압 -->
      <div class="bg-white border border-slate-100/80 rounded-xl p-3 flex sm:flex-row flex-col justify-between items-start sm:items-center gap-2 shadow-xs transition-all hover:border-[#f37321]/20">
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
        <div class="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
          <div class="text-right">
            <span class="text-xs font-black text-slate-800">${sys}/${dia}</span>
            <span class="text-[9px] text-slate-400">mmHg</span>
          </div>
          <span class="inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${bpColor}">${bpLevel}</span>
        </div>
      </div>
      <p class="text-[10px] text-[#767676] pl-4 border-l-2 border-slate-200 leading-normal -mt-2.5 break-keep mb-3 font-semibold">${bpDesc}</p>

      <!-- 2. 혈당 -->
      <div class="bg-white border border-slate-100/80 rounded-xl p-3 flex sm:flex-row flex-col justify-between items-start sm:items-center gap-2 shadow-xs transition-all hover:border-[#f37321]/20">
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
        <div class="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
          <div class="text-right">
            <span class="text-xs font-black text-slate-800">${gl}</span>
            <span class="text-[9px] text-slate-400">mg/dL</span>
          </div>
          <span class="inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${glColor}">${glLevel}</span>
        </div>
      </div>
      <p class="text-[10px] text-[#767676] pl-4 border-l-2 border-slate-200 leading-normal -mt-2.5 break-keep mb-3 font-semibold">${glDesc}</p>

      <!-- 3. 콜레스테롤 -->
      <div class="bg-white border border-slate-100/80 rounded-xl p-3 flex sm:flex-row flex-col justify-between items-start sm:items-center gap-2 shadow-xs transition-all hover:border-[#f37321]/20">
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
        <div class="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
          <div class="text-right">
            <span class="text-xs font-black text-slate-800">${chol}</span>
            <span class="text-[9px] text-slate-400">mg/dL</span>
          </div>
          <span class="inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${cholColor}">${cholLevel}</span>
        </div>
      </div>
      <p class="text-[10px] text-[#767676] pl-4 border-l-2 border-slate-200 leading-normal -mt-2.5 break-keep mb-3 font-semibold">${cholDesc}</p>

      <!-- 4. 체질량지수 (BMI) -->
      <div class="bg-white border border-slate-100/80 rounded-xl p-3 flex sm:flex-row flex-col justify-between items-start sm:items-center gap-2 shadow-xs transition-all hover:border-[#f37321]/20">
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
        <div class="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
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

  // 연도별 테이블 렌더러
  if (tableBody) {
    tableBody.innerHTML = sortedRecords.map((rec) => {
      return `
        <tr class="hover:bg-slate-100/60 transition-colors border-b border-slate-100">
          <td class="py-2.5 font-bold text-slate-800">${rec.year}년</td>
          <td class="py-2.5 text-center text-slate-900 font-extrabold">${rec.systolicBP ?? "-"} <span class="text-[9px] text-slate-400 font-normal">mmHg</span></td>
          <td class="py-2.5 text-center text-slate-900 font-extrabold">${rec.fastingGlucose ?? "-"} <span class="text-[9px] text-slate-400 font-normal">mg/dL</span></td>
          <td class="py-2.5 text-center text-[#f37321] font-black">${rec.totalCholesterol ?? "-"} <span class="text-[9px] text-slate-400 font-normal">mg/dL</span></td>
        </tr>
      `;
    }).join("");
  }

  section.classList.remove("hidden");
}

