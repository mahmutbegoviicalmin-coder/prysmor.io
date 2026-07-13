/** Search LemonSqueezy subscriptions by email. */
import * as fs from "fs";
import * as path from "path";

const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "").replace(/\\n/g, "\n");
    }
  }
}

const emailNeedle = (process.argv[2] ?? "fatirustemi@gmail.com").toLowerCase();
const key = process.env.LEMONSQUEEZY_API_KEY;
if (!key) throw new Error("LEMONSQUEEZY_API_KEY missing");

async function lsGet(url: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/vnd.api+json" },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  let page = 1;
  let found = 0;
  while (page <= 10) {
    const json = await lsGet(
      `https://api.lemonsqueezy.com/v1/subscriptions?filter[store_id]=216284&page[number]=${page}&page[size]=100`
    );
    for (const sub of json.data ?? []) {
      const a = sub.attributes;
      const em = String(a.user_email ?? "").toLowerCase();
      if (!em.includes(emailNeedle.split("@")[0])) continue;
      if (!em.includes(emailNeedle) && !em.includes("rustemi")) continue;
      found++;
      console.log(JSON.stringify({
        id: sub.id,
        email: a.user_email,
        name: a.user_name,
        status: a.status,
        variant_id: a.variant_id,
        renews_at: a.renews_at,
        ends_at: a.ends_at,
        cancelled: a.cancelled,
        created_at: a.created_at,
        updated_at: a.updated_at,
      }, null, 2));
    }
    if (!json.links?.next) break;
    page++;
  }
  console.log(`\nMatches: ${found}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
