type AuditClientEvent = {
  action: string;
  description: string;
  entityId?: string | null;
};

export async function postAuditLog(event: AuditClientEvent) {
  return postAuditLogs([event]);
}

export async function postAuditLogs(events: AuditClientEvent[]) {
  if (!events.length) return;

  try {
    await fetch('/api/audit-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
    });
  } catch (error) {
    console.error('[audit] client write failed:', error);
  }
}
