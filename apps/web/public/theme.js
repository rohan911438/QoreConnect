/* global document, localStorage */
/* Applies the saved theme before paint (no flash). Same-origin file so the CSP needs no inline script. */
try {
  var t = localStorage.getItem('qc-theme')
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t
} catch {
  /* storage unavailable */
}
