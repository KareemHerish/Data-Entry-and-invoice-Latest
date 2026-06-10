import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Automated CSS Sanitization to eliminate oklch and oklab before headless runtimes/capturers crash
try {
  const sanitizeStyleElement = (el: HTMLStyleElement) => {
    if ((el as any)._sanitized) return;
    const originalText = el.textContent || "";
    if (/oklch|oklab/i.test(originalText)) {
      const sanitizedText = originalText
        .replace(/oklch\s*\([^)]*\)/gi, "rgb(10, 88, 202)")
        .replace(/oklab\s*\([^)]*\)/gi, "rgb(120, 120, 120)");
      el.textContent = sanitizedText;
    }
    (el as any)._sanitized = true;
  };

  const runSanitizer = () => {
    const styleTags = document.querySelectorAll("style");
    styleTags.forEach(tag => sanitizeStyleElement(tag as HTMLStyleElement));
  };

  runSanitizer();
  setTimeout(runSanitizer, 0);
  setTimeout(runSanitizer, 100);
  setTimeout(runSanitizer, 500);

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeName === "STYLE") {
          sanitizeStyleElement(node as HTMLStyleElement);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const subStyleTags = (node as Element).querySelectorAll("style");
          subStyleTags.forEach(tag => sanitizeStyleElement(tag as HTMLStyleElement));
        }
      });
    });
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
} catch (e) {
  console.error("Global CSS oklch sanitizer failed:", e);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
