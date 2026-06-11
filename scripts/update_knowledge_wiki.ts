/**
 * 한화손해보험 상품공시실 월간 배치 크롤러 및 지식 위키 빌더
 * 
 * 실행 시각: 매월 1일 새벽 03시 00분 (Cron Job)
 * 역할:
 * 1. Puppeteer(헤드리스 브라우저)를 사용하여 한화손보 상품공시실 동적 페이지 제어 및 크롤링.
 * 2. 01 상품군 -> '장기보험'의 '상해/질병', '인터넷', '장기간병' 카테고리 순회 클릭.
 * 3. 02 상품명 -> 로드된 상품 목록을 개별 클릭하여 상세 로딩 유도 (03 판매기간, 04 확인 영역 자동 연쇄 로드).
 * 4. 03 판매기간 -> 이미 자동으로 활성화된 판매 기간('selected' 클래스가 들어간 요소)의 텍스트 추출.
 * 5. 04 확인 -> '#uiFormField4' 영역에서 상품요약서, 사업방법서, 약관 PDF 다운로드 링크 3종 추출 및 절대경로화.
 * 6. 수집된 상품요약서 PDF를 임시 다운로드 후, Google GenAI SDK(Gemini 2.5)를 사용해 PDF 자동 분석 및 핵심 데이터 요약.
 * 7. 비용 및 API Rate Limit 최소화를 위한 데이터 캐싱 메커니즘 제공 (기존 분석 데이터 우선 재사용).
 * 8. 'src/knowledge_wiki.json' 파일 갱신 및 저장.
 */

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
 * [교육용 한글 주석]
 * pdf-lib 라이브러리를 사용해 원본 PDF 파일에서 필요한 앞부분의 N페이지만 잘라내어 새 PDF로 저장합니다.
 * 이 작업을 통해 무료 Gemini API의 단일 파일 처리 토큰 한도(1,000,000 TPM)를 초과하는 문제를
 * 근본적으로 차단하고 API 전송 성능도 대폭 개선합니다.
 */
async function slicePdf(srcPath: string, destPath: string, maxPages = 8): Promise<void> {
  const pdfBytes = fs.readFileSync(srcPath);
  const srcDoc = await PDFDocument.load(pdfBytes);
  const destDoc = await PDFDocument.create();

  const pageCount = srcDoc.getPageCount();
  const pagesToCopy = Math.min(pageCount, maxPages);

  for (let i = 0; i < pagesToCopy; i++) {
    const [copiedPage] = await destDoc.copyPages(srcDoc, [i]);
    destDoc.addPage(copiedPage);
  }

  const slicedBytes = await destDoc.save();
  fs.writeFileSync(destPath, slicedBytes);
}

/**
 * API 호출 시 Rate Limit(429) 또는 일시적인 서버 불안정(503) 오류가 발생할 경우,
 * 일정 시간 대기한 후 자동으로 재시도하는 헬퍼 함수입니다.
 */
async function runWithRetry<T>(fn: () => Promise<T>, retries = 5, initialDelay = 5000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    // 429 (Rate Limit) 또는 503 (Unavailable) 상태이거나 에러 메시지에 quota 관련 단어가 포함되어 있을 때 재시도합니다.
    const isRateLimit = error.status === 429 || error.message?.includes("429") || error.message?.includes("quota") || error.message?.includes("limit");
    const isServiceUnavailable = error.status === 503 || error.message?.includes("503") || error.message?.includes("UNAVAILABLE");

    if (retries > 0 && (isRateLimit || isServiceUnavailable)) {
      // retries가 5부터 1까지 줄어들므로 항상 양수가 보장되도록 (6 - retries) 수식을 적용합니다.
      let waitTime = (6 - retries) * initialDelay;

      if (isRateLimit) {
        // 429 Rate Limit인 경우, 에러 메시지에서 권장 재시도 대기 시간을 파싱해옵니다.
        // 예: "Please retry in 56.148326827s."
        const secondsMatch = error.message?.match(/Please retry in ([\d\.]+)s/);
        if (secondsMatch && secondsMatch[1]) {
          const seconds = Math.ceil(parseFloat(secondsMatch[1]));
          waitTime = (seconds + 2) * 1000; // 버퍼로 2초 추가 적용
          console.warn(`      [Warning] Rate Limit 감지. API 권장 대기시간 파싱 성공: ${seconds}초 (+2초 버퍼)`);
        } else {
          // 파싱 실패 시 기본적으로 62초 대기하여 Quota 리셋을 확실히 보장합니다.
          waitTime = 62000;
          console.warn(`      [Warning] Rate Limit 감지. 권장시간 파싱 실패로 기본 62초 대기합니다.`);
        }
      } else {
        // 503 서버 과부하의 경우 혼잡이 해소되도록 최소 15초 이상 넉넉히 대기하도록 하한을 둡니다.
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
 * Puppeteer를 사용하여 동적 상품공시실 페이지에서 장기보험 3종 카테고리의 상품 정보를 수집합니다.
 */
async function crawlInsuranceProducts(): Promise<any[]> {
  const targetPortal = "https://www.hwgeneralins.com/notice/ir/product-ing01.do";
  console.log(`${logPrefix} 1단계: 한화손보 공식 상품공시실 크롤링 시작...`);

  // 환경 변수 CRAWL_HEADLESS=false 로 설정 시 브라우저 동작 과정을 눈으로 확인할 수 있습니다.
  const headless = process.env.CRAWL_HEADLESS !== "false";
  console.log(`${logPrefix} 브라우저 모드: ${headless ? "Headless (창 비노출)" : "Non-Headless (창 노출)"}`);

  const browser = await puppeteer.launch({
    headless: headless,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--window-size=1280,1500" // 화면의 모든 탭이 한눈에 들어오도록 창 크기 넉넉히 설정
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1500 });

  const products: any[] = [];

  try {
    console.log(`${logPrefix} 상품공시 페이지 접속 시도: ${targetPortal}`);
    let gotoSuccess = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.goto(targetPortal, {
          waitUntil: "networkidle2",
          timeout: 120000 // 타임아웃 120초로 상향
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

    // 페이지 초기화 및 안정적인 자바스크립트 바인딩 완료를 위해 3초 대기
    await delay(3000);

    // 수집 대상이 되는 장기보험 하위 3대 카테고리 정의
    const categories = ["상해/질병", "장기간병"];

    for (const category of categories) {
      console.log(`\n${logPrefix} --------------------------------------------------`);
      console.log(`${logPrefix} [Category] '${category}' 카테고리 탐색 및 제어 시작`);
      console.log(`${logPrefix} --------------------------------------------------`);

      // 1단계: 01 상품군(#uiFormField1) 영역에서 해당 카테고리 버튼 선택
      const categorySelector = `#uiFormField1 a[title*="${category}"]`;
      const categoryButton = await page.$(categorySelector);

      if (!categoryButton) {
        console.log(`${logPrefix} [Error] '${category}' 카테고리 버튼을 찾을 수 없습니다. 건너뜁니다.`);
        continue;
      }

      // 화면에 맞춤 정렬 후 브라우저 자바스크립트 엔진으로 확실하게 클릭 트리거
      await page.evaluate((el) => el.scrollIntoView({ block: "center" }), categoryButton);
      await page.evaluate((el) => (el as HTMLElement).click(), categoryButton);
      console.log(`${logPrefix} [Click] '${category}' 카테고리 클릭 완료`);
      await delay(2000); // 동적 상품 리스트 로딩을 위한 충분한 비동기 대기

      // 2단계: 02 상품명(#uiFormField2) 영역에 로드된 모든 상품 목록 파악
      const productLinkSelector = "#uiFormField2 a";
      const productElements = await page.$$(productLinkSelector);

      const productNames: string[] = [];
      for (const el of productElements) {
        const text = await page.evaluate(el => el.textContent?.trim(), el);
        if (text) productNames.push(text);
      }

      console.log(`${logPrefix} [Products] '${category}' 하위 상품 목록(${productNames.length}개) 발견`);

      // 각 상품을 순서대로 하나씩 클릭하여 판매기간 및 PDF 다운로드 링크를 수집합니다.
      for (let i = 0; i < productNames.length; i++) {
        const productName = productNames[i];
        console.log(`   [${i + 1}/${productNames.length}] 상품 상세 수집 중: "${productName}"`);

        // DOM이 새로 갱신될 수 있으므로 매번 상품명을 기준으로 셀렉터를 새로 조회합니다.
        const targetProductSelector = `#uiFormField2 a[title*="${productName}"]`;
        const targetProductButton = await page.$(targetProductSelector);

        if (!targetProductButton) {
          console.log(`      [Error] 상품 버튼을 찾을 수 없습니다: ${productName}`);
          continue;
        }

        // JS 레벨의 클릭 처리를 진행하여 스크롤이나 상단 헤더 차단과 상관없이 정상 트리거 보증
        await page.evaluate((el) => el.scrollIntoView({ block: "center" }), targetProductButton);
        await page.evaluate((el) => (el as HTMLElement).click(), targetProductButton);

        // 상품을 클릭하면 03 판매기간의 현재 기간(~현재)이 디폴트 선택되고 04 확인 영역이 자동으로 그려집니다.
        // 비동기 렌더링이 완료되도록 넉넉하게 2.5초 대기합니다.
        await delay(2500);

        // 3단계: 03 판매기간(#uiFormField3) 영역에서 이미 'selected'가 들어간 현재 판매 기간 텍스트 정보 추출
        const activePeriodText = await page.evaluate(() => {
          const selectedPeriod = document.querySelector("#uiFormField3 a.selected");
          return selectedPeriod?.textContent?.trim() || "";
        });

        if (!activePeriodText) {
          console.log(`      [Skip] 현재 활성화된 판매 기간 정보를 찾을 수 없습니다. (Step 03 미활성화)`);
          continue;
        }

        // 4단계: 04 확인(#uiFormField4) 영역에서 PDF 3종 링크 정보 추출
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
        console.log(`      -> 상품요약: ${pdfUrls.summary || "없음"}`);
        console.log(`      -> 사업방법: ${pdfUrls.method || "없음"}`);
        console.log(`      -> 약관확인: ${pdfUrls.terms || "없음"}`);

        products.push({
          name: productName,
          category: category,
          salesPeriod: activePeriodText,
          pdfUrls: pdfUrls,
          productUrl: targetPortal
        });
      }
    }

    console.log(`\n${logPrefix} [Crawl End] 총 ${products.length}개의 상품 데이터 최종 수집 완료`);

  } catch (error) {
    console.error(`${logPrefix} [Fatal Crawl Error] 크롤링 도중 심각한 오류가 발생했습니다:`, error);
  } finally {
    // 브라우저 리소스 정리
    await browser.close();
  }

  return products;
}

// 메인 배치 프로세스 실행 함수
async function runBatch() {
  console.log("=====================================================================");
  console.log(`🚀 ${getLogTime()} : 한화손보 공시실 월간 정기 지식 갱신 배치 시동`);
  console.log("=====================================================================");

  // 1. 기존 지식 위키 JSON 캐시 데이터 로드 시도
  const wikiPath = path.join(process.cwd(), "src", "knowledge_wiki.json");
  let existingWiki: any = null;
  if (fs.existsSync(wikiPath)) {
    try {
      existingWiki = JSON.parse(fs.readFileSync(wikiPath, "utf8"));
      console.log(`${logPrefix} 기존 지식 위키 로드 성공. (등록 상품 수: ${Object.keys(existingWiki.products || {}).length}개)`);
    } catch (e) {
      console.log(`${logPrefix} 기존 지식 위키 파일 분석 실패 또는 미존재. 신규 구축을 준비합니다.`);
    }
  }

  // 2. 동적 Puppeteer 크롤링 작동
  const scrapedProducts = await crawlInsuranceProducts();

  if (scrapedProducts.length === 0) {
    console.log(`${logPrefix} [Warn] 수집된 상품이 없어 지식 위키 저장을 진행하지 않습니다.`);
    return;
  }

  // 3. 구글 제미나이(Google GenAI) API 클라이언트 감지 및 초기화
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

  // 임시 다운로드 폴더 생성 보장
  const tempDir = path.join(process.cwd(), "scratch");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // 4. 수집된 상품 기반으로 요약 분석 수행 및 데이터 매핑
  // 기존 캐시 데이터(existingWiki.products)를 얕은 복사하여 wikiProducts의 기본값으로 미리 설정합니다.
  // 이렇게 해두면, 429 한계로 인해 중간에 분석이 중단되더라도 기존에 분석이 완료되어 저장되어 있던
  // 타 상품들의 데이터가 유실(기본값인 'PDF 분석 후 업데이트 예정'으로 강제 덮어쓰기)되지 않고 온전히 유지됩니다.
  const wikiProducts: any = existingWiki?.products ? { ...existingWiki.products } : {};
  let hasApiError = false; // API 에러 발생 여부 체크 플래그

  for (const product of scrapedProducts) {
    const productName = product.name;

    // 캐싱 메커니즘: 기존 캐시 데이터가 이미 존재하고, 세부 필터링 및 한도 데이터까지 온전히 채워져 있다면 API 연동 스킵
    const cachedProduct = existingWiki?.products?.[productName];
    if (
      cachedProduct &&
      cachedProduct.coreBenefits &&
      cachedProduct.coreBenefits.length > 0 &&
      cachedProduct.premiumRange !== "PDF 분석 후 업데이트 예정" &&
      cachedProduct.targetAge && // 신규 필드 존재 여부 체크
      cachedProduct.coverageLimits // 신규 필드 존재 여부 체크
    ) {
      console.log(`${logPrefix} [Cache Hit] '${productName}' 상품 분석 완료 캐시 사용 (Gemini API 호출 생략)`);
      // 이미 wikiProducts에 복사되어 있으므로 분석 과정을 바로 스킵(continue)합니다.
      continue;
    }

    // 캐시가 없거나 갱신이 필요한 경우 신규 요약 분석 진행
    console.log(`${logPrefix} [Analysis Required] '${productName}' 상품 신규 분석 진행 시작`);

    // 기존 데이터 복구 우선 적용: 혹시 기존에 불완전하게 저장된 임시 캐시값이 있었다면 이를 재사용하고 없으면 기본 텍스트를 대입합니다.
    let coreBenefits: string[] = cachedProduct?.coreBenefits || [];
    let premiumRange = cachedProduct?.premiumRange || "PDF 분석 후 업데이트 예정";
    let recommendationFactor = cachedProduct?.recommendationFactor || "PDF 분석 후 업데이트 예정";
    let targetAge = cachedProduct?.targetAge || { minAge: null, maxAge: null };
    let renewalType = cachedProduct?.renewalType || "PDF 분석 후 업데이트 예정";
    let examinationType = cachedProduct?.examinationType || "PDF 분석 후 업데이트 예정";
    let simsaCriteria = cachedProduct?.simsaCriteria || "PDF 분석 후 업데이트 예정";
    let coverageLimits = cachedProduct?.coverageLimits || {
      generalCancer: "PDF 분석 후 업데이트 예정",
      similarCancer: "PDF 분석 후 업데이트 예정",
      cerebrovascular: "PDF 분석 후 업데이트 예정",
      ischemicHeart: "PDF 분석 후 업데이트 예정",
      caregiverExpenses: "PDF 분석 후 업데이트 예정"
    };

    let apiSuccess = true;

    // 상품요약서 PDF 주소가 있고 Gemini API가 사용 가능한 상태인 경우
    if (product.pdfUrls.summary && useRealGemini) {
      const tempPdfPath = path.join(tempDir, `temp_${Date.now()}.pdf`);
      const slicedPdfPath = path.join(tempDir, `sliced_${Date.now()}.pdf`);
      try {
        console.log(`      [Downloader] 상품요약서 PDF 임시 다운로드 중...`);
        await downloadPdf(product.pdfUrls.summary, tempPdfPath);
        await delay(1000); // 디스크 IO 안정화 대기

        // [교육용 한글 주석]
        // 사용자 제안 반영: 무료 API의 토큰 초과(TPM) 에러를 원천 우회하기 위해
        // pdf-lib를 활용하여 다운로드한 PDF의 앞쪽 8페이지만 잘라서 Gemini API에 전달합니다.
        console.log(`      [Preprocessing] PDF 파일의 앞쪽 8페이지 분할(슬라이싱) 중...`);
        await slicePdf(tempPdfPath, slicedPdfPath, 8);
        await delay(1000); // 디스크 IO 안정화 대기

        console.log(`      [Gemini API] 슬라이싱된 PDF 파일 업로드 요청 중...`);
        const uploadResult = await runWithRetry<any>(() => aiClient.files.upload({
          file: slicedPdfPath,
          mimeType: "application/pdf"
        }));
        await delay(10000); // 1. 업로드 성공 후 API 서버 부하 분산을 위한 10초 대기

        // Gemini AI 2.5-flash 모델을 통해 PDF 내용 분석 요약
        console.log(`      [Gemini API] PDF 내용 분석 및 요약 요청 중...`);
        const response = await runWithRetry<any>(() => aiClient.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [
            {
              role: "user",
              parts: [
                { fileData: { fileUri: uploadResult.uri, mimeType: uploadResult.mimeType } },
                {
                  text: `이 문서는 한화손해보험의 "${productName}" 상품요약서 PDF 파일입니다. 이 문서를 분석하여 다음 정보를 JSON 형식으로 제공해줘:
                {
                  "coreBenefits": ["핵심 보장 혜택 3~4개 (각각 한국어 1줄 문장으로 짧게 요약)"],
                  "premiumRange": "대략적인 보험료 가격대 (예: '2~4만원대', '5만원대 이상' 등 핵심 가격 구간을 한 줄 텍스트로 요약)",
                  "recommendationFactor": "이 상품을 어떤 사람에게 추천하는지에 대한 가입추천요인 (예: '비갱신형 암보장을 선호하는 3040 세대' 등 한 줄 텍스트)",
                  "targetAge": {
                    "minAge": 15, (숫자 또는 null, 가입 가능한 최소 연령. 예시 표 등에서 가입가능 나이를 파악하여 숫자로 작성)
                    "maxAge": 90 (숫자 또는 null, 가입 가능한 최대 연령. 예시 표 등에서 가입가능 나이를 파악하여 숫자로 작성)
                  },
                  "renewalType": "갱신형 또는 비갱신형 중 해당하는 값을 한글로 작성 (예: '갱신형', '비갱신형', '혼합형')",
                  "examinationType": "일반고지(건강체) 또는 간편고지(유병자) 중 해당하는 값을 한글로 작성",
                  "simsaCriteria": "간편고지 상품인 경우 '3.1.1', '3.2.5', '3.5.5' 등 상품 고지유형을 추출. 일반상품이면 '없음'",
                  "coverageLimits": {
                    "generalCancer": "암진단비(유사암 제외) 최대 가입 한도 금액 (예: '최대 5,000만원', 없으면 '없음')",
                    "similarCancer": "유사암진단비 최대 가입 한도 금액",
                    "cerebrovascular": "뇌혈관질환진단비 최대 가입 한도 금액",
                    "ischemicHeart": "허혈성심장질환진단비 최대 가입 한도 금액",
                    "caregiverExpenses": "간병인사용(또는 지원) 일당 최대 한도 (예: '일당 최대 15만원', 없으면 '없음')"
                  }
                }
                응답은 마크다운 코드블록이나 추가 텍스트 없이 순수한 JSON 내용만 제공해야 해.` }
              ]
            }
          ]
        }));
        await delay(10000); // 2. 요약 성공 후 다음 동작 전 API 서버 부하 분산을 위한 10초 대기

        // API로 업로드했던 클라우드 임시 리소스 삭제 정리
        console.log(`      [Gemini API] 임시 리소스 삭제 중...`);
        await runWithRetry<any>(() => aiClient.files.delete({ name: uploadResult.name }));

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
          coverageLimits = analysis.coverageLimits || coverageLimits;
          console.log(`      [Gemini API] 분석 요약 성공 완료!`);
        }

        // 분당 요청 제한(Rate Limit)을 완전히 우회하기 위한 상품당 30초 대기시간 적용
        await delay(30000);
      } catch (err: any) {
        console.error(`      [Gemini Error] '${productName}' PDF 분석 도중 오류가 발생했습니다:`, err.message || err);
        apiSuccess = false;
        hasApiError = true;

        // [교육용 한글 주석]
        // 만약 기존에 분석 완료된 캐시 데이터조차 없는 아예 처음 분석하는 상품인데 오류가 발생했다면,
        // 다음 배치 실행 시에도 이 상품 단계에서 또다시 429 병목에 막혀 빌드가 더 이상 전진하지 못합니다.
        // 이를 방지하기 위해 "분석 실패(무료 한도 초과)" 상태로 객체를 채워 저장하여 다음 번에는 캐시 히트로 스킵되게 합니다.
        if (!cachedProduct) {
          coreBenefits = ["API 한도 초과 또는 일시적 오류로 인해 요약이 누락되었습니다."];
          premiumRange = "분석 실패 (무료 한도 초과)";
          recommendationFactor = "이 요약서 PDF 파일은 무료 요금제 토큰 제한(TPM)을 초과하여 요약을 생략합니다.";
          targetAge = { minAge: null, maxAge: null };
          renewalType = "확인 불가";
          examinationType = "확인 불가";
          simsaCriteria = "확인 불가";
          coverageLimits = {
            generalCancer: "확인 불가",
            similarCancer: "확인 불가",
            cerebrovascular: "확인 불가",
            ischemicHeart: "확인 불가",
            caregiverExpenses: "확인 불가"
          };
        }
      } finally {
        // [임시 자원 완전 삭제]
        // 디스크 용량 관리를 위해 사용이 완료된 임시 원본 PDF와 잘라낸 슬라이싱 PDF 파일을 모두 정리합니다.
        if (fs.existsSync(tempPdfPath)) {
          try {
            fs.unlinkSync(tempPdfPath);
          } catch (e) { }
        }
        if (fs.existsSync(slicedPdfPath)) {
          try {
            fs.unlinkSync(slicedPdfPath);
          } catch (e) { }
        }
      }
    } else {
      apiSuccess = false;
    }

    // [교육용 한글 주석]
    // 429 한도로 인해 분석이 끊겼고 API 오류(hasApiError)가 참인 경우,
    // 더 이상의 분석을 무의미하게 진행하지 않고 루프를 즉시 중단(break)합니다.
    // 이렇게 루프를 중단하면 이때까지 성공한 정보만 로컬 JSON에 정상 반영하고
    // 스크립트를 정상 종료(0) 처리할 수 있어 GitHub Actions의 커밋&푸시 단계로 이어지게 됩니다.
    if (!apiSuccess && hasApiError) {
      console.warn(`\n[Warning] Gemini API 할당량 제한(429) 또는 오류 감지로 인해 루프를 중단합니다.`);
      console.warn(`          현재까지 수집/요약 완료된 데이터만 저장한 후 빌드를 정상 종료(Success) 처리합니다.`);
      break;
    }

    // 구조화 객체 생성 및 목록 매핑
    wikiProducts[productName] = {
      fullName: productName,
      category: product.category,
      status: "판매중",
      salesPeriod: product.salesPeriod,
      productUrl: product.productUrl,
      pdfUrls: product.pdfUrls,
      coreBenefits: coreBenefits,
      premiumRange: premiumRange,
      recommendationFactor: recommendationFactor,
      targetAge: targetAge,
      renewalType: renewalType,
      examinationType: examinationType,
      simsaCriteria: simsaCriteria,
      coverageLimits: coverageLimits
    };
  }

  const wikiData = {
    generatedAt: new Date().toISOString(),
    batchLog: `Success - Processed ${scrapedProducts.length} Hanwha Insurance active long-term products.`,
    products: wikiProducts
  };

  // 5. 지식 위키 JSON을 src/knowledge_wiki.json 에 기록
  const distDir = path.join(process.cwd(), "src");
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }
  fs.writeFileSync(wikiPath, JSON.stringify(wikiData, null, 2), "utf8");


  console.log("=====================================================================");
  console.log(`${logPrefix} 5단계: 지식 위키 구조화 JSON 저장 완료!`);
  console.log(`${logPrefix} File Path: ${wikiPath}`);
  console.log(`${logPrefix} 수집 및 분석 완료된 상품 위키 노드 개수: ${Object.keys(wikiData.products).length}개`);
  console.log("=====================================================================");
  console.log(`🎉 ${getLogTime()} : 정기 배치 지식 위키 구축 작업이 완벽하게 완료되었습니다!`);
  console.log("=====================================================================");
}

runBatch().catch(err => {
  console.error(`${logPrefix} [CRITICAL ERROR] Batch Execution Failed:`, err);
});
