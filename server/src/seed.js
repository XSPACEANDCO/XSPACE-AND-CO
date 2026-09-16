import { one, query, transaction } from './db.js';
import { hashPassword } from './auth.js';
import { config } from './config.js';

/* Demo data matching the frontend's localStorage seed, so the two behave the
   same while pages are being migrated.

   Idempotent by design: it checks for an existing user first and does nothing
   if the table is populated. A redeploy must never overwrite real records. */
export async function seed({ force = false } = {}) {
  const existing = await one('SELECT COUNT(*)::int AS n FROM users');
  if (existing.n > 0 && !force) {
    console.log(`[seed] skipped, ${existing.n} users already present`);
    return;
  }

  const hash = await hashPassword(config.seedPassword);

  await transaction(async (client) => {
    const users = [
      ['u1', 'Tej (Founder)', 'tej@xspace.co', 'tej', 'founder', null, null, null, null, 'verified'],
      ['u2', 'Karthik (Core)', 'karthik@xspace.co', 'karthik', 'core', null, null, null, null, 'verified'],
      ['u3', 'Sai (Realtor Partner)', 'sai@xspace.co', 'sai', 'realtor', 'Tellapur, Nallagandla', null, null, null, 'verified'],
      ['u4', 'Priya (Creator Partner)', 'priya@xspace.co', 'priya', 'creator', null, 'Instagram', '@priya.realty', null, 'verified'],
      ['u5', 'Xspace Studio', 'studio@xspace.co', 'studio', 'studio', null, null, null, 'Edit / VR', 'pending'],
    ];
    for (const [id, name, email, username, role, areas, platform, handle, skill, kyc] of users) {
      await client.query(
        `INSERT INTO users (id, name, email, username, password_hash, role, areas, platform, handle, skill, kyc_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING`,
        [id, name, email, username, hash, role, areas, platform, handle, skill, kyc]
      );
    }

    await client.query(
      `INSERT INTO projects (id, name, builder, rera, status, units, possession) VALUES
        ('p1','MyHome Avatar','MyHome','P02200002975','Under Construction',500,'Dec 2027'),
        ('p2','Vasavi Skyla','Vasavi','P022000XXXXX','Ready',120,'Ready to move')
       ON CONFLICT (id) DO NOTHING`
    );

    await client.query(
      `INSERT INTO listings (id, title, project_id, area, price, unit_type, status, verified, assigned_to, submitted_by) VALUES
        ('l1','2BHK Tellapur','p1','Tellapur','1.15 Cr','2BHK','Available',FALSE,'u3','u3'),
        ('l2','3BHK Nallagandla','p2','Nallagandla','1.9 Cr','3BHK','Ready',TRUE,'u3','u3')
       ON CONFLICT (id) DO NOTHING`
    );

    await client.query(
      `INSERT INTO leads (id, name, phone, source, budget, status, temperature, assigned_to, created_by, listing_id, created_at) VALUES
        ('c1','Ramesh','9000000001','Instagram','1.5 Cr','Discovery','hot','u3','u4','l1', now() - interval '1 hour'),
        ('c2','Sita','9000000002','Referral','2 Cr','Engaged','warm','u3','u3','l2', now() - interval '1 day'),
        ('c3','Rahul','9000000003','Website','1.1 Cr','Site Visit','cold','u3','u3','l1', now() - interval '2 hours'),
        ('c4','Anita','9000000004','Referral','2.5 Cr','Closed','hot','u3','u4','l2', now() - interval '5 days')
       ON CONFLICT (id) DO NOTHING`
    );

    await client.query(
      `INSERT INTO visits (id, lead_id, listing_id, assigned_to, scheduled_at, ended_at, feedback_submitted_at, status, mode) VALUES
        ('v1','c1','l1','u3', now() - interval '1 day', now() - interval '23 hours', now() - interval '22 hours','Completed','On-site'),
        ('v2','c2','l2','u3', now() - interval '2 days', now() - interval '47 hours', now() - interval '46 hours','Completed','VR'),
        ('v3','c3','l1','u3', now() + interval '6 hours', NULL, NULL,'Scheduled','On-site')
       ON CONFLICT (id) DO NOTHING`
    );

    await client.query(
      `INSERT INTO verifications (id, listing_id, project_id, type, status, assigned_to, notes, created_at, started_at, finished_at) VALUES
        ('vf1','l1','p1','Listing','pending',NULL,'Price check pending', now() - interval '6 hours', NULL, NULL),
        ('vf2','l2','p2','Project','inprogress','u2','Verifying RERA', now() - interval '12 hours', now() - interval '11 hours', NULL),
        ('vf3','l2','p2','Project','verified','u2','OK', now() - interval '48 hours', now() - interval '47 hours', now() - interval '46 hours')
       ON CONFLICT (id) DO NOTHING`
    );

    await client.query(
      `INSERT INTO tickets (id, title, description, category, priority, status, raised_by, created_at) VALUES
        ('t1','Price mismatch for 2BHK Tellapur','Listed price differs from builder sheet','listing','high','open','u3', now() - interval '5 hours'),
        ('t2','Need RERA docs for MyHome Avatar','Client asked for the certificate','legal','medium','open','u2', now() - interval '1 day')
       ON CONFLICT (id) DO NOTHING`
    );

    await client.query(
      `INSERT INTO commissions (id, user_id, deal_ref, amount, status) VALUES
        ('cm1','u3','c4',120000,'paid'),
        ('cm2','u3',NULL,45000,'pending'),
        ('cm3','u4','c4',55000,'paid'),
        ('cm4','u4',NULL,10000,'pending')
       ON CONFLICT (id) DO NOTHING`
    );

    await client.query(
      `INSERT INTO media (id, title, kind, project_id, uploaded_by, status, created_at) VALUES
        ('m1','MyHome Avatar — Drone Shoot','video','p1','u4','pending', now() - interval '2 days'),
        ('m2','Vasavi Skyla — Photography','photo','p2','u3','in_progress', now() - interval '1 day'),
        ('m3','MyHome Avatar — Walkthrough Reel','reel','p1','u4','delivered', now() - interval '4 days')
       ON CONFLICT (id) DO NOTHING`
    );

    await client.query(
      `INSERT INTO activity (id, text, actor_id, created_at) VALUES
        ('a1','Sai added listing 2BHK Tellapur','u3', now() - interval '1 hour'),
        ('a2','Karthik verified project MyHome Avatar','u2', now() - interval '2 hours')
       ON CONFLICT (id) DO NOTHING`
    );

    await client.query(
      `INSERT INTO notifications (id, user_id, role, type, title, body, created_at) VALUES
        ('n1',NULL,'founder','approval','Price change request — 3BHK Nallagandla','Partner requested -5% price change', now() - interval '10 minutes'),
        ('n2','u3',NULL,'lead','New lead: Ramesh','Source: Instagram — budget 1.5 Cr', now() - interval '5 minutes')
       ON CONFLICT (id) DO NOTHING`
    );

    await client.query(
      `INSERT INTO audit_log (id, text, actor_id, created_at) VALUES
        ('ad1','Listing l2 marked verified','u2', now() - interval '6 hours'),
        ('ad2','Creator draft created for p1','u4', now() - interval '12 hours')
       ON CONFLICT (id) DO NOTHING`
    );
  });

  console.log(`[seed] demo data inserted — all users share password "${config.seedPassword}"`);
}

/* `npm run seed` runs this file directly. */
if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/')) {
  const force = process.argv.includes('--force');
  seed({ force })
    .then(() => query('SELECT 1'))
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed] failed', err);
      process.exit(1);
    });
}
