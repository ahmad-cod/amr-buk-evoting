import http from 'http';
import crypto from 'crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDatabase } from '../config/db';
import { env } from '../config/env';
import { createApp } from '../app';
import { Admin } from '../models/Admin';
import { Voter } from '../models/Voter';
import { Election } from '../models/Election';
import { Position } from '../models/Position';
import { Candidate } from '../models/Candidate';
import { Ballot } from '../models/Ballot';
import { VoteReceipt } from '../models/VoteReceipt';
import { castVote } from '../services/vote.service';
import { computeResults } from '../services/results.service';
import { signToken, verifyToken } from '../utils/jwt';
import { DEFAULT_POSITIONS, ROLES, ELECTION_STATUS } from '../config/constants';
import { getDevVerificationEmails, clearDevVerificationEmails } from '../services/email.service';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
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

async function parseBody(res: any): Promise<any> {
  const raw = (await res.json()) as any;
  if (raw && typeof raw === 'object') {
    return {
      ...raw,
      ...(raw.data && typeof raw.data === 'object' ? raw.data : {}),
      message: raw.data?.message ?? raw.message,
    };
  }
  return raw;
}

async function runVerification() {
  console.log('===============================================================');
  console.log('  AMR Club BUK E-Voting Platform - Automated Verification Suite');
  console.log('===============================================================\n');

  process.env.NODE_ENV = 'test';
  await connectDatabase();

  const app = createApp();
  const server = http.createServer(app);
  const TEST_PORT = 5088;
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  const baseUrl = `http://127.0.0.1:${TEST_PORT}/api`;

  try {
    // -------------------------------------------------------------
    // Test 1: Admin Account Verification & Authentication
    // -------------------------------------------------------------
    console.log('[1] Testing Admin Account & Authentication:');
    const admin = await Admin.findOne({ username: env.SUPER_ADMIN_USERNAME }).select('+password');
    assert(!!admin, 'Super admin exists in database', `Username: ${env.SUPER_ADMIN_USERNAME}`);
    if (admin) {
      assert(admin.role === ROLES.SUPER_ADMIN, 'Super admin has super_admin role');
      const passMatch = await admin.comparePassword(env.SUPER_ADMIN_PASSWORD);
      assert(passMatch, 'Super admin password matches seeded password');

      const adminToken = signToken({ sub: admin.id, role: admin.role, principal: 'admin' });
      const decodedAdmin = verifyToken(adminToken);
      assert(decodedAdmin.sub === admin.id && decodedAdmin.principal === 'admin', 'Admin JWT signing & verification');
    }

    // -------------------------------------------------------------
    // Test 2: Roster Import & Voter Model Integrity
    // -------------------------------------------------------------
    console.log('\n[2] Testing AMR Accredited Voter Roster:');
    const totalVoters = await Voter.countDocuments();
    assert(totalVoters >= 15, 'Accredited voters seeded in database', `Count: ${totalVoters}`);

    const sampleEmail = 'fatima.bello@amrclub.buk.edu.ng';
    let voter = await Voter.findOne({ email: sampleEmail }).select('+password +verificationTokenHash +verificationTokenExpires');
    assert(!!voter, 'Sample voter exists by email', sampleEmail);
    if (voter) {
      assert(voter.isEligible === true, 'Voter initial status is eligible');
      assert(!!voter.programme, 'Voter has programme recorded', voter.programme);
      assert(!!voter.faculty, 'Voter has faculty recorded', voter.faculty);
      // Ensure voter starts in unregistered state for verification flow tests
      voter.status = 'PENDING';
      voter.hasRegistered = false;
      voter.password = undefined;
      voter.verificationTokenHash = undefined;
      voter.verificationTokenExpires = undefined;
      voter.verificationTokenSentAt = undefined;
      await voter.save();
    }

    // -------------------------------------------------------------
    // Test 3: Phase 19 Email Verification Gate & Account Takeover Prevention
    // -------------------------------------------------------------
    console.log('\n[3] Testing Phase 19 Email Verification Gate:');
    const antiEnumExpectedMsg =
      'If this email address is on the approved AMR Club BUK voter register and has not yet completed registration, a secure verification link has been sent to your inbox. Please check your spam/junk folder if you do not see it within a few minutes.';

    // 3a. Direct registration without verification token MUST return 403 Forbidden
    const directRegRes = await fetch(`${baseUrl}/auth/student/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: sampleEmail,
        password: 'DirectPassword123!',
        confirmPassword: 'DirectPassword123!',
      }),
    });
    assert(
      directRegRes.status === 403,
      'Direct password registration blocked with 403 Forbidden',
      `Status: ${directRegRes.status}`,
    );
    const directRegBody = await parseBody(directRegRes);
    assert(
      /email verification/i.test(directRegBody.error?.message || ''),
      'Rejection message directs voter to email verification',
    );

    // 3b. Anti-enumeration: Non-existent voter returns uniform message and sends NO email
    clearDevVerificationEmails();
    const fakeEmail = 'unaccredited.user@gmail.com';
    const fakeRes = await fetch(`${baseUrl}/auth/student/request-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: fakeEmail }),
    });
    const fakeBody = await parseBody(fakeRes);
    assert(fakeRes.status === 200, 'Non-existent email returns 200 OK (anti-enumeration)');
    assert(fakeBody.message === antiEnumExpectedMsg, 'Anti-enumeration wording exact match for non-existent email');
    assert(getDevVerificationEmails().length === 0, 'No verification email dispatched for unaccredited email');

    // 3c. Valid accredited voter requests verification: returns identical message and dispatches link
    const reqRes = await fetch(`${baseUrl}/auth/student/request-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: sampleEmail }),
    });
    const reqBody = await parseBody(reqRes);
    assert(reqRes.status === 200, 'Accredited voter verification request returns 200 OK');
    assert(reqBody.message === antiEnumExpectedMsg, 'Anti-enumeration wording exact match for accredited voter');

    const devEmails = getDevVerificationEmails();
    assert(devEmails.length === 1, 'Verification email dispatched to dev transport');
    const firstDevEmail = devEmails[0];
    assert(firstDevEmail?.to === sampleEmail, 'Email recipient matches accredited voter');
    assert(firstDevEmail?.link.includes('/verify?token='), 'Verification link contains token param');

    const firstRawToken = firstDevEmail?.token;
    assert(!!firstRawToken && firstRawToken.length === 64, 'Token is 256-bit crypto hex (64 chars)');

    // 3d. Database stores SHA-256 hash, NOT plaintext, and sets 15-min expiry
    const dbVoterAfterReq = await Voter.findOne({ email: sampleEmail }).select('+verificationTokenHash +verificationTokenExpires +verificationTokenSentAt');
    assert(!!dbVoterAfterReq?.verificationTokenHash, 'Token hash stored in database');
    assert(dbVoterAfterReq!.verificationTokenHash !== firstRawToken, 'Plaintext token is NEVER stored in database');
    const expectedHash = crypto.createHash('sha256').update(firstRawToken).digest('hex');
    assert(dbVoterAfterReq!.verificationTokenHash === expectedHash, 'Database stores correct SHA-256 token hash');

    const expiryMinutes = (dbVoterAfterReq!.verificationTokenExpires!.getTime() - Date.now()) / (60 * 1000);
    assert(expiryMinutes > 29 && expiryMinutes <= 30.1, 'Token expiration set to 30 minutes', `~${Math.round(expiryMinutes)} mins`);

    // 3e. 60-second cooldown prevents spamming
    const spamRes = await fetch(`${baseUrl}/auth/student/request-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: sampleEmail }),
    });
    assert(spamRes.status === 429, 'Immediate resend within 60s cooldown returns 429 Too Many Requests');

    // 3f. Resend after cooldown invalidates previous token
    await Voter.updateOne(
      { email: sampleEmail },
      { $set: { verificationTokenSentAt: new Date(Date.now() - 70000) } },
    );
    const resendRes = await fetch(`${baseUrl}/auth/student/request-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: sampleEmail }),
    });
    assert(resendRes.status === 200, 'Resend succeeds after 60s cooldown');
    const secondDevEmail = getDevVerificationEmails()[1];
    const secondRawToken = secondDevEmail?.token;
    assert(secondRawToken !== firstRawToken, 'New unique token generated on resend');

    // Calling verify-token with the previous invalidated token must fail
    const oldTokenRes = await fetch(`${baseUrl}/auth/student/verify-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: firstRawToken }),
    });
    assert(oldTokenRes.status === 400, 'Prior token invalidated by resend returns 400 Bad Request');

    // 3g. Invalid / malformed token returns 400 Bad Request
    const bogusTokenRes = await fetch(`${baseUrl}/auth/student/verify-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'bogus_token_deadbeef' }),
    });
    assert(bogusTokenRes.status === 400, 'Bogus token returns 400 Bad Request');

    // 3h. Expired token returns 400 Bad Request
    await Voter.updateOne(
      { email: sampleEmail },
      { $set: { verificationTokenExpires: new Date(Date.now() - 5000) } },
    );
    const expiredRes = await fetch(`${baseUrl}/auth/student/verify-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: secondRawToken }),
    });
    assert(expiredRes.status === 400, 'Expired token returns 400 Bad Request');

    // 3i. Request fresh token for legitimate completion flow
    await Voter.updateOne(
      { email: sampleEmail },
      { $set: { verificationTokenSentAt: new Date(Date.now() - 70000) } },
    );
    await fetch(`${baseUrl}/auth/student/request-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: sampleEmail }),
    });
    const latestDevEmail = getDevVerificationEmails()[getDevVerificationEmails().length - 1];
    const validRawToken = latestDevEmail.token;

    // Verify valid token: returns registrationSessionToken and consumes token
    const verifyRes = await fetch(`${baseUrl}/auth/student/verify-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: validRawToken }),
    });
    assert(verifyRes.status === 200, 'Valid token returns 200 OK with voter info & session token');
    const verifyBody = await parseBody(verifyRes);
    assert(!!verifyBody.registrationSessionToken, 'Pre-auth registrationSessionToken issued');
    assert(verifyBody.voter?.email === sampleEmail, 'Voter identity verified in response');

    // 3j. Single-use guarantee: Replaying same token MUST fail
    const replayRes = await fetch(`${baseUrl}/auth/student/verify-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: validRawToken }),
    });
    assert(replayRes.status === 400, 'Single-use guarantee: replay of consumed token returns 400 Bad Request');

    const dbVoterAfterConsume = await Voter.findOne({ email: sampleEmail }).select('+verificationTokenHash');
    assert(!dbVoterAfterConsume?.verificationTokenHash, 'Token hash purged from DB immediately upon consumption');

    // 3k. Complete registration with password using registrationSessionToken
    const plainPassword = 'AMR_SecretPassword2026!';
    const fakeSessionToken = 'invalid.jwt.token';
    const badCompleteRes = await fetch(`${baseUrl}/auth/student/complete-registration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        registrationSessionToken: fakeSessionToken,
        password: plainPassword,
        confirmPassword: plainPassword,
      }),
    });
    assert(badCompleteRes.status === 401, 'Tampered session token rejected with 401 Unauthorized');

    const completeRes = await fetch(`${baseUrl}/auth/student/complete-registration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        registrationSessionToken: verifyBody.registrationSessionToken,
        password: plainPassword,
        confirmPassword: plainPassword,
      }),
    });
    assert(
      completeRes.status === 200 || completeRes.status === 201,
      'Registration completed successfully with 200/201',
      `Status: ${completeRes.status}`,
    );

    // 3l. Verify voter state in DB
    const registeredVoter = await Voter.findOne({ email: sampleEmail }).select('+password');
    assert(registeredVoter!.hasRegistered === true, 'Voter marked hasRegistered: true');
    assert(registeredVoter!.password !== plainPassword, 'Password is not plaintext');
    assert(registeredVoter!.password!.startsWith('$2'), 'Password is bcrypt hashed');
    const passMatches = await registeredVoter!.comparePassword(plainPassword);
    assert(passMatches, 'Stored bcrypt hash authenticates correct password');

    // 3m. Voter can now sign in with newly set password
    const loginRes = await fetch(`${baseUrl}/auth/student/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: sampleEmail,
        password: plainPassword,
      }),
    });
    assert(loginRes.status === 200, 'Voter signs in successfully with new password');
    const badLoginRes = await fetch(`${baseUrl}/auth/student/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: sampleEmail,
        password: 'WrongPassword999!',
      }),
    });
    assert(badLoginRes.status === 401, 'Voter login rejects wrong password with 401 Unauthorized');

    // 3n. Requesting verification for already-registered voter preserves anti-enumeration and sends NO email
    clearDevVerificationEmails();
    const registeredReqRes = await fetch(`${baseUrl}/auth/student/request-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: sampleEmail }),
    });
    const registeredReqBody = await parseBody(registeredReqRes);
    assert(registeredReqRes.status === 200, 'Already-registered email returns 200 OK');
    assert(registeredReqBody.message === antiEnumExpectedMsg, 'Already-registered email returns identical anti-enum copy');
    assert(getDevVerificationEmails().length === 0, 'No verification email dispatched for already-registered voter');

    voter = registeredVoter;

    // -------------------------------------------------------------
    // Test 4: Election Structure & Official Positions
    // -------------------------------------------------------------
    console.log('\n[4] Testing Election Structure & Position Ordering:');
    const election = await Election.findOne({ title: /AMR Club/i });
    assert(!!election, 'Active AMR Club election exists');

    if (election) {
      const positions = await Position.find({ electionId: election._id }).sort({ displayOrder: 1 });
      assert(positions.length === 12, 'Exactly 12 official positions seeded', `Found: ${positions.length}`);

      const positionTitles = positions.map((p) => p.title);
      const allPositionsMatch = DEFAULT_POSITIONS.every((title, idx) => positionTitles[idx] === title);
      assert(allPositionsMatch, 'Position titles and hierarchy match AMR Constitution exactly');

      // -----------------------------------------------------------
      // Test 5: Official Candidates Validation (No Fabrication)
      // -----------------------------------------------------------
      console.log('\n[5] Testing Official Candidates Seeded:');
      const candidates = await Candidate.find({ electionId: election._id }).populate('positionId');
      assert(candidates.length === 11, 'Exactly 11 confirmed candidates seeded', `Found: ${candidates.length}`);

      const presPosition = positions.find((p) => p.title === 'President');
      assert(!!presPosition, 'Presidential race position exists');

      const presCandidates = await Candidate.find({
        electionId: election._id,
        positionId: presPosition!._id,
      }).sort({ fullName: 1 });

      assert(presCandidates.length === 2, 'Two presidential candidates registered');
      const presNames = presCandidates.map((c) => c.fullName);
      assert(
        presNames.includes('Abubakar Abubakar Salmanu') && presNames.includes('Salim Sani Haladu'),
        'Presidential candidates: Abubakar Abubakar Salmanu vs Salim Sani Haladu',
      );

      // Verify other confirmed positions
      const treasPosition = positions.find((p) => p.title === 'Treasurer');
      const treasCandidates = await Candidate.find({ electionId: election._id, positionId: treasPosition!._id });
      assert(
        treasCandidates.length === 1 && treasCandidates[0].fullName === 'Abdulhamid Sagir Sulaiman',
        'Treasurer candidate: Abdulhamid Sagir Sulaiman',
      );

      // -----------------------------------------------------------
      // Test 6: Voting Flow & Cryptographic Ballot Secrecy
      // -----------------------------------------------------------
      console.log('\n[6] Testing Vote Casting & Ballot Anonymity:');
      election.startDateTime = new Date(Date.now() - 3600000);
      election.endDateTime = new Date(Date.now() + 3600000);
      election.status = ELECTION_STATUS.ACTIVE;
      await election.save();

      await VoteReceipt.deleteMany({ electionId: election._id, voterId: voter!._id });
      await Ballot.deleteMany({ electionId: election._id });

      const selections = [
        { positionId: presPosition!._id.toString(), candidateIds: [presCandidates[0]._id.toString()] },
        { positionId: treasPosition!._id.toString(), candidateIds: [treasCandidates[0]._id.toString()] },
      ];

      const result = await castVote({
        electionSlug: election.slug,
        studentId: voter!._id.toString(),
        selections,
        ip: '192.168.1.100',
      });

      assert(!!result && !!result.receiptCode, 'Vote cast successfully, receipt issued', result?.receiptCode);

      const dbReceipt = await VoteReceipt.findOne({ electionId: election._id, voterId: voter!._id });
      assert(!!dbReceipt, 'VoteReceipt stored in database with voterId');

      const dbBallots = await Ballot.find({ electionId: election._id });
      assert(dbBallots.length === 2, 'Anonymous Ballots stored in separate collection (one per selection)');
      const ballotDoc = dbBallots[0].toObject() as unknown as Record<string, unknown>;
      assert(!('voterId' in ballotDoc), 'Ballot contains NO voterId field (Ballot Privacy Preserved)');
      assert(!('studentId' in ballotDoc), 'Ballot contains NO studentId field (Ballot Privacy Preserved)');

      // -----------------------------------------------------------
      // Test 7: Double-Voting Prevention (Atomic Uniqueness)
      // -----------------------------------------------------------
      console.log('\n[7] Testing Double-Voting Prevention:');
      const secondAttempt = await castVote({
        electionSlug: election.slug,
        studentId: voter!._id.toString(),
        selections,
        ip: '192.168.1.100',
      });

      assert(secondAttempt.alreadyVoted === true, 'Repeated submission flagged as alreadyVoted: true');
      assert(secondAttempt.receiptCode === result.receiptCode, 'Same receipt code returned idempotently');

      const ballotsAfterSecond = await Ballot.countDocuments({ electionId: election._id });
      assert(ballotsAfterSecond === 2, 'No duplicate ballots created on repeated submission', `Count: ${ballotsAfterSecond}`);

      let dbUniqueViolation = false;
      try {
        await VoteReceipt.create({
          electionId: election._id,
          studentId: voter!._id,
          receiptCode: 'AMR-TEST-DUPE',
          submittedAt: new Date(),
        });
      } catch (err: any) {
        dbUniqueViolation = err.code === 11000 || /duplicate/i.test(err.message);
      }
      assert(dbUniqueViolation, 'Database unique compound index (electionId + studentId) blocks duplicate receipt');

      // -----------------------------------------------------------
      // Test 8: Live Results & Tally Verification
      // -----------------------------------------------------------
      console.log('\n[8] Testing Live Election Tally & Results:');
      const resultsData = await computeResults(election);
      assert(resultsData.turnout.votesCast === 1, 'Total votes cast count equals 1', `Count: ${resultsData.turnout.votesCast}`);
      assert(resultsData.turnout.turnoutPercentage > 0, 'Turnout percentage computed accurately');

      const presResult = resultsData.positions.find((p: any) => p.positionId.toString() === presPosition!._id.toString());
      assert(!!presResult, 'Presidential results tally found');
      if (presResult) {
        const candidateVotes = presResult.candidates.find(
          (c: any) => c.candidateId.toString() === presCandidates[0]._id.toString(),
        );
        assert(candidateVotes && candidateVotes.votes === 1, 'Candidate received exactly 1 recorded vote');
      }

      // -----------------------------------------------------------
      // Test 9: Ineligible Voter Protection
      // -----------------------------------------------------------
      console.log('\n[9] Testing Ineligible Voter Access Control:');
      const voter2Email = 'usman.garba@amrclub.buk.edu.ng';
      const voter2 = await Voter.findOne({ email: voter2Email });
      if (voter2) {
        voter2.isEligible = false;
        await voter2.save();
        let ineligibleRejected = false;
        try {
          await castVote({
            electionSlug: election.slug,
            studentId: voter2._id.toString(),
            selections,
          });
        } catch (err: any) {
          ineligibleRejected = true;
          assert(
            err.statusCode === 403 || /eligib/i.test(err.message),
            'Ineligible voter vote rejected with 403 Forbidden',
            err.message,
          );
        }
        assert(ineligibleRejected, 'Ineligible voter strictly prevented from voting');
        voter2.isEligible = true;
        await voter2.save();
      }
    }

    console.log('\n===============================================================');
    const passedCount = results.filter((r) => r.passed).length;
    const failedCount = results.filter((r) => !r.passed).length;
    console.log(`  VERIFICATION SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('===============================================================\n');

    if (failedCount > 0) {
      process.exit(1);
    }
  } finally {
    try {
      const sampleEmail = 'fatima.bello@amrclub.buk.edu.ng';
      const v = await Voter.findOne({ email: sampleEmail });
      if (v) {
        await Voter.updateOne(
          { _id: v._id },
          {
            $set: { hasRegistered: false, isEligible: true },
            $unset: {
              password: 1,
              resetTokenHash: 1,
              resetTokenExpires: 1,
              verificationTokenHash: 1,
              verificationTokenExpires: 1,
              verificationTokenSentAt: 1,
            },
          },
        );
        const el = await Election.findOne({ title: /AMR Club/i });
        if (el) {
          await VoteReceipt.deleteMany({ electionId: el._id, studentId: v._id });
          await Ballot.deleteMany({ electionId: el._id });
        }
      }
    } catch {
      // Ignore cleanup error
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongoose.disconnect();
  }
}

runVerification().catch((err) => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
