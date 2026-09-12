import { requireSession } from '@/lib/auth';
import { getDashboardStats } from '@/lib/dashboard';
import { jsonError, jsonOk } from '@/lib/http';

export async function GET() {
  try {
    await requireSession();
    const stats = await getDashboardStats();
    return jsonOk(stats);
  } catch (err) {
    return jsonError(err);
  }
}
