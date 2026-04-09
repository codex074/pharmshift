export function isMobileUserAgent(userAgent?: string | null): boolean {
  if (!userAgent) return false;

  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet|Silk|Kindle/i.test(
    userAgent
  );
}
