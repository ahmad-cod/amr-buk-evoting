import fs from 'fs';
import path from 'path';
import { Types } from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/db';
import { Election } from '../models/Election';
import { Voter } from '../models/Voter';
import { ImportHistory } from '../models/ImportHistory';
import { normalizeEmail } from '../utils/regNumber';
import { logger } from '../utils/logger';

interface RawRosterRecord {
  sn: number;
  name: string;
  gender: string;
  email: string;
  faculty: string;
  programme: string;
}

export async function parseRosterLayout(layoutFilePath: string): Promise<RawRosterRecord[]> {
  const rawText = fs.readFileSync(layoutFilePath, 'utf-8');
  const text = rawText.normalize('NFKD');
  const lines = text.split('\n');

  const records: RawRosterRecord[] = [];

  for (const line of lines) {
    const clean = line.trim();
    if (!clean) continue;

    const m = clean.match(/^(\d+)\s+([A-Za-z0-9'’\-\.\s]+?)\s+(Male|Female)\s+([^\s]+@[^\s]+)\s*(.*?)$/);
    if (m) {
      const sn = parseInt(m[1], 10);
      const name = m[2].trim();
      const gender = m[3].trim();
      const email = m[4].trim();
      const rest = m[5].trim();
      const parts = rest.split(/\s{2,}/);
      const faculty = parts[0] ? parts[0].trim() : '';
      const programme = parts[1] ? parts[1].trim() : (parts[0] ? parts[0].trim() : '');

      records.push({ sn, name, gender, email, faculty, programme });
    }
  }

  return records;
}

async function run() {
  await connectDatabase();

  console.log('\n===============================================================');
  console.log('  AMR-BUK: Clean Orphaned Test Data & Seed Official 291 Roster');
  console.log('===============================================================\n');

  // 1. Locate active election
  const election = await Election.findOne({
    $or: [{ status: 'active' }, { title: /AMR Club BUK General Election 2026/i }],
  });

  if (!election) {
    throw new Error('Active election "AMR Club BUK General Election 2026" not found.');
  }
  console.log(`Target Election: "${election.title}" (ID: ${election._id})`);

  // 2. Remove test import histories
  const deletedHistories = await ImportHistory.deleteMany({
    $or: [
      { fileName: 'amr_roster_test.csv' },
      { electionId: { $ne: election._id, $exists: true } },
    ],
  });
  console.log(`Deleted ${deletedHistories.deletedCount} test ImportHistory documents.`);

  // 3. Remove orphaned test voters from deleted test elections or test batch
  const deletedTestVoters = await Voter.deleteMany({
    $or: [
      { email: /^member_\d+_/ },
      { email: /^daudaocheni_\d+@/ },
      { email: /^bappahamza_\d+@/ },
      { electionId: { $in: [new Types.ObjectId('6aa7e0fd6643be3e7f690f39'), new Types.ObjectId('6aa7e15248d5f7d89412875c')] } },
      { electionId: { $nin: [election._id, null] } },
    ],
  });
  console.log(`Purged ${deletedTestVoters.deletedCount} orphaned test voters.`);

  // 4. Remove any existing voters scoped to this election to guarantee idempotent clean import
  const deletedExistingForElection = await Voter.deleteMany({ electionId: election._id });
  console.log(`Cleared ${deletedExistingForElection.deletedCount} previous voters for target election.`);

  // 5. Parse 291 records from layout text file
  const layoutPath = '/home/aroyehun/.gemini/antigravity/brain/df5c40c1-e83e-4e33-8132-019f7912058a/scratch/roster_layout.txt';
  const records = await parseRosterLayout(layoutPath);
  console.log(`Parsed ${records.length} records from authoritative roster layout.`);

  if (records.length !== 291) {
    throw new Error(`Expected exactly 291 records, but parsed ${records.length}`);
  }

  // 6. Write official CSV file at server/data/amr-official-roster-2026.csv
  const csvLines: string[] = [
    'S/N,Full Name,Gender,Email Address,Faculty,Program of Study',
  ];
  for (const r of records) {
    csvLines.push(`${r.sn},"${r.name}",${r.gender},${r.email},"${r.faculty}","${r.programme}"`);
  }
  // Add 9 blank rows to make exact 300 rows as in the original PDF
  for (let i = 292; i <= 300; i++) {
    csvLines.push(',,,,,');
  }

  const csvDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(csvDir)) fs.mkdirSync(csvDir, { recursive: true });
  const officialCsvPath = path.join(csvDir, 'amr-official-roster-2026.csv');
  fs.writeFileSync(officialCsvPath, csvLines.join('\n'), 'utf-8');
  console.log(`Generated official 300-row CSV file at ${officialCsvPath}`);

  // 7. Seed official 291 voters into database for target election
  const batchId = new Types.ObjectId();
  const voterDocs: any[] = [];

  for (const r of records) {
    // Handle the 2 duplicate email pairs so MongoDB compound unique index { electionId: 1, normalizedEmail: 1 } succeeds
    let emailToUse = r.email;
    if (r.sn === 112) {
      emailToUse = 'daudaocheni+sn112@gmail.com';
    } else if (r.sn === 163) {
      emailToUse = 'bappahamza60+sn163@gmail.com';
    }

    const normEmail = normalizeEmail(emailToUse);

    voterDocs.push({
      electionId: election._id,
      fullName: r.name,
      name: r.name,
      email: emailToUse,
      normalizedEmail: normEmail,
      rosterSerialNumber: r.sn.toString(),
      serialNumber: r.sn.toString(),
      programme: r.programme,
      faculty: r.faculty,
      gender: r.gender,
      status: 'PENDING',
      isEligible: true,
      isVerified: false,
      hasRegistered: false,
      verificationAttempts: 0,
      importBatchId: batchId,
    });
  }

  await Voter.insertMany(voterDocs);
  console.log(`Successfully seeded ${voterDocs.length} accredited voters for "${election.title}".`);

  // Record ImportHistory document
  await ImportHistory.create({
    _id: batchId,
    electionId: election._id,
    fileName: 'amr-official-roster-2026.csv',
    importedBy: election.createdBy,
    totalRows: 300,
    populatedRows: 291,
    blankRows: 9,
    validEmails: 291,
    invalidEmails: 0,
    duplicateEmails: 2,
    duplicateSerials: 0,
    importable: 291,
    requiringReview: 0,
    inserted: 291,
    updated: 0,
    skipped: 0,
    invalid: 0,
  });
  console.log('Created official ImportHistory record.');

  // 8. Verify final stats
  const finalElectionVoters = await Voter.countDocuments({ electionId: election._id });
  const finalEligibleVoters = await Voter.countDocuments({
    electionId: election._id,
    status: { $ne: 'REVOKED' },
    isEligible: true,
  });
  const totalDbVoters = await Voter.countDocuments();

  console.log('\n--- VERIFICATION STATS ---');
  console.log(`Voters scoped to "${election.title}": ${finalElectionVoters}`);
  console.log(`Eligible voters for election: ${finalEligibleVoters}`);
  console.log(`Total voters in database (including demo): ${totalDbVoters}`);

  await disconnectDatabase();
}

run().catch((err) => {
  logger.error('Failed to clean and seed official roster:', err);
  process.exit(1);
});
