// Shared by the in-app WebView (inlined by build-pdf-html.mjs) and the Node
// fixture dumper, so tests run against exactly what the phone extracts.
// Plain ES2017, no imports: it must run as a classic <script>.
(function (root) {
  function round(n) {
    return Math.round(n * 100) / 100;
  }

  /**
   * @returns {Promise<{ok: true, pages: Array}|{ok: false, password: 'needed'|'incorrect'}|{ok: false, error: string}>}
   */
  async function extractPdfItems(pdfjsLib, data, password) {
    let doc;
    try {
      doc = await pdfjsLib.getDocument({ data: data, password: password || undefined, isEvalSupported: false, verbosity: 0 })
        .promise;
    } catch (e) {
      if (e && e.name === 'PasswordException') {
        // pdfjsLib.PasswordResponses: NEED_PASSWORD = 1, INCORRECT_PASSWORD = 2
        return { ok: false, password: e.code === 2 ? 'incorrect' : 'needed' };
      }
      return { ok: false, error: String((e && e.message) || e) };
    }
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push({
        page: n,
        items: content.items
          .filter(function (it) {
            return typeof it.str === 'string' && it.str.trim() !== '';
          })
          .map(function (it) {
            return { str: it.str, x: round(it.transform[4]), y: round(it.transform[5]), w: round(it.width) };
          }),
      });
    }
    await doc.destroy();
    return { ok: true, pages: pages };
  }

  root.extractPdfItems = extractPdfItems;
  if (typeof module !== 'undefined') module.exports = { extractPdfItems: extractPdfItems };
})(typeof window !== 'undefined' ? window : globalThis);
