/**
 * Creates (or resets the password of) an admin user. Run it yourself in a terminal:
 *   npm run admin:create
 * The password is typed into the terminal (hidden) and stored only as an argon2id hash.
 * The first admin created becomes the owner; later ones are staff.
 */
import { createInterface } from 'node:readline';
import { count, eq } from 'drizzle-orm';
import { getDb, getSql } from '../src/server/db/client';
import { adminUsers } from '../src/server/db/schema';
import { hashPassword } from '../src/server/auth/password';

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      const out = rl as unknown as { _writeToOutput: (s: string) => void };
      const write = out._writeToOutput.bind(rl);
      out._writeToOutput = (s: string) => {
        if (s.startsWith(question)) write(question);
        else if (s.includes('\n') || s.includes('\r')) write('\n');
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

const email = (await ask('Admin email: ')).toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('That does not look like an email address.');
const name = (await ask('Name: ')) || email.split('@')[0];
const password = await ask('Password (at least 10 characters): ', true);
if (password.length < 10) throw new Error('Use at least 10 characters.');
if ((await ask('Repeat password: ', true)) !== password) throw new Error('Passwords do not match.');

const db = getDb();
const passwordHash = await hashPassword(password);
const [existing] = await db.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.email, email));
if (existing) {
  await db.update(adminUsers).set({ passwordHash, name, isActive: true }).where(eq(adminUsers.id, existing.id));
  console.log(`✓ Updated ${email}.`);
} else {
  const [{ n }] = await db.select({ n: count() }).from(adminUsers);
  const role = n === 0 ? 'owner' : 'staff';
  await db.insert(adminUsers).values({ email, name, passwordHash, role });
  console.log(`✓ Created ${email} (${role}). Sign in at /admin.`);
}
await getSql().end();
