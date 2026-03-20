# case-manager

법률 사건 관리 앱. Google 로그인 + Firebase Firestore 기반 실시간 데이터 저장.

## Firebase 설정

### 1. Firebase 프로젝트 생성

1. [Firebase Console](https://console.firebase.google.com/)에서 새 프로젝트 생성
2. **Authentication** > Sign-in method > Google 활성화
3. **Firestore Database** > 데이터베이스 만들기 (테스트 모드로 시작)

### 2. 환경변수 설정

프로젝트 설정 > 일반 > 내 앱에서 웹 앱 구성 값을 복사 후 `.env` 파일 생성:

```bash
cp .env.example .env
```

`.env` 파일에 값 입력:

```
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc...
```

### 3. Firestore 보안 규칙

Firebase Console > Firestore Database > 규칙:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/cases/{caseId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### 4. 개발 서버 실행

```bash
npm install
npm run dev
```

## 데이터 구조

```
Firestore
└── users/
    └── {uid}/
        └── cases/
            └── {caseId}   ← 사건 document
```

신규 로그인 유저는 자동으로 샘플 사건 5건이 초기 저장됩니다.
