/**
 * Получает document для работы с DOM
 * В dev-режиме проверяет iframe с id="site-iframe"
 * В production возвращает основной document
 */
export function getDocument(): Document | null {
  // Dev-режим: проверяем iframe
  const iframe = document.getElementById("site-iframe") as HTMLIFrameElement | null;
  if (iframe) {
    try {
      return iframe.contentDocument || iframe.contentWindow?.document || null;
    } catch {
      return null;
    }
  }
  return document;
}
