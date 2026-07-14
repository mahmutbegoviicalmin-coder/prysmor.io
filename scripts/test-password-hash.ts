import { hashPassword, verifyPassword, validatePassword } from '../lib/auth/password';

async function main() {
  console.log('short', validatePassword('short'));
  const h = await hashPassword('correcthorse');
  console.log({
    ok: await verifyPassword('correcthorse', h),
    no: await verifyPassword('wrong', h),
    prefix: h.slice(0, 24),
  });
}

main();
