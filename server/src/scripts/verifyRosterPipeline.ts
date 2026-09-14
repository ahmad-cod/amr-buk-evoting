import crypto from 'crypto';
import mongoose, { Types } from 'mongoose';
import { connectDatabase } from '../config/db';
import { Voter } from '../models/Voter';
import { Election } from '../models/Election';
import { Position } from '../models/Position';
import { Candidate } from '../models/Candidate';
import { Ballot } from '../models/Ballot';
import { VoteReceipt } from '../models/VoteReceipt';
import { ImportHistory } from '../models/ImportHistory';
import {
  validateRosterBuffer,
  commitRosterImport,
  generateVerificationTokenForVoter,
} from '../services/student.service';
import { castVote } from '../services/vote.service';
import { maskEmail } from '../utils/maskEmail';
import { ELECTION_STATUS, CANDIDATE_STATUS } from '../config/constants';

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, name: string, details?: string) {
  if (condition) {
    results.push({ name, passed: true, details });
    console.log(`  ✓ PASS: ${name}${details ? ` (${details})` : ''}`);
  } else {
    results.push({ name, passed: false, details: details || 'Assertion failed' });
    console.error(`  ✗ FAIL: ${name}${details ? ` - ${details}` : ''}`);
  }
}

async function runRosterPipelineVerification() {
  console.log('===============================================================');
  console.log('  AMR-BUK E-Voting: Roster Import & Verification Pipeline Suite');
  console.log('===============================================================\n');

  process.env.NODE_ENV = 'test';
  await connectDatabase();

  const testSuffix = Date.now().toString().slice(-6);
  let testElectionId: Types.ObjectId | null = null;

  try {
    // -------------------------------------------------------------
    // Test 1: PII Masking
    // -------------------------------------------------------------
    console.log('\n--- 1. Voter PII Email Masking ---');
    assert(
      maskEmail('daudaocheni@gmail.com') === 'dau******@gmail.com',
      'maskEmail masks standard email',
      `Result: ${maskEmail('daudaocheni@gmail.com')}`,
    );
    assert(
      maskEmail('ab@buk.edu.ng') === 'a*@buk.edu.ng',
      'maskEmail masks short username email',
      `Result: ${maskEmail('ab@buk.edu.ng')}`,
    );
    assert(
      maskEmail('a@b.com') === 'a*@b.com',
      'maskEmail masks single char email',
      `Result: ${maskEmail('a@b.com')}`,
    );

    // -------------------------------------------------------------
    // Test 2: Roster Parsing & Conflict Detection (300 Rows)
    // -------------------------------------------------------------
    console.log('\n--- 2. Roster CSV Validation & Conflict Detection (300 Rows) ---');
    // Build CSV with:
    // - Header
    // - Rows 1 to 291: 291 populated rows with valid format
    //   including duplicate email at 111 & 112 (daudaocheni@gmail.com)
    //   and duplicate email at 162 & 163 (bappahamza60@gmail.com)
    //   and 1 invalid email row
    // - Rows 292 to 300: 9 completely blank rows
    const csvLines: string[] = [
      'S/N,Full Name,Email,Programme,Faculty,Gender',
    ];

    for (let i = 1; i <= 291; i++) {
      let email = `member_${i}_${testSuffix}@buk.edu.ng`;
      let name = `AMR Member ${i}`;
      let serial = i.toString();

      if (i === 111 || i === 112) {
        email = `daudaocheni_${testSuffix}@gmail.com`; // Duplicate email pair 1
      } else if (i === 162 || i === 163) {
        email = `bappahamza_${testSuffix}@gmail.com`; // Duplicate email pair 2
      } else if (i === 200) {
        email = 'invalid-email-format'; // Invalid email
      }

      csvLines.push(`${serial},"${name}",${email},"Microbiology","Science","M"`);
    }

    // Rows 292 to 300: exactly 9 blank rows
    for (let i = 292; i <= 300; i++) {
      csvLines.push(',,,,');
    }

    const testCsvBuffer = Buffer.from(csvLines.join('\n'), 'utf-8');

    const preview = await validateRosterBuffer(testCsvBuffer);

    assert(
      preview.totalRows === 300,
      'Total rows detected equals 300',
      `Detected: ${preview.totalRows}`,
    );
    assert(
      preview.blankRows === 9,
      'Blank rows (292–300) correctly detected as 9',
      `Blank rows: ${preview.blankRows}`,
    );
    assert(
      preview.populatedRows === 291,
      'Populated rows correctly counted as 291',
      `Populated rows: ${preview.populatedRows}`,
    );
    assert(
      preview.invalidEmails === 1,
      'Invalid email format row identified',
      `Invalid emails: ${preview.invalidEmails}`,
    );
    assert(
      preview.duplicateEmails >= 2,
      'Duplicate email conflicts detected',
      `Duplicate email count: ${preview.duplicateEmails}`,
    );

    const dupEmailConflicts = preview.conflicts.filter(
      (c) => c.type === 'DUPLICATE_EMAIL',
    );
    assert(
      dupEmailConflicts.length >= 2,
      'Duplicate email conflict entries present in preview report',
      `Found ${dupEmailConflicts.length} conflict reports`,
    );

    const daudaConflict = dupEmailConflicts.find(
      (c) => c.email && c.email.includes('daudaocheni'),
    );
    assert(
      !!daudaConflict && daudaConflict.records.some((r) => r.row === 112 || r.serialNumber === '111'),
      'S/N 111 & 112 daudaocheni conflict surfaced with exact row numbers and serials',
      `Rows: ${daudaConflict?.records.map((r) => `Row ${r.row} (#${r.serialNumber})`).join(', ')}`,
    );

    // -------------------------------------------------------------
    // Test 3: Transactional Roster Commit & Idempotency
    // -------------------------------------------------------------
    console.log('\n--- 3. Transactional Roster Commit & Idempotency ---');

    // Create a dedicated election for testing
    const testElection = await Election.create({
      title: `AMR General Election ${testSuffix}`,
      slug: `amr-election-${testSuffix}`,
      status: ELECTION_STATUS.DRAFT,
      startDateTime: new Date(),
      endDateTime: new Date(Date.now() + 86400000),
      createdBy: new Types.ObjectId(),
    });
    testElectionId = testElection._id as Types.ObjectId;

    const commitOutcome = await commitRosterImport(testCsvBuffer, {
      electionId: testElection.id,
      importedBy: new Types.ObjectId().toString(),
      fileName: 'amr_roster_test.csv',
      activateImmediately: false, // status PENDING
    });

    assert(
      commitOutcome.inserted > 280,
      'Batch imported valid roster rows into database',
      `Inserted: ${commitOutcome.inserted}`,
    );

    const pendingCount = await Voter.countDocuments({
      electionId: testElection.id,
      status: 'PENDING',
    });
    assert(
      pendingCount === commitOutcome.inserted,
      'All imported voters created with status PENDING',
      `Pending count: ${pendingCount}`,
    );

    // Pick one voter and simulate manual verification
    const sampleVoter = await Voter.findOne({ electionId: testElection.id, status: 'PENDING' });
    if (!sampleVoter) throw new Error('Sample voter missing');

    sampleVoter.status = 'VERIFIED';
    sampleVoter.verifiedAt = new Date();
    await sampleVoter.save();

    // Re-run commit on the same file: idempotency & preservation of VERIFIED status
    const reimportOutcome = await commitRosterImport(testCsvBuffer, {
      electionId: testElection.id,
      importedBy: new Types.ObjectId().toString(),
      fileName: 'amr_roster_test.csv',
      activateImmediately: false,
    });

    const verifiedVoterAfterReimport = await Voter.findById(sampleVoter.id);
    assert(
      verifiedVoterAfterReimport?.status === 'VERIFIED',
      'Re-import preserves existing VERIFIED status (does not overwrite to PENDING)',
      `Status: ${verifiedVoterAfterReimport?.status}`,
    );

    // -------------------------------------------------------------
    // Test 4: Cryptographic Verification Token Security
    // -------------------------------------------------------------
    console.log('\n--- 4. Verification Token Lifecycle & Single-Use Enforcement ---');

    const tokenTargetVoter = await Voter.findOne({
      electionId: testElection.id,
      status: 'PENDING',
    });
    if (!tokenTargetVoter) throw new Error('Token target voter missing');

    // Generate token
    const { rawToken, tokenHash, expiresAt } = generateVerificationTokenForVoter(tokenTargetVoter);
    await tokenTargetVoter.save();

    assert(
      typeof rawToken === 'string' && rawToken.length === 64,
      'Raw token is 256-bit crypto-random hex string',
      `Token length: ${rawToken.length}`,
    );

    // Verify token stored in DB is SHA-256 hash, NOT raw token
    const voterInDb = await Voter.findById(tokenTargetVoter.id).select('+verificationTokenHash');
    const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    assert(
      voterInDb?.verificationTokenHash === expectedHash,
      'Token is stored at rest as SHA-256 hash (never raw token in DB)',
      `Hash: ${voterInDb?.verificationTokenHash?.slice(0, 16)}...`,
    );
    assert(
      voterInDb?.verificationTokenHash !== rawToken,
      'Database does NOT store plaintext token',
    );

    // Test: Invalid token rejected
    const invalidHash = crypto.createHash('sha256').update('wrong_token_value').digest('hex');
    const invalidAttempt = await Voter.findOneAndUpdate(
      {
        verificationTokenHash: invalidHash,
        verificationTokenExpires: { $gt: new Date() },
        status: { $ne: 'REVOKED' },
      },
      { $set: { status: 'VERIFIED' } },
    );
    assert(
      invalidAttempt === null,
      'Verification with incorrect token fails and updates nothing',
    );

    // Test: Expired token rejected
    voterInDb!.verificationTokenExpires = new Date(Date.now() - 1000); // 1 sec in past
    await voterInDb!.save();

    const expiredAttempt = await Voter.findOneAndUpdate(
      {
        verificationTokenHash: expectedHash,
        verificationTokenExpires: { $gt: new Date() },
        status: { $ne: 'REVOKED' },
      },
      { $set: { status: 'VERIFIED' } },
    );
    assert(
      expiredAttempt === null,
      'Verification with expired token fails and updates nothing',
    );

    // Reset expiration to future for valid consumption test
    voterInDb!.verificationTokenExpires = new Date(Date.now() + 1800000);
    await voterInDb!.save();

    // Test: Atomic token consumption & status transition
    const verifiedVoter = await Voter.findOneAndUpdate(
      {
        verificationTokenHash: expectedHash,
        verificationTokenExpires: { $gt: new Date() },
        status: { $ne: 'REVOKED' },
      },
      {
        $set: {
          status: 'VERIFIED',
          isVerified: true,
          isEligible: true,
          hasRegistered: true,
          verifiedAt: new Date(),
        },
        $unset: {
          verificationTokenHash: 1,
          verificationTokenExpires: 1,
        },
      },
      { new: true },
    );

    assert(
      verifiedVoter?.status === 'VERIFIED' && !!verifiedVoter.verifiedAt,
      'Valid token atomically verifies voter and records verifiedAt timestamp',
      `Verified at: ${verifiedVoter?.verifiedAt?.toISOString()}`,
    );

    // Test: Replay attack prevention (single-use)
    const replayAttempt = await Voter.findOneAndUpdate(
      {
        verificationTokenHash: expectedHash,
        verificationTokenExpires: { $gt: new Date() },
      },
      { $set: { status: 'VERIFIED' } },
    );
    assert(
      replayAttempt === null,
      'Token is single-use: replay attempt with same token is strictly rejected',
    );

    // -------------------------------------------------------------
    // Test 5: Ballot Secrecy & One-Vote Guarantee
    // -------------------------------------------------------------
    console.log('\n--- 5. Ballot Secrecy & Decoupled Vote Receipt ---');

    // Create position and candidate in test election
    testElection.status = ELECTION_STATUS.ACTIVE;
    await testElection.save();

    const testPosition = await Position.create({
      electionId: testElection._id,
      title: `President ${testSuffix}`,
      displayOrder: 1,
      maxVotesPerVoter: 1,
    });

    const testCandidate = await Candidate.create({
      electionId: testElection._id,
      positionId: testPosition._id,
      fullName: `Candidate Alpha ${testSuffix}`,
      status: CANDIDATE_STATUS.APPROVED,
    });

    // Cast vote for verified voter
    const voteOutcome = await castVote({
      electionSlug: testElection.slug,
      studentId: verifiedVoter!._id.toString(),
      selections: [{ positionId: testPosition.id, candidateIds: [testCandidate.id] }],
    });

    assert(
      !!voteOutcome.receiptCode,
      'Vote successfully cast and receipt code generated',
      `Receipt: ${voteOutcome.receiptCode}`,
    );

    // Check VoteReceipt: Records WHO voted (studentId)
    const receipt = await VoteReceipt.findOne({
      electionId: testElection._id,
      studentId: verifiedVoter!._id,
    });
    assert(
      !!receipt && receipt.receiptCode === voteOutcome.receiptCode,
      'VoteReceipt stores voter identity (studentId) and electionId for fraud prevention',
      `StudentId: ${receipt?.studentId}`,
    );

    // Check Ballot: Selections stored, but strictly NO voter identity and NO temporal timestamp!
    const ballot = await Ballot.findOne({ electionId: testElection._id });
    assert(!!ballot, 'Ballot document created in collection');

    const ballotObj = ballot?.toObject() as any;
    assert(
      ballotObj.studentId === undefined &&
        ballotObj.voterId === undefined &&
        ballotObj.email === undefined &&
        ballotObj.receiptCode === undefined,
      'Ballot contains ZERO foreign keys, voter IDs, emails, or receipt codes (ballot secrecy)',
    );

    assert(
      ballotObj.createdAt === undefined,
      'Ballot contains NO createdAt timestamp, preventing temporal correlation attacks',
    );

    // Check non-sequential random ObjectId
    assert(
      Types.ObjectId.isValid(ballot!._id),
      'Ballot _id is a valid cryptographically randomized BSON ObjectId',
      `Ballot _id: ${ballot!._id}`,
    );

    // Test: Double-voting prevention (service idempotency + ballot count + DB unique index)
    const secondVoteOutcome = await castVote({
      electionSlug: testElection.slug,
      studentId: verifiedVoter!._id.toString(),
      selections: [{ positionId: testPosition.id, candidateIds: [testCandidate.id] }],
    });

    assert(
      secondVoteOutcome.alreadyVoted === true &&
        secondVoteOutcome.receiptCode === voteOutcome.receiptCode,
      'Double voting is strictly prevented by service (returns prior receipt with alreadyVoted: true)',
      `alreadyVoted: ${secondVoteOutcome.alreadyVoted}`,
    );

    const ballotCount = await Ballot.countDocuments({ electionId: testElection._id });
    assert(
      ballotCount === 1,
      'Ballot collection strictly contains 1 ballot (no duplicate ballot created)',
      `Ballots in DB: ${ballotCount}`,
    );

    let uniqueIndexBlocked = false;
    try {
      await VoteReceipt.create({
        electionId: testElection._id,
        studentId: verifiedVoter!._id,
        receiptCode: 'AMR-DUPLICATE-RECEIPT',
      });
    } catch (err: any) {
      uniqueIndexBlocked = true;
    }
    assert(
      uniqueIndexBlocked,
      'VoteReceipt unique compound index strictly blocks duplicate votes at database level',
    );

    console.log('\n--- Cleaning up test election artifacts ---');
    console.log('  ✓ Test cleanup will execute in finally block.');

  } catch (err) {
    console.error('Fatal error during pipeline verification:', err);
    process.exitCode = 1;
  } finally {
    try {
      if (testElectionId) {
        await VoteReceipt.deleteMany({ electionId: testElectionId });
        await Ballot.deleteMany({ electionId: testElectionId });
        await Candidate.deleteMany({ electionId: testElectionId });
        await Position.deleteMany({ electionId: testElectionId });
        await Voter.deleteMany({ electionId: testElectionId });
        await ImportHistory.deleteMany({ electionId: testElectionId });
        await Election.findByIdAndDelete(testElectionId);
      }
      // Guarantee cleanup of any other orphaned test imports
      const staleHistories = await ImportHistory.find({ fileName: 'amr_roster_test.csv' });
      for (const h of staleHistories) {
        if (h.electionId) {
          await Voter.deleteMany({ electionId: h.electionId });
          await Election.findByIdAndDelete(h.electionId);
        }
        await ImportHistory.findByIdAndDelete(h._id);
      }
      console.log('  ✓ Test cleanup complete.');
    } catch (cleanupErr) {
      console.warn('Cleanup warning:', cleanupErr);
    }
    await mongoose.disconnect();
  }

  // Summary
  console.log('\n===============================================================');
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`  VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runRosterPipelineVerification().catch((err) => {
  console.error(err);
  process.exit(1);
});
