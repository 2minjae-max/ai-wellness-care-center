import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import puppeteer from "puppeteer";
import axios from "axios";
import { GoogleGenAI } from "@google/genai";
import { PDFDocument } from "pdf-lib";

// .env 파일의 환경변수 로드
dotenv.config();

const logPrefix = "[Monthly-Knowledge-Batch]";

// 한국 시간 기준의 로그 시간 포맷팅 함수
function getLogTime(): string {
  return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

// 지정된 밀리초(ms) 만큼 대기하는 비동기 유틸리티 함수
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// PDF 파일을 지정된 경로로 스트림 다운로드하는 유틸리티 함수
async function downloadPdf(url: string, destPath: string): Promise<void> {
  const writer = fs.createWriteStream(destPath);
  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
    timeout: 30000
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

/**
 * 대용량 약관 PDF에서 핵심이 되는 페이지(목차 및 주요 특별약관부)만 슬라이싱하여 
 * Gemini API로 전달할 경량화된 임시 PDF를 생성합니다.
 */
async function sliceTermsPdf(srcPath: string, destPath: string): Promise<void> {
  const existingPdfBytes = fs.readFileSync(srcPath);
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const totalPages = pdfDoc.getPageCount();
  
  // 새 PDF 문서 생성
  const newPdfDoc = await PDFDocument.create();
  
  // 추출할 핵심 페이지 번호 목록 수집 (1-indexed 기준)
  const targetPages: number[] = [];
  
  // 1. 앞부분 핵심 요약 및 목차 구간 (1 ~ 30페이지)
  const introLimit = Math.min(30, totalPages);
  for (let i = 1; i <= introLimit; i++) {
    targetPages.push(i);
  }
  
  // 2. 만약 전체 페이지가 300페이지를 넘는 대용량 약관이라면, 
  // 보통약관(공통)을 건너뛰고 특별약관 상세가 들어있는 뒷부분(예: 뒤에서 150페이지 전부터 끝까지)을 추가 추출
  if (totalPages > 300) {
    const startOffset = Math.max(31, totalPages - 150);
    for (let i = startOffset; i <= totalPages; i++) {
      targetPages.push(i);
    }
  } else {
    // 300페이지 이하인 경우 나머지 전체 추가
    for (let i = 31; i <= totalPages; i++) {
      targetPages.push(i);
    }
  }
  
  // 중복 제거 및 정렬
  const uniquePages = Array.from(new Set(targetPages)).sort((a, b) => a - b);
  
  // 페이지 복사 및 새 PDF에 추가 (0-indexed 변환 필요)
  const copiedPages = await newPdfDoc.copyPages(
    pdfDoc, 
    uniquePages.map(p => p - 1)
  );
  copiedPages.forEach(page => newPdfDoc.addPage(page));
  
  const newPdfBytes = await newPdfDoc.save();
  fs.writeFileSync(destPath, newPdfBytes);
}

/**
 * 프로미스 실행에 타임아웃 제한을 부여하여 무한 대기를 방지합니다.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs = 30000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(`API 호출 타임아웃 (${timeoutMs / 1000}초 초과)`)), timeoutMs)
    )
  ]);
}

/**
 * API 호출 시 Rate Limit(429) 또는 일시적인 서버 불안정(503) 오류가 발생할 경우,
 * 일정 시간 대기한 후 자동으로 재시도하는 헬퍼 함수입니다.
 */
async function runWithRetry<T>(fn: () => Promise<T>, retries = 5, initialDelay = 5000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const isRateLimit = error.status === 429 || error.message?.includes("429") || error.message?.includes("quota") || error.message?.includes("limit");
    const isServiceUnavailable = error.status === 503 || error.message?.includes("503") || error.message?.includes("UNAVAILABLE");

    if (retries > 0 && (isRateLimit || isServiceUnavailable)) {
      let waitTime = (6 - retries) * initialDelay;

      if (isRateLimit) {
        const secondsMatch = error.message?.match(/Please retry in ([\d\.]+)s/);
        if (secondsMatch && secondsMatch[1]) {
          const seconds = Math.ceil(parseFloat(secondsMatch[1]));
          waitTime = (seconds + 2) * 1000;
          console.warn(`      [Warning] Rate Limit 감지. API 권장 대기시간 파싱 성공: ${seconds}초 (+2초 버퍼)`);
        } else {
          waitTime = 62000;
          console.warn(`      [Warning] Rate Limit 감지. 권장시간 파싱 실패로 기본 62초 대기합니다.`);
        }
      } else {
        waitTime = Math.max(waitTime, 15000);
        console.warn(`      [Warning] API 일시적 오류(503 등) 감지. ${waitTime / 1000}초 대기합니다.`);
      }

      console.warn(`      [Retry] ${waitTime / 1000}초 후 재시도합니다... (남은 재시도 횟수: ${retries}회)`);
      await delay(waitTime);
      return runWithRetry(fn, retries - 1, initialDelay);
    }
    throw error;
  }
}

/**
 * 개별 상품에 대해 PDF를 다운로드 및 분석하고 지식 위키 JSON에 실시간 저장합니다.
 */
async function analyzeAndSaveProduct(
  productName: string,
  category: string,
  activePeriodText: string,
  pdfUrls: { summary: string; method: string; terms: string },
  cachedProduct: any,
  useRealGemini: boolean,
  aiClient: any,
  tempDir: string,
  wikiProducts: any,
  wikiPath: string,
  processedCount: number,
  targetPortal: string
): Promise<{ success: boolean; hasFatalApiError: boolean }> {
  let coreBenefits: string[] = cachedProduct?.coreBenefits || [];
  let premiumRange = cachedProduct?.premiumRange || "PDF 분석 후 업데이트 예정";
  let recommendationFactor = cachedProduct?.recommendationFactor || "PDF 분석 후 업데이트 예정";
  let targetAge = cachedProduct?.targetAge || { minAge: null, maxAge: null };
  let renewalType = cachedProduct?.renewalType || "PDF 분석 후 업데이트 예정";
  let examinationType = cachedProduct?.examinationType || "PDF 분석 후 업데이트 예정";
  let simsaCriteria = cachedProduct?.simsaCriteria || "PDF 분석 후 업데이트 예정";
  let hasPremiumWaiver = cachedProduct?.hasPremiumWaiver ?? null;
  let premiumWaiverCriteria: string[] = cachedProduct?.premiumWaiverCriteria || [];
  let underwritingNotes: string[] = cachedProduct?.underwritingNotes || [];
  let coverageLimits = cachedProduct?.coverageLimits || {
    generalCancer: "PDF 분석 후 업데이트 예정",
    similarCancer: "PDF 분석 후 업데이트 예정",
    cerebrovascular: "PDF 분석 후 업데이트 예정",
    ischemicHeart: "PDF 분석 후 업데이트 예정",
    caregiverExpenses: "PDF 분석 후 업데이트 예정"
  };
  let productMetadata = cachedProduct?.productMetadata || null;
  let underwritingRules = cachedProduct?.underwritingRules || null;
  let coverages = cachedProduct?.coverages || [];

  let apiSuccess = true;
  let hasFatalApiError = false;

  if (useRealGemini) {
    const uploadedFiles: any[] = [];
    const tempFiles: string[] = [];
    
    try {
      const pdfKeys: ("summary" | "method" | "terms")[] = ["summary", "method", "terms"];
      for (const key of pdfKeys) {
        const url = pdfUrls[key];
        if (url) {
          const tempPdfPath = path.join(tempDir, `temp_${key}_${Date.now()}.pdf`);
          tempFiles.push(tempPdfPath);
          
          console.log(`      [Downloader] ${key} PDF 다운로드 중... (${url})`);
          await downloadPdf(url, tempPdfPath);
          await delay(1000);
          
          let uploadFilePath = tempPdfPath;
          if (key === "terms") {
            try {
              const slicedPdfPath = path.join(tempDir, `temp_sliced_${key}_${Date.now()}.pdf`);
              console.log(`      [Preprocessor] 약관 PDF 슬라이싱 전처리 중...`);
              await sliceTermsPdf(tempPdfPath, slicedPdfPath);
              tempFiles.push(slicedPdfPath);
              uploadFilePath = slicedPdfPath;
              console.log(`      [Preprocessor] 약관 PDF 슬라이싱 성공.`);
            } catch (sliceErr: any) {
              console.warn(`      [Preprocessor Warning] 약관 PDF 슬라이싱 중 오류 발생. 원본 PDF로 진행합니다. 에러: ${sliceErr.message}`);
            }
          }

          console.log(`      [Gemini API] ${key} PDF 파일 업로드 요청 중...`);
          const uploadResult = await runWithRetry<any>(() => aiClient.files.upload({
            file: uploadFilePath,
            mimeType: "application/pdf"
          }));
          uploadedFiles.push(uploadResult);
          await delay(1000);
        }
      }

      if (uploadedFiles.length === 0) {
        throw new Error("분석할 유효한 PDF 파일이 없습니다.");
      }

      // 파일들이 API 서버 내에서 완전히 처리될 수 있도록 대기
      await delay(10000);

      console.log(`      [Gemini API] 3종 PDF(요약서, 사업방법서, 약관) 융합 분석 및 요약 요청 중...`);
      const fileParts = uploadedFiles.map(file => ({
        fileData: { fileUri: file.uri, mimeType: file.mimeType }
      }));

      const modelCandidates = [
        "gemini-3.5-flash",
        "gemini-3.1-flash-lite",
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-3-flash"
      ];

      let response: any = null;
      let currentModelName = "";

      for (const modelName of modelCandidates) {
        try {
          console.log(`      [Gemini API] 모델 시도 중: ${modelName}`);
          response = await runWithRetry<any>(() => withTimeout(aiClient.models.generateContent({
            model: modelName,
            contents: [
              {
                role: "user",
                parts: [
                  ...fileParts,
                  {
                    text: `당신은 한화손해보험의 전문 언더라이터이자 계리사입니다.
제공된 PDF 문서들(상품요약서, 사업방법서, 약관확인서)은 한화손해보험의 "${productName}" 상품에 관한 공식 자료입니다.
이 세 문서를 종합적으로 분석하고 상호 대조하여 신뢰할 수 있는 정보를 추출하고, 아래 JSON 스키마 형식으로 응답해 주세요:

{
  "coreBenefits": ["상품의 핵심 보장 혜택 3~4개 (각각 한국어 1줄 문장으로 짧고 명확하게 요약)"],
  "premiumRange": "대략적인 월 평균 보험료 가격대 (예: '3만원 수준', '4~5만원대' 등 한 줄 텍스트)",
  "recommendationFactor": "이 상품을 어떤 위험군이나 사용자층에게 추천하는지에 대한 가입추천요인 (한 줄 텍스트)",
  "targetAge": {
    "minAge": 15,
    "maxAge": 90
  },
  "renewalType": "갱신형 또는 비갱신형 중 해당하는 값을 한글로 작성 (예: '갱신형', '비갱신형', '혼합형')",
  "examinationType": "일반고지(건강체) 또는 간편고지(유병자) 중 해당하는 값을 한글로 작성",
  "simsaCriteria": "간편고지 상품인 경우 '3.1.1', '3.2.5', '3.N.5' 등 상품 고지유형을 추출. 일반상품이면 '없음'",
  "hasPremiumWaiver": true,
  "premiumWaiverCriteria": ["납입면제를 유발하는 사유들을 구체적인 한글 목록으로 기재 (예: 암, 뇌졸중, 급성심근경색증 등 진단 시). 납입면제 조항이 없다면 빈 배열 []로 작성"],
  "underwritingNotes": ["직업 급수 제한, 기왕증 거절 항목 등 가입 인수 심사에 있어 매우 결정적인 제한 요건이나 주요 인수 제한 사항을 요약서나 방법서에서 발췌하여 짧은 문장 2~3개로 작성"],
  "coverageLimits": {
    "generalCancer": "암진단비(유사암 제외) 최대 가입 한도 금액. 연령대별 차등이 있다면 상세히 적어주세요. (예: '50세 이하 최대 5,000만원 / 60세 이하 최대 2,000만원'. 보장 부재 시 '없음')",
    "similarCancer": "유사암진단비 최대 가입 한도 금액 (예: '최대 1,000만원')",
    "cerebrovascular": "뇌혈관질환진단비 최대 가입 한도 금액 (예: '최대 2,000만원')",
    "ischemicHeart": "허혈성심장질환진단비 최대 가입 한도 금액 (예: '최대 2,000만원')",
    "caregiverExpenses": "간병인사용(또는 지원) 일당 최대 한도 (예: '일당 최대 15만원', 없으면 '없음')"
  },
  "productMetadata": {
    "targetGender": "가입 가능한 성별 (예: 'M/F', 'F' 등)",
    "minAge": 가입가능 최소연령 (정수 또는 null),
    "maxAge": 가입가능 최대연령 (정수 또는 null),
    "isRenewal": 갱신형 상품이면 true, 비갱신형이면 false,
    "isSimpleScreening": 간편고지(유병자) 상품이면 true, 일반고지면 false,
    "premiumIndexKrw": 기준 보험료 정수 값 (예: premiumRange의 대략적 대표값, 예: 30000)
  },
  "underwritingRules": {
    "eligibility": "가입 자격 및 인수 조건 요약 (한글 1문장)",
    "waiverOfPremium": ["납입면제 대상 조건들을 구체적으로 나열한 한글 문자열 배열"]
  },
  "coverages": [
    {
      "coverageId": "담보 고유 ID (예: 'cov-cancer-general', 'cov-cancer-similar', 'cov-cerebrovascular', 'cov-ischemic-heart', 'cov-caregiver-expense' 등)",
      "name": "담보 한글 명칭 (예: '암(유사암제외)진단비', '뇌혈관질환진단비' 등)",
      "targetDiseases": ["해당 담보가 보장하는 대표적인 KCD 질병코드 대역 배열 (예: ['C00-C97', 'D05'] 또는 ['I60-I69'] 등)"],
      "maxLimitByAge": {
        "0-40": 50000000,
        "41-60": 30000000,
        "61-90": 10000000
      },
      "deductibleAndReduction": "면책기간 및 감액 규정 (예: '90일 면책기간 적용, 1년 미만 50% 감액')"
    }
  ]
}

주의사항:
1. 문서를 크로스 체크하여 사실에 입각한 정량적 수치(가입연령, 한도액 등)만 적어주세요.
2. 간편고지 심사 조건(예: 3.2.5, 3.5.5 등)을 사업방법서나 요약서에서 명확히 찾아 적어주십시오.
3. 가입 한도(coverageLimits) 및 coverages의 수치들을 '확인불가', '별도 문의'와 같은 문구로 회피하지 마십시오. 상품요약서의 '보험가입금액' 또는 사업방법서의 '인수한도액 및 가입한도' 예시 테이블에서 주계약이나 대표 특약의 가입한도 최대치를 찾아 반드시 구체적인 금액 수치(정수)로 기재해야 합니다.
4. 응답은 마크다운 코드블록이나 추가 텍스트 없이 순수한 JSON 내용만 제공해야 합니다.`
                  }
                ]
              }
            ]
          }), 60000), 1);
          currentModelName = modelName;
          console.log(`      [Gemini API] 모델 호출 성공: ${modelName}`);
          break;
        } catch (modelErr: any) {
          console.warn(`      [Gemini API] 모델 ${modelName} 호출 실패: ${modelErr.message || modelErr}`);
          if (modelName === modelCandidates[modelCandidates.length - 1]) {
            throw modelErr;
          }
          console.log(`      [Gemini API] 다음 모델로 폴백 시도합니다...`);
          await delay(2000);
        }
      }
      await delay(10000);

      console.log(`      [Gemini API] 업로드된 임시 파일 삭제 중...`);
      for (const file of uploadedFiles) {
        await runWithRetry<any>(() => aiClient.files.delete({ name: file.name }));
      }

      const responseText = response.text || "";
      const cleanJson = responseText.replace(/```json|```/g, "").trim();
      const analysis = JSON.parse(cleanJson);

      if (analysis) {
        coreBenefits = analysis.coreBenefits || [];
        premiumRange = analysis.premiumRange || premiumRange;
        recommendationFactor = analysis.recommendationFactor || recommendationFactor;
        targetAge = analysis.targetAge || targetAge;
        renewalType = analysis.renewalType || renewalType;
        examinationType = analysis.examinationType || examinationType;
        simsaCriteria = analysis.simsaCriteria || simsaCriteria;
        hasPremiumWaiver = analysis.hasPremiumWaiver ?? hasPremiumWaiver;
        premiumWaiverCriteria = analysis.premiumWaiverCriteria || premiumWaiverCriteria;
        underwritingNotes = analysis.underwritingNotes || underwritingNotes;
        coverageLimits = analysis.coverageLimits || coverageLimits;
        productMetadata = analysis.productMetadata || productMetadata;
        underwritingRules = analysis.underwritingRules || underwritingRules;
        coverages = analysis.coverages || coverages;
        console.log(`      [Gemini API] 3종 PDF 분석 요약 성공 완료!`);
      }

      await delay(10000);
    } catch (err: any) {
      console.error(`      [Gemini Error] '${productName}' 3종 PDF 분석 도중 오류가 발생했습니다:`, err.message || err);
      apiSuccess = false;
      hasFatalApiError = true;

      coreBenefits = ["API 오류로 인해 3종 PDF 요약이 누락되었습니다."];
      premiumRange = "분석 실패 (오류 발생)";
      recommendationFactor = "3종 PDF 파일 분석 도중 할당량 초과 또는 네트워크 오류가 발생하여 요약을 생략합니다.";
      targetAge = { minAge: null, maxAge: null };
      renewalType = "확인 불가";
      examinationType = "확인 불가";
      simsaCriteria = "확인 불가";
      hasPremiumWaiver = false;
      premiumWaiverCriteria = ["API 오류로 인해 확인 불가"];
      underwritingNotes = ["API 오류로 인해 확인 불가"];
      coverageLimits = {
        generalCancer: "확인 불가",
        similarCancer: "확인 불가",
        cerebrovascular: "확인 불가",
        ischemicHeart: "확인 불가",
        caregiverExpenses: "확인 불가"
      };
      productMetadata = {
        targetGender: "M/F",
        minAge: null,
        maxAge: null,
        isRenewal: false,
        isSimpleScreening: false,
        premiumIndexKrw: 30000
      };
      underwritingRules = {
        eligibility: "API 오류로 확인 불가",
        waiverOfPremium: []
      };
      coverages = [];

      for (const file of uploadedFiles) {
        try {
          await aiClient.files.delete({ name: file.name });
        } catch (e) {}
      }
    } finally {
      for (const tempPath of tempFiles) {
        if (fs.existsSync(tempPath)) {
          try { fs.unlinkSync(tempPath); } catch (e) {}
        }
      }
    }
  } else {
    apiSuccess = false;
  }

  // 구조화 객체 생성 및 목록 매핑
  wikiProducts[productName] = {
    fullName: productName,
    category: category,
    status: "판매중",
    salesPeriod: activePeriodText,
    productUrl: targetPortal,
    pdfUrls: pdfUrls,
    coreBenefits: coreBenefits,
    premiumRange: premiumRange,
    recommendationFactor: recommendationFactor,
    targetAge: targetAge,
    renewalType: renewalType,
    examinationType: examinationType,
    simsaCriteria: simsaCriteria,
    hasPremiumWaiver: hasPremiumWaiver,
    premiumWaiverCriteria: premiumWaiverCriteria,
    underwritingNotes: underwritingNotes,
    coverageLimits: coverageLimits,
    productMetadata: productMetadata,
    underwritingRules: underwritingRules,
    coverages: coverages,
    analyzedAt: new Date().toISOString()
  };

  // 실시간 저장 보장
  const wikiData = {
    generatedAt: new Date().toISOString(),
    batchLog: `Success - Sliced and processed up to ${processedCount} Hanwha Insurance active products.`,
    products: wikiProducts
  };
  fs.writeFileSync(wikiPath, JSON.stringify(wikiData, null, 2), "utf8");
  console.log(`      [Save Completed] '${productName}' 요약 결과 지식 위키 JSON 실시간 저장 완료.`);

  return { success: apiSuccess, hasFatalApiError };
}

/**
 * 통합형 3단계 지식 구축 배치 프로세스 실행 함수
 */
async function runBatch() {
  console.log("=====================================================================");
  console.log(`🚀 ${getLogTime()} : 한화손보 공시실 월간 정기 지식 갱신 배치 시동`);
  console.log("=====================================================================");

  const wikiPath = path.join(process.cwd(), "src", "knowledge_wiki.json");
  let existingWiki: any = null;
  if (fs.existsSync(wikiPath)) {
    try {
      existingWiki = JSON.parse(fs.readFileSync(wikiPath, "utf8"));
      console.log(`${logPrefix} 기존 지식 위키 캐시 로드 성공. (등록 상품 수: ${Object.keys(existingWiki.products || {}).length}개)`);
    } catch (e) {
      console.log(`${logPrefix} 기존 지식 위키 파일 분석 실패 또는 미존재. 신규 구축을 준비합니다.`);
    }
  }

  const wikiProducts: any = existingWiki?.products ? { ...existingWiki.products } : {};

  const apiKey = process.env.GEMINI_API_KEY;
  let useRealGemini = false;
  let aiClient: any = null;

  if (apiKey && apiKey !== "MY_GEMINI_API_KEY" && apiKey.trim() !== "") {
    useRealGemini = true;
    aiClient = new GoogleGenAI({ apiKey });
    console.log(`${logPrefix} Google GenAI API 클라이언트 활성화 완료. PDF 자동 파싱 세션을 준행합니다.`);
  } else {
    console.log(`${logPrefix} [Caution] GEMINI_API_KEY 미설정 상태입니다. 신규 상품 분석 요약은 건너뜁니다.`);
  }

  const tempDir = path.join(process.cwd(), "scratch");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const forceUpdate = process.env.FORCE_UPDATE === "true";
  const bypassCrawl = process.env.BYPASS_CRAWL !== "false"; // 기본적으로 true (브라우저 우회)

  // --------------------------------------------------
  // [Bypass Mode] 브라우저 없이 기존 캐시된 PDF URL로 즉시 처리
  // --------------------------------------------------
  if (bypassCrawl && existingWiki?.products) {
    console.log(`${logPrefix} [Bypass Mode] 브라우저(Puppeteer) 기동 없이 기존 위키 캐시의 pdfUrls 정보를 활용하여 요약 분석을 수행합니다.`);
    const productNames = Object.keys(existingWiki.products);
    console.log(`${logPrefix} [Bypass Mode] 분석 대상 상품 수: ${productNames.length}개`);

    let processedCount = 0;
    for (let i = 0; i < productNames.length; i++) {
      const productName = productNames[i];
      const cachedProduct = existingWiki.products[productName];
      processedCount++;

      console.log(`\n   [${processedCount}번째 상품] "${productName}" 처리 중... (Bypass)`);

      const todayStr = new Date().toISOString().split("T")[0];
      const isAnalyzedToday = cachedProduct && cachedProduct.analyzedAt && cachedProduct.analyzedAt.startsWith(todayStr);

      if (
        !forceUpdate &&
        isAnalyzedToday &&
        cachedProduct.coreBenefits &&
        cachedProduct.coreBenefits.length > 0 &&
        cachedProduct.premiumRange !== "PDF 분석 후 업데이트 예정" &&
        cachedProduct.premiumRange !== "분석 실패 (무료 한도 초과)" && 
        cachedProduct.targetAge &&
        cachedProduct.coverageLimits &&
        cachedProduct.coverages &&
        cachedProduct.coverages.length > 0
      ) {
        console.log(`      [Cache Hit] 오늘 이미 초정밀 분석이 완료된 캐시 데이터가 존재합니다. 건너뜁니다.`);
        continue;
      }

      console.log(`      [Analysis Required] 신규 분석이 필요합니다. PDF 요약 다운로드 및 정밀 분석을 개시합니다.`);
      const pdfUrls = cachedProduct.pdfUrls || { summary: "", method: "", terms: "" };
      const activePeriodText = cachedProduct.salesPeriod || "확인 불가";
      const category = cachedProduct.category || "상해/질병";
      const targetPortal = cachedProduct.productUrl || "https://www.hwgeneralins.com/notice/ir/product-ing01.do";

      const { success, hasFatalApiError } = await analyzeAndSaveProduct(
        productName,
        category,
        activePeriodText,
        pdfUrls,
        cachedProduct,
        useRealGemini,
        aiClient,
        tempDir,
        wikiProducts,
        wikiPath,
        processedCount,
        targetPortal
      );

      if (!success && hasFatalApiError) {
        console.warn(`\n[Warning] '${productName}' 상품 분석 중 Gemini API 오류가 발생했습니다. 건너뛰고 다음 분석을 시도합니다.`);
      }
    }

    console.log("=====================================================================");
    console.log(`${logPrefix} [Bypass Mode] 지식 위키 구조화 JSON 저장 절차 최종 완료!`);
    console.log(`${logPrefix} File Path: ${wikiPath}`);
    console.log(`${logPrefix} 수집 및 분석 완료된 최종 상품 노드 개수: ${Object.keys(wikiProducts).length}개`);
    console.log("=====================================================================");
    console.log(`🎉 [Bypass Mode] 정기 배치 지식 위키 구축 작업이 완벽하게 완료되었습니다!`);
    console.log("=====================================================================");
    return;
  }

  // --------------------------------------------------
  // [Normal Mode] Puppeteer 브라우저를 띄워 실시간 크롤링 수행
  // --------------------------------------------------
  const targetPortal = "https://www.hwgeneralins.com/notice/ir/product-ing01.do";
  const headless = process.env.CRAWL_HEADLESS !== "false";
  console.log(`${logPrefix} 브라우저 모드: ${headless ? "Headless (창 비노출)" : "Non-Headless (창 노출)"}`);

  const browser = await puppeteer.launch({
    headless: headless,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--window-size=1280,1500"
    ]
  });

  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");
  await page.setViewport({ width: 1280, height: 1500 });

  let processedCount = 0;
  let hasFatalApiError = false;

  try {
    console.log(`${logPrefix} 상품공시 페이지 접속 시도: ${targetPortal}`);
    let gotoSuccess = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.goto(targetPortal, {
          waitUntil: "domcontentloaded",
          timeout: 60000
        });
        gotoSuccess = true;
        break;
      } catch (gotoErr: any) {
        console.warn(`${logPrefix} [Warning] ${attempt}회차 페이지 접속 시도 타임아웃/오류 발생. 5초 후 재시도합니다... (에러: ${gotoErr.message || gotoErr})`);
        await delay(5000);
      }
    }
    if (!gotoSuccess) {
      throw new Error(`상품공시 페이지 접속 실패: 3회 재시도 모두 타임아웃되었습니다.`);
    }

    await delay(8000);

    const categories = ["상해/질병"];

    for (const category of categories) {
      console.log(`\n${logPrefix} --------------------------------------------------`);
      console.log(`${logPrefix} [Category] '${category}' 카테고리 탐색 및 제어 시작`);
      console.log(`${logPrefix} --------------------------------------------------`);

      const categorySelector = `#uiFormField1 a[title*="${category}"]`;
      const categoryButton = await page.$(categorySelector);

      if (!categoryButton) {
        console.warn(`${logPrefix} [Error] '${category}' 카테고리 버튼을 찾을 수 없습니다. 건너뜁니다.`);
        continue;
      }

      await page.evaluate((el) => el.scrollIntoView({ block: "center" }), categoryButton);
      await page.evaluate((el) => (el as HTMLElement).click(), categoryButton);
      console.log(`${logPrefix} [Click] '${category}' 카테고리 클릭 완료`);
      await delay(2000);

      const productLinkSelector = "#uiFormField2 a";
      const productElements = await page.$$(productLinkSelector);

      const productNames: string[] = [];
      for (const el of productElements) {
        const text = await page.evaluate(el => el.textContent?.trim(), el);
        if (text) productNames.push(text);
      }

      console.log(`${logPrefix} [Products] '${category}' 하위 상품 목록(${productNames.length}개) 발견`);

      for (let i = 0; i < productNames.length; i++) {
        const productName = productNames[i];
        processedCount++;
        hasFatalApiError = false;

        console.log(`\n   [${processedCount}번째 상품] "${productName}" 처리 중...`);

        const cachedProduct = existingWiki?.products?.[productName];
        const todayStr = new Date().toISOString().split("T")[0];
        const isAnalyzedToday = cachedProduct && cachedProduct.analyzedAt && cachedProduct.analyzedAt.startsWith(todayStr);

        if (
          !forceUpdate &&
          isAnalyzedToday &&
          cachedProduct.coreBenefits &&
          cachedProduct.coreBenefits.length > 0 &&
          cachedProduct.premiumRange !== "PDF 분석 후 업데이트 예정" &&
          cachedProduct.premiumRange !== "분석 실패 (무료 한도 초과)" && 
          cachedProduct.targetAge &&
          cachedProduct.coverageLimits &&
          cachedProduct.coverages &&
          cachedProduct.coverages.length > 0
        ) {
          console.log(`      [Cache Hit] 오늘 이미 초정밀 분석이 완료된 캐시 데이터가 존재합니다. 건너뜁니다.`);
          continue;
        }

        console.log(`      [Analysis Required] 신규 분석이 필요합니다. 공시실 상세 정보 조회를 시작합니다.`);

        const targetProductSelector = `#uiFormField2 a[title*="${productName}"]`;
        const targetProductButton = await page.$(targetProductSelector);

        if (!targetProductButton) {
          console.warn(`      [Error] 상품 버튼을 찾을 수 없습니다: ${productName}`);
          continue;
        }

        await page.evaluate((el) => el.scrollIntoView({ block: "center" }), targetProductButton);
        await page.evaluate((el) => (el as HTMLElement).click(), targetProductButton);
        await delay(2500);

        const activePeriodText = await page.evaluate(() => {
          const selectedPeriod = document.querySelector("#uiFormField3 a.selected");
          return selectedPeriod?.textContent?.trim() || "";
        });

        if (!activePeriodText) {
          console.warn(`      [Skip] 현재 활성화된 판매 기간 정보를 찾을 수 없습니다.`);
          continue;
        }

        const pdfUrls = await page.evaluate(() => {
          const urls = { summary: "", method: "", terms: "" };
          const host = "https://www.hwgeneralins.com";

          const summaryBtn = document.querySelector('#uiFormField4 a[title*="상품요약"]');
          const methodBtn = document.querySelector('#uiFormField4 a[title*="사업방법"]');
          const termsBtn = document.querySelector('#uiFormField4 a[title*="약관확인"]');

          if (summaryBtn) {
            const href = summaryBtn.getAttribute("href");
            if (href) urls.summary = href.startsWith("http") ? href : host + href;
          }
          if (methodBtn) {
            const href = methodBtn.getAttribute("href");
            if (href) urls.method = href.startsWith("http") ? href : host + href;
          }
          if (termsBtn) {
            const href = termsBtn.getAttribute("href");
            if (href) urls.terms = href.startsWith("http") ? href : host + href;
          }

          return urls;
        });

        console.log(`      -> 판매기간: ${activePeriodText}`);
        console.log(`      -> 요약서 URL: ${pdfUrls.summary || "없음"}`);

        const { success, hasFatalApiError: apiErr } = await analyzeAndSaveProduct(
          productName,
          category,
          activePeriodText,
          pdfUrls,
          cachedProduct,
          useRealGemini,
          aiClient,
          tempDir,
          wikiProducts,
          wikiPath,
          processedCount,
          targetPortal
        );

        if (!success && apiErr) {
          console.warn(`\n[Warning] '${productName}' 상품 분석 중 Gemini API 오류가 발생했습니다. 건너뛰고 다음 상품 분석을 계속 시도합니다.`);
          continue;
        }
      }

      if (hasFatalApiError) {
        break;
      }
    }

  } catch (error) {
    console.error(`${logPrefix} [Fatal Batch Error] 배치 처리 도중 심각한 오류가 발생했습니다:`, error);
  } finally {
    await browser.close();
    console.log(`${logPrefix} Puppeteer 브라우저 세션을 안전하게 닫고 자원을 해제했습니다.`);
  }

  console.log("=====================================================================");
  console.log(`${logPrefix} 지식 위키 구조화 JSON 저장 절차 최종 완료!`);
  console.log(`${logPrefix} File Path: ${wikiPath}`);
  console.log(`${logPrefix} 수집 및 분석 완료된 최종 상품 노드 개수: ${Object.keys(wikiProducts).length}개`);
  console.log("=====================================================================");
  console.log(`🎉 ${getLogTime()} : 정기 배치 지식 위키 구축 작업이 완벽하게 완료되었습니다!`);
  console.log("=====================================================================");
}

runBatch().catch(err => {
  console.error(`${logPrefix} [CRITICAL ERROR] Batch Execution Failed:`, err);
});
