export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { clearSession, getSession } from '@/lib/session';
import { writeAuditLog } from '@/lib/auditLog';

export async function POST(request: Request) {
  const session = await getSession();
  if (session?.id) {
    await writeAuditLog({
      actorUserId: session.id,
      action: 'logout',
      entityType: 'auth',
      entityId: session.id,
      metadata: { pha_id: session.pha_id, role: session.role },
      request,
    });
  }
  await clearSession();
  return NextResponse.json({ success: true });
}
