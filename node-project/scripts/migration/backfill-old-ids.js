'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Gives every contest or session that has no numeric `old_id` the next free number, oldest first.
 * Records created by the Node admin had none, so the app reached them through older handlers
 * (contests: 0 joined / all spots left; sessions: no `id`, so joining from a contest failed).
 * New records now get one on creation; this fixes the existing ones.
 *
 * Dry run (default, writes nothing):  node scripts/migration/backfill-old-ids.js <contests|sessions>
 * Apply:                              node scripts/migration/backfill-old-ids.js <contests|sessions> --apply
 *
 * The dry run also checks that no other record already points at the numbers about to be used.
 * Safe to run again: only records still without an old_id are touched, and each update only
 * applies while that record's old_id is still empty. References need no change — they keep the
 * ObjectId, which every lookup matches.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');

const TARGETS = {
  contests: { model: () => require('../../src/models/contest.model'), refFields: ['contest_id', 'contest_old_id'] },
  sessions: { model: () => require('../../src/models/league-session.model'), refFields: ['league_session_id', 'session_id'] },
};

const APPLY = process.argv.includes('--apply');
const targetName = process.argv[2];

async function referencesTo(numbers, fields) {
  const values = numbers.flatMap((n) => [n, String(n)]);
  const hits = [];
  const db = mongoose.connection.db;
  for (const { name } of await db.listCollections().toArray()) {
    for (const field of fields) {
      const n = await db.collection(name).countDocuments({ [field]: { $in: values } });
      if (n) hits.push(`${name}.${field}: ${n}`);
    }
  }
  return hits;
}

async function run() {
  const target = TARGETS[targetName];
  if (!target) {
    console.error('Usage: node scripts/migration/backfill-old-ids.js <contests|sessions> [--apply]');
    process.exit(1);
  }
  const Model = target.model();
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/proborzs_prob');

  const latest = await Model.findOne({ old_id: { $type: 'number' } }).sort({ old_id: -1 }).select('old_id').lean();
  let next = ((latest && latest.old_id) || 0) + 1;
  const missing = await Model.find({ old_id: null }).sort({ created_at: 1, _id: 1 }).select('_id name category status created_at').lean();
  const numbers = missing.map((_, i) => next + i);

  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} ${targetName}: ${missing.length} without old_id; highest existing old_id = ${next - 1}`);
  const clashes = missing.length ? await referencesTo(numbers, target.refFields) : [];
  if (clashes.length) {
    console.error(`Stopped: records already reference ${numbers[0]}–${numbers[numbers.length - 1]}: ${clashes.join(', ')}`);
    await mongoose.disconnect();
    process.exit(1);
  }
  if (missing.length) console.log(`  no existing references to ${numbers[0]}–${numbers[numbers.length - 1]}`);

  let updated = 0;
  for (const doc of missing) {
    const label = `${doc._id} ${doc.category || doc.status || ''}${doc.name ? ` "${doc.name}"` : ''} → old_id ${next}`;
    if (APPLY) {
      const res = await Model.updateOne({ _id: doc._id, old_id: null }, { $set: { old_id: next } });
      if (!res.modifiedCount) { console.log(`  skipped (already set): ${doc._id}`); continue; }
      updated += 1;
    }
    console.log(`  ${label}`);
    next += 1;
  }
  console.log(APPLY ? `Done: ${updated} ${targetName} updated.` : 'Nothing written. Re-run with --apply to save.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
