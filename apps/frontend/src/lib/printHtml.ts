// Prints a standalone HTML document through a hidden iframe, so the print dialog
// opens over the current page instead of a new window (Servio runs as an installed PWA).
export function printHtml(html: string) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) { iframe.remove(); return; }

  doc.open();
  doc.write(html);
  doc.close();

  const cleanup = () => setTimeout(() => iframe.remove(), 500);
  win.addEventListener('afterprint', cleanup, { once: true });
  // Small delay so images/fonts in the document can load before printing
  setTimeout(() => {
    win.focus();
    win.print();
    // Fallback for browsers that don't fire afterprint on iframes
    setTimeout(() => { if (iframe.isConnected) iframe.remove(); }, 60_000);
  }, 300);
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
