export async function requestWithTimeout(runtime, message, timeoutMs = 10000) {
  let timer;
  try {
    return await Promise.race([
      runtime.sendMessage(message),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(
          'The browser is taking too long to apply this change. The rule may already be saved. Reopen the popup to check its status.'
        )), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
