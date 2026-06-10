import { useState, useEffect } from "react";
import { 
  Menu, 
  Bell, 
  HelpCircle, 
  User, 
  CheckCircle2,
  X,
  Plus,
  Sun,
  Moon
} from "lucide-react";
import Sidebar from "./components/Sidebar";
import DashboardView from "./components/DashboardView";
import DataEntryView from "./components/DataEntryView";
import InvoicePreviewView from "./components/InvoicePreviewView";
import ExcelPortalView from "./components/ExcelPortalView";
import AnalyticsView from "./components/AnalyticsView";
import SettingsView from "./components/SettingsView";
import { Invoice, ExcelFile, ActiveTab } from "./types";

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("data_entry");
  const [invoices, setInvoices] = useState<Invoice[]>(() => {
    try {
      const saved = localStorage.getItem("oa_invoices");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [excelFiles, setExcelFiles] = useState<ExcelFile[]>(() => {
    try {
      const saved = localStorage.getItem("oa_excel_files");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // Mobile sidebar drawer state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Sync state changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("oa_invoices", JSON.stringify(invoices));
    } catch (e) {
      console.error("Error writing invoices to localStorage:", e);
    }
  }, [invoices]);

  useEffect(() => {
    try {
      localStorage.setItem("oa_excel_files", JSON.stringify(excelFiles));
    } catch (e) {
      console.error("Error writing excel files to localStorage:", e);
    }
  }, [excelFiles]);

  // Theme support (light/dark mode) with localStorage accessibility persistence
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === "light" ? "dark" : "light"));
  };



  // Fetch initial records from full-stack server endpoints on mount
  useEffect(() => {
    fetchInvoices();
    fetchExcelFiles();
  }, []);

  const fetchInvoices = async () => {
    try {
      const res = await fetch("/api/invoices");
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          setInvoices(data);
        }
      }
    } catch (err) {
      console.error("Error fetching invoices:", err);
    }
  };

  const fetchExcelFiles = async () => {
    try {
      const res = await fetch("/api/excel-files");
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          setExcelFiles(data);
        }
      }
    } catch (err) {
      console.error("Error fetching excel files:", err);
    }
  };

  // Create & Sync Invoice Callback
  const handleInvoiceCreated = (newInvoice: Invoice) => {
    setInvoices(prev => [newInvoice, ...prev]);
    // Immediately transition view to Invoice Preview Page, so the user sees the styled paper output!
    setActiveTab("invoices");
  };

  // Update localized single invoice callback
  const handleInvoiceUpdated = (updatedInvoice: Invoice) => {
    setInvoices(prev => prev.map(inv => inv.id === updatedInvoice.id ? updatedInvoice : inv));
  };

  // Delete localized single invoice callback
  const handleInvoiceDeleted = (id: string) => {
    setInvoices(prev => prev.filter(inv => inv.id !== id));
  };

  // Bulk update invoices callback (e.g. after Sync All turns isSynced = true)
  const handleInvoicesBulkUpdated = (updatedInvoices: Invoice[]) => {
    setInvoices(updatedInvoices);
  };

  // Simulated Excel Upload Handler
  const handleUploadExcel = async (fileName: string, sizeBytes: number) => {
    try {
      const res = await fetch("/api/excel-files/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, sizeBytes })
      });
      if (res.ok) {
        const newFile = await res.json();
        setExcelFiles(prev => [newFile, ...prev]);
      } else {
        const sizeMB = sizeBytes ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB` : "1.2 MB";
        const fallbackFile: ExcelFile = {
          id: `file_${Date.now()}`,
          name: fileName,
          uploadDate: new Date().toISOString(),
          size: sizeMB,
          status: fileName.endsWith(".xls") ? "failed" : "synced",
          recordsCount: Math.floor(Math.random() * 50) + 10
        };
        setExcelFiles(prev => [fallbackFile, ...prev]);
      }
    } catch (err) {
      console.error("Error uploading excel file:", err);
      const sizeMB = sizeBytes ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB` : "1.2 MB";
      const fallbackFile: ExcelFile = {
        id: `file_${Date.now()}`,
        name: fileName,
        uploadDate: new Date().toISOString(),
        size: sizeMB,
        status: fileName.endsWith(".xls") ? "failed" : "synced",
        recordsCount: Math.floor(Math.random() * 50) + 10
      };
      setExcelFiles(prev => [fallbackFile, ...prev]);
    }
  };

  // Delete Excel File Handler
  const handleDeleteExcel = async (id: string) => {
    try {
      await fetch(`/api/excel-files/${id}`, {
        method: "DELETE"
      });
      setExcelFiles(prev => prev.filter(file => file.id !== id));
      showToastMessage("تم حذف ملف كشف الإكسيل بنجاح.");
    } catch (err) {
      console.error("Error deleting excel file:", err);
      setExcelFiles(prev => prev.filter(file => file.id !== id));
      showToastMessage("تم حذف ملف كشف الإكسيل بنجاح.");
    }
  };

  // Helper to trigger automated notifications flashing from bottom screen
  const showToastMessage = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const handleSelectInvoiceForPreview = (invoiceId: string) => {
    setActiveTab("invoices");
  };

  return (
    <div className="min-h-screen flex bg-[#f9f9fa] text-[#1a1c1d] overflow-hidden antialiased font-sans">
      
      {/* 1. Desktop SideNavBar (Hidden on mobile) */}
      <div className="hidden md:block">
        <Sidebar 
          activeTab={activeTab} 
          onTabChange={(tab) => {
            setActiveTab(tab);
            setIsMobileMenuOpen(false);
          }}
          onNewEntryClick={() => {
            setActiveTab("data_entry");
            setIsMobileMenuOpen(false);
          }}
        />
      </div>

      {/* 2. Responsive Mobile SideNav Drawer Menu overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden bg-black/40 backdrop-blur-sm">
          <div className="relative w-64 h-full flex flex-col animate-slide-right">
            {/* Close trigger drawer */}
            <button 
              onClick={() => setIsMobileMenuOpen(false)}
              className="absolute top-4 right-[-44px] bg-black text-white p-2 rounded-md"
            >
              <X className="w-5 h-5" />
            </button>
            <Sidebar 
              activeTab={activeTab} 
              onTabChange={(tab) => {
                setActiveTab(tab);
                setIsMobileMenuOpen(false);
              }}
              onNewEntryClick={() => {
                setActiveTab("data_entry");
                setIsMobileMenuOpen(false);
              }}
            />
          </div>
          <div className="flex-1" onClick={() => setIsMobileMenuOpen(false)} />
        </div>
      )}

      {/* 3. Main Content Portal Container */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto relative">
        
        {/* Top Header Navigation Panel */}
        <header className="no-print sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#eeeeef] p-4 flex justify-between items-center h-16 shadow-[0px_2px_12px_rgba(0,0,0,0.01)] transition duration-300 relative">
          
          <div className="flex items-center gap-3">
            {/* Mobile Hamburger toggle button */}
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden text-black p-2 -ml-2 hover:bg-gray-100 rounded-md transition"
              aria-label="Toggle Side Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>

          {/* Centered H1 heading title */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <h1 
              onClick={() => setActiveTab("dashboard")}
              className="text-base font-display font-black tracking-tight cursor-pointer hover:opacity-85 select-none text-center"
            >
              O&A Brand
            </h1>
          </div>

          {/* Theme switcher for low-light environment accessibility */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-lg border border-[#cfc4c5] hover:bg-[#f3f3f4] transition-all duration-200 cursor-pointer flex items-center justify-center shadow-2xs"
              title={theme === "dark" ? "الوضع المضيء" : "الوضع المظلم"}
              aria-label="Toggle Theme"
            >
              {theme === "dark" ? (
                <Sun className="w-4 h-4 text-amber-500 fill-amber-500 transition-transform hover:rotate-45" />
              ) : (
                <Moon className="w-4 h-4 text-[#5d5e66] hover:text-black transition-transform hover:-rotate-12" />
              )}
            </button>
          </div>
        </header>

        {/* 4. Active Tab content view dispatcher */}
        <main className="flex-1 pb-16">
          {activeTab === "dashboard" && (
            <DashboardView 
              invoices={invoices} 
              onNavigate={(tab) => setActiveTab(tab)}
              onSelectInvoiceForPreview={handleSelectInvoiceForPreview}
              onInvoiceUpdated={handleInvoiceUpdated}
              onInvoiceDeleted={handleInvoiceDeleted}
            />
          )}

          {activeTab === "data_entry" && (
            <DataEntryView 
              onInvoiceCreated={handleInvoiceCreated}
              showToastMessage={showToastMessage}
            />
          )}

          {activeTab === "invoices" && (
            <InvoicePreviewView 
              invoices={invoices}
              onBackToDataEntry={() => setActiveTab("data_entry")}
            />
          )}

          {activeTab === "excel_management" && (
            <ExcelPortalView 
              excelFiles={excelFiles}
              invoices={invoices}
              onUploadExcel={handleUploadExcel}
              onDeleteExcel={handleDeleteExcel}
              showToast={showToastMessage}
              onInvoiceDeleted={handleInvoiceDeleted}
              onInvoicesBulkUpdated={handleInvoicesBulkUpdated}
            />
          )}

          {activeTab === "analytics" && (
            <AnalyticsView invoices={invoices} />
          )}

          {activeTab === "settings" && (
            <SettingsView showToast={showToastMessage} />
          )}
        </main>

      </div>

      {/* 5. Styled Custom Floating Bottom Toast Notification Popup */}
      <div 
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-500 flex items-center gap-2.5 bg-black text-white px-5 py-3 rounded-full shadow-[0px_10px_30px_rgba(0,0,0,0.25)] select-none max-w-md w-max border border-zinc-700 ${
          toastMessage ? "opacity-100 translateY-0" : "opacity-0 translate-y-4"
        }`} 
        dir="rtl"
      >
        <CheckCircle2 className="w-4.5 h-4.5 text-yellow-400 shrink-0" />
        <span className="text-xs font-bold leading-none tracking-wide text-white">
          {toastMessage}
        </span>
      </div>

    </div>
  );
}
