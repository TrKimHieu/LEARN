process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export async function safeFetch(url, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      return res;
    } catch (err) {
      lastError = err;
      await new Promise(r => setTimeout(r, 800));
    }
  }
  throw lastError;
}
