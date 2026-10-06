// 앱 로고: 홈 화면 아이콘과 같은 '정의의 저울'(짙은 남색 바탕 + 금색 저울).
// 상단 헤더(32px)와 로그인 화면(48px)에서 함께 쓴다. 그림 좌표는 홈 화면 아이콘(512 기준)과 같고,
// 작은 크기에서도 보이도록 저울 줄만 조금 굵게 그린다.
const GOLD = "#E6B652";

export default function AppLogo({ size = 32 }) {
  const box = Math.round(size);
  const mark = Math.round(size * 0.74);
  return (
    <div
      className="flex items-center justify-center flex-shrink-0"
      style={{
        width: box,
        height: box,
        borderRadius: Math.round(box * 0.25),
        background: "linear-gradient(180deg, #1F2B47 0%, #0A1020 100%)",
        boxShadow: "inset 0 0 0 1px rgba(226,178,76,0.45), 0 2px 8px rgba(0,0,0,0.35)",
      }}
      role="img"
      aria-label="사건 관리"
    >
      <svg width={mark} height={mark} viewBox="72 75 368 368" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <g fill="none" stroke={GOLD} strokeWidth="12" strokeLinecap="round">
          <path d="M140 190 L94 280 M140 190 L186 280" />
          <path d="M372 190 L326 280 M372 190 L418 280" />
        </g>
        <g fill={GOLD}>
          <rect x="246" y="140" width="20" height="218" rx="8" />
          <rect x="122" y="174" width="268" height="16" rx="8" />
          <circle cx="256" cy="182" r="20" />
          <circle cx="256" cy="128" r="16" />
          <circle cx="140" cy="182" r="11" />
          <circle cx="372" cy="182" r="11" />
          <path d="M82 280 H198 A58 36 0 0 1 82 280 Z" />
          <path d="M314 280 H430 A58 36 0 0 1 314 280 Z" />
          <path d="M218 356 H294 L322 386 H190 Z" stroke={GOLD} strokeWidth="10" strokeLinejoin="round" />
          <rect x="160" y="388" width="192" height="18" rx="9" />
        </g>
      </svg>
    </div>
  );
}
