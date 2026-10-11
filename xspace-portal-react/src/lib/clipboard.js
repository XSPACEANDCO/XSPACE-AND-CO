/* Copy text to the clipboard, wherever the portal is running.

   navigator.clipboard only exists in a secure context — HTTPS or localhost.
   The Android app talking to a backend over the local network
   (http://192.168.x.x) is neither, so there it is simply undefined and the
   old `navigator.clipboard?.writeText(...)` silently did nothing. The
   fallback selects the text in an off-screen textarea and uses execCommand,
   which the Android WebView still honours on plain HTTP.

   Resolves true when the text was copied, false when nothing worked. */
export async function copyText(text) {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* Permission refused — fall through to the legacy path. */
    }
  }

  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  /* Off-screen, and 16px so iOS does not zoom the page to focus it. */
  area.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;font-size:16px;';
  document.body.appendChild(area);
  area.select();
  area.setSelectionRange(0, text.length);
  let ok;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(area);
  return ok;
}
