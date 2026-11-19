'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Gives every contest that has no numeric `old_id` the next free number, oldest contest first.
 * Contests created by the Node admin had none, so the app opened them through a route that
 * counted 0 joins ("all spots left"). New contests now get one on creation; this fixes the rest.
 *
 * Dry run (default, writes nothing):  node scripts/migration/backfill-contest-old-ids.js
 * Apply:                              node scripts/migration/backfill-contest-old-ids.js --apply
 *
 * Safe to run again: only contests still without an old_id are touched, and each update only
 * applies while that contest's old_id is still empty. Contest entries need no change — they
 * keep the contest's ObjectId, which every contest API matches.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Contest = require('../../src/models/contest.model');

const APPLY = process.argv.includes('--apply');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/proborzs_prob');

  const latest = await Contest.findOne({ old_id: { $type: 'number' } }).sort({ old_id: -1 }).select('old_id').lean();
  let next = ((latest && latest.old_id) || 0) + 1;
  const missing = await Contest.find({ old_id: null }).sort({ created_at: 1, _id: 1 }).select('_id name category created_at').lean();

  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: ${missing.length} contest(s) without old_id; highest existing old_id = ${next - 1}`);
  let updated = 0;
  for (const contest of missing) {
    const label = `${contest._id} ${contest.category}${contest.name ? ` "${contest.name}"` : ''} → old_id ${next}`;
    if (APPLY) {
      const res = await Contest.updateOne({ _id: contest._id, old_id: null }, { $set: { old_id: next } });
      if (!res.modifiedCount) { console.log(`  skipped (already set): ${contest._id}`); continue; }
      updated += 1;
    }
    console.log(`  ${label}`);
    next += 1;
  }
  console.log(APPLY ? `Done: ${updated} contest(s) updated.` : 'Nothing written. Re-run with --apply to save.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
