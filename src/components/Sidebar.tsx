import { 
  LayoutDashboard, 
  FileEdit, 
  Receipt,
  FileSpreadsheet, 
  BarChart3, 
  Settings, 
  Plus, 
  Sparkles,
  Mail
} from "lucide-react";
import { ActiveTab } from "../types";

interface SidebarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onNewEntryClick: () => void;
  userEmail?: string;
}

export default function Sidebar({ 
  activeTab, 
  onTabChange, 
  onNewEntryClick,
  userEmail = "kareemherish@gmail.com"
}: SidebarProps) {
  
  const navItems = [
    { id: "dashboard" as ActiveTab, label: "Dashboard", arLabel: "لوحة التحكم", icon: LayoutDashboard },
    { id: "data_entry" as ActiveTab, label: "Data Entry", arLabel: "الأدخال الذكي", icon: FileEdit },
    { id: "invoices" as ActiveTab, label: "Invoices", arLabel: "الفواتير المعالجة", icon: Receipt },
    { id: "excel_management" as ActiveTab, label: "Excel Portal", arLabel: "بوابة إكسيل", icon: FileSpreadsheet },
    { id: "analytics" as ActiveTab, label: "Analytics", arLabel: "التحليلات والأداء", icon: BarChart3 },
    { id: "settings" as ActiveTab, label: "Settings", arLabel: "الإعدادات", icon: Settings },
  ];

  return (
    <nav className="flex flex-col bg-[#f9f9fa] w-64 h-screen border-r border-[#cfc4c5] py-6 px-4 shrink-0 font-sans">
      {/* Brand Profile header */}
      <div 
        onClick={() => onTabChange("dashboard")}
        className="mb-8 flex items-center gap-3 cursor-pointer group hover:opacity-90 transition-all"
      >
        <div className="w-11 h-11 rounded-full bg-[#eeeeef] border border-[#cfc4c5] flex items-center justify-center overflow-hidden transition-colors group-hover:bg-[#e2e2e3] shrink-0">
          <img 
            alt="User profile" 
            className="w-full h-full object-cover" 
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuDbp9ZU_Gq6lsoAR0lkE9sBMYD1QwBEhe1fU9zPOPYDttQ16qbB31dKVpn5YAOtBdtlD6Mi3j0dvH5Dqqj3DU62iUsCoikYPwyEh2oVMF3Nr5d4rpj75za7JQ0CovLr8VuzOwC_K_KqfvMB-NEFlZNyXCIVMmdH0y-lPzt41ndbENnydEtfQ9vy5Mzty60mH5bx0CsaqM6L0yp8r7-t72XU1MICOyKMwmROqj2D3hIOq2vg6JrVh037UcHEetwIG602nMOp-uD48fg"
            referrerPolicy="no-referrer"
          />
        </div>
        <div>
          <h1 className="text-xl font-black text-black tracking-tight leading-none">O&A Brand</h1>
        </div>
      </div>

      {/* Primary Call to Action */}
      <button 
        onClick={onNewEntryClick}
        className="w-full bg-black text-white hover:bg-[#2f3132] active:scale-95 rounded-lg py-3 px-4 font-semibold text-xs tracking-wide mb-6 transition-all flex items-center justify-center gap-2 shadow-[0px_4px_12px_rgba(0,0,0,0.1)] cursor-pointer"
      >
        <Plus className="w-4 h-4" />
        <span>New Entry</span>
      </button>

      {/* Navigation list */}
      <div className="flex-1 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all text-left cursor-pointer group ${
                isActive 
                  ? "text-black bg-[#eeeeef] border-r-2 border-black font-extrabold" 
                  : "text-[#5d5e66] hover:bg-[#f3f3f4] hover:text-black"
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${isActive ? "text-black saturate-150" : "text-[#5d5e66] group-hover:text-black"}`} />
                <span className={`text-xs font-bold tracking-wider font-display transition duration-150 ${
                  isActive ? "text-black" : "text-[#515259] group-hover:text-black"
                }`}>
                  {item.label}
                </span>
              </div>
              <span className={`text-[11px] font-bold font-sans hidden lg:inline-block px-2.5 py-0.5 rounded-md border transition-all duration-200 ${
                isActive 
                  ? "bg-white text-black border-[#cfc4c5] shadow-xs" 
                  : "bg-black/[0.02] text-[#424347] border-black/[0.04] group-hover:bg-white group-hover:text-black group-hover:border-[#cfc4c5]"
              }`}>
                {item.arLabel}
              </span>
            </button>
          );
        })}
      </div>

      {/* Footer Meta */}
      <div className="mt-auto border-t border-[#cfc4c5] pt-4 flex flex-col gap-2.5 items-start text-[11px] text-[#5d5e66]">
        <p className="text-[10px] text-[#1a1b1d] font-bold font-sans tracking-tight flex items-center gap-1.5 truncate max-w-full select-all cursor-pointer hover:opacity-80 transition duration-150">
          <Mail className="w-3.5 h-3.5 text-red-500 shrink-0" />
          <span>{userEmail}</span>
        </p>
        <div className="w-full flex items-center justify-between border-t border-black/[0.03] pt-2">
          <span className="text-[8px] text-[#7d7e85] font-sans font-bold uppercase tracking-wider">O&amp;A Systems Ltd</span>
          <span className="text-[9px] font-bold font-mono text-[#424347] bg-[#eeeeef] border border-[#cfc4c5] px-1.5 py-0.5 rounded-md select-none leading-none">
            v1.0.0
          </span>
        </div>
      </div>
    </nav>
  );
}
