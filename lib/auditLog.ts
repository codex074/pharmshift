import { createClient } from '@supabase/supabase-js';

type AuditEntry = {
  actorUserId?: string | null;
  actorName?: string | null;
  action: string;
  description: string;
  entityId?: string | null;
};

type PreparedAuditEntry = {
  actorUserId: string | null;
  actorName: string;
  action: string;
  description: string;
  entityId: string | null;
};

type AuditSchemaKind = 'simple' | 'legacy';

const auditClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

let schemaKindPromise: Promise<AuditSchemaKind> | null = null;

async function resolveActorName(actorUserId?: string | null, actorName?: string | null): Promise<string> {
  if (actorName) return actorName;
  if (!actorUserId) return 'ระบบ';

  const { data } = await auditClient
    .from('users')
    .select('f_name')
    .eq('id', actorUserId)
    .maybeSingle();

  if (!data) return 'ไม่ทราบผู้ใช้';
  return data.f_name || 'ไม่ทราบผู้ใช้';
}

async function detectAuditSchema(): Promise<AuditSchemaKind> {
  if (!schemaKindPromise) {
    schemaKindPromise = (async () => {
      const simpleProbe = await auditClient
        .from('audit_logs')
        .select('actor_name, description')
        .limit(1);

      if (!simpleProbe.error) return 'simple';

      const legacyProbe = await auditClient
        .from('audit_logs')
        .select('actor_snapshot, entity_type, metadata')
        .limit(1);

      if (!legacyProbe.error) return 'legacy';

      throw simpleProbe.error;
    })();
  }

  return schemaKindPromise;
}

async function prepareEntries(entries: AuditEntry[]): Promise<PreparedAuditEntry[]> {
  const actorNameCache = new Map<string, string>();

  return Promise.all(entries.map(async (entry) => {
    const cacheKey = `${entry.actorUserId || 'system'}:${entry.actorName || ''}`;
    let actorName = actorNameCache.get(cacheKey);
    if (!actorName) {
      actorName = await resolveActorName(entry.actorUserId, entry.actorName);
      actorNameCache.set(cacheKey, actorName);
    }

    return {
      actorUserId: entry.actorUserId || null,
      actorName,
      action: entry.action,
      description: entry.description,
      entityId: entry.entityId || null,
    };
  }));
}

async function insertSimple(rows: PreparedAuditEntry[]) {
  await auditClient.from('audit_logs').insert(
    rows.map((row) => ({
      actor_user_id: row.actorUserId,
      actor_name: row.actorName,
      action: row.action,
      description: row.description,
      entity_id: row.entityId,
    })),
  );
}

async function insertLegacy(rows: PreparedAuditEntry[]) {
  await auditClient.from('audit_logs').insert(
    rows.map((row) => ({
      actor_user_id: row.actorUserId,
      actor_snapshot: { f_name: row.actorName },
      action: row.action,
      entity_type: 'manual_audit',
      entity_id: null,
      before_data: null,
      after_data: null,
      metadata: { description: row.description },
    })),
  );
}

export async function writeAuditLog(entry: AuditEntry) {
  await writeAuditLogs([entry]);
}

export async function writeAuditLogs(entries: AuditEntry[]) {
  try {
    if (!entries.length) return;

    const prepared = await prepareEntries(entries);
    const schemaKind = await detectAuditSchema();

    if (schemaKind === 'simple') {
      await insertSimple(prepared);
      return;
    }

    await insertLegacy(prepared);
  } catch (error) {
    console.error('[audit] write failed:', error);
  }
}
