import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

dotenv.config();

// Detect production mode (compiled CommonJS server in dist/ or NODE_ENV === "production")
const isProd = process.env.NODE_ENV === "production" || 
               (typeof __filename !== "undefined" && (__filename.endsWith(".cjs") || __filename.includes("dist"))) ||
               fs.existsSync(path.join(process.cwd(), "dist/index.html"));

function getEgyptTimeFormatted(dateOrStr?: string | Date): string {
  const date = dateOrStr ? new Date(dateOrStr) : new Date();
  try {
    let formatted = date.toLocaleString("en-US", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    });
    // formatted is like "06/08/2026, 01:24:35 PM"
    formatted = formatted.replace(/\bAM\b/gi, "صباحاً (AM)").replace(/\bPM\b/gi, "مساءً (PM)");
    return formatted;
  } catch (err) {
    const offsetDate = new Date(date.getTime() + 3 * 60 * 60 * 1000);
    const y = offsetDate.getUTCFullYear();
    const m = String(offsetDate.getUTCMonth() + 1).padStart(2, '0');
    const d = String(offsetDate.getUTCDate()).padStart(2, '0');
    let h = offsetDate.getUTCHours();
    const min = String(offsetDate.getUTCMinutes()).padStart(2, '0');
    const sec = String(offsetDate.getUTCSeconds()).padStart(2, '0');
    const ampm = h >= 12 ? "مساءً (PM)" : "صباحاً (AM)";
    h = h % 12;
    h = h ? h : 12;
    const hStr = String(h).padStart(2, '0');
    return `${m}/${d}/${y}, ${hStr}:${min}:${sec} ${ampm}`;
  }
}

const app = express();
const PORT = 3000;

// Custom body parser middleware to prevent hanging on Vercel where req.body is pre-parsed
app.use((req, res, next) => {
  if (req.body !== undefined) {
    next();
  } else {
    express.json({ limit: "15mb" })(req, res, next);
  }
});

// Helper to resolve writable directory path in Serverless/Vercel environments
function getWritablePath(filename: string): string {
  const rootPath = process.cwd();
  if (process.env.VERCEL) {
    const tmpPath = path.join("/tmp", filename);
    if (!fs.existsSync(tmpPath)) {
      const origPath = path.join(rootPath, filename);
      if (fs.existsSync(origPath)) {
        try {
          fs.copyFileSync(origPath, tmpPath);
        } catch (err) {
          console.error(`Error copying seeded data for ${filename} to /tmp:`, err);
        }
      }
    }
    return tmpPath;
  }
  return path.join(rootPath, filename);
}

// Path to persist invoices locally/semi-permanently
const INVOICES_FILE = getWritablePath("invoices.json");
const EXCEL_FILES_FILE = getWritablePath("excel_files.json");

// Define basic structural interfaces for backend data
interface InvoiceItem {
  itemName: string;
  price: number;
  quantity: number;
  total: number;
}

interface Invoice {
  id: string;
  customerName: string;
  address: string;
  phone: string;
  items: InvoiceItem[];
  notes: string;
  totalAmount: number;
  shippingCost?: number;
  isSynced?: boolean;
  createdAt: string;
}

interface ExcelFile {
  id: string;
  name: string;
  uploadDate: string;
  size: string;
  status: "synced" | "pending" | "failed";
  recordsCount: number;
}

// Initial seeding of data if files do not exist
const getInitialInvoices = (): Invoice[] => [];

const getInitialExcelFiles = (): ExcelFile[] => [];

// Helper to safely load JSON files
function loadData<T>(filePath: string, fallback: () => T): T {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.error(`Error loading file at ${filePath}:`, err);
  }
  const defaultVal = fallback();
  saveData(filePath, defaultVal);
  return defaultVal;
}

// Helper to safely save JSON files
function saveData<T>(filePath: string, data: T): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error(`Error saving file at ${filePath}:`, err);
  }
}

// Load current records (starts fresh empty)
let invoices: Invoice[] = loadData(INVOICES_FILE, getInitialInvoices);
let excelFiles: ExcelFile[] = loadData(EXCEL_FILES_FILE, getInitialExcelFiles);

// New Excel link persistent state saved to settings.json
const SETTINGS_FILE = getWritablePath("settings.json");
interface Settings {
  excelSheetLink: string;
  googleSheetViewLink: string;
}
const getInitialSettings = (): Settings => ({ excelSheetLink: "", googleSheetViewLink: "" });
let savedSettings: Settings = loadData(SETTINGS_FILE, getInitialSettings);

let excelSheetLink: string = savedSettings.excelSheetLink || "";
let googleSheetViewLink: string = savedSettings.googleSheetViewLink || "";

// In-memory debug logs buffer to troubleshoot backend 500 errors
const debugLogs: string[] = [];
function logDebug(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  debugLogs.push(line);
  if (debugLogs.length > 200) debugLogs.shift();
}

app.get("/api/debug-logs", (req, res) => {
  res.json({
    nodeEnv: isProd ? "production" : (process.env.NODE_ENV || "development"),
    hasKey: !!process.env.GEMINI_API_KEY,
    keyPrefix: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 6) + "..." : "none",
    logs: debugLogs
  });
});

// Initialize Gemini SDK with telemetry header "aistudio-build"
let googleGenAI: GoogleGenAI | null = null;
function getGeminiClient() {
  if (!googleGenAI) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      logDebug("GEMINI_API_KEY is not defined in backend process.env. Extractor operations will fallback to mock heuristics.");
    }
    // Lazy initialize
    googleGenAI = new GoogleGenAI({
      apiKey: key || "",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });
  }
  return googleGenAI;
}

// API endpoint to process natural language raw invoice text with Gemini
app.post("/api/extract", async (req, res) => {
  try {
    logDebug(`Extraction API requested. req.body is null? ${!req.body} type: ${typeof req.body} keys: ${req.body ? Object.keys(req.body).join(", ") : "none"}`);
    const text = req.body && typeof req.body === "object" ? req.body.text : null;
    if (!text || typeof text !== "string") {
      logDebug(`Invalid input received: ${JSON.stringify(req.body)}`);
      return res.status(400).json({ error: "No query text provided." });
    }

    logDebug(`Extracting from text length ${text.length}: "${text.substring(0, 60).replace(/\n/g, " ")}..."`);

    // Quick fallback check if no key configured or if it is a placeholder/undefined string
    const apiKey = process.env.GEMINI_API_KEY;
    const isInvalidKey = !apiKey || 
                         apiKey.trim() === "" || 
                         apiKey.includes("YOUR_") || 
                         apiKey === "undefined" || 
                         apiKey === "null" ||
                         apiKey.startsWith("MY_");

    if (isInvalidKey) {
      logDebug("No valid GEMINI_API_KEY configured. Using mock heuristic parsing.");
      const parsed = simulateExtraction(text);
      logDebug(`Mock parsing succeeded. Extracted: ${parsed?.customerName || "no name"}`);
      return res.json(parsed);
    }

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // Prioritize gemini-3.1-flash-lite as it is ultrafast (<1s) for structured JSON data extraction.
    // Fallback to gemini-flash-latest and gemini-3.5-flash if needed.
    const modelsToTry = ["gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.5-flash"];
    let finalError: any = null;
    let parsedData: any = null;

    for (const modelToTry of modelsToTry) {
      let attempts = 1;
      let skipRemainingAttempts = false;

      for (let attempt = 1; attempt <= attempts; attempt++) {
        if (skipRemainingAttempts) {
          break;
        }

        try {
          console.log(`Attempting Gemini generation using model: ${modelToTry} (Attempt ${attempt}/${attempts})...`);
          const ai = getGeminiClient();
          const prompt = `
You are an expert invoice parser supporting both Arabic and English text.
Extract information from the following input message. Include name, address, phone, item descriptions, price per unit, quantities, delivery notes, and calculate proper total values.

CRITICAL INSTRUCTION:
Do NOT translate the customer name and address. If they are in Arabic in the source text, keep them in Arabic exactly as they are written. Do NOT convert or translate them to English.

User Input:
"""
${text}
"""
`;

          const config: any = {
            systemInstruction: "Extract billing and shipping info accurately. In case prices or counts are not clear, make reasonable assumptions (e.g. default item count = 1). Keep the customer name, address, notes, and items in the original language used in the input. STRICTLY DO NOT translate Arabic names or addresses into English; preserve them exactly as they are written in Arabic.",
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                customerName: { type: Type.STRING, description: "Customer Name" },
                address: { type: Type.STRING, description: "Delivery Address" },
                phone: { type: Type.STRING, description: "Phone number (preserve original format/digits)" },
                items: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      itemName: { type: Type.STRING, description: "Item description or service name" },
                      price: { type: Type.NUMBER, description: "Individual unit price as numeric" },
                      quantity: { type: Type.INTEGER, description: "Numeric quantity purchased" },
                      total: { type: Type.NUMBER, description: "Line item cost (price * quantity)" }
                    },
                    required: ["itemName", "price", "quantity", "total"]
                  }
                },
                notes: { type: Type.STRING, description: "Notes, delivery instruction, preferences, timing etc." }
              },
              required: ["customerName", "address", "phone", "items", "notes"]
            }
          };

          // Only use thinkingConfig for Gemini 3 models (excluding gemini-3.5-flash as it has no thinking budget)
          if (modelToTry.startsWith("gemini-3.") && modelToTry !== "gemini-3.5-flash") {
            config.thinkingConfig = { thinkingLevel: ThinkingLevel.MINIMAL };
          }

          // Set a race promise with a 6-second timeout to allow ample time while avoiding long delays
          const generatePromise = ai.models.generateContent({
            model: modelToTry,
            contents: prompt,
            config
          });

          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Gemini request timeout (exceeded 6 seconds for ${modelToTry})`)), 6000)
          );

          const result: any = await Promise.race([generatePromise, timeoutPromise]);

          const parsedText = result.text?.trim() || "{}";
          parsedData = JSON.parse(parsedText);
          // If we succeeded, break out of the attempts loop
          break;
        } catch (error: any) {
          finalError = error;
          const errMsg = (error.message || "").toLowerCase();
          const isUnavailable = errMsg.includes("503") || errMsg.includes("demand") || errMsg.includes("unavailable") || (error.code === 503) || (error.status === 503);
          
          if (isUnavailable) {
            console.warn(`Attempt ${attempt} for model ${modelToTry} failed due to High Demand/Unavailable (503). Skipping remaining attempts for this model...`);
            skipRemainingAttempts = true;
          } else {
            console.warn(`Attempt ${attempt} for model ${modelToTry} failed with:`, error.message || error);
            if (attempt < attempts) {
              const backoff = attempt * 1200;
              console.log(`Waiting ${backoff}ms before retrying...`);
              await delay(backoff);
            }
          }
        }
      }
      if (parsedData) {
        break;
      }
    }

    if (parsedData) {
      logDebug("Gemini extraction succeeded.");
      return res.json(parsedData);
    } else {
      logDebug(`All Gemini API attempts and models failed. Falling back to simulated heuristics. Error details: ${finalError?.message || finalError}`);
      // In case of API failure, provide automated mock heuristics to user
      return res.json(simulateExtraction(text));
    }
  } catch (globalErr: any) {
    logDebug(`Global crash caught in /api/extract: ${globalErr?.message || globalErr} Stack: ${globalErr?.stack}`);
    // Absolute fallback so that Vercel never returns 500 error under any condition
    try {
      const fallbackText = req.body?.text || "";
      logDebug(`Attempting global recovery with text length ${fallbackText.length}`);
      const fallback = simulateExtraction(fallbackText);
      logDebug(`Recovery extraction completed: ${JSON.stringify(fallback)}`);
      return res.json(fallback);
    } catch (recoveryErr: any) {
      logDebug(`Secondary recovery failure: ${recoveryErr?.message || recoveryErr} Stack: ${recoveryErr?.stack}`);
      return res.json({
        customerName: "",
        address: "",
        phone: "",
        items: [{ itemName: "خطأ في المعالجة (Error processing)", price: 0, quantity: 1, total: 0 }],
        notes: "",
        _apiFailed: true
      });
    }
  }
});

// Mock parser heuristic if API fails or key is missing
function simulateExtraction(text: string) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // 1. Phone number extraction
  // Match standard Egyptian mobile formats (010, 011, 012, 015 followed by 8 digits)
  // or standard sequence of 8-15 digits
  const phoneRegex = /(?:\+?20|0)?1[0125]\d{8}\b|\b\d{8,15}\b/;
  const phoneMatch = text.match(phoneRegex);
  const phone = phoneMatch ? phoneMatch[0].trim() : "";

  // 2. Customer Name extraction
  let customerName = "";
  // Check labeled name
  const nameLabelMatch = text.match(/(?:اسم العميل|العميل|باسم|السيد|للمهندس|المشتري|الاسم|اسم|name:)\s*[:\-]?\s*([^\s،,.\n\-\(\)]+(?:\s+[^\s،,.\n\-\(\)]+){1,3})/iu);
  if (nameLabelMatch) {
    customerName = nameLabelMatch[1].trim();
  }

  // 3. Address extraction
  let address = "";
  const addressLabelMatch = text.match(/(?:العنوان|عنوان|المقيم في|ساكن في|توصيل لـ|توصيل إلى|مكان التسليم|شحن لـ|address:)\s*[:\-]?\s*([^\n]+)/iu);
  if (addressLabelMatch) {
    address = addressLabelMatch[1].trim();
  }

  // Filter out phone and labels to do better heuristic extraction of name & address
  const addressIndicators = [
    "شارع", "محافظة", "محافظه", "مدينة", "مدينه", "مركز", "قرية", "قريه", 
    "بجوار", "بجانب", "خلف", "أمام", "امام", "طريق", "عمارة", "عماره", 
    "شقة", "شقه", "دور", "بيت", "منزل", "بلد", "القاهرة", "الجيزة", "قليوبية", 
    "قليوبيه", "الدقهلية", "الغربية", "المنوفية", "الشرقية", "طنطا", "بنها", "طوخ"
  ];

  // If customer name not found, guess from lines
  if (!customerName) {
    for (const line of lines) {
      if (line === phone) continue;
      
      // Check if line contains common item pricing or formula characters (skip those)
      if (line.includes("*") || line.includes("x") || line.includes("X") || line.includes("=") || line.includes("بسعر") || line.includes("سعر")) {
        continue;
      }
      
      // Check if line contains address indicators (skip those)
      const hasAddressInd = addressIndicators.some(ind => line.toLowerCase().includes(ind));
      if (hasAddressInd) continue;
      
      // If line is short (2-4 words) and has no digits, let's treat it as customer name!
      const words = line.split(/\s+/);
      if (words.length >= 2 && words.length <= 4 && !/\d/.test(line)) {
        customerName = line;
        break;
      }
    }
  }

  // If address not found by label, search for lines indicating place
  if (!address) {
    for (const line of lines) {
      if (line === phone || line === customerName) continue;
      
      const hasAddressInd = addressIndicators.some(ind => line.toLowerCase().includes(ind));
      const hasFormula = line.includes("*") || line.includes("x") || line.includes("X") || line.includes("=");
      
      if (hasAddressInd && !hasFormula && line.length > 3) {
        address = line;
        break;
      }
    }
  }

  // Fallback if still no address found: look for lines that are not phone or name and don't contain numbers
  if (!address) {
    for (const line of lines) {
      if (line === phone || line === customerName) continue;
      if (line.length > 5 && !/\d/.test(line)) {
        address = line;
        break;
      }
    }
  }

  // 4. Notes extraction
  let notes = "";
  const notesLabelMatch = text.match(/(?:ملاحظات|ملاحظة|ملحوظة|ملاحظه|ملحوظه|تنبيه|notes:)\s*[:\-]?\s*([^\n]+)/iu);
  if (notesLabelMatch) {
    notes = notesLabelMatch[1].trim();
  } else {
    const notesIndicators = ["توصيل", "شحن", "بسرعة", "مستعجل", "الاتصال", "يرجى", "رقم ثاني", "تعديل"];
    for (const line of lines) {
      if (line === phone || line === customerName || line === address) continue;
      if (notesIndicators.some(ind => line.toLowerCase().includes(ind))) {
        notes = line;
        break;
      }
    }
  }

  // 5. Items extraction
  const items: InvoiceItem[] = [];

  for (const line of lines) {
    const cleanLine = line.trim();
    // Skip lines that are exactly phone, customer name, address, or note label
    if (cleanLine === phone || cleanLine === customerName || cleanLine === address || cleanLine === notes) {
      continue;
    }
    // Skip lines that are just numbers (like phone)
    if (/^\+?\d+$/.test(cleanLine.replace(/\s+/g, ""))) {
      continue;
    }

    // Pattern A: "Product Name Quantity*Price" or "Product Name Price*Quantity"
    // e.g., "تيشرت كلاسيك 2*500" or "تيشرت أولادي شتوي كحلي 500*2" or "تيشرت 2x500"
    const patternA = /^([^\d\*xX×]+(?:\s+[^\d\*xX×]+)*)\s+(\d+)\s*[\*xX×]\s*(\d+)/iu;
    const matchA = cleanLine.match(patternA);
    if (matchA) {
      const itemName = matchA[1].trim();
      const num1 = parseFloat(matchA[2]);
      const num2 = parseFloat(matchA[3]);
      // Intelligent rule: the larger number is the price, the smaller is quantity
      const price = Math.max(num1, num2);
      const quantity = Math.min(num1, num2) || 1;
      items.push({
        itemName,
        price,
        quantity,
        total: price * quantity
      });
      continue;
    }

    // Pattern B: "Quantity*Price Product Name"
    // e.g., "2*500 تيشرت كلاسيك كحلي"
    const patternB = /^(\d+)\s*[\*xX×]\s*(\d+)\s+([^\d\*xX×]+.*?)$/iu;
    const matchB = cleanLine.match(patternB);
    if (matchB) {
      const num1 = parseFloat(matchB[1]);
      const num2 = parseFloat(matchB[2]);
      const itemName = matchB[3].trim();
      const price = Math.max(num1, num2);
      const quantity = Math.min(num1, num2) || 1;
      items.push({
        itemName,
        price,
        quantity,
        total: price * quantity
      });
      continue;
    }

    // Pattern C: "Quantity Product Name بسعر Price" or "Quantity Product Name بـ Price"
    // e.g., "2 تيشرت كلاسيك كحلي بسعر 500" or "3 بنطلون جينز بـ 350"
    const patternC = /^(\d+)\s+([^\d]+)\s+(?:بسعر|سعر|بـ|ب|للقطعة|للقطعه)\s*(\d+)/iu;
    const matchC = cleanLine.match(patternC);
    if (matchC) {
      const quantity = parseInt(matchC[1]) || 1;
      const itemName = matchC[2].trim();
      const price = parseFloat(matchC[3]) || 0;
      items.push({
        itemName,
        price,
        quantity,
        total: price * quantity
      });
      continue;
    }

    // Pattern D: "Product Name بسعر Price" or "Product Name Price"
    // e.g., "تيشرت كلاسيك كحلي بسعر 500" or "تيشرت كلاسيك كحلي 500"
    const patternD = /^([^\d]+)\s+(?:بسعر|سعر|بـ|ب)\s*(\d+)/iu;
    const matchD = cleanLine.match(patternD);
    if (matchD) {
      const itemName = matchD[1].trim();
      const price = parseFloat(matchD[2]) || 0;
      items.push({
        itemName,
        price,
        quantity: 1,
        total: price
      });
      continue;
    }

    // Pattern E: "Product Name Price جنيه" or "Product Name Price ج"
    // e.g., "تيشرت كلاسيك كحلي 500 جنيه" or "بنطلون جينز 300 ج"
    const patternE = /^([^\d]+)\s+(\d+)\s*(?:جنيه|ج|جنيه مصري|EGP|egp)\b/iu;
    const matchE = cleanLine.match(patternE);
    if (matchE) {
      const itemName = matchE[1].trim();
      const price = parseFloat(matchE[2]) || 0;
      items.push({
        itemName,
        price,
        quantity: 1,
        total: price
      });
      continue;
    }

    // Pattern F: Just standalone product name and price separated by space/dash
    // e.g., "تيشرت رجالي لارج 500"
    // We search if the line ends with a number
    const patternF = /^([^\d]+)\s+(\d+)$/iu;
    const matchF = cleanLine.match(patternF);
    if (matchF) {
      const itemName = matchF[1].trim();
      const price = parseFloat(matchF[2]) || 0;
      items.push({
        itemName,
        price,
        quantity: 1,
        total: price
      });
      continue;
    }
  }

  // Final fallback: if no items could be parsed, check if there's some text containing price numbers
  if (items.length === 0) {
    for (const line of lines) {
      const cleanLine = line.trim();
      if (cleanLine === phone || cleanLine === customerName || cleanLine === address || cleanLine === notes) {
        continue;
      }
      // If the line has some letters and at least one number
      const numMatch = cleanLine.match(/\d+/);
      const textOnly = cleanLine.replace(/\d+/g, "").replace(/[\*xX×\-\+]/g, "").trim();
      if (textOnly.length > 2 && numMatch) {
        const price = parseFloat(numMatch[0]) || 0;
        items.push({
          itemName: textOnly,
          price: price,
          quantity: 1,
          total: price
        });
      }
    }
  }

  // If still empty, push an empty editable item
  if (items.length === 0) {
    items.push({
      itemName: "",
      price: 0,
      quantity: 1,
      total: 0
    });
  }

  return {
    customerName,
    address,
    phone,
    items,
    notes,
    _apiFailed: true
  };
}

// INVOICES API
// Get list of invoices
app.get("/api/invoices", (req, res) => {
  res.json(invoices);
});

// Create/Sync Invoice
app.post("/api/invoices", async (req, res) => {
  const { customerName, address, phone, items, notes, shippingCost, excelSheetLink: clientExcelSheetLink } = req.body;
  
  if (!customerName) {
    return res.status(400).json({ error: "Customer name is required" });
  }

  const roundedItems = (items || []).map((it: any) => ({
    itemName: it.itemName || "Item Description",
    price: Number(it.price) || 0,
    textPrice: String(it.price || 0),
    quantity: Number(it.quantity) || 1,
    total: (Number(it.price) || 0) * (Number(it.quantity) || 1)
  }));

  const parsedShipping = Number(shippingCost) || 0;
  const totalAmount = roundedItems.reduce((acc: number, item: any) => acc + item.total, 0) + parsedShipping;

  const activeLink = clientExcelSheetLink || excelSheetLink;
  const isSyncedToGoogle = !!(activeLink && activeLink.includes("script.google.com"));

  const newInvoice: Invoice = {
    id: `inv_${Date.now()}`,
    customerName,
    address: address || "",
    phone: phone || "",
    items: roundedItems,
    notes: notes || "",
    totalAmount,
    shippingCost: parsedShipping,
    isSynced: false, // will update below if sync succeeds
    createdAt: new Date().toISOString()
  };

  let syncSuccess = false;
  // Trigger Synchronous Sync to Google Sheets web app if link is configured
  if (isSyncedToGoogle) {
    console.log("Triggering Google Sheets webhook sync for invoice:", newInvoice.id, "to URL:", activeLink);
    const syncPayload = {
      ...newInvoice,
      phone: (newInvoice.phone && String(newInvoice.phone).startsWith("0")) ? `'${newInvoice.phone}` : (newInvoice.phone || ""),
      createdAt: getEgyptTimeFormatted(newInvoice.createdAt)
    };
    try {
      const r = await fetch(activeLink, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(syncPayload),
        redirect: "follow"
      });
      const resText = await r.text();
      console.log("Google Sheets sync response status:", r.status, "Body:", resText);
      if (r.ok) {
        syncSuccess = true;
        newInvoice.isSynced = true;
      }
    } catch (err: any) {
      console.error("Failed to push invoice to Google Sheets:", err.message);
    }
  }

  invoices.unshift(newInvoice);
  try {
    saveData(INVOICES_FILE, invoices);
  } catch (e) {}

  res.json({
    ...newInvoice,
    _isSyncedWithGoogle: syncSuccess
  });
});

// Update Invoice & Sync with Google Sheets row matching
app.put("/api/invoices/:id", async (req, res) => {
  const { id } = req.params;
  const { customerName, address, phone, items, notes, shippingCost, excelSheetLink: clientExcelSheetLink } = req.body;

  const invoiceIndex = invoices.findIndex(inv => inv.id === id);
  if (invoiceIndex === -1) {
    return res.status(404).json({ error: "Invoice not found or deleted." });
  }

  const roundedItems = (items || []).map((it: any) => ({
    itemName: it.itemName || "Item Description",
    price: Number(it.price) || 0,
    quantity: Number(it.quantity) || 1,
    total: (Number(it.price) || 0) * (Number(it.quantity) || 1)
  }));

  const currentInvoice = invoices[invoiceIndex];
  const parsedShipping = shippingCost !== undefined ? (Number(shippingCost) || 0) : (currentInvoice.shippingCost || 0);
  const totalAmount = roundedItems.reduce((acc: number, item: any) => acc + item.total, 0) + parsedShipping;

  const activeLink = clientExcelSheetLink || excelSheetLink;
  const isSyncedToGoogle = !!(activeLink && activeLink.includes("script.google.com"));

  const updatedInvoice: Invoice = {
    ...currentInvoice,
    customerName: customerName || currentInvoice.customerName,
    address: address !== undefined ? address : currentInvoice.address,
    phone: phone !== undefined ? phone : currentInvoice.phone,
    items: roundedItems,
    notes: notes !== undefined ? notes : currentInvoice.notes,
    shippingCost: parsedShipping,
    isSynced: false, // will update below
    totalAmount
  };

  let syncSuccess = false;
  if (isSyncedToGoogle) {
    console.log("Triggering Google Sheets webhook UPDATE for invoice ID:", updatedInvoice.id, "to URL:", activeLink);
    const syncPayload = {
      ...updatedInvoice,
      phone: (updatedInvoice.phone && String(updatedInvoice.phone).startsWith("0")) ? `'${updatedInvoice.phone}` : (updatedInvoice.phone || ""),
      createdAt: getEgyptTimeFormatted(updatedInvoice.createdAt)
    };
    try {
      const r = await fetch(activeLink, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(syncPayload),
        redirect: "follow"
      });
      const resText = await r.text();
      console.log("Google Sheets UPDATE sync response status:", r.status, "Body:", resText);
      if (r.ok) {
        syncSuccess = true;
        updatedInvoice.isSynced = true;
      }
    } catch (err: any) {
      console.error("Failed to UPDATE invoice in Google Sheets:", err.message);
    }
  }

  invoices[invoiceIndex] = updatedInvoice;
  try {
    saveData(INVOICES_FILE, invoices);
  } catch (e) {}

  res.json({
    ...updatedInvoice,
    _isSyncedWithGoogle: syncSuccess
  });
});

// Delete Invoice & Sync with Google Sheets row matching
app.delete("/api/invoices/:id", async (req, res) => {
  const { id } = req.params;
  const clientExcelSheetLink = req.query.excelSheetLink as string;

  const invoiceIndex = invoices.findIndex(inv => inv.id === id);
  if (invoiceIndex === -1) {
    return res.status(404).json({ error: "Invoice not found or already deleted." });
  }

  const deletedInvoice = invoices[invoiceIndex];
  invoices.splice(invoiceIndex, 1);
  try {
    saveData(INVOICES_FILE, invoices);
  } catch (e) {}

  const activeLink = clientExcelSheetLink || excelSheetLink;
  const isSyncedToGoogle = !!(activeLink && activeLink.includes("script.google.com"));

  let syncSuccess = false;
  if (isSyncedToGoogle) {
    console.log("Triggering Google Sheets webhook DELETE for invoice ID:", id, "to URL:", activeLink);
    try {
      const r = await fetch(activeLink, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "delete", deleted: true }),
        redirect: "follow"
      });
      const resText = await r.text();
      console.log("Google Sheets DELETE sync response status:", r.status, "Body:", resText);
      if (r.ok) {
        syncSuccess = true;
      }
    } catch (err: any) {
      console.error("Failed to DELETE invoice in Google Sheets:", err.message);
    }
  }

  res.json({
    success: true,
    message: "Invoice deleted successfully",
    _isSyncedWithGoogle: syncSuccess
  });
});

// Bulk Delete Invoices (Local & sync in a single POST payload)
app.post("/api/invoices/bulk-delete", async (req, res) => {
  const { ids, excelSheetLink: clientExcelSheetLink } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "No invoice IDs provided." });
  }

  invoices = invoices.filter(inv => !ids.includes(inv.id));
  try {
    saveData(INVOICES_FILE, invoices);
  } catch (e) {}

  const activeLink = clientExcelSheetLink || excelSheetLink;
  const isSyncedToGoogle = !!(activeLink && activeLink.includes("script.google.com"));

  let syncSuccess = false;
  if (isSyncedToGoogle) {
    console.log(`Triggering Google Sheets bulk-delete Webhook for ${ids.length} records...`);
    try {
      const r = await fetch(activeLink, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", ids }),
        redirect: "follow"
      });
      const resText = await r.text();
      console.log("Google Sheets bulk-delete sync status:", r.status, "Body:", resText);
      if (r.ok) {
        syncSuccess = true;
      }
    } catch (err: any) {
      console.error("Failed to bulk DELETE invoices in Google Sheets:", err.message);
    }
  }

  res.json({
    success: true,
    count: ids.length,
    _isSyncedWithGoogle: syncSuccess
  });
});

// Bulk sync all existing invoices to Google Sheets
app.post("/api/sync-all", async (req, res) => {
  const { excelSheetLink: clientExcelSheetLink, invoices: clientInvoices } = req.body;
  const activeLink = clientExcelSheetLink || excelSheetLink;

  if (!activeLink || !activeLink.includes("script.google.com")) {
    return res.status(400).json({ error: "برجاء ربط شيت جوجل صالح أولاً (رابط Apps Script Web App)" });
  }

  const invoicesToSync = clientInvoices || invoices;
  if (invoicesToSync.length === 0) {
    return res.json({ success: true, count: 0, message: "لا توجد فواتير لإرسالها.", invoices: [] });
  }

  console.log(`Manual bulk sync triggered for ${invoicesToSync.length} invoices to: ${activeLink}`);
  let successCount = 0;
  let failCount = 0;
  let lastError = "";

  const updatedInvoices = invoicesToSync.map((inv: any) => ({ ...inv }));

  for (const inv of updatedInvoices) {
    try {
      const syncPayload = {
        ...inv,
        phone: (inv.phone && String(inv.phone).startsWith("0")) ? `'${inv.phone}` : (inv.phone || ""),
        createdAt: getEgyptTimeFormatted(inv.createdAt)
      };
      const r = await fetch(activeLink, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(syncPayload),
        redirect: "follow"
      });
      const text = await r.text();
      if (r.ok) {
        successCount++;
        inv.isSynced = true;
      } else {
        failCount++;
        lastError = `Status: ${r.status}, Body: ${text.substring(0, 100)}`;
      }
    } catch (err: any) {
      failCount++;
      lastError = err.message;
    }
  }

  if (successCount > 0) {
    invoices = updatedInvoices;
    try {
      saveData(INVOICES_FILE, invoices);
    } catch (e) {}
  }

  res.json({
    success: failCount === 0,
    count: successCount,
    failed: failCount,
    lastError: lastError || null,
    invoices: updatedInvoices
  });
});

// EXCEL FILES API
// Get list
app.get("/api/excel-files", (req, res) => {
  res.json(excelFiles);
});

// Simulate Excel upload
app.post("/api/excel-files/upload", (req, res) => {
  const { fileName, sizeBytes } = req.body;
  if (!fileName) {
    return res.status(400).json({ error: "File name is required" });
  }

  // Format size to MB readable
  const sizeMB = sizeBytes ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB` : "1.2 MB";

  const newExcel: ExcelFile = {
    id: `file_${Date.now()}`,
    name: fileName,
    uploadDate: new Date().toISOString(),
    size: sizeMB,
    status: fileName.endsWith(".xls") ? "failed" : "synced", // Fail if older .xls format to showcase error statuses
    recordsCount: Math.floor(Math.random() * 50) + 10
  };

  excelFiles.unshift(newExcel);
  saveData(EXCEL_FILES_FILE, excelFiles);
  res.json(newExcel);
});

// Delete excel file
app.delete("/api/excel-files/:id", (req, res) => {
  const { id } = req.params;
  excelFiles = excelFiles.filter(item => item.id !== id);
  saveData(EXCEL_FILES_FILE, excelFiles);
  res.json({ success: true });
});

// GET active Excel sheet link
app.get("/api/excel-link", (req, res) => {
  res.json({ link: excelSheetLink, viewLink: googleSheetViewLink });
});

// Endpoint to force native browser downloads for PDF/PNG images to bypass sandboxed iframe restrictions
app.post("/api/download-image", (req, res) => {
  const { imageDataUrl, fileName } = req.body;
  if (!imageDataUrl) {
    return res.status(400).send("محتوى الصورة غير صالح أو مفقود.");
  }

  try {
    // Strip metadata prefix if included
    const base64Data = imageDataUrl.replace(/^data:image\/png;base64,/, "");
    const imgBuffer = Buffer.from(base64Data, "base64");

    const safeFileName = fileName ? encodeURIComponent(fileName) : "invoice.png";

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${safeFileName}`);
    res.send(imgBuffer);
  } catch (error) {
    console.error("Error generating binary transfer response:", error);
    res.status(500).send("Error compiling image raw data.");
  }
});

// POST update the working Excel sheet link
app.post("/api/excel-link", (req, res) => {
  const { link, viewLink } = req.body;
  if (link !== undefined) excelSheetLink = link || "";
  if (viewLink !== undefined) googleSheetViewLink = viewLink || "";
  try {
    saveData(SETTINGS_FILE, { excelSheetLink, googleSheetViewLink });
  } catch (e) {}
  res.json({ success: true, link: excelSheetLink, viewLink: googleSheetViewLink });
});

// WIPE everything / reset to zero point
app.post("/api/reset", (req, res) => {
  invoices = [];
  excelFiles = [];
  excelSheetLink = "";
  googleSheetViewLink = "";
  try {
    saveData(INVOICES_FILE, []);
    saveData(EXCEL_FILES_FILE, []);
    saveData(SETTINGS_FILE, { excelSheetLink: "", googleSheetViewLink: "" });
  } catch (e) {}
  res.json({ success: true, message: "System state has been successfully reset to absolutely zero." });
});


// Vite middleware setup or index serving
const serveStaticOrVite = async () => {
  if (process.env.VERCEL) {
    // Under Vercel, static files are served by Vercel CDN directly as per vercel.json.
    // The serverless function should ONLY serve /api/* routes and must not handle static assets or listen to a port.
    console.log("Detected Vercel environment. Skipping Vite and static asset configuration in serverless function.");
    return;
  }

  if (!isProd) {
    console.log("Configuring Vite Development Server Middleware...");
    const viteModuleName = "vite";
    const { createServer: createViteServer } = await import(viteModuleName);
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Serving build assets in Production mode...");
    const distPath = (typeof __dirname !== "undefined") ? __dirname : path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n==================================================`);
    console.log(`🚀 Express server successfully initialized!`);
    console.log(`👉 Local:    http://localhost:${PORT}`);
    console.log(`👉 Network:  http://127.0.0.1:${PORT}`);
    console.log(`==================================================\n`);
  });
};

serveStaticOrVite();

export default app;
if (typeof module !== "undefined" && module.exports) {
  module.exports = app;
}
