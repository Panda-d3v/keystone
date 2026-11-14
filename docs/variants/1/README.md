# Console review captures

Captured from the actual Keystone in-app browser preview on 2026-11-14. Six desktop captures use a 1200 CSS-pixel viewport; six mobile captures use 375 CSS pixels. The temporary browser viewport override was reset after review. Captures show fixture data; document/send interactions are not implemented in this foundation PR.

All six mobile routes were checked for page overflow: `document.documentElement.scrollWidth === innerWidth === 375`. Tables and navigation scroll within their own panels. Browser review also exercised PO filtering and its details panel, and checked light/dark theme contrast. Fixed the mobile grid minimum-width issue and dark-theme inherited text color discovered during review.

The images are viewport captures, not full-document exports. Next.js development indicators may appear in the captures.
