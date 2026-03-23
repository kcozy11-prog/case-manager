import { auth, provider } from "../firebase";
import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";

export default function LoginScreen({ onToken }) {
  const handleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      const cred = GoogleAuthProvider.credentialFromResult(result);
      if (cred?.accessToken && onToken) onToken(cred.accessToken);
    } catch (e) {
      console.error("로그인 오류:", e);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-slate-900">
      <div className="bg-white rounded-2xl shadow-2xl p-10 flex flex-col items-center gap-6 w-80">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)", boxShadow: "0 2px 8px rgba(99,102,241,0.4)" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L3 7V9H21V7L12 2Z" fill="white" opacity="0.9"/>
            <rect x="5" y="10" width="2.5" height="8" rx="0.5" fill="white" opacity="0.8"/>
            <rect x="10.75" y="10" width="2.5" height="8" rx="0.5" fill="white" opacity="0.8"/>
            <rect x="16.5" y="10" width="2.5" height="8" rx="0.5" fill="white" opacity="0.8"/>
            <rect x="3" y="18.5" width="18" height="2.5" rx="0.5" fill="white" opacity="0.9"/>
          </svg>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-slate-900 mb-1">사건 관리</div>
          <div className="text-sm text-slate-400">Google 계정으로 로그인하세요</div>
        </div>
        <button
          onClick={handleSignIn}
          className="w-full flex items-center justify-center gap-3 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Google로 로그인
        </button>
      </div>
    </div>
  );
}
