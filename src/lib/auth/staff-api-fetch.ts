import { supabaseClient } from "../supabase/client";

const staffApiPath =
  /^\/api\/(?:admin(?:\/|$)|tickets\/(?:validate|checkin|stats)(?:\/|$)|notifications\/(?:whatsapp|email|reminder-24h|preview)(?:\/|$))/;

let installed = false;

export function installStaffApiFetch() {
  const client = supabaseClient;
  if (installed || typeof window === "undefined" || !client) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const requestUrl =
      typeof input === "string" || input instanceof URL
        ? input.toString()
        : input instanceof Request
          ? input.url
          : "";

    if (requestUrl) {
      const url = new URL(requestUrl, window.location.href);
      if (url.origin === window.location.origin && staffApiPath.test(url.pathname)) {
        const {
          data: { session },
        } = await client.auth.getSession();
        if (session?.access_token) {
          const headers = new Headers(input instanceof Request ? input.headers : undefined);
          if (init?.headers)
            new Headers(init.headers).forEach((value, key) => headers.set(key, value));
          headers.set("Authorization", `Bearer ${session.access_token}`);
          return originalFetch(input, { ...init, headers });
        }
      }
    }
    return originalFetch(input, init);
  };
}
