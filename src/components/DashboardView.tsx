import { useState } from "react";
import { 
  DollarSign, 
  Receipt, 
  Layers, 
  CheckSquare, 
  ArrowRight, 
  Sparkles,
  Zap,
  Bot,
  Edit,
  X,
  Plus,
  Trash2,
  Save,
  AlertCircle,
  Loader2,
  Phone,
  MapPin,
  User,
  CheckCircle2
} from "lucide-react";
import { Invoice, ActiveTab } from "../types";

interface DashboardProps {
  invoices: Invoice[];
  onNavigate: (tab: ActiveTab) => void;
  onSelectInvoiceForPreview: (invoiceId: string) => void;
  onInvoiceUpdated?: (updatedInvoice: Invoice) => void;
  onInvoiceDeleted?: (id: string) => void;
}

export default function DashboardView({ 
  invoices, 
  onNavigate, 
  onSelectInvoiceForPreview,
  onInvoiceUpdated,
  onInvoiceDeleted
}: DashboardProps) {

  // Edit Invoice States
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [modalCustomerName, setModalCustomerName] = useState("");
  const [modalAddress, setModalAddress] = useState("");
  const [modalPhone, setModalPhone] = useState("");
  const [modalNotes, setModalNotes] = useState("");
  const [modalItems, setModalItems] = useState<{itemName: string, price: number, quantity: number, total: number}[]>([]);
  const [isModalSaving, setIsModalSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [modalShippingCost, setModalShippingCost] = useState<number>(60);

  const handleStartEdit = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setModalCustomerName(invoice.customerName || "");
    setModalAddress(invoice.address || "");
    setModalPhone(invoice.phone || "");
    setModalNotes(invoice.notes || "");
    setModalItems(invoice.items.map(it => ({
      itemName: it.itemName || "",
      price: Number(it.price) || 0,
      quantity: Number(it.quantity) || 1,
      total: (Number(it.price) || 0) * (Number(it.quantity) || 1)
    })));
    setModalShippingCost(invoice.shippingCost !== undefined ? invoice.shippingCost : 60);
    setModalError(null);
  };

  const handleModalItemChange = (index: number, field: "itemName" | "price" | "quantity", value: string) => {
    setModalItems(prev => prev.map((item, idx) => {
      if (idx !== index) return item;
      const updated = { ...item };
      if (field === "itemName") {
        updated.itemName = value;
      } else {
        const numVal = Math.max(0, Number(value) || 0);
        updated[field] = numVal;
      }
      updated.total = updated.price * updated.quantity;
      return updated;
    }));
  };

  const handleAddModalItem = () => {
    setModalItems(prev => [...prev, { itemName: "", price: 0, quantity: 1, total: 0 }]);
  };

  const handleRemoveModalItem = (index: number) => {
    if (modalItems.length <= 1) {
      setModalError("⚠️ الفاتورة يجب أن تحتوي على صنف واحد على الأقل.");
      return;
    }
    setModalItems(prev => prev.filter((_, idx) => idx !== index));
    setModalError(null);
  };

  const handleSaveEditedInvoice = async () => {
    if (!editingInvoice) return;

    const trimmedName = modalCustomerName.trim();
    const trimmedAddress = modalAddress.trim();
    const trimmedPhone = modalPhone.trim();

    if (!trimmedName) {
      setModalError("⚠️ اسم العميل مطلوب لتحديث الفاتورة.");
      return;
    }
    if (!trimmedAddress) {
      setModalError("⚠️ عنوان الشحن مطلوب لتحديث التقرير.");
      return;
    }
    if (!trimmedPhone) {
      setModalError("⚠️ رقم الموبايل مطلوب.");
      return;
    }

    let hasItemErrors = false;
    let itemErrorMessage = "";
    if (modalItems.length === 0) {
      hasItemErrors = true;
      itemErrorMessage = "يجب إضافة صنف واحد على الأقل للفاتورة.";
    } else {
      for (let i = 0; i < modalItems.length; i++) {
        const item = modalItems[i];
        if (!item.itemName.trim()) {
          hasItemErrors = true;
          itemErrorMessage = `اسم الصنف رقم ${i + 1} فارغ!`;
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

    if (hasItemErrors) {
      setModalError(`⚠️ خطأ في الأصناف: ${itemErrorMessage}`);
      return;
    }

    setModalError(null);
    setIsModalSaving(true);

    const localSheetLink = localStorage.getItem("oa_excel_sheet_link") || "";

    try {
      const res = await fetch(`/api/invoices/${editingInvoice.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: trimmedName,
          address: trimmedAddress,
          phone: trimmedPhone,
          notes: modalNotes,
          items: modalItems,
          shippingCost: modalShippingCost,
          excelSheetLink: localSheetLink
        })
      });

      if (res.ok) {
        const updatedData = await res.json();
        if (onInvoiceUpdated) {
          onInvoiceUpdated(updatedData);
        }
        setEditingInvoice(null);
      } else {
        // Fallback update locally anyway
        const fallbackUpdatedData = {
          ...editingInvoice,
          customerName: trimmedName,
          address: trimmedAddress,
          phone: trimmedPhone,
          notes: modalNotes,
          items: modalItems.map(it => ({ ...it, total: it.price * it.quantity })),
          shippingCost: modalShippingCost,
          totalAmount: modalItems.reduce((acc, it) => acc + (it.price * it.quantity), 0) + modalShippingCost
        };
        if (onInvoiceUpdated) {
          onInvoiceUpdated(fallbackUpdatedData);
        }
        setEditingInvoice(null);
      }
    } catch (err: any) {
      console.error(err);
      // Local fallback on network error/server offline
      const fallbackUpdatedData = {
        ...editingInvoice,
        customerName: trimmedName,
        address: trimmedAddress,
        phone: trimmedPhone,
        notes: modalNotes,
        items: modalItems.map(it => ({ ...it, total: it.price * it.quantity })),
        shippingCost: modalShippingCost,
        totalAmount: modalItems.reduce((acc, it) => acc + (it.price * it.quantity), 0) + modalShippingCost
      };
      if (onInvoiceUpdated) {
        onInvoiceUpdated(fallbackUpdatedData);
      }
      setEditingInvoice(null);
    } finally {
      setIsModalSaving(false);
    }
  };

  const handleDeleteInvoice = async (invoiceId: string) => {
    if (confirmDeleteId !== invoiceId) {
      setConfirmDeleteId(invoiceId);
      // Auto-cancel confirmation after 4 seconds if no action is taken
      setTimeout(() => {
        setConfirmDeleteId(current => current === invoiceId ? null : current);
      }, 4000);
      return;
    }

    setConfirmDeleteId(null);
    setDeletingId(invoiceId);
    try {
      const localSheetLink = localStorage.getItem("oa_excel_sheet_link") || "";
      const res = await fetch(`/api/invoices/${invoiceId}?excelSheetLink=${encodeURIComponent(localSheetLink)}`, {
        method: "DELETE"
      });

      if (res.ok) {
        if (onInvoiceDeleted) {
          onInvoiceDeleted(invoiceId);
        }
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(`❌ فشل الحذف: ${errorData.error || "خطأ غير معروف في الخادم"}`);
      }
    } catch (err: any) {
      console.error("Network error deleting invoice:", err.message || err);
      if (onInvoiceDeleted) {
        onInvoiceDeleted(invoiceId);
      }
    } finally {
      setDeletingId(null);
    }
  };

  // Computed summary metrics
  const totalFaturasCount = invoices.length;
  const totalRevenue = invoices.reduce((acc, curr) => acc + curr.totalAmount, 0);
  const totalItemsCount = invoices.reduce((acc, curr) => {
    return acc + curr.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  }, 0);
  
  const avgFaturaAmount = totalFaturasCount > 0 ? (totalRevenue / totalFaturasCount) : 0;

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-8 py-6 font-sans">
      
      {/* Arabic header */}
      <div className="mb-6 text-right" dir="rtl">
        <h2 className="text-3xl font-display font-bold text-black tracking-tight mb-1">
          لوحة البيانات الموحدة
        </h2>
        <p className="text-sm text-[#5d5e66] max-w-2xl leading-relaxed">
          نظرة عامة على كشوفات المبيعات، ومراقبة مطابقة السجلات المزامنة بين الذكاء الاصطناعي وجداول إكسيل النشطة.
        </p>
      </div>

      {/* Metrics Grid Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8" dir="rtl">
        
        {/* Metric 1 */}
        <div className="bg-white border border-[#cfc4c5] p-5 rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.01)] flex items-center justify-between">
          <div className="text-right">
            <span className="text-[10px] font-bold text-gray-400 block uppercase mb-1">إجمالي الإيرادات (Sales)</span>
            <span className="text-lg font-bold text-black font-mono">
              {totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP
            </span>
          </div>
          <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-emerald-600" />
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white border border-[#cfc4c5] p-5 rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.01)] flex items-center justify-between">
          <div className="text-right">
            <span className="text-[10px] font-bold text-gray-400 block uppercase mb-1">الفواتير المستخرجة</span>
            <span className="text-lg font-bold text-black font-mono">{totalFaturasCount} فاتورة</span>
          </div>
          <div className="w-10 h-10 rounded-full bg-[#eeeeef] flex items-center justify-center">
            <Receipt className="w-5 h-5 text-black" />
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white border border-[#cfc4c5] p-5 rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.01)] flex items-center justify-between">
          <div className="text-right">
            <span className="text-[10px] font-bold text-gray-400 block uppercase mb-1">إجمالي قطع المبيعات</span>
            <span className="text-lg font-bold text-black font-mono">{totalItemsCount} قطعة</span>
          </div>
          <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
            <Layers className="w-5 h-5 text-blue-600" />
          </div>
        </div>

      </div>

      {/* Centered / Full-Width Recent list section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" dir="rtl">
        
        {/* Invoices list summary (spans 12 cols now) */}
        <div className="lg:col-span-12 flex flex-col">
          <div className="bg-white border border-[#cfc4c5] rounded-xl p-5 shadow-sm flex-1 flex flex-col">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-[#eeeeef]">
              <h3 className="text-xs font-bold text-black">آخر الفواتير المستخرجة والجاهزة</h3>
              <button 
                onClick={() => onNavigate("invoices")}
                className="text-[11px] text-[#5d5e66] hover:text-black font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <span>عرض الكل</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {invoices.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-gray-400">
                <Bot className="w-10 h-10 mb-2 animate-pulse" />
                <span className="text-xs">لم يتم استخراج فواتير بعد. جرب إدخال طلب أولاً!</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-50 h-8 text-gray-500 font-bold border-b border-[#eeeeef]">
                      <th className="px-3">العميل</th>
                      <th className="px-3 w-40">التليفون</th>
                      <th className="px-3 w-28 text-center">أصناف الشراء</th>
                      <th className="px-3 w-28 text-center">إجمالي القيمة</th>
                      <th className="px-3 w-32 text-center">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.slice(0, 5).map((invoice) => (
                      <tr key={invoice.id} className="h-11 border-b border-gray-100 hover:bg-gray-50/50">
                        <td className="px-3 font-semibold text-black truncate max-w-[150px]">
                          {invoice.customerName}
                        </td>
                        <td className="px-3 text-gray-500 font-mono" dir="ltr text-right">
                          {invoice.phone || "-"}
                        </td>
                        <td className="px-3 text-center text-gray-700">
                          {invoice.items.length} أصناف
                        </td>
                        <td className="px-3 text-center font-bold text-[#0a58ca] font-mono">
                          {invoice.totalAmount.toFixed(2)} EGP
                        </td>
                        <td className="px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => onSelectInvoiceForPreview(invoice.id)}
                              className="bg-black hover:bg-zinc-800 text-white text-[9px] font-bold px-2 py-1 rounded cursor-pointer transition shrink-0"
                            >
                              معاينة
                            </button>
                            <button
                              onClick={() => handleStartEdit(invoice)}
                              className="bg-amber-500 hover:bg-amber-600 text-white text-[9px] font-bold px-2 py-1 rounded cursor-pointer transition shrink-0 flex items-center gap-0.5"
                            >
                              <Edit className="w-2.5 h-2.5" />
                              <span>تعديل</span>
                            </button>
                            <button
                              disabled={deletingId !== null}
                              onClick={() => handleDeleteInvoice(invoice.id)}
                              className={`text-[9px] font-bold px-2 py-1 rounded cursor-pointer transition shrink-0 flex items-center gap-0.5 ${
                                deletingId === invoice.id
                                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                  : confirmDeleteId === invoice.id
                                  ? "bg-red-600 hover:bg-red-700 text-white animate-pulse"
                                  : "bg-red-50 hover:bg-red-100 text-red-600 border border-red-100"
                              }`}
                            >
                              {deletingId === invoice.id ? (
                                <>
                                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                  <span>جاري...</span>
                                </>
                              ) : confirmDeleteId === invoice.id ? (
                                <>
                                  <Trash2 className="w-2.5 h-2.5" />
                                  <span>تأكيد الحذف؟</span>
                                </>
                              ) : (
                                <>
                                  <Trash2 className="w-2.5 h-2.5" />
                                  <span>حذف</span>
                                </>
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* 5. Edit Invoice Dialog Modal (RTL) */}
      {editingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto no-print" dir="rtl">
          <div className="bg-white border border-[#cfc4c5] w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col my-8 overflow-hidden max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="bg-zinc-50 border-b border-zinc-100 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit className="w-5 h-5 text-amber-500" />
                <div>
                  <h3 className="text-sm font-bold text-black font-sans">تعديل بيانات الفاتورة الصادرة</h3>
                  <p className="text-[10px] text-gray-500 font-mono">ID: {editingInvoice.id}</p>
                </div>
              </div>
              <button 
                onClick={() => setEditingInvoice(null)}
                className="text-gray-400 hover:text-black p-1 hover:bg-zinc-100 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content Form */}
            <div className="p-6 overflow-y-auto space-y-5 text-right flex-1">
              {modalError && (
                <div className="bg-red-50 text-red-800 border border-red-200 p-3 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4.5 h-4.5 text-red-600 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Grid fields */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Name */}
                <div>
                  <label className="text-[10px] font-bold text-[#5d5e66] block mb-1">اسم العميل (Customer Name)</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={modalCustomerName}
                      onChange={(e) => setModalCustomerName(e.target.value)}
                      className="w-full bg-[#f9f9fa] border-b border-[#cfc4c5] focus:border-black text-xs text-black py-1.5 px-3 outline-none font-medium text-right"
                    />
                  </div>
                </div>

                {/* Phone */}
                <div>
                  <label className="text-[10px] font-bold text-[#5d5e66] block mb-1">رقم التليفون (Phone)</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={modalPhone}
                      onChange={(e) => setModalPhone(e.target.value)}
                      className="w-full bg-[#f9f9fa] border-b border-[#cfc4c5] focus:border-black text-xs text-black py-1.5 px-3 outline-none font-semibold text-left font-mono"
                      dir="ltr"
                    />
                  </div>
                </div>

                {/* Address */}
                <div>
                  <label className="text-[10px] font-bold text-[#5d5e66] block mb-1">العنوان (Address)</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={modalAddress}
                      onChange={(e) => setModalAddress(e.target.value)}
                      className="w-full bg-[#f9f9fa] border-b border-[#cfc4c5] focus:border-black text-xs text-black py-1.5 px-3 outline-none text-right"
                    />
                  </div>
                </div>

                {/* Shipping Cost */}
                <div>
                  <label className="text-[10px] font-bold text-[#5d5e66] block mb-1">تكلفة التوصيل الشحن (Shipping)</label>
                  <select
                    value={modalShippingCost}
                    onChange={(e) => setModalShippingCost(Number(e.target.value))}
                    className="w-full bg-[#f9f9fa] border-b border-[#cfc4c5] focus:border-black text-xs text-black py-1.5 px-3 outline-none font-semibold cursor-pointer"
                  >
                    <option value={60}>القاهرة والجيزة (60 EGP)</option>
                    <option value={70}>باقي المحافظات (70 EGP)</option>
                    <option value={0}>بدون شحن (0 EGP)</option>
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-[10px] font-bold text-[#5d5e66] block mb-1">ملاحظات الفاتورة والتسليم (Notes)</label>
                <textarea
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-[#f9f9fa] border border-[#cfc4c5] rounded-lg text-xs text-black p-2 outline-none text-right focus:border-black"
                />
              </div>

              {/* Items Panel */}
              <div className="border border-zinc-100 rounded-xl p-4 bg-zinc-50/50 space-y-3">
                <div className="flex justify-between items-center pb-2 border-b border-zinc-200">
                  <h4 className="text-xs font-bold text-black flex items-center gap-1.5">
                    <Layers className="w-4.5 h-4.5 text-amber-500" />
                    <span>أصناف الفاتورة المتضمنة</span>
                  </h4>
                  <button
                    type="button"
                    onClick={handleAddModalItem}
                    className="bg-black hover:bg-zinc-800 text-white text-[10px] font-bold px-2.5 py-1 rounded-md flex items-center gap-1 cursor-pointer transition select-none"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة صنف جديد</span>
                  </button>
                </div>

                <div className="space-y-2.5">
                  {modalItems.map((item, idx) => (
                    <div key={idx} className="bg-white p-3 rounded-lg border border-zinc-100 shadow-3xs flex flex-col md:flex-row md:items-end gap-3 text-right">
                      
                      {/* Name input */}
                      <div className="flex-1 min-w-0">
                        <label className="text-[9px] text-[#5d5e66] block mb-1">اسم الصنف</label>
                        <input
                          type="text"
                          value={item.itemName}
                          onChange={(e) => handleModalItemChange(idx, "itemName", e.target.value)}
                          className="w-full bg-zinc-50/50 border border-[#cfc4c5] p-1.5 text-[11px] rounded-md outline-none text-right"
                          placeholder="مثال: تيشرت أو قميص كلاسيك..."
                        />
                      </div>

                      {/* Quantity input */}
                      <div className="w-full md:w-24 shrink-0">
                        <label className="text-[9px] text-[#5d5e66] block mb-1 text-center">العدد</label>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => handleModalItemChange(idx, "quantity", e.target.value)}
                          className="w-full bg-zinc-50/50 border border-[#cfc4c5] p-1.5 text-[11px] rounded-md text-center outline-none font-bold"
                          min="1"
                        />
                      </div>

                      {/* Price input */}
                      <div className="w-full md:w-28 shrink-0 font-mono">
                        <label className="text-[9px] text-[#5d5e66] block mb-1 text-center">سعر القطعة (EGP)</label>
                        <input
                          type="number"
                          value={item.price}
                          onChange={(e) => handleModalItemChange(idx, "price", e.target.value)}
                          className="w-full bg-zinc-50/50 border border-[#cfc4c5] p-1.5 text-[11px] rounded-md text-center outline-none font-bold"
                          min="0"
                        />
                      </div>

                      {/* Item Total (Calculated) */}
                      <div className="w-full md:w-24 shrink-0 text-center font-mono self-center">
                        <span className="text-[9px] text-gray-400 block mb-1">الإجمالي</span>
                        <span className="text-[11px] font-bold text-black bg-zinc-100 px-2 py-1.5 rounded-md block">
                          {(item.price * item.quantity).toFixed(2)}
                        </span>
                      </div>

                      {/* Removal Trigger */}
                      <div className="self-end md:self-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveModalItem(idx)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-md transition cursor-pointer"
                          title="حذف الصنف من القائمة"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                    </div>
                  ))}
                </div>

                {/* Sum of totals */}
                <div className="text-left pt-2 border-t border-zinc-200">
                  <span className="text-[10px] text-gray-500 ml-2">الإجمالي الإفتراضي الجديد للفاتورة:</span>
                  <span className="text-xs font-black text-[#0a58ca] font-mono">
                    {modalItems.reduce((acc, curr) => acc + curr.total, 0).toFixed(2)} EGP
                  </span>
                </div>
              </div>
            </div>

            {/* Footer Control Panel */}
            <div className="bg-zinc-50 border-t border-zinc-100 px-6 py-4 flex justify-between items-center">
              <button
                type="button"
                onClick={() => setEditingInvoice(null)}
                className="bg-white border border-[#cfc4c5] hover:bg-zinc-100 text-[#1a1c1d] hover:text-black text-[11px] font-bold px-4 py-2 rounded-lg cursor-pointer transition select-none"
              >
                إلغاء التعديل
              </button>
              <button
                type="button"
                onClick={handleSaveEditedInvoice}
                disabled={isModalSaving}
                className="bg-[#0a58ca] hover:bg-blue-700 text-white text-[11px] font-bold px-5 py-2.5 rounded-lg cursor-pointer transition select-none flex items-center gap-2"
              >
                {isModalSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>جاري حفظ وتحديث الشيت...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>حفظ التعديلات والمزامنة الفورية</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
