import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Bird,
  Wind,
  Database,
  Settings,
  Info,
  Camera,
  MapPin,
  Send,
  AlertTriangle,
  Check,
  X,
  Activity,
  ChevronRight,
  FileText,
  User,
  LogIn,
  LogOut,
  Upload,
  Image as ImageIcon,
  Grid3x3,
  AlignJustify,
  Map as MapIcon,
  BarChart3,
  PieChart,
  Heart,
  Users,
  Mail,
  BookOpen,
  MessageSquare,
  Search,
  Edit2,
  Trash2,
} from "lucide-react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  setPersistence,
  browserSessionPersistence,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  updateDoc,
  doc,
  deleteDoc,
} from "firebase/firestore";

// ==========================================
// 1. Firebase 初始化與環境設定
// ==========================================
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MSSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};
const globalAppId = "featherguard-app-v1";

let app, auth, db;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.error("Firebase initialization failed", e);
}

// ==========================================
// 2. Gemini AI 與通用工具
// ==========================================
const callGemini = async (prompt, base64Image) => {
  // 請填入你「重新產生」的新  Key
  const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: "image/png", data: base64Image } },
          ],
        },
      ],
    }),
  });

  const responseText = await response.text(); // 先以文字格式讀取

  if (!response.ok) {
    console.error("API 錯誤回應:", responseText);
    throw new Error(`API 請求失敗，狀態碼: ${response.status}`);
  }

  try {
    const data = JSON.parse(responseText);
    return data.candidates[0].content.parts[0].text;
  } catch (e) {
    throw new Error("無法解析 API 回傳的資料結構");
  }
};

const processImage = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > height) {
          if (width > 800) {
            height *= 800 / width;
            width = 800;
          }
        } else {
          if (height > 800) {
            width *= 800 / height;
            height = 800;
          }
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
};

// ==========================================
// 3. 通用 UI 元件
// ==========================================
const GlassCard = ({ children, className = "", onClick = null }) => (
  <div
    onClick={onClick}
    className={`bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border border-white/50 dark:border-slate-700/50 shadow-[0_8px_32px_0_rgba(20,184,166,0.15)] rounded-3xl p-6 md:p-8 transition-all duration-300 ${className}`}
  >
    {children}
  </div>
);

const Button = ({
  children,
  onClick,
  variant = "primary",
  className = "",
  disabled = false,
  icon: Icon,
}) => {
  const baseStyle =
    "flex items-center justify-center gap-2 px-6 py-3 rounded-2xl font-semibold transition-all duration-300 transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary:
      "bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white shadow-lg shadow-teal-500/30",
    secondary:
      "bg-white/50 hover:bg-white/70 dark:bg-slate-800/50 dark:hover:bg-slate-800/70 text-teal-800 dark:text-teal-200 border border-teal-200 dark:border-teal-800 shadow-sm",
    danger:
      "bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-400 hover:to-rose-400 text-white shadow-lg shadow-red-500/30",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyle} ${variants[variant]} ${className}`}
    >
      {Icon && <Icon size={20} />} {children}
    </button>
  );
};

// ==========================================
// 4. 主應用程式 (Single Page App)
// ==========================================
export default function App() {
  // 全域狀態
  const [currentPage, setCurrentPage] = useState("rescue");
  const [user, setUser] = useState(null);
  const [toast, setToast] = useState(null);

  // 資料庫資料
  const [reports, setReports] = useState([]);
  const [contactMessages, setContactMessages] = useState([]);
  const [personnel, setPersonnel] = useState([]);

  // --- 狀態：鳥類救傷 ---
  const rescueFileInputRef = useRef(null);
  const mapIframeRef = useRef(null);
  const [rescueStep, setRescueStep] = useState("info");
  const [rescuePhoto, setRescuePhoto] = useState(null);
  const [rescueAIResult, setRescueAIResult] = useState("");
  const [rescueAIReport, setRescueAIReport] = useState(null);
  const [showRescueAIPopup, setShowRescueAIPopup] = useState(false);
  const [isRescueAILoading, setIsRescueAILoading] = useState(false);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false); // 加上這行來控制按鈕狀態
  const [formData, setFormData] = useState({
    name: "",
    age: "",
    date: "",
    location: "",
    lat: "",
    lon: "",
    notes: "",
    species: "",
    status: "",
  });

  // --- 狀態：窗殺預防 ---
  const windowFileInputRef = useRef(null);
  const [windowPhoto, setWindowPhoto] = useState(null);
  const [windowAIResult, setWindowAIResult] = useState("");
  const [windowAIReport, setWindowAIReport] = useState(null);
  const [showWindowAIPopup, setShowWindowAIPopup] = useState(false);
  const [isWindowAILoading, setIsWindowAILoading] = useState(false);
  const [windowTemplate, setWindowTemplate] = useState("none");

  // --- 狀態：後台管理 ---
  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");
  const [adminView, setAdminView] = useState("reports");
  const [deleteTarget, setDeleteTarget] = useState(null);

  // --- 狀態：關於我們 (聯絡表單) ---
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmittingContact, setIsSubmittingContact] = useState(false);
  const [contactFormData, setContactFormData] = useState({
    name: "",
    contactInfo: "",
    type: "聯絡我們去他們那裡宣導防治窗殺",
    message: "",
  });

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // 初始化與資料綁定 (加入防呆機制避免網路錯誤)
  useEffect(() => {
    if (!auth) {
      setUser({ uid: "local-demo", isAnonymous: true });
      return;
    }
    const initAuth = async () => {
      try {
        await setPersistence(auth, browserSessionPersistence);
        if (!auth.currentUser) {
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.error("Auth error", e);
        // 網路被擋時的安全後備
        setUser({ uid: "local-demo", isAnonymous: true });
      }
      onAuthStateChanged(auth, (u) => {
        if (u) setUser(u);
        else if (!user) setUser({ uid: "local-demo", isAnonymous: true });
      });
    };
    initAuth();
  }, []);

  // 新增：當使用者登入且有姓名時，自動帶入通報表單
  useEffect(() => {
    if (user && !user.isAnonymous && user.displayName) {
      setFormData((prev) => ({ ...prev, name: user.displayName }));
    }
  }, [user]);

  useEffect(() => {
    if (!user || !db) return;
    const unsubR = onSnapshot(
      collection(
        db,
        "artifacts",
        globalAppId,
        "public",
        "data",
        "bird_reports"
      ),
      (snap) =>
        setReports(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort(
              (a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0)
            )
        )
    );
    const unsubC = onSnapshot(
      collection(
        db,
        "artifacts",
        globalAppId,
        "public",
        "data",
        "contact_messages"
      ),
      (snap) =>
        setContactMessages(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort(
              (a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0)
            )
        )
    );
    const unsubP = onSnapshot(
      collection(db, "artifacts", globalAppId, "public", "data", "personnel"),
      (snap) =>
        setPersonnel(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort(
              (a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0)
            )
        )
    );
    return () => {
      unsubR();
      unsubC();
      unsubP();
    };
  }, [user]);

  // 救傷地圖通訊
  useEffect(() => {
    const handleMessage = async (e) => {
      if (e.data?.type === "PICK_LOCATION") {
        const { lat, lon, location: mapAddress } = e.data;

        // 如果已經有地址(例如用搜尋列找到的)，就直接用
        if (mapAddress) {
          setFormData((prev) => ({ ...prev, lat, lon, location: mapAddress }));
          return;
        }

        // 否則透過 API 逆向解析真實地址
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=zh-TW`
          );
          const data = await res.json();

          if (data && data.address) {
            const a = data.address;
            const road = a.road || a.pedestrian || a.street || "";
            const num = a.house_number || "";
            const landmark =
              a.amenity || a.building || a.shop || a.tourism || a.leisure || "";
            const city = a.city || a.town || a.village || a.county || "";
            const district = a.suburb || a.district || "";

            let finalStr = "";
            if (road && num) {
              finalStr = `${city}${district}${road}${num}號`;
            } else if (road) {
              finalStr = `${city}${district}${road}附近`;
            } else if (landmark) {
              finalStr = `在 ${landmark} 附近 (${city}${district})`;
            } else if (data.display_name) {
              // 把過長的國家等資訊濾掉，取最前面的核心地址
              finalStr = data.display_name.split(",")[0];
            } else {
              finalStr = `座標: ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
            }
            setFormData((prev) => ({ ...prev, lat, lon, location: finalStr }));
          } else {
            setFormData((prev) => ({
              ...prev,
              lat,
              lon,
              location: `座標: ${lat.toFixed(4)}, ${lon.toFixed(4)}`,
            }));
          }
        } catch (err) {
          setFormData((prev) => ({
            ...prev,
            lat,
            lon,
            location: `座標: ${lat.toFixed(4)}, ${lon.toFixed(4)}`,
          }));
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);
  useEffect(() => {
    if (
      mapIframeRef.current &&
      mapIframeRef.current.contentWindow &&
      formData.lat &&
      formData.lon
    ) {
      mapIframeRef.current.contentWindow.postMessage(
        { type: "UPDATE_MAP", lat: formData.lat, lon: formData.lon },
        "*"
      );
    }
  }, [formData.lat, formData.lon]);

  // 取得手機/裝置目前 GPS 定位（不需輸入地址），沿用既有的 PICK_LOCATION 訊息機制自動反查地址並更新地圖
  const [isLocating, setIsLocating] = useState(false);
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      showToast("此裝置不支援定位功能", "error");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        // 透過既有的 window message 監聽機制（handleMessage）處理反查地址與更新表單
        window.postMessage(
          { type: "PICK_LOCATION", lat: latitude, lon: longitude },
          "*"
        );
        showToast("已取得目前定位");
        setIsLocating(false);
      },
      (err) => {
        console.error("定位失敗:", err);
        showToast("定位失敗，請確認已允許定位權限", "error");
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // 全域登入登出
  const handleGoogleLogin = async () => {
    if (!auth) return showToast("無法連線", "error");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);

      // 登入成功後，將會員資料寫入 personnel (也就是會員/人員名單)
      if (db && result.user) {
        // 使用動態載入以避免影響您最上方的 import
        const { setDoc, doc } = await import("firebase/firestore");
        await setDoc(
          doc(
            db,
            "artifacts",
            globalAppId,
            "public",
            "data",
            "personnel",
            result.user.uid
          ),
          {
            uid: result.user.uid,
            name: result.user.displayName || "未提供姓名",
            email: result.user.email || "未提供信箱",
            photoURL: result.user.photoURL || "",
            timestamp: new Date().toISOString(), // 配合您下方資料讀取時的 timestamp 排序
          },
          { merge: true }
        );
      }

      showToast("登入成功");
    } catch (e) {
      console.error("登入錯誤:", e);
      // 將錯誤訊息印在畫面上，幫助您釐清為何一直登入失敗
      showToast(`登入失敗: ${e.message}`, "error");
    }
  };
  const handleGoogleLogout = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
      await signInAnonymously(auth);
      setIsAdminAuth(false);
      showToast("已登出");
    } catch (e) {
      showToast("登出失敗", "error");
    }
  };

  // ==========================================
  // 各分頁處理邏輯
  // ==========================================

  // [救傷]
  const handleRescuePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRescuePhoto(await processImage(file));
    setRescueAIResult("");
    setRescueAIReport(null);
  };
  const handleRescueAI = async () => {
    setIsRescueAILoading(true);
    const p = `你是專業野生鳥類救傷獸醫。看圖回覆純JSON：{"species":"鳥種猜測","status":"傷況評估","advice":"初步處置建議"}`;
    try {
      const r = await callGemini(p, rescuePhoto.split(",")[1]);
      const cleanedResult = r
        .replace(/\`\`\`json/g, "")
        .replace(/\`\`\`/g, "")
        .trim();
      const match = cleanedResult.match(/\{[\s\S]*\}/);
      const data = JSON.parse(match ? match[0] : cleanedResult);
      setRescueAIReport(data);
      setFormData((prev) => ({ ...prev, species: data.species }));
      setShowRescueAIPopup(true);
    } catch (e) {
      console.error(e);
      showToast("AI解析失敗", "error");
      setRescueAIResult("無法解析格式，請手動填寫。");
    }
    setIsRescueAILoading(false);
  };
  const handleReportSubmit = async () => {
    if (!formData.name) return showToast("請填寫姓名", "error");

    // 1. 防呆：如果正在送出中，直接擋掉後續的點擊
    if (isSubmittingReport) return;
    setIsSubmittingReport(true);

    try {
      if (db) {
        await addDoc(
          collection(
            db,
            "artifacts",
            globalAppId,
            "public",
            "data",
            "bird_reports"
          ),
          {
            ...formData,
            photo: rescuePhoto,
            aiResult: rescueAIReport
              ? JSON.stringify(rescueAIReport)
              : rescueAIResult,
            timestamp: new Date().toISOString(),
            userId: user?.uid || "anonymous",
            reviewStatus: "pending", // 通報審核狀態（獨立欄位，不與鳥類傷況 status 混用）
          }
        );
        showToast("通報成功！");
      }
      // 2. 成功後清空資料，並切換回首頁指引
      setRescueStep("info");
      setRescuePhoto(null);
      setRescueAIReport(null);
      setFormData({
        name: "",
        age: "",
        date: "",
        location: "",
        lat: "",
        lon: "",
        notes: "",
        species: "",
        status: "",
      });
      setCurrentPage("rescue"); // 確保畫面回到首頁(鳥類救傷頁)
    } catch (error) {
      // 3. 錯誤處理
      console.error(error);
      showToast("通報失敗，請重試", "error");
    } finally {
      // 4. 無論成功或失敗，解除鎖定狀態
      setIsSubmittingReport(false);
    }
  };

  // [窗殺]
  const handleWindowPhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setWindowPhoto(await processImage(file));
    setWindowAIResult("");
    setWindowAIReport(null);
    setWindowTemplate("none");
  };
  const handleWindowAI = async () => {
    setIsWindowAILoading(true);
    // 修改提示詞：嚴格要求依照 左上、右上、右下、左下 順序，這樣才能正確計算傾斜角度
    const p = `你是防窗殺專家。看圖回覆純JSON：{"riskLevel":"高/中/低","reasons":"原因","advice":"建議","windowPanes":[[{"x":0,"y":0},{"x":100,"y":0},{"x":100,"y":100},{"x":0,"y":100}]]} (請精準找出每片玻璃的4個百分比頂點座標，必須嚴格依照「左上、右上、右下、左下」的順序，多片玻璃就多組，若無窗戶則空陣列[])`;
    try {
      const r = await callGemini(p, windowPhoto.split(",")[1]);
      const cleanedResult = r
        .replace(/\`\`\`json/g, "")
        .replace(/\`\`\`/g, "")
        .trim();
      const match = cleanedResult.match(/\{[\s\S]*\}/);
      const data = JSON.parse(match ? match[0] : cleanedResult);
      setWindowAIReport(data);
      setShowWindowAIPopup(true);
    } catch (e) {
      console.error(e);
      showToast("AI解析失敗", "error");
      setWindowAIResult("無法解析，請重試。");
    }
    setIsWindowAILoading(false);
  };

  // [後台]
  const handleAdminLogin = () => {
    if (loginPassword === "0306") {
      setIsAdminAuth(true);
      setShowLoginModal(false);
      setLoginPassword("");
      showToast("管理員登入成功");
    } else {
      showToast("密碼錯誤", "error");
    }
  };
  const executeDelete = async () => {
    if (!deleteTarget || !db) return;
    const { id, type } = deleteTarget;
    const coll =
      type === "report"
        ? "bird_reports"
        : type === "contact"
        ? "contact_messages"
        : "personnel";
    try {
      await deleteDoc(
        doc(db, "artifacts", globalAppId, "public", "data", coll, id)
      );
      showToast("已刪除");
    } catch (e) {
      showToast("刪除失敗", "error");
    }
    setDeleteTarget(null);
  };

  // [關於/聯絡]
  const submitContactForm = async () => {
    if (!contactFormData.name || !contactFormData.message)
      return showToast("請填寫必填欄位", "error");

    if (isSubmittingContact) return; // 防呆：避免重複送出
    setIsSubmittingContact(true);

    try {
      if (db) {
        await addDoc(
          collection(
            db,
            "artifacts",
            globalAppId,
            "public",
            "data",
            "contact_messages"
          ),
          {
            ...contactFormData,
            userId: user?.uid || "anonymous",
            timestamp: new Date().toISOString(), // 時間由函數自動填寫
          }
        );
        showToast("聯絡表單已送出！");
        setIsFormOpen(false);
        setContactFormData({
          name: "",
          contactInfo: "",
          type: "聯絡我們去他們那裡宣導防治窗殺",
          message: "",
        });
      }
    } catch (error) {
      console.error(error);
      showToast("送出失敗", "error");
    } finally {
      setIsSubmittingContact(false); // 確保按鈕一定會恢復
    }
  };

  // ==========================================
  // UI 渲染區塊
  // ==========================================
  const navItems = [
    { id: "rescue", label: "鳥類救傷", icon: Bird },
    { id: "window", label: "窗殺預防", icon: Wind },
    { id: "data", label: "數據資料", icon: Database },
    { id: "admin", label: "後台管理", icon: Settings },
    { id: "about", label: "關於我們", icon: Info },
  ];

  const renderRescuePage = () =>
    rescueStep === "report_form" ? (
      <div className="max-w-4xl mx-auto animate-fade-in">
        <button
          onClick={() => setRescueStep("info")}
          className="flex items-center text-teal-700 dark:text-teal-300 mb-6 hover:underline"
        >
          <ChevronRight className="rotate-180 mr-1" size={20} /> 返回救傷指引
        </button>
        <GlassCard>
          <h2 className="text-3xl font-extrabold text-teal-800 dark:text-teal-200 mb-8 flex items-center gap-3">
            <FileText className="text-emerald-500" /> 填寫通報表單
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  鳥類資訊
                </label>
                <div className="flex gap-4">
                  <input
                    type="text"
                    placeholder="鳥種"
                    className="w-full p-3 rounded-xl bg-white/50 dark:bg-black/40 border border-teal-200/50 outline-none focus:ring-2 focus:ring-teal-500"
                    value={formData.species}
                    onChange={(e) =>
                      setFormData({ ...formData, species: e.target.value })
                    }
                  />
                  <select
                    className="w-full p-3 rounded-xl bg-white/50 dark:bg-black/40 border border-teal-200/50 outline-none"
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value })
                    }
                  >
                    <option value="" disabled>
                      請選擇狀態
                    </option>
                    <option value="受傷">受傷</option>
                    <option value="生病">生病</option>
                    <option value="落巢/幼鳥">落巢/幼鳥</option>
                    <option value="死亡">死亡</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-4">
                <input
                  type="text"
                  placeholder="姓名 *"
                  className="w-full p-3 rounded-xl bg-white/50 dark:bg-black/40 border border-teal-200/50 outline-none"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
                <input
                  type="text"
                  placeholder="地點"
                  className="w-full p-3 rounded-xl bg-white/50 dark:bg-black/40 border border-teal-200/50 outline-none"
                  value={formData.location}
                  onChange={(e) =>
                    setFormData({ ...formData, location: e.target.value })
                  }
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-semibold">
                    點擊地圖定位
                  </label>
                  <button
                    type="button"
                    onClick={handleUseCurrentLocation}
                    disabled={isLocating}
                    className="flex items-center gap-1.5 text-xs font-bold text-teal-700 bg-teal-100 hover:bg-teal-200 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-full transition-colors"
                  >
                    <MapPin size={14} />
                    {isLocating ? "定位中..." : "使用目前位置"}
                  </button>
                </div>
                <div className="h-48 rounded-xl overflow-hidden border border-teal-200/50">
                  <iframe
                    ref={mapIframeRef}
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    srcDoc={`<!DOCTYPE html><html><head><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" /><link rel="stylesheet" href="https://unpkg.com/leaflet-control-geocoder/dist/Control.Geocoder.css" /><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script src="https://unpkg.com/leaflet-control-geocoder/dist/Control.Geocoder.js"></script><style>body{margin:0;padding:0;}#map{width:100vw;height:100vh;cursor:crosshair;}</style></head><body><div id="map"></div><script>let map=L.map('map').setView([23.5, 121.0],7);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);let marker;L.Control.geocoder({defaultMarkGeocode:false,placeholder:"搜尋地址..."}).on('markgeocode',function(e){const center=e.geocode.center;map.setView(center,16);if(marker){marker.setLatLng(center);}else{marker=L.marker(center).addTo(map);}window.parent.postMessage({type:'PICK_LOCATION',lat:center.lat,lon:center.lng,location:e.geocode.name},'*');}).addTo(map);map.on('click',function(e){if(marker)marker.setLatLng(e.latlng);else marker=L.marker(e.latlng).addTo(map);window.parent.postMessage({type:'PICK_LOCATION',lat:e.latlng.lat,lon:e.latlng.lng},'*');});window.addEventListener('message',function(e){if(e.data.type==='UPDATE_MAP'){map.setView([e.data.lat,e.data.lon],16);if(marker)marker.setLatLng([e.data.lat,e.data.lon]);else marker=L.marker([e.data.lat,e.data.lon]).addTo(map);}});</script></body></html>`}
                  ></iframe>
                </div>
              </div>
            </div>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold mb-2">
                  照片與 AI 評估結果
                </label>
                {rescuePhoto ? (
                  <img
                    src={rescuePhoto}
                    className="w-full h-40 object-cover rounded-xl mb-3 shadow-md"
                    alt="預覽"
                  />
                ) : (
                  <div className="w-full h-40 bg-teal-50/50 rounded-xl mb-3 flex items-center justify-center border border-dashed border-teal-200">
                    無照片
                  </div>
                )}
                <textarea
                  className="w-full p-3 rounded-xl bg-white/50 border border-teal-200/50 h-32 text-sm outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="AI 辨識結果 (可手動修改)..."
                  value={rescueAIResult}
                  onChange={(e) => setRescueAIResult(e.target.value)}
                ></textarea>
              </div>
              <textarea
                className="w-full p-3 rounded-xl bg-white/50 border border-teal-200/50 h-24"
                placeholder="其他備註事項..."
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
              ></textarea>
            </div>
          </div>
          <div className="mt-8 flex justify-end">
            <Button
              onClick={handleReportSubmit}
              disabled={isSubmittingReport}
              icon={Send}
            >
              {isSubmittingReport ? "傳送中..." : "送出通報"}
            </Button>
          </div>
        </GlassCard>
      </div>
    ) : (
      <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-12">
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-emerald-600 mb-4">
            守護飛羽，從你我開始
          </h1>
          <p className="text-slate-600 dark:text-slate-300 text-lg">
            發現受傷鳥類？請使用 AI 辨識系統進行初步評估，並進行通報。
          </p>
        </div>

        {/* 原有區塊：上傳與辨識結果 */}
        <GlassCard>
          <div className="flex flex-col md:flex-row gap-8">
            <div className="flex-1 space-y-6">
              <h3 className="text-2xl font-bold text-teal-800">
                上傳照片與評估
              </h3>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                ref={rescueFileInputRef}
                onChange={handleRescuePhotoUpload}
              />
              <Button
                onClick={() => rescueFileInputRef.current.click()}
                variant="secondary"
                icon={Camera}
                className="w-full"
              >
                拍照 / 上傳
              </Button>
              {rescuePhoto && (
                <div className="relative rounded-2xl overflow-hidden shadow-lg">
                  <img
                    src={rescuePhoto}
                    className="w-full h-64 object-cover"
                    alt="預覽"
                  />
                  {isRescueAILoading && (
                    <div className="absolute inset-0 bg-white/70 flex flex-col items-center justify-center">
                      <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  )}
                </div>
              )}
              {rescuePhoto && !isRescueAILoading && (
                <Button
                  onClick={handleRescueAI}
                  icon={Activity}
                  className="w-full"
                >
                  執行 AI 傷況辨識
                </Button>
              )}
            </div>
            <div className="flex-1 flex flex-col">
              <h3 className="text-2xl font-bold text-teal-800 mb-6">
                辨識結果
              </h3>
              <div className="flex-1 bg-white/40 rounded-2xl p-6 border border-teal-100 min-h-[250px] overflow-y-auto">
                {rescueAIReport ? (
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-teal-800 font-bold mb-1 flex items-center gap-2">
                        <Bird size={16} /> 鳥種
                      </h4>
                      <p className="bg-white/50 p-3 rounded-xl">
                        {rescueAIReport.species}
                      </p>
                    </div>
                    <div>
                      <h4 className="text-rose-700 font-bold mb-1 flex items-center gap-2">
                        <AlertTriangle size={16} /> 受傷情況
                      </h4>
                      <p className="bg-white/50 p-3 rounded-xl">
                        {rescueAIReport.status}
                      </p>
                    </div>
                    <div>
                      <h4 className="text-emerald-700 font-bold mb-1 flex items-center gap-2">
                        <Check size={16} /> 建議
                      </h4>
                      <p className="bg-white/50 p-3 rounded-xl">
                        {rescueAIReport.advice}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-teal-600/50">
                    等待照片與 AI 辨識...
                  </div>
                )}
              </div>
              <div className="mt-6">
                <Button
                  onClick={() => setRescueStep("report_form")}
                  icon={AlertTriangle}
                  variant="primary"
                  className="w-full py-4 text-lg"
                >
                  我要通報 (建立紀錄)
                </Button>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* 原有區塊：野鳥救傷 4 步驟 SOP */}
        <GlassCard>
          <h3 className="text-2xl font-bold text-teal-800 mb-6 flex items-center gap-2">
            <AlertTriangle className="text-amber-500" /> 正確野鳥救傷 4 步驟
            (SOP)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/60 p-5 rounded-2xl border border-teal-100/50 text-center space-y-3">
              <div className="w-12 h-12 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center mx-auto mb-2 font-black text-xl">
                1
              </div>
              <h4 className="font-bold text-teal-800">觀察確認</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                先判斷是正在學飛的健康幼鳥（通常親鳥在附近），還是真正受傷、生病需要救援的個體，切勿馬上撿拾。
              </p>
            </div>

            <div className="bg-white/60 p-5 rounded-2xl border border-teal-100/50 text-center space-y-3">
              <div className="w-12 h-12 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center mx-auto mb-2 font-black text-xl">
                2
              </div>
              <h4 className="font-bold text-teal-800">安全保定</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                請戴上手套或利用毛巾、外套輕輕將鳥兒罩住並抓起，遮蔽視線能幫助牠們穩定情緒，避免掙扎受傷。
              </p>
            </div>

            <div className="bg-red-50/50 p-5 rounded-2xl border border-red-200 text-center space-y-3 relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-red-500 text-white text-[10px] px-2 py-1 rounded-bl-lg font-bold">
                極重要
              </div>
              <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-2 font-black text-xl">
                3
              </div>
              <h4 className="font-bold text-red-800">安置與禁食</h4>
              <p className="text-xs text-slate-700 leading-relaxed">
                放入戳有透氣孔、底墊報紙的暗紙箱中。
                <strong className="text-red-600 block mt-1">
                  絕對不可強迫餵食或餵水，極易造成嗆傷致死！
                </strong>
              </p>
            </div>

            <div className="bg-white/60 p-5 rounded-2xl border border-teal-100/50 text-center space-y-3">
              <div className="w-12 h-12 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center mx-auto mb-2 font-black text-xl">
                4
              </div>
              <h4 className="font-bold text-teal-800">通報送醫</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                保持紙箱溫暖與環境安靜，盡速填寫上方通報表單，並聯繫所在地野鳥救傷學會或動保處協助處理。
              </p>
            </div>
          </div>
        </GlassCard>

        {/* 新增區塊：各縣市野鳥救傷通報電話 */}
        <GlassCard>
          <h3 className="text-2xl font-bold text-teal-800 mb-6 flex items-center gap-2">
            <AlertTriangle className="text-teal-500" /> 各縣市野鳥救傷通報電話
          </h3>

          <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 mb-6 text-center">
            <p className="text-teal-800 font-black text-lg tracking-wide">
              全國動物保護專線：1959
            </p>
            <p className="text-sm text-teal-600 mt-1 font-semibold">
              若不知道該打給哪個單位，可直接手機直撥
              1959，將自動轉接至您所在地的動保機關。
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                region: "北部",
                items: [
                  { name: "台北市野鳥學會", phone: "02-8732-8891" },
                  { name: "新北市動保處", phone: "02-2959-6353" },
                  { name: "桃園市野鳥學會", phone: "03-336-6593" },
                  { name: "新竹市野鳥學會", phone: "03-572-8666" },
                ],
              },
              {
                region: "中部",
                items: [
                  { name: "台中市野生動物學會", phone: "04-2702-5813" },
                  { name: "野生動物急救站", phone: "049-276-1331" },
                ],
              },
              {
                region: "南部",
                items: [
                  { name: "台南市野鳥學會", phone: "06-213-8310" },
                  { name: "高雄市野鳥學會", phone: "07-215-2525" },
                  { name: "屏科大收容中心", phone: "08-774-0414" },
                ],
              },
              {
                region: "東部及離島",
                items: [
                  { name: "宜蘭縣動植物防疫所", phone: "03-960-2350" },
                  { name: "花蓮縣野鳥學會", phone: "03-833-4416" },
                  { name: "台東縣野鳥學會", phone: "089-346-608" },
                  { name: "金門野生動物救援協會", phone: "082-333-280" },
                ],
              },
            ].map((group) => (
              <div key={group.region} className="space-y-3">
                <h4 className="font-extrabold text-teal-700 border-b border-teal-100 pb-2 mb-3">
                  {group.region}
                </h4>
                <ul className="space-y-3">
                  {group.items.map((org) => (
                    <li
                      key={org.name}
                      className="bg-white/50 p-3 rounded-xl border border-teal-50 hover:bg-white transition-colors shadow-sm"
                    >
                      <div className="text-xs font-bold text-slate-500 mb-1">
                        {org.name}
                      </div>
                      <a
                        href={`tel:${org.phone.replace(/-/g, "")}`}
                        className="text-teal-700 font-black text-sm hover:text-teal-500 transition-colors block"
                      >
                        📞 {org.phone}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    );

  const renderWindowPage = () => (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-cyan-600 mb-4">
          消除隱形殺手：窗殺預防
        </h1>
        <p className="text-slate-600 dark:text-slate-300 text-lg">
          上傳窗戶照片，讓 AI 評估風險並預覽防撞模板效果。
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <GlassCard className="flex flex-col space-y-6">
          <h3 className="text-2xl font-bold text-emerald-800">1. 上傳與評估</h3>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            ref={windowFileInputRef}
            onChange={handleWindowPhotoUpload}
          />
          <Button
            onClick={() => windowFileInputRef.current.click()}
            variant="secondary"
            icon={Upload}
          >
            上傳窗戶 / 玻璃建築照片
          </Button>
          <div className="flex-1 bg-white/40 rounded-2xl p-6 border border-emerald-100 min-h-[200px] overflow-y-auto">
            {windowAIReport ? (
              <div className="space-y-4 text-left">
                <div>
                  <h4 className="text-rose-700 font-bold">
                    <AlertTriangle size={16} className="inline mr-2" />
                    風險等級
                  </h4>
                  <p className="bg-white/50 p-3 rounded-xl mt-1">
                    {windowAIReport.riskLevel}
                  </p>
                </div>
                <div>
                  <h4 className="text-teal-800 font-bold">
                    <Info size={16} className="inline mr-2" />
                    風險原因
                  </h4>
                  <p className="bg-white/50 p-3 rounded-xl mt-1">
                    {windowAIReport.reasons}
                  </p>
                </div>
                <div>
                  <h4 className="text-emerald-700 font-bold">
                    <Check size={16} className="inline mr-2" />
                    改善建議
                  </h4>
                  <p className="bg-white/50 p-3 rounded-xl mt-1">
                    {windowAIReport.advice}
                  </p>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-emerald-600/50">
                <Wind size={48} className="mb-4 opacity-50" />
                <p>上傳照片後，點擊下方按鈕進行評估</p>
              </div>
            )}
          </div>
          <Button
            onClick={handleWindowAI}
            disabled={!windowPhoto || isWindowAILoading}
            icon={Activity}
            className="w-full"
          >
            {isWindowAILoading ? "AI 評估中..." : "執行 AI 風險評估"}
          </Button>
        </GlassCard>
        <GlassCard className="flex flex-col space-y-6">
          <h3 className="text-2xl font-bold text-emerald-800">
            2. 預覽防撞措施
          </h3>
          <div className="flex gap-2 p-1 bg-white/40 rounded-xl">
            {[
              { id: "none", label: "原圖", icon: ImageIcon },
              { id: "dots", label: "點陣", icon: Grid3x3 },
              { id: "lines", label: "線條", icon: AlignJustify },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setWindowTemplate(t.id)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold flex justify-center gap-1 transition-all ${
                  windowTemplate === t.id
                    ? "bg-emerald-500 text-white shadow-md"
                    : "text-slate-600 hover:bg-white/50"
                }`}
              >
                <t.icon size={16} /> {t.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 rounded-2xl overflow-hidden shadow-xl bg-slate-200 flex items-center justify-center min-h-[300px]">
            {!windowPhoto ? (
              <ImageIcon size={64} className="text-slate-400/50" />
            ) : (
              <>
                <img
                  src={windowPhoto}
                  className="absolute inset-0 w-full h-full object-cover"
                  alt="窗戶"
                />
                {windowTemplate !== "none" &&
                  windowAIReport?.windowPanes?.map((pane, idx) => {
                    // 計算窗戶上緣的傾斜角度 (由左上座標到右上座標)
                    const angle =
                      pane.length === 4
                        ? Math.atan2(
                            pane[1].y - pane[0].y,
                            pane[1].x - pane[0].x
                          ) *
                          (180 / Math.PI)
                        : 0;
                    return (
                      <div
                        key={idx}
                        className="absolute inset-0 pointer-events-none overflow-hidden"
                        style={{
                          // 第一層：只裁切出窗戶範圍
                          clipPath:
                            pane.length === 4
                              ? `polygon(${pane[0].x}% ${pane[0].y}%, ${pane[1].x}% ${pane[1].y}%, ${pane[2].x}% ${pane[2].y}%, ${pane[3].x}% ${pane[3].y}%)`
                              : "none",
                        }}
                      >
                        <div
                          // 第二層：把背景放大並根據角度旋轉，確保圖樣充滿窗戶且角度正確
                          className="absolute w-[200%] h-[200%] left-[-50%] top-[-50%] opacity-80 mix-blend-screen"
                          style={{
                            transform: `rotate(${angle}deg)`,
                            backgroundImage:
                              windowTemplate === "dots"
                                ? "radial-gradient(rgba(255,255,255,0.9) 3px, transparent 3px)"
                                : "linear-gradient(90deg, rgba(255,255,255,0.8) 4px, transparent 4px)",
                            backgroundSize:
                              windowTemplate === "dots"
                                ? "40px 40px"
                                : "50px 100%",
                          }}
                        ></div>
                      </div>
                    );
                  })}
                {windowTemplate !== "none" &&
                  (!windowAIReport?.windowPanes ||
                    windowAIReport.windowPanes.length === 0) && (
                    <div
                      className="absolute inset-0 pointer-events-none opacity-80 mix-blend-screen"
                      style={{
                        backgroundImage:
                          windowTemplate === "dots"
                            ? "radial-gradient(rgba(255,255,255,0.9) 3px, transparent 3px)"
                            : "linear-gradient(90deg, rgba(255,255,255,0.8) 4px, transparent 4px)",
                        backgroundSize:
                          windowTemplate === "dots" ? "40px 40px" : "50px 100%",
                      }}
                    ></div>
                  )}
              </>
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );

  const renderDataPage = () => {
    // 建立一個內部元件來管理彈出視窗的狀態，避免修改到上層程式碼
    const DataPageContent = () => {
      const [selectedReport, setSelectedReport] = React.useState(null);

      // 僅統計已審核通過（approved）的通報，待審核與已拒絕的不列入數據資料
      const approvedReports = reports.filter((r) => r.reviewStatus === "approved");

      const total = approvedReports.length;
      const recent = approvedReports.slice(0, 5);
      const markersData = approvedReports
        .filter((r) => r.lat && r.lon)
        .map((r) => ({
          lat: parseFloat(r.lat),
          lon: parseFloat(r.lon),
          title: r.species || "未知",
        }));
      const dataMapHtml = `<!DOCTYPE html><html><head><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" /><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><style>body{margin:0;padding:0;}#map{width:100vw;height:100vh;}</style></head><body><div id="map"></div><script>const pts=${JSON.stringify(
        markersData
      )};const map=L.map('map').setView([23.5, 121], 7);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);if(pts.length>0){const markers=[];pts.forEach(p=>{if(p.lat&&p.lon){const m=L.marker([p.lat, p.lon]).bindPopup(p.title).addTo(map);markers.push(m);}});if(markers.length>1){const group=new L.featureGroup(markers);map.fitBounds(group.getBounds().pad(0.1));}}</script></body></html>`;

      // 修正：強制生成近 6 個月的完整空陣列，確保圖表永遠不會空盒跑版
      const chartData = [];
      let maxVal = 1;
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const m = `${d.getFullYear()}/${d.getMonth() + 1}`;
        chartData.push({ label: m, value: 0 });
      }

      approvedReports.forEach((r) => {
        if (r.timestamp) {
          const d = new Date(r.timestamp);
          const m = `${d.getFullYear()}/${d.getMonth() + 1}`;
          const target = chartData.find((c) => c.label === m);
          if (target) {
            target.value += 1;
            if (target.value > maxVal) maxVal = target.value;
          }
        }
      });

      const speciesCounts = {};
      approvedReports.forEach((r) => {
        const s = r.species?.trim() || "未知鳥種";
        speciesCounts[s] = (speciesCounts[s] || 0) + 1;
      });
      const sortedSpecies = Object.entries(speciesCounts).sort(
        (a, b) => b[1] - a[1]
      );
      const topSpecies = sortedSpecies.slice(0, 4);
      const othersCount = sortedSpecies
        .slice(4)
        .reduce((sum, [, count]) => sum + count, 0);
      if (othersCount > 0) topSpecies.push(["其他", othersCount]);
      const totalSpecies = topSpecies.reduce(
        (sum, [, count]) => sum + count,
        0
      );
      const pieColors = ["#0f766e", "#14b8a6", "#2dd4bf", "#5eead4", "#ccfbf1"];
      let currentAngle = 0;
      const pieSegments = topSpecies.map(([label, count], i) => {
        const percentage = (count / totalSpecies) * 100;
        const start = currentAngle;
        currentAngle += percentage;
        return {
          label,
          count,
          percentage,
          color: pieColors[i % pieColors.length],
          start,
          end: currentAngle,
        };
      });
      const gradientString = pieSegments
        .map((s) => `${s.color} ${s.start}% ${s.end}%`)
        .join(", ");

      return (
        <div className="max-w-5xl mx-auto space-y-8 animate-fade-in relative">
          <div className="text-center mb-10">
            <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-cyan-600 mb-4">
              數據與統計資料
            </h1>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <GlassCard className="flex items-center gap-6">
              <div className="p-4 bg-teal-500 text-white rounded-2xl shadow-lg">
                <Database size={32} />
              </div>
              <div>
                <p className="text-sm font-semibold text-teal-700">
                  總通報件數
                </p>
                <h2 className="text-4xl font-black">
                  {total} <span className="text-sm font-medium">件</span>
                </h2>
              </div>
            </GlassCard>

            <GlassCard>
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                <BarChart3 className="text-teal-500" /> 近期通報趨勢
              </h3>
              {chartData.length > 0 ? (
                <div className="flex items-end h-24 gap-2 mt-4">
                  {chartData.map((d, i) => (
                    <div
                      key={i}
                      className="flex-1 flex flex-col items-center group"
                    >
                      <div className="text-[10px] font-bold text-teal-700 dark:text-teal-300 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {d.value}
                      </div>
                      <div
                        className="w-full bg-gradient-to-t from-teal-500/60 to-emerald-400/80 hover:from-teal-400 hover:to-emerald-300 rounded-t-lg transition-all duration-300 shadow-sm"
                        style={{
                          height: `${(d.value / maxVal) * 100}%`,
                          minHeight: "4px",
                        }}
                      ></div>
                      <div className="text-[10px] mt-1 text-slate-600 dark:text-slate-400 font-medium truncate w-full text-center">
                        {d.label}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-slate-400 py-6 text-sm">
                  尚無足夠數據
                </p>
              )}
            </GlassCard>

            <GlassCard className="md:col-span-2 lg:col-span-1">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                <PieChart className="text-emerald-500" /> 鳥種佔比統計
              </h3>
              {pieSegments.length > 0 ? (
                <div className="flex items-center gap-4 h-24">
                  <div
                    className="relative w-24 h-24 rounded-full flex-shrink-0"
                    style={{ background: `conic-gradient(${gradientString})` }}
                  >
                    <div className="absolute inset-3 bg-[#e0f2f1] dark:bg-[#00251a] rounded-full flex items-center justify-center">
                      <span className="text-xs font-bold text-teal-800 dark:text-teal-200">
                        {total} 隻
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 space-y-1.5 overflow-y-auto h-full pr-1">
                    {pieSegments.map((s) => (
                      <div
                        key={s.label}
                        className="flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-1.5 overflow-hidden">
                          <div
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: s.color }}
                          ></div>
                          <span
                            className="text-slate-600 dark:text-slate-300 truncate"
                            title={s.label}
                          >
                            {s.label}
                          </span>
                        </div>
                        <span className="font-semibold text-slate-700 dark:text-slate-200 ml-2">
                          {s.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-center text-slate-400 py-6 text-sm">
                  尚無足夠數據
                </p>
              )}
            </GlassCard>
          </div>

          <GlassCard>
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
              <MapIcon className="text-emerald-500" /> 最新通報分佈
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 space-y-3 max-h-80 overflow-y-auto pr-2">
                {recent.map((r, i) => (
                  <div
                    key={r.id || i}
                    onClick={() => setSelectedReport(r)}
                    className="p-3 rounded-xl bg-white/50 dark:bg-black/30 border border-teal-100 dark:border-teal-900 shadow-sm text-sm hover:shadow-md transition-all cursor-pointer hover:bg-teal-50"
                  >
                    <div className="font-bold text-teal-800 dark:text-teal-200 truncate">
                      {r.location || "未知地點"}
                    </div>
                    <div className="text-slate-500 dark:text-slate-400 text-xs mt-1 flex justify-between">
                      <span>{r.name || "匿名"}</span>
                      {/* 修正：精準讀取 timestamp 並轉換為本地日期 */}
                      <span>
                        {r.timestamp
                          ? new Date(r.timestamp).toLocaleDateString()
                          : "未知時間"}
                      </span>
                    </div>
                  </div>
                ))}
                {recent.length === 0 && (
                  <p className="text-slate-400">暫無通報紀錄</p>
                )}
              </div>
              <div className="lg:col-span-2 h-80 rounded-2xl overflow-hidden border border-white/40 shadow-inner bg-slate-200 dark:bg-slate-800 relative z-0">
                <iframe
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  srcDoc={dataMapHtml}
                ></iframe>
              </div>
            </div>
          </GlassCard>

          {/* 新增：詳細資訊彈出視窗 */}
          {selectedReport && (
            <div
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-[100] p-4"
              onClick={() => setSelectedReport(null)}
            >
              <GlassCard
                className="w-full max-w-md relative bg-white/95 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="absolute top-6 right-6 text-slate-400 hover:text-slate-700 transition-colors text-xl font-bold"
                  onClick={() => setSelectedReport(null)}
                >
                  ✕
                </button>
                <h3 className="text-2xl font-bold text-teal-800 mb-5 border-b border-teal-100 pb-3">
                  通報詳細資訊
                </h3>
                <div className="space-y-3">
                  <p>
                    <span className="font-semibold text-slate-500 inline-block w-16">
                      鳥種
                    </span>
                    {selectedReport.species || "未知"}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-500 inline-block w-16">
                      狀態
                    </span>
                    {selectedReport.status || "未知"}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-500 inline-block w-16">
                      通報者
                    </span>
                    {selectedReport.name || "匿名"}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-500 inline-block w-16">
                      時間
                    </span>
                    {selectedReport.timestamp
                      ? new Date(selectedReport.timestamp).toLocaleString()
                      : "未知時間"}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-500 inline-block w-16">
                      地點
                    </span>
                    {selectedReport.location || "未知"}
                  </p>

                  {selectedReport.notes && (
                    <p className="pt-2">
                      <span className="font-semibold text-slate-500 block mb-1">
                        備註事項
                      </span>
                      <span className="text-slate-700 bg-slate-50 p-3 rounded-lg block">
                        {selectedReport.notes}
                      </span>
                    </p>
                  )}

                  {selectedReport.aiResult && (
                    <div className="mt-4 p-4 bg-teal-50/80 rounded-xl text-sm whitespace-pre-wrap text-slate-700 border border-teal-100">
                      <span className="font-bold text-teal-800 block mb-2">
                        AI 辨識報告
                      </span>
                      {selectedReport.aiResult}
                    </div>
                  )}

                  {selectedReport.photo && (
                    <div className="mt-4 pt-2 border-t border-slate-100">
                      <span className="font-semibold text-slate-500 block mb-2">
                        通報照片
                      </span>
                      <img
                        src={selectedReport.photo}
                        className="w-full h-48 object-cover rounded-xl shadow-sm"
                        alt="通報照片"
                      />
                    </div>
                  )}
                </div>
              </GlassCard>
            </div>
          )}
        </div>
      );
    };

    return <DataPageContent />;
  };

  const renderAdminPage = () =>
    !isAdminAuth ? (
      <div className="max-w-md mx-auto mt-20 animate-fade-in-up">
        <GlassCard className="text-center p-10">
          <Settings className="w-20 h-20 text-teal-500 mx-auto mb-6 opacity-90" />
          <h2 className="text-3xl font-bold mb-6">管理員登入</h2>
          <input
            type="password"
            placeholder="••••"
            className="w-full p-4 rounded-2xl bg-white/60 border-2 border-teal-200 focus:outline-none mb-6 text-center text-2xl tracking-[0.5em] font-mono shadow-inner"
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdminLogin()}
          />
          <Button onClick={handleAdminLogin} className="w-full text-lg py-4">
            進入系統
          </Button>
        </GlassCard>
      </div>
    ) : (
      (() => {
        // 宣告修改資料專用的局部狀態，不破壞全域結構
        const AdminPageContent = () => {
          const [editingReport, setEditingReport] = React.useState(null);
          const [editForm, setEditForm] = React.useState({
            species: "",
            status: "",
            name: "",
            location: "",
            lat: "",
            lon: "",
            notes: "",
            aiResult: "",
          });
          const editMapIframeRef = React.useRef(null);

          // 搜尋列專用的狀態
          const [searchTerm, setSearchTerm] = React.useState("");
          const [searchField, setSearchField] = React.useState("all");

          // 切換分頁時，自動清空搜尋關鍵字
          React.useEffect(() => {
            setSearchTerm("");
            setSearchField("all");
          }, [adminView]);

          // 當點選修改時，自動帶入原本的資料
          React.useEffect(() => {
            if (editingReport) {
              setEditForm({
                species: editingReport.species || "",
                status: editingReport.status || "",
                name: editingReport.name || "",
                location: editingReport.location || "",
                lat: editingReport.lat || "",
                lon: editingReport.lon || "",
                notes: editingReport.notes || "",
                aiResult: editingReport.aiResult || "",
              });
            }
          }, [editingReport]);

          // 監聽「修改資料」地圖的定位訊息（使用獨立事件類型，避免與救傷通報表單地圖互相干擾）
          React.useEffect(() => {
            const handleEditMapMessage = async (e) => {
              if (e.data?.type === "PICK_LOCATION_EDIT") {
                const { lat, lon, location: mapAddress } = e.data;

                if (mapAddress) {
                  setEditForm((prev) => ({ ...prev, lat, lon, location: mapAddress }));
                  return;
                }

                try {
                  const res = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=zh-TW`
                  );
                  const data = await res.json();

                  if (data && data.address) {
                    const a = data.address;
                    const road = a.road || a.pedestrian || a.street || "";
                    const num = a.house_number || "";
                    const landmark =
                      a.amenity || a.building || a.shop || a.tourism || a.leisure || "";
                    const city = a.city || a.town || a.village || a.county || "";
                    const district = a.suburb || a.district || "";

                    let finalStr = "";
                    if (road && num) {
                      finalStr = `${city}${district}${road}${num}號`;
                    } else if (road) {
                      finalStr = `${city}${district}${road}附近`;
                    } else if (landmark) {
                      finalStr = `在 ${landmark} 附近 (${city}${district})`;
                    } else if (data.display_name) {
                      finalStr = data.display_name.split(",")[0];
                    } else {
                      finalStr = `座標: ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
                    }
                    setEditForm((prev) => ({ ...prev, lat, lon, location: finalStr }));
                  } else {
                    setEditForm((prev) => ({
                      ...prev,
                      lat,
                      lon,
                      location: `座標: ${lat.toFixed(4)}, ${lon.toFixed(4)}`,
                    }));
                  }
                } catch (err) {
                  setEditForm((prev) => ({
                    ...prev,
                    lat,
                    lon,
                    location: `座標: ${lat.toFixed(4)}, ${lon.toFixed(4)}`,
                  }));
                }
              }
            };
            window.addEventListener("message", handleEditMapMessage);
            return () => window.removeEventListener("message", handleEditMapMessage);
          }, []);

          // 當 editForm 的 lat/lon 改變時，同步更新修改資料地圖上的標記
          React.useEffect(() => {
            if (
              editMapIframeRef.current &&
              editMapIframeRef.current.contentWindow &&
              editForm.lat &&
              editForm.lon
            ) {
              editMapIframeRef.current.contentWindow.postMessage(
                { type: "UPDATE_MAP", lat: editForm.lat, lon: editForm.lon },
                "*"
              );
            }
          }, [editForm.lat, editForm.lon]);

          // 資料過濾邏輯：動態過濾目前分頁的陣列
          const filteredItems = React.useMemo(() => {
            const currentData =
              adminView === "reports"
                ? reports
                : adminView === "contacts"
                ? contactMessages
                : personnel;
            if (!searchTerm.trim()) return currentData;

            const term = searchTerm.toLowerCase().trim();

            const matchValue = (val, isTime = false) => {
              if (!val) return false;
              if (isTime) {
                return new Date(val)
                  .toLocaleString()
                  .toLowerCase()
                  .includes(term);
              }
              return String(val).toLowerCase().includes(term);
            };

            return currentData.filter((item) => {
              if (searchField === "all") {
                if (adminView === "reports") {
                  return (
                    matchValue(item.timestamp, true) ||
                    matchValue(item.species) ||
                    matchValue(item.location) ||
                    matchValue(item.aiResult)
                  );
                } else if (adminView === "contacts") {
                  return (
                    matchValue(item.timestamp, true) ||
                    matchValue(item.name) ||
                    matchValue(item.type) ||
                    matchValue(item.message)
                  );
                } else {
                  return (
                    matchValue(item.timestamp, true) ||
                    matchValue(item.name) ||
                    matchValue(item.email) ||
                    matchValue(item.uid)
                  );
                }
              }

              if (searchField === "time")
                return matchValue(item.timestamp, true);

              if (adminView === "reports") {
                if (searchField === "species") return matchValue(item.species);
                if (searchField === "location")
                  return matchValue(item.location);
                if (searchField === "aiResult")
                  return matchValue(item.aiResult);
              } else if (adminView === "contacts") {
                if (searchField === "name") return matchValue(item.name);
                if (searchField === "type") return matchValue(item.type);
                if (searchField === "message") return matchValue(item.message);
              } else if (adminView === "personnel") {
                if (searchField === "name") return matchValue(item.name);
                if (searchField === "email") return matchValue(item.email);
                if (searchField === "uid") return matchValue(item.uid);
              }
              return false;
            });
          }, [
            adminView,
            reports,
            contactMessages,
            personnel,
            searchTerm,
            searchField,
          ]);

          return (
            <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
              <GlassCard className="flex justify-between items-center flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <h2 className="text-2xl font-bold text-teal-800 flex items-center gap-2">
                    <Settings /> 資料庫管理
                  </h2>
                  <div className="bg-white/50 p-1 rounded-xl flex">
                    <button
                      onClick={() => setAdminView("reports")}
                      className={`px-4 py-1.5 rounded-lg text-sm font-bold ${
                        adminView === "reports"
                          ? "bg-teal-500 text-white"
                          : "text-slate-600"
                      }`}
                    >
                      通報
                    </button>
                    <button
                      onClick={() => setAdminView("contacts")}
                      className={`px-4 py-1.5 rounded-lg text-sm font-bold ${
                        adminView === "contacts"
                          ? "bg-teal-500 text-white"
                          : "text-slate-600"
                      }`}
                    >
                      聯絡
                    </button>
                    <button
                      onClick={() => setAdminView("personnel")}
                      className={`px-4 py-1.5 rounded-lg text-sm font-bold ${
                        adminView === "personnel"
                          ? "bg-teal-500 text-white"
                          : "text-slate-600"
                      }`}
                    >
                      會員
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => setIsAdminAuth(false)}
                  className="p-2 px-3 rounded-xl text-amber-600 hover:bg-amber-100 flex items-center gap-1 text-sm font-bold bg-white/50"
                >
                  <LogOut size={18} /> 退出
                </button>
              </GlassCard>

              <GlassCard className="p-0 overflow-hidden">
                {/* 搜尋欄位 UI */}
                <div className="p-4 bg-white/30 border-b border-white/20 flex gap-3 items-center flex-wrap">
                  <input
                    type="text"
                    placeholder="輸入關鍵字搜尋..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="flex-1 min-w-[200px] p-2 px-3 rounded-xl bg-white/60 border border-teal-200/50 outline-none focus:ring-2 focus:ring-teal-500 text-sm text-slate-800"
                  />
                  <select
                    value={searchField}
                    onChange={(e) => setSearchField(e.target.value)}
                    className="p-2 px-3 rounded-xl bg-white/60 border border-teal-200/50 outline-none text-sm text-slate-700 font-semibold cursor-pointer"
                  >
                    <option value="all">全部欄位</option>
                    {adminView === "reports" && (
                      <>
                        <option value="time">時間</option>
                        <option value="species">鳥種</option>
                        <option value="location">地點</option>
                        <option value="aiResult">AI摘要</option>
                      </>
                    )}
                    {adminView === "contacts" && (
                      <>
                        <option value="time">時間</option>
                        <option value="name">單位/姓名</option>
                        <option value="type">類型</option>
                        <option value="message">內容</option>
                      </>
                    )}
                    {adminView === "personnel" && (
                      <>
                        <option value="time">最後登入時間</option>
                        <option value="name">姓名</option>
                        <option value="email">信箱</option>
                        <option value="uid">使用者 ID</option>
                      </>
                    )}
                  </select>
                </div>

                <table className="w-full text-left border-collapse">
                  <thead className="bg-teal-600/10 text-teal-800">
                    <tr>
                      {adminView === "reports" ? (
                        <>
                          <th className="p-4 whitespace-nowrap">時間</th>
                          <th className="p-4 whitespace-nowrap">鳥種</th>
                          <th className="p-4 whitespace-nowrap">地點</th>
                          <th className="p-4 whitespace-nowrap">AI摘要</th>
                        </>
                      ) : adminView === "contacts" ? (
                        <>
                          <th className="p-4 whitespace-nowrap">時間</th>
                          <th className="p-4 whitespace-nowrap">單位/姓名</th>
                          <th className="p-4 whitespace-nowrap">類型</th>
                          <th className="p-4 whitespace-nowrap">內容</th>
                        </>
                      ) : (
                        <>
                          <th className="p-4 whitespace-nowrap">
                            最後登入時間
                          </th>
                          <th className="p-4 whitespace-nowrap">姓名</th>
                          <th className="p-4 whitespace-nowrap">信箱</th>
                          <th className="p-4 whitespace-nowrap">使用者 ID</th>
                        </>
                      )}
                      <th className="p-4 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/20">
                    {filteredItems.map((item) => (
                      <tr key={item.id} className="hover:bg-white/20">
                        <td className="p-4 text-sm">
                          {item.timestamp
                            ? new Date(item.timestamp).toLocaleString()
                            : "未知"}
                        </td>
                        <td className="p-4 font-bold">
                          {adminView === "reports"
                            ? item.species
                            : adminView === "contacts"
                            ? item.name
                            : item.name}
                        </td>
                        <td className="p-4 text-sm">
                          {adminView === "reports"
                            ? item.location
                            : adminView === "contacts"
                            ? item.type
                            : item.email}
                        </td>
                        <td className="p-4 text-sm max-w-[200px] truncate">
                          {adminView === "reports"
                            ? item.aiResult
                            : adminView === "contacts"
                            ? item.message
                            : item.uid}
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {/* 1. 通報分頁：加入審核鎖定狀態 */}
                            {adminView === "reports" && (
                              <>
                                {/* 同意通報：綠色勾勾（已審核則禁用） */}
                                <button
                                  onClick={async () => {
                                    try {
                                      const { updateDoc, doc } = await import(
                                        "firebase/firestore"
                                      );
                                      await updateDoc(
                                        doc(
                                          db,
                                          "artifacts",
                                          globalAppId,
                                          "public",
                                          "data",
                                          "bird_reports",
                                          item.id
                                        ),
                                        { reviewStatus: "approved" }
                                      );
                                      showToast("已同意通報並登錄");
                                    } catch (e) {
                                      showToast("操作失敗", "error");
                                    }
                                  }}
                                  disabled={
                                    item.reviewStatus === "approved" ||
                                    item.reviewStatus === "rejected"
                                  }
                                  className="p-1.5 text-emerald-500 hover:bg-emerald-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                  title={
                                    item.reviewStatus === "approved"
                                      ? "已同意"
                                      : item.reviewStatus === "rejected"
                                      ? "已審核(拒絕)"
                                      : "同意通報"
                                  }
                                >
                                  <Check size={18} />
                                </button>

                                {/* 拒絕通報：紅色叉叉（已審核則禁用） */}
                                <button
                                  onClick={async () => {
                                    try {
                                      const { updateDoc, doc } = await import(
                                        "firebase/firestore"
                                      );
                                      await updateDoc(
                                        doc(
                                          db,
                                          "artifacts",
                                          globalAppId,
                                          "public",
                                          "data",
                                          "bird_reports",
                                          item.id
                                        ),
                                        { reviewStatus: "rejected" }
                                      );
                                      showToast("已拒絕該筆通報");
                                    } catch (e) {
                                      showToast("操作失敗", "error");
                                    }
                                  }}
                                  disabled={
                                    item.reviewStatus === "approved" ||
                                    item.reviewStatus === "rejected"
                                  }
                                  className="p-1.5 text-red-500 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                  title={
                                    item.reviewStatus === "rejected"
                                      ? "已拒絕"
                                      : item.reviewStatus === "approved"
                                      ? "已審核(同意)"
                                      : "拒絕通報"
                                  }
                                >
                                  <X size={18} />
                                </button>

                                {/* 修改通報資料：筆 */}
                                <button
                                  onClick={() => setEditingReport(item)}
                                  className="p-1.5 text-blue-500 hover:bg-blue-100 rounded-lg transition-colors"
                                  title="修改資料"
                                >
                                  <Edit2 size={18} />
                                </button>

                                {/* 刪除按鈕 */}
                                <button
                                  onClick={() =>
                                    setDeleteTarget({
                                      id: item.id,
                                      type: "report",
                                    })
                                  }
                                  className="p-1.5 text-red-500 hover:bg-red-100 rounded-lg transition-colors"
                                  title="刪除"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </>
                            )}

                            {/* 2. 聯絡分頁：維持原樣 */}
                            {adminView === "contacts" && (
                              <button
                                onClick={() =>
                                  setDeleteTarget({
                                    id: item.id,
                                    type: "contact",
                                  })
                                }
                                className="p-1.5 text-red-500 hover:bg-red-100 rounded-lg transition-colors"
                                title="刪除"
                              >
                                <Trash2 size={18} />
                              </button>
                            )}

                            {/* 3. 會員分頁：改為網頁中的地位五級權限管理（擁有者鎖定） */}
                            {adminView === "personnel" && (
                              <select
                                value={
                                  item.email === "angela1010306@gmail.com"
                                    ? "擁有者"
                                    : item.role || "一般民眾"
                                }
                                disabled={
                                  item.email === "angela1010306@gmail.com"
                                }
                                onChange={async (e) => {
                                  try {
                                    const { updateDoc, doc } = await import(
                                      "firebase/firestore"
                                    );
                                    await updateDoc(
                                      doc(
                                        db,
                                        "artifacts",
                                        globalAppId,
                                        "public",
                                        "data",
                                        "personnel",
                                        item.id
                                      ),
                                      { role: e.target.value }
                                    );
                                    showToast(
                                      `已成功將權限變更為：${e.target.value}`
                                    );
                                  } catch (err) {
                                    showToast("變更權限失敗", "error");
                                  }
                                }}
                                className="bg-white border border-teal-200 rounded-xl p-1 px-2 text-xs outline-none text-slate-700 font-semibold disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                              >
                                {item.email === "angela1010306@gmail.com" ? (
                                  <option value="擁有者">擁有者</option>
                                ) : (
                                  <>
                                    <option value="管理者">管理者</option>
                                    <option value="VIP">VIP</option>
                                    <option value="一般民眾">一般民眾</option>
                                    <option value="停權">停權</option>
                                    <option value="黑名單">黑名單</option>
                                  </>
                                )}
                              </select>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </GlassCard>

              {/* 管理員修改資料彈出視窗 (Modal) */}
              {editingReport && (
                <div
                  className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-[100] p-4"
                  onClick={() => setEditingReport(null)}
                >
                  <div
                    className="bg-white border border-teal-100 rounded-3xl p-8 w-full max-w-4xl shadow-2xl relative overflow-y-auto max-h-[90vh]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 text-xl font-bold"
                      onClick={() => setEditingReport(null)}
                    >
                      ✕
                    </button>

                    <h2 className="text-3xl font-extrabold text-teal-800 mb-8 flex items-center gap-3">
                      <Edit2 className="text-emerald-500" /> 修改通報資料
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-6">
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-2">
                            鳥類資訊
                          </label>
                          <div className="flex gap-4">
                            <input
                              type="text"
                              placeholder="鳥種"
                              className="w-full p-3 rounded-xl bg-slate-50 border border-teal-200/50 outline-none focus:ring-2 focus:ring-teal-500 text-slate-800"
                              value={editForm.species}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  species: e.target.value,
                                })
                              }
                            />
                            <select
                              className="w-full p-3 rounded-xl bg-slate-50 border border-teal-200/50 outline-none text-slate-800"
                              value={editForm.status}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  status: e.target.value,
                                })
                              }
                            >
                              <option value="" disabled>
                                請選擇狀態
                              </option>
                              <option value="受傷">受傷</option>
                              <option value="生病">生病</option>
                              <option value="落巢/幼鳥">落巢/幼鳥</option>
                              <option value="死亡">死亡</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex gap-4">
                          <input
                            type="text"
                            placeholder="姓名 *"
                            className="w-full p-3 rounded-xl bg-slate-50 border border-teal-200/50 outline-none text-slate-800"
                            value={editForm.name}
                            onChange={(e) =>
                              setEditForm({ ...editForm, name: e.target.value })
                            }
                          />
                          <input
                            type="text"
                            placeholder="地點"
                            className="w-full p-3 rounded-xl bg-slate-50 border border-teal-200/50 outline-none text-slate-800"
                            value={editForm.location}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                location: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold mb-2 text-slate-700">
                            點擊地圖重新定位
                          </label>
                          <div className="h-48 rounded-xl overflow-hidden border border-teal-200/50">
                            <iframe
                              ref={editMapIframeRef}
                              width="100%"
                              height="100%"
                              frameBorder="0"
                              srcDoc={`<!DOCTYPE html><html><head><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" /><link rel="stylesheet" href="https://unpkg.com/leaflet-control-geocoder/dist/Control.Geocoder.css" /><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script src="https://unpkg.com/leaflet-control-geocoder/dist/Control.Geocoder.js"></script><style>body{margin:0;padding:0;}#map{width:100vw;height:100vh;cursor:crosshair;}</style></head><body><div id="map"></div><script>let map=L.map('map').setView([${editForm.lat || 23.5}, ${editForm.lon || 121.0}],${editForm.lat && editForm.lon ? 16 : 7});L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);let marker${editForm.lat && editForm.lon ? `=L.marker([${editForm.lat}, ${editForm.lon}]).addTo(map)` : ""};L.Control.geocoder({defaultMarkGeocode:false,placeholder:"搜尋地址..."}).on('markgeocode',function(e){const center=e.geocode.center;map.setView(center,16);if(marker){marker.setLatLng(center);}else{marker=L.marker(center).addTo(map);}window.parent.postMessage({type:'PICK_LOCATION_EDIT',lat:center.lat,lon:center.lng,location:e.geocode.name},'*');}).addTo(map);map.on('click',function(e){if(marker)marker.setLatLng(e.latlng);else marker=L.marker(e.latlng).addTo(map);window.parent.postMessage({type:'PICK_LOCATION_EDIT',lat:e.latlng.lat,lon:e.latlng.lng},'*');});window.addEventListener('message',function(e){if(e.data.type==='UPDATE_MAP'){map.setView([e.data.lat,e.data.lon],16);if(marker)marker.setLatLng([e.data.lat,e.data.lon]);else marker=L.marker([e.data.lat,e.data.lon]).addTo(map);}});</script></body></html>`}
                            ></iframe>
                          </div>
                        </div>
                        {/* 顯示該筆通報的照片預覽，以符合原本表單雙欄結構的視覺平衡 */}
                        <div>
                          <label className="block text-sm font-semibold mb-2 text-slate-700">
                            通報照片
                          </label>
                          {editingReport.photo ? (
                            <img
                              src={editingReport.photo}
                              className="w-full h-48 object-cover rounded-xl shadow-md"
                              alt="通報照片"
                            />
                          ) : (
                            <div className="w-full h-48 bg-slate-50 rounded-xl flex items-center justify-center border border-dashed border-teal-200 text-slate-400">
                              無照片
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-6">
                        <div>
                          <label className="block text-sm font-semibold mb-2 text-slate-700">
                            AI 辨識結果 (可手動修改)
                          </label>
                          <textarea
                            className="w-full p-3 rounded-xl bg-slate-50 border border-teal-200/50 h-40 text-sm outline-none focus:ring-2 focus:ring-teal-500 text-slate-800"
                            placeholder="AI 辨識結果..."
                            value={editForm.aiResult}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                aiResult: e.target.value,
                              })
                            }
                          ></textarea>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold mb-2 text-slate-700">
                            其他備註事項
                          </label>
                          <textarea
                            className="w-full p-3 rounded-xl bg-slate-50 border border-teal-200/50 h-32 outline-none focus:ring-2 focus:ring-teal-500 text-slate-800"
                            placeholder="其他備註事項..."
                            value={editForm.notes}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                notes: e.target.value,
                              })
                            }
                          ></textarea>
                        </div>
                      </div>
                    </div>

                    <div className="mt-8 flex gap-4 justify-end border-t border-slate-100 pt-6">
                      <button
                        onClick={() => setEditingReport(null)}
                        className="px-8 py-3 rounded-xl font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50"
                      >
                        取消
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            const { updateDoc, doc } = await import(
                              "firebase/firestore"
                            );
                            await updateDoc(
                              doc(
                                db,
                                "artifacts",
                                globalAppId,
                                "public",
                                "data",
                                "bird_reports",
                                editingReport.id
                              ),
                              {
                                species: editForm.species,
                                status: editForm.status,
                                name: editForm.name,
                                location: editForm.location,
                                lat: editForm.lat,
                                lon: editForm.lon,
                                notes: editForm.notes,
                                aiResult: editForm.aiResult,
                              }
                            );
                            showToast("修改成功");
                            setEditingReport(null);
                          } catch (e) {
                            showToast("修改失敗", "error");
                          }
                        }}
                        className="px-8 py-3 rounded-xl font-bold bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-md hover:shadow-lg transition-all flex items-center gap-2"
                      >
                        <Check size={18} /> 儲存變更
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        };
        return <AdminPageContent />;
      })()
    );

  const renderAboutPage = () => (
    <div className="max-w-4xl mx-auto space-y-12 animate-fade-in">
      <header className="text-center space-y-4">
        <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-emerald-600 mb-4">
          城市飛羽守護行動
        </h1>
        <p className="text-xl text-slate-600">
          守護城市中的羽翼，與鳥類和平共存。
        </p>
      </header>
      <section className="grid md:grid-cols-2 gap-8">
        <GlassCard>
          <Heart className="text-rose-500 mb-4" size={36} />
          <h2 className="text-2xl font-bold mb-2">我們的使命</h2>
          <p className="text-slate-600">
            城市飛羽守護行動
            我們致力於解決城市中的『鳥類窗殺』危機，透過科學調查與教育推廣，將城市中的「隱形陷阱」轉化為友善棲地，守護每一雙在城市中飛翔的翅膀，實現人與鳥類的和平共存。
          </p>
        </GlassCard>
        <GlassCard>
          <Users className="text-teal-500 mb-4" size={36} />
          <h2 className="text-2xl font-bold mb-2">團隊願景</h2>
          <p className="text-slate-600">
            深信透過科技與公民科學的結合，能有效改善鳥類生存環境，讓每一扇窗都成為安全的風景。
          </p>
        </GlassCard>
      </section>
      <GlassCard className="flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2 mb-2">
            <Mail className="text-amber-500" />
            聯絡與申請
          </h2>
          <p className="text-slate-600 max-w-md">
            有任何合作需求或建議？歡迎隨時與我們聯繫！
          </p>
        </div>
        <div className="flex flex-col gap-3 w-full md:w-auto">
          <Button onClick={() => setIsFormOpen(true)} icon={BookOpen}>
            填寫聯絡與申請表單
          </Button>
        </div>
      </GlassCard>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#e0f2f1] dark:bg-[#00251a] text-slate-800 dark:text-slate-200 font-sans pb-20 overflow-x-hidden selection:bg-teal-200 transition-colors duration-500">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-teal-300/30 blur-[100px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-emerald-200/40 blur-[120px] rounded-full"></div>
      </div>

      {/* 導覽列 */}
      <nav className="sticky top-0 z-50 bg-white/40 backdrop-blur-xl border-b border-white/50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-20">
            <div
              onClick={() => setCurrentPage("rescue")}
              className="flex items-center gap-3 cursor-pointer hover:opacity-80"
            >
              <div className="bg-gradient-to-br from-teal-500 to-emerald-500 p-2 rounded-xl text-white shadow-lg">
                <Bird size={28} />
              </div>
              <span className="font-extrabold text-2xl text-transparent bg-clip-text bg-gradient-to-r from-teal-700 to-emerald-600">
                FeatherGuard
              </span>
            </div>
            <div className="hidden md:flex space-x-2 items-center">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setCurrentPage(item.id)}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold transition-all ${
                    currentPage === item.id
                      ? "bg-white/80 text-teal-700 shadow-md transform scale-105 border border-white/50"
                      : "text-slate-600 hover:bg-white/40"
                  }`}
                >
                  <item.icon size={18} />
                  {item.label}
                </button>
              ))}
              <div className="ml-4 pl-4 border-l border-teal-200">
                {(user && !user.isAnonymous) || isAdminAuth ? (
                  <button
                    onClick={handleGoogleLogout}
                    className="flex items-center gap-2 text-sm font-bold text-rose-500"
                  >
                    <LogOut size={18} /> 登出
                  </button>
                ) : (
                  <button
                    onClick={handleGoogleLogin}
                    className="flex items-center gap-2 text-sm font-bold text-teal-600"
                  >
                    <LogIn size={18} /> 登入
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* 手機版導覽 */}
      <div className="md:hidden fixed bottom-0 w-full z-50 bg-white/80 backdrop-blur-xl border-t border-white/20 pb-safe">
        <div className="flex justify-around items-center h-16">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className={`flex flex-col items-center justify-center w-full space-y-1 ${
                currentPage === item.id ? "text-teal-600" : "text-slate-500"
              }`}
            >
              <item.icon size={22} />
              <span className="text-[10px] font-bold">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 頁面切換 */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 py-10">
        {currentPage === "rescue" && renderRescuePage()}
        {currentPage === "window" && renderWindowPage()}
        {currentPage === "data" && renderDataPage()}
        {currentPage === "admin" && renderAdminPage()}
        {currentPage === "about" && renderAboutPage()}
      </main>

      {/* 全域 Modal: 聯絡表單 */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-[100] p-4">
          <GlassCard className="w-full max-w-lg bg-white/95">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold flex items-center gap-2">
                <BookOpen className="text-teal-500" />
                聯絡與申請
              </h3>
              <button
                onClick={() => setIsFormOpen(false)}
                className="text-slate-500 hover:text-slate-800"
              >
                <X />
              </button>
            </div>
            <div className="space-y-4">
              <input
                type="text"
                className="w-full p-3 rounded-xl bg-white/50 border border-teal-200/50"
                placeholder="所屬單位 / 稱呼 *"
                value={contactFormData.name}
                onChange={(e) =>
                  setContactFormData({
                    ...contactFormData,
                    name: e.target.value,
                  })
                }
              />
              <input
                type="text"
                className="w-full p-3 rounded-xl bg-white/50 border border-teal-200/50"
                placeholder="聯絡方式 (Email 或 電話)"
                value={contactFormData.contactInfo}
                onChange={(e) =>
                  setContactFormData({
                    ...contactFormData,
                    contactInfo: e.target.value,
                  })
                }
              />
              <select
                className="w-full p-3 rounded-xl bg-white/50 border border-teal-200/50 text-slate-700"
                value={contactFormData.type}
                onChange={(e) =>
                  setContactFormData({
                    ...contactFormData,
                    type: e.target.value,
                  })
                }
              >
                <option value="環教宣導邀約">環教宣導邀約</option>
                <option value="教案包申請">材料申請</option>
                <option value="網頁功能建議">網頁功能建議</option>
                <option value="其他">其他</option>
              </select>
              <textarea
                className="w-full p-3 rounded-xl bg-white/50 border border-teal-200/50 h-32"
                placeholder="內容 *"
                value={contactFormData.message}
                onChange={(e) =>
                  setContactFormData({
                    ...contactFormData,
                    message: e.target.value,
                  })
                }
              ></textarea>
            </div>
            <div className="mt-6 flex gap-3">
              <Button
                variant="secondary"
                onClick={() => setIsFormOpen(false)}
                className="flex-1"
              >
                取消
              </Button>
              <Button
                onClick={submitContactForm}
                disabled={isSubmittingContact}
                className="flex-[2]"
              >
                {isSubmittingContact ? "傳送中..." : "送出"}
              </Button>
            </div>
          </GlassCard>
        </div>
      )}

      {/* 全域 Modal: 刪除確認 */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-[100] p-4">
          <GlassCard className="text-center w-full max-w-sm bg-white/95">
            <AlertTriangle className="w-16 h-16 text-rose-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-6">確定要刪除嗎？</h3>
            <div className="flex justify-center gap-4">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                取消
              </Button>
              <Button variant="danger" onClick={executeDelete}>
                刪除
              </Button>
            </div>
          </GlassCard>
        </div>
      )}

      {/* 全域 Toast */}
      {toast && (
        <div className="fixed bottom-24 md:bottom-10 left-1/2 transform -translate-x-1/2 z-[100] animate-[bounce_0.3s_ease-out]">
          <div
            className={`px-6 py-3 rounded-full text-white font-medium flex items-center gap-3 shadow-2xl ${
              toast.type === "error" ? "bg-rose-500" : "bg-teal-600"
            }`}
          >
            {toast.type === "error" ? (
              <AlertTriangle size={20} />
            ) : (
              <Check size={20} />
            )}{" "}
            {toast.msg}
          </div>
        </div>
      )}

      <style
        dangerouslySetInnerHTML={{
          __html: `@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } .animate-fade-in { animation: fadeIn 0.3s ease-out; }`,
        }}
      />
    </div>
  );
}
