export function urlKey(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    return (u.origin + u.pathname).replace(/\/+$/, "");
  } catch {
    return urlStr;
  }
}

export function originKey(urlStr: string): string {
  try {
    return new URL(urlStr).origin;
  } catch {
    return urlStr;
  }
}
