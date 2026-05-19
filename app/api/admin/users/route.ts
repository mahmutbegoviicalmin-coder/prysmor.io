import { currentUser, clerkClient } from '@clerk/nextjs/server';
import { NextResponse }              from 'next/server';
import { db }                        from '@/lib/firebaseAdmin';
import { PLAN_LABELS, PLAN_CREDITS } from '@/lib/firestore/users';

const ADMIN_EMAILS = ['mahmutbegoviic.almin@gmail.com'];

export interface AdminUser {
  id:               string;
  email:            string;
  displayName:      string;
  firstName:        string;
  lastName:         string;
  plan:             string;
  planLabel:        string;
  licenseStatus:    string;
  credits:          number;
  creditsTotal:     number;
  renewalDate:      string | null;
  deviceLimit:      number;
  createdAt:        string | null;
  lastSignInAt:     string | null;
  country:          string | null;
  countryCode:      string | null;
  lsSubscriptionId?: string;
}

// country name → ISO-2 code
const NAME_TO_CODE: Record<string, string> = {
  "afghanistan":"AF","albania":"AL","algeria":"DZ","argentina":"AR","armenia":"AM",
  "australia":"AU","austria":"AT","azerbaijan":"AZ","bahrain":"BH","bangladesh":"BD",
  "belarus":"BY","belgium":"BE","belize":"BZ","bolivia":"BO","bosnia and herzegovina":"BA",
  "botswana":"BW","brazil":"BR","bulgaria":"BG","cambodia":"KH","cameroon":"CM",
  "canada":"CA","chile":"CL","china":"CN","colombia":"CO","congo (drc)":"CD",
  "costa rica":"CR","croatia":"HR","cuba":"CU","cyprus":"CY","czech republic":"CZ",
  "czechia":"CZ","denmark":"DK","dominican republic":"DO","ecuador":"EC","egypt":"EG",
  "el salvador":"SV","estonia":"EE","ethiopia":"ET","finland":"FI","france":"FR",
  "georgia":"GE","germany":"DE","ghana":"GH","greece":"GR","guatemala":"GT",
  "honduras":"HN","hong kong":"HK","hungary":"HU","india":"IN","indonesia":"ID",
  "iran":"IR","iraq":"IQ","ireland":"IE","israel":"IL","italy":"IT","jamaica":"JM",
  "japan":"JP","jordan":"JO","kazakhstan":"KZ","kenya":"KE","kuwait":"KW",
  "latvia":"LV","lebanon":"LB","lithuania":"LT","luxembourg":"LU","malaysia":"MY",
  "mexico":"MX","moldova":"MD","morocco":"MA","mozambique":"MZ","myanmar":"MM",
  "nepal":"NP","netherlands":"NL","new zealand":"NZ","nicaragua":"NI","nigeria":"NG",
  "north korea":"KP","north macedonia":"MK","norway":"NO","oman":"OM","pakistan":"PK",
  "palestine":"PS","panama":"PA","paraguay":"PY","peru":"PE","philippines":"PH",
  "poland":"PL","portugal":"PT","qatar":"QA","romania":"RO","russia":"RU",
  "saudi arabia":"SA","senegal":"SN","serbia":"RS","singapore":"SG","slovakia":"SK",
  "slovenia":"SI","south africa":"ZA","south korea":"KR","spain":"ES","sri lanka":"LK",
  "sudan":"SD","sweden":"SE","switzerland":"CH","syria":"SY","taiwan":"TW",
  "tanzania":"TZ","thailand":"TH","tunisia":"TN","turkey":"TR","uganda":"UG",
  "ukraine":"UA","united arab emirates":"AE","united kingdom":"GB","united states":"US",
  "uruguay":"UY","uzbekistan":"UZ","venezuela":"VE","vietnam":"VN","yemen":"YE",
  "zambia":"ZM","zimbabwe":"ZW",
};

function countryNameToCode(name: string): string | null {
  return NAME_TO_CODE[name.toLowerCase().trim()] ?? null;
}

export async function GET() {
  const user  = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress ?? '';
  if (!ADMIN_EMAILS.includes(email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch Firestore docs + Clerk users in parallel
  const [snap, clerkRes] = await Promise.all([
    db.collection('users').limit(500).get(),
    clerkClient.users.getUserList({ limit: 500 }).catch(() => ({ data: [] })),
  ]);

  type ClerkUserShape = {
    id: string;
    firstName: string | null;
    lastName: string | null;
    emailAddresses: { emailAddress: string }[];
    lastSignInAt: number | null;
    createdAt: number;
  };

  const rawList = Array.isArray(clerkRes) ? clerkRes : ((clerkRes as { data: unknown[] }).data ?? []);
  const clerkUserList = rawList as ClerkUserShape[];

  // Build Firestore lookup map
  const fsMap = new Map<string, FirebaseFirestore.DocumentData>();
  for (const doc of snap.docs) {
    fsMap.set(doc.id, doc.data());
  }

  // Build user list — country comes from Firestore cache only.
  // Per-user country refresh is available via the "Refresh location" action in the admin panel.
  // Bulk Clerk session fetching was removed because it caused route timeouts with large user lists.
  const users: AdminUser[] = clerkUserList.map((cu) => {
    const d = fsMap.get(cu.id) ?? {};

    const plan         = d.plan ?? 'unpaid';
    const planCap      = PLAN_CREDITS[plan] ?? PLAN_CREDITS.starter;
    const credits      = typeof d.credits      === 'number' ? d.credits      : 0;
    const creditsTotal = typeof d.creditsTotal === 'number' ? d.creditsTotal : planCap;

    let createdAt: string | null = null;
    if (d.createdAt?.toDate)              createdAt = d.createdAt.toDate().toISOString();
    else if (d.createdAt instanceof Date) createdAt = d.createdAt.toISOString();
    else if (cu.createdAt)               createdAt = new Date(cu.createdAt).toISOString();

    const firstName     = cu.firstName ?? d.firstName ?? '';
    const lastName      = cu.lastName  ?? d.lastName  ?? '';
    const clerkEmail    = cu.emailAddresses?.[0]?.emailAddress ?? '';
    const resolvedEmail = clerkEmail || d.userEmail || d.email || '';

    const displayName = (firstName || lastName)
      ? [firstName, lastName].filter(Boolean).join(' ')
      : (d.displayName ?? resolvedEmail.split('@')[0] ?? '');

    const lastSignInAt = cu.lastSignInAt ? new Date(cu.lastSignInAt).toISOString() : null;

    return {
      id:               cu.id,
      email:            resolvedEmail,
      displayName,
      firstName,
      lastName,
      plan,
      planLabel:        PLAN_LABELS[plan] ?? plan,
      licenseStatus:    d.licenseStatus  ?? 'inactive',
      credits,
      creditsTotal,
      renewalDate:      d.renewalDate    ?? null,
      deviceLimit:      d.deviceLimit    ?? 1,
      createdAt,
      lastSignInAt,
      country:          d.country     ?? null,
      countryCode:      d.countryCode ?? null,
      lsSubscriptionId: d.lsSubscriptionId,
    };
  });

  users.sort((a, b) => {
    if (!a.createdAt) return 1;
    if (!b.createdAt) return -1;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return NextResponse.json({ users });
}

/** DELETE /api/admin/users — purge all Firestore users with no Clerk account */
export async function DELETE() {
  const user  = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress ?? '';
  if (!ADMIN_EMAILS.includes(email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [snap, clerkUsersRes] = await Promise.all([
    db.collection('users').get(),
    clerkClient.users.getUserList({ limit: 500 }).catch(() => ({ data: [] })),
  ]);

  const clerkUsers = Array.isArray(clerkUsersRes) ? clerkUsersRes : (clerkUsersRes as { data: { id: string }[] }).data ?? [];
  const clerkIds = new Set(clerkUsers.map((cu: { id: string }) => cu.id));

  const orphans = snap.docs.filter(doc => !clerkIds.has(doc.id));

  if (orphans.length === 0) {
    return NextResponse.json({ deleted: 0, message: 'No orphaned users found.' });
  }

  // Delete in batches of 500
  const batch = db.batch();
  for (const doc of orphans) {
    batch.delete(doc.ref);
  }
  await batch.commit();

  console.log(`[admin] Purged ${orphans.length} orphaned Firestore users`);
  return NextResponse.json({ deleted: orphans.length, message: `Deleted ${orphans.length} orphaned user(s).` });
}
