import { useState, useEffect } from "react";
import { Settings, Save, CheckCircle2, Sliders, Globe, ShieldAlert, Award, FileSpreadsheet, RotateCcw } from "lucide-react";

interface SettingsViewProps {
  showToast: (msg: string) => void;
}

export default function SettingsView({ showToast }: SettingsViewProps) {
  // Preset standard options from localStorage to enable persistence
  const [phonePreset, setPhonePreset] = useState(() => localStorage.getItem("phonePreset") || "+201016296205");
  const [taxPreset, setTaxPreset] = useState(() => localStorage.getItem("taxPreset") || "0");
  const [fallbackLanguage, setFallbackLanguage] = useState(() => localStorage.getItem("fallbackLanguage") || "ar");
  const [excelTargetName, setExcelTargetName] = useState(() => localStorage.getItem("excelTargetName") || "O_A_Brand_Registry.xlsx");
  const [excelSheetLink, setExcelSheetLink] = useState("");
  const [googleSheetViewLink, setGoogleSheetViewLink] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Fetch Excel sheet link on mount
  useEffect(() => {
    fetch("/api/excel-link")
      .then((res) => res.json())
      .then((data) => {
        if (data.link) setExcelSheetLink(data.link);
        if (data.viewLink) setGoogleSheetViewLink(data.viewLink);
      })
      .catch((err) => console.error("Error loading excel sheet link:", err));
  }, []);

  const handleSaveSettings = async () => {
    const trimmedPhone = phonePreset.trim();
    const trimmedLink = excelSheetLink.trim();
    const trimmedViewLink = googleSheetViewLink.trim();
    const trimmedTax = taxPreset.trim();
    const trimmedTargetName = excelTargetName.trim();

    // Enforce robust validation for all fields, validating each element
    if (!trimmedPhone) {
      showToast("⚠️ خطأ في الإدخال: يرجى كتابة رقم التليفون الأساسي للتواصل أولاً.");
      return;
    }

    // If an Excel link is provided, it must be a valid http:// or https:// URL format
    if (trimmedLink && !trimmedLink.startsWith("http://") && !trimmedLink.startsWith("https://")) {
      showToast("⚠️ خطأ في الإدخال: رابط المزامنة (Apps Script Web App) غير صالح! يجب أن يبدأ بـ http:// أو https://");
      return;
    }

    if (trimmedViewLink && !trimmedViewLink.startsWith("http://") && !trimmedViewLink.startsWith("https://")) {
      showToast("⚠️ خطأ في الإدخال: رابط عرض شيت جوجل غير صالح! يجب أن يبدأ بـ http:// أو https://");
      return;
    }

    if (trimmedTax === "" || isNaN(Number(trimmedTax)) || Number(trimmedTax) < 0) {
      showToast("⚠️ خطأ في الإدخال: يرجى تحديد نسبة ضريبة افتراضية صالحة (0 أو أكبر).");
      return;
    }

    if (!trimmedTargetName) {
      showToast("⚠️ خطأ في الإدخال: يرجى تحديد اسم كشف الإكسيل الافتراضي للمزامنة.");
      return;
    }

    setIsSaving(true);
    try {
      // Save link to server (even if empty, so they can remove it)
      const res = await fetch("/api/excel-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link: trimmedLink, viewLink: trimmedViewLink })
      });
      if (res.ok) {
        // Persist non-server settings and excel keys in localStorage for seamless consistency
        localStorage.setItem("phonePreset", trimmedPhone);
        localStorage.setItem("taxPreset", trimmedTax);
        localStorage.setItem("fallbackLanguage", fallbackLanguage);
        localStorage.setItem("excelTargetName", trimmedTargetName);
        localStorage.setItem("oa_excel_sheet_link", trimmedLink);
        localStorage.setItem("oa_google_sheet_view_link", trimmedViewLink);

        if (trimmedLink || trimmedViewLink) {
          showToast("✅ تم حفظ الإعدادات الافتراضية بنجاح وربط شيت جوجل بالمزامنة النشطة!");
        } else {
          showToast("✅ تم حفظ الإعدادات الافتراضية بنجاح! لم يتم ربط كشف إكسيل بعد.");
        }
      } else {
        showToast("⚠️ تنبيه: فشل حفظ رابط الإكسيل على السيرفر.");
      }
    } catch (err) {
      console.error(err);
      showToast("❌ حدث خطأ غير متوقع أثناء حفظ الإعدادات ورابط الإكسيل.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetSystem = async () => {
    setIsResetting(true);
    try {
      const res = await fetch("/api/reset", { method: "POST" });
      if (res.ok) {
        // Clear all local storage data to reset client as well as server
        localStorage.clear();
        showToast("تم إعادة ضبط البراند على نقطة الصفر كاملة! جاري إعادة التحميل...");
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        showToast("عذراً، حدث خطأ أثناء تصفير البيانات.");
      }
    } catch (err) {
      console.error(err);
      showToast("عذراً، حدث خطأ شبكة أثناء تصفير البيانات.");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-8 py-6 font-sans">
      
      {/* Header */}
      <div className="mb-6 text-right" dir="rtl">
        <h2 className="text-3xl font-display font-bold text-black tracking-tight mb-1">
          إعدادات النظام وتخصيص الفواتير
        </h2>
        <p className="text-sm text-[#5d5e66] max-w-2xl leading-relaxed">
          قم بتحديد القيم الافتراضية للبراند مثل رقم هاتف التواصل المطبوع تحت الفواتير، واسم كشف الإكسيل المعتمد، ورابط ملفك المباشر.
        </p>
      </div>

      {/* Main settings grid bento structure */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-sans" dir="rtl">
        
        {/* Presets settings fields column (spans 2) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white border border-[#cfc4c5] rounded-xl p-5 shadow-sm space-y-4">
            
            <div className="flex items-center gap-2 border-b border-[#eeeeef] pb-3">
              <Sliders className="w-4.5 h-4.5 text-[#5d5e66]" />
              <h3 className="text-xs font-bold text-black">الإعدادات الافتراضية للشركة وقالب الطباعة</h3>
            </div>

            {/* Field item 1 */}
            <div>
              <label className="text-[10px] font-bold text-[#5d5e66] uppercase block mb-1">
                رقم التليفون الأساسي للتواصل (Contact Phone Preset)
              </label>
              <input 
                type="text" 
                value={phonePreset} 
                onChange={(e) => setPhonePreset(e.target.value)}
                className="w-full bg-[#f9f9fa] border-b border-[#cfc4c5] focus:border-black text-xs text-black py-1.5 px-3 outline-none font-semibold font-mono"
                dir="ltr"
              />
              <p className="text-[9px] text-gray-400 mt-1">يظهر هذا الرقم بالكامل في الشريط الأزرق أسفل الفاتورة المطبوعة للعميل.</p>
            </div>

            {/* Field item 2 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-[#5d5e66] uppercase block mb-1">
                  رابط عرض شيت جوجل الذكي (Google Sheet View Link)
                </label>
                <input 
                  type="url" 
                  value={googleSheetViewLink} 
                  onChange={(e) => setGoogleSheetViewLink(e.target.value)}
                  placeholder="مثال: https://docs.google.com/spreadsheets/d/ID/edit"
                  className="w-full bg-[#f9f9fa] border-b border-[#cfc4c5] focus:border-black text-xs text-black py-1.5 px-3 outline-none font-sans"
                />
                <p className="text-[9px] text-gray-400 mt-1">يستخدم لعرض شيت مبيعاتك حياً في المتصفح وفتحه بضغطة زر واحدة.</p>
              </div>

              <div>
                <label className="text-[10px] font-bold text-[#5d5e66] uppercase block mb-1">
                  رابط المزامنة التلقائية (Apps Script Web App URL)
                </label>
                <input 
                  type="url" 
                  value={excelSheetLink} 
                  onChange={(e) => setExcelSheetLink(e.target.value)}
                  placeholder="مثال: https://script.google.com/macros/s/ID/exec"
                  className="w-full bg-[#f9f9fa] border-b border-[#cfc4c5] focus:border-black text-xs text-black py-1.5 px-3 outline-none font-sans"
                />
                <p className="text-[9px] text-gray-400 mt-1">يستخدم للاتصال البرمجي بالخلفية وإرسال الفواتير أوتوماتيكياً للشيت.</p>
              </div>
            </div>

            {/* Field item 3 */}
            <div>
              <label className="text-[10px] font-bold text-[#5d5e66] uppercase block mb-1">
                نسبة الضريبة الافتراضية المضافة (%)
              </label>
              <input 
                type="number" 
                value={taxPreset} 
                onChange={(e) => setTaxPreset(e.target.value)}
                className="w-full bg-[#f9f9fa] border-b border-[#cfc4c5] focus:border-black text-xs text-black py-1.5 px-3 outline-none font-mono"
              />
            </div>

            {/* Field item 4 */}
            <div>
              <label className="text-[10px] font-bold text-[#5d5e66] uppercase block mb-1">
                اللغة الأساسية لواجهة الفواتير المطبوعة
              </label>
              <select 
                value={fallbackLanguage}
                onChange={(e) => setFallbackLanguage(e.target.value)}
                className="w-full bg-[#f9f9fa] border-b border-[#cfc4c5] focus:border-black text-xs text-black py-1.5 px-2 outline-none font-sans"
              >
                <option value="ar">العربية والإنجليزية المزدوجة (Dual Core)</option>
                <option value="en">الإنجليزية فقط (English Pure)</option>
              </select>
            </div>

            {/* Field item 5 */}
            <div>
              <label className="text-[10px] font-bold text-[#5d5e66] uppercase block mb-1">
                اسم كشف الإكسيل الافتراضي للمزامنة
              </label>
              <input 
                type="text" 
                value={excelTargetName} 
                onChange={(e) => setExcelTargetName(e.target.value)}
                className="w-full bg-[#f9f9fa] border-b border-[#cfc4c5] focus:border-black text-xs text-black py-1.5 px-3 outline-none font-mono"
              />
            </div>

            {/* Saving trigger */}
            <div className="pt-2 border-t border-[#eeeeef] flex justify-end">
              <button 
                onClick={handleSaveSettings}
                disabled={isSaving}
                className="bg-black hover:bg-zinc-800 disabled:bg-gray-400 text-white font-bold text-xs px-6 py-2.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer shadow-sm active:scale-95"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? "جاري حفظ الإعدادات..." : "حفظ التغييرات والرابط"}</span>
              </button>
            </div>

          </div>
        </div>

        {/* Right workspace details column (spans 1) */}
        <div className="space-y-4">

          {/* Reset Session System to zero point */}
          <div className="bg-red-50/75 border border-red-200 rounded-xl p-5 shadow-sm text-right">
            <div className="flex items-center gap-1.5 text-red-600 mb-3 font-semibold text-xs">
              <RotateCcw className="w-4 h-4 shrink-0" />
              <span>إعادة الضبط لنقطة الصفر للموقع</span>
            </div>
            <p className="text-[10px] text-gray-600 leading-relaxed mb-4">
              اضغط على هذا الزر لمسح جميع البيانات المدخلة، وفواتير السجل، والعودة إلى صفر إحصائيات لكي تتمكن من بدء عمل جديد كلياً.
            </p>
            
            {!showResetConfirm ? (
              <button
                onClick={() => setShowResetConfirm(true)}
                className="w-full bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold py-2.5 rounded-lg transition active:scale-95 cursor-pointer shadow-sm text-center"
              >
                مسح وتصفير كل البيانات (Reset)
              </button>
            ) : (
              <div className="space-y-2 mt-2">
                <p className="text-[10px] text-red-700 font-bold bg-red-100/60 p-2 rounded text-center leading-normal">
                  ⚠️ هل أنت متأكد؟ سيتم مسح كافة البيانات بشكل كامل ونهائي فوراً!
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleResetSystem}
                    disabled={isResetting}
                    className="flex-1 bg-red-700 hover:bg-red-800 text-white text-[10px] font-bold py-2 rounded-lg transition cursor-pointer text-center"
                  >
                    {isResetting ? "جاري التصفير..." : "نعم، متأكد"}
                  </button>
                  <button
                    onClick={() => setShowResetConfirm(false)}
                    className="flex-1 bg-gray-200 hover:bg-gray-300 text-black text-[10px] font-bold py-2 rounded-lg transition cursor-pointer text-center"
                  >
                    إلغاء التصفير
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white border border-[#cfc4c5] rounded-xl p-5 shadow-[0px_4px_20px_rgba(0,0,0,0.01)] text-right">
            <h4 className="text-xs font-bold text-black mb-3 border-b border-[#eeeeef] pb-2 flex items-center gap-1.5">
              <Globe className="w-4.5 h-4.5 text-[#5d5e66]" />
              <span>معلومات النطاق والتشغيل</span>
            </h4>
            <div className="space-y-2 text-[10px] text-gray-500 leading-relaxed font-mono">
              <div className="flex justify-between">
                <span>Domain Host</span>
                <span>ais-dev-europe-west1.run.app</span>
              </div>
              <div className="flex justify-between">
                <span>Secure Sockets Layer</span>
                <span className="text-green-600 font-bold">ACTIVE (HTTPS)</span>
              </div>
              <div className="flex justify-between">
                <span>Response Grounding</span>
                <span>Gemini Core Active</span>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
