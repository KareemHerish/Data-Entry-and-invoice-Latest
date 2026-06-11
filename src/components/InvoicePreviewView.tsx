import { useState, useRef, useMemo } from "react";
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
  Info,
  Search,
  FileText,
  X
} from "lucide-react";
import { Invoice } from "../types";

export const sanitizeInvoice = (invoice: Invoice | undefined): Invoice | undefined => {
  if (!invoice) return undefined;
  
  // Detect if any items in the array are actually a shipping/delivery charge
  let extraShippingCost = 0;
  const filteredItems = invoice.items.filter((item) => {
    const name = (item.itemName || "").trim().toLowerCase();
    const isShipping = name === "شحن" || 
                       name === "توصيل" || 
                       name === "الشحن" ||
                       name === "التوصيل" ||
                       name.includes("مصاريف شحن") || 
                       name.includes("تكلفة شحن") || 
                       name.includes("قيمة الشحن") ||
                       name.includes("شحن القاهره") ||
                       name.includes("شحن الجيزه") ||
                       name.includes("توصيل الشحن") ||
                       name.startsWith("شحن ") ||
                       name.startsWith("توصيل ");
    
    if (isShipping) {
      extraShippingCost += item.total || (item.price * item.quantity) || 0;
      return false; // dynamic exclude from regular list
    }
    return true;
  });

  const baseShipping = invoice.shippingCost || 0;
  const finalShippingCost = baseShipping > 0 ? baseShipping : extraShippingCost;
  const itemsSubtotal = filteredItems.reduce((acc, curr) => acc + curr.total, 0);
  const totalAmount = itemsSubtotal + finalShippingCost;

  return {
    ...invoice,
    items: filteredItems,
    shippingCost: finalShippingCost,
    totalAmount: totalAmount
  };
};

interface InvoicePreviewViewProps {
  invoices: Invoice[];
  onBackToDataEntry: () => void;
}

export default function InvoicePreviewView({ invoices, onBackToDataEntry }: InvoicePreviewViewProps) {
  // Select which invoice is currently being previewed
  const [selectedInvoiceIndex, setSelectedInvoiceIndex] = useState(0);
  const [isExportingImage, setIsExportingImage] = useState(false);
  const [exportedImageSrc, setExportedImageSrc] = useState<string | null>(null);

  // States for bulk PDF print/export
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkType, setBulkType] = useState<"all" | "limit" | "manual">("all");
  const [manualSelectedIds, setManualSelectedIds] = useState<string[]>([]);
  const [bulkLimit, setBulkLimit] = useState<number>(10);
  const [searchQuery, setSearchQuery] = useState("");
  const [bulkPrintInvoices, setBulkPrintInvoices] = useState<Invoice[] | null>(null);

  // If no invoices yet, show graceful placeholder
  const rawActiveInvoice = invoices[selectedInvoiceIndex];
  const activeInvoice = useMemo(() => sanitizeInvoice(rawActiveInvoice), [rawActiveInvoice]);
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

  const printInvoice = () => {
    // Give React time to render, then trigger print
    setTimeout(() => {
      window.print();
      // Reset state after print dialog closes
      setTimeout(() => {
        // State stays as is
      }, 500);
    }, 100);
  };

  const openBulkModal = () => {
    setManualSelectedIds(invoices.map(inv => inv.id));
    setBulkLimit(Math.min(10, invoices.length));
    setShowBulkModal(true);
  };

  const handlePrintBulkPDF = () => {
    let selectedInvoicesList: Invoice[] = [];
    if (bulkType === "all") {
      selectedInvoicesList = [...invoices];
    } else if (bulkType === "limit") {
      selectedInvoicesList = invoices.slice(0, Math.min(bulkLimit, invoices.length));
    } else if (bulkType === "manual") {
      selectedInvoicesList = invoices.filter(inv => manualSelectedIds.includes(inv.id));
    }

    if (selectedInvoicesList.length === 0) {
      alert("الرجاء تحديد فاتورة واحدة على الأقل للطباعة كـ PDF.");
      return;
    }

    setBulkPrintInvoices(selectedInvoicesList);
    setShowBulkModal(false);

    // Short timeout to give React rendering cycle time to build the A4 printable DOM views
    setTimeout(() => {
      window.print();
      // Restore view structure safely
      setTimeout(() => {
        setBulkPrintInvoices(null);
      }, 500);
    }, 150);
  };

  const handleDownloadBulkWorddocx_UNUSED = () => {
    let selectedInvoicesList: Invoice[] = [];
    if (bulkType === "all") {
      selectedInvoicesList = [...invoices];
    } else if (bulkType === "limit") {
      selectedInvoicesList = invoices.slice(0, Math.min(bulkLimit, invoices.length));
    } else if (bulkType === "manual") {
      selectedInvoicesList = invoices.filter(inv => manualSelectedIds.includes(inv.id));
    }

    if (selectedInvoicesList.length === 0) {
      alert("الرجاء تحديد فاتورة واحدة على الأقل للتحميل.");
      return;
    }

    try {
      const fileName = `مجموعة_فواتير_O_A_Brand_${Date.now()}.docx`;
      
      const invoicesBody = selectedInvoicesList.map((rawInv, index) => {
        const inv = sanitizeInvoice(rawInv);
        if (!inv) return "";
        const itemsSubtotal = inv.items.reduce((acc, curr) => acc + curr.total, 0);
        const shippingFee = inv.shippingCost || 0;
        const pageBreakHtml = index > 0 ? `<br clear="all" class="page-break" style="page-break-before: always; mso-break-type: section-break;" />` : "";
        
        return `
          ${pageBreakHtml}
          <!-- Invoice ID: ${inv.id} -->
          <table class="header-table" dir="ltr" style="width: 100%; direction: ltr; border-collapse: collapse; margin-bottom: 25px;">
            <tr>
              <td style="text-align: left; vertical-align: middle; width: 50%; direction: ltr !important; unicode-bidi: embed;">
                <div class="brand-name" dir="ltr" style="font-family: Arial, sans-serif; font-size: 26px; font-weight: bold; color: #111111; direction: ltr !important; unicode-bidi: embed; text-align: left;">O&A Brand</div>
              </td>
              <td style="text-align: right; vertical-align: middle; width: 50%;">
                <table align="right" border="0" cellpadding="0" cellspacing="0" style="background-color: #0a58ca; border-radius: 4px; border-collapse: collapse; width: 180px;">
                  <tr>
                    <td style="background-color: #0a58ca; color: #ffffff; padding: 10px 15px; text-align: center; border-radius: 4px; border: none;">
                      <div class="invoice-label" style="font-size: 20px; font-weight: bold; margin: 0; color: #ffffff; font-family: 'Tajawal', 'Arial', sans-serif;">فاتورة</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <div class="customer-details" style="background-color: #f8f9fa; border: 1px solid #e9ecef; padding: 15px; border-radius: 8px; margin-bottom: 25px; direction: rtl; text-align: right;">
            <div class="detail-row" style="margin-bottom: 8px; font-size: 13px;">
              <span class="detail-label" style="font-weight: bold; color: #0a58ca; display: inline-block; width: 100px;">رقم الفاتورة:</span>
              <span style="font-weight: bold;">${inv.id}</span>
            </div>
            <div class="detail-row" style="margin-bottom: 8px; font-size: 13px;">
              <span class="detail-label" style="font-weight: bold; color: #0a58ca; display: inline-block; width: 100px;">الاسم:</span>
              <span style="font-weight: bold;">${inv.customerName}</span>
            </div>
            <div class="detail-row" style="margin-bottom: 8px; font-size: 13px;">
              <span class="detail-label" style="font-weight: bold; color: #0a58ca; display: inline-block; width: 100px;">العنوان:</span>
              <span>${inv.address || "-"}</span>
            </div>
            <div class="detail-row" style="margin-bottom: 8px; font-size: 13px;">
              <span class="detail-label" style="font-weight: bold; color: #0a58ca; display: inline-block; width: 100px;">رقم التليفون:</span>
              <span dir="ltr">${inv.phone || "-"}</span>
            </div>
          </div>

          <table class="table-items" style="width: 100%; border-collapse: collapse; margin-bottom: 25px; border: 1px solid #0a58ca; direction: rtl;" dir="rtl">
            <thead>
              <tr style="background-color: #0a58ca; color: #ffffff;">
                <th style="width: 8%; background-color: #0a58ca; color: #ffffff; font-weight: bold; font-size: 12px; padding: 8px; border: 1px solid #0a58ca; text-align: center;">NO</th>
                <th style="text-align: right; background-color: #0a58ca; color: #ffffff; font-weight: bold; font-size: 12px; padding: 8px; border: 1px solid #0a58ca;">اسم الصنف</th>
                <th style="width: 20%; background-color: #0a58ca; color: #ffffff; font-weight: bold; font-size: 12px; padding: 8px; border: 1px solid #0a58ca; text-align: center;">سعر القطعة</th>
                <th style="width: 15%; background-color: #0a58ca; color: #ffffff; font-weight: bold; font-size: 12px; padding: 8px; border: 1px solid #0a58ca; text-align: center;">العدد</th>
                <th style="width: 20%; background-color: #0a58ca; color: #ffffff; font-weight: bold; font-size: 12px; padding: 8px; border: 1px solid #0a58ca; text-align: center;">المجموع</th>
              </tr>
            </thead>
            <tbody>
              ${inv.items.map((item, idx) => `
                <tr>
                  <td style="padding: 8px; border: 1px solid #e9ecef; font-size: 12px; text-align: center;">${idx + 1}</td>
                  <td class="item-name" style="padding: 8px; border: 1px solid #e9ecef; font-size: 12px; text-align: right;">${item.itemName}</td>
                  <td style="padding: 8px; border: 1px solid #e9ecef; font-size: 12px; text-align: center;">${item.price.toFixed(2)} EGP</td>
                  <td style="padding: 8px; border: 1px solid #e9ecef; font-size: 12px; text-align: center;">${item.quantity}</td>
                  <td style="padding: 8px; border: 1px solid #e9ecef; font-size: 12px; text-align: center; font-weight: bold; color: #0a58ca;">${item.total.toFixed(2)} EGP</td>
                </tr>
              `).join('')}
              <tr class="total-row" style="background-color: #f8f9fa; font-weight: bold;">
                <td style="padding: 8px; border: 1px solid #e9ecef; font-size: 12px; text-align: center;">#</td>
                <td style="text-align: right; font-weight: bold; padding: 8px; border: 1px solid #e9ecef; font-size: 12px;">مجموع الأصناف</td>
                <td style="padding: 8px; border: 1px solid #e9ecef; font-size: 12px; text-align: center;"></td>
                <td style="text-align: center; font-weight: bold; padding: 8px; border: 1px solid #e9ecef; font-size: 12px;">${inv.items.reduce((acc, curr) => acc + Number(curr.quantity), 0)}</td>
                <td style="font-weight: bold; color: #0a58ca; padding: 8px; border: 1px solid #e9ecef; font-size: 12px; text-align: center;">${itemsSubtotal.toFixed(2)} EGP</td>
              </tr>
              ${shippingFee > 0 ? `
              <tr class="total-row" style="background-color: #f8f9fa; font-weight: bold;">
                <td style="padding: 8px; border: 1px solid #e9ecef; font-size: 12px; text-align: center;">#</td>
                <td style="text-align: right; font-weight: bold; padding: 8px; border: 1px solid #e9ecef; font-size: 12px;">قيمة التوصيل</td>
                <td style="padding: 8px; border: 1px solid #e9ecef; font-size: 12px; text-align: center;"></td>
                <td style="text-align: center; padding: 8px; border: 1px solid #e9ecef; font-size: 12px;">-</td>
                <td style="font-weight: bold; color: #0a58ca; padding: 8px; border: 1px solid #e9ecef; font-size: 12px; text-align: center;">${shippingFee.toFixed(2)} EGP</td>
              </tr>
              ` : ""}
              <tr class="total-row" style="background-color: #0a58ca; color: #ffffff;">
                <td style="padding: 8px; border: 1px solid #e9ecef; font-size: 12px; text-align: center; color: #ffffff;">#</td>
                <td style="text-align: right; font-weight: bold; padding: 8px; border: 1px solid #e9ecef; font-size: 12px; color: #ffffff;">الاجمالي المطلوب دفعه</td>
                <td style="padding: 8px; border: 1px solid #e9ecef; font-size: 12px; text-align: center; color: #ffffff;"></td>
                <td style="text-align: center; padding: 8px; border: 1px solid #e9ecef; font-size: 12px; color: #ffffff;"></td>
                <td class="total-amount" style="font-weight: 900; color: #ffffff; font-size: 16px; padding: 8px; border: 1px solid #e9ecef; text-align: center;">${inv.totalAmount.toFixed(2)} EGP</td>
              </tr>
            </tbody>
          </table>

          <div class="footer-strip" style="background-color: #0a58ca; color: #ffffff; padding: 12px; text-align: center; font-weight: bold; font-size: 14px; margin-top: 30px; border-radius: 4px;">
            للتواصل والمبيعات: +201016296205
          </div>
        `;
      }).join('');

      const wordHtml = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <title>Invoices Export</title>
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
              margin-bottom: 25px;
            }
            .brand-name {
              font-size: 26px;
              font-weight: bold;
              color: #111111;
              direction: ltr !important;
              text-align: left;
            }
            .invoice-label {
              font-size: 20px;
              font-weight: bold;
              color: #ffffff;
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
              margin-bottom: 25px;
              border: 1px solid #0a58ca;
            }
            .table-items th {
              background-color: #0a58ca;
              color: #ffffff;
              font-weight: bold;
              font-size: 12px;
              padding: 8px;
              border: 1px solid #0a58ca;
              text-align: center;
            }
            .table-items td {
              padding: 8px;
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
              font-size: 14px;
              margin-top: 30px;
              border-radius: 4px;
            }
            .page-break {
              page-break-before: always;
              mso-break-type: section-break;
              clear: all;
            }
          </style>
        </head>
        <body>
          ${invoicesBody}
        </body>
        </html>
      `;

      const blob = new Blob(["\ufeff" + wordHtml], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setShowBulkModal(false);
    } catch (e) {
      console.error("Failed to generate bulk Word document:", e);
      alert("عذراً، حدث خطأ أثناء تحميل الملف.");
    }
  };

  // Helper row filling - optimized to only return actual items to avoid empty/filler rows
  const getPaddedRows = () => {
    if (!activeInvoice) return [];
    return activeInvoice.items;
  };

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-8 py-6 font-sans">
      
      {/* Styles for print mode */}
      <style>{`
        @page {
          size: A4;
          margin: 0.5cm;
        }
        
        .invoice-print-card {
          page-break-inside: avoid !important;
          break-inside: avoid-page !important;
        }
        @media print {
          /* Force page & parent sizing reset for complete rendering without vh caps */
          html, body, #root, .min-h-screen, main, div, header, section {
            height: auto !important;
            overflow: visible !important;
            min-height: 0 !important;
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          
          /* Hide non-printable app items entirely */
          .no-print, nav, header, aside, button, .sidebar, footer {
            display: none !important;
          }
          
          /* Ensure printable area takes perfect A4 layout specifications */
          .print-area {
            position: relative !important;
            left: auto !important;
            top: auto !important;
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

          /* Force page-break prevention for compact cards */
          .invoice-print-card {
            page-break-inside: avoid !important;
            break-inside: avoid-page !important;
            min-height: auto !important;
            height: auto !important;
            border-bottom: 2px dashed #0a58ca !important;
            margin-bottom: 2.5cm !important;
            padding-bottom: 1.5cm !important;
          }

          /* FIX: إخفاء فاتورة الـ single لما يكون bulk printing شغال
             بدل Tailwind print:hidden اللي مش بيشتغل دايماً */
          .hide-on-bulk-print {
            display: none !important;
          }

          /* FIX: إظهار الـ bulk container وقت الطباعة
             بدل Tailwind print:block اللي مش بيشتغل دايماً */
          .bulk-print-container {
            display: block !important;
            width: 100% !important;
          }
          
          /* Color preservation adjustments */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }

        /* FIX: إخفاء الـ bulk container في الـ screen العادي
           بدل Tailwind hidden اللي ممكن يتعارض */
        .bulk-print-container {
          display: none;
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
              onClick={printInvoice}
              className="bg-white hover:bg-[#f3f3f4] text-black border border-[#cfc4c5] px-4 py-2 rounded-lg font-semibold text-xs tracking-wide transition flex items-center gap-1.5 cursor-pointer shadow-[0px_2px_4px_rgba(0,0,0,0.02)]"
            >
              <Printer className="w-3.5 h-3.5 text-[#5d5e66]" />
              <span>طباعة وتحميل الفاتورة الحالية (PDF)</span>
            </button>
            <button 
              onClick={openBulkModal}
              className="bg-[#0a58ca]/5 hover:bg-[#0a58ca]/10 text-[#0a58ca] border border-[#0a58ca]/30 px-4 py-2 rounded-lg font-semibold text-xs tracking-wide transition flex items-center gap-1.5 cursor-pointer shadow-[0px_2px_4px_rgba(10,88,202,0.01)]"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>طباعة وتحميل فواتير متعددة في ملف واحد (PDF)</span>
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
          {/* FIX: استبدال print:hidden بـ hide-on-bulk-print CSS class */}
          <div ref={printAreaRef} className={`print-area bg-white w-full max-w-4xl shadow-[0px_10px_40px_rgba(31,31,31,0.06)] border border-[#eeeeef] rounded-md overflow-hidden flex flex-col min-h-0 relative select-none invoice-print-card ${bulkPrintInvoices ? "print:hidden" : ""}`}>
            
            {/* Blue and Grey Visual Accent Top Bar */}
            <div className="h-1.5 bg-[#0a58ca]" />

            {/* Header: Centered O&A Brand */}
            <div className="pt-4 pb-1 text-center select-none" dir="ltr">
              <h1 className="text-xl font-black tracking-tight text-gray-900 leading-none">O&A Brand</h1>
            </div>

            {/* Divider */}
            <div className="px-6 my-0.5">
              <div className="h-[1px] bg-gray-200" />
            </div>

            {/* Customer coordinates (Compact row/grid format) */}
            <div className="px-6 py-2 flex justify-between gap-4" dir="rtl">
              <div className="w-1/2 space-y-1 text-right">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-[#0a58ca] shrink-0">الاسم:</span>
                  <span className="text-[11px] text-black font-black">{activeInvoice.customerName}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-[#0a58ca] shrink-0">رقم التليفون:</span>
                  <span className="text-[11px] text-black font-bold font-mono" dir="ltr">{activeInvoice.phone || "-"}</span>
                </div>
              </div>
              <div className="w-1/2 flex gap-1.5 text-right border-r border-gray-200 pr-3">
                <span className="text-[11px] font-bold text-[#0a58ca] shrink-0">العنوان:</span>
                <span className="text-[11px] text-gray-700 leading-relaxed">{activeInvoice.address || "-"}</span>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="px-6 py-1.5 flex-1">
              <table className="w-full border border-[#0a58ca]/40 text-right font-sans" dir="rtl">
                <thead>
                  <tr className="bg-[#0a58ca] text-white text-[11px] select-none">
                    <th className="border-l border-[#0a58ca]/50 py-1.5 px-3 font-bold w-12 text-center">NO</th>
                    <th className="border-l border-[#0a58ca]/50 py-1.5 px-3 font-bold">اسم الصنف</th>
                    <th className="border-l border-[#0a58ca]/50 py-1.5 px-3 font-bold w-28 text-center">سعر القطعة</th>
                    <th className="border-l border-[#0a58ca]/50 py-1.5 px-3 font-bold w-20 text-center">العدد</th>
                    <th className="py-1.5 px-3 font-bold w-28 text-center">المجموع</th>
                  </tr>
                </thead>
                <tbody className="text-[11px] text-[#1a1c1d]">
                  {getPaddedRows().map((row, idx) => {
                    return (
                      <tr 
                        key={idx}
                        className="h-7 border-b border-gray-200 hover:bg-gray-50/50"
                      >
                        {/* NO Index Column */}
                        <td className="border-l border-gray-200 text-center font-bold text-gray-500 font-mono py-0.5">
                          {idx + 1}
                        </td>
                        
                        {/* Item descriptive */}
                        <td className="border-l border-gray-200 px-3 font-medium max-w-[280px] truncate text-[#1a1c1d] py-0.5">
                          {row.itemName}
                        </td>

                        {/* Price Unit */}
                        <td className="border-l border-gray-200 px-3 text-center font-semibold font-mono text-gray-600 py-0.5">
                          {row.price.toFixed(2)}
                        </td>

                        {/* Qty Count */}
                        <td className="border-l border-gray-200 px-3 text-center font-bold font-mono py-0.5">
                          {row.quantity}
                        </td>

                        {/* Line aggregate cost */}
                        <td className="px-3 text-center font-bold font-mono text-[#0a58ca] py-0.5">
                          {row.total.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Summary / Tax or aggregate totals row */}
                  <tr className="h-7 bg-gray-50/70 border-t border-gray-200 select-none">
                    <td className="border-l border-gray-200 text-center font-bold text-gray-400 py-0.5">#</td>
                    <td className="border-l border-gray-200 px-3 font-bold text-gray-700 text-right py-0.5">
                      مجموع الأصناف
                    </td>
                    <td className="border-l border-gray-200 text-center font-bold text-gray-500 font-mono py-0.5">
                      
                    </td>
                    <td className="border-l border-gray-200 text-center font-black font-mono text-black py-0.5">
                      {activeInvoice.items.reduce((a,c) => a+Number(c.quantity), 0)}
                    </td>
                    <td className="px-3 text-center font-bold font-mono text-[#0a58ca] py-0.5">
                      {itemsSubtotal.toFixed(2)}
                    </td>
                  </tr>

                  {shippingFee > 0 && (
                    <tr className="h-7 bg-gray-50/70 border-t border-gray-200 select-none">
                      <td className="border-l border-gray-200 text-center font-bold text-gray-400 py-0.5">#</td>
                      <td className="border-l border-gray-200 px-3 font-bold text-gray-700 text-right py-0.5">
                        قيمة التوصيل
                      </td>
                      <td className="border-l border-gray-200 text-center font-bold text-gray-500 font-mono py-0.5">
                        
                      </td>
                      <td className="border-l border-gray-200 text-center font-medium font-mono text-gray-400 py-0.5">
                        
                      </td>
                      <td className="px-3 text-center font-bold font-mono text-[#0a58ca] py-0.5">
                        {shippingFee.toFixed(2)}
                      </td>
                    </tr>
                  )}

                  <tr className="h-8 bg-gray-100 border-t border-[#0a58ca]/40 select-none text-black">
                    <td className="border-l border-gray-200 text-center font-black text-gray-600 py-1">#</td>
                    <td className="border-l border-gray-200 px-3 font-black text-[#0a58ca] text-right py-1">
                      الاجمالي المطلوب دفعه
                    </td>
                    <td className="border-l border-gray-200 text-center font-bold text-gray-500 font-mono py-1">
                      
                    </td>
                    <td className="border-l border-gray-200 text-center font-black font-mono text-black py-1">
                      
                    </td>
                    <td className="px-3 text-center font-black font-mono text-sm text-[#0a58ca] py-1">
                      {activeInvoice.totalAmount.toFixed(2)} EGP
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Printable Footing contact block */}
            <div className="mt-2 bg-[#0a58ca] text-[#ffffff] py-1 px-4 text-center select-none">
              <p className="text-xs font-bold tracking-wide text-center" dir="rtl">
                للتواصل +201016296205
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

      {/* Bulk PDF Export Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[9999] flex items-center justify-center p-4 overflow-y-auto no-print" dir="rtl">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl flex flex-col gap-5 animate-scale-up" onClick={(e) => e.stopPropagation()}>
            
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-[#0a58ca]">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-black font-sans">طباعة وتصدير فواتير متعددة كـ PDF</h3>
                  <p className="text-xs text-gray-500 font-sans">توليد ملف PDF مدمج يحتوي على الفواتير المحددة (كل فاتورة بصفحة منفصلة)</p>
                </div>
              </div>
              <button 
                onClick={() => setShowBulkModal(false)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Selector Options */}
            <div className="space-y-4">
              <label className="text-xs font-bold text-gray-700 block">اختر نطاق الفواتير للتصدير:</label>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                
                {/* All Option */}
                <div 
                  onClick={() => setBulkType("all")}
                  className={`border p-4 rounded-xl cursor-pointer transition flex flex-col gap-1 ${
                    bulkType === "all" 
                      ? "border-[#0a58ca] bg-blue-50/40 text-[#0a58ca]" 
                      : "border-gray-200 hover:border-gray-300 text-gray-600 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold font-sans">كافة الفواتير</span>
                    <input 
                      type="radio" 
                      checked={bulkType === "all"} 
                      onChange={() => setBulkType("all")}
                      className="accent-[#0a58ca]"
                    />
                  </div>
                  <span className="text-[11px] text-gray-500 font-sans">عدد الفواتير: {invoices.length}</span>
                </div>

                {/* Limit Option */}
                <div 
                  onClick={() => setBulkType("limit")}
                  className={`border p-4 rounded-xl cursor-pointer transition flex flex-col gap-1 ${
                    bulkType === "limit" 
                      ? "border-[#0a58ca] bg-blue-50/40 text-[#0a58ca]" 
                      : "border-gray-200 hover:border-gray-300 text-gray-600 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold font-sans">عدد فواتير محدد</span>
                    <input 
                      type="radio" 
                      checked={bulkType === "limit"} 
                      onChange={() => setBulkType("limit")}
                      className="accent-[#0a58ca]"
                    />
                  </div>
                  <span className="text-[11px] text-gray-500 font-sans">أول X من الفواتير المضافة</span>
                </div>

                {/* Manual Option */}
                <div 
                  onClick={() => {
                    setBulkType("manual");
                    if (manualSelectedIds.length === 0) {
                      setManualSelectedIds(invoices.map(inv => inv.id));
                    }
                  }}
                  className={`border p-4 rounded-xl cursor-pointer transition flex flex-col gap-1 ${
                    bulkType === "manual" 
                      ? "border-[#0a58ca] bg-blue-50/40 text-[#0a58ca]" 
                      : "border-gray-200 hover:border-gray-300 text-gray-600 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold font-sans">اختيار مخصص يدوي</span>
                    <input 
                      type="radio" 
                      checked={bulkType === "manual"} 
                      onChange={() => {
                        setBulkType("manual");
                        if (manualSelectedIds.length === 0) {
                          setManualSelectedIds(invoices.map(inv => inv.id));
                        }
                      }}
                      className="accent-[#0a58ca]"
                    />
                  </div>
                  <span className="text-[11px] text-gray-500 font-sans">تحديد فواتير معينة يدوياً</span>
                </div>

              </div>
            </div>

            {/* Dynamic Controls based on choices */}
            {bulkType === "limit" && (
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-center justify-between gap-4 animate-fade-in">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-700 block">حدد كم فاتورة تريد تضمينها بالملف:</label>
                  <p className="text-[11px] text-gray-500">سيتم أخذ أول الفواتير من القائمة تصاعدياً.</p>
                </div>
                <div className="flex items-center gap-2">
                  <input 
                    type="number" 
                    min={1} 
                    max={invoices.length}
                    value={bulkLimit}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val)) {
                        setBulkLimit(Math.max(1, Math.min(val, invoices.length)));
                      }
                    }}
                    className="w-20 px-3 py-2 text-center text-xs font-bold border border-gray-300 rounded-lg hover:border-gray-400 focus:outline-none focus:border-[#0a58ca]"
                  />
                  <span className="text-xs text-gray-600 font-bold">فاتورة</span>
                </div>
              </div>
            )}

            {bulkType === "manual" && (
              <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-100 animate-fade-in flex flex-col">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 border-b border-gray-200/50 pb-2">
                  <span className="text-xs font-bold text-gray-700">قائمة الفواتير المتاحة للتحديد:</span>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setManualSelectedIds(invoices.map(inv => inv.id))}
                      className="text-[10px] font-bold text-[#0a58ca] hover:underline cursor-pointer"
                    >
                      تحديد الكل
                    </button>
                    <span className="text-gray-300"> | </span>
                    <button 
                      onClick={() => setManualSelectedIds([])}
                      className="text-[10px] font-bold text-red-600 hover:underline cursor-pointer"
                    >
                      إلغاء تحديد الكل
                    </button>
                  </div>
                </div>

                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input 
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ابحث باسم العميل أو العنوان أو رقم الهاتف..."
                    className="w-full pr-9 pl-3 py-2 text-xs border border-gray-300 rounded-lg hover:border-gray-400 focus:outline-none focus:border-[#0a58ca] bg-white text-right"
                  />
                </div>

                {/* Invoices Checkbox List */}
                <div className="max-h-[180px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {invoices
                    .filter(inv => {
                      if (!searchQuery) return true;
                      const q = searchQuery.toLowerCase();
                      return (
                        inv.customerName.toLowerCase().includes(q) ||
                        inv.id.toLowerCase().includes(q) ||
                        (inv.address && inv.address.toLowerCase().includes(q)) ||
                        (inv.phone && inv.phone.includes(q))
                      );
                    })
                    .map((inv) => {
                      const isSelected = manualSelectedIds.includes(inv.id);
                      return (
                        <div 
                          key={inv.id}
                          onClick={() => {
                            if (isSelected) {
                              setManualSelectedIds(prev => prev.filter(id => id !== inv.id));
                            } else {
                              setManualSelectedIds(prev => [...prev, inv.id]);
                            }
                          }}
                          className={`flex items-center justify-between p-2.5 rounded-lg border transition cursor-pointer text-right bg-white select-none ${
                            isSelected 
                              ? "border-blue-200 bg-blue-50/20" 
                              : "border-gray-100 hover:border-gray-200"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 shrink-0">
                            <input 
                              type="checkbox" 
                              checked={isSelected}
                              readOnly
                              className="accent-[#0a58ca] h-3.5 w-3.5"
                            />
                            <div className="text-right">
                              <span className="text-xs font-bold text-black block leading-none mb-1 text-right">
                                {inv.customerName}
                              </span>
                              <span className="text-[10px] text-gray-500 font-mono">
                                هاتف: {inv.phone || "-"}
                              </span>
                            </div>
                          </div>
                          <div className="text-left shrink-0">
                            <span className="text-[10px] font-bold text-gray-800 bg-gray-100 px-1.5 py-0.5 rounded font-mono block mb-1">
                              ID: {inv.id}
                            </span>
                            <span className="text-[9px] text-gray-400">
                              {inv.items.length} أصناف • {inv.totalAmount.toFixed(0)} EGP
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Print overview badge summary */}
            <div className="bg-blue-50/50 rounded-xl p-3.5 border border-blue-100/30 text-right">
              <span className="text-xs text-gray-600 block leading-relaxed font-sans">
                📌 <strong>ملخص التصدير:</strong> سيتم دمج {" "} 
                <strong className="text-[#0a58ca] text-sm font-sans">
                  {bulkType === "all" ? invoices.length : bulkType === "limit" ? bulkLimit : manualSelectedIds.length}
                </strong> {" "}
                فواتير داخل ملف <strong>PDF</strong> مدمج ومنسق، حيث تفرز كل فاتورة في صفحة مستقلة بنظام تلقائي لحفظ مظهر الشركة الأنيق ودعم الطباعة المباشرة.
              </span>
            </div>

            {/* Modal Actions */}
            <div className="flex gap-3 justify-end pt-2 border-t border-gray-100">
              <button
                onClick={() => setShowBulkModal(false)}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition cursor-pointer"
              >
                إلغاء وتراجع
              </button>
              <button
                onClick={handlePrintBulkPDF}
                className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-[#0a58ca] hover:bg-[#084298] transition flex items-center gap-1.5 cursor-pointer shadow-lg shadow-blue-600/15"
              >
                <FileText className="w-4 h-4" />
                <span>تصدير وطباعة PDF الآن</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Dynamic Bulk Printable Pages Container */}
      {bulkPrintInvoices && (
        <div className="bulk-print-container w-full font-sans">
          {bulkPrintInvoices.map((rawInv, index) => {
            const inv = sanitizeInvoice(rawInv);
            if (!inv) return null;
            const itemsSubtotal = inv.items.reduce((acc, curr) => acc + curr.total, 0);
            const shippingFee = inv.shippingCost || 0;

            return (
              <div 
                key={inv.id} 
                className="bg-white w-full max-w-4xl mx-auto flex flex-col relative p-8 select-none invoice-print-card"
              >
                {/* Blue Visual Accent Top Bar */}
                <div className="h-1.5 bg-[#0a58ca] -mx-8 -mt-8 mb-4" />

                {/* Header: Centered O&A Brand */}
                <div className="pt-2 pb-1 text-center select-none" dir="ltr">
                  <h1 className="text-xl font-black tracking-tight text-gray-900 leading-none">O&A Brand</h1>
                </div>

                {/* Divider */}
                <div className="my-1">
                  <div className="h-[1px] bg-gray-200" />
                </div>

                {/* Customer coordinates (Compact row/grid format) */}
                <div className="py-2 flex justify-between gap-4" dir="rtl">
                  <div className="w-1/2 space-y-1 text-right">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-[#0a58ca] shrink-0">الاسم:</span>
                      <span className="text-[11px] text-black font-black">{inv.customerName}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-[#0a58ca] shrink-0">رقم التليفون:</span>
                      <span className="text-[11px] text-black font-bold font-mono" dir="ltr">{inv.phone || "-"}</span>
                    </div>
                  </div>
                  <div className="w-1/2 flex gap-1.5 text-right border-r border-gray-200 pr-3">
                    <span className="text-[11px] font-bold text-[#0a58ca] shrink-0">العنوان:</span>
                    <span className="text-[11px] text-gray-700 leading-relaxed">{inv.address || "-"}</span>
                  </div>
                </div>

                {/* Line Items Table */}
                <div className="py-1.5 flex-1">
                  <table className="w-full border border-[#0a58ca]/40 text-right font-sans" dir="rtl">
                    <thead>
                      <tr className="bg-[#0a58ca] text-white text-[11px] select-none">
                        <th className="border-l border-[#0a58ca]/50 py-1.5 px-3 font-bold w-12 text-center">NO</th>
                        <th className="border-l border-[#0a58ca]/50 py-1.5 px-3 font-bold">اسم الصنف</th>
                        <th className="border-l border-[#0a58ca]/50 py-1.5 px-3 font-bold w-28 text-center">سعر القطعة</th>
                        <th className="border-l border-[#0a58ca]/50 py-1.5 px-3 font-bold w-20 text-center">العدد</th>
                        <th className="py-1.5 px-3 font-bold w-28 text-center">المجموع</th>
                      </tr>
                    </thead>
                    <tbody className="text-[11px] text-[#1a1c1d]">
                      {inv.items.map((row, idx) => {
                        return (
                          <tr 
                            key={idx}
                            className="h-7 border-b border-gray-200 hover:bg-gray-50/50"
                          >
                            <td className="border-l border-gray-200 text-center font-bold text-gray-500 font-mono py-0.5">
                              {idx + 1}
                            </td>
                            <td className="border-l border-gray-200 px-3 font-medium max-w-[280px] truncate text-[#1a1c1d] py-0.5">
                              {row.itemName}
                            </td>
                            <td className="border-l border-gray-200 px-3 text-center font-semibold font-mono text-gray-600 py-0.5">
                              {row.price.toFixed(2)}
                            </td>
                            <td className="border-l border-gray-200 px-3 text-center font-bold font-mono py-0.5">
                              {row.quantity}
                            </td>
                            <td className="px-3 text-center font-bold font-mono text-[#0a58ca] py-0.5">
                              {row.total.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}

                      {/* Summary Row */}
                      <tr className="h-7 bg-gray-50/70 border-t border-gray-200 select-none">
                        <td className="border-l border-gray-200 text-center font-bold text-gray-400 py-0.5">#</td>
                        <td className="border-l border-gray-200 px-3 font-bold text-gray-700 text-right py-0.5">
                          مجموع الأصناف
                        </td>
                        <td className="border-l border-gray-200 text-center font-bold text-gray-500 font-mono py-0.5" />
                        <td className="border-l border-gray-200 text-center font-black font-mono text-black py-0.5">
                          {inv.items.reduce((a,c) => a+Number(c.quantity), 0)}
                        </td>
                        <td className="px-3 text-center font-bold font-mono text-[#0a58ca] py-0.5">
                          {itemsSubtotal.toFixed(2)}
                        </td>
                      </tr>

                      {shippingFee > 0 && (
                        <tr className="h-7 bg-gray-50/70 border-t border-gray-200 select-none">
                          <td className="border-l border-gray-200 text-center font-bold text-gray-400 py-0.5">#</td>
                          <td className="border-l border-gray-200 px-3 font-bold text-gray-700 text-right py-0.5">
                            قيمة التوصيل
                          </td>
                          <td className="border-l border-gray-200 text-center font-bold text-gray-500 font-mono py-0.5" />
                          <td className="border-l border-gray-200 text-center font-medium font-mono text-gray-400 py-0.5"></td>
                          <td className="px-3 text-center font-bold font-mono text-[#0a58ca] py-0.5">
                            {shippingFee.toFixed(2)}
                          </td>
                        </tr>
                      )}

                      <tr className="h-8 bg-gray-100 border-t border-[#0a58ca]/40 select-none text-black">
                        <td className="border-l border-gray-200 text-center font-black text-gray-600 py-1">#</td>
                        <td className="border-l border-gray-200 px-3 font-black text-[#0a58ca] text-right py-1">
                          الاجمالي المطلوب دفعه
                        </td>
                        <td className="border-l border-gray-200 text-center font-bold text-gray-500 font-mono py-1" />
                        <td className="border-l border-gray-200 text-center font-black font-mono text-black py-1" />
                        <td className="px-3 text-center font-black font-mono text-sm text-[#0a58ca] py-1">
                          {inv.totalAmount.toFixed(2)} EGP
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Printable Footing contact block */}
                <div className="mt-2 bg-[#0a58ca] text-[#ffffff] py-1 px-4 text-center select-none -mx-8 -mb-8">
                  <p className="text-xs font-bold tracking-wide text-center" dir="rtl">
                    للتواصل +201016296205
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
