import { Pool } from "pg";

const password = process.env.DEMO_PASSWORD;
if (!password || password.length < 8 || password.length > 30) {
  throw new Error("Set DEMO_PASSWORD to 8-30 characters");
}
const base = process.env.DEMO_API_URL || "http://localhost:3000";
const pool = new Pool({
  host: process.env.IN_CONTAINER ? "postgres" : "localhost",
  port: Number(process.env.IN_CONTAINER ? 5432 : 5252),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
});
const people = [
  { name: "DemoUser", role: "user", mature: false },
  { name: "DemoReader", role: "user", mature: true },
  { name: "DemoOperator", role: "operator", mature: false },
  { name: "DemoAdmin", role: "admin", mature: false },
  { name: "DemoSuper", role: "superAdmin", mature: true },
];
try {
  const types = await pool.query('SELECT type_id FROM public.issue_types ORDER BY type_id LIMIT 1');
  if (!types.rows.length) throw new Error("Apply migrations and issue types first");
  for (const person of people) {
    const email = person.name.toLowerCase() + "@example.invalid";
    const existing = await pool.query('SELECT id FROM auth."user" WHERE email=$1', [email]);
    const response = await fetch(base + (existing.rows.length ? "/auth/sign-in/email" : "/auth/sign-up/email"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: person.name, email, password }),
    });
    if (!response.ok) throw new Error("Demo account operation failed: " + person.name);
    const cookie = response.headers.getSetCookie().map(x => x.split(";")[0]).join("; ");
    const account = await pool.query('SELECT id FROM auth."user" WHERE email=$1', [email]);
    const id = account.rows[0]?.id;
    if (!id || !cookie) throw new Error("Demo session missing");
    await pool.query('UPDATE auth."user" SET role=$2,mature_content_access=$3 WHERE id=$1', [id, person.role, person.mature]);
    if (person.role !== "user") continue;
    for (const [index, name] of ["На валидации", "В обработке", "В работе", "Выполнена", "Отклонена"].entries()) {
      const description = person.name + ": " + name;
      const exists = await pool.query('SELECT issue_id FROM public.issues WHERE user_id=$1 AND short_description=$2', [id, description]);
      if (exists.rows.length) continue;
      const form = new FormData();
      for (const [key, value] of Object.entries({ latitude: String(59.93 + index / 1000), longitude: String(30.31 + index / 1000), typeId: String(types.rows[0].type_id), shortDescription: description, address: "Демонстрационный адрес " + (index + 1) })) form.set(key, value);
      const created = await fetch(base + "/reports", { method: "POST", headers: { Cookie: cookie }, body: form });
      if (created.status !== 201) throw new Error("Demo issue creation failed");
      const issue = await created.json() as { issueId: number };
      const status = await pool.query('SELECT status_id FROM public.issue_statuses WHERE name=$1', [name]);
      await pool.query('UPDATE public.issues SET status_id=$2,mature_content=$3 WHERE issue_id=$1', [issue.issueId, status.rows[0].status_id, index === 1]);
      if (name === "Отклонена") await pool.query('UPDATE auth."user" SET points=GREATEST(points-1,0) WHERE id=$1', [id]);
    }
  }
  console.log("Demo accounts and issues prepared");
} finally { await pool.end(); }
