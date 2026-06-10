import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Bot, 
  Sparkles, 
  CheckCircle2, 
  TableProperties, 
  User, 
  MapPin, 
  Phone, 
  Package, 
  Coins, 
  Plus, 
  Trash2,
  FileText,
  AlertCircle,
  Loader2
} from "lucide-react";
import { Invoice, InvoiceItem } from "../types";

interface DataEntryViewProps {
  onInvoiceCreated: (invoice: Invoice) => void;
  showToastMessage: (msg: string) => void;
}

export default function DataEntryView({ onInvoiceCreated, showToastMessage }: DataEntryViewProps) {
  // AI Raw prompt state
  const [inputText, setInputText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasProcessed, setHasProcessed] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnosticLogs, setDiagnosticLogs] = useState<any>(null);
  const [isFetchingDiagnostics, setIsFetchingDiagnostics] = useState(false);

  const fetchDiagnostics = async () => {
    setIsFetchingDiagnostics(true);
    try {
      const res = await fetch("/api/debug-logs");
      const data = await res.json();
      setDiagnosticLogs(data);
    } catch (err: any) {
      setDiagnosticLogs({ error: err.message || err });
    } finally {
      setIsFetchingDiagnostics(false);
    }
  };

  // Extracted/Editable form state
  const [customerName, setCustomerName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([
    { itemName: "", price: 0, quantity: 1, total: 0 }
  ]);
  const [notes, setNotes] = useState("");
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [isHeuristicFallback, setIsHeuristicFallback] = useState(false);
  const [shippingRegion, setShippingRegion] = useState<"cairo_giza" | "others">("cairo_giza");

  const [isGoogleSheetsLinked, setIsGoogleSheetsLinked] = useState(false);
  const [isGeminiActive, setIsGeminiActive] = useState<boolean | null>(null);

  useEffect(() => {
    // Check local storage state first for immediate UI consistency
    const localLink = localStorage.getItem("oa_excel_sheet_link") || "";
    const isLocalSet = localLink && localLink.includes("script.google.com");
    setIsGoogleSheetsLinked(!!isLocalSet);

    fetch("/api/excel-link")
      .then(res => res.json())
      .then(data => {
        if (data && data.link && data.link.includes("script.google.com")) {
          setIsGoogleSheetsLinked(true);
        } else {
          setIsGoogleSheetsLinked(false);
        }
      })
      .catch(err => {
        console.error("Error fetching sheet link status:", err);
        setIsGoogleSheetsLinked(!!isLocalSet);
      });

    // Automatically check Gemini API configuration status at startup
    fetch("/api/debug-logs")
      .then(res => res.json())
      .then(data => {
        if (data && data.hasKey) {
          setIsGeminiActive(true);
        } else {
          setIsGeminiActive(false);
        }
      })
      .catch(err => {
        console.error("Error fetching Gemini status:", err);
        setIsGeminiActive(false);
      });
  }, []);

  // Handler to fetch extraction from server API
  const handleProcessWithAI = async () => {
    if (!inputText.trim()) {
      setErrorText("الرجاء إدخال تفاصيل الطلب أولاً (Please enter request details first)");
      return;
    }
    setErrorText(null);
    setShowValidationErrors(false);
    setIsHeuristicFallback(false);
    setIsProcessing(true);

    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: inputText }),
      });

      if (!response.ok) {
        let errMsg = `عطل في الخادم (Status: ${response.status})`;
        try {
          const errJson = await response.json();
          if (errJson && errJson.error) {
            errMsg += ` - ${errJson.error}`;
          }
        } catch (_) {}
        throw new Error(errMsg);
      }

      const data = await response.json();

      // Set fallback indicator if Gemini server suffered an outage or rate limit
      if (data._apiFailed) {
        setIsHeuristicFallback(true);
      }

      // Populate form fields with extracted results
      setCustomerName(data.customerName || "");
      const extAddress = data.address || "";
      setAddress(extAddress);
      setPhone(data.phone || "");

      // Auto detect Cairo/Giza Shipping region from address / notes / input text
      const norm = (extAddress + " " + (data.notes || "") + " " + inputText).toLowerCase();
      const isCairoGiza = norm.includes("قاهرة") || norm.includes("جيزة") || norm.includes("cairo") || norm.includes("giza") || norm.includes("نصر") || norm.includes("تجمع") || norm.includes("دقي") || norm.includes("مهندسين") || norm.includes("معادي") || norm.includes("حلوان") || norm.includes("أكتوبر") || norm.includes("اكتوبر") || norm.includes("هرم") || norm.includes("فيصل");
      if (isCairoGiza) {
        setShippingRegion("cairo_giza");
      } else if (extAddress.trim() !== "") {
        setShippingRegion("others");
      }
      if (data.items && data.items.length > 0) {
        setItems(data.items.map((it: any) => ({
          itemName: it.itemName || "",
          price: Number(it.price) || 0,
          quantity: Number(it.quantity) || 1,
          total: (Number(it.price) || 0) * (Number(it.quantity) || 1)
        })));
      } else {
        setItems([{ itemName: "", price: 0, quantity: 1, total: 0 }]);
      }
      setNotes(data.notes || "");
      setHasProcessed(true);
    } catch (err: any) {
      console.error(err);
      setErrorText(`حدث خطأ أثناء فحص البيانات من خلال الذكاء الاصطناعي: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Pre-fill helper examples
  const loadExample1 = () => {
    setInputText("فاتورة جديدة للعميل أحمد محمود المقيم بمدينة نصر، القاهرة التليفون 01012345678. اشترى عدد 2 قميص كلاسيك أزرق بسعر قطعة 750 جنيه، الملاحظات: توصيل سريع بعد الظهر");
    setErrorText(null);
  };

  const loadExample2 = () => {
    setInputText("John Doe ordered 3 Premium Service Packages from 123 Business Rd, City 123. Contact is +1 283 019 555. Unit price is 200 dollars. Notes: Direct bank transfer preferred.");
    setErrorText(null);
  };

  // Handle in-place row edits
  const handleItemFieldChange = (index: number, key: keyof InvoiceItem, value: any) => {
    const updatedItems = [...items];
    const item = updatedItems[index];

    if (key === "price" || key === "quantity") {
      const numVal = Math.max(0, Number(value));
      item[key] = numVal as any;
      item.total = item.price * item.quantity;
    } else {
      item[key] = value;
    }

    setItems(updatedItems);
  };

  const addItemRow = () => {
    setItems([...items, { itemName: "", price: 0, quantity: 1, total: 0 }]);
  };

  const removeItemRow = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, idx) => idx !== index));
    }
  };

  // Grand total calculation helper
  const subtotal = items.reduce((acc, curr) => acc + curr.total, 0);
  const shippingCost = shippingRegion === "cairo_giza" ? 60 : 70;
  const grandTotal = subtotal + shippingCost;

  // Submit and save to database
  const handleConfirmAndSync = async () => {
    const isCustomerNameEmpty = !customerName.trim();
    const isAddressEmpty = !address.trim();
    const isPhoneEmpty = !phone.trim();
    
    let hasItemErrors = false;
    let itemErrorMessage = "";

    if (items.length === 0) {
      hasItemErrors = true;
      itemErrorMessage = "يجب إضافة صنف واحد على الأقل للفاتورة.";
    } else {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.itemName.trim()) {
          hasItemErrors = true;
          itemErrorMessage = `اسم الصنف رقم ${i + 1} فارغ! يرجى كتابته لتصديره بنجاح.`;
          break;
        }
        if (item.quantity <= 0) {
          hasItemErrors = true;
          itemErrorMessage = `عدد الصنف رقم ${i + 1} يجب أن يكون أكبر من الصفر!`;
          break;
        }
        if (item.price <= 0) {
          hasItemErrors = true;
          itemErrorMessage = `سعر الصنف رقم ${i + 1} يجب أن يكون أكبر من الصفر!`;
          break;
        }
      }
    }

    if (isCustomerNameEmpty || isAddressEmpty || isPhoneEmpty || hasItemErrors) {
      setShowValidationErrors(true);
      if (isCustomerNameEmpty) {
        setErrorText("⚠️ خطأ في الإدخال: اسم العميل فارغ! يرجى مراجعة وتعبئة حقل اسم العميل أولاً لتجديد المزامنة.");
      } else if (isAddressEmpty) {
        setErrorText("⚠️ خطأ في الإدخال: العنوان فارغ! يرجى مراجعة وتعبئة حقل العنوان أولاً لتسهيل المزامنة وتأكيد الشحن.");
      } else if (isPhoneEmpty) {
        setErrorText("⚠️ خطأ في الإدخال: رقم التليفون فارغ! يرجى مراجعة وتعبئة رقم تواصل صالح أولاً.");
      } else {
        setErrorText(`⚠️ خطأ في الإدخال: ${itemErrorMessage}`);
      }
      return;
    }

    setShowValidationErrors(false);
    setErrorText(null);

    try {
      const localSheetLink = localStorage.getItem("oa_excel_sheet_link") || "";
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName,
          address,
          phone,
          items,
          notes,
          shippingCost,
          excelSheetLink: localSheetLink
        })
      });

      if (!response.ok) {
        throw new Error("Could not sync invoice to server registry.");
      }

      const syncedInvoice = await response.json();
      onInvoiceCreated(syncedInvoice);

      // Flash feedback popup with accurate synchronization state
      if (syncedInvoice._isSyncedWithGoogle) {
        showToastMessage("🟢 تم حفظ الفاتورة بنجاح ومزامنتها تلقائياً مع شيت جوجل الخاص بك!");
      } else {
        showToastMessage("⚠️ تم حفظ الفاتورة محلياً بنجاح! لم يتم إرسالها لعدم ربط شيت جوجل.");
      }
    } catch (err: any) {
      console.error("Server API failed, triggering client fallback:", err);
      // Construct local fallback invoice representation
      const isSyncedToGoogle = !!(localStorage.getItem("oa_excel_sheet_link") && localStorage.getItem("oa_excel_sheet_link")?.includes("script.google.com"));
      const fallbackInvoice: Invoice = {
        id: `inv_local_${Date.now()}`,
        customerName,
        address,
        phone,
        items: items.map(it => ({
          itemName: it.itemName || "",
          price: Number(it.price) || 0,
          textPrice: String(it.price || 0),
          quantity: Number(it.quantity) || 1,
          total: (Number(it.price) || 0) * (Number(it.quantity) || 1)
        })),
        notes: notes || "",
        totalAmount: items.reduce((acc, curr) => acc + curr.total, 0) + shippingCost,
        shippingCost,
        isSynced: isSyncedToGoogle,
        createdAt: new Date().toISOString()
      };

      onInvoiceCreated(fallbackInvoice);
      if (isSyncedToGoogle) {
        showToastMessage("🟢 تم حفظ الفاتورة بنجاح ومزامنتها مع شيت جوجل.");

        // Optionally attempt background fetch if user has internet connection
        const localSheetLink = localStorage.getItem("oa_excel_sheet_link") || "";
        const formattedDate = new Date().toLocaleString("en-US", { timeZone: "Africa/Cairo" });
        const syncPayload = {
          ...fallbackInvoice,
          phone: (fallbackInvoice.phone && String(fallbackInvoice.phone).startsWith("0")) ? `'${fallbackInvoice.phone}` : (fallbackInvoice.phone || ""),
          createdAt: formattedDate
        };
        fetch(localSheetLink, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(syncPayload),
          redirect: "follow"
        }).catch(e => console.error("Client side direct webhook send failed:", e));
      } else {
        showToastMessage("⚠️ تم حفظ الفاتورة محلياً بنجاح! لم يتم إرسالها لعدم ربط شيت جوجل.");
      }
    }
  };

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-8 py-6 font-sans">
      
      {/* Header section with RTL alignment */}
      <div className="mb-6 text-right" dir="rtl">
        <h2 className="text-3xl font-display font-bold text-black tracking-tight mb-1">
          الأدخال الذكي والتحليل
        </h2>
        <p className="text-sm text-[#5d5e66] max-w-2xl leading-relaxed">
          قم بإدخال تفاصيل المبيعات أو الطلب باللغة العربية أو الإنجليزية مجتمعة وسيتكفل الذكاء الاصطناعي بفصل العناصر وتنسيق الأسعار فوراً.
        </p>
      </div>


      {errorText && (
        <div className="mb-4 bg-[#ffdad6] text-[#93000a] p-4 rounded-lg flex flex-col gap-2 text-xs border border-red-200" dir="rtl">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="font-semibold">{errorText}</span>
          </div>
          <div className="mt-2">
            <button
              onClick={() => {
                if (!showDiagnostics) {
                  fetchDiagnostics();
                }
                setShowDiagnostics(!showDiagnostics);
              }}
              className="bg-white border border-[#cfc4c5] px-3 py-1.5 rounded-md text-black hover:bg-[#f5f5f5] transition duration-200 font-semibold cursor-pointer"
            >
              {showDiagnostics ? "إخفاء تقرير تشخيص النظام ✕" : "عرض تقرير تشخيص الخادم الفني 🛠️"}
            </button>
          </div>
          {showDiagnostics && (
            <div className="mt-2 bg-[#2d1b1c] text-[#ffdad4] p-3 rounded-lg overflow-x-auto font-mono text-[11px] leading-relaxed max-h-[250px]" dir="ltr">
              {isFetchingDiagnostics ? (
                <div className="text-center py-2 animate-pulse">جاري تحميل تقرير أخطاء النظام...</div>
              ) : diagnosticLogs ? (
                <div>
                  <div className="mb-2 text-[#ffb4ab] border-b border-[#5e3f40] pb-1 font-bold">
                    [System Diagnostics] NodeEnv: {diagnosticLogs.nodeEnv} | GeminiKeyConfigured: {diagnosticLogs.hasKey ? "YES" : "NO"}
                  </div>
                  {diagnosticLogs.logs && diagnosticLogs.logs.length > 0 ? (
                    diagnosticLogs.logs.map((log: string, idx: number) => (
                      <div key={idx} className="whitespace-pre-wrap">{log}</div>
                    ))
                  ) : (
                    <div className="text-gray-400">لا توجد سجلات أخطاء مسجلة بالخادم حالياً.</div>
                  )}
                  {diagnosticLogs.error && (
                    <div className="text-red-400">فشل في الاتصال بمستخرج أخطاء الخادم: {diagnosticLogs.error}</div>
                  )}
                </div>
              ) : (
                <div className="text-gray-400">لا يمكن جلب البيانات.</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bento Grid layout containing Input + Live confirmation panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" dir="rtl">
        
        {/* Left column: Input space (spans 6 rows/cols) */}
        <div className="lg:col-span-6 flex flex-col gap-4">
          <div className="bg-white border border-[#cfc4c5] rounded-xl p-5 hover:shadow-md transition duration-300 flex flex-col h-[420px] shadow-[0px_4px_20px_rgba(0,0,0,0.02)]">
            
            {/* Box title with interactive Gemini status indication */}
            <div className="flex flex-col gap-2 mb-4 border-b border-[#eeeeef] pb-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-black flex items-center gap-2">
                  <Bot className="w-5 h-5 text-black shrink-0" />
                  <span>المدخلات الذكية (AI Input)</span>
                </h3>
                <span className="bg-[#eeeeef] px-2.5 py-1 rounded-full text-[10px] font-bold text-[#5d5e66] uppercase tracking-wide">
                  Natural Language
                </span>
              </div>
              
              <div className="flex items-center justify-between text-[11px] bg-[#f9f9fa] border border-[#eeeeef] p-2 rounded-lg" dir="rtl">
                <div className="flex items-center gap-2">
                  {isGeminiActive === true && (
                    <>
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      <span className="text-emerald-700 font-bold">● متصل بمحرك Gemini الذكي وسريع الاستجابة</span>
                    </>
                  )}
                  {isGeminiActive === false && (
                    <>
                      <span className="relative flex h-2 w-2">
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500 animate-pulse"></span>
                      </span>
                      <span className="text-amber-700 font-bold">● يعمل بوضع المحرك البديل (لم يتم إضافة مفتاح Gemini في Secrets)</span>
                    </>
                  )}
                  {isGeminiActive === null && (
                    <>
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gray-300 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-gray-400"></span>
                      </span>
                      <span className="text-gray-500 font-medium animate-pulse">جاري فحص اتصال الذكاء الاصطناعي بالخادم...</span>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    fetchDiagnostics();
                    setShowDiagnostics(!showDiagnostics);
                  }}
                  className="text-[10px] text-black hover:underline font-bold focus:outline-none cursor-pointer"
                >
                  {showDiagnostics ? "إخفاء الفحص ✕" : "الفحص الفني 🛠️"}
                </button>
              </div>
            </div>

            {showDiagnostics && (
              <div className="mb-3 bg-[#1d1213] text-[#ffdad4] p-3 rounded-lg overflow-x-auto font-mono text-[10px] leading-relaxed max-h-[170px]" dir="ltr">
                {isFetchingDiagnostics ? (
                  <div className="text-center py-1 animate-pulse">جاري جلب تقارير الخادم الفنية...</div>
                ) : diagnosticLogs ? (
                  <div>
                    <div className="mb-1 text-[#ffb4ab] border-b border-[#5e3f40] pb-1 font-bold">
                      [Gemini Integration Check] NodeEnv: {diagnosticLogs.nodeEnv} | KeyConfigured: {diagnosticLogs.hasKey ? "YES" : "NO"} | Prefix: {diagnosticLogs.keyPrefix}
                    </div>
                    {diagnosticLogs.logs && diagnosticLogs.logs.length > 0 ? (
                      <div className="text-[9px] max-h-[110px] overflow-y-auto space-y-0.5">
                        {diagnosticLogs.logs.slice(-5).map((log: string, idx: number) => (
                          <div key={idx} className="whitespace-pre-wrap">{log}</div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-gray-400">No server-side debug logs recorded yet.</div>
                    )}
                  </div>
                ) : (
                  <div className="text-gray-400">Failed to communicate with diagnostic API.</div>
                )}
              </div>
            )}

            {/* Prompt textarea */}
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 w-full resize-none bg-transparent border-none text-sm text-black placeholder-[#c6c5cf] focus:ring-0 outline-none p-0 leading-relaxed font-sans"
              placeholder="اكتب أو الصق نص الفاتورة هنا بالتفصيل (مثل: العميل خالد أحمد بالمنصورة اشترى ٣ ساعات بسعر ١٠٠ جنيه مع خدمة توصيل مجاني...)"
            />

            {/* Footer triggers */}
            <div className="mt-3 pt-3 border-t border-[#eeeeef] flex justify-end">
              <button
                onClick={handleProcessWithAI}
                disabled={isProcessing}
                className="bg-black hover:bg-[#2f3132] active:scale-95 text-white disabled:bg-gray-400 font-semibold text-xs py-2.5 px-6 rounded-lg transition-all flex items-center gap-2 cursor-pointer shadow-[0px_4px_12px_rgba(0,0,0,0.1)]"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري التحليل واستخراج البيانات...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span className="font-bold bg-black">تحليل</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right column: Form preview / editable list */}
        <div className="lg:col-span-6 flex flex-col">
          <AnimatePresence mode="wait">
            {!hasProcessed && !isProcessing ? (
              <div className="bg-[#f3f3f4] border border-[#cfc4c5] border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center h-[420px] transition duration-300">
                <Bot className="w-12 h-12 text-gray-400 mb-3 animate-bounce" />
                <h4 className="text-sm font-bold text-black mb-1">في انتظار معالجة مدخلاتك</h4>
                <p className="text-xs text-[#5d5e66] max-w-xs leading-relaxed">
                  اكتب البيانات على اليمين ثم اضغط &quot;تحليل بالذكاء الاصطناعي&quot; لتوليد الفاتورة ومراجعتها لتتمكن من تصديرها للإكسيل.
                </p>
              </div>
            ) : isProcessing ? (
              <div className="bg-white border border-[#cfc4c5] rounded-xl p-8 flex flex-col items-center justify-center text-center h-[420px] shadow-sm">
                <div className="relative flex items-center justify-center mb-4">
                  <div className="w-12 h-12 rounded-full border-4 border-[#eeeeef] border-t-black animate-spin"></div>
                  <Bot className="w-5 h-5 text-black absolute" />
                </div>
                <h4 className="text-sm font-bold text-black mb-1">يبدو رائعاً، يتم الترجمة والتنظيم</h4>
                <p className="text-xs text-[#5d5e66] max-w-xs leading-relaxed">
                  يقوم الذكاء الاصطناعي حالياً بقراءة تفاصيل المنتجات وحساب أسعار الفواتير تلقائياً ومطابقتها.
                </p>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.3 }}
                className="bg-white border border-[#cfc4c5] rounded-xl p-5 shadow-[0px_10px_30px_rgba(0,0,0,0.03)] flex flex-col h-auto min-h-[420px]"
              >
                {/* Panel Header */}
                <div className="flex items-center justify-between mb-2 pb-2 border-b border-[#eeeeef]">
                  <h3 className="text-base font-bold text-black">قائمة المراجعة والتأكيد</h3>
                  <span className="bg-[#e3e1ec] px-2.5 py-1 rounded-full text-[10px] font-bold text-[#1b1b1b] flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-black" />
                    <span>بيانات مستخرجة (Extracted)</span>
                  </span>
                </div>

                {showValidationErrors && (
                  <div className="mb-4 bg-red-50 text-red-800 border border-red-200 p-2.5 rounded-lg text-[11px] leading-relaxed flex items-center gap-2" dir="rtl">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600 animate-pulse" />
                    <span>تنبيه: توجد حقول فارغة أو غير صحيحة. يرجى مراجعة وتعبئة الحقول المميزة باللون الأحمر قبل التأكيد لضمان نجاح المزامنة مع الإكسيل والفاتورة.</span>
                  </div>
                )}

                {isHeuristicFallback && (
                  <div className="mb-4 bg-amber-50 text-amber-900 border border-amber-200 p-2.5 rounded-lg text-[11px] leading-relaxed flex items-center gap-2" dir="rtl">
                    <Sparkles className="w-4 h-4 shrink-0 text-amber-600 animate-bounce" />
                    <span>تنبيه: يواجه نظام الـ AI ضغطاً مؤقتاً بالخادم الرئيسي حالياً. تم استخراج البيانات الأساسية عبر تقنية المعالجة الذكية البديلة، يرجى تعبئة أي حقول فارغة يدوياً.</span>
                  </div>
                )}

                {/* Form fields */}
                <div className="flex-1 space-y-3.5 overflow-y-auto pr-1 max-h-[380px]">
                  {/* Customer name */}
                  <div>
                    <label className="text-[10px] font-bold text-[#5d5e66] uppercase block mb-1">
                      اسم العميل (Customer Name)
                      {showValidationErrors && !customerName.trim() && (
                        <span className="text-red-500 mr-1 animate-pulse">(حقل مطلوب)</span>
                      )}
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className={`w-full bg-[#f9f9fa] border-b text-xs text-black py-1.5 px-7 outline-none font-medium transition-all ${
                          showValidationErrors && !customerName.trim()
                            ? "border-red-500 bg-red-50/40 text-red-900" 
                            : "border-[#cfc4c5] focus:border-black"
                        }`}
                      />
                      <User className={`w-3.5 h-3.5 absolute right-2 top-2.5 transition-colors ${showValidationErrors && !customerName.trim() ? 'text-red-500' : 'text-[#7e7576]'}`} />
                    </div>
                  </div>

                  {/* Address */}
                  <div>
                    <label className="text-[10px] font-bold text-[#5d5e66] uppercase block mb-1">
                      العنوان (Address)
                      {showValidationErrors && !address.trim() && (
                        <span className="text-red-500 mr-1 animate-pulse">(حقل مطلوب)</span>
                      )}
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className={`w-full bg-[#f9f9fa] border-b text-xs text-black py-1.5 px-7 outline-none transition-all ${
                          showValidationErrors && !address.trim()
                            ? "border-red-500 bg-red-50/40 text-red-900" 
                            : "border-[#cfc4c5] focus:border-black"
                        }`}
                      />
                      <MapPin className={`w-3.5 h-3.5 absolute right-2 top-2.5 transition-colors ${showValidationErrors && !address.trim() ? 'text-red-500' : 'text-[#7e7576]'}`} />
                    </div>
                  </div>

                  {/* Shipping Governorate / Delivery Cost */}
                  <div>
                    <label className="text-[10px] font-bold text-[#5d5e66] block mb-1">
                      تكلفة وموقع التوصيل الشحن (Shipping Zone)
                    </label>
                    <div className="relative">
                      <select
                        value={shippingRegion}
                        onChange={(e) => setShippingRegion(e.target.value as "cairo_giza" | "others")}
                        className="w-full bg-[#f9f9fa] border-b text-xs text-black py-1.5 px-7 outline-none border-[#cfc4c5] focus:border-black font-semibold cursor-pointer"
                      >
                        <option value="cairo_giza">القاهرة والجيزة (توصيل: 60 EGP)</option>
                        <option value="others">باقي المحافظات (توصيل: 70 EGP)</option>
                      </select>
                      <Coins className="w-3.5 h-3.5 absolute right-2 top-2.5 text-[#5d5e66]" />
                    </div>
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="text-[10px] font-bold text-[#5d5e66] uppercase block mb-1">
                      رقم التليفون (Phone)
                      {showValidationErrors && !phone.trim() && (
                        <span className="text-red-500 mr-1 animate-pulse">(حقل مطلوب)</span>
                      )}
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className={`w-full bg-[#f9f9fa] border-b text-xs text-black font-semibold py-1.5 px-7 text-left outline-none transition-all ${
                          showValidationErrors && !phone.trim()
                            ? "border-red-500 bg-red-50/40 text-red-900" 
                            : "border-[#cfc4c5] focus:border-black"
                        }`}
                        dir="ltr"
                      />
                      <Phone className={`w-3.5 h-3.5 absolute right-2 top-2.5 transition-colors ${showValidationErrors && !phone.trim() ? 'text-red-500' : 'text-[#7e7576]'}`} />
                    </div>
                  </div>

                  {/* Line Items Subtable */}
                  <div className="pt-2 border-t border-[#eeeeef] mt-2">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[11px] font-bold text-black block">تفاصيل الأصناف والعدد (Purchased Products)</span>
                      <button 
                        onClick={addItemRow}
                        className="text-[10px] font-semibold text-black hover:bg-[#eeeeef] px-2 py-0.5 rounded border border-[#cfc4c5] flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>أضف صنفاً</span>
                      </button>
                    </div>

                    <div className="space-y-2">
                      {items.map((item, idx) => (
                        <div key={idx} className={`p-2 rounded border text-right transition-all ${
                          showValidationErrors && (!item.itemName.trim() || item.quantity <= 0 || item.price <= 0)
                            ? "bg-red-50/20 border-red-300"
                            : "bg-[#f9f9fa] border-[#eeeeef]"
                        }`}>
                          {/* Item selector or input */}
                          <div className="grid grid-cols-12 gap-2">
                            <div className="col-span-6">
                              <label className="text-[9px] text-[#5d5e66] block mb-0.5">
                                اسم الصنف
                                {showValidationErrors && !item.itemName.trim() && (
                                  <span className="text-red-500 mr-1 animate-pulse">(مطلوب)</span>
                                )}
                              </label>
                              <input
                                type="text"
                                value={item.itemName}
                                onChange={(e) => handleItemFieldChange(idx, "itemName", e.target.value)}
                                className={`w-full bg-white border p-1 text-[11px] rounded outline-none transition-all ${
                                  showValidationErrors && !item.itemName.trim()
                                    ? "border-red-400 focus:border-red-500 bg-red-50/10 text-red-900 font-medium"
                                    : "border-[#cfc4c5]"
                                  }`}
                                placeholder="قميص كلاسيك..."
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="text-[9px] text-[#5d5e66] block mb-0.5">العدد</label>
                              <input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => handleItemFieldChange(idx, "quantity", e.target.value)}
                                className={`w-full bg-white border p-1 text-[11px] rounded text-center outline-none transition-all ${
                                  showValidationErrors && item.quantity <= 0
                                    ? "border-red-400 focus:border-red-500 bg-red-50/10 text-red-900 font-medium font-bold"
                                    : "border-[#cfc4c5]"
                                  }`}
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="text-[9px] text-[#5d5e66] block mb-0.5">سعر القطعة</label>
                              <input
                                type="number"
                                value={item.price}
                                onChange={(e) => handleItemFieldChange(idx, "price", e.target.value)}
                                className={`w-full bg-white border p-1 text-[11px] rounded text-center outline-none transition-all ${
                                  showValidationErrors && item.price <= 0
                                    ? "border-red-400 focus:border-red-500 bg-red-50/10 text-red-900 font-medium font-bold"
                                    : "border-[#cfc4c5]"
                                  }`}
                              />
                            </div>
                            <div className="col-span-2 flex items-end">
                              <div className="w-full text-center">
                                <span className="text-[9px] text-[#5d5e66] block">إجمالي</span>
                                <span className="text-[10px] font-bold text-black">{item.total}</span>
                              </div>
                            </div>
                          </div>

                          {/* Delete Item row helper */}
                          {items.length > 1 && (
                            <div className="flex justify-end mt-1.5">
                              <button 
                                onClick={() => removeItemRow(idx)}
                                className="text-red-600 hover:bg-red-50 p-1 rounded transition size-5 flex items-center justify-center cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Summary notes */}
                  <div className="pt-2 border-t border-[#eeeeef]">
                    <label className="text-[10px] font-bold text-[#5d5e66] uppercase block mb-1">ملاحظات تسليم الطلب (Notes / Instructions)</label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full bg-[#f9f9fa] border-b border-[#cfc4c5] focus:border-black text-xs text-[#5d5e66] italic py-1.5 px-2 outline-none"
                    />
                  </div>

                  {/* Summary aggregate total text */}
                  <div className="bg-black/5 p-3.5 rounded-lg space-y-1.5 text-xs">
                    <div className="flex justify-between items-center text-[#5d5e66]">
                      <span>إجمالي المنتجات (مجموع الأصناف):</span>
                      <span className="font-semibold text-black">{subtotal.toFixed(2)} EGP</span>
                    </div>
                    <div className="flex justify-between items-center text-[#5d5e66]">
                      <span>قيمة التوصيل ({shippingRegion === "cairo_giza" ? "القاهرة والجيزة" : "باقي المحافظات"}):</span>
                      <span className="font-semibold text-black">+{shippingCost} EGP</span>
                    </div>
                    <div className="h-[1px] bg-gray-200" />
                    <div className="flex justify-between items-center font-bold text-sm">
                      <span className="text-black">الإجمالي المطلوب دفعه:</span>
                      <span className="text-[#0a58ca] font-black">{grandTotal.toFixed(2)} EGP</span>
                    </div>
                    <div className="text-[10px] text-[#5d5e66] mt-1 flex justify-between items-center">
                      <span>العدد الكلي للقطع: {items.reduce((a,c) => a+Number(c.quantity), 0)}</span>
                    </div>
                  </div>
                </div>

                {/* Confirm and sync action button */}
                <div className="mt-4 pt-3 border-t border-[#eeeeef]">
                  {isGoogleSheetsLinked ? (
                    <button
                      onClick={handleConfirmAndSync}
                      className="w-full bg-[#107c41] hover:bg-[#0c5e31] text-white py-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-[0px_4px_12px_rgba(16,124,65,0.25)] active:scale-95"
                    >
                      <TableProperties className="w-4 h-4" />
                      <span>🟢 تأكيد الفاتورة والمزامنة التلقائية مع شيت جوجل (Confirm & Sync)</span>
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={handleConfirmAndSync}
                        className="w-full bg-black hover:bg-[#212324] text-white py-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-[0px_4px_12px_rgba(0,0,0,0.1)] active:scale-95"
                      >
                        <FileText className="w-4 h-4" />
                        <span>💾 تأكيد الفاتورة وحفظها في السجل المحلي (Save Locally)</span>
                      </button>
                      <div className="mt-2 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 p-2 rounded-md leading-relaxed text-right font-sans">
                        ⚠️ <strong>ملحوظة تنبيهية:</strong> لم تقم بربط شيت جوجل (Excel Sheet) الفعلي الخاص بك مع البراند حتى الآن. سيتم حفظ الفواتير في قاعدة البيانات المحلية المتكاملة للبراند. لربط ومزامنة فواتيرك تلقائياً؛ تفضل بزيارة تبويب <strong>&quot;إدارة الإكسيل&quot;</strong> من القائمة الجانبية لتوصيل شيتك في دقيقة واحدة!
                      </div>
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>

      {/* Aesthetic pairing instructions info */}
      <div className="mt-12 border-t border-[#eeeeef] pt-4 flex gap-4 items-center justify-center">
        <div className="h-0.5 bg-black w-8 opacity-20"></div>
        <span className="text-[11px] text-black font-bold tracking-widest font-mono uppercase animate-breathe-fade select-none">
          MADE BY KAREEM SALAH
        </span>
        <div className="h-0.5 bg-black w-8 opacity-20"></div>
      </div>
    </div>
  );
}
