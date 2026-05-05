import { createClient } from '@supabase/supabase-js';

type AuditEventParams = {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  request?: Request;
};

const auditClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function getClientIp(request?: Request): string | null {
  if (!request) return null;
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || null;
  return request.headers.get('x-real-ip');
}

function redactSensitiveFields(value?: Record<string, unknown> | null) {
  if (!value) return null;
  const next = { ...value };
  delete next.password;
  delete next.token;
  delete next.auth;
  delete next.p256dh;
  return next;
}

export async function writeAuditLog(params: AuditEventParams) {
  try {
    await auditClient.from('audit_logs').insert({
      actor_user_id: params.actorUserId || null,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId || null,
      before_data: redactSensitiveFields(params.beforeData),
      after_data: redactSensitiveFields(params.afterData),
      metadata: params.metadata || {},
      ip_address: getClientIp(params.request),
      user_agent: params.request?.headers.get('user-agent') || null,
    });
  } catch (error) {
    console.error('[audit] write failed:', error);
  }
}
