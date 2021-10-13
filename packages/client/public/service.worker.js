/**
 * This service worker is used to hack together STDIN so that it will work
 * without SharedArrayBuffer. This means that our solutions can work
 * in more contexts and will work with Safari (as of Oct 2021 Safari has no
 * SharedArrayBuffer).
 *
 * The basic concept is that the worker sends a message to the host saying that
 * it wants STDIN. Then it waits for some fixed amount of time, then uses the
 * `importScripts` API to synchronously load a URL. The URL returns JavaScript
 * which sets a global value to be the result of the STDIN.
 *
 * If the STDIN hasn't yet been provided it repeats the process.
 *
 * Importantly this whole process has to block the thread, because the low level
 * file reading is all done synchronously. We can't let control return to the
 * WASM program until this work is complete.
 *
 * See: https://developer.mozilla.org/en-US/docs/Web/API/WorkerGlobalScope/importScripts
 * See: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
 *
 * The correct way to do this is with `Atomics.wait` but it only works in
 * certain contexts and can't be guaranteed.
 */

let lastStdin = null;

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener("fetch", async (event) => {
  const request = event.request;
  if (request.url.includes("runnoSTDIN")) {
    if (request.method === "POST") {
      event.respondWith(new Response());
      lastStdin = await request.text();
    } else if (request.method === "GET") {
      let code = `self.runnoSTDIN = null;`;
      if (lastStdin !== null) {
        code = `self.runnoSTDIN = ${JSON.stringify(lastStdin)};`;
      }
      const response = new Response(new Blob([code]), {
        headers: {
          "Content-Type": "application/javascript",
        },
      });
      event.respondWith(response);
      lastStdin = null;
    }
  }
});
