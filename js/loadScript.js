/** Load a classic (UMD) script once; resolves when it has executed. */
const pending = new Map();

export function loadScript(src) {
  if (!pending.has(src)) {
    pending.set(src, new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.append(script);
    }));
  }
  return pending.get(src);
}
