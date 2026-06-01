@echo off
:: 한글 깨짐 방지를 위해 UTF-8 코드페이지 설정
chcp 65001 > nul
title 한화손보 AI Health Care Center - 원클릭 자동 환경설정 도구

echo =======================================================================
echo    한화손보 AI Health Care Center - 원클릭 자동 셋업 및 가동 도구
echo =======================================================================
echo.
echo 이 스크립트는 새로운 PC에서 개발 환경을 1초 만에 안전하게 구축하고
echo 로컬 개발 서버 및 웹 브라우저 테스트 환경을 한 번에 실행하는 마스터 도구입니다.
echo.
echo -----------------------------------------------------------------------

:: 1. Node.js 설치 상태 검증
echo [*] 1단계: Node.js 및 npm 설치 여부를 진단하고 있습니다...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [!] 알림: 시스템에 필수 엔진인 Node.js가 발견되지 않았습니다.
    echo     Windows 공식 패키지 관리자(winget)를 통해 Node.js LTS를 즉시 자동 설치합니다.
    echo     (보안 창(UAC)이 활성화되면 '예'를 꼭 클릭해 주세요!)
    echo.
    winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-source-agreements --accept-package-agreements
    if %errorlevel% neq 0 (
        echo [x] 에러: Node.js 자동 설치에 실패했습니다. 인터넷 선을 점검하거나
        echo     https://nodejs.org 에서 직접 LTS 버전을 다운로드하여 설치해 주십시오.
        pause
        exit /b %errorlevel%
    )
    echo [+] Node.js 설치가 완벽하게 성공했습니다! 터미널 환경을 보정합니다.
    :: 새로 설치한 Node.js가 현재 CMD 세션에 잡히도록 임시로 PATH 추가
    set "PATH=%PATH%;C:\Program Files\nodejs"
) else (
    echo [+] 진단 성공: 이미 컴퓨터에 올바른 Node.js 환경이 갖춰져 있습니다.
)
echo.

:: 2. 환경변수 파일 (.env) 구성
echo [*] 2단계: 환경 변수 (.env) 설정 상태를 확인하고 있습니다...
if not exist .env (
    echo [!] 알림: .env 파일이 존재하지 않아 .env.example 복사본을 자동 생성합니다.
    copy .env.example .env > nul
    echo [+] 복사 성공: .env 파일이 기본 포맷으로 생성되었습니다.
    echo     (이후 .env 파일을 열고 사용자님의 GEMINI_API_KEY를 꼭 적어주세요!)
) else (
    echo [+] 확인 성공: 이미 .env 파일이 구성되어 있습니다.
)
echo.

:: 3. 패키지 라이브러리 의존성 설치
echo [*] 3단계: 웰니스 앱 실행에 필요한 핵심 라이브러리 부품들을 설치합니다 (npm install)...
echo     (네트워크 및 사양에 따라 대략 15초~1분 가량 소요됩니다.)
echo.
call npm install
if %errorlevel% neq 0 (
    echo.
    echo [x] 에러: 라이브러리 부품 설치 과정에서 오류가 났습니다.
    echo     인터넷 선을 점검하시고 다시 실행해 주세요.
    pause
    exit /b %errorlevel%
)
echo.
echo [+] 부품 설치 완료: 모든 라이브러리 세팅이 안전하게 종료되었습니다.
echo.

:: 4. 브라우저 테스트 및 로컬 서버 자동 가동
echo =======================================================================
echo   🎉 축하합니다! 모든 로컬 개발 환경 셋업이 성공적으로 완료되었습니다!
echo.
echo   1. 잠시 후 로컬 Express 백엔드 및 Vite 프론트엔드가 자동으로 기동됩니다.
echo   2. 자동으로 기본 웹 브라우저 창이 열리며 http://localhost:3000 으로 연결됩니다.
echo   3. 웹 앱 가동 중에 이 검은색 콘솔 창을 닫으면 개발 서버가 중단됩니다.
echo =======================================================================
echo.
echo [*] 즉시 브라우저 테스트 창을 실행하고 개발 서버를 켭니다...
timeout /t 3 > nul

:: 백그라운드로 브라우저 창 띄우기
start http://localhost:3000

:: 서버 정식 구동
call npm run dev
pause
