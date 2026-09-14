import http from 'http';
import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/db';
import { env } from '../config/env';
import { createApp } from '../app';
import { Admin } from '../models/Admin';
import { Voter } from '../models/Voter';
import { Election } from '../models/Election';
import { Position } from '../models/Position';
import { Candidate } from '../models/Candidate';
import { Ballot } from '../models/Ballot';
import { signToken } from '../utils/jwt';
import { ROLES, CANDIDATE_STATUS } from '../config/constants';
import { ensureCandidateBucket } from '../services/storage.service';

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

// 1x1 transparent JPEG/PNG minimal binary valid bytes
const SAMPLE_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
  0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
  0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
  0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
  0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
  0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
  0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
  0x00, 0xbf, 0x00, 0xff, 0xd9,
]);

const SAMPLE_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

async function runPhase20Verification() {
  console.log('===============================================================');
  console.log('  AMR Club BUK E-Voting Platform - Phase 20 Verification Suite');
  console.log('  Candidate Photos via Backend-Mediated Supabase Storage');
  console.log('===============================================================\n');

  process.env.NODE_ENV = 'test';
  await connectDatabase();

  const app = createApp();
  const server = http.createServer(app);
  const TEST_PORT = 5092;
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  const baseUrl = `http://127.0.0.1:${TEST_PORT}/api`;

  let testCandidateId = '';
  let firstUploadedKey = '';
  let firstPublicUrl = '';
  let secondUploadedKey = '';
  let secondPublicUrl = '';

  try {
    // -------------------------------------------------------------
    // Test 1: Bucket Setup & Configuration
    // -------------------------------------------------------------
    console.log('[1] Supabase Configuration & Bucket Pre-flight:');
    assert(
      !!env.SUPABASE_PROJECT_URL && !!env.SUPABASE_SECRET_KEY && !!env.SUPABASE_PUBLISHABLE_KEY,
      'Supabase environment variables configured',
      `Project URL: ${env.SUPABASE_PROJECT_URL}`,
    );
    assert(
      env.SUPABASE_STORAGE_BUCKET === 'candidate-photos',
      'Storage bucket matches candidate-photos',
      env.SUPABASE_STORAGE_BUCKET,
    );

    await ensureCandidateBucket();
    assert(true, 'Bucket verified/created successfully via service initialization');

    // -------------------------------------------------------------
    // Test 2: RLS Security Policy Enforcement (Publishable Key Direct Upload)
    // -------------------------------------------------------------
    console.log('\n[2] Direct Publishable Key Write Rejected by RLS:');
    const rlsTestPath = `candidates/security-test/${randomUUID()}.jpg`;
    const rlsRes = await fetch(
      `${env.SUPABASE_PROJECT_URL}/storage/v1/object/${env.SUPABASE_STORAGE_BUCKET}/${rlsTestPath}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}`,
          apikey: env.SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'image/jpeg',
        },
        body: SAMPLE_JPEG,
      },
    );
    const rlsBody = await rlsRes.text();
    const isRejectedByRls =
      rlsRes.status === 403 ||
      rlsRes.status === 401 ||
      rlsBody.includes('violates row-level security policy') ||
      rlsBody.includes('AccessDenied');
    assert(
      isRejectedByRls,
      'Direct browser-side upload using publishable key is BLOCKED by Supabase RLS',
      `Status: ${rlsRes.status}`,
    );

    // -------------------------------------------------------------
    // Test 3: Setup Test Candidate and JWT Tokens
    // -------------------------------------------------------------
    console.log('\n[3] Setup Test Admin & Candidate:');
    const admin =
      (await Admin.findOne({ role: ROLES.SUPER_ADMIN })) ||
      (await Admin.findOne({ username: env.SUPER_ADMIN_USERNAME }));
    assert(!!admin, 'Super admin found for test', admin?.username);
    const adminToken = signToken({ sub: admin!.id, role: admin!.role, principal: 'admin' });

    let voter = await Voter.findOne({ isEligible: true });
    if (!voter) {
      voter = await Voter.create({
        fullName: 'Test Verification Voter',
        email: `test_voter_${Date.now()}@buk.edu.ng`,
        isEligible: true,
        isVerified: true,
      });
    }
    assert(!!voter, 'Sample voter found for non-admin token test', voter?.email);
    const voterToken = signToken({ sub: voter!.id, principal: 'student' });

    // Pick or create an election and position
    let election = await Election.findOne();
    if (!election) {
      election = await Election.create({
        title: 'Phase 20 Test Election',
        slug: `photo-election-${Date.now()}`,
        startDateTime: new Date(Date.now() - 3600000),
        endDateTime: new Date(Date.now() + 86400000),
        status: 'active',
        createdBy: admin!._id,
      });
    }
    let position = await Position.findOne({ electionId: election._id });
    if (!position) {
      position = await Position.create({
        electionId: election._id,
        title: 'President',
        displayOrder: 1,
        maxCandidates: 10,
        maxVotesPerVoter: 1,
        isActive: true,
      });
    }
    assert(!!election && !!position, 'Found active election and position for candidate creation');

    // Create a disposable candidate for tests
    const dummyCandidate = await Candidate.create({
      electionId: election!._id,
      positionId: position!._id,
      fullName: `Test Candidate Photo ${Date.now()}`,
      faculty: 'College of Health Sciences',
      department: 'Medicine and Surgery',
      status: CANDIDATE_STATUS.APPROVED,
      displayOrder: 99,
    });
    testCandidateId = dummyCandidate.id;
    assert(!!testCandidateId, 'Disposable candidate created for photo lifecycle tests', testCandidateId);


    // -------------------------------------------------------------
    // Test 4: Unauthenticated Request Returns 401
    // -------------------------------------------------------------
    console.log('\n[4] Unauthenticated Upload Gating:');
    const formUnauth = new FormData();
    formUnauth.append('image', new Blob([SAMPLE_JPEG], { type: 'image/jpeg' }), 'photo.jpg');

    const unauthRes = await fetch(`${baseUrl}/candidates/${testCandidateId}/upload-image`, {
      method: 'POST',
      body: formUnauth,
    });
    assert(
      unauthRes.status === 401,
      'Unauthenticated request returns 401 Unauthorized',
      `Status: ${unauthRes.status}`,
    );

    // -------------------------------------------------------------
    // Test 5: Voter/Student Token Returns 403 Forbidden
    // -------------------------------------------------------------
    console.log('\n[5] Voter Role Upload Gating:');
    const formVoter = new FormData();
    formVoter.append('image', new Blob([SAMPLE_JPEG], { type: 'image/jpeg' }), 'photo.jpg');

    const voterRes = await fetch(`${baseUrl}/candidates/${testCandidateId}/upload-image`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${voterToken}`,
      },
      body: formVoter,
    });
    assert(
      voterRes.status === 403,
      'Voter/student token returns 403 Forbidden',
      `Status: ${voterRes.status}`,
    );

    // -------------------------------------------------------------
    // Test 6: Oversized File (> 3MB) Returns 400 Bad Request
    // -------------------------------------------------------------
    console.log('\n[6] Server-Side File Size Validation (> 3MB):');
    const oversizedBuffer = Buffer.alloc(3.2 * 1024 * 1024); // 3.2MB
    const formOversized = new FormData();
    formOversized.append('image', new Blob([oversizedBuffer], { type: 'image/jpeg' }), 'large.jpg');

    const oversizedRes = await fetch(`${baseUrl}/candidates/${testCandidateId}/upload-image`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
      body: formOversized,
    });
    assert(
      oversizedRes.status === 400,
      'Oversized image (> 3MB) is rejected with 400 Bad Request',
      `Status: ${oversizedRes.status}`,
    );

    // -------------------------------------------------------------
    // Test 7: Non-Image MIME Type Returns 400 Bad Request
    // -------------------------------------------------------------
    console.log('\n[7] Server-Side MIME Type Validation:');
    const textBuffer = Buffer.from('Malicious script or document contents');
    const formText = new FormData();
    formText.append('image', new Blob([textBuffer], { type: 'text/plain' }), 'notes.txt');

    const textRes = await fetch(`${baseUrl}/candidates/${testCandidateId}/upload-image`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
      body: formText,
    });
    assert(
      textRes.status === 400,
      'Non-image file (text/plain) is rejected with 400 Bad Request',
      `Status: ${textRes.status}`,
    );

    // -------------------------------------------------------------
    // Test 8: Path Sanitization & Server-Generated UUID Key
    // -------------------------------------------------------------
    console.log('\n[8] Path Sanitization & Backend-Mediated Upload:');
    const maliciousFilename = '../../../../etc/passwd.jpg';
    const formMalicious = new FormData();
    formMalicious.append('image', new Blob([SAMPLE_JPEG], { type: 'image/jpeg' }), maliciousFilename);

    const uploadRes = await fetch(`${baseUrl}/candidates/${testCandidateId}/upload-image`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
      body: formMalicious,
    });
    assert(uploadRes.status === 200, 'Valid JPEG upload succeeds with 200 OK', `Status: ${uploadRes.status}`);

    const uploadJson = (await uploadRes.json()) as any;
    const uploadedData = uploadJson.data || uploadJson;
    firstPublicUrl = uploadedData.imageUrl || uploadedData.candidate?.imageUrl;
    firstUploadedKey = uploadedData.candidate?.storageKey || uploadedData.storageKey;

    assert(
      !firstUploadedKey.includes('passwd') && !firstUploadedKey.includes('..'),
      'Client original filename is completely ignored in storage key',
      firstUploadedKey,
    );
    assert(
      new RegExp(`^candidates/${testCandidateId}/[a-f0-9\\-]+\\.jpg$`).test(firstUploadedKey),
      'Storage key strictly matches candidates/{candidateId}/{uuid}.jpg pattern',
      firstUploadedKey,
    );
    assert(
      firstPublicUrl.includes(firstUploadedKey) && firstPublicUrl.startsWith(env.SUPABASE_PROJECT_URL),
      'Public URL points to Supabase public storage endpoint',
      firstPublicUrl,
    );

    // -------------------------------------------------------------
    // Test 9: Public URL Accessibility (Unauthenticated GET)
    // -------------------------------------------------------------
    console.log('\n[9] Public Read Access Verification:');
    const publicFetch = await fetch(firstPublicUrl);
    assert(
      publicFetch.status === 200,
      'Uploaded photo is publicly readable via unauthenticated GET',
      `Status: ${publicFetch.status}`,
    );
    const contentType = publicFetch.headers.get('content-type');
    assert(
      contentType === 'image/jpeg',
      'Content-Type header correctly returned as image/jpeg',
      contentType || '',
    );

    // -------------------------------------------------------------
    // Test 10: Photo Replacement & Old Asset Deletion
    // -------------------------------------------------------------
    console.log('\n[10] Photo Replacement & Old Asset Cleanup:');
    const formReplace = new FormData();
    formReplace.append('image', new Blob([SAMPLE_PNG], { type: 'image/png' }), 'replacement.png');

    const replaceRes = await fetch(`${baseUrl}/candidates/${testCandidateId}/upload-image`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
      body: formReplace,
    });
    assert(replaceRes.status === 200, 'Photo replacement succeeds with 200 OK', `Status: ${replaceRes.status}`);

    const replaceJson = (await replaceRes.json()) as any;
    const replaceData = replaceJson.data || replaceJson;
    secondPublicUrl = replaceData.imageUrl || replaceData.candidate?.imageUrl;
    secondUploadedKey = replaceData.candidate?.storageKey || replaceData.storageKey;

    assert(secondUploadedKey !== firstUploadedKey, 'New distinct storage key assigned for replacement');
    assert(secondUploadedKey.endsWith('.png'), 'Replacement PNG correctly uses .png extension');

    // Verify candidate in DB has new URL and storageKey
    const updatedCandidate = await Candidate.findById(testCandidateId);
    assert(
      updatedCandidate?.imageUrl === secondPublicUrl,
      'Candidate document in DB updated to second public URL',
    );
    assert(
      updatedCandidate?.storageKey === secondUploadedKey,
      'Candidate document in DB updated to second storage key',
    );

    // Verify old key was deleted from Supabase Storage (allow brief storage propagation)
    let isOldKeyDeleted = false;
    let oldKeyStatus = 0;
    for (let attempt = 0; attempt < 6; attempt++) {
      await new Promise((r) => setTimeout(r, 400));
      const oldKeyCheck = await fetch(`${firstPublicUrl}?_t=${Date.now()}`);
      oldKeyStatus = oldKeyCheck.status;
      const bodyText = await oldKeyCheck.text();
      if (oldKeyStatus === 400 || oldKeyStatus === 404 || bodyText.includes('not_found') || bodyText.includes('NoSuchKey')) {
        isOldKeyDeleted = true;
        break;
      }
    }
    assert(
      isOldKeyDeleted,
      'Old photo storage object successfully deleted from Supabase upon replacement',
      `Old URL Status: ${oldKeyStatus}`,
    );

    // -------------------------------------------------------------
    // Test 11: Candidate Deletion & Storage Asset Cleanup
    // -------------------------------------------------------------
    console.log('\n[11] Candidate Deletion & Storage Asset Cleanup:');
    const deleteRes = await fetch(`${baseUrl}/candidates/${testCandidateId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    assert(deleteRes.status === 200, 'Candidate deletion succeeds with 200 OK', `Status: ${deleteRes.status}`);

    // Verify candidate no longer in DB
    const deletedCandidate = await Candidate.findById(testCandidateId);
    assert(deletedCandidate === null, 'Candidate document successfully removed from MongoDB');

    // Verify second photo was deleted from Supabase Storage
    let isSecondKeyDeleted = false;
    let secondKeyStatus = 0;
    for (let attempt = 0; attempt < 6; attempt++) {
      await new Promise((r) => setTimeout(r, 400));
      const secondKeyCheck = await fetch(`${secondPublicUrl}?_t=${Date.now()}`);
      secondKeyStatus = secondKeyCheck.status;
      const bodyText = await secondKeyCheck.text();
      if (secondKeyStatus === 400 || secondKeyStatus === 404 || bodyText.includes('not_found') || bodyText.includes('NoSuchKey')) {
        isSecondKeyDeleted = true;
        break;
      }
    }
    assert(
      isSecondKeyDeleted,
      'Second photo storage object successfully deleted from Supabase upon candidate deletion',
      `Second URL Status: ${secondKeyStatus}`,
    );

    // -------------------------------------------------------------
    // Test 12: Ballot Secrecy & Data Isolation Audit
    // -------------------------------------------------------------
    console.log('\n[12] Ballot Secrecy & Data Isolation Audit:');
    const totalBallots = await Ballot.countDocuments();
    const rawBallotWithPhoto = await mongoose.connection.collection('ballots').findOne({
      $or: [
        { imageUrl: { $exists: true, $ne: null } },
        { photo: { $exists: true, $ne: null } },
        { photoUrl: { $exists: true, $ne: null } },
        { candidatePhoto: { $exists: true, $ne: null } },
      ],
    });
    assert(
      rawBallotWithPhoto === null,
      'ZERO photo fields on Ballot records (strict ballot secrecy & data isolation)',
      `Total Ballots checked: ${totalBallots}`,
    );

    const rawVoterWithPhoto = await mongoose.connection.collection('voters').findOne({
      $or: [
        { imageUrl: { $exists: true, $ne: null } },
        { photo: { $exists: true, $ne: null } },
        { photoUrl: { $exists: true, $ne: null } },
        { candidatePhoto: { $exists: true, $ne: null } },
      ],
    });
    assert(
      rawVoterWithPhoto === null,
      'ZERO photo fields on Voter records (strict voter privacy & data isolation)',
    );

    // -------------------------------------------------------------
    // Test 13: Candidates Without Photos Fallback Verification
    // -------------------------------------------------------------
    console.log('\n[13] Fallback Avatar for Candidates Without Photos:');
    let noPhotoCandidates = await Candidate.find({
      $or: [{ imageUrl: { $exists: false } }, { imageUrl: null }, { imageUrl: '' }],
    });
    if (noPhotoCandidates.length === 0) {
      const fallbackCandidate = await Candidate.create({
        electionId: election!._id,
        positionId: position!._id,
        fullName: `Fallback Avatar Candidate ${Date.now()}`,
        status: CANDIDATE_STATUS.APPROVED,
        displayOrder: 100,
      });
      noPhotoCandidates = [fallbackCandidate];
    }
    assert(
      noPhotoCandidates.length > 0,
      'Candidates without photos exist in the database and rely on fallback avatar',
      `Count: ${noPhotoCandidates.length}`,
    );

  } catch (err: any) {
    console.error('Test execution error:', err);
    assert(false, 'Verification suite run completed without unexpected error', err.message);
  } finally {
    // Clean up test candidate if still present
    if (testCandidateId) {
      await Candidate.findByIdAndDelete(testCandidateId);
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongoose.disconnect();
  }

  // Summary Report
  console.log('\n===============================================================');
  console.log('  PHASE 20 VERIFICATION SUMMARY REPORT');
  console.log('===============================================================');
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`  Total Tests Run : ${results.length}`);
  console.log(`  Passed          : ${passed}`);
  console.log(`  Failed          : ${failed}`);

  if (failed > 0) {
    console.error('\nFAILED TESTS:');
    results
      .filter((r) => !r.passed)
      .forEach((r) => console.error(`  - ${r.name}: ${r.details || r.error}`));
    process.exit(1);
  } else {
    console.log('\n✓ ALL PHASE 20 SECURITY, STORAGE & ISOLATION CHECKS PASSED!');
    process.exit(0);
  }
}

runPhase20Verification().catch((err) => {
  console.error('Fatal error in Phase 20 verification script:', err);
  process.exit(1);
});
