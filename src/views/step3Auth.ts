/**
 * -------------------------------------------------------------
 * 🔒 [Health-AI-Client] Step 3 국민건강보험 간편인증 및 동기화 제어 모듈
 * -------------------------------------------------------------
 * 본인인증 모달 팝업의 상태 제어, 3분 제한시간 타이머 헬퍼,
 * CODEF 간편인증 1차 요청(PUSH 발송) 및 2차 확인(검진 데이터 조회)
 * 통신 과정을 시각적 피드백(로딩바)과 함께 제공하는 전용 뷰 모듈입니다.
 * -------------------------------------------------------------
 */

import { $, $$ } from "../utils/chartHelper";
import { clearInputErrors, triggerInputError } from "../utils/formHelper";

// 3분 카운트다운 타이머용 모듈 내부 지역 상태 변수
let authTimerInterval: any = null;
let authTimerSeconds = 180;
let authPollInterval: any = null;

// 연동 모드 상태 관리 변수 (bypass, sandbox, development)
// 기본값: "development" → 실제(Real Dev) 모드가 디폴트로 체크됩니다.
let currentSyncMode: "bypass" | "sandbox" | "development" = "development";

// main.tsx의 전역 상태 값을 직접 변경하거나 참조하지 않고,
// 인터페이스를 통해 안전하게 교류할 수 있도록 설계된 컨텍스트 사양입니다.
export interface Step3Context {
  getUserName(): string;
  getBirthDate(): string;
  getAuthProvider(): string;
  getCodefJti(): string;
  setCodefJti(jti: string): void;
  getCodefTwoWayInfo(): any;
  setCodefTwoWayInfo(info: any): void;
  getNhisRecords(): any[];
  setNhisRecords(records: any[]): void;
  setIsStep1Completed(completed: boolean): void;
  updateAuthProgress(): void;
  logAccessEvent(actionType: string, details?: any): void;
}

// 본인인증 모달 내에 에러 문구를 노출하는 헬퍼 함수
export function showModalError(message: string) {
  const errBanner = $("modal-error-banner");
  if (errBanner) {
    errBanner.innerText = message;
    errBanner.classList.remove("hidden");
  }
}

// 1차 간편인증 PUSH 발송, 인증 취소, 2차 확인 버튼들의 클릭 이벤트를 바인딩합니다.
export function bindAuthModalEvents(ctx: Step3Context) {
  // 연동 모드 세그먼트 버튼 선택 이벤트 바인딩
  const syncButtons = $$(".sync-mode-btn");
  const bypassDesc = $("bypass-desc");
  const modeBadge = $("sync-mode-badge");

  syncButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.getAttribute("data-mode") as "bypass" | "sandbox" | "development";
      if (!mode) return;
      currentSyncMode = mode;

      // 활성화 스타일링 스위칭 (bg-[#f37321] text-white shadow-xs 적용, 비활성 버튼은 text-slate-500)
      syncButtons.forEach(b => {
        b.classList.remove("bg-white", "text-slate-800", "shadow-xs", "bg-[#f37321]", "text-white");
        b.classList.add("text-slate-500");
      });
      btn.classList.remove("text-slate-500");
      btn.classList.add("bg-[#f37321]", "text-white", "shadow-xs");

      // 설명 문구 및 배지 동적 업데이트
      if (mode === "bypass") {
        if (bypassDesc) bypassDesc.innerText = "인증을 우회하여 로컬의 5개년 모의 데이터를 즉시 가져옵니다.";
        if (modeBadge) modeBadge.innerText = "인증 우회";
      } else if (mode === "sandbox") {
        if (bypassDesc) bypassDesc.innerText = "CODEF Sandbox API를 연동하여 모의 인증 및 모의 데이터를 가져옵니다.";
        if (modeBadge) modeBadge.innerText = "모의 (Sandbox)";
      } else if (mode === "development") {
        if (bypassDesc) bypassDesc.innerText = "CODEF Development API를 연동하여 실제 인증 및 나의 실 데이터를 가져옵니다.";
        if (modeBadge) modeBadge.innerText = "실제 (Real Dev)";
      }
    });
  });

  // 아코디언 토글 리스너
  const btnToggleSyncMode = $("btn-toggle-sync-mode");
  const contentAccordion = $("content-sync-mode-accordion");
  const iconChevron = $("icon-sync-mode-chevron");

  if (btnToggleSyncMode && contentAccordion && iconChevron) {
    btnToggleSyncMode.addEventListener("click", () => {
      const isHidden = contentAccordion.classList.contains("hidden");
      if (isHidden) {
        contentAccordion.classList.remove("hidden");
        iconChevron.classList.add("rotate-180");
      } else {
        contentAccordion.classList.add("hidden");
        iconChevron.classList.remove("rotate-180");
      }
    });
  }

  // 모달 - 1차 간편인증 PUSH 발송 요청 버튼
  $("btn-modal-request-auth")?.addEventListener("click", async () => {
    const phoneInput = $("modal-input-phone") as HTMLInputElement;
    const phoneError = $("error-modal-phone");
    const phoneNo = phoneInput ? phoneInput.value : "";

    if (phoneNo.length < 10 || isNaN(Number(phoneNo))) {
      if (phoneInput && phoneError) {
        triggerInputError(phoneInput, phoneError as HTMLElement, "올바른 휴대폰 번호 10~11자리를 입력해주세요.");
      }
      return;
    }

    // 통과했으므로 에러 배너 및 인풋 필드 에러 클리어
    clearInputErrors();
    $("modal-error-banner")?.classList.add("hidden");

    // 필수 약관 동의 체크 검증
    const allAgreed = Array.from($$(".required-check")).every(c => (c as HTMLInputElement).checked);
    if (!allAgreed) {
      showModalError("국민건강보험 의료정보 연동을 위해 모든 필수 약관 수집에 동의해야 합니다.");
      return;
    }

    // PUSH 발송을 위한 버튼 로더화 및 비활성화
    const reqBtn = $("btn-modal-request-auth") as HTMLButtonElement | null;
    if (reqBtn) {
      reqBtn.disabled = true;
      reqBtn.innerText = "간편인증 요청 중...";
    }

    const telecomSelect = $("modal-input-telecom") as HTMLSelectElement;
    const telecom = telecomSelect ? telecomSelect.value : "skt";

    const payload = {
      userName: ctx.getUserName(),
      identity: ctx.getBirthDate(),
      phoneNo,
      telecom,
      loginType2: ctx.getAuthProvider(),
      syncMode: currentSyncMode
    };

    try {
      const res = await fetch("/api/health/nhis-sync-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await res.json();
      
      if (body.result?.code === "CF-03002") {
        ctx.setCodefJti(body.data.jti);
        ctx.setCodefTwoWayInfo(body.data.twoWayInfo || body.data);
        startAuthCountdown(ctx);
      } else {
        throw new Error(body.result?.message || "간편인증 PUSH 전송 중 알 수 없는 오류가 발생했습니다.");
      }
    } catch (err: any) {
      console.error(err);
      showModalError(err.message || "서버 통신 중 장애가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      if (reqBtn) {
        reqBtn.disabled = false;
        reqBtn.innerText = "간편인증";
      }
    }
  });

  // 모달 - 인증 요청 취소
  $("btn-modal-cancel-request")?.addEventListener("click", () => {
    // 3분 카운트다운 타이머를 정지시킵니다.
    stopAuthCountdown();
    // 2단계 대기 화면을 숨기고 1단계 정보 입력 폼을 다시 노출합니다.
    $("modal-step-requesting")?.classList.add("hidden");
    $("modal-step-form")?.classList.remove("hidden");
    // 화면에 남아있을 수 있는 이전 오류 경고 배너들을 깔끔하게 숨김 처리합니다.
    $("modal-error-banner")?.classList.add("hidden");
    $("modal-request-error-box")?.classList.add("hidden");
  });

  // 모달 - 인증 승인완료 후 동기화 실시
  $("btn-modal-confirm-sync")?.addEventListener("click", async () => {
    const confirmBtn = $("btn-modal-confirm-sync") as HTMLButtonElement | null;
    if (confirmBtn) {
      // 통신 중 중복 클릭을 방지하기 위해 버튼을 비활성화하고 로딩 상태를 표시합니다.
      confirmBtn.disabled = true;
      confirmBtn.innerText = "서명 확인 중...";
    }

    // 새로운 확인 시도를 위해 이전 단계의 에러 배너를 숨깁니다.
    $("modal-request-error-box")?.classList.add("hidden");

    try {
      // 1. 로딩창 전환 및 타이머 정지 전에 즉시 2차 확인 API를 쏘아 서명 통과 여부 검인증
      const isSuccess = await verifyNhisSyncSignature(ctx);
      if (isSuccess) {
        // 서명 검인증 성공 시 비로소 타이머 정지 및 API 연동 시각 연출 가동
        stopAuthCountdown();
        executeNhisSync(ctx);
      }
    } catch (err: any) {
      console.error(err);
      // [UX 개선] 서명 미완료 또는 인증 실패 시, 대기화면 및 카운트다운 타이머를 파괴하지 않고 유지합니다.
      // 브라우저 실행 흐름을 멈추는 동기식 alert() 대신, 2단계 대기 화면 내부의 비블로킹 에러 영역을 활용합니다.
      const errorBox = $("modal-request-error-box");
      const errorMsg = $("modal-request-error-msg");
      if (errorBox && errorMsg) {
        errorMsg.innerText = err.message || "아직 스마트폰 간편인증 서명이 확인되지 않았습니다. 카카오톡이나 PASS 앱에서 서명 완료 후 다시 [서명 완료] 버튼을 마저 클릭해 주세요.";
        errorBox.classList.remove("hidden");
      } else {
        // 백업 대안: 최상단 공용 에러 배너에 메시지를 세팅합니다.
        showModalError(err.message || "아직 간편인증 서명이 확인되지 않았습니다. 스마트폰에서 서명 완료 후 다시 [서명 완료] 버튼을 클릭해 주세요.");
      }
    } finally {
      if (confirmBtn) {
        // API 요청 작업이 모두 끝났으므로 버튼 상태를 다시 클릭 가능하도록 활성화 복구합니다.
        confirmBtn.disabled = false;
        confirmBtn.innerText = "서명 완료";
      }
    }
  });
}

// 실제 서명이 성공 완료되었는지 2차 API로 신속 대조만 수행하는 비동기 헬퍼 함수
export async function verifyNhisSyncSignature(ctx: Step3Context): Promise<boolean> {
  const phoneInput = $("modal-input-phone") as HTMLInputElement;
  const phoneNo = phoneInput ? phoneInput.value : "";
  const telecomSelect = $("modal-input-telecom") as HTMLSelectElement;
  const telecom = telecomSelect ? telecomSelect.value : "skt";

  const payload = {
    userName: ctx.getUserName(),
    identity: ctx.getBirthDate(),
    phoneNo,
    telecom,
    loginType2: ctx.getAuthProvider(),
    jti: ctx.getCodefJti(),
    twoWayInfo: ctx.getCodefTwoWayInfo(),
    syncMode: currentSyncMode
  };

  const res = await fetch("/api/health/nhis-sync-confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const body = await res.json();
  if (!res.ok || body.result?.code !== "CF-00000") {
    let errMsg = body.result?.message || "스마트폰에서 간편인증 승인이 확인되지 않았습니다.";
    // [보안/UX 수정] 2차 서명 미완료 상태에서 API 통신 자체만 성공하여 message가 "성공"으로 리턴되는 현상 예외 대응
    if (errMsg === "성공" || errMsg === "성공적으로 조회되었습니다") {
      errMsg = "아직 스마트폰에서 간편인증 서명이 확인되지 않았습니다.";
    }
    throw new Error(errMsg);
  }

  // 성공 완료된 건강정보 레코드를 전역 컨텍스트 상태에 동기화 유입
  ctx.setNhisRecords(body.data.syncedRecords);
  
  // 성공 이력 Supabase 로그 전송
  ctx.logAccessEvent("nhis_sync_success", { recordCount: body.data.syncedRecords ? body.data.syncedRecords.length : 0 });
  return true;
}

// 본인인증 및 동기화 모달을 띄우고 내부 상태들을 리셋하는 오픈 함수
export function openSyncModal() {
  const modal = $("auth-modal");
  if (modal) {
    modal.classList.remove("hidden");
    $("final-analysis-cta-container")?.classList.add("hidden");
    
    // 연동 모드 선택 리셋 (기본값: 'development' 실제 모드)
    currentSyncMode = "development";
    const syncButtons = $$(".sync-mode-btn");
    const bypassDesc = $("bypass-desc");
    const modeBadge = $("sync-mode-badge");

    syncButtons.forEach(btn => {
      const mode = btn.getAttribute("data-mode");
      btn.classList.remove("bg-white", "text-slate-800", "shadow-xs", "bg-[#f37321]", "text-white");
      if (mode === "development") {
        btn.classList.add("bg-[#f37321]", "text-white", "shadow-xs");
        btn.classList.remove("text-slate-500");
      } else {
        btn.classList.add("text-slate-500");
      }
    });

    if (bypassDesc) bypassDesc.innerText = "CODEF Development API를 연동하여 실제 인증 및 나의 실 데이터를 가져옵니다.";
    if (modeBadge) modeBadge.innerText = "실제 (Real Dev)";

    // 아코디언 접힘 리셋
    $("content-sync-mode-accordion")?.classList.add("hidden");
    $("icon-sync-mode-chevron")?.classList.remove("rotate-180");

    // 모달 분기 화면 리셋
    $("modal-step-form")?.classList.remove("hidden");
    $("modal-step-requesting")?.classList.add("hidden");
    $("modal-step-api-loading")?.classList.add("hidden");
    $("modal-error-banner")?.classList.add("hidden");
    $("modal-request-error-box")?.classList.add("hidden"); // [초기화 추가] 2단계 에러 박스 숨김
    
    // 전화번호 입력칸 및 우회안내 숨김
    const phoneInput = $("modal-input-phone") as HTMLInputElement | null;
    if (phoneInput) {
      phoneInput.value = "";
    }
    $("modal-bypass-disclaimer")?.classList.add("hidden");
    
    // 약관 전체동의 해제
    const mainCheck = $("check-term-all") as HTMLInputElement;
    if (mainCheck) mainCheck.checked = false;
    $$(".required-check").forEach(c => (c as HTMLInputElement).checked = false);
  }
}

// 모달 닫기 및 카운트다운을 해제하는 닫기 함수
export function closeSyncModal() {
  stopAuthCountdown();
  $("auth-modal")?.classList.add("hidden");
  $("final-analysis-cta-container")?.classList.remove("hidden");
}

// 3분(180초) 본인인증 PUSH 대기 타이머를 작동시킵니다.
export function startAuthCountdown(ctx: Step3Context) {
  $("modal-step-form")?.classList.add("hidden");
  $("modal-step-requesting")?.classList.remove("hidden");
  $("modal-bypass-disclaimer")?.classList.add("hidden");
  $("modal-request-error-box")?.classList.add("hidden"); // [초기화 추가] 간편인증 1차 발송 시점 에러 클리어

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
      $("modal-request-error-box")?.classList.add("hidden"); // [초기화 추가] 타이머 초과로 되돌아갈 때 에러 클리어
    }
  }, 1000);

  // 🔄 모든 모드에서 3초 간격 자동 폴링 — 인증 완료를 자동 감지하여 다음 단계로 전환
  // (버튼 없이 자동으로 넘어가는 UX)
  authPollInterval = setInterval(async () => {
    if (authTimerInterval) {
      try {
        const isSuccess = await verifyNhisSyncSignature(ctx);
        if (isSuccess) {
          stopAuthCountdown();
          executeNhisSync(ctx);
        }
      } catch (err) {
        // 아직 인증이 완료되지 않은 상태 — 조용히 다음 폴링을 기다립니다.
        console.log("자동 감지 폴링 중... 아직 인증 미완료");
      }
    } else {
      // 타이머가 이미 정지되었으면 폴링도 함께 중단합니다.
      if (authPollInterval) {
        clearInterval(authPollInterval);
        authPollInterval = null;
      }
    }
  }, 3000);
}

// 활성화되어 있는 카운트다운 타이머를 중단(정지)시킵니다.
export function stopAuthCountdown() {
  if (authTimerInterval) {
    clearInterval(authTimerInterval);
    authTimerInterval = null;
  }
  if (authPollInterval) {
    clearInterval(authPollInterval);
    authPollInterval = null;
  }
}

// 화면 상에 분:초(MM:SS) 포맷으로 남은 대기 시간을 표출합니다.
export function updateTimerDisplay() {
  const display = $("modal-timer-text");
  if (!display) return;
  const mins = Math.floor(authTimerSeconds / 60).toString().padStart(2, "0");
  const secs = (authTimerSeconds % 60).toString().padStart(2, "0");
  display.innerText = `${mins}:${secs}`;
}

// 2차인증 획득 후 화면에 가시적인 데이터 가공 연출 및 최종 성공 마무리를 짓는 함수
export function executeNhisSync(ctx: Step3Context) {
  $("modal-step-requesting")?.classList.add("hidden");
  $("modal-step-api-loading")?.classList.remove("hidden");
  $("modal-bypass-disclaimer")?.classList.add("hidden");
  $("final-analysis-cta-container")?.classList.add("hidden");

  const pFill = $("modal-api-bar-fill");
  const pPercent = $("modal-api-bar-percent");
  const pText = $("modal-api-loading-text");

  // 시각적인 API 파이프라인 연출 (진행상황 애니메이션)
  const stages = [
    { text: "🔒 국민건강보험공단 건강검진 내부 가상세션 획득 완료...", percent: 25, delay: 400 },
    { text: "✍️ 모바일 서명 검인증 및 전자증명서 무결성 대조 통과...", percent: 50, delay: 400 },
    { text: "📥 최근 5개년치 15대 만성 대사증후군 건강 인덱스 수집 완료...", percent: 75, delay: 400 },
    { text: "📊 요합 지표 매핑 최적화 설계 및 클라이언트 암호화 로딩 성공...", percent: 95, delay: 400 }
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
      // 이미 2차 검증이 완수되었으므로 즉각 성공 상태로 100% 매핑
      if (pText) pText.innerText = "🎉 국민건강보험검진 지표 실시간 로딩 완벽 성공!";
      if (pFill) pFill.style.width = "100%";
      if (pPercent) pPercent.innerText = "100%";

      setTimeout(() => {
        closeSyncModal();
        ctx.setIsStep1Completed(true);
        ctx.updateAuthProgress();

        // [UX 개선] "건강검진 DATA" 타이틀 영역으로 즉시 부드럽게 스크롤 스위칭
        const scrollTarget = $("scroll-target-nhis-data");
        if (scrollTarget) {
          scrollTarget.scrollIntoView({ behavior: "smooth", block: "start" });
          
          // 아래로 내릴 수 있게 바운싱 시각 유도 애니메이션을 일시적으로 추가 (3회 바운싱 후 정지)
          const parentContainer = $("codef-summary-section");
          if (parentContainer) {
            parentContainer.classList.add("animate-bounce-subtle");
            setTimeout(() => {
              parentContainer.classList.remove("animate-bounce-subtle");
            }, 2000);
          }
        } else {
          // 대체 백업 포커스
          const ctaContainer = $("final-analysis-cta-container");
          if (ctaContainer) {
            ctaContainer.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }
      }, 700);
    }
  }
  nextStage();
}
