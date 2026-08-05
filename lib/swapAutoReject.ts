import { sendPushToUsers } from '@/lib/pushSender';
import { fmtShift } from '@/lib/swapCollision';

/**
 * Notifies participants of swap_requests that got auto-rejected as a side
 * effect of another request touching the same shift(s) — but only those not
 * already involved in (and separately notified about) the completed request.
 */
export async function notifyAutoRejected(
  supa: any,
  autoRejectedIds: string[],
  involvedUserIds: string[],
  contextShift: any,
) {
  if (!autoRejectedIds.length) return;

  const { data: otherPending } = await supa
    .from('swap_requests')
    .select('id, requester_id, target_user_id')
    .in('id', autoRejectedIds);

  const involvedSet = new Set(involvedUserIds);
  const notifyIds: string[] = Array.from(
    new Set(
      (otherPending || [])
        .flatMap((r: any) => [r.requester_id, r.target_user_id] as string[])
        .filter((id: string) => !involvedSet.has(id))
    )
  );

  if (!notifyIds.length) return;

  const title = '⚠️ คำขอถูกยกเลิกอัตโนมัติ';
  const body = `${fmtShift(contextShift)} ถูกดำเนินการโดยผู้อื่นแล้ว คำขอของคุณจึงถูกยกเลิก`;

  sendPushToUsers(notifyIds, {
    title, body, url: '/calendar', tag: `swap-auto-cancel-${contextShift?.id || ''}`,
  }).catch(() => {});

  await supa.from('notifications').insert(
    notifyIds.map((uid: string) => ({
      user_id: uid, type: 'swap_result', title, body, url: '/calendar',
    }))
  );
}
