import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Response } from 'express';

export class DomainException extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly ticket?: string,
  ) {
    super(code);
  }
}

@Catch(DomainException)
export class DomainFilter implements ExceptionFilter {
  catch(exception: DomainException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    response.status(exception.status).json({
      code: exception.code,
      ...(exception.ticket ? { ticket: exception.ticket } : {}),
    });
  }
}

export function mapDbError(error: unknown): never {
  const err = error as { code?: string; constraint?: string; message?: string };
  if (err.constraint === 'app_user_email_key') {
    throw new DomainException('email_taken', 422);
  }
  if (err.constraint === 'campaign_store_https') {
    throw new DomainException('store_url_invalid', 422);
  }
  if (err.constraint === 'campaign_slug_format') {
    throw new DomainException('slug_invalid', 422);
  }
  if (err.constraint === 'campaign_slug_key') {
    throw new DomainException('slug_taken', 422);
  }
  if (err.constraint === 'campaign_dates' || err.constraint === 'ad_spend_period') {
    throw new DomainException('dates_invalid', 422);
  }
  if (err.constraint === 'campaign_electoral_needs_policy') {
    throw new DomainException('electoral_without_policy', 422);
  }
  if (err.constraint === 'external_identity_provider_subject_key' || err.constraint === 'external_identity_user_id_provider_key') {
    throw new DomainException('subject_taken', 422);
  }
  if (err.code === '42501') {
    throw new DomainException('forbidden', 403);
  }
  if (err.message?.includes('slug is locked')) {
    throw new DomainException('slug_locked', 422);
  }
  if (err.message?.includes('donation page')) {
    throw new DomainException('commercial_has_no_donation_page', 422);
  }
  if (err.message?.includes('closed ad spend')) {
    throw new DomainException('spend_invalid', 422);
  }
  if (err.code === '23503' && err.constraint?.includes('network')) {
    throw new DomainException('network_unavailable', 422);
  }
  throw error;
}
