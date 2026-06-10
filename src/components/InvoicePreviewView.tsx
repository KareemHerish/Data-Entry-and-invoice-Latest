import { useState, useRef } from "react";
import html2canvas from "html2canvas";
import { 
  ArrowLeft, 
  Image as ImageIcon, 
  FileCheck, 
  Printer, 
  Download, 
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Info
} from "lucide-react";
import { Invoice } from "../types";

interface InvoicePreviewViewProps {
  invoices: Invoice[];
  onBackToDataEntry: () => void;
}

export default function InvoicePreviewView({ invoices, onBackToDataEntry }: InvoicePreviewViewProps) {
  // Select which invoice is currently being previewed
  const [selectedInvoiceIndex, setSelectedInvoiceIndex] = useState(0);
  const [isExportingImage, setIsExportingImage] = useState(false);
  const [exportedImageSrc, setExportedImageSrc] = useState<string | null>(null);

  // If no invoices yet, show graceful placeholder
  const activeInvoice = invoices[selectedInvoiceIndex];
  const itemsSubtotal = activeInvoice ? activeInvoice.items.reduce((acc, curr) => acc + curr.total, 0) : 0;
  const shippingFee = activeInvoice ? (activeInvoice.shippingCost || 0) : 0;
  const printAreaRef = useRef<HTMLDivElement>(null);

  const triggerNativeImageDownload = (imgData: string, fileName: string) => {
    try {
      // Create a hidden form to submit a POST request which forces a browser level safe attachment download
      const form = document.createElement("form");
      form.method = "POST";
      form.action = "/api/download-image";
      form.style.display = "none";

      const dataInput = document.createElement("input");
      dataInput.type = "hidden";
      dataInput.name = "imageDataUrl";
      dataInput.value = imgData;

      const nameInput = document.createElement("input");
      nameInput.type = "hidden";
      nameInput.name = "fileName";
      nameInput.value = fileName;

      form.appendChild(dataInput);
      form.appendChild(nameInput);
      document.body.appendChild(form);
      form.submit();
      document.body.removeChild(form);
    } catch (error) {
      console.error("Native Form submit download failed, falling back to local link:", error);
      // Secure fallback local trigger if anything fails
      const link = document.createElement("a");
      link.download = fileName;
      link.href = imgData;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleDownloadImage = async () => {
    if (!activeInvoice || !printAreaRef.current) return;
    setIsExportingImage(true);

    // Physical detaching and sanitization of stylesheets to prevent HTML2CANVAS oklch/oklab parsing bugs
    let restoreStylesheets: (() => void) | null = null;
    try {
      const styleElements = Array.from(document.querySelectorAll("style, link[rel='stylesheet']"));
      const detachedElements: { el: Element; parent: ParentNode; nextSibling: ChildNode | null }[] = [];
      let combinedCSSText = "";

      for (const el of styleElements) {
        try {
          let cssText = "";
          let isStyleTag = el.tagName.toLowerCase() === "style";

          if (isStyleTag) {
            cssText = el.innerHTML;
          } else {
            const linkEl = el as HTMLLinkElement;
            const sheet = linkEl.sheet;
            if (sheet) {
              const rules = sheet.cssRules || sheet.rules;
              if (rules) {
                cssText = Array.from(rules).map(r => r.cssText).join("\n");
              }
            }
          }

          // If we successfully read the CSS text and it contains the problematic color functions
          if (cssText && (/oklch|oklab/i.test(cssText))) {
            // Sanitize all occurrences of oklch(...) and oklab(...) with a fallback color
            const sanitized = cssText
              .replace(/oklch\s*\([^)]*\)/gi, "rgb(10, 88, 202)") // Use brand blue for tailwind primary colors
              .replace(/oklab\s*\([^)]*\)/gi, "rgb(120, 120, 120)");

            combinedCSSText += sanitized + "\n";

            // Detach this element physically so html2canvas NEVER sees it in document.styleSheets
            const parent = el.parentNode;
            if (parent) {
              const nextSibling = el.nextSibling;
              detachedElements.push({ el, parent, nextSibling });
              parent.removeChild(el);
            }
          }
        } catch (e) {
          // Cross-origin or other error reading rules, let's NOT detach this element so it remains loaded!
        }
      }

      // Add the temporary compiled sanitized styles to head so elements look perfect
      let tempStyleEl: HTMLStyleElement | null = null;
      if (combinedCSSText) {
        tempStyleEl = document.createElement("style");
        tempStyleEl.id = "h2c-temp-sanitized-styles";
        tempStyleEl.innerHTML = combinedCSSText;
        document.head.appendChild(tempStyleEl);
      }

      // Sanitize inline styles of elements inside the print area itself
      const inlineStyleBackups: { el: HTMLElement; originalStyles: string }[] = [];
      if (printAreaRef.current) {
        const elementsInPrintArea = Array.from(printAreaRef.current.querySelectorAll("*")) as HTMLElement[];
        // Include the target element itself
        elementsInPrintArea.push(printAreaRef.current);

        for (const el of elementsInPrintArea) {
          if (el.style && el.style.cssText) {
            const originalStyle = el.style.cssText;
            if (/oklch|oklab/i.test(originalStyle)) {
              inlineStyleBackups.push({ el, originalStyles: originalStyle });
              el.style.cssText = originalStyle
                .replace(/oklch\s*\([^)]*\)/gi, "rgb(10, 88, 202)")
                .replace(/oklab\s*\([^)]*\)/gi, "rgb(120, 120, 120)");
            }
          }
        }
      }

      restoreStylesheets = () => {
        // 1. Remove the temporary sanitized style element
        if (tempStyleEl && tempStyleEl.parentNode) {
          tempStyleEl.parentNode.removeChild(tempStyleEl);
        }
        // 2. Put the original style/link tags back in their original order
        for (const item of detachedElements) {
          try {
            if (item.nextSibling) {
              item.parent.insertBefore(item.el, item.nextSibling);
            } else {
              item.parent.appendChild(item.el);
            }
          } catch (e) {
            console.error("Failed to restore stylesheet element:", e);
          }
        }
        // 3. Restore any modified inline styles
        for (const item of inlineStyleBackups) {
          try {
            item.el.style.cssText = item.originalStyles;
          } catch (e) {
            console.error("Failed to restore inline style:", e);
          }
        }
      };
    } catch (e) {
      console.error("Failed to execute physical stylesheet sanitization:", e);
    }

    try {
      // Small delay to ensure any styling and layout is fully ready and stable
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const canvas = await html2canvas(printAreaRef.current, {
        scale: 2, // Retinal clear resolution
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      setExportedImageSrc(imgData); // Spawn visual backup modal immediately so the user can see/save it

      const clientName = activeInvoice.customerName.replace(/[\s\/\\\?\*:"<>|]/g, "_");
      const fileName = `فاتورة_${clientName}_${activeInvoice.id}.png`;
      triggerNativeImageDownload(imgData, fileName);
    } catch (err) {
      console.error("Failed to capture image:", err);
      alert("حدث خطأ أثناء تحميل الفاتورة كصورة، يرجى المحاولة مرة ثانية أو استخدام الطباعة بصيغة PDF.");
    } finally {
      if (restoreStylesheets) {
        try {
          restoreStylesheets();
        } catch (e) {
          console.error("Failed to restore stylesheets:", e);
        }
      }
      setIsExportingImage(false);
    }
  };

  const handleDownloadWord = () => {
    if (!activeInvoice) return;
    try {
      const clientName = activeInvoice.customerName.replace(/[\s\/\\\?\*:"<>|]/g, "_");
      const fileName = `فاتورة_${clientName}_${activeInvoice.id}.doc`;
      const itemsSubtotal = activeInvoice.items.reduce((acc, curr) => acc + curr.total, 0);
      const shippingFee = activeInvoice.shippingCost || 0;
      
      // Complete MS Word XML-compatible HTML block with proper styling
      const wordHtml = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <title>Invoice</title>
          <!--[if gte mso 9]>
          <xml>
            <w:WordDocument>
              <w:View>Print</w:View>
              <w:Zoom>100</w:Zoom>
              <w:DoNotOptimizeForBrowser/>
            </w:WordDocument>
          </xml>
          <![endif]-->
          <meta charset="utf-8">
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap');
            body { 
              font-family: 'Tajawal', 'Arial', sans-serif; 
              direction: rtl; 
              text-align: right; 
              background-color: #ffffff; 
              color: #111111; 
              margin: 20px;
            }
            .header-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 30px;
            }
            .brand-name {
              font-size: 26px;
              font-weight: bold;
              color: #111111;
              direction: ltr !important;
              unicode-bidi: embed;
              text-align: left;
            }
            .brand-sub {
              font-size: 10px;
              color: #555555;
              text-transform: uppercase;
              letter-spacing: 2px;
              direction: ltr !important;
              unicode-bidi: embed;
              text-align: left;
            }
            .invoice-label-container {
              background-color: #0a58ca;
              color: #ffffff;
              padding: 15px 30px;
              text-align: center;
              border-radius: 4px;
            }
            .invoice-label {
              font-size: 28px;
              font-weight: bold;
              margin: 0;
            }
            .invoice-sub {
              font-size: 10px;
              letter-spacing: 1px;
            }
            .customer-details {
              background-color: #f8f9fa;
              border: 1px solid #e9ecef;
              padding: 15px;
              border-radius: 8px;
              margin-bottom: 25px;
            }
            .detail-row {
              margin-bottom: 8px;
              font-size: 13px;
            }
            .detail-label {
              font-weight: bold;
              color: #0a58ca;
              display: inline-block;
              width: 100px;
            }
            .table-items {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 30px;
              border: 1px solid #0a58ca;
            }
            .table-items th {
              background-color: #0a58ca;
              color: #ffffff;
              font-weight: bold;
              font-size: 12px;
              padding: 10px;
              border: 1px solid #0a58ca;
              text-align: center;
            }
            .table-items td {
              padding: 10px;
              border: 1px solid #e9ecef;
              font-size: 12px;
              text-align: center;
            }
            .table-items .item-name {
              text-align: right;
            }
            .total-row {
              background-color: #f8f9fa;
              font-weight: bold;
            }
            .total-amount {
              color: #0a58ca;
              font-size: 15px;
            }
            .footer-strip {
              background-color: #0a58ca;
              color: #ffffff;
              padding: 12px;
              text-align: center;
              font-weight: bold;
              font-size: 15px;
              margin-top: 40px;
              border-radius: 4px;
            }
          </style>
        </head>
        <body>
          <table class="header-table" dir="ltr" style="width: 100%; direction: ltr; border-collapse: collapse; margin-bottom: 30px;">
            <tr>
              <!-- Brand name and sub info on the left, written in LTR -->
              <td style="text-align: left; vertical-align: middle; width: 50%; direction: ltr !important; unicode-bidi: embed;">
                <div class="brand-name" dir="ltr" style="font-family: Arial, sans-serif; font-size: 26px; font-weight: bold; color: #111111; direction: ltr !important; unicode-bidi: embed; text-align: left; display: block;">O&A Brand</div>
              </td>
              <!-- Invoice label container on the right, aligned right -->
              <td style="text-align: right; vertical-align: middle; width: 50%; padding-left: 20px;">
                <table align="right" border="0" cellpadding="0" cellspacing="0" style="background-color: #0a58ca; border-radius: 4px; border-collapse: collapse; width: 180px;">
                  <tr>
                    <td style="background-color: #0a58ca; color: #ffffff; padding: 12px 20px; text-align: center; border-radius: 4px; border: none;">
                      <div class="invoice-label" style="font-size: 24px; font-weight: bold; margin: 0; color: #ffffff; font-family: 'Tajawal', 'Arial', sans-serif;">فاتورة</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <div class="customer-details">
            <div class="detail-row">
              <span class="detail-label">اسم العميل:</span>
              <span>${activeInvoice.customerName}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">العنوان:</span>
              <span>${activeInvoice.address || "-"}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">رقم الهاتف:</span>
              <span dir="ltr">${activeInvoice.phone || "-"}</span>
            </div>
          </div>

          <table class="table-items">
            <thead>
              <tr>
                <th style="width: 8%">NO</th>
                <th style="text-align: right;">اسم الصنف</th>
                <th style="width: 20%">سعر القطعة</th>
                <th style="width: 15%">العدد</th>
                <th style="width: 20%">المجموع</th>
              </tr>
            </thead>
            <tbody>
              ${activeInvoice.items.map((item, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td class="item-name">${item.itemName}</td>
                  <td>${item.price.toFixed(2)} EGP</td>
                  <td>${item.quantity}</td>
                  <td style="font-weight: bold; color: #0a58ca;">${item.total.toFixed(2)} EGP</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td>#</td>
                <td style="text-align: right; font-weight: bold;">مجموع الأصناف</td>
                <td></td>
                <td style="text-align: center; font-weight: bold;">${activeInvoice.items.reduce((acc, curr) => acc + Number(curr.quantity), 0)}</td>
                <td style="font-weight: bold; color: #0a58ca;">${itemsSubtotal.toFixed(2)} EGP</td>
              </tr>
              ${shippingFee > 0 ? `
              <tr class="total-row">
                <td>#</td>
                <td style="text-align: right; font-weight: bold;">قيمة التوصيل</td>
                <td></td>
                <td style="text-align: center;">-</td>
                <td style="font-weight: bold; color: #0a58ca;">${shippingFee.toFixed(2)} EGP</td>
              </tr>
              ` : ""}
              <tr class="total-row" style="background-color: #0a58ca; color: #ffffff;">
                <td>#</td>
                <td style="text-align: right; font-weight: bold; color: #ffffff;">الاجمالي المطلوب دفعه</td>
                <td></td>
                <td style="text-align: center; color: #ffffff;"></td>
                <td class="total-amount" style="font-weight: 900; color: #ffffff; font-size: 16px;">${activeInvoice.totalAmount.toFixed(2)} EGP</td>
              </tr>
            </tbody>
          </table>

          <div class="footer-strip">
            للتواصل والمبيعات: +201016296205
          </div>
        </body>
        </html>
      `;

      // Convert word HTML content to printable blob
      const blob = new Blob(["\ufeff" + wordHtml], { type: "application/msword;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed to generate Word document blob:", e);
      alert("عذراً، حدث خطأ أثناء تحميل ملف الوورد.");
    }
  };

  const printInvoice = () => {
    window.print();
  };

  // Helper row filling to match exactly 8 visual rows from the original design
  const getPaddedRows = () => {
    if (!activeInvoice) return [];
    
    const rows = [...activeInvoice.items];
    const totalDesiredRows = 8;
    const paddingCount = totalDesiredRows - rows.length;
    
    const padded = [...rows];
    for (let i = 0; i < paddingCount; i++) {
      padded.push({ itemName: "", price: 0, quantity: 0, total: 0 }); // empty mock row
    }
    return padded;
  };

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-8 py-6 font-sans">
      
      {/* Styles for print mode */}
      <style>{`
        @media print {
          /* Force page & parent sizing reset for complete rendering without vh caps */
          html, body, #root, .min-h-screen, main, div, header, section {
            height: auto !important;
            overflow: visible !important;
            min-height: 0 !important;
            background: white !important;
          }
          
          /* Hide non-printable app items entirely */
          .no-print, nav, header, aside, button, .sidebar, footer {
            display: none !important;
          }
          
          /* Ensure printable area takes perfect A4 layout specifications */
          .print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            border: none !important;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 1cm !important;
            background: white !important;
            color: black !important;
            display: block !important;
          }
          
          /* Color preservation adjustments */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      {/* Action Controls Section (No-Print) */}
      <div className="no-print mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-[#eeeeef] pb-4">
        
        {/* Navigation Selector */}
        <div className="flex items-center gap-3">
          <button 
            onClick={onBackToDataEntry}
            className="flex items-center gap-2 text-xs font-semibold text-[#5d5e66] hover:text-black transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Data Entry (رجوع للإدخال)</span>
          </button>
          
          {invoices.length > 1 && (
            <div className="flex items-center gap-1.5 ml-4 bg-[#eeeeef] rounded-lg p-1">
              <button
                disabled={selectedInvoiceIndex === invoices.length - 1}
                onClick={() => setSelectedInvoiceIndex(prev => prev + 1)}
                className="p-1 rounded text-[#5d5e66] hover:bg-white disabled:opacity-30 transition cursor-pointer"
                title="السابق"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] font-bold text-black px-1.5">
                معاينة {selectedInvoiceIndex + 1} من {invoices.length}
              </span>
              <button
                disabled={selectedInvoiceIndex === 0}
                onClick={() => setSelectedInvoiceIndex(prev => prev - 1)}
                className="p-1 rounded text-[#5d5e66] hover:bg-white disabled:opacity-30 transition cursor-pointer"
                title="التالي"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Action Triggers */}
        {activeInvoice && (
          <div className="flex flex-wrap gap-2.5">
            <button 
              onClick={handleDownloadWord}
              className="bg-white hover:bg-[#f3f3f4] text-black border border-[#cfc4c5] px-4 py-2 rounded-lg font-semibold text-xs tracking-wide transition flex items-center gap-1.5 cursor-pointer shadow-[0px_2px_4px_rgba(0,0,0,0.02)]"
            >
              <FileCheck className="w-3.5 h-3.5 text-[#5d5e66]" />
              <span>Download as Word (ملف)</span>
            </button>
          </div>
        )}
      </div>

      {!activeInvoice ? (
        <div className="no-print bg-white border border-[#cfc4c5] rounded-xl p-12 flex flex-col items-center justify-center text-center h-[350px]" dir="rtl">
          <Info className="w-12 h-12 text-[#5d5e66] mb-3 animate-pulse" />
          <h3 className="text-base font-bold text-black mb-1">لا توجد فواتير نشطة حالياً للمعاملات</h3>
          <p className="text-xs text-[#5d5e66] max-w-md leading-relaxed mb-4">
            تأكد من كتابة الفاتورة أولاً في صفحة الأدخال الذكي والضغط على &quot;مزامنة إلى إكسيل&quot; لتظهر الفاتورة هنا للطباعة والتحميل بتنسيق الشركة.
          </p>
          <button 
            onClick={onBackToDataEntry}
            className="bg-black text-white px-5 py-2 rounded-lg text-xs font-semibold cursor-pointer hover:bg-zinc-800"
          >
            الذهاب للإدخال الآن
          </button>
        </div>
      ) : (
        <div className="w-full flex justify-center py-4">
          
          {/* Printable Invoice paper canvas */}
          <div ref={printAreaRef} className="print-area bg-white w-full max-w-4xl shadow-[0px_10px_40px_rgba(31,31,31,0.06)] border border-[#eeeeef] rounded-md overflow-hidden flex flex-col min-h-[1056px] relative select-none">
            
            {/* Blue and Grey Visual Accent Top Bar */}
            <div className="h-2 bg-[#0a58ca]" />

            {/* Logo and Head Title section */}
            <div className="p-8 pb-4 flex justify-between items-start">
              
              {/* O&A Brand Typography Header Title instead of image */}
              <div className="pt-4 px-2 select-none">
                <h1 className="text-3xl font-black tracking-tight text-gray-900 leading-none">O&A Brand</h1>
              </div>

              {/* Styled Invoice Header block with exact Arabic word "فاتورة" with blue banner background */}
              <div className="bg-[#0a58ca] text-white pl-20 pr-12 py-5 rounded-l-full -mr-8 mt-4 text-right flex flex-col justify-center select-none shadow-[0px_4px_10px_rgba(10,88,202,0.15)]">
                <h2 className="text-4xl font-display font-black tracking-widest uppercase leading-none text-white">فاتورة</h2>
              </div>
            </div>

            {/* Divider */}
            <div className="px-8 my-1">
              <div className="h-[1px] bg-gray-200" />
            </div>

            {/* Customer coordinates (aligned Right, dir RTL) */}
            <div className="p-8 py-5 flex justify-start" dir="rtl">
              <div className="w-full max-w-md space-y-3 font-sans bg-gray-50/50 p-4 rounded-lg border border-gray-100">
                
                <div className="flex items-center border-b border-gray-200 pb-2">
                  <span className="text-xs font-bold text-[#0a58ca] w-28 shrink-0 text-right">الاسم:</span>
                  <span className="text-xs text-black font-bold flex-1 text-right">
                    {activeInvoice.customerName}
                  </span>
                </div>

                <div className="flex items-center border-b border-gray-200 pb-2">
                  <span className="text-xs font-bold text-[#0a58ca] w-28 shrink-0 text-right">العنوان:</span>
                  <span className="text-xs text-black flex-1 text-right">
                    {activeInvoice.address || "-" }
                  </span>
                </div>

                <div className="flex items-center border-b border-gray-200 pb-2">
                  <span className="text-xs font-bold text-[#0a58ca] w-28 shrink-0 text-right">رقم التليفون:</span>
                  <span className="text-xs text-black font-semibold flex-1 text-right select-all font-mono" dir="ltr">
                    {activeInvoice.phone || "-"}
                  </span>
                </div>

              </div>
            </div>

            {/* Line Items Table */}
            <div className="px-8 py-4 flex-1">
              <table className="w-full border border-[#0a58ca]/40 text-right font-sans" dir="rtl">
                <thead>
                  <tr className="bg-[#0a58ca] text-white text-xs select-none">
                    <th className="border-l border-[#0a58ca]/50 py-3 px-4 font-bold w-12 text-center">NO</th>
                    <th className="border-l border-[#0a58ca]/50 py-3 px-4 font-bold">اسم الصنف</th>
                    <th className="border-l border-[#0a58ca]/50 py-3 px-4 font-bold w-32 text-center">سعر القطعة</th>
                    <th className="border-l border-[#0a58ca]/50 py-3 px-4 font-bold w-24 text-center">العدد</th>
                    <th className="py-3 px-4 font-bold w-32 text-center">المجموع</th>
                  </tr>
                </thead>
                <tbody className="text-xs text-[#1a1c1d]">
                  {getPaddedRows().map((row, idx) => {
                    const isFiller = row.itemName === "";
                    return (
                      <tr 
                        key={idx}
                        className={`h-11 border-b border-gray-200 ${
                          isFiller ? "bg-white" : "hover:bg-gray-50/50"
                        }`}
                      >
                        {/* NO Index Column */}
                        <td className="border-l border-gray-200 text-center font-bold text-gray-500 font-mono">
                          {idx + 1}
                        </td>
                        
                        {/* Item descriptive */}
                        <td className="border-l border-gray-200 px-4 font-medium max-w-[280px] truncate text-[#1a1c1d]">
                          {row.itemName}
                        </td>

                        {/* Price Unit */}
                        <td className="border-l border-gray-200 px-4 text-center font-semibold font-mono text-gray-600">
                          {!isFiller ? row.price.toFixed(2) : ""}
                        </td>

                        {/* Qty Count */}
                        <td className="border-l border-gray-200 px-4 text-center font-bold font-mono">
                          {!isFiller && row.quantity > 0 ? row.quantity : ""}
                        </td>

                        {/* Line aggregate cost */}
                        <td className="px-4 text-center font-bold font-mono text-[#0a58ca]">
                          {!isFiller ? row.total.toFixed(2) : ""}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Summary / Tax or aggregate totals row */}
                  <tr className="h-11 bg-gray-50/70 border-t border-gray-200 select-none">
                    <td className="border-l border-gray-200 text-center font-bold text-gray-400">#</td>
                    <td className="border-l border-gray-200 px-4 font-bold text-gray-700 text-right">
                      مجموع الأصناف
                    </td>
                    <td className="border-l border-gray-200 text-center font-bold text-gray-500 font-mono">
                      
                    </td>
                    <td className="border-l border-gray-200 text-center font-black font-mono text-black">
                      {activeInvoice.items.reduce((a,c) => a+Number(c.quantity), 0)}
                    </td>
                    <td className="px-4 text-center font-bold font-mono text-[#0a58ca]">
                      {itemsSubtotal.toFixed(2)}
                    </td>
                  </tr>

                  {shippingFee > 0 && (
                    <tr className="h-11 bg-gray-50/70 border-t border-gray-200 select-none">
                      <td className="border-l border-gray-200 text-center font-bold text-gray-400">#</td>
                      <td className="border-l border-gray-200 px-4 font-bold text-gray-700 text-right">
                        قيمة التوصيل
                      </td>
                      <td className="border-l border-gray-200 text-center font-bold text-gray-500 font-mono">
                        
                      </td>
                      <td className="border-l border-gray-200 text-center font-medium font-mono text-gray-400">
                        -
                      </td>
                      <td className="px-4 text-center font-bold font-mono text-[#0a58ca]">
                        {shippingFee.toFixed(2)}
                      </td>
                    </tr>
                  )}

                  <tr className="h-12 bg-gray-100 border-t-2 border-[#0a58ca]/40 select-none text-black">
                    <td className="border-l border-gray-200 text-center font-black text-gray-600">#</td>
                    <td className="border-l border-gray-200 px-4 font-black text-[#0a58ca] text-right">
                      الاجمالي المطلوب دفعه
                    </td>
                    <td className="border-l border-gray-200 text-center font-bold text-gray-500 font-mono">
                      
                    </td>
                    <td className="border-l border-gray-200 text-center font-black font-mono text-black">
                      
                    </td>
                    <td className="px-4 text-center font-black font-mono text-lg text-[#0a58ca]">
                      {activeInvoice.totalAmount.toFixed(2)} EGP
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Printable Footing contact block */}
            <div className="mt-8 bg-[#0a58ca] text-[#ffffff] py-4 px-8 text-center select-none">
              <p className="text-lg md:text-xl font-bold tracking-wide flex justify-center items-center gap-2" dir="rtl">
                <span>للتواصل:</span>
                <span className="inline-block font-mono tracking-wider" dir="ltr">
                  +201016296205
                </span>
              </p>
            </div>

          </div>

        </div>
      )}

      {/* Fallback & Visual Image Export Modal to bypass sandboxed iFrame download blockades */}
      {exportedImageSrc && activeInvoice && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[9999] flex items-center justify-center p-4 overflow-y-auto no-print" dir="rtl">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl flex flex-col items-center gap-4 animate-scale-up" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center text-green-600">
              <FileCheck className="w-6 h-6" />
            </div>
            
            <div className="text-center">
              <h3 className="text-lg font-bold text-black mb-1">تمت المعاينة والتحميل (Image Ready)</h3>
              <p className="text-xs text-gray-500 leading-relaxed max-w-sm">
                تم استخراج الفاتورة للتحميل كصورة بنجاح! إذا لم تبدأ عملية الحفظ التلقائي على جهازك بسبب حماية متصفحك، يمكنك حفظها يدويًا فوراً كالتالي:
              </p>
              <div className="my-2 bg-amber-50 border border-amber-200/50 p-3 rounded-lg text-xs text-amber-900 text-right leading-relaxed font-sans">
                📌 <strong>على الموبايل هاتف المحمول:</strong> اضغط ضغطة مطولة بإصبعك على صورة الفاتورة في الوسط، ثم اختر <strong>&quot;حفظ الصورة&quot;</strong> (Save Image).<br />
                📌 <strong>على اللاب توب / الكمبيوتر:</strong> انقر بزر الفأرة الأيمن (Right-click) على الصورة في الوسط، ثم اختر <strong>&quot;حفظ الصورة باسم...&quot;</strong> (Save Image As).
              </div>
            </div>

            {/* Generated Image Canvas View Frame */}
            <div className="border border-gray-200 rounded-lg overflow-hidden max-h-[250px] overflow-y-auto w-full bg-gray-50 p-2 flex justify-center">
              <img 
                src={exportedImageSrc} 
                alt="Invoice Exported" 
                className="w-auto max-h-[400px] object-contain rounded border cursor-pointer hover:opacity-95" 
                referrerPolicy="no-referrer"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 w-full mt-2">
              <button
                onClick={() => {
                  const clientName = activeInvoice.customerName.replace(/[\s\/\\\?\*:"<>|]/g, "_");
                  const fileName = `فاتورة_${clientName}_${activeInvoice.id}.png`;
                  triggerNativeImageDownload(exportedImageSrc, fileName);
                }}
                className="flex-1 bg-[#0a58ca] hover:bg-[#084298] text-white py-2.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>تحميل الصورة مجدداً</span>
              </button>
              
              <button
                onClick={() => setExportedImageSrc(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-lg text-xs font-bold transition"
              >
                إغلاق النافذة
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
