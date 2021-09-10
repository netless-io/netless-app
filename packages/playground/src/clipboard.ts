export async function copyToClipboard(textToCopy: string): Promise<void> {
  try {
    return await window.navigator.clipboard?.writeText(textToCopy);
  } catch {
    const textArea = document.createElement("textarea");
    textArea.value = textToCopy;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const success = document.execCommand("copy");
    textArea.remove();
    return success ? Promise.resolve() : Promise.reject();
  }
}
