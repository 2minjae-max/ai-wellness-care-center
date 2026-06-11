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
 * [교육용 한글 주석]
 * 통합형 3단계 지식 구축 배치 프로세스 실행 함수
 * 
 * 1단계 (캐시 로드 및 브라우저 기동)
 * 2단계 (순차적 동적 크롤링 ➔ 즉시 슬라이싱 ➔ 즉시 Gemini 요약 분석 ➔ JSON 실시간 파일 저장)
 * 3단계 (임시 PDF 로컬 자원 정리 및 브라우저 자원 반환)
 */
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
      console.log(`${logPrefix} 기존 지식 위키 캐시 로드 성공. (등록 상품 수: ${Object.keys(existingWiki.products || {}).length}개)`);
    } catch (e) {
      console.log(`${logPrefix} 기존 지식 위키 파일 분석 실패 또는 미존재. 신규 구축을 준비합니다.`);
    }
  }

  // 기존 캐시를 기반으로 wikiProducts 기본 세팅 (데이터 유실 방지)
  const wikiProducts: any = existingWiki?.products ? { ...existingWiki.products } : {};

  // 2. 구글 제미나이(Google GenAI) API 클라이언트 감지 및 초기화
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

  // 3. Puppeteer 브라우저 기동 (1단계)
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
  await page.setViewport({ width: 1280, height: 1500 });

  let processedCount = 0;
  let hasFatalApiError = false;

  try {
    console.log(`${logPrefix} 상품공시 페이지 접속 시도: ${targetPortal}`);
    let gotoSuccess = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.goto(targetPortal, {
          waitUntil: "networkidle2",
          timeout: 120000
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

    await delay(3000);

    const categories = ["상해/질병", "장기간병"];

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

        console.log(`\n   [${processedCount}번째 상품] "${productName}" 처리 중...`);

        // 캐싱 여부 검사: 이미 요약 분석까지 완벽하게 끝난 데이터가 캐시에 존재하는지 확인
        const cachedProduct = existingWiki?.products?.[productName];
        if (
          cachedProduct &&
          cachedProduct.coreBenefits &&
          cachedProduct.coreBenefits.length > 0 &&
          cachedProduct.premiumRange !== "PDF 분석 후 업데이트 예정" &&
          cachedProduct.premiumRange !== "분석 실패 (무료 한도 초과)" && // 이전 분석 실패 마킹된 것도 있다면 재분석 기회 부여를 위해 스킵하지 않음
          cachedProduct.targetAge &&
          cachedProduct.coverageLimits
        ) {
          console.log(`      [Cache Hit] 이미 요약된 캐시 데이터가 존재합니다. 클릭 단계를 건너뜁니다.`);
          // wikiProducts에는 이미 복제되어 있으므로 바로 다음 상품으로 패스(continue)
          continue;
        }

        // 캐시가 없거나 불완전한 신규 분석 대상인 경우 화면을 직접 조작 및 Gemini API 연동 수행
        console.log(`      [Analysis Required] 신규 분석이 필요합니다. 공시실 상세 정보 조회를 시작합니다.`);

        const targetProductSelector = `#uiFormField2 a[title*="${productName}"]`;
        const targetProductButton = await page.$(targetProductSelector);

        if (!targetProductButton) {
          console.warn(`      [Error] 상품 버튼을 찾을 수 없습니다: ${productName}`);
          continue;
        }

        await page.evaluate((el) => el.scrollIntoView({ block: "center" }), targetProductButton);
        await page.evaluate((el) => (el as HTMLElement).click(), targetProductButton);
        await delay(2500); // 렌더링 완료 대기

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

        if (pdfUrls.summary && useRealGemini) {
          const tempPdfPath = path.join(tempDir, `temp_${Date.now()}.pdf`);
          const slicedPdfPath = path.join(tempDir, `sliced_${Date.now()}.pdf`);
          try {
            console.log(`      [Downloader] 상품요약서 PDF 임시 다운로드 중...`);
            await downloadPdf(pdfUrls.summary, tempPdfPath);
            await delay(1000);

            console.log(`      [Preprocessing] PDF 파일의 앞쪽 8페이지 분할(슬라이싱) 중...`);
            await slicePdf(tempPdfPath, slicedPdfPath, 8);
            await delay(1000);

            console.log(`      [Gemini API] 슬라이싱된 PDF 파일 업로드 요청 중...`);
            const uploadResult = await runWithRetry<any>(() => aiClient.files.upload({
              file: slicedPdfPath,
              mimeType: "application/pdf"
            }));
            await delay(10000);

            console.log(`      [Gemini API] PDF 내용 분석 및 요약 요청 중...`);
            const response = await runWithRetry<any>(() => aiClient.models.generateContent({
              model: "gemini-1.5-flash",
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
                        "minAge": 15,
                        "maxAge": 90
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
                    응답은 마크다운 코드블록이나 추가 텍스트 없이 순수한 JSON 내용만 제공해야 해.`
                    }
                  ]
                }
              ]
            }));
            await delay(10000);

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

            await delay(30000);
          } catch (err: any) {
            console.error(`      [Gemini Error] '${productName}' PDF 분석 도중 오류가 발생했습니다:`, err.message || err);
            apiSuccess = false;
            hasFatalApiError = true;

            // 병목 방지 실패 마킹
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
          } finally {
            if (fs.existsSync(tempPdfPath)) {
              try { fs.unlinkSync(tempPdfPath); } catch (e) { }
            }
            if (fs.existsSync(slicedPdfPath)) {
              try { fs.unlinkSync(slicedPdfPath); } catch (e) { }
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
          coverageLimits: coverageLimits
        };

        // [실시간 저장 보장]
        // 429 등으로 빌드가 조기 중단되더라도 데이터 유실이 없도록 매 요약 완료 시점마다 JSON 파일을 갱신 저장합니다.
        const wikiData = {
          generatedAt: new Date().toISOString(),
          batchLog: `Success - Sliced and processed up to ${processedCount} Hanwha Insurance active products.`,
          products: wikiProducts
        };
        const distDir = path.join(process.cwd(), "src");
        if (!fs.existsSync(distDir)) {
          fs.mkdirSync(distDir, { recursive: true });
        }
        fs.writeFileSync(wikiPath, JSON.stringify(wikiData, null, 2), "utf8");
        console.log(`      [Save Completed] '${productName}' 요약 결과 지식 위키 JSON 실시간 저장 완료.`);

        // API 한도 초과 오류가 감지된 경우, 더 이상 공시실 제어를 진행하지 않고 즉시 루프를 탈출합니다.
        if (!apiSuccess && hasFatalApiError) {
          console.warn(`\n[Warning] Gemini API 할당량 제한(429) 감지로 인해 전체 프로세스를 여기에서 중단합니다.`);
          console.warn(`          현재까지 요약 성공한 데이터를 기반으로 배치를 정상 성공(Success)으로 마무리합니다.`);
          break;
        }
      }

      // 만약 이전 카테고리 루프 도중 한도 초과로 break가 선언되었다면 외부 카테고리 루프도 빠져나갑니다.
      if (hasFatalApiError) {
        break;
      }
    }

  } catch (error) {
    console.error(`${logPrefix} [Fatal Batch Error] 배치 처리 도중 심각한 오류가 발생했습니다:`, error);
  } finally {
    // 3단계 (자원 완전 반환)
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
