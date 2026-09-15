import http from 'node:http';
import mongoose, { Types } from 'mongoose';
import { createApp } from '../app';
import { connectDatabase, disconnectDatabase } from '../config/db';
import { Election } from '../models/Election';
import { Position } from '../models/Position';
import { Candidate } from '../models/Candidate';
import { Student } from '../models/Student';
import { VoteReceipt } from '../models/VoteReceipt';
import { Ballot } from '../models/Ballot';
import { signToken } from '../utils/jwt';
import { CANDIDATE_STATUS } from '../config/constants';

interface LatencyStats {
  count: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  rps: number;
  durationMs: number;
}

function calculateStats(latencies: number[], totalDurationMs: number): LatencyStats {
  if (!latencies.length) {
    return { count: 0, min: 0, max: 0, avg: 0, p50: 0, p90: 0, p95: 0, p99: 0, rps: 0, durationMs: totalDurationMs };
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const getP = (p: number) => sorted[Math.min(Math.floor((sorted.length * p) / 100), sorted.length - 1)];

  return {
    count: sorted.length,
    min: Math.round(sorted[0]),
    max: Math.round(sorted[sorted.length - 1]),
    avg: Math.round(sum / sorted.length),
    p50: Math.round(getP(50)),
    p90: Math.round(getP(90)),
    p95: Math.round(getP(95)),
    p99: Math.round(getP(99)),
    rps: Number(((sorted.length / (totalDurationMs / 1000))).toFixed(1)),
    durationMs: Math.round(totalDurationMs),
  };
}

function printStatsTable(title: string, stats: LatencyStats, successRate: string) {
  console.log(`\n  --- ${title} ---`);
  console.log(`  Requests:     ${stats.count} concurrent`);
  console.log(`  Success Rate: ${successRate}`);
  console.log(`  Throughput:   ${stats.rps} req/sec (Total: ${stats.durationMs}ms)`);
  console.log(`  Latency:      Min: ${stats.min}ms | Avg: ${stats.avg}ms | Max: ${stats.max}ms`);
  console.log(`  Percentiles:  p50: ${stats.p50}ms | p90: ${stats.p90}ms | p95: ${stats.p95}ms | p99: ${stats.p99}ms`);
}

async function runStressTest() {
  console.log('===============================================================');
  console.log('  AMR-BUK E-Voting: 300 Concurrent Users Stress Test Suite');
  console.log('===============================================================');

  const PORT = 5059;
  let server: http.Server | null = null;
  let benchmarkElectionId: Types.ObjectId | null = null;
  let testElectionSlug = `amr-stress-${Date.now()}`;
  const baseUrl = `http://127.0.0.1:${PORT}/api`;

  try {
    await connectDatabase();
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(PORT, '127.0.0.1', () => {
        console.log(`[STRESS] Ephemeral server listening at ${baseUrl}`);
        resolve();
      });
    });

    // -------------------------------------------------------------
    // Setup Isolated Benchmark Election with 12 Positions & 24 Candidates
    // -------------------------------------------------------------
    console.log('\n[SETUP] Creating isolated benchmark election & candidate tree...');
    const benchmarkElection = await Election.create({
      title: `AMR Stress Test Election 300 (${Date.now()})`,
      slug: testElectionSlug,
      description: 'Isolated test harness for 300 concurrent user benchmark',
      startDateTime: new Date(Date.now() - 3600_000),
      endDateTime: new Date(Date.now() + 86400_000),
      status: 'active',
      votingEnabled: true,
      registrationEnabled: true,
      liveResultsEnabled: true,
      finalResultsPublished: false,
      requireCandidateApproval: true,
      eligibleDepartments: [],
      createdBy: new Types.ObjectId(),
    });
    benchmarkElectionId = benchmarkElection._id;

    const positionTitles = [
      'President',
      'Vice President',
      'Secretary General',
      'Assistant Secretary General',
      'Treasurer',
      'Financial Secretary',
      'Director of Socials',
      'Director of Sports',
      'Public Relations Officer',
      'Welfare Director',
      'Legal Adviser',
      'Auditor General',
    ];

    const positions = await Position.insertMany(
      positionTitles.map((title, order) => ({
        electionId: benchmarkElection._id,
        title,
        order,
        maxVotesPerVoter: 1,
        isActive: true,
      })),
    );

    const candidateDocs: any[] = [];
    for (const pos of positions) {
      candidateDocs.push(
        {
          electionId: benchmarkElection._id,
          positionId: pos._id,
          fullName: `Candidate A for ${pos.title}`,
          status: CANDIDATE_STATUS.APPROVED,
        },
        {
          electionId: benchmarkElection._id,
          positionId: pos._id,
          fullName: `Candidate B for ${pos.title}`,
          status: CANDIDATE_STATUS.APPROVED,
        },
      );
    }
    const candidates = await Candidate.insertMany(candidateDocs);

    // Group candidates by position
    const candidatesByPos = new Map<string, Types.ObjectId[]>();
    for (const c of candidates) {
      const pid = c.positionId.toString();
      if (!candidatesByPos.has(pid)) candidatesByPos.set(pid, []);
      candidatesByPos.get(pid)!.push(c._id);
    }

    // -------------------------------------------------------------
    // Seed 300 Distinct Test Voters
    // -------------------------------------------------------------
    console.log('[SETUP] Seeding 300 distinct benchmark voters...');
    const voterSeedData: any[] = [];
    for (let i = 1; i <= 300; i++) {
      voterSeedData.push({
        fullName: `Stress Test Voter ${i.toString().padStart(3, '0')}`,
        email: `stresstest_300_voter_${i}_${Date.now()}@gmail.com`,
        serialNumber: `ST-${i}`,
        electionId: benchmarkElection._id,
        status: 'VERIFIED',
        isEligible: true,
        isVerified: true,
        hasRegistered: true,
        programme: 'Software Engineering',
        faculty: 'Faculty of Computing',
      });
    }
    const seededVoters = await Student.insertMany(voterSeedData);
    console.log(`[SETUP] Seeded ${seededVoters.length} test voters with verified status.`);

    // Pre-generate JWT tokens for all 300 voters
    const voterTokens = seededVoters.map((v) => ({
      voter: v,
      token: signToken({ sub: v._id.toString(), principal: 'student' }),
    }));

    // Pre-build a valid ballot selection across all 12 positions
    const buildBallotSelections = (voterIdx: number) => {
      return positions.map((pos) => {
        const pCandidates = candidatesByPos.get(pos._id.toString())!;
        // Alternate candidate choices between voters to test diverse ballot writes
        const chosenCandidate = pCandidates[voterIdx % pCandidates.length];
        return {
          positionId: pos._id.toString(),
          candidateIds: [chosenCandidate.toString()],
        };
      });
    };

    // =============================================================
    // STAGE 1: 300 Concurrent Voter Roster & Hint Lookups
    // =============================================================
    console.log('\n=============================================================');
    console.log('>>> STAGE 1: 300 Concurrent Voter Roster & Hint Lookups <<<');
    console.log('=============================================================');

    const stage1Start = performance.now();
    const stage1Latencies: number[] = [];
    let stage1Success = 0;

    const lookupPromises = seededVoters.map(async (v) => {
      const t0 = performance.now();
      try {
        const res = await fetch(`${baseUrl}/auth/voter/lookup-hint`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: v.fullName.split(' ')[0] }), // Search by "Stress"
        });
        const elapsed = performance.now() - t0;
        stage1Latencies.push(elapsed);
        if (res.status === 200) {
          const body = (await res.json()) as any;
          if (body.success && Array.isArray(body.data?.matches)) {
            // Verify PII email masking
            const allMasked = body.data.matches.every((item: any) => item.maskedEmail.includes('*'));
            if (allMasked) stage1Success++;
          }
        }
      } catch (err: any) {
        stage1Latencies.push(performance.now() - t0);
      }
    });

    await Promise.all(lookupPromises);
    const stage1Duration = performance.now() - stage1Start;
    const stage1Stats = calculateStats(stage1Latencies, stage1Duration);
    printStatsTable(
      'Stage 1: 300 Concurrent Roster Lookups',
      stage1Stats,
      `${stage1Success} / 300 (${((stage1Success / 300) * 100).toFixed(1)}%)`,
    );

    if (stage1Success !== 300) {
      throw new Error(`Stage 1 failed: Expected 300 successful lookups, got ${stage1Success}`);
    }
    console.log('  ✓ PASS: All 300 concurrent lookups completed with masked PII');

    // =============================================================
    // STAGE 2: 300 Concurrent Public Reads (Election & Positions)
    // =============================================================
    console.log('\n=============================================================');
    console.log('>>> STAGE 2: 300 Concurrent Public Reads (Election & Positions) <<<');
    console.log('=============================================================');

    const stage2Start = performance.now();
    const stage2Latencies: number[] = [];
    let stage2Success = 0;

    const readPromises = Array.from({ length: 300 }).map(async () => {
      const t0 = performance.now();
      try {
        const res = await fetch(`${baseUrl}/elections/${testElectionSlug}`);
        const elapsed = performance.now() - t0;
        stage2Latencies.push(elapsed);
        if (res.status === 200) {
          const body = (await res.json()) as any;
          if (body.success && (body.data?.election?.title || body.data?.title)) stage2Success++;
        }
      } catch {
        stage2Latencies.push(performance.now() - t0);
      }
    });

    await Promise.all(readPromises);
    const stage2Duration = performance.now() - stage2Start;
    const stage2Stats = calculateStats(stage2Latencies, stage2Duration);
    printStatsTable(
      'Stage 2: 300 Concurrent Public Reads',
      stage2Stats,
      `${stage2Success} / 300 (${((stage2Success / 300) * 100).toFixed(1)}%)`,
    );

    if (stage2Success !== 300) {
      throw new Error(`Stage 2 failed: Expected 300 successful reads, got ${stage2Success}`);
    }
    console.log('  ✓ PASS: All 300 concurrent reads succeeded');

    // =============================================================
    // STAGE 3: 300 Concurrent Ballot Casts (Peak Voting Rush)
    // =============================================================
    console.log('\n=============================================================');
    console.log('>>> STAGE 3: 300 Concurrent Ballot Casts (Simultaneous Rush) <<<');
    console.log('=============================================================');

    const stage3Start = performance.now();
    const stage3Latencies: number[] = [];
    let stage3Success = 0;
    const receiptsIssued: string[] = [];

    const votePromises = voterTokens.map(async ({ token }, idx) => {
      const selections = buildBallotSelections(idx);
      const t0 = performance.now();
      try {
        const res = await fetch(`${baseUrl}/elections/${testElectionSlug}/vote`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'X-Forwarded-For': `192.168.1.${(idx % 250) + 1}`,
          },
          body: JSON.stringify({ selections }),
        });
        const elapsed = performance.now() - t0;
        stage3Latencies.push(elapsed);
        if (res.status === 200 || res.status === 201) {
          const body = (await res.json()) as any;
          if (body.success && body.data?.receiptCode) {
            stage3Success++;
            receiptsIssued.push(body.data.receiptCode);
          }
        } else {
          const errBody = await res.text();
          console.error(`  [!] Vote failed (${res.status}): ${errBody.slice(0, 100)}`);
        }
      } catch (err: any) {
        stage3Latencies.push(performance.now() - t0);
        console.error(`  [!] Vote fetch error:`, err.message);
      }
    });

    await Promise.all(votePromises);
    const stage3Duration = performance.now() - stage3Start;
    const stage3Stats = calculateStats(stage3Latencies, stage3Duration);
    printStatsTable(
      'Stage 3: 300 Concurrent Ballot Casts',
      stage3Stats,
      `${stage3Success} / 300 (${((stage3Success / 300) * 100).toFixed(1)}%)`,
    );

    // Verify Invariants in Database
    console.log('\n[INVARIANTS] Verifying database integrity after 300 concurrent votes...');
    const receiptCount = await VoteReceipt.countDocuments({ electionId: benchmarkElection._id });
    const ballotCount = await Ballot.countDocuments({ electionId: benchmarkElection._id });
    const uniqueReceiptCodes = new Set(receiptsIssued);

    console.log(`  - VoteReceipts in DB:     ${receiptCount} (Expected: 300)`);
    console.log(`  - Unique Receipt Codes:   ${uniqueReceiptCodes.size} (Expected: 300)`);
    console.log(`  - Anonymous Ballots in DB:${ballotCount} (Expected: 3600 = 300 * 12)`);

    if (receiptCount !== 300) throw new Error(`Invariant failed: Expected 300 VoteReceipts, got ${receiptCount}`);
    if (uniqueReceiptCodes.size !== 300) throw new Error(`Invariant failed: Receipts not unique`);
    if (ballotCount !== 3600) throw new Error(`Invariant failed: Expected 3600 Ballots, got ${ballotCount}`);

    // Ballot secrecy verification under load
    const sampleBallot = await Ballot.findOne({ electionId: benchmarkElection._id });
    const ballotObj = sampleBallot?.toObject() as any;
    if (ballotObj.studentId || ballotObj.voterId || ballotObj.receiptCode || ballotObj.createdAt) {
      throw new Error('Ballot Secrecy Invariant Violated: Identifier detected in anonymous ballot!');
    }
    console.log('  ✓ PASS: Ballot secrecy strictly preserved under 300 concurrency');
    console.log('  ✓ PASS: Exactly 3,600 anonymous ballots recorded atomically');

    // =============================================================
    // STAGE 4: 300-Concurrency Race-Condition Double-Voting Attack
    // =============================================================
    console.log('\n=============================================================');
    console.log('>>> STAGE 4: 300-Concurrency Race-Condition Double-Vote Attack <<<');
    console.log('=============================================================');

    const attacker = voterTokens[0];
    const initialBallots = await Ballot.countDocuments({ electionId: benchmarkElection._id });
    const stage4Start = performance.now();
    const stage4Latencies: number[] = [];
    let duplicateRejected = 0;
    let idempotentReturned = 0;
    let doubleVotedCount = 0;

    const attackPromises = Array.from({ length: 300 }).map(async (_, attackIdx) => {
      const selections = buildBallotSelections(attackIdx + 1);
      const t0 = performance.now();
      try {
        const res = await fetch(`${baseUrl}/elections/${testElectionSlug}/vote`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${attacker.token}`,
          },
          body: JSON.stringify({ selections }),
        });
        const elapsed = performance.now() - t0;
        stage4Latencies.push(elapsed);
        const body = ((await res.json().catch(() => ({}))) as any);
        if (res.status === 200 && body.data?.alreadyVoted) {
          idempotentReturned++;
        } else if (res.status === 409) {
          duplicateRejected++;
        } else if (res.status === 200 && !body.data?.alreadyVoted) {
          doubleVotedCount++;
        }
      } catch {
        stage4Latencies.push(performance.now() - t0);
      }
    });

    await Promise.all(attackPromises);
    const stage4Duration = performance.now() - stage4Start;
    const finalBallots = await Ballot.countDocuments({ electionId: benchmarkElection._id });

    console.log(`  - Repeat Requests:        300 concurrent attempts`);
    console.log(`  - Idempotent Receipts:    ${idempotentReturned}`);
    console.log(`  - 409 Conflicts Rejected: ${duplicateRejected}`);
    console.log(`  - Fraudulent Double Votes:${doubleVotedCount} (Expected: 0)`);
    console.log(`  - DB Ballot Count Delta:  +${finalBallots - initialBallots} (Expected: 0)`);

    if (doubleVotedCount > 0 || finalBallots !== initialBallots) {
      throw new Error(`CRITICAL RACE CONDITION: Double vote succeeded under concurrency!`);
    }
    console.log('  ✓ PASS: Zero double-votes allowed across 300 simultaneous attempts');

    // =============================================================
    // STAGE 5: Campus Wi-Fi / Shared NAT Concurrency Simulation
    // =============================================================
    console.log('\n=============================================================');
    console.log('>>> STAGE 5: Campus Wi-Fi / Shared NAT Simulation <<<');
    console.log('=============================================================');

    // Seed 20 fresh voters all sharing the exact same public university IP
    const campusIp = '198.51.100.1'; // BUK campus proxy IP
    const campusVoterSeed: any[] = [];
    for (let i = 1; i <= 20; i++) {
      campusVoterSeed.push({
        fullName: `Campus NAT Voter ${i}`,
        email: `stresstest_300_campus_${i}_${Date.now()}@gmail.com`,
        serialNumber: `CN-${i}`,
        electionId: benchmarkElection._id,
        status: 'VERIFIED',
        isEligible: true,
        isVerified: true,
        hasRegistered: true,
      });
    }
    const campusVoters = await Student.insertMany(campusVoterSeed);
    let campusSuccess = 0;

    const campusPromises = campusVoters.map(async (v, idx) => {
      const token = signToken({ sub: v._id.toString(), principal: 'student' });
      const selections = buildBallotSelections(idx);
      const res = await fetch(`${baseUrl}/elections/${testElectionSlug}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Forwarded-For': campusIp, // Same IP for all 20 students
        },
        body: JSON.stringify({ selections }),
      });
      if (res.status === 200 || res.status === 201) {
        campusSuccess++;
      }
    });

    await Promise.all(campusPromises);
    console.log(`  - Campus Voters Tested:   20 concurrent`);
    console.log(`  - Shared Campus IP:       ${campusIp}`);
    console.log(`  - Successful Submissions: ${campusSuccess} / 20`);

    if (campusSuccess !== 20) {
      throw new Error(`Campus NAT rate limit failure: Expected 20 votes, got ${campusSuccess}`);
    }
    console.log('  ✓ PASS: Campus Wi-Fi users successfully voted without IP rate-limit choke');

    console.log('\n===============================================================');
    console.log('  CONCURRENCY STRESS TEST SUMMARY: ALL STAGES PASSED (100%)');
    console.log('===============================================================');

  } finally {
    // -------------------------------------------------------------
    // Guaranteed Teardown of Benchmark Artifacts
    // -------------------------------------------------------------
    console.log('\n[TEARDOWN] Cleaning up stress test benchmark artifacts...');
    if (benchmarkElectionId) {
      await Ballot.deleteMany({ electionId: benchmarkElectionId });
      await VoteReceipt.deleteMany({ electionId: benchmarkElectionId });
      await Candidate.deleteMany({ electionId: benchmarkElectionId });
      await Position.deleteMany({ electionId: benchmarkElectionId });
      await Election.deleteOne({ _id: benchmarkElectionId });
    }
    await Student.deleteMany({ email: /^stresstest_300_/ });

    if (server) {
      await new Promise<void>((resolve) => (server as http.Server).close(() => resolve()));
    }
    await disconnectDatabase();
    console.log('[TEARDOWN] Cleanup complete. Production roster preserved intact.');
  }
}

runStressTest().catch((err) => {
  console.error('\n[FATAL] Stress test failed:', err);
  process.exit(1);
});
