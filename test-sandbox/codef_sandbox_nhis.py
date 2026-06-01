#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
한화손보 AI Health Care Center - CODEF API Direct Sandbox Connection Code (테스트 격리 폴더)

이 파이썬 스크립트는 중개 서버를 거치지 않고, Python의 easycodefpy 라이브러리를 직접 사용해
CODEF의 공식 샌드박스 서버와 통신하여 국민건강보험공단 건강검진 내역 조회 API를 직접 호출하는 예제입니다.

[필수 패키지 설치]
$ pip install easycodefpy python-dotenv

[보안 공지]
- 보안 강화를 위해 Client ID와 Client Secret, Public Key 등의 민감키는 코드 내에 직접 하드코딩하지 않습니다.
- 루프 내에 있는 .env 파일에서 os.environ 또는 dotenv 패키지를 사용해 동적으로 가져오도록 설계했습니다.
"""

import os
import json
from dotenv import load_dotenv
from easycodefpy import Codef, ServiceType, encrypt_rsa

# 1. .env 파일 로드 (보안 강화)
load_dotenv()

def run_codef_sandbox_nhis():
    # 2. CODEF 환경변수 안전하게 조회 (없을 경우를 대비한 플레이스홀더 제공)
    # 실제 발급받은 키는 .env에 저장해 두시면 자동으로 연결됩니다.
    CLIENT_ID = os.getenv("CODEF_CLIENT_ID", "YOUR_CLIENT_ID")
    CLIENT_SECRET = os.getenv("CODEF_CLIENT_SECRET", "YOUR_CLIENT_SECRET")
    PUBLIC_KEY = os.getenv("CODEF_PUBLIC_KEY", "YOUR_PUBLIC_KEY")

    print("=" * 60)
    print("   CODEF Sandbox API Direct Connection Tester [NHIS-HEALTH-CHECK]")
    print("=" * 60)
    print(f"[*] Client ID     : {CLIENT_ID[:10]}... (비공개 처리)")
    print(f"[*] Client Secret : {CLIENT_SECRET[:10]}... (비공개 처리)")
    print(f"[*] Public Key    : {PUBLIC_KEY[:10]}... (비공개 처리)")
    print("-" * 60)

    if CLIENT_ID == "YOUR_CLIENT_ID" or CLIENT_SECRET == "YOUR_CLIENT_SECRET":
        print("[!] 경고: 현재 실제 CODEF 키 값이 연동되지 않았습니다. 플레이스홀더로 실행을 테스트합니다.")
        print("    키 등록을 원하신다면 .env 파일의 실제 정보를 적어 조율하십시오.")
        print("-" * 60)

    # 3. CODEF 인스턴스 생성 및 환경 설정
    codef = Codef()
    
    # 샌드박스/데모용 환경 키 매핑
    codef.set_demo_client_info(CLIENT_ID, CLIENT_SECRET)
    
    # 정식 서비스용 환경 키 매핑 (추후 실서버 연동 시 사용 가능)
    codef.set_client_info(CLIENT_ID, CLIENT_SECRET)
    
    # RSA 암호화에 사용할 공개키 매핑
    codef.public_key = PUBLIC_KEY

    # 4. 국민건강보험공단 건강검진 API 호출에 전송할 파라미터 구성
    # 샌드박스(테스트) 연동 시에는 실제 가입자 정보 대신에 가이드라인의 Mock/테스트 데이터를 매핑해야 합니다.
    # (공식 CODEF 개발 서버 데모용 간편인증 더미가 매핑되는 기준)
    parameters = {
        "organization": "0002",         # 기관 코드: 0002 (국민건강보험공단)
        "loginType": "5",               # 로그인 유형: 5 (간편인증)
        "loginType2": "5",              # 간편인증 선택처: e.g. "0": 카카오톡, "5": 네이버, "8": 토스
        
        # 샌드박스 기본 더미 테스트 가입자 기준
        "userName": "홍길동",           # 샌드박스 환경 가상 수검자명
        "identity": "19800101",         # 생년월일 (8자리)
        "phoneNo": "01012341234",       # 휴대폰 번호
        "telecom": "0",                 # 통신사 코드 ("0": SKT, "1": KT, "2": LGU+)
        
        "searchStartYear": "2020",      # 조회 시작 년도
        "searchEndYear": "2025",        # 조회 종료 년도
        "type": "1",                    # 가져올 포맷 종류: "1" (건강검진 요약 결과 리스트)
        
        # 추가 보안 정보 및 약관 동의 
        "agree1": "1",
        "agree2": "1",
        "agree3": "1"
    }

    # 5. 비밀번호 등 강력한 기밀 정보가 있을 경우 RSA 암호화 수행 예시
    # (NHIS의 경우 간편인증 방식은 패스워드가 필수이지 않지만, 인증서 로그인 등 암호화가 필요한 경우 사용합니다.)
    # dummy_password = "my_plain_password"
    # encrypted_password = encrypt_rsa(dummy_password, codef.public_key)
    # parameters["password"] = encrypted_password

    print("[*] CODEF 샌드박스 공식 서버로 직접 요청을 전송하고 있습니다...")
    print(f"    - 대상 API: /v1/kr/public/pp/nhis-health-check")
    print(f"    - 요청 파라미터 구조: \n{json.dumps(parameters, indent=4, ensure_ascii=False)}")
    print("-" * 60)

    try:
        # 6. ServiceType.SANDBOX 환경을 매핑하여 직접 건강검진 통신 호출 수행!
        # easycodefpy 내부에서 자동으로 토큰(oauth token) 발급 및 갱신을 조율하고 샌드박스 URL로 안전하게 라우팅합니다.
        response = codef.request_product(
            "/v1/kr/public/pp/nhis-health-check",
            ServiceType.SANDBOX,
            parameters
        )

        # 7. 응답 결과 디코딩 및 파싱
        # easycodefpy는 문자열 JSON 또는 딕셔너리를 반환할 수 있으므로, 타입을 구분해서 포맷합니다.
        if isinstance(response, str):
            parsed_data = json.loads(response)
        else:
            parsed_data = response

        print("[+] CODEF API 샌드박스 서버 응답 수신 성공!")
        print("=" * 60)
        print(json.dumps(parsed_data, indent=4, ensure_ascii=False))
        print("=" * 60)

    except Exception as e:
        print(f"[x] 통신 오류 혹은 요청 실패가 발생했습니다: {str(e)}")
        print("    상세 가이드: .env에 client_id, client_secret 및 public_key를 정확히 입력했는지 확인하십시오.")
        print("    또는 PIP 패키지 easycodefpy가 설치 버전인지 조회해 주십시오.")

if __name__ == "__main__":
    run_codef_sandbox_nhis()
