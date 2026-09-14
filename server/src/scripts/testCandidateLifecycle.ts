import '../config/serialization';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/db';
import { Candidate } from '../models/Candidate';
import { Position } from '../models/Position';
import { Election } from '../models/Election';
import { Voter } from '../models/Voter';
import { Ballot } from '../models/Ballot';
import { Admin } from '../models/Admin';
import { ELECTION_STATUS, CANDIDATE_STATUS, ROLES } from '../config/constants';

async function runTests() {
  console.log('--- Starting Candidate Lifecycle & Ballot Secrecy Verification ---');
  await connectDatabase();

  let failed = false;
  function assert(condition: boolean, message: string) {
    if (!condition) {
      console.error(`❌ FAIL: ${message}`);
      failed = true;
    } else {
      console.log(`✅ PASS: ${message}`);
    }
  }

  try {
    // 1. Setup test admin, election, and position
    let admin = await Admin.findOne({ role: ROLES.SUPER_ADMIN });
    if (!admin) {
      admin = await Admin.create({
        username: 'test_admin_' + Date.now(),
        fullName: 'Test Super Admin',
        password: 'Password123!',
        role: ROLES.SUPER_ADMIN,
        isActive: true,
      });
    }

    const testElection = await Election.create({
      title: 'Test AMR Election ' + Date.now(),
      slug: 'test-amr-election-' + Date.now(),
      description: 'Test AMR General Election',
      startDateTime: new Date(Date.now() - 3600000),
      endDateTime: new Date(Date.now() + 3600000),
      status: ELECTION_STATUS.ACTIVE,
      liveResultsEnabled: true,
      finalResultsPublished: false,
      registrationEnabled: true,
      votingEnabled: true,
      requireCandidateApproval: true,
      instructions: 'Test instructions',
      eligibleDepartments: [],
      createdBy: admin.id,
    });

    const testPosition = await Position.create({
      electionId: testElection.id,
      title: 'President',
      displayOrder: 1,
      maxCandidates: 5,
      maxVotesPerVoter: 1,
      isActive: true,
    });

    // 2. Verify Candidate Creation without registrationNumber
    console.log('\n[Test 1] Candidate Creation with AMR Fields (no registrationNumber)');
    const candidateData = {
      electionId: testElection.id,
      positionId: testPosition.id,
      fullName: 'Abubakar Test Candidate',
      faculty: 'Faculty of Clinical Sciences',
      department: 'Medicine & Surgery',
      level: '400',
      campaignSlogan: 'Stewardship and Integrity',
      manifesto: 'Promoting antimicrobial awareness across BUK.',
      status: CANDIDATE_STATUS.APPROVED,
      displayOrder: 0,
    };

    const created = await Candidate.create(candidateData);
    assert(!!created._id, 'Candidate created in database');
    assert(created.fullName === 'Abubakar Test Candidate', 'Candidate fullName matches');
    assert(created.faculty === 'Faculty of Clinical Sciences', 'Candidate faculty matches');
    assert(created.department === 'Medicine & Surgery', 'Candidate department matches');
    assert(created.level === '400', 'Candidate level matches');
    assert(!('registrationNumber' in created.toObject()), 'Candidate object has no registrationNumber property');

    // 3. Verify Candidate Uniqueness: (electionId, positionId, fullName)
    console.log('\n[Test 2] Candidate Uniqueness Constraint');
    let duplicateRejected = false;
    try {
      await Candidate.create({
        electionId: testElection.id,
        positionId: testPosition.id,
        fullName: 'Abubakar Test Candidate',
        faculty: 'Faculty of Allied Health',
        department: 'Medical Laboratory Science',
        level: '300',
      });
    } catch (err: any) {
      if (err.code === 11000 || (err.message && err.message.includes('E11000'))) {
        duplicateRejected = true;
      }
    }
    assert(duplicateRejected, 'Duplicate candidate (same electionId, positionId, fullName) rejected by unique index');

    // 4. Verify Candidate can exist with same name in a different position
    const secondPosition = await Position.create({
      electionId: testElection.id,
      title: 'Secretary-General',
      displayOrder: 2,
      maxCandidates: 5,
      maxVotesPerVoter: 1,
      isActive: true,
    });
    const candidateDiffPos = await Candidate.create({
      electionId: testElection.id,
      positionId: secondPosition.id,
      fullName: 'Abubakar Test Candidate',
      faculty: 'Faculty of Clinical Sciences',
    });
    assert(!!candidateDiffPos._id, 'Candidate with same name allowed in different position');

    // 5. Verify Candidate Update
    console.log('\n[Test 3] Candidate Update (faculty, manifesto, imageUrl)');
    created.faculty = 'Faculty of Basic Medical Sciences';
    created.manifesto = 'Updated AMR manifesto for clinical awareness';
    created.imageUrl = '/uploads/candidates/test-photo.webp';
    await created.save();

    const updated = await Candidate.findById(created._id);
    assert(updated?.faculty === 'Faculty of Basic Medical Sciences', 'Candidate faculty updated successfully');
    assert(updated?.manifesto === 'Updated AMR manifesto for clinical awareness', 'Candidate manifesto updated successfully');
    assert(updated?.imageUrl === '/uploads/candidates/test-photo.webp', 'Candidate imageUrl updated successfully');

    // 6. Verify Mongoose Serialization & Populated positionId Resolution
    console.log('\n[Test 4] Populated positionId serialization & helper resolution');
    const populated = await Candidate.findById(created._id).populate('positionId', 'title');
    const serializedJson = populated?.toJSON() as any;

    // Helper logic from client/src/lib/utils.ts
    const positionIdHelper = (pid: any): string => {
      if (!pid) return '';
      if (typeof pid === 'string') return pid;
      return pid.id || pid._id || '';
    };

    assert(serializedJson.id === created.id, 'Serialized candidate has .id');
    assert(typeof serializedJson.positionId === 'object', 'Populated positionId is object in JSON');
    assert(serializedJson.positionId.id === testPosition.id, 'Populated positionId has string id');
    assert(serializedJson.positionId.title === 'President', 'Populated position title matches');
    assert(positionIdHelper(serializedJson.positionId) === testPosition.id, 'positionId() helper extracts string ID from populated object');

    // 7. Verify Database Indexes on Candidates
    console.log('\n[Test 5] Candidate Indexes Inspection');
    const indexes = await Candidate.collection.indexes();
    const hasOldIndex = indexes.some((idx) => idx.name?.includes('registrationNumber'));
    const hasNewIndex = indexes.some((idx) => idx.name?.includes('fullName') && idx.unique);
    assert(!hasOldIndex, 'Old registrationNumber index is NOT present in MongoDB');
    assert(hasNewIndex, 'Compound unique index on electionId, positionId, fullName IS present');

    // 8. Verify Ballot Secrecy Architecture
    console.log('\n[Test 6] Ballot Secrecy Verification');
    const voterPaths = Object.keys(Voter.schema.paths);
    const ballotPaths = Object.keys(Ballot.schema.paths);

    const ballotHasVoterRef = ballotPaths.some((p) =>
      p.toLowerCase().includes('voter') ||
      p.toLowerCase().includes('student') ||
      p.toLowerCase().includes('user') ||
      p.toLowerCase().includes('email')
    );
    assert(!ballotHasVoterRef, 'Ballot schema contains zero references to voter, student, user, or email');

    const voterHasVoteChoices = voterPaths.some((p) =>
      p.toLowerCase().includes('candidate') ||
      p.toLowerCase().includes('choice') ||
      p.toLowerCase().includes('selection')
    );
    assert(!voterHasVoteChoices, 'Voter schema contains zero references to candidate choices or votes');

    // Clean up test election, positions, candidates
    await Candidate.deleteMany({ electionId: testElection.id });
    await Position.deleteMany({ electionId: testElection.id });
    await Election.deleteOne({ _id: testElection.id });

    console.log('\n-------------------------------------------------------------');
    if (failed) {
      console.error('❌ Candidate Lifecycle Tests FAILED');
      process.exit(1);
    } else {
      console.log('🎉 ALL Candidate Lifecycle & Ballot Secrecy Tests PASSED!');
    }
  } catch (error) {
    console.error('Test execution error:', error);
    process.exit(1);
  } finally {
    await disconnectDatabase();
  }
}

runTests();
