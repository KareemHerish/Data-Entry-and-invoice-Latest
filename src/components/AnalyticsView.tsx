import { BarChart3, TrendingUp, PieChart, ShoppingBag, ArrowLeft, RefreshCw } from "lucide-react";
import { Invoice } from "../types";

interface AnalyticsViewProps {
  invoices: Invoice[];
}

export default function AnalyticsView({ invoices }: AnalyticsViewProps) {
  // Aggregate data counters
  const totalInvoices = invoices.length;
  const totalRevenue = invoices.reduce((acc, curr) => acc + curr.totalAmount, 0);
  const avgFatura = totalInvoices > 0 ? (totalRevenue / totalInvoices) : 0;

  // Calculate product distribution heuristics
  const productDistribution: Record<string, { count: number, value: number }> = {};
  invoices.forEach(inv => {
    inv.items.forEach(it => {
      const name = it.itemName.split("(")[0].trim() || "غير محدد";
      if (!productDistribution[name]) {
        productDistribution[name] = { count: 0, value: 0 };
      }
      productDistribution[name].count += Number(it.quantity || 1);
      productDistribution[name].value += Number(it.total || 0);
    });
  });

  const productsList = Object.entries(productDistribution)
    .map(([name, stat]) => ({ name, ...stat }))
    .sort((a, b) => b.count - a.count);

  // Group amounts by days of week dynamically
  const daysOfWeek = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];
  const weekdaysRevenue: Record<string, number> = { Sat: 0, Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0 };
  
  invoices.forEach(inv => {
    try {
      const d = new Date(inv.createdAt);
      const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
      if (dayName in weekdaysRevenue) {
        weekdaysRevenue[dayName] += inv.totalAmount;
      }
    } catch (e) {}
  });

  const maxRevenue = Math.max(...Object.values(weekdaysRevenue), 1);

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-8 py-6 font-sans">
      
      {/* Header section */}
      <div className="mb-6 text-right" dir="rtl">
        <h2 className="text-3xl font-display font-bold text-black tracking-tight mb-1">
          بوابة التحليلات ورصد الأداء
        </h2>
        <p className="text-sm text-[#5d5e66] max-w-2xl leading-relaxed">
          إحصائيات ذكية توضح حجم المبيعات الإجمالي والمنتجات الأكثر طلباً لشركة O&A Brand كأداة تدعم اتخاذ القرارات والتحقق المالي المباشر.
        </p>
      </div>

      {/* Analytics main layout bento */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" dir="rtl">
        
        {/* Left column: Products volume bar list (spans 7 cols) */}
        <div className="lg:col-span-7 flex flex-col">
          <div className="bg-white border border-[#cfc4c5] rounded-xl p-5 shadow-sm flex-1">
            <div className="flex justify-between items-center mb-5 pb-2 border-b border-[#eeeeef]">
              <h3 className="text-xs font-bold text-black flex items-center gap-1.5">
                <ShoppingBag className="w-4.5 h-4.5 text-[#5d5e66]" />
                <span>المنتجات الأكثر مبيعاً ورواجاً (Most Wanted)</span>
              </h3>
              <RefreshCw className="w-3.5 h-3.5 text-gray-400 hover:text-black hover:rotate-180 transition-all cursor-pointer" />
            </div>

            {productsList.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-xs">
                لا توجد أصناف كافية لإجراء التحليل الإحصائي حالياً.
              </div>
            ) : (
              <div className="space-y-4">
                {productsList.map((item, idx) => {
                  const maxCount = Math.max(...productsList.map(p => p.count));
                  const percent = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-black">{item.name}</span>
                        <span className="text-gray-500 font-mono">{item.count} قطعة ({item.value.toFixed(2)} EGP)</span>
                      </div>
                      <div className="w-full bg-[#eeeeef] h-1.5 rounded-full overflow-hidden">
                        <div 
                           className="bg-black h-full rounded-full transition-all duration-500"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column: visual statistics widget (spans 5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          
          {/* Trends line widget representation */}
          <div className="bg-white border border-[#cfc4c5] rounded-xl p-5 shadow-sm flex-1">
            <h4 className="text-xs font-bold text-black mb-3 border-b border-[#eeeeef] pb-2 flex items-center gap-1.5">
              <TrendingUp className="w-4.5 h-4.5 text-[#5d5e66]" />
              <span>أيام الأسبوع الأكثر تفاعلاً للمبيعات</span>
            </h4>
            
            <div className="flex justify-between items-end h-36 pt-4 px-2" dir="ltr">
              {daysOfWeek.map((day) => {
                const dayRevenue = weekdaysRevenue[day] || 0;
                const ratio = invoicingRatio(dayRevenue, maxRevenue);
                return (
                  <div key={day} className="flex flex-col items-center gap-1 w-full">
                    <div className="w-full bg-gray-100 rounded-sm h-[80px] flex items-end justify-center hover:bg-black/10 transition-colors">
                      <div 
                        className={`w-4 rounded-t-sm transition-all duration-500 ${dayRevenue > 0 ? "bg-[#0a58ca]" : "bg-gray-300"}`} 
                        style={{ height: `${ratio}%` }} 
                        title={`${dayRevenue.toFixed(2)} EGP`}
                      />
                    </div>
                    <span className="text-[10px] text-gray-500">{day}</span>
                  </div>
                );
              })}
            </div>
            
            <p className="text-[10px] text-[#5d5e66] mt-4 leading-relaxed text-right" dir="rtl">
              * يتم رصد حركة تفصيل السجلات تلقائياً. المبيعات الإجمالية بلغت <strong className="font-bold text-black">{totalRevenue.toFixed(2)} EGP</strong> عبر فحص الذكاء الاصطناعي لكافة المدخلات المكتوبة.
            </p>
          </div>

        </div>

      </div>

    </div>
  );
}

// Helper to calculate ratio height securely (0 if 0 revenue, otherwise proportional limit)
function invoicingRatio(rev: number, max: number): number {
  if (rev <= 0) return 0;
  return Math.max(10, Math.min(100, (rev / max) * 100));
}
