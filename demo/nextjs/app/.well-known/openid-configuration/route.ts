import { auth } from '@/lib/auth'

export async function GET() {
  return auth.api.getOpenIdConfig({
    asResponse: true,
  });
}
