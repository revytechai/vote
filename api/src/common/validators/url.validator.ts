import { BadRequestException } from '@nestjs/common';

/**
 * Validates that a string is a valid URL and uses the https: protocol only.
 * Explicitly rejects http:, javascript:, data:, ftp:, file:, or any other scheme.
 */
export function validateHttpsUrl(rawUrl: string): boolean {
  if (typeof rawUrl !== 'string') {
    return false;
  }
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function assertHttpsUrl(rawUrl: string, fieldName = 'URL'): void {
  if (!validateHttpsUrl(rawUrl)) {
    throw new BadRequestException(
      `${fieldName} must be a valid URL with the https: protocol only (got "${rawUrl}")`,
    );
  }
}
