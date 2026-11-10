# COD-PRO Contents Specification v1.0

## 컨텐츠 분류

### 1. Table Contents (테이블)

#### 1.1 테이블 (Code: 1,2,3)
- **Data Format**: `[{col0:"IP",col1:숫자},...]`
- **Data Description**:
  - col0~colN 형태로 데이터 생성
  - 필드 형식:
    - 문자: "데이터" (큰따옴표)
    - 숫자: 33423 (큰따옴표 생략)
    - 국가코드: "CN"
    - 색상: "#ff0000"
    - IP: "127.0.0.1"

#### 1.2 국가 테이블 (Code: 25)
- **Data Format**: `[{col0:"US",col1:"미국",col2:237},...] `
- **Data Description**:
  - col0: 국가 코드
  - col1: 국가명
  - col2: 건수

#### 1.3 프로세스 테이블 (Code: 28)
- **Data Format**: `[{col0:"이메일 공격",col1:"해킹메일을 발송하여…"},{col0:"악성코드감염",col2:"홈페이지를 악용한…"},...] `
- **Data Description**:
  - col0: 타이틀
  - col1: 내용

#### 1.4 라벨 테이블 (Code: 29)
- **Data Format**: `[{col0:"해킹메일1"},{col0:"해킹메일2"},{col0:"해킹메일3"},...] `
- **Data Description**:
  - col0: 내용

#### 1.5 뉴스 테이블 (Code: 35)
- **Data Format**: `[{"col0":"2021/11/12","col1":"6평 컨테이너 살던 노인,…","col2":"<font color='yellow'>권고뉴스</font>","col3":"A-뉴스"},...] `
- **Data Description**:
  - col0: 날짜
  - col1: 뉴스 타이틀
  - col2: 뉴스 종류 (HTML 포맷팅 가능)
  - col3: 뉴스 출처

#### 1.6 대시 테이블 (Code: 40)
- **Data Format**: `[{col0:"192.168.0.13",col1:172},...] `
- **Data Description**:
  - col0~colN 형태로 데이터 생성
  - col 유형:
    - 문자: "데이터"
    - Number: 33423 (쌍따옴표 생략)
    - Flag: "CN" (국가코드)
    - Color: "#ff0000"
    - IP: "127.0.0.1"

### 2. Label Contents (라벨)

#### 2.1 Circle Progress (Code: 17)
- **Data Format**: `[{"col0":30}]`
- **Data Description**:
  - col0: 퍼센트 (0~100)

#### 2.2 Label ver1 (Code: 9)
- **Data Format**: `[{col0:"공격IP탐지수",col1:23},{col0:"경보수",col1:568},...] `
- **Data Description**:
  - col0: 타이틀
  - col1: 건수

#### 2.3 Label ver2 (Code: 10)
- **Data Format**: `[{col0:"공격IP탐지수",col1:23},{col0:"경보수",col1:568},...] `
- **Data Description**:
  - col0: 타이틀
  - col1: 건수

#### 2.4 Label ver3 (Code: 11)
- **Data Format**: `[{col0:"공격IP탐지수(개)",col1:489,col2:-4},{col0:"공격 트래픽량(Mbps)",col1:5261,col2:2327},...] `
- **Data Description**:
  - col0: 타이틀
  - col1: 건수
  - col2: 등락건수 (음수 가능)

#### 2.5 Label ver4 (Code: 15)
- **Data Format**: `[{col0:"국내 탐지 건수",col1:363}]`
- **Data Description**:
  - col0: 타이틀
  - col1: 건수

#### 2.6 Label ver5 (Code: 20)
- **Data Format**: `[{col0:"GPS",col1:936,col2:11},{col0:"Mbps",col1:936,col2:-11},...] `
- **Data Description**:
  - col0: 타이틀
  - col1: 건수
  - col2: 등락건수 (음수 가능)

#### 2.7 Label ver6 (Code: 26)
- **Data Format**: `[{col0:"CHINA",col1:23,col2:1896,col3:"피해기관",col4:"경보발생"}]`
- **Data Description**:
  - col0: 헤더 타이틀
  - col1: 건수1
  - col2: 건수2
  - col3: 타이틀1
  - col4: 타이틀2
  - 단일 JSON 오브젝트 데이터만 허용

#### 2.8 Label ver7 (Code: 27)
- **Data Format**: `[{col0:"탐지수",col1:568},{col0:"경보수",col1:223},...] `
- **Data Description**:
  - col0: 타이틀
  - col1: 건수
  - col2: 건수2 (optional)
  - col3: 타이틀1 (optional)
  - col4: 타이틀2 (optional)

#### 2.9 Label ver8 (Code: 30)
- **Data Format**: `[{col0:"금일 공유 건수",col1:1170,col2:"금일 공유 건수",col3:1012},{col0:"국내 탐지 건수",col1:936,col2:"국내 탐지 건수",col3:936},...] `
- **Data Description**:
  - col0: 타이틀1
  - col1: 건수1
  - col2: 타이틀2
  - col3: 건수2

#### 2.10 Label ver9 (Code: 33)
- **Data Format**: `[{col0:"전체",col1:1330},...] `
- **Data Description**:
  - col0: 타이틀1
  - col1: 건수

#### 2.11 Label ver10 (Code: 34)
- **Data Format**: `[{col0:"Condition",col1:512,col2:"Condition"},...] `
- **Data Description**:
  - col0: 타이틀
  - col1: 건수
  - col2: 이미지명

#### 2.12 Multi Label (Code: 13)
- **Data Format**: `[{col0:"금일 공유 건수",col1:1170},{col0:"업체수",col1:1012},...] `
- **Data Description**:
  - col0: 타이틀
  - col1: 건수

#### 2.13 Label ver11 (Code: 36)
- **Data Format**: `[{"col0":"탐지","col1":"분석","col2":"대응","col3":"공유·협력"}]`
- **Data Description**:
  - col0: 타이틀
  - col1+: 추가 타이틀

#### 2.14 Label ver12 (Code: 37)
- **Data Format**: `[{"col0":"소속기관","col1":200,"col2":"공공기관","col3":300,"col4":"사립대","col5":400,"col6":"국공립대","col7":400,"col8":"대학병원","col9":200,"col10":"시도교육청","col11":150}]`
- **Data Description**:
  - col0: 타이틀
  - col1+: 건수 (표출 개수대로 정의)

#### 2.15 Label ver13 (Code: 38)
- **Data Format**: `[{"col0":"필터링 #1","col1":"필터링 #2","col2":"필터링 #3"}]`
- **Data Description**:
  - col0+: 타이틀 (표출 개수대로 정의)

#### 2.16 Label ver14 (Code: 39)
- **Data Format**: `[{"col0":"악성코드","col1":"보안","col2":"개인정보","col3":"애드웨어","col4":"위협대응"}]`
- **Data Description**:
  - col0+: 타이틀 (표출 개수대로 정의)

#### 2.17 Label ver15 (Code: 44)
- **Data Format**: `[{"col0":"탐지건수","col1":"차단건수","col3":"left"}]`
- **Data Description**:
  - col0: 타이틀
  - col1: 타이틀2
  - col2: 괄호 위치 (left/right/both)

#### 2.18 Label ver16 (Code: 45)
- **Data Format**: `[{"col0":"금일","col2":"250","col3":"1"}]`
- **Data Description**:
  - col0: 타이틀
  - col1: 상단데이터
  - col2: 하단데이터

#### 2.19 Label ver17 (Code: 46)
- **Data Format**: `[{"col0":"UTP","col1":"true"}]`
- **Data Description**:
  - col0: 타이틀
  - col1: 정상여부 (true/false)

#### 2.20 Label ver18 (Code: 47)
- **Data Format**: `[{"col0":"공격표면","col2":"홈페이지","col3":"3","col4":"공인IP","col5":"6"}]`
- **Data Description**:
  - col0: 타이틀
  - col1: 서브타이틀1
  - col2: 서브데이터1
  - col3: 서브타이틀2
  - col4: 서브데이터2

### 3. Alert Contents (위기경보)

#### 3.1 위기경보 (Code: 24)
- **Data Format**: `[{col0:"2"}]`
- **Data Description**:
  - col0: 경보단계 (1:정상, 2:관심, 3:주의, 4:경계, 5:심각)

#### 3.2 위기경보 (Code: 41)
- **Data Format**: `[{col0:"2"}]`
- **Data Description**:
  - col0: 경보단계 (1:정상, 2:관심, 3:주의, 4:경계, 5:심각)

#### 3.3 위기경보 ver2 (Code: 51)
- **Data Format**: `[{col0:"2"}]`
- **Data Description**:
  - col0: 경보단계 (1:관심, 2:주의, 3:경계, 4:심각)

### 4. Chart Contents (차트)

#### 4.1 선형/영역 차트 (Code: 4, 5)
- **Data Format**:
```json
{
  "timesArr": ["17:00", "17:05", "17:10", ...],
  "data": [
    {
      "color": "",
      "values": [
        {"x": 0, "y": 142},
        {"x": 1, "y": 142},
        ...
      ],
      "key": "INBOUND BPS(Mbps)"
    },
    {
      "color": "",
      "values": [
        {"x": 0, "y": 312},
        ...
      ],
      "key": "INBOUND PP"
    }
  ]
}
```
- **Data Description**:
  - timesArr: 시간 배열
  - data: 데이터 시리즈 배열
    - color: 색상
    - values: x, y 좌표 배열
    - key: 시리즈 이름

## 구현 요구사항

1. **모든 테이블 타입 구현**: 코드 1,2,3,25,28,29,35,40
2. **모든 라벨 타입 구현**: 코드 9,10,11,13,15,17,20,26,27,30,33,34,36,37,38,39,44,45,46,47
3. **모든 위기경보 타입 구현**: 코드 24,41,51
4. **모든 차트 타입 구현**: 코드 4,5 (선형/영역 차트)
5. **데이터 포맷 정확히 준수**: 각 컨텐츠별 데이터 구조 정확히 구현
6. **필드 타입 지원**: 문자, 숫자, 국가코드, 색상, IP 등 모든 필드 타입 지원
7. **HTML 포맷팅 지원**: 테이블/라벨의 일부 필드에서 HTML 태그 지원
