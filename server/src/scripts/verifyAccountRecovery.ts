import http from 'http';
import crypto from 'crypto';
import mongoose, { Types } from 'mongoose';
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
import { RecoveryToken } from '../models/RecoveryToken';
import { castVote } from '../services/vote.service';
import {
  getDevRecoveryEmails,
  clearDevRecoveryEmails,
  getLastDevRecoveryEmail,
} from '../services/email.service';
import { UNIFORM_RECOVERY_MESSAGE } from '../controllers/auth.controller';
import { ROLES, ELECTION_STATUS, CANDIDATE_STATUS } from '../config/constants';

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
  const text = await res.text();
  try {
    const raw = JSON.parse(text);
    if (raw && typeof raw === 'object') {
      return {
        ...raw,
        ...(raw.data && typeof raw.data === 'object' ? raw.data : {}),
        message: raw.data?.message ?? raw.message,
      };
    }
    return raw;
  } catch {
    return { rawText: text };
  }
}

async function runRecoveryVerification() {
  console.log('========================================================================');
  console.log('  AMR Club BUK E-Voting — Account Recovery ("Forgot Password") Suite');
  console.log('========================================================================\n');

  process.env.NODE_ENV = 'test';
  await connectDatabase();

  const app = createApp();
  const server = http.createServer(app);
  const TEST_PORT = 5099;
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  const baseUrl = `http://127.0.0.1:${TEST_PORT}/api`;

  const GENERIC_ERROR_MSG = 'This recovery link is invalid or has expired.';
  let testElectionId: Types.ObjectId | null = null;

  try {
    // Clean up any existing recovery test data
    await Voter.deleteMany({ email: /recovery\..*@amrclub\.buk\.edu\.ng/ });
    await Voter.deleteMany({ email: /flood\..*@amrclub\.buk\.edu\.ng/ });
    await RecoveryToken.deleteMany({});

    // ----------------------------------------------------------------------
    // Test 1: Verified-no-password voter can reach reset via recovery & set password
    // ----------------------------------------------------------------------
    console.log('[1] Testing Verified-No-Password Voter Flow:');
    const emailT1 = 'recovery.t1.nopass@amrclub.buk.edu.ng';
    const voterT1 = await Voter.create({
      fullName: 'T1 No Password Voter',
      email: emailT1,
      normalizedEmail: emailT1,
      status: 'VERIFIED',
      isVerified: true,
      isEligible: true,
      hasRegistered: true,
      tokenVersion: 0,
    });

    clearDevRecoveryEmails();
    const req1 = await fetch(`${baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailT1 }),
    });
    const body1 = await parseBody(req1);
    assert(req1.status === 200, 'Forgot password request returned 200 OK');
    assert(body1.message === UNIFORM_RECOVERY_MESSAGE, 'Returns uniform anti-enumeration message');

    const devEmail1 = getLastDevRecoveryEmail();
    assert(!!devEmail1, 'Recovery email dispatched to dev transport');
    assert(devEmail1?.to === emailT1, 'Recipient matches voter email');
    assert(devEmail1?.link.includes('/reset-password?token='), 'Link format contains /reset-password?token=');

    const token1 = devEmail1!.token;

    // Validate token
    const valRes1 = await fetch(`${baseUrl}/auth/validate-recovery-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token1 }),
    });
    const valBody1 = await parseBody(valRes1);
    assert(valRes1.status === 200, 'validate-recovery-token returns 200 OK');
    assert(valBody1.valid === true, 'Token validated as valid: true');

    // Set new password
    const newPass1 = 'FirstTimePassword123!';
    const resetRes1 = await fetch(`${baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: token1,
        password: newPass1,
        confirmPassword: newPass1,
      }),
    });
    const resetBody1 = await parseBody(resetRes1);
    assert(resetRes1.status === 200, 'reset-password returns 200 OK');
    assert(resetBody1.message === 'Password reset. Log in.', 'Message matches "Password reset. Log in."');

    // Verify voter can now log in with the new password
    const loginRes1 = await fetch(`${baseUrl}/auth/student/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: emailT1,
        password: newPass1,
      }),
    });
    assert(loginRes1.status === 200, 'Voter signs in successfully with newly set password');

    // ----------------------------------------------------------------------
    // Test 2: Existing-password voter resets and old password stops working
    // ----------------------------------------------------------------------
    console.log('\n[2] Testing Existing-Password Voter Reset Flow:');
    const emailT2 = 'recovery.t2.existing@amrclub.buk.edu.ng';
    await Voter.create({
      fullName: 'T2 Existing Password Voter',
      email: emailT2,
      normalizedEmail: emailT2,
      status: 'VERIFIED',
      isVerified: true,
      isEligible: true,
      hasRegistered: true,
      password: 'InitialPassword123!',
      tokenVersion: 0,
    });

    clearDevRecoveryEmails();
    const req2 = await fetch(`${baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailT2 }),
    });
    assert(req2.status === 200, 'Forgot password request returned 200 OK');
    const token2 = getLastDevRecoveryEmail()!.token;

    const brandNewPass = 'BrandNewPassword789!';
    const resetRes2 = await fetch(`${baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: token2,
        password: brandNewPass,
        confirmPassword: brandNewPass,
      }),
    });
    assert(resetRes2.status === 200, 'reset-password succeeded for existing password voter');

    // Old password fails
    const oldLoginRes = await fetch(`${baseUrl}/auth/student/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: emailT2,
        password: 'InitialPassword123!',
      }),
    });
    assert(oldLoginRes.status === 401, 'Old password fails with 401 Unauthorized');

    // New password succeeds
    const newLoginRes = await fetch(`${baseUrl}/auth/student/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: emailT2,
        password: brandNewPass,
      }),
    });
    assert(newLoginRes.status === 200, 'New password signs in with 200 OK');

    // ----------------------------------------------------------------------
    // Test 3: Invalid / expired / already-used / tampered tokens rejected with generic error
    // ----------------------------------------------------------------------
    console.log('\n[3] Testing Invalid / Expired / Used / Tampered Token Rejections:');
    const emailT3 = 'recovery.t3.tokens@amrclub.buk.edu.ng';
    await Voter.create({
      fullName: 'T3 Tokens Voter',
      email: emailT3,
      normalizedEmail: emailT3,
      status: 'VERIFIED',
      isVerified: true,
      isEligible: true,
      hasRegistered: true,
      password: 'TokenTestPass123!',
      tokenVersion: 0,
    });

    // 3a. Bogus token
    const bogusRes = await fetch(`${baseUrl}/auth/validate-recovery-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'bogus_token_deadbeef' }),
    });
    const bogusBody = await parseBody(bogusRes);
    assert(bogusRes.status === 400, 'Bogus token validation returns 400 Bad Request');
    assert(
      bogusBody.error?.message === GENERIC_ERROR_MSG,
      'Bogus token returns generic error message',
      bogusBody.error?.message,
    );

    // 3b. Expired token
    clearDevRecoveryEmails();
    await fetch(`${baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailT3 }),
    });
    const expToken = getLastDevRecoveryEmail()!.token;
    const expTokenHash = crypto.createHash('sha256').update(expToken).digest('hex');
    await RecoveryToken.updateOne(
      { tokenHash: expTokenHash },
      { $set: { expiresAt: new Date(Date.now() - 60000) } },
    );

    const expValRes = await fetch(`${baseUrl}/auth/validate-recovery-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: expToken }),
    });
    const expValBody = await parseBody(expValRes);
    assert(expValRes.status === 400, 'Expired token validation returns 400 Bad Request');
    assert(expValBody.error?.message === GENERIC_ERROR_MSG, 'Expired token returns generic error message');

    const expResetRes = await fetch(`${baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: expToken,
        password: 'AttemptedPassword1!',
        confirmPassword: 'AttemptedPassword1!',
      }),
    });
    const expResetBody = await parseBody(expResetRes);
    assert(expResetRes.status === 400, 'Expired token reset returns 400 Bad Request');
    assert(expResetBody.error?.message === GENERIC_ERROR_MSG, 'Expired token reset returns generic error message');

    // 3c. Already-used token
    // token2 from Test 2 was already consumed
    const usedRes = await fetch(`${baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: token2,
        password: 'ReplayPassword123!',
        confirmPassword: 'ReplayPassword123!',
      }),
    });
    const usedBody = await parseBody(usedRes);
    assert(usedRes.status === 400, 'Already-used token returns 400 Bad Request');
    assert(usedBody.error?.message === GENERIC_ERROR_MSG, 'Already-used token returns generic error message');

    // 3d. Tampered token
    clearDevRecoveryEmails();
    await fetch(`${baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailT3 }),
    });
    const legitimateToken = getLastDevRecoveryEmail()!.token;
    const tamperedToken =
      legitimateToken.slice(0, -1) + (legitimateToken.endsWith('a') ? 'b' : 'a');

    const tampRes = await fetch(`${baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: tamperedToken,
        password: 'TamperedPassword1!',
        confirmPassword: 'TamperedPassword1!',
      }),
    });
    const tampBody = await parseBody(tampRes);
    assert(tampRes.status === 400, 'Tampered token returns 400 Bad Request');
    assert(tampBody.error?.message === GENERIC_ERROR_MSG, 'Tampered token returns generic error message');

    // ----------------------------------------------------------------------
    // Test 4: Requesting a new link invalidates the previous unused one
    // ----------------------------------------------------------------------
    console.log('\n[4] Testing New Link Invalidation of Previous Unused Token:');
    const emailT4 = 'recovery.t4.invalidation@amrclub.buk.edu.ng';
    await Voter.create({
      fullName: 'T4 Invalidation Voter',
      email: emailT4,
      normalizedEmail: emailT4,
      status: 'VERIFIED',
      isVerified: true,
      isEligible: true,
      hasRegistered: true,
      password: 'InitialPassT4!',
      tokenVersion: 0,
    });

    clearDevRecoveryEmails();
    await fetch(`${baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailT4 }),
    });
    const link1Token = getLastDevRecoveryEmail()!.token;

    // Request new link
    await fetch(`${baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailT4 }),
    });
    const link2Token = getLastDevRecoveryEmail()!.token;
    assert(link1Token !== link2Token, 'New distinct token generated');

    // Attempting reset with link1 must fail
    const link1Res = await fetch(`${baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: link1Token,
        password: 'InvalidatedPass1!',
        confirmPassword: 'InvalidatedPass1!',
      }),
    });
    assert(link1Res.status === 400, 'Previous unused token invalidated by new request');

    // Reset with link2 must succeed
    const link2Res = await fetch(`${baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: link2Token,
        password: 'ValidPassUpdated2!',
        confirmPassword: 'ValidPassUpdated2!',
      }),
    });
    assert(link2Res.status === 200, 'Newest token resets password successfully');

    // ----------------------------------------------------------------------
    // Test 5: Raw token never stored, never logged in production
    // ----------------------------------------------------------------------
    console.log('\n[5] Testing Raw Token Storage & Production Log Hygiene:');
    const emailT5 = 'recovery.t5.storage@amrclub.buk.edu.ng';
    const voterT5 = await Voter.create({
      fullName: 'T5 Storage Voter',
      email: emailT5,
      normalizedEmail: emailT5,
      status: 'VERIFIED',
      isVerified: true,
      isEligible: true,
      hasRegistered: true,
      password: 'PassT5!',
      tokenVersion: 0,
    });

    clearDevRecoveryEmails();
    const t5Req = await fetch(`${baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailT5 }),
    });
    assert(t5Req.status === 200, 'Forgot password request succeeded for T5 voter');
    const rawTok = getLastDevRecoveryEmail()!.token;
    assert(rawTok.length === 64, 'Raw token is 256-bit crypto hex (64 chars)');

    // Inspect database
    const dbTokens = await RecoveryToken.find({ voterId: voterT5._id });
    assert(dbTokens.length === 1, 'Exactly one recovery token record exists for voter');
    const storedHash = dbTokens[0].tokenHash;
    assert(storedHash !== rawTok, 'Raw token is NEVER stored in database');
    const computedHash = crypto.createHash('sha256').update(rawTok).digest('hex');
    assert(storedHash === computedHash, 'Database stores SHA-256 hash at rest');

    // ----------------------------------------------------------------------
    // Test 6: Client cannot redirect password change by editing email/userId/accountId
    // ----------------------------------------------------------------------
    console.log('\n[6] Testing Account Spoofing Defense (Identity Binding):');
    const emailT6Attacker = 'recovery.t6.attacker@amrclub.buk.edu.ng';
    const emailT6Target = 'recovery.t6.target@amrclub.buk.edu.ng';

    const voterT6Attacker = await Voter.create({
      fullName: 'T6 Attacker Voter',
      email: emailT6Attacker,
      normalizedEmail: emailT6Attacker,
      status: 'VERIFIED',
      isVerified: true,
      isEligible: true,
      hasRegistered: true,
      password: 'AttackerPass123!',
      tokenVersion: 0,
    });

    const voterT6Target = await Voter.create({
      fullName: 'T6 Target Voter',
      email: emailT6Target,
      normalizedEmail: emailT6Target,
      status: 'VERIFIED',
      isVerified: true,
      isEligible: true,
      hasRegistered: true,
      password: 'UntouchedPassword123!',
      tokenVersion: 0,
    });

    clearDevRecoveryEmails();
    // Issue token for Attacker account
    await fetch(`${baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailT6Attacker }),
    });
    const tokenForAttacker = getLastDevRecoveryEmail()!.token;

    // Attacker submits their token, but tries to change Target account's password by supplying Target's ID/email
    const spoofAttemptRes = await fetch(`${baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: tokenForAttacker,
        email: voterT6Target.email,
        voterId: voterT6Target._id.toString(),
        userId: voterT6Target._id.toString(),
        accountId: voterT6Target._id.toString(),
        password: 'HackedPassword999!',
        confirmPassword: 'HackedPassword999!',
      }),
    });
    assert(spoofAttemptRes.status === 200, 'Reset request completes for legitimate token owner');

    // Target's password must be UNTOUCHED
    const targetCheck = await Voter.findById(voterT6Target._id).select('+password');
    const targetOldMatches = await targetCheck!.comparePassword('UntouchedPassword123!');
    const targetHackedMatches = await targetCheck!.comparePassword('HackedPassword999!');
    assert(targetOldMatches === true, 'Target account password remains UntouchedPassword123!');
    assert(targetHackedMatches === false, 'Target account password was NOT changed to HackedPassword999!');

    // Attacker's password was the one changed
    const attackerCheck = await Voter.findById(voterT6Attacker._id).select('+password');
    const attackerHackedMatches = await attackerCheck!.comparePassword('HackedPassword999!');
    assert(attackerHackedMatches === true, 'Token-bound account received the password change');

    // ----------------------------------------------------------------------
    // Test 7: Identical external response regardless of state
    // ----------------------------------------------------------------------
    console.log('\n[7] Testing Anti-Enumeration Uniform External Response:');
    const emailT7Existing = 'recovery.t7.existing@amrclub.buk.edu.ng';
    await Voter.create({
      fullName: 'T7 Existing Voter',
      email: emailT7Existing,
      normalizedEmail: emailT7Existing,
      status: 'VERIFIED',
      isVerified: true,
      isEligible: true,
      hasRegistered: true,
      password: 'PassT7!',
      tokenVersion: 0,
    });

    const testCases = [
      { desc: 'Nonexistent email', body: { email: 'nonexistent.user.123@gmail.com' } },
      { desc: 'Verified-no-password voter', body: { email: emailT1 } },
      { desc: 'Existing-password voter', body: { email: emailT7Existing } },
      { desc: 'Admin account (super admin)', body: { identifier: env.SUPER_ADMIN_USERNAME } },
    ];

    for (const tc of testCases) {
      const res = await fetch(`${baseUrl}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tc.body),
      });
      const data = await parseBody(res);
      assert(res.status === 200, `${tc.desc}: returns 200 OK`);
      assert(
        data.message === UNIFORM_RECOVERY_MESSAGE,
        `${tc.desc}: returns exact uniform recovery message`,
      );
      assert(
        !('devResetToken' in data),
        `${tc.desc}: no devResetToken exposed in external response`,
      );
    }

    // ----------------------------------------------------------------------
    // Test 8: HARD RULE — Voting state invariance before vs after recovery
    // ----------------------------------------------------------------------
    console.log('\n[8] Testing HARD RULE — Voting State Invariance:');

    const emailT8Voted = 'recovery.t8.voted@amrclub.buk.edu.ng';
    const emailT8Unvoted = 'recovery.t8.unvoted@amrclub.buk.edu.ng';

    const voterT8Voted = await Voter.create({
      fullName: 'T8 Voted Voter',
      email: emailT8Voted,
      normalizedEmail: emailT8Voted,
      status: 'VERIFIED',
      isVerified: true,
      isEligible: true,
      hasRegistered: true,
      password: 'VotedPassT8!',
      tokenVersion: 0,
    });

    const voterT8Unvoted = await Voter.create({
      fullName: 'T8 Unvoted Voter',
      email: emailT8Unvoted,
      normalizedEmail: emailT8Unvoted,
      status: 'VERIFIED',
      isVerified: true,
      isEligible: true,
      hasRegistered: true,
      password: 'UnvotedPassT8!',
      tokenVersion: 0,
    });

    // Set up an isolated active test election with a ballot cast by voterT8Voted
    const testElectionSlug = `amr-recovery-isolated-test-${Date.now()}`;
    const election = await Election.create({
      title: `AMR Recovery Test Election (${Date.now()})`,
      slug: testElectionSlug,
      startDateTime: new Date(Date.now() - 3600000),
      endDateTime: new Date(Date.now() + 3600000),
      status: ELECTION_STATUS.ACTIVE,
      votingEnabled: true,
      registrationEnabled: true,
      requireCandidateApproval: false,
      eligibleDepartments: [],
      createdBy: new Types.ObjectId(),
    });
    testElectionId = election._id;

    const position = await Position.create({
      electionId: election._id,
      title: 'President',
      displayOrder: 1,
      maxCandidates: 10,
      maxVotesPerVoter: 1,
      isActive: true,
    });

    const candidate = await Candidate.create({
      electionId: election._id,
      positionId: position._id,
      fullName: 'Recovery Test Candidate',
      status: CANDIDATE_STATUS.APPROVED,
    });

    await Voter.updateMany(
      { _id: { $in: [voterT8Voted._id, voterT8Unvoted._id] } },
      { $set: { electionId: election._id } },
    );

    // Cast vote for voterT8Voted
    await castVote({
      electionSlug: election.slug,
      studentId: voterT8Voted._id.toString(),
      selections: [{ positionId: position._id.toString(), candidateIds: [candidate._id.toString()] }],
      ip: '10.0.0.1',
    });

    // 8a. Case A: Voter who HAS voted
    const receiptBeforeA = await VoteReceipt.findOne({
      electionId: election._id,
      studentId: voterT8Voted._id,
    });
    const ballotsBeforeA = await Ballot.find({ electionId: election._id }).sort({ _id: 1 });
    const voterBeforeA = await Voter.findById(voterT8Voted._id);
    const hasVotedBeforeA = Boolean(receiptBeforeA);

    // Run recovery cycle for voterT8Voted
    clearDevRecoveryEmails();
    await fetch(`${baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailT8Voted }),
    });
    const tokenVoted = getLastDevRecoveryEmail()!.token;
    await fetch(`${baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: tokenVoted,
        password: 'NewVotedPassword999!',
        confirmPassword: 'NewVotedPassword999!',
      }),
    });

    // Snapshot after recovery
    const receiptAfterA = await VoteReceipt.findOne({
      electionId: election._id,
      studentId: voterT8Voted._id,
    });
    const ballotsAfterA = await Ballot.find({ electionId: election._id }).sort({ _id: 1 });
    const voterAfterA = await Voter.findById(voterT8Voted._id);
    const hasVotedAfterA = Boolean(receiptAfterA);

    assert(hasVotedBeforeA === true && hasVotedAfterA === true, 'has_voted remains true before and after recovery');
    assert(
      receiptBeforeA?.receiptCode === receiptAfterA?.receiptCode,
      'VoteReceipt receiptCode is byte-for-byte identical',
      receiptAfterA?.receiptCode,
    );
    assert(
      receiptBeforeA?.submittedAt.toISOString() === receiptAfterA?.submittedAt.toISOString(),
      'VoteReceipt submittedAt is identical',
    );
    assert(
      ballotsBeforeA.length === ballotsAfterA.length,
      'Ballot counts byte-for-byte identical',
      `Count: ${ballotsAfterA.length}`,
    );
    assert(
      voterBeforeA?.isEligible === voterAfterA?.isEligible,
      'Voter eligibility is completely unchanged',
    );
    assert(
      voterBeforeA?.status === voterAfterA?.status,
      'Voter status is completely unchanged',
    );

    // 8b. Case B: Voter who has NOT voted (voterT8Unvoted)
    const receiptBeforeB = await VoteReceipt.findOne({
      electionId: election._id,
      studentId: voterT8Unvoted._id,
    });
    const ballotsBeforeB = await Ballot.find({ electionId: election._id }).sort({ _id: 1 });
    const voterBeforeB = await Voter.findById(voterT8Unvoted._id);
    const hasVotedBeforeB = Boolean(receiptBeforeB);

    clearDevRecoveryEmails();
    await fetch(`${baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailT8Unvoted }),
    });
    const tokenUnvoted = getLastDevRecoveryEmail()!.token;
    await fetch(`${baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: tokenUnvoted,
        password: 'AnotherPassword888!',
        confirmPassword: 'AnotherPassword888!',
      }),
    });

    const receiptAfterB = await VoteReceipt.findOne({
      electionId: election._id,
      studentId: voterT8Unvoted._id,
    });
    const ballotsAfterB = await Ballot.find({ electionId: election._id }).sort({ _id: 1 });
    const voterAfterB = await Voter.findById(voterT8Unvoted._id);
    const hasVotedAfterB = Boolean(receiptAfterB);

    assert(hasVotedBeforeB === false && hasVotedAfterB === false, 'has_voted remains false before and after recovery');
    assert(receiptAfterB === null, 'No VoteReceipt created by recovery');
    assert(ballotsBeforeB.length === ballotsAfterB.length, 'Ballot count unchanged');
    assert(voterBeforeB?.isEligible === voterAfterB?.isEligible, 'Voter eligibility unchanged');

    // ----------------------------------------------------------------------
    // Test 9: Concurrent / double-submit race condition defense
    // ----------------------------------------------------------------------
    console.log('\n[9] Testing Race Condition & Double-Submit Defense:');
    const emailT9 = 'recovery.t9.concurrent@amrclub.buk.edu.ng';
    await Voter.create({
      fullName: 'T9 Concurrent Voter',
      email: emailT9,
      normalizedEmail: emailT9,
      status: 'VERIFIED',
      isVerified: true,
      isEligible: true,
      hasRegistered: true,
      password: 'InitialConcurrentPass!',
      tokenVersion: 0,
    });

    clearDevRecoveryEmails();
    await fetch(`${baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailT9 }),
    });
    const concurrentToken = getLastDevRecoveryEmail()!.token;

    const concurrentPasswords = [
      'ConcurrentPass1!',
      'ConcurrentPass2!',
      'ConcurrentPass3!',
      'ConcurrentPass4!',
      'ConcurrentPass5!',
    ];

    const responses = await Promise.all(
      concurrentPasswords.map((p) =>
        fetch(`${baseUrl}/auth/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: concurrentToken,
            password: p,
            confirmPassword: p,
          }),
        }),
      ),
    );

    const statuses = responses.map((r) => r.status);
    const successCount = statuses.filter((s) => s === 200).length;
    const failCount = statuses.filter((s) => s === 400).length;

    assert(successCount === 1, 'Exactly ONE concurrent reset request succeeded', `Successes: ${successCount}`);
    assert(failCount === 4, 'All other concurrent attempts were rejected with 400', `Failures: ${failCount}`);

    // Verify token is marked used and no longer usable
    const postConcurrentRes = await fetch(`${baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: concurrentToken,
        password: 'LateArrivalPass!',
        confirmPassword: 'LateArrivalPass!',
      }),
    });
    assert(postConcurrentRes.status === 400, 'Subsequent attempt with consumed token is rejected');

    // ----------------------------------------------------------------------
    // Test 10: Rate limiting triggers under repeated requests without leaking
    // ----------------------------------------------------------------------
    console.log('\n[10] Testing Rate Limiting (Flood Defense & Anti-Enumeration):');
    const floodAccountExist = 'flood.exist@amrclub.buk.edu.ng';
    const floodAccountNotExist = 'flood.notexist@amrclub.buk.edu.ng';

    await Voter.create({
      fullName: 'Flood Test Voter',
      email: floodAccountExist,
      normalizedEmail: floodAccountExist,
      status: 'VERIFIED',
      isVerified: true,
      isEligible: true,
      password: 'ExistingPass123!',
    });

    let triggeredExist = false;
    let existMessage = '';
    for (let i = 0; i < 7; i++) {
      const res = await fetch(`${baseUrl}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-rate-limit': 'true' },
        body: JSON.stringify({ email: floodAccountExist }),
      });
      if (res.status === 429) {
        triggeredExist = true;
        const b = await parseBody(res);
        existMessage = b.error?.message || b.message;
        break;
      }
    }
    assert(triggeredExist, 'Rate limit triggered (429) for repeated requests on existing account');

    let triggeredNotExist = false;
    let notExistMessage = '';
    for (let i = 0; i < 7; i++) {
      const res = await fetch(`${baseUrl}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-rate-limit': 'true' },
        body: JSON.stringify({ email: floodAccountNotExist }),
      });
      if (res.status === 429) {
        triggeredNotExist = true;
        const b = await parseBody(res);
        notExistMessage = b.error?.message || b.message;
        break;
      }
    }
    assert(triggeredNotExist, 'Rate limit triggered (429) for repeated requests on non-existent account');
    assert(
      existMessage === notExistMessage,
      'Rate limit error response does NOT leak account existence',
      existMessage,
    );

    // ----------------------------------------------------------------------
    // Test 11: Active session invalidation upon password reset
    // ----------------------------------------------------------------------
    console.log('\n[11] Testing Active Session Invalidation upon Reset:');
    const emailT11 = 'recovery.t11.session@amrclub.buk.edu.ng';
    const initialSessionPass = 'SessionPassword123!';
    await Voter.create({
      fullName: 'T11 Session Voter',
      email: emailT11,
      normalizedEmail: emailT11,
      status: 'VERIFIED',
      isVerified: true,
      isEligible: true,
      hasRegistered: true,
      password: initialSessionPass,
      tokenVersion: 0,
    });

    // Sign in to obtain session cookie
    const sLoginRes = await fetch(`${baseUrl}/auth/student/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: emailT11,
        password: initialSessionPass,
      }),
    });
    assert(sLoginRes.status === 200, 'Session voter signs in');
    const rawCookie = sLoginRes.headers.get('set-cookie');
    assert(!!rawCookie, 'Received session cookie from login');

    // Extract cookie
    const cookieVal = rawCookie!.split(';')[0];

    // Confirm session works
    const meResBefore = await fetch(`${baseUrl}/auth/student/me`, {
      headers: { Cookie: cookieVal },
    });
    assert(meResBefore.status === 200, 'Active session accesses /student/me');

    // Now reset password via recovery
    clearDevRecoveryEmails();
    await fetch(`${baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailT11 }),
    });
    const sRecoveryToken = getLastDevRecoveryEmail()!.token;
    await fetch(`${baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: sRecoveryToken,
        password: 'NewSessionPassword456!',
        confirmPassword: 'NewSessionPassword456!',
      }),
    });

    // The old session cookie MUST now be invalid (tokenVersion bumped)
    const meResAfter = await fetch(`${baseUrl}/auth/student/me`, {
      headers: { Cookie: cookieVal },
    });
    assert(
      meResAfter.status === 401,
      'Pre-existing session revoked immediately after password reset (401 Unauthorized)',
    );

    // ----------------------------------------------------------------------
    // Summary
    // ----------------------------------------------------------------------
    console.log('\n========================================================================');
    const passedCount = results.filter((r) => r.passed).length;
    const failedCount = results.filter((r) => !r.passed).length;
    console.log(`  RECOVERY SUITE SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('========================================================================\n');

    if (failedCount > 0) {
      process.exit(1);
    }
  } finally {
    try {
      await Voter.deleteMany({ email: /recovery\..*@amrclub\.buk\.edu\.ng/ });
      await Voter.deleteMany({ email: /flood\..*@amrclub\.buk\.edu\.ng/ });
      await RecoveryToken.deleteMany({});
      if (testElectionId) {
        await Ballot.deleteMany({ electionId: testElectionId });
        await VoteReceipt.deleteMany({ electionId: testElectionId });
        await Candidate.deleteMany({ electionId: testElectionId });
        await Position.deleteMany({ electionId: testElectionId });
        await Election.deleteOne({ _id: testElectionId });
      }
    } catch {
      // Ignore cleanup error
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongoose.disconnect();
  }
}

runRecoveryVerification().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
